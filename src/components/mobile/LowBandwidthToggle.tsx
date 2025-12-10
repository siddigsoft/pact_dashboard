import { Signal, SignalZero, Zap, ZapOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLowBandwidth } from '@/contexts/LowBandwidthContext';
import { triggerHaptic } from '@/lib/haptics';

interface LowBandwidthToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function LowBandwidthToggle({ className, showLabel = false }: LowBandwidthToggleProps) {
  const { isLowBandwidthMode, toggleLowBandwidthMode, autoDetected, effectiveType } = useLowBandwidth();

  const handleToggle = () => {
    triggerHaptic('selection');
    toggleLowBandwidthMode();
  };

  return (
    <Button
      variant="ghost"
      size={showLabel ? 'default' : 'icon'}
      className={cn(
        "rounded-full",
        isLowBandwidthMode && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        className
      )}
      onClick={handleToggle}
      data-testid="button-low-bandwidth-toggle"
      aria-label={isLowBandwidthMode ? 'Disable low bandwidth mode' : 'Enable low bandwidth mode'}
      aria-pressed={isLowBandwidthMode}
    >
      {isLowBandwidthMode ? (
        <ZapOff className="h-4 w-4" />
      ) : (
        <Zap className="h-4 w-4" />
      )}
      {showLabel && (
        <span className="ml-2">
          {isLowBandwidthMode ? 'Low Data On' : 'Low Data Off'}
        </span>
      )}
    </Button>
  );
}

export function LowBandwidthIndicator({ className }: { className?: string }) {
  const { isLowBandwidthMode, autoDetected, effectiveType, downlink } = useLowBandwidth();

  if (!isLowBandwidthMode) return null;

  return (
    <div 
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        className
      )}
      data-testid="badge-low-bandwidth"
      aria-label={`Low bandwidth mode active${autoDetected ? ' (auto-detected)' : ''}`}
    >
      <SignalZero className="h-3.5 w-3.5" />
      <span>Low Data</span>
      {autoDetected && (
        <span className="text-[10px] opacity-60">(auto)</span>
      )}
    </div>
  );
}

export function NetworkQualityBadge({ className }: { className?: string }) {
  const { effectiveType, downlink } = useLowBandwidth();

  if (!effectiveType) return null;

  const getQualityColor = () => {
    switch (effectiveType) {
      case 'slow-2g':
      case '2g':
        return 'text-destructive';
      case '3g':
        return 'text-amber-500';
      case '4g':
        return 'text-green-500';
      default:
        return 'text-black/60 dark:text-white/60';
    }
  };

  const getQualityIcon = () => {
    switch (effectiveType) {
      case 'slow-2g':
      case '2g':
        return <SignalZero className="h-3.5 w-3.5" />;
      case '3g':
        return <Signal className="h-3.5 w-3.5" />;
      default:
        return <Signal className="h-3.5 w-3.5" />;
    }
  };

  return (
    <div 
      className={cn(
        "flex items-center gap-1 text-xs",
        getQualityColor(),
        className
      )}
      data-testid="badge-network-quality"
      aria-label={`Network quality: ${effectiveType}`}
    >
      {getQualityIcon()}
      <span className="uppercase font-medium">{effectiveType}</span>
      {downlink && (
        <span className="opacity-60">({downlink.toFixed(1)} Mbps)</span>
      )}
    </div>
  );
}
