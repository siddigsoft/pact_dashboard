import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { useCoordinatorLocalityPermits } from '@/hooks/use-coordinator-permits';
import { useToast } from '@/hooks/use-toast';
import { LocalityPermitStatus } from '@/types/coordinator-permits';

interface LocalityPermitUploadProps {
  locality: LocalityPermitStatus;
  onPermitUploaded: () => void;
  onCancel?: () => void;
}

export const LocalityPermitUpload: React.FC<LocalityPermitUploadProps> = ({
  locality,
  onPermitUploaded,
  onCancel
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadPermit } = useCoordinatorLocalityPermits();
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
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const result = await uploadPermit(locality.stateId, locality.localityId, selectedFile);

      if (result) {
        toast({
          title: "Permit uploaded successfully",
          description: `Local permit for ${locality.locality} has been uploaded. You can now access the sites in this locality.`,
        });
        onPermitUploaded();
      } else {
        toast({
          title: "Upload failed",
          description: "Failed to upload the permit. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading the permit.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card className="border-orange-300 bg-orange-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-orange-800">
          <AlertTriangle className="h-5 w-5" />
          Local Permit Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You need to upload a local permit for <strong>{locality.locality}</strong> in <strong>{locality.state}</strong>
            before you can access the {locality.siteCount} site{locality.siteCount !== 1 ? 's' : ''} assigned to you in this locality.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            <strong>Requirements:</strong>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Valid local environmental permit for {locality.locality}</li>
              <li>PDF or image format (JPG, PNG)</li>
              <li>Maximum file size: 10MB</li>
            </ul>
          </div>

          {!selectedFile ? (
            <div className="border-2 border-dashed border-orange-300 rounded-lg p-6 text-center">
              <Upload className="h-8 w-8 text-orange-500 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-3">
                Click to select your local permit file
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileSelect}
                className="hidden"
                id="permit-file-input"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="border-orange-300 text-orange-700 hover:bg-orange-100"
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
            className="flex-1 bg-orange-600 hover:bg-orange-700"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Permit
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