import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, 
  X, 
  RotateCcw, 
  Check, 
  Zap, 
  ZapOff, 
  SwitchCamera, 
  Image,
  Focus,
  Grid3x3,
  Circle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface CapturedPhoto {
  dataUrl: string;
  timestamp: number;
  metadata?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  };
}

interface MobileCameraProps {
  onCapture?: (photo: CapturedPhoto) => void;
  onClose?: () => void;
  showFlash?: boolean;
  showGrid?: boolean;
  showSwitchCamera?: boolean;
  showGallery?: boolean;
  quality?: number;
  facingMode?: 'user' | 'environment';
  captureLocation?: boolean;
  maxPhotos?: number;
  className?: string;
}

export function MobileCamera({
  onCapture,
  onClose,
  showFlash = true,
  showGrid = true,
  showSwitchCamera = true,
  showGallery = true,
  quality = 0.92,
  facingMode: initialFacing = 'environment',
  captureLocation = true,
  maxPhotos = 10,
  className,
}: MobileCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off');
  const [facingMode, setFacingMode] = useState(initialFacing);
  const [showGridOverlay, setShowGridOverlay] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<CapturedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

  const initCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsReady(true);
        setError(null);
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please check permissions.');
    }
  }, [facingMode]);

  useEffect(() => {
    initCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [initCamera]);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return;

    hapticPresets.success();
    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setIsCapturing(false);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    
    let metadata: CapturedPhoto['metadata'] = {};
    
    if (captureLocation && navigator.geolocation) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
          });
        });
        metadata = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
      } catch (e) {
        console.log('Location not available');
      }
    }

    const photo: CapturedPhoto = {
      dataUrl,
      timestamp: Date.now(),
      metadata,
    };

    setCapturedPhotos(prev => [...prev.slice(-(maxPhotos - 1)), photo]);
    setPreviewPhoto(photo);
    onCapture?.(photo);

    setTimeout(() => {
      setIsCapturing(false);
    }, 150);
  }, [isCapturing, quality, captureLocation, maxPhotos, onCapture]);

  const handleSwitchCamera = useCallback(() => {
    hapticPresets.buttonPress();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, []);

  const handleFlashToggle = useCallback(() => {
    hapticPresets.selection();
    setFlashMode(prev => {
      switch (prev) {
        case 'off': return 'on';
        case 'on': return 'auto';
        case 'auto': return 'off';
      }
    });
  }, []);

  const handleGridToggle = useCallback(() => {
    hapticPresets.selection();
    setShowGridOverlay(prev => !prev);
  }, []);

  const handleFocus = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const rect = videoRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    hapticPresets.selection();
    setFocusPoint({ x, y });

    setTimeout(() => setFocusPoint(null), 1000);
  }, []);

  const handleConfirmPhoto = useCallback(() => {
    hapticPresets.success();
    setPreviewPhoto(null);
  }, []);

  const handleRetakePhoto = useCallback(() => {
    hapticPresets.buttonPress();
    setCapturedPhotos(prev => prev.slice(0, -1));
    setPreviewPhoto(null);
  }, []);

  const FlashIcon = flashMode === 'off' ? ZapOff : Zap;

  return (
    <div 
      className={cn("fixed inset-0 bg-black z-50 flex flex-col", className)}
      data-testid="mobile-camera"
    >
      <canvas ref={canvasRef} className="hidden" />

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          onClick={handleFocus}
          data-testid="camera-viewfinder"
        />

        {showGridOverlay && (
          <div className="absolute inset-0 pointer-events-none" data-testid="camera-grid">
            <div className="absolute top-1/3 left-0 right-0 border-t border-white/30" />
            <div className="absolute top-2/3 left-0 right-0 border-t border-white/30" />
            <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/30" />
            <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/30" />
          </div>
        )}

        <AnimatePresence>
          {focusPoint && (
            <motion.div
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute w-16 h-16 border-2 border-white rounded-lg pointer-events-none"
              style={{
                left: `${focusPoint.x}%`,
                top: `${focusPoint.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              data-testid="focus-indicator"
            >
              <Focus className="w-full h-full text-white p-2" />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isCapturing && (
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white"
              data-testid="capture-flash"
            />
          )}
        </AnimatePresence>

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white p-4">
              <Camera className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={initCamera}
                className="mt-4 rounded-full text-white border-white"
                data-testid="button-retry-camera"
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white"
            data-testid="button-close-camera"
          >
            <X className="h-6 w-6" />
          </Button>

          <div className="flex items-center gap-4">
            {showFlash && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleFlashToggle}
                className={cn(
                  "text-white",
                  flashMode !== 'off' && "bg-white/20"
                )}
                data-testid="button-flash"
              >
                <FlashIcon className="h-5 w-5" />
              </Button>
            )}

            {showGrid && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleGridToggle}
                className={cn(
                  "text-white",
                  showGridOverlay && "bg-white/20"
                )}
                data-testid="button-grid"
              >
                <Grid3x3 className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-black p-4 pb-8">
        <div className="flex items-center justify-between max-w-sm mx-auto">
          {showGallery && capturedPhotos.length > 0 ? (
            <button
              className="w-12 h-12 rounded-xl overflow-hidden border-2 border-white/50"
              onClick={() => setPreviewPhoto(capturedPhotos[capturedPhotos.length - 1])}
              data-testid="button-gallery"
            >
              <img
                src={capturedPhotos[capturedPhotos.length - 1].dataUrl}
                alt="Last photo"
                className="w-full h-full object-cover"
              />
            </button>
          ) : (
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <Image className="h-5 w-5 text-white/50" />
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.9 }}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center"
            onClick={handleCapture}
            disabled={!isReady || isCapturing}
            data-testid="button-capture"
          >
            <div className={cn(
              "w-16 h-16 rounded-full bg-white transition-transform",
              isCapturing && "scale-90"
            )} />
          </motion.button>

          {showSwitchCamera ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSwitchCamera}
              className="w-12 h-12 text-white"
              data-testid="button-switch-camera"
            >
              <SwitchCamera className="h-6 w-6" />
            </Button>
          ) : (
            <div className="w-12 h-12" />
          )}
        </div>

        {capturedPhotos.length > 0 && (
          <div className="mt-4 text-center">
            <span className="text-xs text-white/60">
              {capturedPhotos.length} / {maxPhotos} photos
            </span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {previewPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black z-10 flex flex-col"
            data-testid="photo-preview"
          >
            <div className="flex-1 relative">
              <img
                src={previewPhoto.dataUrl}
                alt="Preview"
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>

            <div className="p-4 pb-8 flex items-center justify-center gap-8">
              <Button
                variant="ghost"
                size="lg"
                onClick={handleRetakePhoto}
                className="text-white rounded-full"
                data-testid="button-retake"
              >
                <RotateCcw className="h-6 w-6 mr-2" />
                Retake
              </Button>

              <Button
                variant="default"
                size="lg"
                onClick={handleConfirmPhoto}
                className="bg-white text-black rounded-full"
                data-testid="button-confirm-photo"
              >
                <Check className="h-6 w-6 mr-2" />
                Use Photo
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface CameraButtonProps {
  onCapture: (photo: CapturedPhoto) => void;
  disabled?: boolean;
  className?: string;
}

export function CameraButton({
  onCapture,
  disabled = false,
  className,
}: CameraButtonProps) {
  const [showCamera, setShowCamera] = useState(false);

  const handleCapture = useCallback((photo: CapturedPhoto) => {
    onCapture(photo);
    setShowCamera(false);
  }, [onCapture]);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          hapticPresets.buttonPress();
          setShowCamera(true);
        }}
        disabled={disabled}
        className={cn("rounded-full", className)}
        data-testid="button-open-camera"
      >
        <Camera className="h-4 w-4 mr-2" />
        Take Photo
      </Button>

      <AnimatePresence>
        {showCamera && (
          <MobileCamera
            onCapture={handleCapture}
            onClose={() => setShowCamera(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

interface PhotoThumbnailProps {
  photo: CapturedPhoto;
  onPress?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function PhotoThumbnail({
  photo,
  onPress,
  onRemove,
  className,
}: PhotoThumbnailProps) {
  return (
    <div 
      className={cn("relative rounded-xl overflow-hidden", className)}
      data-testid="photo-thumbnail"
    >
      <img
        src={photo.dataUrl}
        alt="Captured"
        className="w-full h-full object-cover cursor-pointer"
        onClick={() => {
          hapticPresets.selection();
          onPress?.();
        }}
      />

      {onRemove && (
        <button
          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            hapticPresets.buttonPress();
            onRemove();
          }}
          data-testid="button-remove-photo"
          aria-label="Remove photo"
        >
          <X className="h-3 w-3 text-white" />
        </button>
      )}

      {photo.metadata?.latitude && (
        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/50 flex items-center gap-1" data-testid="indicator-gps">
          <Circle className="h-2 w-2 text-white fill-white" />
          <span className="text-[10px] text-white">GPS</span>
        </div>
      )}
    </div>
  );
}
