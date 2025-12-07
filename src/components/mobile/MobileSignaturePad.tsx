import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Eraser, Check, RotateCcw, Pen, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface Point {
  x: number;
  y: number;
  pressure?: number;
}

interface Stroke {
  points: Point[];
  color: string;
  width: number;
}

interface MobileSignaturePadProps {
  onSave?: (signature: string) => void;
  onClear?: () => void;
  width?: number | 'auto';
  height?: number | 'auto';
  aspectRatio?: number;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  showControls?: boolean;
  showGuide?: boolean;
  guideText?: string;
  disabled?: boolean;
  className?: string;
}

export function MobileSignaturePad({
  onSave,
  onClear,
  width = 'auto',
  height = 'auto',
  aspectRatio = 1.5,
  strokeColor = '#000000',
  strokeWidth = 3,
  backgroundColor = 'transparent',
  showControls = true,
  showGuide = true,
  guideText = 'Sign above the line',
  disabled = false,
  className,
}: MobileSignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [isEmpty, setIsEmpty] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 300, height: 200 });
  const lastPoint = useRef<Point | null>(null);

  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const newWidth = width === 'auto' ? containerWidth : width;
        const newHeight = height === 'auto' ? Math.round(containerWidth / aspectRatio) : height;
        setCanvasSize({ width: newWidth, height: newHeight });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    window.addEventListener('orientationchange', updateCanvasSize);
    
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      window.removeEventListener('orientationchange', updateCanvasSize);
    };
  }, [width, height, aspectRatio]);

  const getCanvasContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }, []);

  const getCoordinates = useCallback((e: React.TouchEvent | React.MouseEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
        pressure: (touch as any).force || 0.5,
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        pressure: 0.5,
      };
    }
  }, []);

  const drawLine = useCallback((ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string, width: number) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (to.pressure || 0.5) * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }, []);

  const redrawCanvas = useCallback(() => {
    const ctx = getCanvasContext();
    if (!ctx) return;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    strokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      for (let i = 1; i < stroke.points.length; i++) {
        drawLine(ctx, stroke.points[i - 1], stroke.points[i], stroke.color, stroke.width);
      }
    });
  }, [strokes, getCanvasContext, drawLine]);

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    
    const point = getCoordinates(e);
    if (!point) return;

    hapticPresets.selection();
    setIsDrawing(true);
    setCurrentStroke([point]);
    lastPoint.current = point;
    setIsEmpty(false);
  }, [disabled, getCoordinates]);

  const handleMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();

    const point = getCoordinates(e);
    if (!point || !lastPoint.current) return;

    const ctx = getCanvasContext();
    if (ctx) {
      drawLine(ctx, lastPoint.current, point, strokeColor, strokeWidth);
    }

    setCurrentStroke(prev => [...prev, point]);
    lastPoint.current = point;
  }, [isDrawing, disabled, getCoordinates, getCanvasContext, drawLine, strokeColor, strokeWidth]);

  const handleEnd = useCallback(() => {
    if (!isDrawing) return;

    setIsDrawing(false);
    if (currentStroke.length > 0) {
      setStrokes(prev => [...prev, {
        points: currentStroke,
        color: strokeColor,
        width: strokeWidth,
      }]);
    }
    setCurrentStroke([]);
    lastPoint.current = null;
  }, [isDrawing, currentStroke, strokeColor, strokeWidth]);

  const handleClear = useCallback(() => {
    hapticPresets.buttonPress();
    setStrokes([]);
    setCurrentStroke([]);
    setIsEmpty(true);
    
    const ctx = getCanvasContext();
    if (ctx) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    
    onClear?.();
  }, [getCanvasContext, onClear]);

  const handleUndo = useCallback(() => {
    hapticPresets.buttonPress();
    setStrokes(prev => {
      const newStrokes = prev.slice(0, -1);
      if (newStrokes.length === 0) {
        setIsEmpty(true);
      }
      return newStrokes;
    });
  }, []);

  const handleSave = useCallback(() => {
    hapticPresets.success();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    onSave?.(dataUrl);
  }, [onSave]);

  useEffect(() => {
    redrawCanvas();
  }, [strokes, redrawCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvasSize.width * 2;
    canvas.height = canvasSize.height * 2;
    ctx.scale(2, 2);
    redrawCanvas();
  }, [canvasSize.width, canvasSize.height, redrawCanvas]);

  return (
    <div ref={containerRef} className={cn("flex flex-col gap-3 w-full", className)} data-testid="signature-pad">
      <div 
        className={cn(
          "relative rounded-2xl border-2 border-dashed border-black/20 dark:border-white/20 overflow-hidden touch-none w-full",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        style={{ height: canvasSize.height, backgroundColor }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: canvasSize.height }}
          className="cursor-crosshair"
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          data-testid="signature-canvas"
        />

        {showGuide && (
          <div className="absolute bottom-6 left-4 right-4 pointer-events-none">
            <div className="border-b border-black/30 dark:border-white/30" />
            <p className="text-xs text-black/40 dark:text-white/40 mt-1 text-center">
              {guideText}
            </p>
          </div>
        )}

        {isEmpty && !isDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-black/30 dark:text-white/30">
              <Pen className="h-8 w-8" />
              <span className="text-sm">Draw your signature</span>
            </div>
          </div>
        )}
      </div>

      {showControls && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={isEmpty || disabled}
            className="rounded-full"
            data-testid="button-clear-signature"
          >
            <Eraser className="h-4 w-4 mr-2" />
            Clear
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={strokes.length === 0 || disabled}
            className="rounded-full"
            data-testid="button-undo-signature"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Undo
          </Button>

          <div className="flex-1" />

          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={isEmpty || disabled}
            className="rounded-full bg-black dark:bg-white text-white dark:text-black"
            data-testid="button-save-signature"
          >
            <Check className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

interface SignaturePreviewProps {
  signature: string;
  onEdit?: () => void;
  onDownload?: () => void;
  showActions?: boolean;
  className?: string;
}

export function SignaturePreview({
  signature,
  onEdit,
  onDownload,
  showActions = true,
  className,
}: SignaturePreviewProps) {
  const handleDownload = useCallback(() => {
    hapticPresets.buttonPress();
    const link = document.createElement('a');
    link.download = 'signature.png';
    link.href = signature;
    link.click();
    onDownload?.();
  }, [signature, onDownload]);

  return (
    <div className={cn("flex flex-col gap-3", className)} data-testid="signature-preview">
      <div className="relative rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden bg-white dark:bg-neutral-900 p-4">
        <img 
          src={signature} 
          alt="Signature" 
          className="max-w-full h-auto"
          data-testid="signature-image"
        />
      </div>

      {showActions && (
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                hapticPresets.buttonPress();
                onEdit();
              }}
              className="rounded-full"
              data-testid="button-edit-signature"
            >
              <Pen className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="rounded-full"
            data-testid="button-download-signature"
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      )}
    </div>
  );
}

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signature: string) => void;
  title?: string;
}

export function SignatureModal({
  isOpen,
  onClose,
  onSave,
  title = 'Add Signature',
}: SignatureModalProps) {
  const handleSave = useCallback((signature: string) => {
    onSave(signature);
    onClose();
  }, [onSave, onClose]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="signature-modal"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-neutral-900 rounded-2xl p-4 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-black dark:text-white mb-4">
          {title}
        </h2>
        
        <MobileSignaturePad
          onSave={handleSave}
          onClear={() => {}}
          width={280}
          height={180}
        />
      </motion.div>
    </motion.div>
  );
}
