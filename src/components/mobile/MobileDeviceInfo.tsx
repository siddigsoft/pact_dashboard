import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone,
  Monitor,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  Globe,
  Clock,
  Shield,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import {
  getDeviceFingerprint,
  getDeviceAnalyticsSummary,
  type DeviceFingerprint,
} from '@/lib/deviceFingerprint';

interface MobileDeviceInfoProps {
  showFullDetails?: boolean;
  compact?: boolean;
  className?: string;
}

export function MobileDeviceInfo({
  showFullDetails = true,
  compact = false,
  className,
}: MobileDeviceInfoProps) {
  const [fingerprint, setFingerprint] = useState<DeviceFingerprint | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isKnown, setIsKnown] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const loadDeviceInfo = async () => {
    setIsLoading(true);
    try {
      const summary = await getDeviceAnalyticsSummary();
      setFingerprint(summary.currentDevice);
      setIsKnown(summary.isCurrentDeviceKnown);
      setKnownCount(summary.knownDeviceCount);
    } catch (error) {
      console.error('Failed to get device info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDeviceInfo();
  }, []);

  const handleRefresh = () => {
    hapticPresets.buttonPress();
    loadDeviceInfo();
  };

  const handleCopyId = async () => {
    if (!fingerprint) return;
    hapticPresets.selection();
    try {
      await navigator.clipboard.writeText(fingerprint.deviceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  };

  const getPlatformIcon = () => {
    if (!fingerprint) return Smartphone;
    switch (fingerprint.platform) {
      case 'android':
      case 'ios':
        return Smartphone;
      default:
        return Monitor;
    }
  };

  const formatBytes = (bytes: number | undefined) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <Card className={cn("p-4", className)}>
        <div className="flex items-center gap-3 animate-pulse">
          <div className="w-10 h-10 bg-black/10 dark:bg-white/10 rounded-full" />
          <div className="flex-1">
            <div className="h-4 w-24 bg-black/10 dark:bg-white/10 rounded mb-2" />
            <div className="h-3 w-32 bg-black/10 dark:bg-white/10 rounded" />
          </div>
        </div>
      </Card>
    );
  }

  if (!fingerprint) return null;

  const PlatformIcon = getPlatformIcon();

  if (compact) {
    return (
      <Card className={cn("p-3", className)} data-testid="device-info-compact">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center">
            <PlatformIcon className="w-5 h-5 text-black dark:text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-black dark:text-white truncate">
              {fingerprint.model || 'Unknown Device'}
            </p>
            <p className="text-xs text-black/60 dark:text-white/60">
              {fingerprint.platform} {fingerprint.osVersion}
            </p>
          </div>
          {isKnown ? (
            <Badge variant="secondary" className="text-xs">
              <ShieldCheck className="w-3 h-3 mr-1" />
              Trusted
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              <Shield className="w-3 h-3 mr-1" />
              New
            </Badge>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)} data-testid="device-info-full">
      <div className="p-4 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-black dark:bg-white rounded-2xl flex items-center justify-center">
              <PlatformIcon className="w-6 h-6 text-white dark:text-black" />
            </div>
            <div>
              <p className="text-base font-semibold text-black dark:text-white">
                {fingerprint.model || 'Unknown Device'}
              </p>
              <p className="text-sm text-black/60 dark:text-white/60">
                {fingerprint.manufacturer || fingerprint.platform}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            data-testid="button-refresh-device"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-black/60 dark:text-white/60">Device ID</span>
          <button
            onClick={handleCopyId}
            className="flex items-center gap-2 text-sm font-mono text-black dark:text-white"
            data-testid="button-copy-device-id"
          >
            {fingerprint.deviceId.substring(0, 12)}...
            {copied ? (
              <Check className="w-3 h-3 text-black dark:text-white" data-testid="icon-copy-success" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-black/60 dark:text-white/60">Trust Status</span>
          {isKnown ? (
            <Badge className="bg-black dark:bg-white text-white dark:text-black" data-testid="badge-trusted">
              <ShieldCheck className="w-3 h-3 mr-1" />
              Trusted Device
            </Badge>
          ) : (
            <Badge variant="outline" data-testid="badge-new-device">
              <Shield className="w-3 h-3 mr-1" />
              New Device
            </Badge>
          )}
        </div>

        {showFullDetails && (
          <>
            <button
              onClick={() => {
                hapticPresets.selection();
                setShowDetails(!showDetails);
              }}
              className="flex items-center justify-between w-full py-2"
              data-testid="button-toggle-details"
            >
              <span className="text-sm font-medium text-black dark:text-white">
                Technical Details
              </span>
              <motion.div
                animate={{ rotate: showDetails ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="w-4 h-4 text-black/40 dark:text-white/40" />
              </motion.div>
            </button>

            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-3 overflow-hidden"
                >
                  <InfoRow
                    icon={<Cpu className="w-4 h-4" />}
                    label="Platform"
                    value={`${fingerprint.platform} ${fingerprint.osVersion}`}
                  />
                  <InfoRow
                    icon={<HardDrive className="w-4 h-4" />}
                    label="Memory"
                    value={formatBytes(fingerprint.memoryUsed)}
                  />
                  <InfoRow
                    icon={fingerprint.networkType !== 'none' ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                    label="Network"
                    value={fingerprint.networkType}
                  />
                  <InfoRow
                    icon={<Monitor className="w-4 h-4" />}
                    label="Screen"
                    value={`${fingerprint.screenWidth}x${fingerprint.screenHeight} @${fingerprint.pixelRatio}x`}
                  />
                  <InfoRow
                    icon={<Globe className="w-4 h-4" />}
                    label="Language"
                    value={fingerprint.language}
                  />
                  <InfoRow
                    icon={<Clock className="w-4 h-4" />}
                    label="Timezone"
                    value={fingerprint.timezone}
                  />
                  {fingerprint.isVirtual && (
                    <div className="flex items-center gap-2 p-2 bg-black/10 dark:bg-white/10 rounded-lg" data-testid="warning-virtual-device">
                      <Shield className="w-4 h-4 text-black/60 dark:text-white/60" />
                      <span className="text-xs text-black/60 dark:text-white/60">
                        Virtual device detected
                      </span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {knownCount > 0 && (
          <p className="text-xs text-black/40 dark:text-white/40 text-center pt-2">
            {knownCount} trusted device{knownCount !== 1 ? 's' : ''} registered
          </p>
        )}
      </div>
    </Card>
  );
}

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function InfoRow({ icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-black/40 dark:text-white/40">{icon}</div>
      <div className="flex-1 flex items-center justify-between">
        <span className="text-sm text-black/60 dark:text-white/60">{label}</span>
        <span className="text-sm font-medium text-black dark:text-white">{value}</span>
      </div>
    </div>
  );
}

interface DeviceTrustBadgeProps {
  className?: string;
}

export function DeviceTrustBadge({ className }: DeviceTrustBadgeProps) {
  const [isKnown, setIsKnown] = useState(false);

  useEffect(() => {
    getDeviceAnalyticsSummary().then(summary => {
      setIsKnown(summary.isCurrentDeviceKnown);
    });
  }, []);

  return (
    <Badge
      variant={isKnown ? 'default' : 'outline'}
      className={cn(
        isKnown && 'bg-black dark:bg-white text-white dark:text-black',
        className
      )}
      data-testid="device-trust-badge"
    >
      {isKnown ? (
        <>
          <ShieldCheck className="w-3 h-3 mr-1" />
          Trusted
        </>
      ) : (
        <>
          <Shield className="w-3 h-3 mr-1" />
          New Device
        </>
      )}
    </Badge>
  );
}
