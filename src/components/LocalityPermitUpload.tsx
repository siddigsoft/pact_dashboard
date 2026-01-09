import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertTriangle, CheckCircle2, X, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { safeUploadFile } from '@/lib/safeUpload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';

interface LocalityPermitUploadProps {
  state: string;
  locality: string;
  mmpFileId: string;
  onPermitUploaded: () => void;
  onCancel?: () => void;
}

export const LocalityPermitUpload: React.FC<LocalityPermitUploadProps> = ({
  state,
  locality,
  mmpFileId,
  onPermitUploaded,
  onCancel
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [issueDate, setIssueDate] = useState<Date | undefined>(undefined);
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(undefined);
  const [comments, setComments] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const sanitizeSegment = (s: string) =>
    (s || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please select a PDF or image file (JPG, PNG).", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select a file smaller than 10MB.", variant: "destructive" });
      return;
    }

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setShowPreview(true);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    if (!issueDate || !expiryDate) {
      toast({ title: "Dates required", description: "Please select issue and expiry dates.", variant: "destructive" });
      return;
    }
    if (expiryDate <= issueDate) {
      toast({ title: "Invalid dates", description: "Expiry date must be after the issue date.", variant: "destructive" });
      return;
    }

    setUploading(true);

    try {
      // 🔐 FORCE SESSION REFRESH BEFORE UPLOAD
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error("Session expired. Please log in again.");

      const stateSegment = sanitizeSegment(state);
      const localitySegment = sanitizeSegment(locality);

      // Use safeUploadFile for secure upload
      const filePath = `permits/${mmpFileId}/local/${localitySegment}`;
      const uploadResult = await safeUploadFile(selectedFile, {
        bucket: 'mmp-files',
        path: filePath,
        allowedTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'],
        maxSizeBytes: 10 * 1024 * 1024
      });

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || 'Failed to upload file');
      }
      const publicUrl = uploadResult.url;

      // Fetch current permits data
      const { data: mmpData, error: fetchError } = await supabase.from('mmp_files').select('permits').eq('id', mmpFileId).single();
      if (fetchError) throw fetchError;

      const currentPermitsData = mmpData?.permits || {};
      const updatedPermitsData = {
        ...currentPermitsData,
        locality: true,
        localityPermits: [
          ...(currentPermitsData.localityPermits || []),
          {
            state,
            locality,
            fileName: selectedFile.name,
            fileUrl: publicUrl,
            uploadedAt: new Date().toISOString(),
            uploadedBy: 'coordinator',
            verified: false,
            issueDate: issueDate.toISOString().split('T')[0],
            expiryDate: expiryDate.toISOString().split('T')[0],
            comments: comments || null
          }
        ]
      };

      const { error: updateError } = await supabase.from('mmp_files').update({ permits: updatedPermitsData }).eq('id', mmpFileId);
      if (updateError) throw updateError;

      // Update all sites in this locality to 'permits_attached'
      const { data: sitesData, error: sitesFetchError } = await supabase
        .from('mmp_site_entries')
        .select('id, additional_data, status')
        .eq('mmp_file_id', mmpFileId)
        .eq('state', state)
        .eq('locality', locality)
        .in('status', ['Pending', 'Dispatched', 'assigned', 'inProgress', 'in_progress']);

      if (!sitesFetchError && sitesData?.length) {
        for (const site of sitesData) {
          const updatedAdditionalData = { ...(site.additional_data || {}), locality_permit_attached: true };
          const { error: siteUpdateError } = await supabase
            .from('mmp_site_entries')
            .update({ status: 'permits_attached', additional_data: updatedAdditionalData })
            .eq('id', site.id);
          if (siteUpdateError) console.warn(`Failed to update site ${site.id}:`, siteUpdateError);
        }
      }

      toast({
        title: "Local permit uploaded successfully",
        description: `Local permit for ${locality}, ${state} has been uploaded.`,
      });

      onPermitUploaded();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({ title: "Upload failed", description: error.message || "An error occurred during upload.", variant: "destructive" });
    } finally {
      setUploading(false);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const togglePreview = () => setShowPreview(!showPreview);

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          Local Permit Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-foreground">
            Upload the local permit for <strong>{locality}, {state}</strong>.
          </AlertDescription>
        </Alert>

        {/* File Selection */}
        {selectedFile && previewUrl ? (
          <div className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-foreground">Preview</h4>
              <Button variant="ghost" size="sm" onClick={togglePreview}>
                {showPreview ? <><EyeOff className="h-4 w-4 mr-1" />Hide Preview</> :
                  <><Eye className="h-4 w-4 mr-1" />Show Preview</>}
              </Button>
            </div>
            {showPreview && (
              <div className="border border-border rounded-lg overflow-hidden bg-muted">
                {selectedFile.type === 'application/pdf' ? (
                  <iframe src={previewUrl} className="w-full h-96 border-0" title="PDF Preview" />
                ) : (
                  <img src={previewUrl} alt="Permit Preview" className="w-full h-auto max-h-96 object-contain" />
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-muted/30">
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">Click to select your local permit file</p>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileSelect} className="hidden" />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}><FileText className="h-4 w-4 mr-2" />Select File</Button>
          </div>
        )}

        {/* Permit Details */}
        <div className="space-y-4 mt-6">
          <h4 className="text-sm font-medium text-foreground">Permit Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <Label htmlFor="permit-comments" className="text-sm font-medium">Comments (Optional)</Label>
            <Textarea id="permit-comments" value={comments} onChange={e => setComments(e.target.value)} placeholder="Add comments..." className="w-full min-h-[80px]" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={handleUpload} disabled={!selectedFile || uploading || !issueDate || !expiryDate} className="flex-1">
            {uploading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            {uploading ? 'Uploading...' : 'Upload Local Permit'}
          </Button>
          {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
        </div>
      </CardContent>
    </Card>
  );
};
