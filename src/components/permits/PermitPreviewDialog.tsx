
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Button } from '@/components/ui/button';
import { Eye, FileImage, FileVideo } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface PermitPreviewDialogProps {
  fileUrl: string | undefined;
  fileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PermitPreviewDialog: React.FC<PermitPreviewDialogProps> = ({
  fileUrl,
  fileName,
  open,
  onOpenChange,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Reset loading state when dialog opens
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setError(null);
    }
  }, [open]);

  // Safety timeout: if the browser never fires onLoad/onError, reveal content and provide link
  useEffect(() => {
    if (!open || !fileUrl) return;
    const t = setTimeout(() => {
      if (isLoading) {
        setIsLoading(false);
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [open, fileUrl, isLoading]);

  const handleLoadSuccess = () => {
    setIsLoading(false);
  };

  const handleLoadError = () => {
    setIsLoading(false);
    setError(`Failed to load preview for ${fileName}`);
  };

  const isPDF = fileName.toLowerCase().endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileName);
  const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(fileName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isImage && <FileImage className="h-5 w-5" />}
            {isVideo && <FileVideo className="h-5 w-5" />}
            {!isImage && !isVideo && <Eye className="h-5 w-5" />}
            {fileName}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          {fileUrl ? (
            <div className="overflow-hidden rounded-lg border">
              {isLoading && (
                <div className="flex items-center justify-center p-8">
                  <Skeleton className="h-[400px] w-full" />
                </div>
              )}
              
              {isPDF ? (
                <div className="relative">
                  <iframe
                    src={fileUrl}
                    className="w-full h-[600px]"
                    title={fileName}
                    onLoad={handleLoadSuccess}
                    onError={handleLoadError}
                    referrerPolicy="no-referrer"
                  />
                  {isLoading && (
                    <div className="absolute inset-0">
                      <Skeleton className="h-full w-full" />
                    </div>
                  )}
                </div>
              ) : isImage ? (
                <AspectRatio ratio={16 / 9}>
                  <img
                    src={fileUrl}
                    alt={fileName}
                    className="w-full h-full object-contain"
                    onLoad={handleLoadSuccess}
                    onError={handleLoadError}
                    referrerPolicy="no-referrer"
                  />
                </AspectRatio>
              ) : isVideo ? (
                <AspectRatio ratio={16 / 9}>
                  <video
                    src={fileUrl}
                    controls
                    className="w-full h-full"
                    onLoadedData={handleLoadSuccess}
                    onError={handleLoadError}
                  />
                </AspectRatio>
              ) : (
                <div className="p-8 text-center">
                  <p>Preview not available for this file type.</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => window.open(fileUrl, '_blank')}
                  >
                    Download File
                  </Button>
                </div>
              )}
              
              {error && (
                <div className="p-8 text-center text-destructive">
                  <p>{error}</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => window.open(fileUrl, '_blank')}
                  >
                    Open in New Tab
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center p-12 border rounded-lg bg-muted/30">
              <Eye className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground font-medium">Preview not available</p>
              <p className="text-xs text-muted-foreground/70 mt-1">The file URL is missing or invalid</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PermitPreviewDialog;
