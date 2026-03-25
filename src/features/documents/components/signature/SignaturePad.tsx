/**
 * SignaturePad Component
 * Canvas-based signature drawing with mobile touch support
 * Supports drawing, image upload, and saved signature selection
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Pen, 
  Upload, 
  Trash2, 
  Check, 
  RotateCcw,
  Save,
  Star,
  StarOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HandwritingSignature } from '@/types/signature';

interface SignaturePadProps {
  onSignatureComplete: (signatureData: string, type: 'drawn' | 'uploaded' | 'saved') => void;
  onCancel?: () => void;
  savedSignatures?: HandwritingSignature[];
  showSavedSignatures?: boolean;
  title?: string;
  description?: string;
  className?: string;
}

export function SignaturePad({
  onSignatureComplete,
  onCancel,
  savedSignatures = [],
  showSavedSignatures = true,
  title = 'Sign Here',
  description = 'Draw your signature or upload an image',
  className,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedSavedSignature, setSelectedSavedSignature] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('draw');

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = rect.width * dpr;
      canvas.height = 200 * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = '200px';
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const getCoordinates = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
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

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
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

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
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

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setStrokeCount(0);
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      console.error('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setUploadedImage(result);
      setSelectedSavedSignature(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSelectSavedSignature = useCallback((signature: HandwritingSignature) => {
    setSelectedSavedSignature(signature.signatureImage);
    setUploadedImage(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (activeTab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasSignature) return;
      
      const signatureData = canvas.toDataURL('image/png');
      onSignatureComplete(signatureData, 'drawn');
    } else if (activeTab === 'upload' && uploadedImage) {
      onSignatureComplete(uploadedImage, 'uploaded');
    } else if (activeTab === 'saved' && selectedSavedSignature) {
      onSignatureComplete(selectedSavedSignature, 'saved');
    }
  }, [activeTab, hasSignature, uploadedImage, selectedSavedSignature, onSignatureComplete]);

  const canConfirm = () => {
    if (activeTab === 'draw') return hasSignature;
    if (activeTab === 'upload') return !!uploadedImage;
    if (activeTab === 'saved') return !!selectedSavedSignature;
    return false;
  };

  return (
    <Card className={cn('w-full', className)} data-testid="card-signature-pad">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Pen className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="draw" className="flex items-center gap-1" data-testid="tab-draw">
              <Pen className="h-4 w-4" />
              <span className="hidden sm:inline">Draw</span>
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-1" data-testid="tab-upload">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload</span>
            </TabsTrigger>
            {showSavedSignatures && savedSignatures.length > 0 && (
              <TabsTrigger value="saved" className="flex items-center gap-1" data-testid="tab-saved">
                <Star className="h-4 w-4" />
                <span className="hidden sm:inline">Saved</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="draw" className="mt-4">
            <div ref={containerRef} className="w-full">
              <div className="relative border rounded-md bg-white dark:bg-gray-900 touch-none">
                <canvas
                  ref={canvasRef}
                  className="w-full cursor-crosshair"
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
                    <span className="text-muted-foreground text-sm">Draw your signature here</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">
                  {strokeCount > 0 && `${strokeCount} stroke${strokeCount > 1 ? 's' : ''}`}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearCanvas}
                  disabled={!hasSignature}
                  data-testid="button-clear-signature"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-md p-6 text-center">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="signature-upload"
                  data-testid="input-signature-upload"
                />
                <Label 
                  htmlFor="signature-upload" 
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click to upload your signature image
                  </span>
                  <span className="text-xs text-muted-foreground">
                    PNG, JPG, or GIF (max 2MB)
                  </span>
                </Label>
              </div>
              
              {uploadedImage && (
                <div className="relative border rounded-md p-4 bg-white dark:bg-gray-900">
                  <img 
                    src={uploadedImage} 
                    alt="Uploaded signature" 
                    className="max-h-[150px] mx-auto object-contain"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => setUploadedImage(null)}
                    data-testid="button-remove-uploaded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {showSavedSignatures && savedSignatures.length > 0 && (
            <TabsContent value="saved" className="mt-4">
              <ScrollArea className="h-[200px]">
                <div className="grid grid-cols-2 gap-3">
                  {savedSignatures.map((sig) => (
                    <div
                      key={sig.id}
                      onClick={() => handleSelectSavedSignature(sig)}
                      className={cn(
                        'relative border rounded-md p-3 cursor-pointer transition-all',
                        'hover:border-primary hover:bg-muted/50',
                        selectedSavedSignature === sig.signatureImage && 'border-primary bg-primary/5'
                      )}
                      data-testid={`saved-signature-${sig.id}`}
                    >
                      <img
                        src={sig.signatureImage}
                        alt="Saved signature"
                        className="h-[60px] w-full object-contain"
                      />
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant="outline" className="text-xs">
                          {sig.signatureType === 'drawn' ? 'Drawn' : 'Uploaded'}
                        </Badge>
                        {sig.isDefault && (
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                        )}
                      </div>
                      {selectedSavedSignature === sig.signatureImage && (
                        <div className="absolute top-1 right-1">
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          {onCancel && (
            <Button variant="outline" onClick={onCancel} data-testid="button-cancel-signature">
              Cancel
            </Button>
          )}
          <Button 
            onClick={handleConfirm}
            disabled={!canConfirm()}
            data-testid="button-confirm-signature"
          >
            <Check className="h-4 w-4 mr-1" />
            Confirm Signature
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SignaturePad;
