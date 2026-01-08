import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Upload } from 'lucide-react';

interface FileUploadProps {
  onUploadSuccess?: (fileUrl: string, fileName: string) => void;
  bucket?: string;
  onFileSelected?: (file: File) => void;
  pathPrefix?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadSuccess,
  bucket = 'uploads',
  onFileSelected,
  pathPrefix
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      onFileSelected?.(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: "Error",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // 🔐 FORCE SESSION REFRESH (CRITICAL)
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        throw new Error("Session expired. Please log in again.");
      }

      // Generate unique filename
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}.${fileExt}`;

      const sanitizedPrefix = pathPrefix
        ? pathPrefix.replace(/^\/+|\/+$/g, '')
        : '';

      const filePath = sanitizedPrefix
        ? `${sanitizedPrefix}/${fileName}`
        : fileName;

      // ⬆️ SAFE UPLOAD
      const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, selectedFile, {
          upsert: false,
          contentType: selectedFile.type,
        });

      if (error) throw error;

      const publicUrl =
        supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;

      toast({
        title: "Upload Successful",
        description: `File ${selectedFile.name} uploaded successfully`,
      });

      onUploadSuccess?.(publicUrl, selectedFile.name);

      setSelectedFile(null);
      const inputElem = document.getElementById(
        'file-input'
      ) as HTMLInputElement | null;

      if (inputElem) inputElem.value = '';

    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || "An error occurred during upload",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <Input
        id="file-input"
        type="file"
        onChange={handleFileChange}
        className="flex-grow"
        disabled={isUploading}
      />
      <Button
        onClick={handleUpload}
        disabled={!selectedFile || isUploading}
        className="flex items-center gap-2"
      >
        {isUploading ? (
          "Uploading..."
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload
          </>
        )}
      </Button>
    </div>
  );
};
