/**
 * MobileSignaturePad Component
 * Optimized signature pad for mobile devices with full-screen mode
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Pen, 
  RotateCcw,
  Check,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileSignaturePadProps {
  onSignatureComplete: (signatureData: string) => void;
  onCancel?: () => void;
  fullScreenMode?: boolean;
  className?: string;
}

export function MobileSignaturePad({
  onSignatureComplete,
  onCancel,
  fullScreenMode = false,
  className,
}: MobileSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(fullScreenMode);

  // Initialize canvas with proper DPI scaling
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      const height = isFullScreen ? window.innerHeight - 120 : 250;
      
      canvas.width = rect.width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${height}px`;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3; // Thicker for mobile
        ctx.strokeStyle = '#000000';
        
        // Fill with white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, height);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('orientationchange', resizeCanvas);
    };
  }, [isFullScreen]);

  const getCoordinates = useCallback((e: React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    if (!touch) return null;
    
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
  }, []);

  const startDrawing = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  }, [getCoordinates]);

  const draw = useCallback((e: React.TouchEvent) => {
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
    if (isDrawing) {
      setIsDrawing(false);
      setStrokeCount(prev => prev + 1);
    }
  }, [isDrawing]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
    setStrokeCount(0);
  }, []);

  const handleConfirm = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;
    
    const signatureData = canvas.toDataURL('image/png');
    onSignatureComplete(signatureData);
  }, [hasSignature, onSignatureComplete]);

  const toggleFullScreen = () => {
    setIsFullScreen(prev => !prev);
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        'w-full touch-none',
        isFullScreen && 'fixed inset-0 z-50 bg-background p-4',
        className
      )}
      data-testid="mobile-signature-pad"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Pen className="h-5 w-5 text-primary" />
          <span className="font-medium">Sign Here</span>
          {strokeCount > 0 && (
            <Badge variant="outline" className="text-xs">
              {strokeCount} stroke{strokeCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={toggleFullScreen}
            data-testid="button-toggle-fullscreen"
          >
            {isFullScreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon"
            onClick={clearCanvas}
            disabled={!hasSignature}
            data-testid="button-clear-mobile"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="relative border-2 border-dashed rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          onTouchCancel={stopDrawing}
          data-testid="canvas-mobile-signature"
        />
        
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-muted-foreground">
              <Pen className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Use your finger to sign</p>
            </div>
          </div>
        )}
        
        {/* Signature line */}
        <div className="absolute bottom-8 left-8 right-8 border-b border-gray-300" />
        <div className="absolute bottom-4 left-8 text-xs text-gray-400">
          Signature
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 mt-4">
        {onCancel && (
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={onCancel}
            data-testid="button-cancel-mobile"
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        )}
        <Button 
          className="flex-1"
          onClick={handleConfirm}
          disabled={!hasSignature}
          data-testid="button-confirm-mobile"
        >
          <Check className="h-4 w-4 mr-1" />
          Confirm Signature
        </Button>
      </div>

      {/* Instructions */}
      <p className="text-xs text-center text-muted-foreground mt-3">
        Your signature will be securely stored and timestamped
      </p>
    </div>
  );
}

export default MobileSignaturePad;
