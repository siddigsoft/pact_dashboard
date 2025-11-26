import { MMPFile } from '@/types/mmp';
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useAppContext } from "@/context/AppContext";
import { useBudget } from "@/context/budget/BudgetContext";
import { CreateMMPBudgetDialog } from "@/components/budget/CreateMMPBudgetDialog";
import { ArrowUpCircle, CheckCircle, Info, Upload, AlertTriangle, 
         Eye, Save, X, RefreshCw, MessageSquare, ArrowRight, ListChecks, Download, Pencil, Check, DollarSign } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { useAuthorization } from '@/hooks/use-authorization';
import { useProjectContext } from '@/context/project/ProjectContext';
import MMPFileManagement from '@/components/mmp/MMPFileManagement';
import { useMMP } from '@/context/mmp/MMPContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { validateCSV, CSVValidationError } from "@/utils/csvValidator";
import { validateSiteCode } from "@/utils/mmpIdGenerator";
import { format, parse, isValid } from "date-fns";

const uploadSchema = z.object({
  name: z.string({
    required_error: "MMP name is required",
  }).min(3, {
    message: "MMP name must be at least 3 characters.",
  }),
  project: z.string({
    required_error: "Project selection is required",
  }),
  month: z.string({
    required_error: "Month selection is required",
  }),
  hub: z.string().optional(),
  file: z.instanceof(File, {
    message: "Please select a file",
  }),
  includeDistributionByCP: z.boolean().default(true),
  includeVisitStatus: z.boolean().default(true),
  includeSubmissionStatus: z.boolean().default(true),
  includeQuestions: z.boolean().default(true),
  includeFindings: z.boolean().default(true),
  includeFlagged: z.boolean().default(true),
  includeComments: z.boolean().default(true),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

const MMPUpload = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { uploadMMP, currentUser } = useAppContext();
  const { checkPermission, hasAnyRole } = useAuthorization();
  const { projects, loading: projectsLoading } = useProjectContext();
  const { projectBudgets } = useBudget();
  const [isUploading, setIsUploading] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadedMmpId, setUploadedMmpId] = useState<string | null>(null);
  const [uploadTimeout, setUploadTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<string>('');
  const [validationReportUrl, setValidationReportUrl] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<any[] | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<any[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = hasAnyRole(['admin']);
  const canCreate = (checkPermission('mmp', 'create') || isAdmin) && hasAnyRole(['admin', 'ict']);
  const { getMMPById, archiveMMP, approveMMP, deleteMMP, resetMMP } = useMMP();

  const [isParsing, setIsParsing] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, string>[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewErrors, setPreviewErrors] = useState<CSVValidationError[]>([]);
  const [previewWarnings, setPreviewWarnings] = useState<CSVValidationError[]>([]);
  const [isEditingEntries, setIsEditingEntries] = useState(false);
  const [editingRows, setEditingRows] = useState<Set<number>>(new Set());
  const [rowBackups, setRowBackups] = useState<Record<number, Record<string, string>>>({});
  const IMPORTANT_COLS = [
    'Hub Office','State','Locality','Site Name','Site Code','CP Name','Activity at Site','Activity Details','Monitoring By','Survey Tool',
    'Use Market Diversion Monitoring','Use Warehouse Monitoring','Visit Date','Comments'
  ];
  const buildHeaders = (rows: Record<string, string>[]) => {
    const set = new Set<string>();
    rows.forEach(r => Object.keys(r).forEach(k => { if (k !== 'OriginalDate') set.add(k); }));
    const rest = Array.from(set).filter(h => !IMPORTANT_COLS.includes(h));
    return IMPORTANT_COLS.filter(h => set.has(h)).concat(rest);
  };

  const rowNumberOf = (idx: number) => idx + 2;

  const normalizeColumnLabelForHeader = (col?: string, row?: Record<string, string>): string | null => {
    if (!col || !row) return null;
    if (col in row) return col;
    if (col === 'Site ID' && 'Site Code' in row) return 'Site Code';
    if (col === 'Visit by' && 'Monitoring By' in row) return 'Monitoring By';
    if (col === 'Tool to be used') {
      if ('Survey Tool' in row) return 'Survey Tool';
      if ('Survey under Master tool' in row) return 'Survey under Master tool';
    }
    return null;
  };

  const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const requiredFieldSynonyms: Record<string, string[]> = {
    hubOffice: ['huboffice','hub','office','hubofficename','hub office'],
    state: ['state','statename','region','stateprovince'],
    locality: ['locality','localityname','district','county','lga'],
    siteName: ['sitename','site','facilityname','distributionpoint','site name'],
    siteCode: ['sitecode','siteid','code','site code','site id'],
    cpName: ['cpname','cp','partner','partnername','implementingpartner','ipname','cp name'],
    siteActivity: ['activityatsite','siteactivity','activitysite','activityatthesite','activity at site'],
    mainActivity: ['mainactivity','activity','activitydetails','activity details'],
    monitoringBy: ['monitoringby','monitoringby:','monitoring by','monitoredby','visitby','visit by'],
    surveyTool: ['surveytool','surveyundermastertool','survey under master tool','tooltobeused','tool','survey tool']
  };

  const getValFromSynonyms = (row: Record<string, string>, key: keyof typeof requiredFieldSynonyms): string => {
    const nrec: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => { nrec[norm(k)] = String(v ?? ''); });
    for (const syn of requiredFieldSynonyms[key]) {
      const v = nrec[syn];
      if (v && v.trim() !== '') return v;
    }
    return '';
  };

  const validateRowLocal = (
    row: Record<string, string>,
    rowNumber: number
  ): { errors: CSVValidationError[]; warnings: CSVValidationError[] } => {
    const errors: CSVValidationError[] = [];
    const warnings: CSVValidationError[] = [];

    const nrec: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => { nrec[norm(k)] = String(v ?? ''); });

    const requiredChecks: Array<{label: string; key: keyof typeof requiredFieldSynonyms}> = [
      { label: 'Hub Office', key: 'hubOffice' },
      { label: 'State', key: 'state' },
      { label: 'Locality', key: 'locality' },
      { label: 'Site Name', key: 'siteName' },
      { label: 'Site ID', key: 'siteCode' },
      { label: 'CP Name', key: 'cpName' },
      { label: 'Activity at Site', key: 'siteActivity' },
      { label: 'Activity Details', key: 'mainActivity' },
      { label: 'Visit by', key: 'monitoringBy' },
      { label: 'Tool to be used', key: 'surveyTool' },
    ];

    requiredChecks.forEach(chk => {
      const v = getValFromSynonyms(row, chk.key);
      if (!v) {
        errors.push({
          type: 'error',
          message: `Missing ${chk.label}`,
          row: rowNumber,
          column: chk.label,
          category: 'missing_field'
        });
      }
    });

    // Visit Date handling
    if (row['Visit Date'] === undefined || String(row['Visit Date']).trim() === '') {
      const today = new Date();
      row['OriginalDate'] = format(today, 'yyyy-MM-dd');
      row['Visit Date'] = format(today, 'dd-MM-yyyy');
      warnings.push({
        type: 'warning',
        message: "No visit date provided, using today's date",
        row: rowNumber,
        column: 'Visit Date',
        category: 'missing_date'
      });
    } else {
      let parsed: Date | null = parse(String(row['Visit Date']), 'dd-MM-yyyy', new Date());
      if (!isValid(parsed)) parsed = parse(String(row['Visit Date']), 'yyyy-MM-dd', new Date());
      if (!isValid(parsed)) {
        const today = new Date();
        row['OriginalDate'] = format(today, 'yyyy-MM-dd');
        row['Visit Date'] = format(today, 'dd-MM-yyyy');
        warnings.push({
          type: 'warning',
          message: 'Invalid Visit Date format, using today\'s date',
          row: rowNumber,
          column: 'Visit Date',
          category: 'invalid_date_format'
        });
      } else {
        row['OriginalDate'] = format(parsed, 'yyyy-MM-dd');
        row['Visit Date'] = format(parsed, 'dd-MM-yyyy');
      }
    }

    // Site Code format check
    if (row['Site Code']) {
      const sc = String(row['Site Code']);
      if (!validateSiteCode(sc)) {
        warnings.push({
          type: 'warning',
          message: 'Site Code must follow format [Hub 2 chars][State 2 chars][Date 6 chars]-[4 digits] (e.g., KOKH230524-0001)',
          row: rowNumber,
          column: 'Site Code',
          category: 'invalid_site_code'
        });
      }
    }

    // Boolean fields check
    const boolVals = ['yes','no','true','false','1','0',''];
    if (row['Use Market Diversion Monitoring'] !== undefined) {
      const v = String(row['Use Market Diversion Monitoring']).toLowerCase().trim();
      if (!boolVals.includes(v)) {
        warnings.push({
          type: 'warning',
          message: 'Use Market Diversion Monitoring should be Yes/No',
          row: rowNumber,
          column: 'Use Market Diversion Monitoring',
          category: 'invalid_boolean'
        });
      }
    }
    if (row['Use Warehouse Monitoring'] !== undefined) {
      const v = String(row['Use Warehouse Monitoring']).toLowerCase().trim();
      if (!boolVals.includes(v)) {
        warnings.push({
          type: 'warning',
          message: 'Use Warehouse Monitoring should be Yes/No',
          row: rowNumber,
          column: 'Use Warehouse Monitoring',
          category: 'invalid_boolean'
        });
      }
    }

    return { errors, warnings };
  };

  const recomputeDuplicateErrors = (rows: Record<string, string>[]): CSVValidationError[] => {
    const seenKeys = new Map<string, number>();
    const errors: CSVValidationError[] = [];

    const getVal = (row: Record<string, string>, key: keyof typeof requiredFieldSynonyms): string => {
      const nrec: Record<string, string> = {};
      Object.entries(row).forEach(([k, v]) => { nrec[norm(k)] = String(v ?? ''); });
      for (const syn of requiredFieldSynonyms[key]) {
        const v = nrec[syn];
        if (v && v.trim() !== '') return v;
      }
      return '';
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = rowNumberOf(i);
      const sc = getVal(row, 'siteCode');
      const siteKey = sc || [getVal(row, 'hubOffice'), getVal(row, 'state'), getVal(row, 'locality'), getVal(row, 'siteName'), getVal(row, 'cpName')]
        .map(v => v.trim().toLowerCase())
        .join('|');
      if (siteKey.trim() === '') continue;
      if (seenKeys.has(siteKey)) {
        const firstRow = seenKeys.get(siteKey)!;
        errors.push({
          type: 'error',
          message: `Duplicate site found (matches row ${firstRow})`,
          row: rowNumber,
          column: sc ? 'Site ID' : 'Composite Site Fields',
          category: 'duplicate_site'
        });
      } else {
        seenKeys.set(siteKey, rowNumber);
      }
    }
    return errors;
  };

  const handleCellChange = (rIdx: number, header: string, value: string) => {
    setPreviewData(prev => {
      const next = [...prev];
      const row = { ...(next[rIdx] || {}) } as Record<string, string>;
      row[header] = value;
      next[rIdx] = row;
      return next;
    });
  };

  const handleRowEdit = (rIdx: number) => {
    setRowBackups(prev => ({ ...prev, [rIdx]: { ...(previewData[rIdx] || {}) } }));
    setEditingRows(prev => {
      const ns = new Set(prev);
      ns.add(rIdx);
      return ns;
    });
  };

  const handleRowCancel = (rIdx: number) => {
    const backup = rowBackups[rIdx];
    if (!backup) {
      setEditingRows(prev => { const ns = new Set(prev); ns.delete(rIdx); return ns; });
      return;
    }
    setPreviewData(prev => {
      const next = [...prev];
      next[rIdx] = { ...backup };
      const rowNumber = rowNumberOf(rIdx);
      const { errors: rowErrors, warnings: rowWarnings } = validateRowLocal(next[rIdx], rowNumber);
      setPreviewErrors(prevErrs => {
        const filtered = prevErrs.filter(e => e.row !== rowNumber && e.category !== 'duplicate_site');
        const dupErrors = recomputeDuplicateErrors(next);
        return [...filtered, ...rowErrors, ...dupErrors];
      });
      setPreviewWarnings(prevWarns => {
        const filtered = prevWarns.filter(w => w.row !== rowNumber);
        return [...filtered, ...rowWarnings];
      });
      return next;
    });
    setEditingRows(prev => { const ns = new Set(prev); ns.delete(rIdx); return ns; });
    setRowBackups(prev => { const { [rIdx]: _, ...rest } = prev; return rest; });
  };

  const handleRowSave = (rIdx: number) => {
    handleCellBlur(rIdx);
    setEditingRows(prev => { const ns = new Set(prev); ns.delete(rIdx); return ns; });
    setRowBackups(prev => { const { [rIdx]: _, ...rest } = prev; return rest; });
  };

  const handleCellBlur = (rIdx: number) => {
    setPreviewData(prev => {
      const next = [...prev];
      const row = next[rIdx];
      const rowNumber = rowNumberOf(rIdx);
      const { errors: rowErrors, warnings: rowWarnings } = validateRowLocal(row, rowNumber);

      setPreviewErrors(prevErrs => {
        const filtered = prevErrs.filter(e => e.row !== rowNumber && e.category !== 'duplicate_site');
        const dupErrors = recomputeDuplicateErrors(next);
        return [...filtered, ...rowErrors, ...dupErrors];
      });

      setPreviewWarnings(prevWarns => {
        const filtered = prevWarns.filter(w => w.row !== rowNumber);
        return [...filtered, ...rowWarnings];
      });

      return next;
    });
  };

  const cellIssueMaps = useMemo(() => {
    const errorSet = new Set<string>();
    const warningSet = new Set<string>();

    previewErrors.forEach(e => {
      if (!e.row || !e.column) return;
      const rIdx = e.row - 2;
      const row = previewData[rIdx];
      const mapped = normalizeColumnLabelForHeader(e.column, row);
      if (mapped) errorSet.add(`${rIdx}:${mapped}`);
    });
    previewWarnings.forEach(w => {
      if (!w.row || !w.column) return;
      const rIdx = w.row - 2;
      const row = previewData[rIdx];
      const mapped = normalizeColumnLabelForHeader(w.column, row);
      if (mapped) warningSet.add(`${rIdx}:${mapped}`);
    });

    return { errorSet, warningSet };
  }, [previewErrors, previewWarnings, previewData]);

  if (!canCreate) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to upload MMP files.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/mmp')} className="w-full">
              Back to MMP
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      name: "",
      project: "",
      month: "",
      hub: "",
      includeDistributionByCP: true,
      includeVisitStatus: true,
      includeSubmissionStatus: true,
      includeQuestions: true,
      includeFindings: true,
      includeFlagged: true,
      includeComments: true,
    },
  });
  const today = new Date();
  const currentMonthNumber = today.getMonth() + 1; // 1-12
  

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'text/csv' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        form.setValue('file', file);
        parseSelectedFile(file);
      } else {
        toast({
          title: "Invalid File Type",
          description: "Please select a CSV, XLSX, or XLS file.",
          variant: "destructive"
        });
      }
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const parseSelectedFile = async (file: File) => {
    setIsParsing(true);
    try {
      const result = await validateCSV(file);
      const rows = result.data as Record<string, string>[];
      setPreviewData(rows);
      setPreviewHeaders(buildHeaders(rows));
      setPreviewErrors(result.errors || []);
      setPreviewWarnings(result.warnings || []);
    } catch (err) {
      setPreviewData([]);
      setPreviewHeaders([]);
      setPreviewErrors([]);
      setPreviewWarnings([]);
      toast({ title: 'Failed to parse file', description: 'Please check the file format and try again.', variant: 'destructive' });
    } finally {
      setIsParsing(false);
    }
  };

  const resetUploadState = () => {
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStage('');
    if (uploadTimeout) {
      clearTimeout(uploadTimeout);
      setUploadTimeout(null);
    }
  };

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (uploadTimeout) {
        clearTimeout(uploadTimeout);
      }
    };
  }, [uploadTimeout]);

  const handleSaveForLater = () => {
    setSaveDialogOpen(true);
  };
  
  const confirmSave = () => {
    toast({
      title: "Progress Saved",
      description: "Your MMP import has been saved for later editing.",
    });
    setSaveDialogOpen(false);
    navigate("/mmp");
  };

  
  const buildCsvFromPreview = (): File => {
    const headers = (previewHeaders.length > 0 ? previewHeaders : buildHeaders(previewData)).filter(h => h !== 'OriginalDate');
    const sanitize = (v: string) => String(v ?? '').replace(/\r?\n/g, ' ').replace(/,/g, ';');
    const headerLine = headers.join(',');
    const lines = previewData.map(row => headers.map(h => sanitize(row[h] as string)).join(','));
    const csv = [headerLine, ...lines].join('\r\n');
    const fileName = `${(form.getValues().name || 'edited_mmp').toString().trim() || 'edited_mmp'}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    return new File([blob], fileName, { type: 'text/csv' });
  };

  const onSubmit = async (data: UploadFormValues) => {
    setIsUploading(true);
    
    // Set up a timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.error('Upload timeout - taking too long');
      resetUploadState();
      toast({
        title: "Upload Timeout",
        description: "The upload is taking longer than expected. Please refresh the page and try again.",
        variant: "destructive",
      });
    }, 300000); // 5 minute timeout
    
    setUploadTimeout(timeout);
    
    try {
      const fileToUpload: File = previewData.length > 0 ? buildCsvFromPreview() : data.file;
      console.log('Starting MMP upload process...');
      const result: {
        success: boolean;
        id?: string;
        mmp?: MMPFile;
        error?: string;
        validationReport?: string;
        validationErrors?: import("@/utils/csvValidator").CSVValidationError[];
        validationWarnings?: import("@/utils/csvValidator").CSVValidationError[];
      } = await uploadMMP(fileToUpload, {
        name: data.name,
        month: data.month,
        projectId: data.project,
        ...(data.hub ? { hub: data.hub } : {})
      }, (progress) => {
        setUploadProgress(progress.current);
        setUploadStage(progress.stage);
      });
      
      // Clear timeout since upload completed
      if (uploadTimeout) {
        clearTimeout(uploadTimeout);
        setUploadTimeout(null);
      }
      
      console.log('Upload result:', result);
      
      if (result && result.success) {
        const mockMmpId = result.id || `mmp-${Date.now().toString(36)}`;
        setUploadedMmpId(mockMmpId);
        setUploadSuccess(true);
        
        toast({
          title: "MMP file uploaded successfully",
          description: "Your file has been uploaded and is now ready for review.",
        });
      } else {
        // Handle case where uploadMMP returns success: false
        const errorMessage = result?.error || 'Upload failed for unknown reason';
        console.error('Upload failed:', errorMessage);
        toast({
          title: "Upload failed",
          description: errorMessage,
          variant: "destructive",
        });

        // If we have a validation report, expose it for download with a panel
        if (result?.validationReport) {
          try {
            const blob = new Blob([result.validationReport], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            setValidationReportUrl(url);
            setValidationErrors(result.validationErrors || []);
            setValidationWarnings(result.validationWarnings || []);
          } catch {}
        }
      }
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: "Upload failed",
        description: `There was a problem uploading your file: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      // Always reset uploading state, regardless of success or failure
      resetUploadState();
    }
  };

  const handleViewMmp = () => {
    if (uploadedMmpId) {
      navigate(`/mmp/${uploadedMmpId}`);
    } else {
      navigate("/mmp");
    }
  };

  const handleReturnToMmpList = () => {
    // Always return to the MMP management page (same as Go to MMP List)
    navigate('/mmp');
  };

  const uploadedMmp = uploadedMmpId ? getMMPById(uploadedMmpId) : undefined;
  const canApproveAction = checkPermission('mmp', 'approve') || isAdmin;
  const canArchiveAction = checkPermission('mmp', 'archive') || isAdmin;
  const canDeleteAction = checkPermission('mmp', 'delete') || isAdmin;

  const handleApproveAction = async () => {
    if (uploadedMmpId && currentUser?.id) {
      await approveMMP(uploadedMmpId, currentUser.id);
    }
  };

  const handleArchiveAction = async () => {
    if (uploadedMmpId && currentUser?.id) {
      await archiveMMP(uploadedMmpId, currentUser.id);
    }
  };

  const handleDeleteAction = async () => {
    if (uploadedMmpId) {
      await deleteMMP(uploadedMmpId);
      navigate('/mmp');
    }
  };

  const handleResetApprovalAction = async () => {
    if (uploadedMmpId) {
      await resetMMP(uploadedMmpId);
    }
  };


  

  const handleClearForm = () => {
    // Reset form fields to defaults
    form.reset();
    // Clear any parsed preview state
    setPreviewData([]);
    setPreviewHeaders([]);
    setPreviewErrors([]);
    setPreviewWarnings([]);
    setIsParsing(false);
    // Clear validation report if present
    if (validationReportUrl) {
      try { URL.revokeObjectURL(validationReportUrl); } catch {}
      setValidationReportUrl(null);
    }
    setValidationErrors(null);
    setValidationWarnings(null);
    // Clear hidden file input value
    if (fileInputRef.current) {
      try { fileInputRef.current.value = ''; } catch {}
    }
    // Reset upload progress state
    setUploadProgress(0);
    setUploadStage('');
    setIsUploading(false);
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload MMP</h1>
        <p className="text-muted-foreground">
          Upload a new Monthly Monitoring Plan with detailed site information
        </p>
      </div>

      {validationReportUrl && (
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="space-y-2">
              <p className="font-medium text-red-700">Validation failed. Fix the errors and re-upload.</p>
              <div className="text-sm text-red-700">
                <p>{(validationErrors?.length || 0)} errors{(validationWarnings?.length || 0) ? `, ${validationWarnings?.length} warnings` : ''} detected.</p>
              </div>
              <div className="flex gap-2">
                <a href={validationReportUrl} download="mmp_validation_report.csv">
                  <Button size="sm" className="bg-red-600 hover:bg-red-700">
                    <Download className="mr-2 h-4 w-4" />
                    Download error report (CSV)
                  </Button>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (validationReportUrl) URL.revokeObjectURL(validationReportUrl);
                    setValidationReportUrl(null);
                    setValidationErrors(null);
                    setValidationWarnings(null);
                  }}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {uploadSuccess ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">Upload Successful</CardTitle>
            <CardDescription>
              Your Monthly Monitoring Plan has been successfully uploaded and is now ready for review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-md">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-6 w-6 text-green-500 mt-1" />
                <div>
                  <p className="font-medium">MMP Upload Complete</p>
                  <p className="text-sm mt-1">
                    Your file has been processed and is now available in the MMP management system.
                    You can view the details or return to the MMP list.
                  </p>
                </div>
              </div>
            </div>

            {uploadedMmpId && previewData.length > 0 && (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-md">
                <div className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-800">Optional: Allocate Budget</p>
                    <p className="text-sm text-blue-700 mt-1">
                      You can now allocate a budget for this MMP to track costs for {previewData.length} site visits.
                    </p>
                    <div className="mt-3">
                      <CreateMMPBudgetDialog
                        mmpFileId={uploadedMmpId}
                        mmpName={form.getValues().name || 'Uploaded MMP'}
                        projectId={form.getValues().project}
                        totalSites={previewData.length}
                        onSuccess={() => {
                          toast({
                            title: 'Budget Allocated',
                            description: 'Budget has been successfully allocated to this MMP',
                          });
                        }}
                        trigger={
                          <Button variant="outline" size="sm" data-testid="button-allocate-budget-mmp">
                            <DollarSign className="w-4 h-4 mr-2" />
                            Allocate Budget
                          </Button>
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="border rounded-md p-4 bg-slate-50">
              <h3 className="font-medium mb-2">What happens next?</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>Your MMP is now available for team members to view and review</li>
                <li>Site visits will be scheduled based on the information provided</li>
                <li>You can track progress and status updates in the MMP details view</li>
                <li>Reports and analytics will reflect the newly added sites</li>
              </ol>
            </div>

            {uploadedMmp && (
              <div className="mt-2">
                <MMPFileManagement
                  mmpFile={uploadedMmp}
                  canArchive={canArchiveAction}
                  canDelete={canDeleteAction}
                  canApprove={canApproveAction}
                  onArchive={handleArchiveAction}
                  onDelete={handleDeleteAction}
                  onResetApproval={handleResetApprovalAction}
                  onApprove={handleApproveAction}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>MMP File Upload</CardTitle>
                <CardDescription>
                  Enter MMP details and upload an Excel or CSV file containing site visit information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>MMP Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter MMP name" {...field} />
                        </FormControl>
                        <FormDescription>
                          Provide a descriptive name for this MMP
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="project"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {projectsLoading ? (
                              <SelectItem value="__LOADING__" disabled>Loading projects...</SelectItem>
                            ) : projects.length === 0 ? (
                              <SelectItem value="__NONE__" disabled>No projects available</SelectItem>
                            ) : (
                              projects.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                  {project.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select the project this MMP belongs to
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* <FormField
                    control={form.control}
                    name="hub"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hub</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a hub" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {hubs.map((hub) => (
                              <SelectItem key={hub.id} value={hub.id}>
                                {hub.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select the hub for this MMP
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  /> */}

                  <FormField
                    control={form.control}
                    name="month"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Month</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a month" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1" disabled={1 < currentMonthNumber} className={1 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>January</SelectItem>
                            <SelectItem value="2" disabled={2 < currentMonthNumber} className={2 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>February</SelectItem>
                            <SelectItem value="3" disabled={3 < currentMonthNumber} className={3 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>March</SelectItem>
                            <SelectItem value="4" disabled={4 < currentMonthNumber} className={4 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>April</SelectItem>
                            <SelectItem value="5" disabled={5 < currentMonthNumber} className={5 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>May</SelectItem>
                            <SelectItem value="6" disabled={6 < currentMonthNumber} className={6 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>June</SelectItem>
                            <SelectItem value="7" disabled={7 < currentMonthNumber} className={7 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>July</SelectItem>
                            <SelectItem value="8" disabled={8 < currentMonthNumber} className={8 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>August</SelectItem>
                            <SelectItem value="9" disabled={9 < currentMonthNumber} className={9 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>September</SelectItem>
                            <SelectItem value="10" disabled={10 < currentMonthNumber} className={10 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>October</SelectItem>
                            <SelectItem value="11" disabled={11 < currentMonthNumber} className={11 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>November</SelectItem>
                            <SelectItem value="12" disabled={12 < currentMonthNumber} className={12 < currentMonthNumber ? 'opacity-50 cursor-not-allowed' : ''}>December</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Select the month for this MMP
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="file"
                      render={({ field: { onChange, value, ...fieldProps }, fieldState }) => (
                        <FormItem>
                          <FormLabel>MMP File (Excel/CSV)</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Input
                                {...fieldProps}
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    onChange(file);
                                    parseSelectedFile(file);
                                  }
                                }}
                                style={{ display: 'none' }}
                              />

                              <div
                                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                                  isDragOver
                                    ? 'border-primary bg-primary/5'
                                    : 'border-muted-foreground/25 hover:bg-muted/50'
                                }`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={handleFileSelect}
                              >
                                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground">
                                  Drag and drop your Excel or CSV file here, or click to browse
                                </p>
                                <p className="text-xs text-muted-foreground mt-2">
                                  Supported formats: .xlsx, .xls, .csv
                                </p>
                              </div>
                            </div>
                          </FormControl>
                          {value && (
                            <div className="text-sm p-2 bg-green-50 border border-green-100 rounded flex items-center">
                              <CheckCircle className="h-4 w-4 text-green-500 mt-1" />
                              <span>
                                Ready to upload: <strong>{(value as File).name}</strong> ({((value as File).size / 1024).toFixed(2)} KB)
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="ml-auto h-6 w-6"
                                onClick={() => {
                                  onChange(undefined);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 text-sm">
                      <p className="font-medium text-blue-700 flex items-center gap-1">
                        <Info className="h-4 w-4" />
                        MMP File Requirements
                      </p>
                      <ul className="list-disc list-inside mt-2 text-blue-600 space-y-1 pl-5">
                        <li>Excel or CSV file (.xlsx, .xls, or .csv format)</li>
                        <li>Must include columns for Site Name, Location, Activities</li>
                        <li>Include dates for planned visits</li>
                        <li>For joint visits, specify participating organizations</li>
                        <li>Maximum file size: 10MB</li>
                      </ul>
                    </div>

                    {(isParsing || previewData.length > 0 || previewErrors.length > 0 || previewWarnings.length > 0) && (
                      <div className="space-y-4 mt-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium">Preview & Validation</h3>
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-muted-foreground">
                              {isParsing ? 'Parsing file…' : `${previewData.length} row(s)`}
                            </div>
                            {previewData.length > 0 && (
                              <Button
                                type="button"
                                variant={isEditingEntries ? 'secondary' : 'outline'}
                                size="sm"
                                onClick={() => setIsEditingEntries(v => !v)}
                              >
                                {isEditingEntries ? (
                                  <>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    Done
                                  </>
                                ) : (
                                  <>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Edit Entries
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                        {(previewErrors.length > 0 || previewWarnings.length > 0) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-red-50 border border-red-200 rounded p-3 text-red-800 text-sm">
                              <div className="font-medium">{previewErrors.length} error(s)</div>
                              <ul className="mt-1 list-disc list-inside space-y-1 max-h-40 overflow-auto">
                                {previewErrors.slice(0, 10).map((e, idx) => (
                                  <li key={`e-${idx}`}>{e.message}{e.row ? ` (Row ${e.row}${e.column ? `, ${e.column}` : ''})` : ''}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-amber-900 text-sm">
                              <div className="font-medium">{previewWarnings.length} warning(s)</div>
                              <ul className="mt-1 list-disc list-inside space-y-1 max-h-40 overflow-auto">
                                {previewWarnings.slice(0, 10).map((w, idx) => (
                                  <li key={`w-${idx}`}>{w.message}{w.row ? ` (Row ${w.row}${w.column ? `, ${w.column}` : ''})` : ''}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                        {previewData.length > 0 && (
                          <div className="rounded-md border w-full">
                            <Table wrapperClassName="max-h-[640px] overflow-auto" className="min-w-[1200px]">
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  {previewHeaders.map((h) => (
                                    <TableHead key={h} className="sticky top-0 bg-blue-50 z-10">{h}</TableHead>
                                  ))}
                                  <TableHead className="w-[160px] sticky top-0 bg-blue-50 z-10">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {previewData.map((row, rIdx) => (
                                  <TableRow key={rIdx} className="hover:bg-muted/30">
                                    {previewHeaders.map((h) => {
                                      const hasError = cellIssueMaps.errorSet.has(`${rIdx}:${h}`);
                                      const hasWarning = cellIssueMaps.warningSet.has(`${rIdx}:${h}`);
                                      const rowIsEditing = isEditingEntries || editingRows.has(rIdx);
                                      const viewBg = !rowIsEditing ? (hasError ? 'bg-red-50' : (hasWarning ? 'bg-amber-50' : '')) : '';
                                      return (
                                        <TableCell key={`${rIdx}-${h}`} className={`text-xs align-top ${viewBg}`}>
                                          {rowIsEditing ? (
                                            <Input
                                              value={(row[h] ?? '') as string}
                                              onChange={(e) => handleCellChange(rIdx, h, e.target.value)}
                                              onBlur={() => handleCellBlur(rIdx)}
                                              className={`h-7 px-2 py-1 text-xs ${hasError ? 'bg-red-50 border-red-300 focus-visible:ring-red-300' : hasWarning ? 'bg-amber-50 border-amber-300 focus-visible:ring-amber-300' : ''}`}
                                            />
                                          ) : (
                                            <div className="min-h-[28px] leading-6 px-1">
                                              {row[h] ?? ''}
                                            </div>
                                          )}
                                        </TableCell>
                                      );
                                    })}
                                    <TableCell className="text-xs align-top">
                                      {editingRows.has(rIdx) ? (
                                        <div className="flex gap-2">
                                          <Button size="sm" onClick={() => handleRowSave(rIdx)}>
                                            <Check className="h-4 w-4 mr-1" /> Save
                                          </Button>
                                          <Button size="sm" variant="outline" onClick={() => handleRowCancel(rIdx)}>
                                            <X className="h-4 w-4 mr-1" /> Cancel
                                          </Button>
                                        </div>
                                      ) : (
                                        <Button size="sm" variant="outline" onClick={() => handleRowEdit(rIdx)}>
                                          <Pencil className="h-4 w-4 mr-1" /> Edit
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                              </Table>
                            <div className="text-sm text-muted-foreground mt-2">Scroll down to view more ({previewData.length} total entries.)</div>
                          </div>
                        )}
                      </div>
                    )}
                
               

                
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleClearForm}>
                    Cancel
                  </Button>
                  
                  <Button 
                    type="button"
                    variant="outline"
                    onClick={handleSaveForLater}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Save for Later
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  {isUploading && (
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={resetUploadState}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel Validate
                    </Button>
                  )}
                  
                  <div className="space-y-2">
                    {isUploading && uploadProgress > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{uploadStage}</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <Progress value={uploadProgress} className="h-2" />
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={!form.formState.isValid || isUploading}
                      className="w-full"
                    >
                      {isUploading ? (
                        <>
                          <ArrowUpCircle className="mr-2 h-4 w-4 animate-spin" />
                          {uploadStage || 'Uploading...'}
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Validate MMP
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardFooter>
            </Card>
          </form>
        </Form>
      )}
      
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Progress for Later</DialogTitle>
            <DialogDescription>
              Your MMP file and settings will be saved as a draft. You can continue editing it later.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="draftName" className="mb-2 block">Draft Name (optional)</Label>
            <Input 
              id="draftName" 
              placeholder="My MMP Upload Draft"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmSave}>Save Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
    </div>
  );
};

export default MMPUpload;
