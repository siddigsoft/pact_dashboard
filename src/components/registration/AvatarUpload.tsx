
import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { User, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AvatarUploadProps {
  onImageChange: (file: File | null, previewUrl: string | null) => void;
  previewUrl?: string | null;
  required?: boolean;
  error?: boolean;
}

const AvatarUpload = ({ onImageChange, previewUrl, required = false, error = false }: AvatarUploadProps) => {
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(previewUrl || null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setLocalPreviewUrl(null);
      onImageChange(null, null);
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please upload an image file",
        variant: "destructive"
      });
      setLocalPreviewUrl(null);
      onImageChange(null, null);
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Image must be less than 5MB",
        variant: "destructive"
      });
      setLocalPreviewUrl(null);
      onImageChange(null, null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(objectUrl);

    // Tell parent which file and what preview url to use
    onImageChange(file, objectUrl);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <Avatar className={`h-24 w-24 ${error ? 'ring-2 ring-red-500' : ''}`}>
        {localPreviewUrl ? (
          <AvatarImage src={localPreviewUrl} alt="Profile" />
        ) : (
          <AvatarFallback>
            <User className="h-12 w-12" />
          </AvatarFallback>
        )}
      </Avatar>
      <div>
        <Button variant="outline" className={`relative ${error ? 'border-red-500 text-red-500 hover:bg-red-50' : ''}`} disabled={uploading}>
          <Upload className="mr-2 h-4 w-4" />
          {required ? 'Upload Picture *' : 'Upload Picture'}
          <input
            type="file"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </Button>
      </div>
    </div>
  );
};

export default AvatarUpload;
