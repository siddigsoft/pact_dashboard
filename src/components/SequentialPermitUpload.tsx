import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, FileText, AlertTriangle, CheckCircle2, X, Eye, EyeOff, 
  ChevronRight, MapPin, Building2, SkipForward, ArrowLeft
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { sudanStates, SudanState } from '@/data/sudanStates';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LocalityPermitStatus {
  localityId: string;
  localityName: string;
  status: 'pending' | 'uploaded' | 'skipped';
  fileName?: string;
  fileUrl?: string;
}

interface SequentialPermitUploadProps {
  state: string;
  stateId: string;
  mmpFileId: string;
  onComplete: () => void;
  onCancel?: () => void;
}

type UploadStep = 'state' | 'ask_locality' | 'locality_list' | 'locality_upload' | 'complete';

export const SequentialPermitUpload: React.FC<SequentialPermitUploadProps> = ({
  state,
  stateId,
  mmpFileId,
  onComplete,
  onCancel
}) => {
  const [currentStep, setCurrentStep] = useState<UploadStep>('state');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [issueDate, setIssueDate] = useState<Date | undefined>(undefined);
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(undefined);
  const [comments, setComments] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [localities, setLocalities] = useState<LocalityPermitStatus[]>([]);
  const [currentLocalityIndex, setCurrentLocalityIndex] = useState(0);
  const [statePermitUploaded, setStatePermitUploaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Check if state permit already exists and set initial step accordingly
  useEffect(() => {
    let isMounted = true;
    
    const checkExistingPermits = async () => {
      try {
        const { data: mmpData, error } = await supabase
          .from('mmp_files')
          .select('permits')
          .eq('id', mmpFileId)
          .single();

        if (!isMounted) return;

        if (error) {
          console.error('Error checking existing permits:', error);
          setInitialLoading(false);
          return;
        }

        const permits = mmpData?.permits as any;
        if (permits?.statePermits) {
          const existingStatePermit = permits.statePermits.find(
            (p: any) => p.state === state || p.stateId === stateId
          );
          if (existingStatePermit) {
            setStatePermitUploaded(true);
            setCurrentStep('ask_locality');
          }
        }
        setInitialLoading(false);
      } catch (err) {
        console.error('Error checking existing permits:', err);
        if (isMounted) setInitialLoading(false);
      }
    };

    checkExistingPermits();
    
    return () => { isMounted = false; };
  }, [mmpFileId, state, stateId]);

  useEffect(() => {
    const stateData = sudanStates.find(s => 
      s.id === stateId || 
      s.name.toLowerCase() === state.toLowerCase() ||
      s.name.toLowerCase().replace(/\s+/g, '-') === stateId
    );
    
    if (stateData) {
      setLocalities(stateData.localities.map(l => ({
        localityId: l.id,
        localityName: l.name,
        status: 'pending'
      })));
    }
  }, [state, stateId]);

  const sanitizeSegment = (s: string) =>
    (s || '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '');

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF or image file (JPG, PNG).",
          variant: "destructive",
        });
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select a file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setShowPreview(true);
    }
  };

  const handleStatePermitUpload = async () => {
    if (!selectedFile || !issueDate || !expiryDate) return;

    if (expiryDate <= issueDate) {
      toast({
        title: "Invalid dates",
        description: "Expiry date must be after the issue date.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const stateSegment = sanitizeSegment(state);
      const fileName = `state-permit-${stateSegment}-${Date.now()}-${selectedFile.name}`;
      const filePath = `permits/${mmpFileId}/state/${stateSegment}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('mmp-files')
        .upload(filePath, selectedFile, { upsert: true, contentType: selectedFile.type || undefined });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('mmp-files')
        .getPublicUrl(filePath);

      const { data: mmpData, error: fetchError } = await supabase
        .from('mmp_files')
        .select('permits')
        .eq('id', mmpFileId)
        .single();

      if (fetchError) throw fetchError;

      const currentPermitsData = mmpData?.permits || {};
      const existingStatePermits = (currentPermitsData.statePermits || []) as any[];
      const existingPermitIndex = existingStatePermits.findIndex(
        (p: any) => p.state === state || p.stateId === stateId
      );
      
      const newStatePermit = {
        state: state,
        stateId: stateId,
        fileName: selectedFile.name,
        fileUrl: publicUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'coordinator',
        verified: false,
        issueDate: issueDate.toISOString().split('T')[0],
        expiryDate: expiryDate.toISOString().split('T')[0],
        comments: comments || null
      };
      
      const updatedStatePermits = existingPermitIndex >= 0
        ? existingStatePermits.map((p, i) => i === existingPermitIndex ? newStatePermit : p)
        : [...existingStatePermits, newStatePermit];
      
      const updatedPermitsData = {
        ...currentPermitsData,
        state: true,
        statePermits: updatedStatePermits
      };

      const { error: updateError } = await supabase
        .from('mmp_files')
        .update({ permits: updatedPermitsData })
        .eq('id', mmpFileId);

      if (updateError) throw updateError;

      toast({
        title: "State permit uploaded",
        description: `State permit for ${state} has been uploaded successfully.`,
      });

      setStatePermitUploaded(true);
      clearFile();
      setCurrentStep('ask_locality');
    } catch (error) {
      const errMsg = (error as any)?.message || JSON.stringify(error);
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: errMsg || "An error occurred while uploading the state permit.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleLocalityPermitUpload = async () => {
    if (!selectedFile || !issueDate || !expiryDate) return;

    if (expiryDate <= issueDate) {
      toast({
        title: "Invalid dates",
        description: "Expiry date must be after the issue date.",
        variant: "destructive",
      });
      return;
    }

    const currentLocality = localities[currentLocalityIndex];
    if (!currentLocality) return;

    setUploading(true);
    try {
      const stateSegment = sanitizeSegment(state);
      const localitySegment = sanitizeSegment(currentLocality.localityName);
      const fileName = `locality-permit-${stateSegment}-${localitySegment}-${Date.now()}-${selectedFile.name}`;
      const filePath = `permits/${mmpFileId}/local/${localitySegment}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('mmp-files')
        .upload(filePath, selectedFile, { upsert: true, contentType: selectedFile.type || undefined });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('mmp-files')
        .getPublicUrl(filePath);

      const { data: mmpData, error: fetchError } = await supabase
        .from('mmp_files')
        .select('permits')
        .eq('id', mmpFileId)
        .single();

      if (fetchError) throw fetchError;

      const currentPermitsData = mmpData?.permits || {};
      const existingLocalityPermits = (currentPermitsData.localityPermits || []) as any[];
      const existingPermitIndex = existingLocalityPermits.findIndex(
        (p: any) => (p.locality === currentLocality.localityName || p.localityId === currentLocality.localityId) &&
                    (p.state === state || p.stateId === stateId)
      );
      
      const newLocalityPermit = {
        state: state,
        stateId: stateId,
        locality: currentLocality.localityName,
        localityId: currentLocality.localityId,
        fileName: selectedFile.name,
        fileUrl: publicUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'coordinator',
        verified: false,
        issueDate: issueDate.toISOString().split('T')[0],
        expiryDate: expiryDate.toISOString().split('T')[0],
        comments: comments || null
      };
      
      const updatedLocalityPermits = existingPermitIndex >= 0
        ? existingLocalityPermits.map((p, i) => i === existingPermitIndex ? newLocalityPermit : p)
        : [...existingLocalityPermits, newLocalityPermit];
      
      const updatedPermitsData = {
        ...currentPermitsData,
        local: true,
        localityPermits: updatedLocalityPermits
      };

      const { error: updateError } = await supabase
        .from('mmp_files')
        .update({ permits: updatedPermitsData })
        .eq('id', mmpFileId);

      if (updateError) throw updateError;

      setLocalities(prev => prev.map((l, i) => 
        i === currentLocalityIndex 
          ? { ...l, status: 'uploaded', fileName: selectedFile.name, fileUrl: publicUrl }
          : l
      ));

      toast({
        title: "Locality permit uploaded",
        description: `Permit for ${currentLocality.localityName} has been uploaded.`,
      });

      clearFile();
      moveToNextLocality();
    } catch (error) {
      const errMsg = (error as any)?.message || JSON.stringify(error);
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: errMsg || "An error occurred while uploading the locality permit.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const skipCurrentLocality = async () => {
    const currentLocality = localities[currentLocalityIndex];
    if (!currentLocality) return;

    try {
      const { data: mmpData, error: fetchError } = await supabase
        .from('mmp_files')
        .select('permits')
        .eq('id', mmpFileId)
        .single();

      if (!fetchError && mmpData) {
        const currentPermitsData = mmpData.permits || {};
        const skippedLocalities = (currentPermitsData.skippedLocalities || []) as any[];
        
        const existingIndex = skippedLocalities.findIndex(
          (s: any) => (s.locality === currentLocality.localityName || s.localityId === currentLocality.localityId) &&
                      (s.state === state || s.stateId === stateId)
        );
        
        const skippedEntry = {
          state: state,
          stateId: stateId,
          locality: currentLocality.localityName,
          localityId: currentLocality.localityId,
          skippedAt: new Date().toISOString(),
          skippedBy: 'coordinator'
        };
        
        const updatedSkipped = existingIndex >= 0
          ? skippedLocalities.map((s, i) => i === existingIndex ? skippedEntry : s)
          : [...skippedLocalities, skippedEntry];
        
        await supabase
          .from('mmp_files')
          .update({ permits: { ...currentPermitsData, skippedLocalities: updatedSkipped } })
          .eq('id', mmpFileId);
      }
    } catch (error) {
      console.error('Error persisting skip status:', error);
    }

    setLocalities(prev => prev.map((l, i) => 
      i === currentLocalityIndex ? { ...l, status: 'skipped' } : l
    ));
    clearFile();
    moveToNextLocality();
  };

  const moveToNextLocality = () => {
    const nextIndex = currentLocalityIndex + 1;
    if (nextIndex >= localities.length) {
      setCurrentStep('complete');
    } else {
      setCurrentLocalityIndex(nextIndex);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setShowPreview(false);
    setIssueDate(undefined);
    setExpiryDate(undefined);
    setComments('');
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const togglePreview = () => {
    setShowPreview(!showPreview);
  };

  const handleNoLocalityPermits = () => {
    setCurrentStep('complete');
  };

  const handleYesLocalityPermits = () => {
    setCurrentStep('locality_list');
  };

  const startLocalityUpload = (index: number) => {
    setCurrentLocalityIndex(index);
    setCurrentStep('locality_upload');
  };

  const getProgress = () => {
    const completed = localities.filter(l => l.status !== 'pending').length;
    return (completed / localities.length) * 100;
  };

  const uploadedCount = localities.filter(l => l.status === 'uploaded').length;
  const skippedCount = localities.filter(l => l.status === 'skipped').length;
  const pendingCount = localities.filter(l => l.status === 'pending').length;

  const renderFileUploadSection = (type: 'state' | 'locality') => {
    const currentLocality = type === 'locality' ? localities[currentLocalityIndex] : null;
    
    return (
      <div className="space-y-4">
        {selectedFile && previewUrl && (
          <div className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-foreground">Preview</h4>
              <Button variant="ghost" size="sm" onClick={togglePreview}>
                {showPreview ? (
                  <><EyeOff className="h-4 w-4 mr-1" /> Hide</>
                ) : (
                  <><Eye className="h-4 w-4 mr-1" /> Show</>
                )}
              </Button>
            </div>
            {showPreview && (
              <div className="border border-border rounded-lg overflow-hidden bg-muted">
                {selectedFile.type === 'application/pdf' ? (
                  <iframe src={previewUrl} className="w-full h-64 border-0" title="PDF Preview" />
                ) : (
                  <img src={previewUrl} alt="Permit Preview" className="w-full h-auto max-h-64 object-contain" />
                )}
              </div>
            )}
          </div>
        )}

        {!selectedFile ? (
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-muted/30">
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              Click to select your {type === 'state' ? 'state' : 'locality'} permit file
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileSelect}
              className="hidden"
              data-testid={`input-${type}-permit-file`}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid={`button-select-${type}-file`}>
              <FileText className="h-4 w-4 mr-2" /> Select File
            </Button>
          </div>
        ) : (
          <div className="border border-border bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-foreground" />
                <div>
                  <p className="font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={clearFile}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-4 mt-4">
          <h4 className="text-sm font-medium text-foreground">Permit Details</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Issue Date <span className="text-red-500">*</span></Label>
              <DatePicker date={issueDate} onSelect={setIssueDate} className="w-full" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Expiry Date <span className="text-red-500">*</span></Label>
              <DatePicker date={expiryDate} onSelect={setExpiryDate} className="w-full" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Comments (Optional)</Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add any additional comments..."
              className="w-full min-h-[60px]"
            />
          </div>
        </div>
      </div>
    );
  };

  if (initialLoading) {
    return (
      <Card className="border-border shadow-sm">
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-sm text-muted-foreground">Loading permit status...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentStep === 'state') {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-foreground">Step 1: State Permit</CardTitle>
          </div>
          <CardDescription>Upload the state permit for {state} first</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-foreground">
              Upload the <strong>{state}</strong> state permit to continue. After this, you will be asked about locality permits.
            </AlertDescription>
          </Alert>

          {renderFileUploadSection('state')}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleStatePermitUpload}
              disabled={!selectedFile || uploading || !issueDate || !expiryDate}
              className="flex-1"
              data-testid="button-upload-state-permit"
            >
              {uploading ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div> Uploading...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Upload State Permit</>
              )}
            </Button>
            {onCancel && (
              <Button variant="outline" onClick={onCancel} data-testid="button-cancel-permit">Cancel</Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentStep === 'ask_locality') {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="text-foreground">State Permit Uploaded</CardTitle>
          </div>
          <CardDescription>
            {state} state permit has been uploaded successfully
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
            <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-foreground">
              <strong>{state}</strong> has <strong>{localities.length}</strong> localities. 
              Do you need to upload locality permits?
            </AlertDescription>
          </Alert>

          <div className="flex gap-3">
            <Button onClick={handleYesLocalityPermits} className="flex-1" data-testid="button-yes-locality-permits">
              <CheckCircle2 className="h-4 w-4 mr-2" /> Yes, upload locality permits
            </Button>
            <Button variant="outline" onClick={handleNoLocalityPermits} className="flex-1" data-testid="button-no-locality-permits">
              <SkipForward className="h-4 w-4 mr-2" /> No, skip locality permits
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentStep === 'locality_list') {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle className="text-foreground">Step 2: Locality Permits</CardTitle>
          </div>
          <CardDescription>
            Upload permits for localities in {state} ({uploadedCount}/{localities.length} uploaded)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={getProgress()} className="h-2" />
          
          <div className="flex items-center gap-4 text-sm">
            <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
              {uploadedCount} Uploaded
            </Badge>
            <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
              {skippedCount} Skipped
            </Badge>
            <Badge variant="outline" className="bg-muted">
              {pendingCount} Pending
            </Badge>
          </div>

          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-2">
              {localities.map((locality, index) => (
                <div
                  key={locality.localityId}
                  className="flex items-center justify-between p-3 border border-border rounded-lg bg-card"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}.</span>
                    <span className="text-foreground">{locality.localityName}</span>
                    {locality.status === 'uploaded' && (
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Uploaded
                      </Badge>
                    )}
                    {locality.status === 'skipped' && (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">
                        <SkipForward className="h-3 w-3 mr-1" /> Skipped
                      </Badge>
                    )}
                  </div>
                  {locality.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => startLocalityUpload(index)}
                      data-testid={`button-upload-locality-${locality.localityId}`}
                    >
                      <Upload className="h-4 w-4 mr-1" /> Upload
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex gap-3 pt-2">
            <Button onClick={() => setCurrentStep('complete')} className="flex-1" data-testid="button-finish-permits">
              <CheckCircle2 className="h-4 w-4 mr-2" /> Finish
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentStep === 'locality_upload') {
    const currentLocality = localities[currentLocalityIndex];
    
    return (
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <CardTitle className="text-foreground">
                Locality {currentLocalityIndex + 1} of {localities.length}
              </CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCurrentStep('locality_list')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
            </Button>
          </div>
          <CardDescription>
            Upload permit for <strong>{currentLocality?.localityName}</strong> in {state}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={((currentLocalityIndex) / localities.length) * 100} className="h-2" />

          {renderFileUploadSection('locality')}

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleLocalityPermitUpload}
              disabled={!selectedFile || uploading || !issueDate || !expiryDate}
              className="flex-1"
              data-testid="button-upload-locality-permit"
            >
              {uploading ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div> Uploading...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" /> Upload Permit</>
              )}
            </Button>
            <Button variant="outline" onClick={skipCurrentLocality} data-testid="button-skip-locality">
              <SkipForward className="h-4 w-4 mr-2" /> Skip
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (currentStep === 'complete') {
    return (
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle className="text-foreground">Permits Complete</CardTitle>
          </div>
          <CardDescription>All permit uploads for {state} are complete</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-foreground">
              <strong>Summary:</strong>
              <ul className="mt-2 space-y-1">
                <li>State Permit: Uploaded</li>
                {uploadedCount > 0 && <li>Locality Permits Uploaded: {uploadedCount}</li>}
                {skippedCount > 0 && <li>Localities Skipped: {skippedCount}</li>}
              </ul>
            </AlertDescription>
          </Alert>

          <Button onClick={onComplete} className="w-full" data-testid="button-complete-permits">
            <CheckCircle2 className="h-4 w-4 mr-2" /> Done
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
};
