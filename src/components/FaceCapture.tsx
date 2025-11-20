
import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, Loader2 } from "lucide-react";
import { validateFaceImage } from '@/utils/faceValidation';

interface FaceCaptureProps {
  onImageCapture: (imageUrl: string) => void;
}

const FaceCapture: React.FC<FaceCaptureProps> = ({ onImageCapture }) => {
  const [isValidating, setIsValidating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please upload an image file",
        variant: "destructive"
      });
      return;
    }

    await processImage(file);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (error) {
      toast({
        title: "Camera Error",
        description: "Unable to access camera",
        variant: "destructive"
      });
    }
  };

  const takePicture = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx && videoRef.current) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          processImage(blob);
        }
      }, 'image/jpeg');
    }

    stopCamera();
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
    }
  };

  const processImage = async (imageData: Blob) => {
    setIsValidating(true);
    const imageUrl = URL.createObjectURL(imageData);
    setPreviewUrl(imageUrl);

    try {
      const img = new Image();
      img.src = imageUrl;
      await new Promise((resolve) => (img.onload = resolve));

      const isValid = await validateFaceImage(img);

      if (!isValid) {
        toast({
          title: "Invalid Image",
          description: "Please upload a clear photo of a single face",
          variant: "destructive"
        });
        setPreviewUrl(null);
        return;
      }

      onImageCapture(imageUrl);
      toast({
        title: "Success",
        description: "Face photo validated successfully"
      });
    } catch (error) {
      toast({
        title: "Validation Error",
        description: "Failed to validate the image",
        variant: "destructive"
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Card className="p-4">
      {isCameraActive ? (
        <div className="space-y-4">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full rounded-lg"
          />
          <div className="flex justify-center gap-2">
            <Button onClick={takePicture}>Capture</Button>
            <Button variant="secondary" onClick={stopCamera}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {previewUrl && (
            <div className="relative">
              <img
                src={previewUrl}
                alt="Face preview"
                className="w-full rounded-lg"
              />
              {isValidating && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
            </div>
          )}
          <div className="flex justify-center gap-2">
            <Button onClick={startCamera}>
              <Camera className="mr-2 h-4 w-4" />
              Take Photo
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Photo
            </Button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileUpload}
          />
        </div>
      )}
    </Card>
  );
};

export default FaceCapture;
