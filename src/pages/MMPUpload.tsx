import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
         Eye, Save, X, RefreshCw, FileCheck, MessageSquare, ArrowRight, ListChecks } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { hubs } from "@/data/sudanStates";
import { downloadMMPTemplate } from '@/utils/templateDownload';
import { downloadMMP } from '@/utils/mmpExport';
import { toast } from "@/components/ui/use-toast";
import { validateCSV, validateHubMatch, type CSVValidationError, createValidationSummary } from '@/utils/csvValidator';
import { generateSiteCode, validateSiteCode } from '@/utils/mmpIdGenerator';

const uploadSchema = z.object({
  name: z.string({
    required_error: "MMP name is required",
  }).min(3, {
    message: "MMP name must be at least 3 characters.",
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
  const [isUploading, setIsUploading] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<'idle' | 'successful' | 'warnings' | 'errors'>('idle');
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadedMmpId, setUploadedMmpId] = useState<string | null>(null);
  const [selectedHub, setSelectedHub] = useState<string>('');
  
  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      includeDistributionByCP: true,
      includeVisitStatus: true,
      includeSubmissionStatus: true,
      includeQuestions: true,
      includeFindings: true,
      includeFlagged: true,
      includeComments: true,
    },
  });
  
  const resetValidation = () => {
    setValidationResults('idle');
    setValidationErrors([]);
    setValidationWarnings([]);
    setValidationProgress(0);
    setIsValidating(false);
    setShowPreview(false);
    setPreviewData([]);
  };

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

  const validateFile = async (file: File) => {
    setIsValidating(true);
    setValidationProgress(0);
    
    try {
      const progressInterval = setInterval(() => {
        setValidationProgress(prev => Math.min(prev + 10, 90));
      }, 200);
      
      const result = await validateCSV(file);
      
      clearInterval(progressInterval);
      setValidationProgress(100);
      
      setValidationErrors(result.errors.map(e => 
        e.row ? `${e.message} (Row ${e.row})` : e.message
      ));
      setValidationWarnings(result.warnings.map(w => 
        w.row ? `${w.message} (Row ${w.row})` : w.message
      ));
      
      if (selectedHub && result.hubOffices.length > 0) {
        const hubErrors = validateHubMatch(result.hubOffices, selectedHub, hubs);
        if (hubErrors.length > 0) {
          setValidationErrors(prev => [
            ...prev,
            ...hubErrors.map(e => e.message)
          ]);
        }
      }
      
      const summaryText = createValidationSummary(result);
      
      if (result.errors.length > 0) {
        setValidationResults('errors');
        toast({
          title: "Validation Failed",
          description: (
            <div className="space-y-2">
              <p>There are critical issues that need to be addressed before upload.</p>
              <div className="text-sm bg-red-100/30 p-2 rounded border border-red-200/30">
                <p className="font-medium mb-1">Summary:</p>
                <div className="whitespace-pre-line">{summaryText}</div>
              </div>
              <p className="text-xs mt-2">Check the "Validation Results" tab for details.</p>
            </div>
          ),
          variant: "destructive",
          action: (
            <Button 
              variant="outline" 
              onClick={() => {
                document.querySelector('[value="validation"]')?.dispatchEvent(
                  new MouseEvent('click', { bubbles: true })
                );
              }}
              className="bg-red-800/30 hover:bg-red-800/50 border-red-900/50 text-white"
            >
              <ListChecks className="mr-2 h-4 w-4" />
              View Details
            </Button>
          )
        });
      } else if (result.warnings.length > 0) {
        setValidationResults('warnings');
        toast({
          title: "Validation Completed with Warnings",
          description: (
            <div className="space-y-2">
              <p>Your file can be uploaded but has issues you may want to address:</p>
              <div className="text-sm bg-amber-100/30 p-2 rounded border border-amber-200/30">
                <p className="font-medium mb-1">Summary:</p>
                <div className="whitespace-pre-line">{summaryText}</div>
              </div>
              <p className="text-xs mt-2">Check the "Validation Results" tab for details.</p>
            </div>
          ),
          variant: "warning",
          action: (
            <Button 
              variant="outline" 
              onClick={() => {
                document.querySelector('[value="validation"]')?.dispatchEvent(
                  new MouseEvent('click', { bubbles: true })
                );
              }}
              className="bg-amber-800/30 hover:bg-amber-800/50 border-amber-900/50 text-white"
            >
              <ListChecks className="mr-2 h-4 w-4" />
              View Details
            </Button>
          )
        });
      } else {
        setValidationResults('successful');
        toast({
          title: "Validation Successful",
          description: "The MMP file is ready to be uploaded. All validation checks passed.",
          variant: "default"
        });
      }
      
      setPreviewData(result.data.map((row, index) => {
        const hubId = selectedHub || 'XX';
        const stateId = row['State']?.toLowerCase().replace(/\s+/g, '-') || 'XX';
        
        const siteCode = row['Site Code'] || generateSiteCode(hubId, index + 1);
        
        return {
          id: `preview-${index + 1}`,
          ...row,
          siteCode: siteCode,
          hubOffice: row['Hub Office'] || '',
          state: row['State'] || '',
          locality: row['Locality'] || '',
          siteName: row['Site Name'] || '',
          cpName: row['CP Name'] || '',
          inModa: true,
          visitType: row['Visit Type'] || '',
          visitedBy: row['Visit Type'] || '',
          mainActivity: row['Main Activity'] || '',
          activityAtSite: row['Activity at Site'] || '',
          visitDate: row['Visit Date'] || '',
          originalDate: row['OriginalDate'] || '',
          comments: row['Comments'] || '',
          errors: result.errors.filter(e => e.row === index + 2),
          warnings: result.warnings.filter(w => w.row === index + 2),
        };
      }));
    } catch (error) {
      console.error('Validation error:', error);
      setValidationResults('errors');
      setValidationErrors([`Failed to validate file: ${error instanceof Error ? error.message : 'Unknown error'}`]);
      toast({
        title: "Validation Error",
        description: "Failed to validate the file. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };
  
  const onSubmit = async (data: UploadFormValues) => {
    if (validationResults === 'idle') {
      validateFile(data.file);
      return;
    }
    
    if (validationResults === 'errors') {
      toast({
        title: "Cannot Upload File",
        description: "Please fix the validation errors before uploading.",
        variant: "destructive"
      });
      return;
    }
    
    if (validationResults === 'warnings' && !uploadDialogOpen) {
      setUploadDialogOpen(true);
      return;
    }
    
    setIsUploading(true);
    try {
      const success = await uploadMMP(data.file);
      if (success) {
        const mockMmpId = `mmp-${Date.now().toString(36)}`;
        setUploadedMmpId(mockMmpId);
        setUploadSuccess(true);
        
        toast({
          title: "MMP file uploaded successfully",
          description: "Your file has been uploaded and is now ready for review.",
        });
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "There was a problem uploading your file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadDialogOpen(false);
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
    navigate("/mmp");
  };

  const handleDownload = () => {
    const success = downloadMMP(previewData, {
      includeDistributionByCP: form.getValues('includeDistributionByCP'),
      includeVisitStatus: form.getValues('includeVisitStatus'),
      includeSubmissionStatus: form.getValues('includeSubmissionStatus'),
      includeQuestions: form.getValues('includeQuestions'),
      includeFindings: form.getValues('includeFindings'),
      includeFlagged: form.getValues('includeFlagged'),
      includeComments: form.getValues('includeComments')
    }, form.getValues('name'));

    if (success) {
      toast({
        title: "MMP File Downloaded",
        description: "Your MMP file has been downloaded successfully.",
      });
    } else {
      toast({
        title: "Download Failed",
        description: "There was an error downloading the MMP file.",
        variant: "destructive"
      });
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

  const renderValidationSummaryCards = () => {
    if (validationResults === 'idle') return null;
    
    const errorCategories: Record<string, number> = {};
    const warningCategories: Record<string, number> = {};
    
    validationErrors.forEach(error => {
      const match = error.match(/\(Row \d+\)/);
      const message = match ? error.replace(match[0], '').trim() : error;
      
      if (message.includes('Missing required headers')) {
        errorCategories['Missing Headers'] = (errorCategories['Missing Headers'] || 0) + 1;
      } else if (message.includes('Visit Date must be')) {
        errorCategories['Date Format'] = (errorCategories['Date Format'] || 0) + 1;
      } else if (message.includes('Site Code')) {
        errorCategories['Site Code'] = (errorCategories['Site Code'] || 0) + 1;
      } else if (message.includes('Hub Office')) {
        errorCategories['Hub Mismatch'] = (errorCategories['Hub Mismatch'] || 0) + 1;
      } else {
        errorCategories['Other'] = (errorCategories['Other'] || 0) + 1;
      }
    });
    
    validationWarnings.forEach(warning => {
      const match = warning.match(/\(Row \d+\)/);
      const message = match ? warning.replace(match[0], '').trim() : warning;
      
      if (message.includes('visit date')) {
        warningCategories['Missing Date'] = (warningCategories['Missing Date'] || 0) + 1;
      } else if (message.includes('activity')) {
        warningCategories['Activity Info'] = (warningCategories['Activity Info'] || 0) + 1;
      } else if (message.includes('Missing')) {
        warningCategories['Missing Fields'] = (warningCategories['Missing Fields'] || 0) + 1;
      } else {
        warningCategories['Other'] = (warningCategories['Other'] || 0) + 1;
      }
    });
    
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {Object.entries(errorCategories).map(([category, count]) => (
          <Card key={`error-${category}`} className="border-red-200 bg-red-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-red-800">{category}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-700">{count}</div>
              <p className="text-xs text-red-600">Critical Error{count !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>
        ))}
        
        {Object.entries(warningCategories).map(([category, count]) => (
          <Card key={`warning-${category}`} className="border-amber-200 bg-amber-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-amber-800">{category}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-700">{count}</div>
              <p className="text-xs text-amber-600">Warning{count !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderAlertDialog = () => (
    <AlertDialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
      <AlertDialogContent className="max-h-[85vh] overflow-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Proceed with Warnings?</AlertDialogTitle>
          <AlertDialogDescription>
            This file has validation warnings. You can either proceed with the upload or go back to fix the issues.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-3">
            <h4 className="text-sm font-medium text-amber-800 mb-2 flex items-center">
              <AlertTriangle className="h-4 w-4 mr-1" /> Warning Summary
            </h4>
            {validationWarnings.length > 0 && (
              <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-2">
                {validationWarnings.length <= 10 ? (
                  <ul className="text-sm list-disc list-inside text-amber-700">
                    {validationWarnings.map((warning, index) => (
                      <li key={`warning-confirm-${index}`}>{warning}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-amber-700">
                    <p className="font-medium">{validationWarnings.length} warnings detected</p>
                    <p className="mt-2">Including:</p>
                    <ul className="list-disc list-inside mt-1">
                      {validationWarnings.slice(0, 5).map((warning, index) => (
                        <li key={`warning-sample-${index}`}>{warning}</li>
                      ))}
                      <li className="font-medium">And {validationWarnings.length - 5} more...</li>
                    </ul>
                    <p className="mt-3 text-xs">
                      You can view all warnings in the Validation Results tab.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel onClick={() => setUploadDialogOpen(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={() => form.handleSubmit(onSubmit)()}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            Upload Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload MMP</h1>
        <p className="text-muted-foreground">
          Upload a new Monthly Monitoring Plan with detailed site information
        </p>
      </div>

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
                    name="hub"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hub</FormLabel>
                        <Select 
                          onValueChange={(value) => {
                            field.onChange(value);
                            setSelectedHub(value);
                          }} 
                          defaultValue={field.value}
                        >
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
                  />

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

                <Tabs defaultValue="upload" className="w-full">
                  <TabsList>
                    <TabsTrigger value="upload">Upload File</TabsTrigger>
                    <TabsTrigger 
                      value="preview" 
                      disabled={previewData.length === 0}
                      onClick={() => setShowPreview(true)}
                    >
                      Data Preview
                    </TabsTrigger>
                    <TabsTrigger 
                      value="validation" 
                      disabled={validationResults === 'idle'}
                    >
                      Validation Results
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="upload" className="pt-4 space-y-6">
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
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    onChange(file);
                                    resetValidation();
                                  }
                                }}
                              />
                              
                              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:bg-muted/50 transition-colors cursor-pointer">
                                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground">
                                  Drag and drop your Excel or CSV file here, or click above to browse
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
                                  resetValidation();
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
                    
                    {(isValidating || validationProgress > 0) && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span>{isValidating ? "Validating file..." : "Validation complete"}</span>
                          <span>{validationProgress}%</span>
                        </div>
                        <Progress value={validationProgress} className="h-2" />
                      </div>
                    )}
                    
                    {validationResults !== 'idle' && (
                      <div className={`p-4 border rounded-md ${
                        validationResults === 'successful' ? 'bg-green-50 border-green-200' : 
                        validationResults === 'warnings' ? 'bg-amber-50 border-amber-200' : 
                        'bg-red-50 border-red-200'
                      }`}>
                        <div className="flex gap-3">
                          {validationResults === 'successful' ? (
                            <CheckCircle className="h-5 w-5 text-green-500 mt-1 flex-shrink-0" />
                          ) : validationResults === 'warnings' ? (
                            <AlertTriangle className="h-5 w-5 text-amber-500 mt-1 flex-shrink-0" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-red-500 mt-1 flex-shrink-0" />
                          )}
                          <div>
                            <p className="font-medium">
                              {validationResults === 'successful' ? 'Validation Successful' : 
                               validationResults === 'warnings' ? 'Validation Completed with Warnings' : 
                               'Validation Failed'}
                            </p>
                            <p className="text-sm mt-1">
                              {validationResults === 'successful' ? 'Your file passed all validation checks and is ready to be uploaded.' : 
                               validationResults === 'warnings' ? 'Your file can be uploaded but has some issues you may want to address.' : 
                               'There are critical issues that need to be fixed before uploading.'}
                            </p>
                            
                            {validationErrors.length > 0 && (
                              <div className="mt-2">
                                <p className="text-sm font-medium text-red-700">Errors:</p>
                                <ul className="text-sm list-disc list-inside text-red-700">
                                  {validationErrors.map((error, index) => (
                                    <li key={`error-${index}`}>{error}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {validationWarnings.length > 0 && (
                              <div className="mt-2">
                                <p className="text-sm font-medium text-amber-700">Warnings:</p>
                                <ul className="text-sm list-disc list-inside text-amber-700">
                                  {validationWarnings.map((warning, index) => (
                                    <li key={`warning-${index}`}>{warning}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            <div className="mt-3">
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm" 
                                onClick={resetValidation}
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Reset Validation
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
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
                  </TabsContent>
                  
                  <TabsContent value="preview" className="pt-4">
                    {showPreview && previewData.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-medium">Data Preview</h3>
                          <p className="text-sm text-muted-foreground">Showing {Math.min(previewData.length, 5)} of {previewData.length} entries</p>
                        </div>
                        <div className="rounded-md border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Site Code</TableHead>
                                <TableHead>Hub Office</TableHead>
                                <TableHead>State</TableHead>
                                <TableHead>Locality</TableHead>
                                <TableHead>Site Name</TableHead>
                                <TableHead>CP Name</TableHead>
                                <TableHead>Visit Type</TableHead>
                                <TableHead>Main Activity</TableHead>
                                <TableHead>Activity at Site</TableHead>
                                <TableHead>Visit Date</TableHead>
                                <TableHead>Comments</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewData.slice(0, 5).map((site) => (
                                <TableRow key={site.id} className={
                                  site.errors?.length > 0 ? 'bg-red-50' : 
                                  site.warnings?.length > 0 ? 'bg-amber-50' : ''
                                }>
                                  <TableCell>{site.siteCode}</TableCell>
                                  <TableCell>{site['Hub Office']}</TableCell>
                                  <TableCell>{site['State']}</TableCell>
                                  <TableCell>{site['Locality']}</TableCell>
                                  <TableCell>{site['Site Name']}</TableCell>
                                  <TableCell>{site['CP Name']}</TableCell>
                                  <TableCell>{site['Visit Type']}</TableCell>
                                  <TableCell>{site['Main Activity']}</TableCell>
                                  <TableCell>{site['Activity at Site']}</TableCell>
                                  <TableCell>{site.visitDate}</TableCell>
                                  <TableCell>{site['Comments']}</TableCell>
                                  <TableCell>
                                    {site.errors?.length > 0 ? (
                                      <Badge className="bg-red-100 text-red-800">Error</Badge>
                                    ) : site.warnings?.length > 0 ? (
                                      <Badge className="bg-amber-100 text-amber-800">Warning</Badge>
                                    ) : (
                                      <Badge className="bg-green-100 text-green-800">Valid</Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        
                        <div className="text-sm text-muted-foreground">
                          <p>
                            This is a preview of the data that will be imported. 
                            {validationWarnings.length > 0 || validationErrors.length > 0 
                              ? " Some records have validation issues that need attention." 
                              : " All records appear to be valid."}
                          </p>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="validation" className="pt-4">
                    {validationResults !== 'idle' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-medium">Validation Results</h3>
                          <Button variant="outline" size="sm" onClick={resetValidation}>
                            Re-run Validation
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base">Success Rate</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {validationResults === 'successful' ? '100%' : 
                                 validationResults === 'warnings' ? `${Math.max(70, 100 - (validationWarnings.length * 2))}%` : 
                                 `${Math.max(0, 100 - (validationErrors.length * 10))}%`}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Percentage of valid records
                              </p>
                            </CardContent>
                          </Card>
                          
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base">Errors Found</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold text-red-600">
                                {validationErrors.length}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Critical issues needing fixes
                              </p>
                            </CardContent>
                          </Card>
                          
                          <Card>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base">Warnings</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold text-amber-600">
                                {validationWarnings.length}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Non-critical issues found
                              </p>
                            </CardContent>
                          </Card>
                        </div>
                        
                        {validationErrors.length > 0 && (
                          <Card className="border-red-200">
                            <CardHeader className="pb-2 bg-red-50">
                              <CardTitle className="text-base text-red-800">Critical Issues</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="max-h-[300px] overflow-y-auto pr-2">
                                <ul className="space-y-2">
                                  {validationErrors.map((error, index) => (
                                    <li key={`error-detail-${index}`} className="flex items-start gap-2">
                                      <AlertTriangle className="h-4 w-4 text-red-500 mt-1 flex-shrink-0" />
                                      <span>{error}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                        
                        {validationWarnings.length > 0 && (
                          <Card className="border-amber-200">
                            <CardHeader className="pb-2 bg-amber-50">
                              <CardTitle className="text-base text-amber-800">Warnings</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="max-h-[300px] overflow-y-auto pr-2">
                                <ul className="space-y-2">
                                  {validationWarnings.map((warning, index) => (
                                    <li key={`warning-detail-${index}`} className="flex items-start gap-2">
                                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-1 flex-shrink-0" />
                                      <span>{warning}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                        
                        {renderValidationSummaryCards()}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
                
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
                
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-md">
                  <div className="flex items-start gap-2">
                    <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div className="text-blue-800 text-sm">
                      <p className="font-medium">Site Code Format</p>
                      <p className="mt-1">
                        Site codes follow the format: [Hub 2 chars][State 2 chars][Date 6 chars]-[4 digits]
                      </p>
                      <p className="mt-1">
                        Example: <code className="bg-blue-100 px-1 rounded">KOKH230524-0001</code> for Khartoum Hub, Khartoum State, May 24, 2023
                      </p>
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
                
                <Button 
                  type="submit"
                  disabled={!form.formState.isValid || isUploading}
                >
                  {isUploading ? (
                    <>
                      <ArrowUpCircle className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : validationResults === 'idle' ? (
                    <>
                      <FileCheck className="mr-2 h-4 w-4" />
                      Validate File
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload MMP
                    </>
                  )}
                </Button>
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
      
      {renderAlertDialog()}
    </div>
  );
};

export default MMPUpload;
