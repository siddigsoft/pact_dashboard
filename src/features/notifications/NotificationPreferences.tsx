import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Bell, Mail, Smartphone, Volume2, VolumeX, Moon, Clock, Save, RotateCcw, DollarSign, CheckCircle2, ClipboardList, Settings, Wallet, MessageSquare, Phone, Shield } from 'lucide-react';
import { useDoNotDisturb } from '@/features/calls/hooks/use-do-not-disturb';
import { useNotificationSound } from '@/features/notifications/hooks/use-notification-sound';
import { toast } from '@/hooks/toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface CategoryPreference {
  inApp: boolean;
  email: boolean;
  push: boolean;
  sound: boolean;
}

interface NotificationPreferencesState {
  categories: Record<string, CategoryPreference>;
  digestFrequency: 'none' | 'daily' | 'weekly';
  cleanupThresholdDays: number;
}

const STORAGE_KEY = 'pact-notification-preferences';

const CATEGORIES = [
  { key: 'financial', label: 'Financial', labelAr: 'مالي', icon: DollarSign, color: 'text-green-600' },
  { key: 'approvals', label: 'Approvals', labelAr: 'الموافقات', icon: CheckCircle2, color: 'text-blue-600' },
  { key: 'assignments', label: 'Assignments', labelAr: 'التكليفات', icon: ClipboardList, color: 'text-purple-600' },
  { key: 'system', label: 'System', labelAr: 'النظام', icon: Settings, color: 'text-gray-600' },
  { key: 'wallet', label: 'Wallet', labelAr: 'المحفظة', icon: Wallet, color: 'text-amber-600' },
  { key: 'messages', label: 'Messages', labelAr: 'الرسائل', icon: MessageSquare, color: 'text-indigo-600' },
  { key: 'calls', label: 'Calls', labelAr: 'المكالمات', icon: Phone, color: 'text-teal-600' },
  { key: 'signatures', label: 'Signatures', labelAr: 'التوقيعات', icon: Shield, color: 'text-orange-600' },
];

const DEFAULT_PREFERENCES: NotificationPreferencesState = {
  categories: Object.fromEntries(
    CATEGORIES.map(c => [c.key, { inApp: true, email: true, push: true, sound: true }])
  ),
  digestFrequency: 'daily',
  cleanupThresholdDays: 30,
};

const loadPreferences = (): NotificationPreferencesState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_PREFERENCES;
};

export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState<NotificationPreferencesState>(loadPreferences);
  const [hasChanges, setHasChanges] = useState(false);
  const { isDND, toggleDND, schedule, updateSchedule } = useDoNotDisturb();
  const { soundEnabled, toggleSound } = useNotificationSound();

  const updateCategory = (category: string, field: keyof CategoryPreference, value: boolean) => {
    setPrefs(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [category]: { ...prev.categories[category], [field]: value },
      },
    }));
    setHasChanges(true);
  };

  const savePreferences = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      setHasChanges(false);
      toast({ title: 'Preferences saved', description: 'Your notification preferences have been updated.', variant: 'success' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save preferences.', variant: 'destructive' });
    }
  };

  const resetPreferences = () => {
    setPrefs(DEFAULT_PREFERENCES);
    setHasChanges(true);
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto" data-testid="notification-preferences-page">
      <PageInfoBanner
        title="Notification Preferences"
        description="Customize how and when you receive notifications"
        descriptionAr="تخصيص كيفية ووقت تلقي الإشعارات"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            Do Not Disturb
          </CardTitle>
          <CardDescription>Mute all notifications during focused work</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Do Not Disturb</Label>
              <p className="text-xs text-muted-foreground">Silence all notification sounds and popups</p>
            </div>
            <Switch checked={isDND} onCheckedChange={toggleDND} data-testid="switch-dnd" />
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Scheduled DND
            </Label>
            <div className="flex items-center gap-4">
              <Switch
                checked={schedule.enabled}
                onCheckedChange={(checked) => updateSchedule({ enabled: checked })}
                data-testid="switch-dnd-schedule"
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Select
                  value={String(schedule.startHour)}
                  onValueChange={(v) => updateSchedule({ startHour: parseInt(v) })}
                >
                  <SelectTrigger className="w-20 h-8" data-testid="select-dnd-start">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>to</span>
                <Select
                  value={String(schedule.endHour)}
                  onValueChange={(v) => updateSchedule({ endHour: parseInt(v) })}
                >
                  <SelectTrigger className="w-20 h-8" data-testid="select-dnd-end">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => (
                      <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            Sound Settings
          </CardTitle>
          <CardDescription>Control notification sounds</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Notification Sounds</Label>
              <p className="text-xs text-muted-foreground">Play a sound when new notifications arrive</p>
            </div>
            <Switch checked={soundEnabled} onCheckedChange={toggleSound} data-testid="switch-sound" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Category Preferences
          </CardTitle>
          <CardDescription>Choose how you receive notifications for each category</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 pr-4 font-medium">Category</th>
                  <th className="text-center py-3 px-3 font-medium">
                    <div className="flex flex-col items-center gap-1">
                      <Bell className="h-4 w-4" />
                      <span className="text-xs">In-App</span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium">
                    <div className="flex flex-col items-center gap-1">
                      <Mail className="h-4 w-4" />
                      <span className="text-xs">Email</span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium">
                    <div className="flex flex-col items-center gap-1">
                      <Smartphone className="h-4 w-4" />
                      <span className="text-xs">Push</span>
                    </div>
                  </th>
                  <th className="text-center py-3 px-3 font-medium">
                    <div className="flex flex-col items-center gap-1">
                      <Volume2 className="h-4 w-4" />
                      <span className="text-xs">Sound</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const pref = prefs.categories[cat.key] || DEFAULT_PREFERENCES.categories[cat.key];
                  return (
                    <tr key={cat.key} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${cat.color}`} />
                          <span className="font-medium">{cat.label}</span>
                          <span className="text-xs text-muted-foreground hidden sm:inline">({cat.labelAr})</span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-3">
                        <Switch
                          checked={pref.inApp}
                          onCheckedChange={(v) => updateCategory(cat.key, 'inApp', v)}
                          data-testid={`switch-${cat.key}-inapp`}
                        />
                      </td>
                      <td className="text-center py-3 px-3">
                        <Switch
                          checked={pref.email}
                          onCheckedChange={(v) => updateCategory(cat.key, 'email', v)}
                          data-testid={`switch-${cat.key}-email`}
                        />
                      </td>
                      <td className="text-center py-3 px-3">
                        <Switch
                          checked={pref.push}
                          onCheckedChange={(v) => updateCategory(cat.key, 'push', v)}
                          data-testid={`switch-${cat.key}-push`}
                        />
                      </td>
                      <td className="text-center py-3 px-3">
                        <Switch
                          checked={pref.sound}
                          onCheckedChange={(v) => updateCategory(cat.key, 'sound', v)}
                          data-testid={`switch-${cat.key}-sound`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Digest & Cleanup
          </CardTitle>
          <CardDescription>Email digest and auto-cleanup settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Email Digest Frequency</Label>
              <p className="text-xs text-muted-foreground">Receive a summary of unread notifications</p>
            </div>
            <Select
              value={prefs.digestFrequency}
              onValueChange={(v) => { setPrefs(p => ({ ...p, digestFrequency: v as any })); setHasChanges(true); }}
            >
              <SelectTrigger className="w-32" data-testid="select-digest-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto-Cleanup After</Label>
              <p className="text-xs text-muted-foreground">Automatically remove read notifications after this period</p>
            </div>
            <Select
              value={String(prefs.cleanupThresholdDays)}
              onValueChange={(v) => { setPrefs(p => ({ ...p, cleanupThresholdDays: parseInt(v) })); setHasChanges(true); }}
            >
              <SelectTrigger className="w-32" data-testid="select-cleanup-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={resetPreferences} data-testid="button-reset-preferences">
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
        <Button onClick={savePreferences} disabled={!hasChanges} data-testid="button-save-preferences">
          <Save className="h-4 w-4 mr-2" />
          Save Preferences
        </Button>
      </div>
    </div>
  );
}
