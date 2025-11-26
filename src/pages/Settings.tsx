
import React, { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings as SettingsIcon, 
  Bell, 
  Palette, 
  User, 
  Database, 
  MapPin,
  Sparkles,
  Eye,
  Moon,
  Globe,
  Lock,
  Save,
  RefreshCw,
  Shield,
  Smartphone,
  CheckCircle,
  XCircle
} from "lucide-react";
import { useSettings } from "@/context/settings/SettingsContext";
import { Input } from "@/components/ui/input";
import { useUser } from "@/context/user/UserContext";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogClose, DialogDescription } from "@/components/ui/dialog";
import LocationCapture from "@/components/LocationCapture";
import RoleBadge from "@/components/user/RoleBadge";
import UserClassificationBadge from "@/components/user/UserClassificationBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { useMFA } from "@/hooks/use-mfa";
import { Badge } from "@/components/ui/badge";

const Settings = () => {
  const { toast } = useToast();
  const { currentUser, updateUser } = useUser();
  const {
    userSettings,
    notificationSettings,
    appearanceSettings,
    updateUserSettings,
    updateNotificationSettings,
    updateAppearanceSettings,
    updateDataVisibilitySettings,
    loading
  } = useSettings();

  const { mfaEnabled, loading: mfaLoading, checkMFAStatus, unenrollMFA } = useMFA();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [disablingMFA, setDisablingMFA] = useState(false);
  
  const [name, setName] = useState(currentUser?.name || "");
  const [email, setEmail] = useState(currentUser?.email || "");

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setEmail(currentUser.email || "");
    }
  }, [currentUser]);

  useEffect(() => {
    checkMFAStatus();
  }, [checkMFAStatus]);

  const handleNotificationsToggle = (enabled: boolean) => {
    updateNotificationSettings({
      ...notificationSettings,
      enabled
    });
  };

  const handleEmailNotificationsToggle = (checked: boolean) => {
    updateNotificationSettings({
      ...notificationSettings,
      email: checked
    });
  };

  const handleSoundAlertsToggle = (checked: boolean) => {
    updateNotificationSettings({
      ...notificationSettings,
      sound: checked
    });
  };

  const handleDarkModeToggle = (checked: boolean) => {
    updateAppearanceSettings({
      ...appearanceSettings,
      darkMode: checked
    });
  };

  const handleThemeChange = (value: string) => {
    updateAppearanceSettings({
      ...appearanceSettings,
      theme: value
    });
  };

  const handleDefaultPageChange = (value: string) => {
    updateUserSettings({
      defaultPage: value
    });
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    
    try {
      const success = await updateUser({
        ...currentUser,
        name,
        email
      });
      
      if (success) {
        toast({
          title: "Profile updated",
          description: "Your profile information has been saved successfully.",
          variant: "success",
        });
      } else {
        toast({
          title: "Update failed",
          description: "There was an error updating your profile.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Profile update error:", error);
      toast({
        title: "Update failed",
        description: "There was an error updating your profile.",
        variant: "destructive",
      });
    }
  };

  const handleDataSharingToggle = (checked: boolean) => {
    updateDataVisibilitySettings({
      options: {
        shareLocationWithTeam: checked
      }
    });
  };

  const handleDisableMFA = async () => {
    setDisablingMFA(true);
    try {
      const success = await unenrollMFA();
      if (success) {
        toast({
          title: "2FA Disabled",
          description: "Two-factor authentication has been disabled for your account.",
          variant: "default",
        });
        await checkMFAStatus();
      } else {
        toast({
          title: "Error",
          description: "Failed to disable two-factor authentication. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error disabling MFA:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while disabling 2FA.",
        variant: "destructive",
      });
    } finally {
      setDisablingMFA(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast({
        title: "Input required",
        description: "All fields are required.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Please confirm your new password.",
        variant: "destructive",
      });
      return;
    }
    setChanging(true);
    try {
      const { error: signInError } = await import("@/integrations/supabase/client").then(({ supabase }) =>
        supabase.auth.signInWithPassword({ email: currentUser?.email as string, password: oldPassword })
      );
      
      if (signInError) {
        setChanging(false);
        toast({
          title: "Wrong current password",
          description: "The current password you entered is incorrect.",
          variant: "destructive",
        });
        return;
      }
      
      const { error: updateError } = await import("@/integrations/supabase/client").then(({ supabase }) =>
        supabase.auth.updateUser({ password: newPassword })
      );
      
      if (updateError) {
        setChanging(false);
        toast({
          title: "Password change failed",
          description: updateError.message || "Could not change password.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password changed",
          description: "Your password was successfully updated.",
          variant: "success",
        });
        setShowChangePassword(false);
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (error: any) {
      console.error("Password change error:", error);
      toast({
        title: "Password change failed",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setChanging(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="animate-spin h-8 w-8 text-primary mx-auto" />
            <p className="mt-2 text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <SettingsIcon className="h-8 w-8 text-blue-600" />
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your account settings and preferences
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-blue-500 to-blue-700 text-white border-0"
          onClick={() => setActiveTab('general')}
          data-testid="card-general-settings"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              General
            </CardTitle>
            <Globe className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">Preferences</div>
            <p className="text-xs text-white/80 mt-1">
              Landing page & defaults
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-green-500 to-emerald-700 text-white border-0"
          onClick={() => setActiveTab('notifications')}
          data-testid="card-notification-settings"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Notifications
            </CardTitle>
            <Bell className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {notificationSettings.enabled ? "Enabled" : "Disabled"}
            </div>
            <p className="text-xs text-white/80 mt-1">
              Alerts & email settings
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-purple-500 to-purple-700 text-white border-0"
          onClick={() => setActiveTab('appearance')}
          data-testid="card-appearance-settings"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Appearance
            </CardTitle>
            <Moon className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {appearanceSettings.darkMode ? "Dark" : "Light"}
            </div>
            <p className="text-xs text-white/80 mt-1">
              Theme & display options
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active-elevate-2 cursor-pointer overflow-hidden relative bg-gradient-to-br from-orange-500 to-red-600 text-white border-0"
          onClick={() => setActiveTab('profile')}
          data-testid="card-profile-settings"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Profile
            </CardTitle>
            <User className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white truncate">
              {currentUser?.name || "Your Profile"}
            </div>
            <p className="text-xs text-white/80 mt-1">
              Personal information
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 gap-1">
          <TabsTrigger value="general" className="flex items-center gap-1" data-testid="tab-general">
            <SettingsIcon className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="location" className="flex items-center gap-1" data-testid="tab-location">
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Location</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-1" data-testid="tab-notifications">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-1" data-testid="tab-appearance">
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1" data-testid="tab-security">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex items-center gap-1" data-testid="tab-profile">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="dataVisibility" className="flex items-center gap-1" data-testid="tab-data-visibility">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Privacy</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-b">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <SettingsIcon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">General Settings</CardTitle>
                  <CardDescription>
                    Configure general system preferences
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="default-page" className="text-base font-medium">Default Landing Page</Label>
                  <p className="text-sm text-muted-foreground">
                    Choose which page to show after login
                  </p>
                </div>
                <Select 
                  value={userSettings?.settings?.defaultPage || "dashboard"}
                  onValueChange={handleDefaultPageChange}
                >
                  <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-default-page">
                    <SelectValue placeholder="Select page" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dashboard">Dashboard</SelectItem>
                    <SelectItem value="mmp">MMP Management</SelectItem>
                    <SelectItem value="site-visits">Site Visits</SelectItem>
                    <SelectItem value="reports">Reports</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={() => {
                    updateUserSettings({ defaultPage: userSettings?.settings?.defaultPage || "dashboard" });
                    toast({
                      title: "Settings saved",
                      description: "Your general settings have been updated.",
                      variant: "success",
                    });
                  }}
                  data-testid="button-save-general"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="location" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-cyan-50 to-cyan-100 dark:from-cyan-900/20 dark:to-cyan-800/20 border-b">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-cyan-500 rounded-lg">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Location Settings</CardTitle>
                  <CardDescription>
                    Manage your location and GPS preferences
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <LocationCapture />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="notifications" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-800/20 border-b">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-green-500 rounded-lg">
                  <Bell className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Notification Preferences</CardTitle>
                  <CardDescription>
                    Configure how and when you receive notifications
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="notifications" className="text-base font-medium">Enable Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive updates about your activities
                  </p>
                </div>
                <Switch 
                  id="notifications" 
                  checked={notificationSettings.enabled}
                  onCheckedChange={handleNotificationsToggle}
                  data-testid="switch-notifications"
                />
              </div>
              
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="email-notifications" className="text-base font-medium">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
                <Switch 
                  id="email-notifications" 
                  checked={notificationSettings.email}
                  onCheckedChange={handleEmailNotificationsToggle}
                  disabled={!notificationSettings.enabled}
                  data-testid="switch-email-notifications"
                />
              </div>
              
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="sound-alerts" className="text-base font-medium">Sound Alerts</Label>
                  <p className="text-sm text-muted-foreground">
                    Play sounds for important alerts
                  </p>
                </div>
                <Switch 
                  id="sound-alerts" 
                  checked={notificationSettings.sound}
                  onCheckedChange={handleSoundAlertsToggle}
                  disabled={!notificationSettings.enabled}
                  data-testid="switch-sound-alerts"
                />
              </div>
              
              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={() => {
                    updateNotificationSettings(notificationSettings);
                    toast({
                      title: "Settings saved",
                      description: "Your notification settings have been updated.",
                      variant: "success",
                    });
                  }}
                  data-testid="button-save-notifications"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="appearance" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-b">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <Palette className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Appearance Settings</CardTitle>
                  <CardDescription>
                    Customize the look and feel of the application
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Moon className="h-5 w-5 text-muted-foreground" />
                  <div className="space-y-1">
                    <Label htmlFor="dark-mode" className="text-base font-medium">Dark Mode</Label>
                    <p className="text-sm text-muted-foreground">
                      Switch to dark theme
                    </p>
                  </div>
                </div>
                <Switch 
                  id="dark-mode" 
                  checked={appearanceSettings.darkMode}
                  onCheckedChange={handleDarkModeToggle}
                  data-testid="switch-dark-mode"
                />
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <Label htmlFor="theme" className="text-base font-medium">Theme Style</Label>
                  <p className="text-sm text-muted-foreground">
                    Choose your preferred theme
                  </p>
                </div>
                <Select 
                  value={appearanceSettings.theme}
                  onValueChange={handleThemeChange}
                >
                  <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-theme">
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="high-contrast">High Contrast</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={() => {
                    updateAppearanceSettings(appearanceSettings);
                    toast({
                      title: "Settings saved",
                      description: "Your appearance settings have been updated.",
                      variant: "success",
                    });
                  }}
                  data-testid="button-save-appearance"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-100 dark:from-emerald-900/20 dark:to-teal-800/20 border-b">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500 rounded-lg">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Security Settings</CardTitle>
                  <CardDescription>
                    Manage two-factor authentication and security options
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                    <div className="space-y-1">
                      <Label className="text-base font-medium">Two-Factor Authentication (2FA)</Label>
                      <p className="text-sm text-muted-foreground">
                        Add an extra layer of security to your account using an authenticator app
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {mfaLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : mfaEnabled ? (
                      <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <XCircle className="h-3 w-3 mr-1" />
                        Disabled
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {mfaEnabled ? (
                <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                    <div className="space-y-2">
                      <p className="font-medium text-green-800 dark:text-green-200">
                        Two-factor authentication is active
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        Your account is protected with an authenticator app. You'll need to enter a code from your app when signing in.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDisableMFA}
                        disabled={disablingMFA}
                        className="mt-2"
                        data-testid="button-disable-2fa"
                      >
                        {disablingMFA ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Disabling...
                          </>
                        ) : (
                          <>
                            <XCircle className="mr-2 h-4 w-4" />
                            Disable 2FA
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 border rounded-lg">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="space-y-2">
                      <p className="font-medium">Enhance your account security</p>
                      <p className="text-sm text-muted-foreground">
                        Two-factor authentication adds an extra layer of protection. When enabled, you'll need to enter a code from your authenticator app in addition to your password when signing in.
                      </p>
                      <Button
                        onClick={() => setShowMFASetup(true)}
                        className="mt-2"
                        data-testid="button-enable-2fa"
                      >
                        <Shield className="mr-2 h-4 w-4" />
                        Enable Two-Factor Authentication
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-3">Supported Authenticator Apps</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {["Google Authenticator", "Authy", "1Password", "Microsoft Authenticator"].map((app) => (
                    <div key={app} className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      {app}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="profile" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-red-100 dark:from-orange-900/20 dark:to-red-800/20 border-b">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-500 rounded-lg">
                  <User className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Profile Settings</CardTitle>
                  <CardDescription>
                    Manage your personal information
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-base font-medium">Full Name</Label>
                  <Input 
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11"
                    data-testid="input-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-base font-medium">Email Address</Label>
                  <Input 
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                    data-testid="input-email"
                  />
                </div>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                  <Label className="text-base font-medium">Current Role</Label>
                  <div className="flex items-center gap-2 pt-1">
                    <RoleBadge role={currentUser?.role || "User"} size="md" />
                  </div>
                </div>
                
                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                  <Label className="text-base font-medium">Classification</Label>
                  <div className="flex items-center gap-2 pt-1">
                    {currentUser && (
                      <UserClassificationBadge 
                        userId={currentUser.id} 
                        size="md" 
                        showUnassigned={true}
                      />
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-between gap-4 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => setShowChangePassword(true)}
                  data-testid="button-change-password"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Change Password
                </Button>
                <Button 
                  onClick={handleSaveProfile}
                  data-testid="button-save-profile"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dataVisibility" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border-b">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-500 rounded-lg">
                  <Eye className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Data Visibility & Privacy</CardTitle>
                  <CardDescription>
                    Control how your data is shared and displayed
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <div className="space-y-1">
                    <Label htmlFor="location-sharing" className="text-base font-medium">Share Location with Team</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow team members to see your location
                    </p>
                  </div>
                </div>
                <Switch 
                  id="location-sharing" 
                  checked={!!userSettings?.settings?.shareLocationWithTeam}
                  onCheckedChange={handleDataSharingToggle}
                  data-testid="switch-location-sharing"
                />
              </div>
              
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <div className="space-y-1">
                    <Label htmlFor="display-metrics" className="text-base font-medium">Display Personal Metrics</Label>
                    <p className="text-sm text-muted-foreground">
                      Show your metrics on team dashboard
                    </p>
                  </div>
                </div>
                <Switch 
                  id="display-metrics" 
                  checked={!!userSettings?.settings?.displayPersonalMetrics}
                  onCheckedChange={(checked) => {
                    updateDataVisibilitySettings({
                      options: { displayPersonalMetrics: checked }
                    });
                  }}
                  data-testid="switch-display-metrics"
                />
              </div>
              
              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={() => {
                    updateDataVisibilitySettings({
                      options: {
                        shareLocationWithTeam: !!userSettings?.settings?.shareLocationWithTeam,
                        displayPersonalMetrics: !!userSettings?.settings?.displayPersonalMetrics
                      }
                    });
                    toast({
                      title: "Settings saved",
                      description: "Your data visibility settings have been updated.",
                      variant: "success",
                    });
                  }}
                  data-testid="button-save-privacy"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
      </Tabs>

      <Dialog open={showMFASetup} onOpenChange={setShowMFASetup}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Enable Two-Factor Authentication
            </DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app to set up 2FA
            </DialogDescription>
          </DialogHeader>
          <TwoFactorSetup
            onSetupComplete={() => {
              setShowMFASetup(false);
              checkMFAStatus();
              toast({
                title: "2FA Enabled",
                description: "Two-factor authentication has been enabled for your account.",
                variant: "default",
              });
            }}
            onDisabled={() => {
              setShowMFASetup(false);
              checkMFAStatus();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              Update your account password below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="old-password">Current Password</Label>
              <Input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
                className="h-11"
                data-testid="input-old-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="h-11"
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="h-11"
                data-testid="input-confirm-password"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-row flex justify-end">
            <DialogClose asChild>
              <Button variant="ghost" data-testid="button-cancel-password">Cancel</Button>
            </DialogClose>
            <Button onClick={handleChangePassword} disabled={changing} data-testid="button-confirm-password">
              {changing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Changing...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Change Password
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
