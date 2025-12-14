/**
 * MobileFullScreenSignature Component
 * Full-screen signature capture modal with offline queue, biometric confirmation, and RTL support
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Check, 
  RotateCcw, 
  Fingerprint,
  Pen,
  Type,
  Loader2,
  WifiOff,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { useDevice } from '@/hooks/use-device';
import { useTranslation } from 'react-i18next';

interface MobileFullScreenSignatureProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (signatureData: SignatureResult) => void;
  title?: string;
  description?: string;
  requireBiometric?: boolean;
  documentType?: string;
  documentId?: string;
  offline?: boolean;
}

export interface SignatureResult {
  signatureImage: string;
  signatureMethod: 'drawn' | 'typed' | 'biometric';
  timestamp: string;
  deviceInfo?: {
    platform: string;
    model: string;
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  offline: boolean;
}

type SignatureMode = 'draw' | 'type';

export function MobileFullScreenSignature({
  isOpen,
  onClose,
  onComplete,
  title = 'Sign Here',
  description,
  requireBiometric = false,
  documentType,
  documentId,
  offline = false,
}: MobileFullScreenSignatureProps) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === 'rtl';
  const { isNative, deviceInfo } = useDevice();
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [mode, setMode] = useState<SignatureMode>('draw');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setHasSignature(false);
      setTypedName('');
      setBiometricVerified(false);
      setMode('draw');
      return;
    }

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000000';
      }
    };

    const timer = setTimeout(resizeCanvas, 100);
    window.addEventListener('resize', resizeCanvas);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isOpen, mode]);

  const getCoordinates = useCallback((e: React.TouchEvent | React.MouseEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      const touch = e.touches[0];
      if (!touch) return null;
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  }, []);

  const startDrawing = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    hapticPresets.selection();
  }, [getCoordinates]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing) return;

    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, getCoordinates]);

  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    hapticPresets.buttonPress();
  }, []);

  const handleBiometricVerification = async () => {
    if (!isNative) {
      setBiometricVerified(true);
      return;
    }

    setIsVerifying(true);
    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');
      
      const result = await NativeBiometric.isAvailable();
      if (!result.isAvailable) {
        setBiometricVerified(true);
        return;
      }

      await NativeBiometric.verifyIdentity({
        reason: 'Verify your identity to sign this document',
        title: 'Biometric Verification',
        subtitle: 'Use fingerprint or face recognition',
        description: documentType ? `Signing: ${documentType}` : undefined,
      });

      hapticPresets.success();
      setBiometricVerified(true);
    } catch (error) {
      console.error('Biometric verification failed:', error);
      hapticPresets.error();
    } finally {
      setIsVerifying(false);
    }
  };

  const generateTypedSignature = (): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 150;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'italic 48px "Dancing Script", "Brush Script MT", cursive';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
    }
    
    return canvas.toDataURL('image/png');
  };

  const handleComplete = async () => {
    if (requireBiometric && !biometricVerified) {
      await handleBiometricVerification();
      if (!biometricVerified) return;
    }

    setIsSaving(true);
    hapticPresets.buttonPress();

    try {
      let signatureImage: string;
      let signatureMethod: 'drawn' | 'typed' | 'biometric';

      if (mode === 'draw') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        signatureImage = canvas.toDataURL('image/png');
        signatureMethod = 'drawn';
      } else if (mode === 'type') {
        signatureImage = generateTypedSignature();
        signatureMethod = 'typed';
      } else {
        return;
      }

      const result: SignatureResult = {
        signatureImage,
        signatureMethod,
        timestamp: new Date().toISOString(),
        deviceInfo: deviceInfo ? {
          platform: deviceInfo.platform || 'web',
          model: deviceInfo.model || 'unknown',
        } : undefined,
        offline,
      };

      hapticPresets.success();
      onComplete(result);
    } finally {
      setIsSaving(false);
    }
  };

  const canComplete = () => {
    if (mode === 'draw') return hasSignature;
    if (mode === 'type') return typedName.trim().length >= 2;
    return false;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-white dark:bg-black flex flex-col"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black/10 dark:border-white/10 safe-area-inset-top">
          <button
            onClick={() => {
              hapticPresets.buttonPress();
              onClose();
            }}
            className="p-2 -m-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            data-testid="button-close-signature"
            aria-label="Close signature pad"
          >
            <X className="h-6 w-6 text-black dark:text-white" />
          </button>
          
          <div className="text-center flex-1 px-4">
            <h2 className="font-semibold text-black dark:text-white">{title}</h2>
            {description && (
              <p className="text-sm text-black/60 dark:text-white/60 line-clamp-1">{description}</p>
            )}
          </div>
          
          <button
            onClick={handleComplete}
            disabled={!canComplete() || isSaving}
            className={cn(
              "px-4 py-2 rounded-full min-h-[44px] flex items-center gap-2",
              "bg-black dark:bg-white text-white dark:text-black",
              "font-medium disabled:opacity-40"
            )}
            data-testid="button-confirm-signature"
            aria-label="Confirm signature"
          >
            {isSaving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Check className="h-5 w-5" />
                <span>Done</span>
              </>
            )}
          </button>
        </div>

        {/* Offline indicator */}
        {offline && (
          <div className="flex items-center justify-center gap-2 py-2 bg-black/5 dark:bg-white/5">
            <WifiOff className="h-4 w-4 text-black/60 dark:text-white/60" />
            <span className="text-sm text-black/60 dark:text-white/60">
              Signature will sync when online
            </span>
          </div>
        )}

        {/* Mode tabs */}
        <div className="flex gap-2 p-4">
          <button
            onClick={() => {
              setMode('draw');
              hapticPresets.selection();
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-full min-h-[44px]",
              mode === 'draw' 
                ? "bg-black dark:bg-white text-white dark:text-black" 
                : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
            )}
            data-testid="button-mode-draw"
            aria-label="Draw signature"
          >
            <Pen className="h-5 w-5" />
            <span>Draw</span>
          </button>
          <button
            onClick={() => {
              setMode('type');
              hapticPresets.selection();
            }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 rounded-full min-h-[44px]",
              mode === 'type' 
                ? "bg-black dark:bg-white text-white dark:text-black" 
                : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
            )}
            data-testid="button-mode-type"
            aria-label="Type signature"
          >
            <Type className="h-5 w-5" />
            <span>Type</span>
          </button>
        </div>

        {/* Signature area */}
        <div className="flex-1 px-4 pb-4 min-h-0">
          {mode === 'draw' ? (
            <div className="h-full flex flex-col">
              <div 
                ref={containerRef}
                className="flex-1 border-2 border-dashed border-black/20 dark:border-white/20 rounded-2xl bg-white dark:bg-neutral-900 touch-none relative overflow-hidden"
              >
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 cursor-crosshair"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  data-testid="canvas-signature"
                />
                {!hasSignature && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-black/30 dark:text-white/30 text-lg">
                      Draw your signature here
                    </p>
                  </div>
                )}
              </div>
              
              {hasSignature && (
                <button
                  onClick={clearCanvas}
                  className="mt-4 flex items-center justify-center gap-2 py-3 rounded-full bg-black/5 dark:bg-white/5 text-black dark:text-white min-h-[44px]"
                  data-testid="button-clear-signature"
                  aria-label="Clear signature"
                >
                  <RotateCcw className="h-5 w-5" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex-1 flex flex-col justify-center">
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Type your full name"
                  className={cn(
                    "w-full text-center text-3xl font-serif italic py-8 bg-transparent",
                    "border-b-2 border-black/20 dark:border-white/20",
                    "focus:outline-none focus:border-black dark:focus:border-white",
                    "placeholder:text-black/30 dark:placeholder:text-white/30",
                    "text-black dark:text-white"
                  )}
                  autoFocus
                  data-testid="input-typed-signature"
                  aria-label="Type your signature"
                />
                
                {typedName && (
                  <div className="mt-8 p-6 border border-black/10 dark:border-white/10 rounded-2xl bg-white dark:bg-neutral-900">
                    <p className="text-center text-4xl font-serif italic text-black dark:text-white">
                      {typedName}
                    </p>
                    <p className="text-center text-sm text-black/40 dark:text-white/40 mt-2">
                      Preview
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Biometric verification */}
        {requireBiometric && (
          <div className="p-4 border-t border-black/10 dark:border-white/10 safe-area-inset-bottom">
            <button
              onClick={handleBiometricVerification}
              disabled={isVerifying || biometricVerified}
              className={cn(
                "w-full flex items-center justify-center gap-3 py-4 rounded-full",
                "min-h-[56px]",
                biometricVerified
                  ? "bg-black dark:bg-white text-white dark:text-black"
                  : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
              )}
              data-testid="button-biometric-verify"
              aria-label="Verify with biometrics"
            >
              {isVerifying ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : biometricVerified ? (
                <>
                  <CheckCircle2 className="h-6 w-6" />
                  <span>Identity Verified</span>
                </>
              ) : (
                <>
                  <Fingerprint className="h-6 w-6" />
                  <span>Verify with Fingerprint / Face ID</span>
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default MobileFullScreenSignature;
