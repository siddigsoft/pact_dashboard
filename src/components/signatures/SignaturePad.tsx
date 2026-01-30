import { useRef, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eraser, Check, RotateCcw, Download, Pen, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Point {
  x: number;
  y: number;
}

interface SignaturePadProps {
  onSignatureCapture: (signatureData: string, strokeCount: number) => void;
  onClear?: () => void;
  width?: number;
  height?: number;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  disabled?: boolean;
  showControls?: boolean;
  placeholder?: string;
  className?: string;
}

export function SignaturePad({
  onSignatureCapture,
  onClear,
  width = 400,
  height = 200,
  strokeColor = '#1a1a2e',
  strokeWidth = 2,
  backgroundColor = '#ffffff',
  disabled = false,
  showControls = true,
  placeholder = 'Draw your signature here',
  className,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [lastPoint, setLastPoint] = useState<Point | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [width, height, strokeColor, strokeWidth, backgroundColor]);

  const getCanvasPoint = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    
    const point = getCanvasPoint(e);
    setIsDrawing(true);
    setLastPoint(point);
    setHasSignature(true);
  }, [disabled, getCanvasPoint]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPoint) return;

    const currentPoint = getCanvasPoint(e);

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();

    setLastPoint(currentPoint);
  }, [isDrawing, disabled, lastPoint, getCanvasPoint]);

  const stopDrawing = useCallback(() => {
    if (isDrawing) {
      setStrokeCount(prev => prev + 1);
    }
    setIsDrawing(false);
    setLastPoint(null);
  }, [isDrawing]);

  const clearSignature = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    setHasSignature(false);
    setStrokeCount(0);
    onClear?.();
  }, [width, height, backgroundColor, onClear]);

  const captureSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    const signatureData = canvas.toDataURL('image/png');
    onSignatureCapture(signatureData, strokeCount);
  }, [hasSignature, strokeCount, onSignatureCapture]);

  const downloadSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    const link = document.createElement('a');
    link.download = `signature-${new Date().toISOString()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [hasSignature]);

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Pen className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Digital Signature</CardTitle>
          </div>
          {hasSignature && (
            <Badge variant="secondary" className="gap-1">
              <Check className="h-3 w-3" />
              {strokeCount} strokes
            </Badge>
          )}
        </div>
        <CardDescription>{placeholder}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div 
          className={cn(
            'relative border-2 border-dashed rounded-lg overflow-hidden',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair',
            hasSignature ? 'border-primary/50' : 'border-muted-foreground/30'
          )}
        >
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="w-full touch-none"
            style={{ maxWidth: '100%', height: 'auto', aspectRatio: `${width}/${height}` }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            data-testid="canvas-signature-pad"
          />
          {!hasSignature && !disabled && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-muted-foreground/50 text-sm">
                Sign here
              </span>
            </div>
          )}
        </div>

        {showControls && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearSignature}
                disabled={!hasSignature || disabled}
                data-testid="button-clear-signature"
              >
                <Eraser className="h-4 w-4 mr-1" />
                Clear
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadSignature}
                disabled={!hasSignature || disabled}
                data-testid="button-download-signature"
              >
                <Download className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>
            <Button
              type="button"
              onClick={captureSignature}
              disabled={!hasSignature || disabled}
              size="sm"
              data-testid="button-confirm-signature"
            >
              <Check className="h-4 w-4 mr-1" />
              Confirm Signature
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SignaturePad;