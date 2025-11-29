import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AnimatedSwitch } from "@/components/ui/animated-switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useSettings } from "@/context/settings/SettingsContext";
import { useToast } from "@/hooks/use-toast";
import { 
  Bell, 
  BellRing, 
  Volume2, 
  VolumeX,
  Vibrate,
  Moon,
  Clock,
  Smartphone,
  Mail,
  MessageSquare,
  DollarSign,
  Users,
  AlertTriangle,
  Shield,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Zap,
  Globe
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingRowProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'premium';
  testId: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

function SettingRow({ 
  icon, 
  iconBg, 
  title, 
  description, 
  checked, 
  onCheckedChange, 
  disabled,
  variant = 'default',
  testId,
  badge,
  badgeVariant = 'secondary'
}: SettingRowProps) {
  return (
    <div className={cn(
      "flex items-center justify-between p-4 rounded-xl transition-all duration-200",
      "bg-gradient-to-r from-muted/30 to-muted/10 dark:from-muted/20 dark:to-muted/5",
      disabled && "opacity-60"
    )}>
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          "shadow-sm transition-transform duration-200",
          checked && "scale-105",
          iconBg
        )}>
          {icon}
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold cursor-pointer">{title}</Label>
            {badge && (
              <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0">
                {badge}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[250px] sm:max-w-none">
            {description}
          </p>
        </div>
      </div>
      <AnimatedSwitch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        variant={variant}
        data-testid={testId}
        aria-label={title}
      />
    </div>
  );
}

interface CategoryRowProps {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  testId: string;
}

function CategoryRow({ 
  icon, 
  iconColor, 
  title, 
  description, 
  checked, 
  onCheckedChange, 
  disabled,
  testId
}: CategoryRowProps) {
  return (
    <div className={cn(
      "flex items-center justify-between py-3 px-4 rounded-lg transition-all duration-200",
      "hover:bg-muted/40 dark:hover:bg-muted/20",
      disabled && "opacity-50"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", iconColor)}>
          {icon}
        </div>
        <div className="space-y-0">
          <Label className="text-sm font-medium cursor-pointer">{title}</Label>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <AnimatedSwitch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        variant="success"
        data-testid={testId}
        aria-label={title}
      />
    </div>
  );
}

export function NotificationSettings() {
  const { toast } = useToast();
  const { notificationSettings, updateNotificationSettings } = useSettings();
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [isRequestingPush, setIsRequestingPush] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  const handleMasterToggle = (enabled: boolean) => {
    updateNotificationSettings({ ...notificationSettings, enabled });
    toast({
      title: enabled ? "Notifications enabled" : "Notifications disabled",
      description: enabled 
        ? "You will now receive notifications" 
        : "All notifications have been turned off",
    });
  };

  const handleBrowserPushToggle = async (checked: boolean) => {
    if (checked && 'Notification' in window) {
      setIsRequestingPush(true);
      try {
        const permission = await Notification.requestPermission();
        setPushPermission(permission);
        if (permission !== 'granted') {
          toast({
            title: "Permission required",
            description: "Please allow notifications in your browser settings to receive push notifications",
            variant: "destructive",
          });
          setIsRequestingPush(false);
          return;
        }
        
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready;
          console.log('Service worker ready for push:', registration);
        }
      } catch (error) {
        console.error('Push permission error:', error);
        toast({
          title: "Error",
          description: "Failed to enable push notifications",
          variant: "destructive",
        });
        setIsRequestingPush(false);
        return;
      }
      setIsRequestingPush(false);
    }
    updateNotificationSettings({ ...notificationSettings, browserPush: checked });
  };

  const handleEmailToggle = (checked: boolean) => {
    updateNotificationSettings({ ...notificationSettings, email: checked });
  };

  const handleSoundToggle = (checked: boolean) => {
    updateNotificationSettings({ ...notificationSettings, sound: checked });
    if (checked) {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    }
  };

  const handleVibrationToggle = (checked: boolean) => {
    updateNotificationSettings({
      ...notificationSettings,
      vibration: checked
    });
    if (checked && 'vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  };

  const handleQuietHoursToggle = (checked: boolean) => {
    updateNotificationSettings({
      ...notificationSettings,
      quietHours: {
        ...notificationSettings.quietHours,
        enabled: checked
      }
    });
  };

  const handleQuietHoursChange = (field: 'startHour' | 'endHour', value: number) => {
    updateNotificationSettings({
      ...notificationSettings,
      quietHours: {
        ...notificationSettings.quietHours,
        [field]: value
      }
    });
  };

  const handleCategoryToggle = (category: string, checked: boolean) => {
    updateNotificationSettings({
      ...notificationSettings,
      categories: {
        ...notificationSettings.categories,
        [category]: checked
      }
    });
  };

  const handleFrequencyChange = (value: string) => {
    updateNotificationSettings({
      ...notificationSettings,
      frequency: value as 'instant' | 'hourly' | 'daily'
    });
  };

  const handleAutoDeleteChange = (value: string) => {
    updateNotificationSettings({
      ...notificationSettings,
      autoDeleteDays: value === 'never' ? null : parseInt(value)
    });
  };

  const formatHour = (hour: number) => {
    if (hour === 0) return '12:00 AM';
    if (hour < 12) return `${hour}:00 AM`;
    if (hour === 12) return '12:00 PM';
    return `${hour - 12}:00 PM`;
  };

  const isEnabled = notificationSettings.enabled;

  return (
    <div className="space-y-6">
      {/* Master Control */}
      <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-primary/5 via-background to-primary/10 dark:from-primary/10 dark:via-background dark:to-primary/5">
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300",
                isEnabled 
                  ? "bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25" 
                  : "bg-muted"
              )}>
                {isEnabled ? (
                  <BellRing className="w-7 h-7 text-primary-foreground animate-pulse" />
                ) : (
                  <Bell className="w-7 h-7 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold">Notifications</h3>
                <p className="text-sm text-muted-foreground">
                  {isEnabled ? "You're all set to receive updates" : "Turn on to stay informed"}
                </p>
              </div>
            </div>
            <AnimatedSwitch
              checked={isEnabled}
              onCheckedChange={handleMasterToggle}
              variant="premium"
              data-testid="switch-master-notifications"
              aria-label="Enable notifications"
            />
          </div>
          {isEnabled && (
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Notifications are active</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <Card className="overflow-hidden border shadow-sm">
        <CardHeader className="pb-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-sm">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">Push Notifications</CardTitle>
              <CardDescription className="text-xs">
                Receive alerts even when the app is closed
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <SettingRow
            icon={<Globe className="w-5 h-5 text-white" />}
            iconBg="bg-gradient-to-br from-blue-500 to-blue-600"
            title="Browser Push"
            description="Get notifications in your browser, even when this tab is closed"
            checked={notificationSettings.browserPush ?? false}
            onCheckedChange={handleBrowserPushToggle}
            disabled={!isEnabled || isRequestingPush}
            variant="success"
            testId="switch-browser-push"
            badge={pushPermission === 'granted' ? 'Active' : pushPermission === 'denied' ? 'Blocked' : undefined}
            badgeVariant={pushPermission === 'granted' ? 'default' : 'destructive'}
          />
          <SettingRow
            icon={<Mail className="w-5 h-5 text-white" />}
            iconBg="bg-gradient-to-br from-violet-500 to-purple-600"
            title="Email Notifications"
            description="Receive important updates via email"
            checked={notificationSettings.email ?? false}
            onCheckedChange={handleEmailToggle}
            disabled={!isEnabled}
            testId="switch-email-notifications"
          />
        </CardContent>
      </Card>

      {/* Sound & Vibration */}
      <Card className="overflow-hidden border shadow-sm">
        <CardHeader className="pb-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-sm">
              <Volume2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">Sound & Vibration</CardTitle>
              <CardDescription className="text-xs">
                Customize how you're alerted
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <SettingRow
            icon={notificationSettings.sound ? <Volume2 className="w-5 h-5 text-white" /> : <VolumeX className="w-5 h-5 text-white" />}
            iconBg={notificationSettings.sound ? "bg-gradient-to-br from-amber-500 to-orange-500" : "bg-muted"}
            title="Notification Sounds"
            description="Play a sound when you receive a notification"
            checked={notificationSettings.sound ?? true}
            onCheckedChange={handleSoundToggle}
            disabled={!isEnabled}
            variant="warning"
            testId="switch-sound"
          />
          <SettingRow
            icon={<Vibrate className="w-5 h-5 text-white" />}
            iconBg="bg-gradient-to-br from-rose-500 to-pink-600"
            title="Vibration"
            description="Vibrate on mobile devices for new notifications"
            checked={notificationSettings.vibration ?? false}
            onCheckedChange={handleVibrationToggle}
            disabled={!isEnabled}
            testId="switch-vibration"
          />
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card className="overflow-hidden border shadow-sm">
        <CardHeader className="pb-4 bg-gradient-to-r from-slate-50 to-gray-100 dark:from-slate-950/30 dark:to-gray-900/30 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-slate-600 to-gray-700 rounded-xl shadow-sm">
              <Moon className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">Quiet Hours</CardTitle>
              <CardDescription className="text-xs">
                Pause notifications during specific times
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <SettingRow
            icon={<Moon className="w-5 h-5 text-white" />}
            iconBg="bg-gradient-to-br from-indigo-600 to-purple-700"
            title="Enable Quiet Hours"
            description="Silence non-urgent notifications during set times"
            checked={notificationSettings.quietHours?.enabled ?? false}
            onCheckedChange={handleQuietHoursToggle}
            disabled={!isEnabled}
            testId="switch-quiet-hours"
          />
          
          {notificationSettings.quietHours?.enabled && (
            <div className="ml-14 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-xl">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Start Time
                  </Label>
                  <Select
                    value={String(notificationSettings.quietHours?.startHour ?? 22)}
                    onValueChange={(val) => handleQuietHoursChange('startHour', parseInt(val))}
                    disabled={!isEnabled}
                  >
                    <SelectTrigger data-testid="select-quiet-start" className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {formatHour(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    End Time
                  </Label>
                  <Select
                    value={String(notificationSettings.quietHours?.endHour ?? 7)}
                    onValueChange={(val) => handleQuietHoursChange('endHour', parseInt(val))}
                    disabled={!isEnabled}
                  >
                    <SelectTrigger data-testid="select-quiet-end" className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {formatHour(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground px-1">
                Urgent notifications will still come through during quiet hours
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery Preferences */}
      <Card className="overflow-hidden border shadow-sm">
        <CardHeader className="pb-4 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-sm">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">Delivery Preferences</CardTitle>
              <CardDescription className="text-xs">
                Control how often you receive notifications
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Notification Frequency</Label>
            <Select
              value={notificationSettings.frequency ?? 'instant'}
              onValueChange={handleFrequencyChange}
              disabled={!isEnabled}
            >
              <SelectTrigger data-testid="select-frequency" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instant">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span>Instant - Send immediately</span>
                  </div>
                </SelectItem>
                <SelectItem value="hourly">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <span>Hourly Digest - Batch every hour</span>
                  </div>
                </SelectItem>
                <SelectItem value="daily">
                  <div className="flex items-center gap-2">
                    <Moon className="w-4 h-4 text-indigo-500" />
                    <span>Daily Digest - Once per day</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-medium">Auto-Delete Old Notifications</Label>
            <Select
              value={notificationSettings.autoDeleteDays?.toString() ?? 'never'}
              onValueChange={handleAutoDeleteChange}
              disabled={!isEnabled}
            >
              <SelectTrigger data-testid="select-auto-delete" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">After 7 days</SelectItem>
                <SelectItem value="14">After 14 days</SelectItem>
                <SelectItem value="30">After 30 days</SelectItem>
                <SelectItem value="60">After 60 days</SelectItem>
                <SelectItem value="90">After 90 days</SelectItem>
                <SelectItem value="never">Never delete automatically</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Only affects read notifications
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notification Categories */}
      <Card className="overflow-hidden border shadow-sm">
        <CardHeader className="pb-4 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl shadow-sm">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">Notification Categories</CardTitle>
              <CardDescription className="text-xs">
                Choose which types of notifications to receive
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          <div className="divide-y divide-border/50">
            <CategoryRow
              icon={<MessageSquare className="w-4 h-4 text-white" />}
              iconColor="bg-gradient-to-br from-blue-500 to-blue-600"
              title="Site Assignments"
              description="New site dispatches and assignments"
              checked={notificationSettings.categories?.assignments ?? true}
              onCheckedChange={(checked) => handleCategoryToggle('assignments', checked)}
              disabled={!isEnabled}
              testId="switch-cat-assignments"
            />
            <CategoryRow
              icon={<CheckCircle2 className="w-4 h-4 text-white" />}
              iconColor="bg-gradient-to-br from-emerald-500 to-green-600"
              title="Approvals"
              description="MMP approvals and review requests"
              checked={notificationSettings.categories?.approvals ?? true}
              onCheckedChange={(checked) => handleCategoryToggle('approvals', checked)}
              disabled={!isEnabled}
              testId="switch-cat-approvals"
            />
            <CategoryRow
              icon={<DollarSign className="w-4 h-4 text-white" />}
              iconColor="bg-gradient-to-br from-amber-500 to-yellow-600"
              title="Financial"
              description="Payments, fees, and budget alerts"
              checked={notificationSettings.categories?.financial ?? true}
              onCheckedChange={(checked) => handleCategoryToggle('financial', checked)}
              disabled={!isEnabled}
              testId="switch-cat-financial"
            />
            <CategoryRow
              icon={<Users className="w-4 h-4 text-white" />}
              iconColor="bg-gradient-to-br from-violet-500 to-purple-600"
              title="Team Updates"
              description="Team member status and activities"
              checked={notificationSettings.categories?.team ?? true}
              onCheckedChange={(checked) => handleCategoryToggle('team', checked)}
              disabled={!isEnabled}
              testId="switch-cat-team"
            />
            <CategoryRow
              icon={<Shield className="w-4 h-4 text-white" />}
              iconColor="bg-gradient-to-br from-rose-500 to-red-600"
              title="System Alerts"
              description="Important system messages and warnings"
              checked={notificationSettings.categories?.system ?? true}
              onCheckedChange={(checked) => handleCategoryToggle('system', checked)}
              disabled={!isEnabled}
              testId="switch-cat-system"
            />
          </div>
        </CardContent>
      </Card>

      {/* Test Notification */}
      {isEnabled && (
        <Card className="overflow-hidden border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Test Your Settings</h4>
                <p className="text-xs text-muted-foreground">
                  Send a test notification to verify everything works
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('PACT Test Notification', {
                      body: 'Your notifications are working correctly!',
                      icon: '/icons/icon-192x192.png',
                      badge: '/icons/icon-72x72.png'
                    });
                  }
                  toast({
                    title: "Test notification sent",
                    description: "Check your notification center",
                  });
                }}
                data-testid="button-test-notification"
              >
                <Bell className="w-4 h-4 mr-2" />
                Send Test
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
