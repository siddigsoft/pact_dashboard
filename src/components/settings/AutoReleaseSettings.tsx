import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Bell, RefreshCw, Save, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AutoReleaseSettings as AutoReleaseSettingsType, DEFAULT_AUTO_RELEASE_SETTINGS } from '@/types/postponement';
import { getAutoReleaseSettings, saveAutoReleaseSettings } from '@/utils/confirmationDeadlines';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const HOUR_OPTIONS = [
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours (1 day)' },
  { value: 48, label: '48 hours (2 days)' },
  { value: 72, label: '72 hours (3 days)' },
];

const REMINDER_PRESETS = [
  { value: 'minimal', label: 'Minimal', intervals: [24] },
  { value: 'standard', label: 'Standard', intervals: [48, 24, 12] },
  { value: 'aggressive', label: 'Aggressive', intervals: [72, 48, 24, 12, 6] },
];

export function AutoReleaseSettingsComponent() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AutoReleaseSettingsType>(DEFAULT_AUTO_RELEASE_SETTINGS);
  const [isDirty, setIsDirty] = useState(false);
  const [reminderPreset, setReminderPreset] = useState('standard');

  useEffect(() => {
    const stored = getAutoReleaseSettings();
    setSettings(stored);
    
    const matchedPreset = REMINDER_PRESETS.find(
      p => JSON.stringify(p.intervals) === JSON.stringify(stored.reminderIntervals)
    );
    if (matchedPreset) {
      setReminderPreset(matchedPreset.value);
    } else {
      setReminderPreset('custom');
    }
  }, []);

  const handleSettingChange = <K extends keyof AutoReleaseSettingsType>(
    key: K,
    value: AutoReleaseSettingsType[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleReminderPresetChange = (preset: string) => {
    setReminderPreset(preset);
    const presetConfig = REMINDER_PRESETS.find(p => p.value === preset);
    if (presetConfig) {
      setSettings(prev => ({ ...prev, reminderIntervals: presetConfig.intervals }));
      setIsDirty(true);
    }
  };

  const handleSave = () => {
    saveAutoReleaseSettings(settings);
    setIsDirty(false);
    toast({
      title: 'Settings Saved',
      description: 'Auto-release settings have been updated successfully.',
      variant: 'default'
    });
  };

  const handleReset = () => {
    setSettings(DEFAULT_AUTO_RELEASE_SETTINGS);
    setReminderPreset('standard');
    setIsDirty(true);
    toast({
      title: 'Settings Reset',
      description: 'Settings have been reset to defaults. Click Save to apply.',
      variant: 'default'
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle>Auto-Release Settings</CardTitle>
          </div>
          {isDirty && (
            <Badge variant="secondary" className="animate-pulse">Unsaved Changes</Badge>
          )}
        </div>
        <CardDescription>
          Configure when unclaimed or unconfirmed site visits are automatically released back to the pool
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base">Enable Auto-Release</Label>
            <p className="text-sm text-muted-foreground">
              Automatically release unconfirmed site assignments
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
            data-testid="switch-auto-release-enabled"
          />
        </div>

        <div className="space-y-4 pt-4 border-t">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Confirmation Deadline</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Data collectors must confirm their assignment before this deadline</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={String(settings.confirmationHoursBeforeVisit)}
              onValueChange={(value) => handleSettingChange('confirmationHoursBeforeVisit', Number(value))}
              disabled={!settings.enabled}
            >
              <SelectTrigger data-testid="select-confirmation-deadline">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label} before visit
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Auto-Release Trigger</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">If not confirmed by this time, the site will be released</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Select
              value={String(settings.releaseHoursBeforeVisit)}
              onValueChange={(value) => handleSettingChange('releaseHoursBeforeVisit', Number(value))}
              disabled={!settings.enabled}
            >
              <SelectTrigger data-testid="select-auto-release-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUR_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label} before visit
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {settings.releaseHoursBeforeVisit >= settings.confirmationHoursBeforeVisit && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Warning: Auto-release should trigger after the confirmation deadline
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              <Label>Reminder Frequency</Label>
            </div>
            <Select
              value={reminderPreset}
              onValueChange={handleReminderPresetChange}
              disabled={!settings.enabled}
            >
              <SelectTrigger data-testid="select-reminder-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_PRESETS.map(preset => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label} ({preset.intervals.length} reminder{preset.intervals.length !== 1 ? 's' : ''})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1 mt-2">
              {settings.reminderIntervals.map((hours, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {hours}h before deadline
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleReset}
            data-testid="button-reset-auto-release"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!isDirty}
            data-testid="button-save-auto-release"
          >
            <Save className="h-4 w-4 mr-2" />
            Save Settings
          </Button>
        </div>

        <div className="bg-muted p-3 rounded-md">
          <h4 className="text-sm font-medium mb-2">Current Configuration Summary</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>Data collectors must confirm <strong>{settings.confirmationHoursBeforeVisit} hours</strong> before visit</li>
            <li>Unconfirmed sites released <strong>{settings.releaseHoursBeforeVisit} hours</strong> before visit</li>
            <li>Reminders sent at: {settings.reminderIntervals.map(h => `${h}h`).join(', ')} before deadline</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default AutoReleaseSettingsComponent;
