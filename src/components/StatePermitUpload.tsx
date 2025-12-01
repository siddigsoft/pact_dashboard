import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertTriangle, CheckCircle2, X, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

    setUploading(true);
    try {
      // Upload file to Supabase storage
      const fileName = `state-permit-${state}-${Date.now()}-${selectedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('mmp-permits')
        .upload(fileName, selectedFile);

      if (uploadError) {
        throw uploadError;
      }

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('mmp-permits')
        .getPublicUrl(fileName);

      // Update MMP file's permits_data to mark state permit as uploaded
      const { data: mmpData, error: fetchError } = await supabase
        .from('mmp_files')
        .select('permits_data')
        .eq('id', mmpFileId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      const currentPermitsData = mmpData?.permits_data || {};
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
            verified: false // Coordinator uploads need FOM verification
          }
        ]
      };

      const { error: updateError } = await supabase
        .from('mmp_files')
        .update({ permits_data: updatedPermitsData })
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
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading the state permit.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setShowPreview(false);
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
    <Card className="border-blue-300 bg-blue-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-blue-800">
          <AlertTriangle className="h-5 w-5" />
          State Permit Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
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
          <div className="text-sm text-gray-600">
            <strong>Requirements:</strong>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Valid state environmental permit for {state}</li>
              <li>PDF or image format (JPG, PNG)</li>
              <li>Maximum file size: 10MB</li>
            </ul>
          </div>

          {/* Preview Section */}
          {selectedFile && previewUrl && (
            <div className="border border-gray-300 rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-700">Preview</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={togglePreview}
                  className="text-blue-600 hover:text-blue-800"
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
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
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
            <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center">
              <Upload className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-3">
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
                className="border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                <FileText className="h-4 w-4 mr-2" />
                Select File
              </Button>
            </div>
          ) : (
            <div className="border border-green-300 bg-green-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">{selectedFile.name}</p>
                    <p className="text-sm text-green-600">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFile}
                  className="text-red-600 hover:text-red-800 hover:bg-red-50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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