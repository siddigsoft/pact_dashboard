
import React, { useState, useRef, ChangeEvent } from 'react';
import { User } from '@/types';
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";
import { Camera, Pencil, Trash2, Upload } from 'lucide-react';

interface AvatarUploadProps {
  user: User;
  onAvatarUpload: (avatarUrl: string) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  editable?: boolean;
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({
  user,
  onAvatarUpload,
  className = "",
  size = "md",
  editable = true
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Get avatar size based on provided size prop
  const getAvatarSize = () => {
    switch (size) {
      case "sm": return "h-16 w-16";
      case "lg": return "h-24 w-24";
      default: return "h-20 w-20";
    }
  };

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please upload an image file",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Image must be less than 5MB",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);
    
    // Create a FileReader to convert the image to a data URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      
      // In a real app, you'd upload to a server here and get a URL back
      // For now, we'll use the data URL directly
      onAvatarUpload(result);
      
      setIsUploading(false);
      toast({
        title: "Avatar Updated",
        description: "Your profile picture has been updated"
      });
    };
    
    reader.onerror = () => {
      setIsUploading(false);
      toast({
        title: "Upload Failed",
        description: "Failed to process the image",
        variant: "destructive"
      });
    };
    
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    onAvatarUpload("");
    toast({
      title: "Avatar Removed",
      description: "Your profile picture has been removed"
    });
  };

  return (
    <div className={`relative ${className}`}>
      <Avatar className={`${getAvatarSize()} ${editable ? 'group' : ''}`}>
        {user.avatar ? (
          <AvatarImage 
            src={user.avatar} 
            alt={user.name} 
            className="object-cover" 
          />
        ) : null}
        <AvatarFallback className="bg-primary text-primary-foreground text-xl">
          {getInitials(user.name)}
        </AvatarFallback>
        
        {editable && (
          <div className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={handleUploadClick}
              disabled={isUploading}
            >
              <Camera className="h-4 w-4" />
            </Button>
            {user.avatar && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={handleRemoveAvatar}
                disabled={isUploading}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </Avatar>
      
      {editable && (
        <>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
          />
          
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full">
              <span className="animate-spin text-white">
                <Upload className="h-5 w-5" />
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AvatarUpload;
