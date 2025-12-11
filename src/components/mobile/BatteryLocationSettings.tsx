import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Battery, 
  BatteryLow, 
  BatteryMedium, 
  BatteryFull,
  BatteryCharging,
  MapPin,
  Zap,
  Gauge,
  Settings
} from 'lucide-react';
import {
  BatteryStatus,
  BatteryMode,
  getBatteryStatus,
  onBatteryStatusChange,
  getCurrentMode,
  setManualMode,
  getManualMode,
  getModeDescription,
  getCurrentLocationConfig,
  initBatteryMonitor,
} from '@/lib/battery-location';
import { hapticFeedback } from '@/lib/enhanced-haptics';

interface BatteryLocationSettingsProps {
  onConfigChange?: (mode: BatteryMode) => void;
}

export function BatteryLocationSettings({ onConfigChange }: BatteryLocationSettingsProps) {
  const [batteryStatus, setBatteryStatus] = useState<BatteryStatus>(getBatteryStatus());
  const [currentMode, setCurrentMode] = useState<BatteryMode>(getCurrentMode());
  const [manualMode, setManualModeState] = useState<BatteryMode | null>(getManualMode());
  const [isInitialized, setIsInitialized] = useState(false);
  const [initErrorMessage, setInitErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    initBatteryMonitor().then((result) => {
      setIsInitialized(result.success);
      if (!result.success) {
        setInitErrorMessage(result.error || 'Failed to initialize battery monitor');
      }
    });

    const unsubscribe = onBatteryStatusChange((status) => {
      setBatteryStatus(status);
      setCurrentMode(getCurrentMode());
    });

    return unsubscribe;
  }, []);

  const handleModeChange = (mode: BatteryMode | null) => {
    hapticFeedback.ui.toggle();
    setManualMode(mode);
    setManualModeState(mode);
    const newMode = mode || getCurrentMode();
    setCurrentMode(newMode);
    onConfigChange?.(newMode);
  };

  const getBatteryIcon = () => {
    if (batteryStatus.isCharging) {
      return <BatteryCharging className="h-5 w-5 text-green-500" />;
    }
    if (batteryStatus.level >= 80) {
      return <BatteryFull className="h-5 w-5 text-green-500" />;
    }
    if (batteryStatus.level >= 40) {
      return <BatteryMedium className="h-5 w-5 text-amber-500" />;
    }
    if (batteryStatus.level >= 20) {
      return <BatteryLow className="h-5 w-5 text-orange-500" />;
    }
    return <Battery className="h-5 w-5 text-destructive" />;
  };

  const modeDescription = getModeDescription(currentMode);
  const config = getCurrentLocationConfig();

  const modes: BatteryMode[] = ['high_accuracy', 'balanced', 'power_saver', 'ultra_saver'];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location Settings
          </div>
          {getBatteryIcon()}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getBatteryIcon()}
            <span 
              className="font-medium"
              data-testid="text-battery-level"
            >
              {batteryStatus.level}%
            </span>
            {batteryStatus.isCharging && (
              <Badge variant="outline" className="text-xs">
                <Zap className="h-3 w-3 mr-1" />
                Charging
              </Badge>
            )}
          </div>
          <Badge 
            variant={manualMode ? 'default' : 'secondary'}
            data-testid="badge-mode-type"
          >
            {manualMode ? 'Manual' : 'Auto'}
          </Badge>
        </div>

        <Separator />

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Current Mode</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleModeChange(null)}
              disabled={!manualMode}
              data-testid="button-auto-mode"
              aria-label="Switch to automatic mode"
            >
              <Settings className="h-4 w-4 mr-1" />
              Auto
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {modes.map((mode) => {
              const desc = getModeDescription(mode);
              const isActive = currentMode === mode;

              return (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  className={`p-3 rounded-md border text-left transition-colors ${
                    isActive
                      ? 'border-foreground bg-accent'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                  data-testid={`button-mode-${mode}`}
                  aria-label={`Select ${desc.name} mode`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Gauge className="h-4 w-4" />
                    <span className="text-sm font-medium">{desc.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        desc.batteryImpact === 'high' 
                          ? 'text-destructive' 
                          : desc.batteryImpact === 'medium'
                            ? 'text-amber-500'
                            : 'text-green-500'
                      }`}
                    >
                      {desc.batteryImpact}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Current Settings</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">Accuracy</span>
            <span>{config.enableHighAccuracy ? 'High' : 'Low'}</span>

            <span className="text-muted-foreground">Update Interval</span>
            <span>{config.minInterval / 1000}s</span>

            <span className="text-muted-foreground">Min Movement</span>
            <span>{config.minDisplacement}m</span>

            <span className="text-muted-foreground">Timeout</span>
            <span>{config.timeout / 1000}s</span>
          </div>
        </div>

        <div 
          className="text-xs text-muted-foreground"
          data-testid="text-mode-description"
        >
          {modeDescription.description}
        </div>

        {initErrorMessage && (
          <div 
            className="text-xs text-destructive p-2 bg-destructive/10 rounded-md"
            data-testid="text-battery-init-error"
            role="alert"
          >
            {initErrorMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface BatteryIndicatorProps {
  showLevel?: boolean;
  size?: 'sm' | 'md';
}

export function BatteryIndicator({ showLevel = true, size = 'md' }: BatteryIndicatorProps) {
  const [batteryStatus, setBatteryStatus] = useState<BatteryStatus>(getBatteryStatus());

  useEffect(() => {
    const unsubscribe = onBatteryStatusChange(setBatteryStatus);
    return unsubscribe;
  }, []);

  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  const getBatteryIcon = () => {
    if (batteryStatus.isCharging) {
      return <BatteryCharging className={`${iconSize} text-green-500`} />;
    }
    if (batteryStatus.level >= 80) {
      return <BatteryFull className={`${iconSize} text-green-500`} />;
    }
    if (batteryStatus.level >= 40) {
      return <BatteryMedium className={`${iconSize} text-amber-500`} />;
    }
    if (batteryStatus.level >= 20) {
      return <BatteryLow className={`${iconSize} text-orange-500`} />;
    }
    return <Battery className={`${iconSize} text-destructive`} />;
  };

  return (
    <div 
      className="flex items-center gap-1"
      data-testid="indicator-battery"
      aria-label={`Battery ${batteryStatus.level}%${batteryStatus.isCharging ? ', charging' : ''}`}
    >
      {getBatteryIcon()}
      {showLevel && (
        <span className={`${size === 'sm' ? 'text-xs' : 'text-sm'} tabular-nums`}>
          {batteryStatus.level}%
        </span>
      )}
    </div>
  );
}
