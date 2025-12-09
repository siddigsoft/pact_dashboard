import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  Clock, 
  AlertCircle,
  Save,
  Loader2,
  RefreshCw,
  Bell
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DeadlineSettings {
  confirmationDaysBeforeVisit: number;
  autoreleaseDaysBeforeVisit: number;
  enableAutoRelease: boolean;
  reminder24hEnabled: boolean;
  reminder12hEnabled: boolean;
  reminder6hEnabled: boolean;
}

const DEFAULT_SETTINGS: DeadlineSettings = {
  confirmationDaysBeforeVisit: 2,
  autoreleaseDaysBeforeVisit: 1,
  enableAutoRelease: true,
  reminder24hEnabled: true,
  reminder12hEnabled: true,
  reminder6hEnabled: false,
};

export function ConfirmationDeadlineSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<DeadlineSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'confirmation_deadlines')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data?.value) {
        const savedSettings = data.value as Record<string, unknown>;
        setSettings({
          confirmationDaysBeforeVisit: (savedSettings.confirmationDaysBeforeVisit as number) ?? DEFAULT_SETTINGS.confirmationDaysBeforeVisit,
          autoreleaseDaysBeforeVisit: (savedSettings.autoreleaseDaysBeforeVisit as number) ?? DEFAULT_SETTINGS.autoreleaseDaysBeforeVisit,
          enableAutoRelease: (savedSettings.enableAutoRelease as boolean) ?? DEFAULT_SETTINGS.enableAutoRelease,
          reminder24hEnabled: (savedSettings.reminder24hEnabled as boolean) ?? DEFAULT_SETTINGS.reminder24hEnabled,
          reminder12hEnabled: (savedSettings.reminder12hEnabled as boolean) ?? DEFAULT_SETTINGS.reminder12hEnabled,
          reminder6hEnabled: (savedSettings.reminder6hEnabled as boolean) ?? DEFAULT_SETTINGS.reminder6hEnabled,
        });
      }
    } catch (error) {
      console.error('Error fetching deadline settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'confirmation_deadlines',
          value: settings,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'key'
        });

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'Confirmation deadline settings have been updated.',
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Save Failed',
        description: 'Could not save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof DeadlineSettings>(
    key: K, 
    value: DeadlineSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <Card data-testid="card-deadline-settings-loading">
        <CardHeader className="py-3 px-4 pb-2">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Confirmation Deadlines</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-4 px-4">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-deadline-settings">
      <CardHeader className="py-3 px-4 pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-sm font-medium">Confirmation Deadlines</CardTitle>
              <CardDescription className="text-xs">
                Configure when confirmations are due and auto-release triggers
              </CardDescription>
            </div>
          </div>
          {hasChanges && (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
              Unsaved Changes
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-3 px-4 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="confirmationDays" className="text-sm font-medium">
              Confirmation Deadline
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="confirmationDays"
                type="number"
                min={1}
                max={14}
                value={settings.confirmationDaysBeforeVisit}
                onChange={(e) => updateSetting('confirmationDaysBeforeVisit', parseInt(e.target.value) || 2)}
                className="w-20"
                data-testid="input-confirmation-days"
              />
              <span className="text-sm text-muted-foreground">days before scheduled visit</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Team members must confirm their assignment by this deadline.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="autoreleaseDays" className="text-sm font-medium">
              Auto-Release Time
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="autoreleaseDays"
                type="number"
                min={0}
                max={7}
                value={settings.autoreleaseDaysBeforeVisit}
                onChange={(e) => updateSetting('autoreleaseDaysBeforeVisit', parseInt(e.target.value) || 1)}
                className="w-20"
                disabled={!settings.enableAutoRelease}
                data-testid="input-autorelease-days"
              />
              <span className="text-sm text-muted-foreground">days before scheduled visit</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Unconfirmed sites will be released for reassignment at this time.
            </p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/50">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label htmlFor="enableAutoRelease" className="text-sm font-medium cursor-pointer">
                  Enable Auto-Release
                </Label>
                <p className="text-xs text-muted-foreground">
                  Automatically release unconfirmed sites
                </p>
              </div>
            </div>
            <Switch
              id="enableAutoRelease"
              checked={settings.enableAutoRelease}
              onCheckedChange={(checked) => updateSetting('enableAutoRelease', checked)}
              data-testid="switch-enable-autorelease"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Reminder Notifications</Label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded-md border">
              <span className="text-sm">24 hours before deadline</span>
              <Switch
                checked={settings.reminder24hEnabled}
                onCheckedChange={(checked) => updateSetting('reminder24hEnabled', checked)}
                data-testid="switch-reminder-24h"
              />
            </div>
            <div className="flex items-center justify-between p-2 rounded-md border">
              <span className="text-sm">12 hours before deadline</span>
              <Switch
                checked={settings.reminder12hEnabled}
                onCheckedChange={(checked) => updateSetting('reminder12hEnabled', checked)}
                data-testid="switch-reminder-12h"
              />
            </div>
            <div className="flex items-center justify-between p-2 rounded-md border">
              <span className="text-sm">6 hours before deadline</span>
              <Switch
                checked={settings.reminder6hEnabled}
                onCheckedChange={(checked) => updateSetting('reminder6hEnabled', checked)}
                data-testid="switch-reminder-6h"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => {
              setSettings(DEFAULT_SETTINGS);
              setHasChanges(true);
            }}
            disabled={isSaving}
            data-testid="button-reset-defaults"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reset to Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            data-testid="button-save-settings"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ConfirmationDeadlineSettings;
