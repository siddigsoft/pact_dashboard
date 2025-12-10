import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Zap, 
  ZapOff, 
  Image, 
  History, 
  Copy, 
  ExternalLink, 
  Check,
  QrCode,
  Loader2,
  AlertCircle,
  Flashlight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface ScanResult {
  value: string;
  format: string;
  timestamp: Date;
}

interface MobileQRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: ScanResult) => void;
  title?: string;
  subtitle?: string;
  showFlash?: boolean;
  showGallery?: boolean;
  showHistory?: boolean;
  continuousScan?: boolean;
  scanDelay?: number;
  formats?: string[];
  className?: string;
}

export function MobileQRScanner({
  isOpen,
  onClose,
  onScan,
  title = 'Scan QR Code',
  subtitle = 'Position the code within the frame',
  showFlash = true,
  showGallery = true,
  showHistory = true,
  continuousScan = false,
  scanDelay = 1500,
  formats = ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39'],
  className,
}: MobileQRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout>();

  const [isReady, setIsReady] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const initCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
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
  }, []);

  const toggleFlash = useCallback(async () => {
    if (!streamRef.current) return;

    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities() as any;
      if (capabilities.torch) {
        await (track as any).applyConstraints({
          advanced: [{ torch: !flashOn }],
        });
        setFlashOn(!flashOn);
        hapticPresets.selection();
      }
    } catch (err) {
      console.log('Flash not available');
    }
  }, [flashOn]);

  const simulateScan = useCallback(() => {
    const mockCodes = [
      'https://example.com/product/12345',
      'SITE-001-LOCATION-A',
      '{"type":"visit","id":"abc123"}',
      'https://pact.app/verify/xyz789',
    ];

    const randomCode = mockCodes[Math.floor(Math.random() * mockCodes.length)];
    
    return {
      value: randomCode,
      format: 'qr_code',
      timestamp: new Date(),
    };
  }, []);

  const performScan = useCallback(() => {
    if (!isReady || isScanning) return;

    setIsScanning(true);

    setTimeout(() => {
      if (Math.random() > 0.3) {
        const result = simulateScan();
        hapticPresets.success();
        setLastScan(result);
        setScanHistory(prev => [result, ...prev.slice(0, 9)]);
        onScan(result);

        if (!continuousScan) {
          onClose();
        }
      }
      setIsScanning(false);
    }, 500);
  }, [isReady, isScanning, simulateScan, onScan, continuousScan, onClose]);

  useEffect(() => {
    if (isOpen) {
      initCamera();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [isOpen, initCamera]);

  useEffect(() => {
    if (isReady && continuousScan) {
      scanIntervalRef.current = setInterval(performScan, scanDelay);
      return () => {
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
        }
      };
    }
  }, [isReady, continuousScan, scanDelay, performScan]);

  const handleClose = useCallback(() => {
    hapticPresets.buttonPress();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    onClose();
  }, [onClose]);

  const handleGalleryUpload = useCallback(() => {
    hapticPresets.buttonPress();
    const result = simulateScan();
    hapticPresets.success();
    setLastScan(result);
    setScanHistory(prev => [result, ...prev.slice(0, 9)]);
    onScan(result);
    if (!continuousScan) {
      onClose();
    }
  }, [simulateScan, onScan, continuousScan, onClose]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn("fixed inset-0 z-50 bg-black flex flex-col", className)}
      data-testid="qr-scanner"
    >
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="text-white"
          data-testid="button-close-scanner"
        >
          <X className="h-6 w-6" />
        </Button>

        <div className="flex items-center gap-2">
          {showFlash && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFlash}
              className={cn(
                "text-white",
                flashOn && "bg-white/20"
              )}
              data-testid="button-toggle-flash"
            >
              {flashOn ? (
                <Zap className="h-5 w-5 fill-current" />
              ) : (
                <ZapOff className="h-5 w-5" />
              )}
            </Button>
          )}

          {showHistory && scanHistory.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                hapticPresets.buttonPress();
                setShowHistoryPanel(true);
              }}
              className="text-white"
              data-testid="button-scan-history"
            >
              <History className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          data-testid="scanner-viewfinder"
        />

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <div className="w-64 h-64 border-2 border-white/50 rounded-2xl overflow-hidden">
              <motion.div
                className="absolute left-0 right-0 h-0.5 bg-white"
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
            </div>

            <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
          </div>
        </div>

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-1/4 bg-black/50" />
          <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-black/50" />
          <div className="absolute top-1/4 bottom-1/4 left-0 w-1/6 bg-black/50" />
          <div className="absolute top-1/4 bottom-1/4 right-0 w-1/6 bg-black/50" />
        </div>

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white p-4">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm mb-4">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={initCamera}
                className="rounded-full text-white border-white"
                data-testid="button-retry-scanner"
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        {isScanning && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-12 w-12 text-white animate-spin" />
          </div>
        )}
      </div>

      <div className="bg-black p-4 pb-8">
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-sm text-white/60">{subtitle}</p>
        </div>

        <div className="flex items-center justify-center gap-4">
          {!continuousScan && (
            <Button
              variant="default"
              size="lg"
              onClick={performScan}
              disabled={!isReady || isScanning}
              className="rounded-full bg-white text-black px-8"
              data-testid="button-manual-scan"
            >
              {isScanning ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <QrCode className="h-5 w-5 mr-2" />
                  Scan
                </>
              )}
            </Button>
          )}

          {showGallery && (
            <Button
              variant="ghost"
              size="lg"
              onClick={handleGalleryUpload}
              className="rounded-full text-white"
              data-testid="button-scan-from-gallery"
            >
              <Image className="h-5 w-5 mr-2" />
              From Gallery
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showHistoryPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/90 z-20"
            onClick={() => setShowHistoryPanel(false)}
            data-testid="scan-history-panel"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="absolute bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 rounded-t-3xl max-h-[70vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-black/10 dark:border-white/10">
                <h3 className="text-lg font-semibold text-black dark:text-white">Scan History</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHistoryPanel(false)}
                  data-testid="button-close-history"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="overflow-y-auto max-h-[50vh] divide-y divide-black/5 dark:divide-white/5">
                {scanHistory.map((scan, index) => (
                  <ScanHistoryItem key={index} result={scan} />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface ScanHistoryItemProps {
  result: ScanResult;
}

function ScanHistoryItem({ result }: ScanHistoryItemProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(result.value);
    hapticPresets.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result.value]);

  const isUrl = result.value.startsWith('http://') || result.value.startsWith('https://');

  return (
    <div className="flex items-center gap-3 p-4" data-testid="scan-history-item">
      <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
        <QrCode className="h-5 w-5 text-black dark:text-white" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-black dark:text-white truncate">
          {result.value}
        </p>
        <p className="text-xs text-black/40 dark:text-white/40">
          {result.format} • {result.timestamp.toLocaleTimeString()}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          data-testid="button-copy-scan"
        >
          {copied ? (
            <Check className="h-4 w-4 text-black dark:text-white" />
          ) : (
            <Copy className="h-4 w-4 text-black/60 dark:text-white/60" />
          )}
        </Button>

        {isUrl && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              hapticPresets.buttonPress();
              window.open(result.value, '_blank');
            }}
            data-testid="button-open-url"
          >
            <ExternalLink className="h-4 w-4 text-black/60 dark:text-white/60" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface QRScanButtonProps {
  onScan: (result: ScanResult) => void;
  disabled?: boolean;
  className?: string;
}

export function QRScanButton({
  onScan,
  disabled = false,
  className,
}: QRScanButtonProps) {
  const [showScanner, setShowScanner] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          hapticPresets.buttonPress();
          setShowScanner(true);
        }}
        disabled={disabled}
        className={cn("rounded-full", className)}
        data-testid="button-open-scanner"
      >
        <QrCode className="h-4 w-4 mr-2" />
        Scan QR
      </Button>

      <AnimatePresence>
        {showScanner && (
          <MobileQRScanner
            isOpen={showScanner}
            onClose={() => setShowScanner(false)}
            onScan={onScan}
          />
        )}
      </AnimatePresence>
    </>
  );
}
