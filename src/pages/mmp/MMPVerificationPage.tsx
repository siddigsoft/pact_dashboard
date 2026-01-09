
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMMP } from '@/context/mmp/MMPContext';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  Upload, 
  FileCheck, 
  Building2, 
  MapPin, 
  Calendar, 
  Users, 
  CheckCircle2, 
  AlertTriangle,
  Eye,
  FileText,
  Shield,
  Clock,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';

const MMPVerificationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { attachPermitsToMMP, getMMPById, updateMMP, refreshMMPFiles } = useMMP();
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [latestDocs, setLatestDocs] = useState<any[]>([]);
  const [federalFile, setFederalFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const mmp = id ? getMMPById(id) : null;

  useEffect(() => {
    if (!mmp && id) {
      refreshMMPFiles();
    }
  }, [id]);

  // Check if permits already exist - support both legacy and new document structures
  const checkHasFederalPermit = () => {
    if (!mmp?.permits) return false;
    const permits = mmp.permits as any;
    // Check legacy structure
    if (permits.federal) return true;
    // Check new documents structure
    if (Array.isArray(permits.documents) && permits.documents.length > 0) {
      return permits.documents.some((doc: any) => 
        doc.type === 'federal' || doc.permitType === 'federal'
      );
    }
    return false;
  };
  const hasFederalPermit = checkHasFederalPermit();
  
  // Get existing documents for preview (merge legacy and new structures)
  const getExistingDocs = () => {
    if (!mmp?.permits) return [];
    const permits = mmp.permits as any;
    const docs: any[] = [];
    
    // Add legacy federal permit if exists
    if (permits.federal) {
      docs.push({
        type: 'federal',
        fileName: typeof permits.federal === 'string' ? permits.federal : 'Federal Permit',
        fileUrl: typeof permits.federal === 'string' ? permits.federal : undefined
      });
    }
    // Add documents from new structure
    if (Array.isArray(permits.documents)) {
      docs.push(...permits.documents);
    }
    return docs;
  };
  const existingPermits = getExistingDocs();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file: File) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF or image file (JPG, PNG)',
        variant: 'destructive'
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 10MB',
        variant: 'destructive'
      });
      return;
    }
    setFederalFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handlePermitSubmit = async () => {
    if (!id || !federalFile) return;
    
    setSubmitting(true);
    setUploadProgress(0);
    
    // Create progress interval outside try block so we can clear it in finally
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 10, 90));
    }, 200);
    
    try {
      await attachPermitsToMMP(id, { federal: federalFile });
      
      setUploadProgress(100);
      
      toast({ 
        title: 'Federal Permit Uploaded Successfully',
        description: 'The permit has been attached to the MMP.'
      });
      
      // Refresh MMP data and get updated documents (support both legacy and new structures)
      await refreshMMPFiles();
      const updated = getMMPById(id);
      const updatedDocs: any[] = [];
      if (updated?.permits) {
        const permits = updated.permits as any;
        if (permits.federal) {
          updatedDocs.push({
            type: 'federal',
            fileName: typeof permits.federal === 'string' ? permits.federal : federalFile.name,
            fileUrl: typeof permits.federal === 'string' ? permits.federal : undefined
          });
        }
        if (Array.isArray(permits.documents)) {
          updatedDocs.push(...permits.documents);
        }
      }
      // Fallback to the uploaded file info if no docs found
      if (updatedDocs.length === 0) {
        updatedDocs.push({
          type: 'federal',
          fileName: federalFile.name
        });
      }
      setLatestDocs(updatedDocs);
      setShowPreview(true);
    } catch (e) {
      toast({ 
        title: 'Upload Failed', 
        description: (e as Error).message, 
        variant: 'destructive' 
      });
    } finally {
      clearInterval(progressInterval);
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  const handleConfirmAndForward = async () => {
    if (!mmp || !id) return;
    
    setSubmitting(true);
    try {
      await updateMMP(id, { 
        permits: { ...mmp.permits, approved: true },
        workflow: {
          ...mmp.workflow,
          currentStage: 'verified',
          lastUpdated: new Date().toISOString()
        }
      });
      
      toast({
        title: 'Permit Verified',
        description: 'The MMP has been verified and is ready for the next step.'
      });
      
      navigate(`/mmp/${id}/view`);
    } catch (e) {
      toast({
        title: 'Verification Failed',
        description: (e as Error).message,
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoBack = () => {
    navigate('/mmp');
  };

  if (!mmp) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading MMP details...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const siteCount = mmp.siteEntries?.length || mmp.entries || 0;
  const monthNum = mmp.month ? parseInt(String(mmp.month), 10) : 0;
  const monthName = monthNum ? format(new Date(2024, monthNum - 1, 1), 'MMMM') : 'N/A';

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleGoBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              Federal Permit Verification
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload and verify the federal permit for this MMP
            </p>
          </div>
        </div>
        <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1.5">
          <Clock className="h-3.5 w-3.5" />
          Step 4 of 6
        </Badge>
      </div>

      {/* MMP Info Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {mmp.name || mmp.originalFilename || `MMP-${mmp.year}-${String(mmp.month).padStart(2, '0')}`}
              </CardTitle>
              <CardDescription className="mt-1">
                Monthly Monitoring Plan Details
              </CardDescription>
            </div>
            <Badge 
              variant={mmp.status === 'approved' ? 'default' : 'secondary'}
              className="capitalize"
            >
              {mmp.status || 'Pending Verification'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Period</p>
                <p className="font-medium text-sm">{monthName} {mmp.year}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <MapPin className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sites</p>
                <p className="font-medium text-sm">{siteCount} sites</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Building2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Project</p>
                <p className="font-medium text-sm truncate max-w-[120px]">{mmp.projectName || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <Users className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Hub</p>
                <p className="font-medium text-sm truncate max-w-[120px]">{mmp.hub || mmp.region || 'N/A'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Section or Preview */}
      {!showPreview ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Upload Federal Permit
            </CardTitle>
            <CardDescription>
              Upload the federal permit required for MMP verification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasFederalPermit && (
              <Alert className="border-green-200 bg-green-50 dark:bg-green-900/20">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-200">Federal Permit Already Uploaded</AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-300">
                  A federal permit is already attached to this MMP. You can upload a new one to replace it.
                </AlertDescription>
              </Alert>
            )}

            {/* Drag and Drop Zone */}
            <div
              className={`
                border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
                ${dragActive 
                  ? 'border-primary bg-primary/5' 
                  : federalFile 
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                }
              `}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('federal-permit-input')?.click()}
            >
              <input
                id="federal-permit-input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {federalFile ? (
                <div className="space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                    <FileCheck className="h-8 w-8 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-300">{federalFile.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {(federalFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFederalFile(null);
                    }}
                  >
                    Remove & Choose Another
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Drop your federal permit here</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      or click to browse (PDF, JPG, PNG - Max 10MB)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Upload Progress */}
            {submitting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Uploading permit...</span>
                  <span className="font-medium">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleGoBack}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to MMP List
            </Button>
            <Button
              onClick={handlePermitSubmit}
              disabled={!federalFile || submitting}
              className="w-full sm:w-auto sm:ml-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Federal Permit
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        /* Preview Section */
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="bg-green-50 dark:bg-green-900/20 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <CheckCircle2 className="h-5 w-5" />
              Permit Uploaded Successfully
            </CardTitle>
            <CardDescription>
              Review the uploaded permit and confirm to proceed
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium mb-3">Uploaded Documents</h4>
              <div className="space-y-2">
                {latestDocs.length > 0 ? (
                  latestDocs.map((doc: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <FileCheck className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium capitalize">{doc.type || doc.permitType} Permit</p>
                          <p className="text-sm text-muted-foreground">{doc.fileName}</p>
                        </div>
                      </div>
                      {doc.fileUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </a>
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-background rounded-lg border">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileCheck className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Federal Permit</p>
                      <p className="text-sm text-muted-foreground">{federalFile?.name}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Confirm Verification</AlertTitle>
              <AlertDescription>
                By confirming, you verify that the federal permit is valid and complete. 
                The MMP will proceed to the next stage in the workflow.
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowPreview(false);
                setFederalFile(null);
              }}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Upload Different Permit
            </Button>
            <Button
              onClick={handleConfirmAndForward}
              disabled={submitting}
              className="w-full sm:w-auto sm:ml-auto bg-green-600 hover:bg-green-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirm & Verify Permit
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Help Section */}
      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 shrink-0">
              <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-sm">
              <p className="font-medium text-foreground">Need Help?</p>
              <p className="text-muted-foreground mt-0.5">
                The federal permit is required to authorize field operations. Ensure the permit is valid 
                and covers the sites listed in this MMP. Contact your supervisor if you need assistance.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MMPVerificationPage;
