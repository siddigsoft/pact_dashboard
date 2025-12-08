import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertTriangle, CheckCircle2, X, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';

interface StatePermitUploadProps {
  state: string;
  mmpFileId: string;
  onPermitUploaded: () => void;
  onCancel?: () => void;
  userType?: 'fom' | 'coordinator'; // Add userType prop
}

export const StatePermitUpload: React.FC<StatePermitUploadProps> = ({
  state,
  mmpFileId,
  onPermitUploaded,
  onCancel,
  userType = 'coordinator' // Default to coordinator
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

  // Sanitize folder segment for storage path safety
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
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please select a PDF or image file (JPG, PNG).",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select a file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      // Create preview URL for the selected file
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setShowPreview(true);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    // Validate mandatory fields
    if (!issueDate) {
      toast({
        title: "Issue date required",
        description: "Please select the permit issue date.",
        variant: "destructive",
      });
      return;
    }

    if (!expiryDate) {
      toast({
        title: "Expiry date required",
        description: "Please select the permit expiry date.",
        variant: "destructive",
      });
      return;
    }

    // Validate that expiry date is after issue date
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
      // Upload file to Supabase storage
      const stateSegment = sanitizeSegment(state);
      const fileName = `state-permit-${stateSegment}-${Date.now()}-${selectedFile.name}`;
      const filePath = `permits/${mmpFileId}/state/${stateSegment}/${fileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('mmp-files')
        .upload(filePath, selectedFile, { upsert: true, contentType: selectedFile.type || undefined });

      if (uploadError) {
        throw uploadError;
      }

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('mmp-files')
        .getPublicUrl(filePath);

      // Update MMP file's permits_data to mark state permit as uploaded
      const { data: mmpData, error: fetchError } = await supabase
        .from('mmp_files')
        .select('permits')
        .eq('id', mmpFileId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      const currentPermitsData = mmpData?.permits || {};
      const updatedPermitsData = {
        ...currentPermitsData,
        state: true, // Mark state permit as uploaded
        statePermits: [
          ...(currentPermitsData.statePermits || []),
          {
            state: state,
            fileName: selectedFile.name,
            fileUrl: publicUrl,
            uploadedAt: new Date().toISOString(),
            uploadedBy: 'coordinator', // Indicate this was uploaded by coordinator
            verified: false, // Coordinator uploads need FOM verification
            issueDate: issueDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
            expiryDate: expiryDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
            comments: comments || null
          }
        ]
      };

      const { error: updateError } = await supabase
        .from('mmp_files')
        .update({ permits: updatedPermitsData })
        .eq('id', mmpFileId);

      if (updateError) {
        throw updateError;
      }

      toast({
        title: "State permit uploaded successfully",
        description: `State permit for ${state} has been uploaded. You can now proceed to upload local permits.`,
      });
      onPermitUploaded();
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
              <>
                Only the Federal permit has been uploaded. Upload the <strong>{state}</strong> state permit if you have it so that coordinator will only be required to upload the local permit.
              </>
            ) : (
              <>
                Only the Federal permit has been uploaded by FOM. Upload the <strong>{state}</strong> state permit to continue.
              </>
            )}
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            <strong className="text-foreground">Requirements:</strong>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Valid state environmental permit for {state}</li>
              <li>PDF or image format (JPG, PNG)</li>
              <li>Maximum file size: 10MB</li>
            </ul>
          </div>

          {/* Preview Section */}
          {selectedFile && previewUrl && (
            <div className="border border-border rounded-lg p-4 bg-card">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-foreground">Preview</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={togglePreview}
                >
                  {showPreview ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-1" />
                      Hide Preview
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-1" />
                      Show Preview
                    </>
                  )}
                </Button>
              </div>

              {showPreview && (
                <div className="border border-border rounded-lg overflow-hidden bg-muted">
                  {selectedFile.type === 'application/pdf' ? (
                    <iframe
                      src={previewUrl}
                      className="w-full h-96 border-0"
                      title="PDF Preview"
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Permit Preview"
                      className="w-full h-auto max-h-96 object-contain"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {!selectedFile ? (
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center bg-muted/30">
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                Click to select your state permit file
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileSelect}
                className="hidden"
                id="state-permit-file-input"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="h-4 w-4 mr-2" />
                Select File
              </Button>
            </div>
          ) : (
            <div className="border border-border bg-muted/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-foreground" />
                  <div>
                    <p className="font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Permit Details Form */}
        <div className="space-y-4 mt-6">
          <h4 className="text-sm font-medium text-foreground">Permit Details</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Issue Date <span className="text-red-500">*</span>
              </Label>
              <DatePicker
                date={issueDate}
                onSelect={setIssueDate}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Expiry Date <span className="text-red-500">*</span>
              </Label>
              <DatePicker
                date={expiryDate}
                onSelect={setExpiryDate}
                className="w-full"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="permit-comments" className="text-sm font-medium">
              Comments (Optional)
            </Label>
            <Textarea
              id="permit-comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Add any additional comments about this permit..."
              className="w-full min-h-[80px]"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || uploading || !issueDate || !expiryDate}
            className="flex-1"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                Uploading...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Verify & Upload State Permit
              </>
            )}
          </Button>

          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};