import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/user/UserContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Calendar,
  Mail,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Info,
  Link2,
  Unlink,
  Bell,
  ClipboardList,
  Banknote,
  Milestone,
  Settings,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UserIntegration {
  id?: string;
  user_id: string;
  google_calendar_connected: boolean;
  google_calendar_email?: string | null;
  notification_email?: string | null;
  email_notifications_enabled: boolean;
  email_notify_task_assigned: boolean;
  email_notify_approval_needed: boolean;
  email_notify_payroll: boolean;
  email_notify_project_milestones: boolean;
  email_notify_system: boolean;
}

type EmailPrefKey = keyof Pick<
  UserIntegration,
  | "email_notifications_enabled"
  | "email_notify_task_assigned"
  | "email_notify_approval_needed"
  | "email_notify_payroll"
  | "email_notify_project_milestones"
  | "email_notify_system"
>;

const DEFAULT_INTEGRATION: Omit<UserIntegration, "user_id"> = {
  google_calendar_connected: false,
  google_calendar_email: null,
  notification_email: null,
  email_notifications_enabled: true,
  email_notify_task_assigned: true,
  email_notify_approval_needed: true,
  email_notify_payroll: true,
  email_notify_project_milestones: true,
  email_notify_system: false,
};

const EMAIL_NOTIFICATION_TYPES: Array<{
  key: EmailPrefKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = [
  {
    key: "email_notify_task_assigned",
    label: "Task Assignments",
    description: "Receive an email when a task is assigned to you",
    icon: ClipboardList,
    color: "text-blue-600",
  },
  {
    key: "email_notify_approval_needed",
    label: "Approval Requests",
    description: "Get notified when your approval is needed",
    icon: CheckCircle2,
    color: "text-orange-600",
  },
  {
    key: "email_notify_payroll",
    label: "Payroll & Payments",
    description: "Notifications about salary, advances, and payment processing",
    icon: Banknote,
    color: "text-green-600",
  },
  {
    key: "email_notify_project_milestones",
    label: "Project Milestones",
    description: "Updates when project milestones are reached or due",
    icon: Milestone,
    color: "text-purple-600",
  },
  {
    key: "email_notify_system",
    label: "System Notifications",
    description: "Important system-level alerts and announcements",
    icon: Settings,
    color: "text-gray-600",
  },
];

const getTipStorageKey = (userId: string) => `pact_integrations_tip_dismissed_${userId}`;

export default function IntegrationsSettings() {
  const location = useLocation();
  const { currentUser } = useUser();
  const { toast } = useToast();

  const [integration, setIntegration] = useState<UserIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [disconnectingCalendar, setDisconnectingCalendar] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState("");
  const [tipBannerDismissed, setTipBannerDismissed] = useState(false);
  const [tipExpanded, setTipExpanded] = useState(true);

  useEffect(() => {
    if (!currentUser?.id) return;
    const dismissed = localStorage.getItem(getTipStorageKey(currentUser.id)) === "true";
    setTipBannerDismissed(dismissed);
    setTipExpanded(!dismissed);
  }, [currentUser?.id]);

  const loadIntegration = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Failed to load integrations:", error);
      }

      if (data) {
        setIntegration(data as UserIntegration);
        setNotificationEmail(data.notification_email || "");
      } else {
        const defaultIntegration: UserIntegration = {
          ...DEFAULT_INTEGRATION,
          user_id: currentUser.id,
        };
        setIntegration(defaultIntegration);
        setNotificationEmail(currentUser.email || "");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load integrations";
      console.error("Error loading integrations:", message);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, currentUser?.email]);

  useEffect(() => {
    loadIntegration();
  }, [loadIntegration]);

  // Handle OAuth callback: ?calendar_callback=1&code=...&state=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const isCallback = params.get("calendar_callback") === "1";
    const code = params.get("code");
    const state = params.get("state");

    if (!isCallback || !code || !state || !currentUser?.id) return;

    // Clean the URL so the callback doesn't re-trigger on refresh
    window.history.replaceState({}, "", "/integrations");

    const handleCallback = async () => {
      setConnectingCalendar(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Not authenticated");

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-oauth?action=callback`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ code, state }),
          }
        );

        const result = await response.json() as {
          success?: boolean;
          google_calendar_email?: string;
          error?: string;
        };

        if (!response.ok || result.error) {
          throw new Error(result.error || "Failed to connect Google Calendar");
        }

        toast({
          title: "Google Calendar connected",
          description: result.google_calendar_email
            ? `Connected as ${result.google_calendar_email}`
            : "Your Google Calendar has been linked successfully.",
        });

        await loadIntegration();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to complete Google Calendar connection";
        toast({ title: "Connection failed", description: message, variant: "destructive" });
      } finally {
        setConnectingCalendar(false);
      }
    };

    handleCallback();
  }, [location.search, currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upsertIntegration = async (
    updates: Partial<UserIntegration>
  ): Promise<boolean> => {
    if (!currentUser?.id || !integration) return false;
    const payload: UserIntegration = {
      ...integration,
      ...updates,
      user_id: currentUser.id,
      notification_email: notificationEmail.trim() || null,
    };

    const { error } = await supabase
      .from("user_integrations")
      .upsert(payload, { onConflict: "user_id" });

    if (error) throw error;
    setIntegration(payload);
    return true;
  };

  const handleToggleEmailPref = async (key: EmailPrefKey, value: boolean) => {
    if (!integration) return;
    const optimisticState: UserIntegration = { ...integration, [key]: value };
    setIntegration(optimisticState);
    try {
      await upsertIntegration({ [key]: value });
    } catch (err) {
      setIntegration(integration);
      const message = err instanceof Error ? err.message : "Failed to save preference";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const handleSaveEmailPrefs = async () => {
    setSaving(true);
    try {
      await upsertIntegration({});
      toast({ title: "Settings saved", description: "Your notification email has been updated." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save settings";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleConnectGoogleCalendar = async () => {
    if (!currentUser?.id) return;
    setConnectingCalendar(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-oauth?action=initiate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );

      const result = await response.json() as {
        authorization_url?: string;
        error?: string;
      };

      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to initiate Google OAuth");
      }

      if (result.authorization_url) {
        window.location.href = result.authorization_url;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect Google Calendar";
      toast({ title: "Connection failed", description: message, variant: "destructive" });
      setConnectingCalendar(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    if (!currentUser?.id) return;
    setDisconnectingCalendar(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-revoke`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      );

      const result = await response.json() as { success?: boolean; error?: string };

      if (!response.ok || result.error) {
        throw new Error(result.error || "Failed to disconnect Google Calendar");
      }

      toast({ title: "Disconnected", description: "Google Calendar has been disconnected from your account." });
      await loadIntegration();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to disconnect Google Calendar";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setDisconnectingCalendar(false);
    }
  };

  const handleDismissTip = () => {
    setTipBannerDismissed(true);
    setTipExpanded(false);
    if (currentUser?.id) {
      localStorage.setItem(getTipStorageKey(currentUser.id), "true");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6 max-w-3xl mx-auto" data-testid="integrations-page">
        <div className="h-8 bg-muted animate-pulse rounded w-48" />
        <div className="h-32 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  const isCalendarConnected = integration?.google_calendar_connected ?? false;

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto" data-testid="integrations-page">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Link2 className="h-6 w-6 text-primary" />
          Integrations
        </h1>
        <p className="text-muted-foreground mt-1">
          Connect external services and manage how PACT communicates with you.
        </p>
      </div>

      {/* First-visit Tip Banner */}
      {!tipBannerDismissed && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <CardTitle className="text-base text-blue-800 dark:text-blue-200">
                  Welcome to Integrations
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/50"
                onClick={() => setTipExpanded((prev) => !prev)}
                data-testid="button-toggle-tip"
              >
                {tipExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          {tipExpanded && (
            <CardContent className="pt-0 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2 p-3 bg-white/60 dark:bg-blue-900/30 rounded-lg">
                  <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Google Calendar
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                      Sync task due dates and project milestones directly to
                      your Google Calendar so you never miss a deadline.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 bg-white/60 dark:bg-blue-900/30 rounded-lg">
                  <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Email Notifications
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                      Choose which events you want delivered to your inbox —
                      approvals, task assignments, payroll, and more.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 dark:text-blue-400"
                  onClick={handleDismissTip}
                  data-testid="button-dismiss-tip"
                >
                  Got it, don't show again
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Calendar Section */}
      <Card data-testid="card-calendar-integration">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Google Calendar</CardTitle>
                <CardDescription>
                  Sync task due dates and project milestones to Google Calendar
                </CardDescription>
              </div>
            </div>
            <Badge
              variant={isCalendarConnected ? "default" : "secondary"}
              className={cn(
                "shrink-0",
                isCalendarConnected ? "bg-green-500 hover:bg-green-600" : ""
              )}
              data-testid="badge-calendar-status"
            >
              {isCalendarConnected ? (
                <>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 mr-1" />
                  Not connected
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <p className="text-sm font-medium">What this does</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                Syncs task due dates to your Google Calendar automatically
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                Adds project milestones as calendar events with reminders
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                Keeps your calendar updated when deadlines change
              </li>
            </ul>
          </div>

          {isCalendarConnected && integration?.google_calendar_email && (
            <div className="flex items-center gap-3 p-3 border rounded-lg bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Connected account
                </p>
                <p
                  className="text-sm text-green-700 dark:text-green-300 truncate"
                  data-testid="text-calendar-email"
                >
                  {integration.google_calendar_email}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            {!isCalendarConnected ? (
              <Button
                onClick={handleConnectGoogleCalendar}
                disabled={connectingCalendar}
                className="gap-2"
                data-testid="button-connect-google-calendar"
              >
                {connectingCalendar ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="h-4 w-4" />
                    Connect Google Calendar
                  </>
                )}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleDisconnectGoogleCalendar}
                disabled={disconnectingCalendar}
                className="gap-2 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                data-testid="button-disconnect-google-calendar"
              >
                {disconnectingCalendar ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  <>
                    <Unlink className="h-4 w-4" />
                    Disconnect Google Calendar
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email Section */}
      <Card data-testid="card-email-integration">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Email Notifications</CardTitle>
              <CardDescription>
                Configure which events trigger email notifications and where to send them
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master toggle */}
          <div className="flex items-center justify-between gap-4 p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label
                  className="text-sm font-medium cursor-pointer"
                  htmlFor="email-notifications-toggle"
                >
                  Email notifications
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable all email notifications
                </p>
              </div>
            </div>
            <Switch
              id="email-notifications-toggle"
              checked={integration?.email_notifications_enabled ?? true}
              onCheckedChange={(checked) =>
                handleToggleEmailPref("email_notifications_enabled", checked)
              }
              data-testid="switch-email-notifications-enabled"
            />
          </div>

          <Separator />

          {/* Notification email address */}
          <div className="space-y-2">
            <Label htmlFor="notification-email" className="text-sm font-medium">
              Notification email address
            </Label>
            <p className="text-xs text-muted-foreground">
              Leave blank to use your account email ({currentUser?.email}). Set a
              different address to receive notifications there instead.
            </p>
            <div className="flex gap-2">
              <Input
                id="notification-email"
                type="email"
                placeholder={currentUser?.email || "your@email.com"}
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                disabled={!integration?.email_notifications_enabled}
                className="flex-1"
                data-testid="input-notification-email"
              />
              <Button
                variant="outline"
                onClick={handleSaveEmailPrefs}
                disabled={saving || !integration?.email_notifications_enabled}
                data-testid="button-save-notification-email"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Per-category toggles */}
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Notification types</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose which events you want delivered to your inbox
              </p>
            </div>
            <div className="space-y-2">
              {EMAIL_NOTIFICATION_TYPES.map((type) => {
                const Icon = type.icon;
                const value = (integration?.[type.key] as boolean) ?? true;
                return (
                  <div
                    key={type.key}
                    className={cn(
                      "flex items-center justify-between gap-4 p-3 border rounded-lg transition-opacity",
                      !integration?.email_notifications_enabled && "opacity-50"
                    )}
                    data-testid={`row-email-notify-${type.key}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className={cn("h-4 w-4 shrink-0", type.color)} />
                      <div className="min-w-0">
                        <Label
                          htmlFor={`toggle-${type.key}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {type.label}
                        </Label>
                        <p className="text-xs text-muted-foreground truncate">
                          {type.description}
                        </p>
                      </div>
                    </div>
                    <Switch
                      id={`toggle-${type.key}`}
                      checked={value}
                      onCheckedChange={(checked) =>
                        handleToggleEmailPref(type.key, checked)
                      }
                      disabled={!integration?.email_notifications_enabled}
                      data-testid={`switch-${type.key}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
