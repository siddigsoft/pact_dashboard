import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertTriangle, CheckCircle2, X, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { safeUploadFile } from '@/lib/safeUpload';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';

interface StatePermitUploadProps {
  state: string;
  mmpFileId: string;
  onPermitUploaded: () => void;
  onCancel?: () => void;
  userType?: 'fom' | 'coordinator';
}

export const StatePermitUpload: React.FC<StatePermitUploadProps> = ({
  state,
  mmpFileId,
  onPermitUploaded,
  onCancel,
  userType = 'coordinator',
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [issueDate, setIssueDate] = useState<Date | undefined>(undefined);
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(undefined);
  const [comments, setComments] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const sanitizeSegment = (s: string) =>
    (s || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: 'Invalid file type',
          description: 'Please select a PDF or image file (JPG, PNG).',
          variant: 'destructive',
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please select a file smaller than 10MB.',
          variant: 'destructive',
        });
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl); // Revoke previous preview
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setShowPreview(true);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !issueDate || !expiryDate) return;

    if (expiryDate <= issueDate) {
      toast({ title: 'Invalid dates', description: 'Expiry date must be after the issue date.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {

      const stateSegment = sanitizeSegment(state);
      const filePath = `permits/${mmpFileId}/state/${stateSegment}`;
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

      // Fetch MMP data
      const { data: mmpData, error: fetchError } = await supabase.from('mmp_files').select('permits').eq('id', mmpFileId).single();
      if (fetchError) throw fetchError;

      const currentPermits = mmpData?.permits || {};
      const updatedPermits = {
        ...currentPermits,
        state: true,
        statePermits: [
          ...(currentPermits.statePermits || []),
          {
            state,
            fileName: selectedFile.name,
            fileUrl: publicUrl,
            uploadedAt: new Date().toISOString(),
            uploadedBy: userType,
            verified: userType === 'coordinator' ? false : true,
            issueDate: issueDate.toISOString().split('T')[0],
            expiryDate: expiryDate.toISOString().split('T')[0],
            comments: comments || null,
          },
        ],
      };

      const { error: updateError } = await supabase.from('mmp_files').update({ permits: updatedPermits }).eq('id', mmpFileId);
      if (updateError) throw updateError;

      // Update site entries in parallel
      const { data: sitesData } = await supabase.from('mmp_site_entries').select('id, additional_data').eq('mmp_file_id', mmpFileId).eq('state', state);
      if (sitesData?.length) {
        await Promise.all(
          sitesData.map((site) => {
            const updatedAdditionalData = { ...(site.additional_data || {}), state_permit_attached: true };
            return supabase.from('mmp_site_entries').update({ additional_data: updatedAdditionalData }).eq('id', site.id);
          })
        );
      }

      toast({
        title: 'State permit uploaded successfully',
        description: `State permit for ${state} has been uploaded. You can now proceed to upload local permits.`,
      });
      onPermitUploaded();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({ title: 'Upload failed', description: error.message || 'Error uploading state permit.', variant: 'destructive' });
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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          State Permit Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-foreground">
            {userType === 'fom' ? (
              <>Only the Federal permit has been uploaded. Upload the <strong>{state}</strong> state permit if you have it so coordinator will only need the local permit.</>
            ) : (
              <>Only the Federal permit has been uploaded by FOM. Upload the <strong>{state}</strong> state permit to continue.</>
            )}
          </AlertDescription>
        </Alert>

        {/* File selection & preview */}
        <div className="space-y-3">
          {!selectedFile ? (
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-muted/30">
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">Click to select your state permit file</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileSelect}
                className="hidden"
                id="state-permit-file-input"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
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
                <Button variant="ghost" size="sm" onClick={clearFile} aria-label="Clear file">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {showPreview && (
                <div className="border border-border rounded-lg overflow-hidden bg-muted mt-3">
                  {selectedFile.type === 'application/pdf' ? (
                    <iframe src={previewUrl} className="w-full h-96 border-0" title="PDF Preview" />
                  ) : (
                    <img src={previewUrl} alt="Permit Preview" className="w-full h-auto max-h-96 object-contain" />
                  )}
                </div>
              )}

              <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)} className="mt-2">
                {showPreview ? <><EyeOff className="h-4 w-4 mr-1" /> Hide Preview</> : <><Eye className="h-4 w-4 mr-1" /> Show Preview</>}
              </Button>
            </div>
          )}
        </div>

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
            <Textarea
              id="permit-comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add any additional comments about this permit..."
              className="w-full min-h-[80px]"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button onClick={handleUpload} disabled={!selectedFile || uploading || !issueDate || !expiryDate} className="flex-1">
            {uploading ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div> Uploading...</>
            ) : (
              <><CheckCircle2 className="h-4 w-4 mr-2" /> Verify & Upload State Permit</>
            )}
          </Button>
          {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
        </div>
      </CardContent>
    </Card>
  );
};
