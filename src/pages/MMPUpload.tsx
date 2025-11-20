import { MMPFile } from '@/types/mmp';
import React, { useState, useEffect, useRef } from "react";
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
import { ArrowUpCircle, CheckCircle, Info, Upload, HelpCircle, AlertTriangle, 
         Eye, Save, X, RefreshCw, FileCheck, MessageSquare, ArrowRight, ListChecks, Download } from "lucide-react";
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
import { hubs } from "@/data/sudanStates";
import { downloadMMPTemplate } from '@/utils/templateDownload';
import { toast } from "@/components/ui/use-toast";
import { generateSiteCode, validateSiteCode } from '@/utils/mmpIdGenerator';
import { useAuthorization } from '@/hooks/use-authorization';
import { useProjectContext } from '@/context/project/ProjectContext';
import MMPFileManagement from '@/components/mmp/MMPFileManagement';
import { useMMP } from '@/context/mmp/MMPContext';

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
  hub: z.string({
    required_error: "Hub selection is required",
  }),
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

  
  const onSubmit = async (data: UploadFormValues) => {
    // Skip validation step - go straight to upload with progress feedback
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
      console.log('Starting MMP upload process...');
      const result: {
        success: boolean;
        id?: string;
        mmp?: MMPFile;
        error?: string;
        validationReport?: string;
        validationErrors?: import("@/utils/csvValidator").CSVValidationError[];
        validationWarnings?: import("@/utils/csvValidator").CSVValidationError[];
      } = await uploadMMP(data.file, {
        name: data.name,
        hub: data.hub,
        month: data.month,
        projectId: data.project
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
    if (uploadedMmpId) {
      navigate(`/mmp-verification?mmpId=${uploadedMmpId}`);
    } else {
      navigate("/mmp");
    }
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


  const handleDownloadTemplate = () => {
    const success = downloadMMPTemplate();
    
    if (success) {
      toast({
        title: "Template Downloaded",
        description: "MMP template has been successfully downloaded.",
        variant: "default"
      });
    } else {
      toast({
        title: "Download Failed",
        description: "There was an issue downloading the MMP template.",
        variant: "destructive"
      });
    }
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
          <CardFooter className="flex gap-3 justify-end">
            <Button variant="outline" onClick={handleReturnToMmpList}>
              Return to MMP List
            </Button>
            <Button 
              onClick={handleViewMmp} 
              className="bg-blue-600 hover:bg-blue-700 shadow-lg"
            >
              <Eye className="mr-2 h-4 w-4" />
              View MMP Details
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardFooter>
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
                              <SelectItem value="" disabled>Loading projects...</SelectItem>
                            ) : projects.length === 0 ? (
                              <SelectItem value="" disabled>No projects available</SelectItem>
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
                            <SelectItem value="1">January</SelectItem>
                            <SelectItem value="2">February</SelectItem>
                            <SelectItem value="3">March</SelectItem>
                            <SelectItem value="4">April</SelectItem>
                            <SelectItem value="5">May</SelectItem>
                            <SelectItem value="6">June</SelectItem>
                            <SelectItem value="7">July</SelectItem>
                            <SelectItem value="8">August</SelectItem>
                            <SelectItem value="9">September</SelectItem>
                            <SelectItem value="10">October</SelectItem>
                            <SelectItem value="11">November</SelectItem>
                            <SelectItem value="12">December</SelectItem>
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
                
                <div>
                  <h3 className="text-sm font-medium mb-3">Data Fields to Include</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="includeDistributionByCP"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Distribution by CP</FormLabel>
                            <FormDescription>Check if distribution is by CP</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="includeVisitStatus"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Site Visit Status</FormLabel>
                            <FormDescription>Visited/Not Visited</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="includeSubmissionStatus"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Submitted to MoDa</FormLabel>
                            <FormDescription>Submission status in MoDa</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="includeQuestions"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Total of Questionnaires Submitted</FormLabel>
                            <FormDescription>Number of questionnaires submitted</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="includeFindings"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Findings/Issues</FormLabel>
                            <FormDescription>Details of identified findings</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="includeFlagged"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Flagged Issues</FormLabel>
                            <FormDescription>Critical issues to highlight</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="includeComments"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Additional Comments</FormLabel>
                            <FormDescription>Other observations or notes</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded p-3 flex items-start gap-2">
                  <HelpCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Template Help</p>
                    <p className="mt-1">
                      Need a template to get started? Download our standard MMP template with field headers already set up.
                    </p>
                    <Button 
                      variant="link" 
                      className="h-auto p-0 text-amber-600 font-medium" 
                      onClick={handleDownloadTemplate}
                    >
                      <FileCheck className="h-4 w-4 mr-1" />
                      Download Template
                    </Button>
                  </div>
                </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <div className="flex gap-2">
                  <Button asChild variant="outline">
                    <Link to="/mmp">Cancel</Link>
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
                      Cancel Upload
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
                          Upload MMP
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
