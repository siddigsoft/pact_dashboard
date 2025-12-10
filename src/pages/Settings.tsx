
import React, { useEffect, useState, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
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
  XCircle,
  Menu,
  Pin,
  EyeOff,
  LayoutDashboard,
  Camera,
  Upload,
  AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { NotificationSettings as NotificationSettingsComponent } from "@/components/settings/NotificationSettings";
import { useBiometric } from "@/hooks/use-biometric";
import { useDevice } from "@/hooks/use-device";
import { Fingerprint } from "lucide-react";
import { useViewMode } from "@/context/ViewModeContext";
import { MobileSettingsScreen } from "@/components/mobile/MobileSettingsScreen";

function BiometricSettingsSection() {
  const { isNative } = useDevice();
  const { currentUser } = useUser();
  const { 
    status, 
    isLoading, 
    storeCredentials, 
    clearCredentials, 
    refreshStatus,
    authenticate
  } = useBiometric();
  const { toast } = useToast();
  const [isEnabling, setIsEnabling] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  if (!isNative) {
    return (
      <div className="pt-4 border-t">
        <div className="p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Fingerprint className="h-5 w-5 text-muted-foreground" />
              <div className="space-y-1">
                <Label className="text-base font-medium">Biometric Login</Label>
                <p className="text-sm text-muted-foreground">
                  Use fingerprint or face recognition for quick login
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="min-h-[28px] px-3">
              <Smartphone className="h-3 w-3 mr-1" />
              Mobile Only
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Biometric authentication is only available in the PACT mobile app.
          </p>
        </div>
      </div>
    );
  }

  const handleStartEnableBiometric = async () => {
    await refreshStatus();
    
    if (!status.isAvailable) {
      toast({
        title: "Biometric Not Available",
        description: status.errorMessage || "Your device doesn't support biometric authentication.",
        variant: "destructive",
      });
      return;
    }

    if (!status.isEnrolled) {
      toast({
        title: "No Biometrics Enrolled",
        description: "Please set up fingerprint or face recognition in your device settings first.",
        variant: "destructive",
      });
      return;
    }

    setPassword("");
    setPasswordError("");
    setShowPasswordDialog(true);
  };

  const handleConfirmEnableBiometric = async () => {
    if (!password.trim()) {
      setPasswordError("Please enter your password");
      return;
    }

    if (!currentUser?.email) {
      setPasswordError("Unable to get your email. Please try again.");
      return;
    }

    setIsEnabling(true);
    setPasswordError("");
    
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: password,
      });

      if (signInError) {
        setPasswordError("Incorrect password. Please try again.");
        setIsEnabling(false);
        return;
      }

      const authResult = await authenticate({
        reason: 'Verify your identity to enable biometric login',
        title: 'Enable Biometric Login',
      });

      if (!authResult.success) {
        toast({
          title: "Authentication Failed",
          description: authResult.error || "Biometric verification failed. Please try again.",
          variant: "destructive",
        });
        setIsEnabling(false);
        return;
      }

      const storeResult = await storeCredentials({
        username: currentUser.email,
        password: password,
      });

      if (!storeResult.success) {
        toast({
          title: "Error",
          description: storeResult.error || "Failed to save credentials securely.",
          variant: "destructive",
        });
        setIsEnabling(false);
        return;
      }

      setShowPasswordDialog(false);
      setPassword("");
      
      toast({
        title: "Biometric Enabled",
        description: "You can now use fingerprint or face recognition to log in.",
        variant: "default",
      });
      
      await refreshStatus();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to enable biometric authentication.",
        variant: "destructive",
      });
    } finally {
      setIsEnabling(false);
    }
  };

  const handleDisableBiometric = async () => {
    setIsDisabling(true);
    try {
      await clearCredentials();
      toast({
        title: "Biometric Disabled",
        description: "Biometric login has been disabled for your account.",
        variant: "default",
      });
      await refreshStatus();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to disable biometric authentication.",
        variant: "destructive",
      });
    } finally {
      setIsDisabling(false);
    }
  };

  return (
    <div className="pt-4 border-t">
      <div className="p-4 bg-muted/50 rounded-lg min-h-[80px]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Fingerprint className="h-5 w-5 text-muted-foreground" />
            <div className="space-y-1">
              <Label className="text-base font-medium">Biometric Login</Label>
              <p className="text-sm text-muted-foreground">
                {status.biometricType === 'face' 
                  ? 'Use Face ID for quick login' 
                  : status.biometricType === 'iris'
                  ? 'Use Iris scan for quick login'
                  : 'Use fingerprint for quick login'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : status.hasStoredCredentials ? (
              <Badge variant="default" className="bg-green-500 hover:bg-green-600 min-h-[28px] px-3">
                <CheckCircle className="h-3 w-3 mr-1" />
                Enabled
              </Badge>
            ) : status.isAvailable ? (
              <Badge variant="secondary" className="min-h-[28px] px-3">
                <XCircle className="h-3 w-3 mr-1" />
                Disabled
              </Badge>
            ) : (
              <Badge variant="outline" className="min-h-[28px] px-3 text-amber-600 border-amber-300">
                <AlertCircle className="h-3 w-3 mr-1" />
                Not Available
              </Badge>
            )}
          </div>
        </div>
      </div>

      {status.isAvailable && !status.isEnrolled && (
        <div className="mt-3 p-3 border rounded-lg bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              No biometrics enrolled on this device. Please set up fingerprint or face recognition in your device settings.
            </p>
          </div>
        </div>
      )}

      {status.isAvailable && status.isEnrolled && (
        <div className="mt-3">
          {status.hasStoredCredentials ? (
            <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900/20">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="space-y-2">
                  <p className="font-medium text-green-800 dark:text-green-200">
                    Biometric login is active
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    You can use {status.biometricType === 'face' ? 'Face ID' : status.biometricType === 'iris' ? 'Iris scan' : 'your fingerprint'} to quickly log in to the app.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisableBiometric}
                    disabled={isDisabling}
                    className="mt-2 min-h-[36px] px-4"
                    data-testid="button-disable-biometric"
                  >
                    {isDisabling ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Disabling...
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-2 h-4 w-4" />
                        Disable Biometric Login
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 border rounded-lg">
              <div className="flex items-start gap-3">
                <Fingerprint className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-2">
                  <p className="font-medium">Enable quick login</p>
                  <p className="text-sm text-muted-foreground">
                    Set up biometric authentication for faster, more secure access to the app without entering your password.
                  </p>
                  <Button
                    onClick={handleStartEnableBiometric}
                    disabled={isEnabling}
                    className="mt-2 min-h-[44px] px-6"
                    data-testid="button-enable-biometric"
                  >
                    {isEnabling ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Setting up...
                      </>
                    ) : (
                      <>
                        <Fingerprint className="mr-2 h-4 w-4" />
                        Enable Biometric Login
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!status.isAvailable && status.errorMessage && (
        <div className="mt-3 p-3 border rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">{status.errorMessage}</p>
        </div>
      )}

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5" />
              Enable Biometric Login
            </DialogTitle>
            <DialogDescription>
              Enter your password to securely save your login credentials for biometric authentication.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="biometric-password">Password</Label>
              <Input
                id="biometric-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                className={passwordError ? "border-destructive" : ""}
                data-testid="input-biometric-password"
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Your password will be encrypted and stored securely on your device. It will only be accessible via biometric authentication.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowPasswordDialog(false);
                setPassword("");
                setPasswordError("");
              }}
              disabled={isEnabling}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmEnableBiometric}
              disabled={isEnabling || !password.trim()}
              data-testid="button-confirm-biometric"
            >
              {isEnabling ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Fingerprint className="mr-2 h-4 w-4" />
                  Enable
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Settings = () => {
  const { viewMode } = useViewMode();
  const isMobile = viewMode === 'mobile';
  const { toast } = useToast();
  const { currentUser, updateUser, logout } = useUser();
  const {
    userSettings,
    notificationSettings,
    appearanceSettings,
    menuPreferences,
    dashboardPreferences,
    dataVisibilitySettings,
    updateUserSettings,
    updateNotificationSettings,
    updateAppearanceSettings,
    updateDataVisibilitySettings,
    updateMenuPreferences,
    updateDashboardPreferences,
    loading
  } = useSettings();

  if (isMobile) {
    return (
      <MobileSettingsScreen
        user={{
          name: currentUser?.name || 'User',
          email: currentUser?.email || '',
          avatarUrl: currentUser?.avatar,
          role: currentUser?.role || 'User',
        }}
        onLogout={async () => {
          await logout();
        }}
      />
    );
  }

  const { mfaEnabled, loading: mfaLoading, checkMFAStatus, unenrollMFA } = useMFA();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [changing, setChanging] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [disablingMFA, setDisablingMFA] = useState(false);
  
  const [name, setName] = useState(currentUser?.name || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [avatar, setAvatar] = useState(currentUser?.avatar || "");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setEmail(currentUser.email || "");
      setAvatar(currentUser.avatar || "");
    }
  }, [currentUser]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please upload an image file (JPG, PNG, etc.)",
        variant: "destructive"
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Image must be less than 5MB",
        variant: "destructive"
      });
      return;
    }

    setIsUploadingAvatar(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const avatarUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', currentUser.id);

      if (updateError) {
        throw updateError;
      }

      setAvatar(avatarUrl);
      
      if (updateUser) {
        updateUser({ ...currentUser, avatar: avatarUrl });
      }

      toast({
        title: "Avatar Updated",
        description: "Your profile picture has been updated successfully"
      });
    } catch (error: any) {
      console.error('Avatar upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload avatar. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

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

  const handleBrowserPushToggle = async (checked: boolean) => {
    if (checked && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast({
          title: "Permission denied",
          description: "Browser notifications were not enabled. Please allow notifications in your browser settings.",
          variant: "destructive",
        });
        return;
      }
    }
    updateNotificationSettings({
      ...notificationSettings,
      browserPush: checked
    });
  };

  const handleCategoryToggle = (category: keyof typeof notificationSettings.categories, checked: boolean) => {
    updateNotificationSettings({
      ...notificationSettings,
      categories: {
        ...notificationSettings.categories,
        [category]: checked
      }
    });
  };

  const handleQuietHoursToggle = (enabled: boolean) => {
    updateNotificationSettings({
      ...notificationSettings,
      quietHours: {
        ...notificationSettings.quietHours,
        enabled
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

  const handleFrequencyChange = (frequency: 'instant' | 'hourly' | 'daily') => {
    updateNotificationSettings({
      ...notificationSettings,
      frequency
    });
  };

  const handleAutoDeleteChange = (days: number) => {
    updateNotificationSettings({
      ...notificationSettings,
      autoDeleteDays: days
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
    
    // Validate required avatar
    if (!avatar && !currentUser.avatar) {
      toast({
        title: "Profile picture required",
        description: "Please upload a profile picture before saving. This is required for site claiming.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const success = await updateUser({
        ...currentUser,
        name,
        email,
        avatar: avatar || currentUser.avatar
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
        ...dataVisibilitySettings?.options,
        shareLocationWithTeam: checked
      }
    });
  };

  const handleDisplayMetricsToggle = (checked: boolean) => {
    updateDataVisibilitySettings({
      options: {
        ...dataVisibilitySettings?.options,
        displayPersonalMetrics: checked
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

    if (newPassword.length < 8) {
      toast({
        title: "Weak password",
        description: "Use at least 8 characters for your new password.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword === oldPassword) {
      toast({
        title: "No change detected",
        description: "Choose a password different from your current one.",
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
      // Ensure we have a fresh email value even if user context is stale
      const { data: authData, error: userError } = await supabase.auth.getUser();
      const emailToUse = currentUser?.email || authData?.user?.email;

      if (userError || !emailToUse) {
        throw new Error("Unable to verify your session. Please sign in again.");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: oldPassword,
      });

      if (signInError) {
        toast({
          title: "Wrong current password",
          description: "The current password you entered is incorrect.",
          variant: "destructive",
        });
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

      if (updateError) {
        throw new Error(updateError.message || "Could not change password.");
      }

      toast({
        title: "Password changed",
        description: "Your password was successfully updated.",
        variant: "success",
      });
      setShowChangePassword(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
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
    <div className="container mx-auto p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">
            Manage your account settings and preferences
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card 
          className="hover-elevate active:scale-95 cursor-pointer overflow-hidden relative bg-gradient-to-br from-blue-500 to-blue-700 text-white border-0 min-h-[120px]"
          onClick={() => setActiveTab('general')}
          data-testid="card-general-settings"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 p-4">
            <CardTitle className="text-sm font-medium text-white/90">
              General
            </CardTitle>
            <Globe className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-white">Preferences</div>
            <p className="text-xs text-white/80 mt-1">
              Landing page & defaults
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-20 w-20 sm:h-24 sm:w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active:scale-95 cursor-pointer overflow-hidden relative bg-gradient-to-br from-green-500 to-emerald-700 text-white border-0 min-h-[120px]"
          onClick={() => setActiveTab('notifications')}
          data-testid="card-notification-settings"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 p-4">
            <CardTitle className="text-sm font-medium text-white/90">
              Notifications
            </CardTitle>
            <Bell className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-white">
              {notificationSettings.enabled ? "Enabled" : "Disabled"}
            </div>
            <p className="text-xs text-white/80 mt-1">
              Alerts & email settings
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-20 w-20 sm:h-24 sm:w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active:scale-95 cursor-pointer overflow-hidden relative bg-gradient-to-br from-purple-500 to-purple-700 text-white border-0 min-h-[120px]"
          onClick={() => setActiveTab('appearance')}
          data-testid="card-appearance-settings"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 p-4">
            <CardTitle className="text-sm font-medium text-white/90">
              Appearance
            </CardTitle>
            <Moon className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-white">
              {appearanceSettings.darkMode ? "Dark" : "Light"}
            </div>
            <p className="text-xs text-white/80 mt-1">
              Theme & display options
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-20 w-20 sm:h-24 sm:w-24 text-white/10" />
        </Card>

        <Card 
          className="hover-elevate active:scale-95 cursor-pointer overflow-hidden relative bg-gradient-to-br from-orange-500 to-red-600 text-white border-0 min-h-[120px]"
          onClick={() => setActiveTab('profile')}
          data-testid="card-profile-settings"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 p-4">
            <CardTitle className="text-sm font-medium text-white/90">
              Profile
            </CardTitle>
            <User className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-white truncate">
              {currentUser?.name || "Your Profile"}
            </div>
            <p className="text-xs text-white/80 mt-1">
              Personal information
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-20 w-20 sm:h-24 sm:w-24 text-white/10" />
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 gap-1 h-auto p-1">
          <TabsTrigger value="general" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm" data-testid="tab-general">
            <SettingsIcon className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="navigation" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm" data-testid="tab-navigation">
            <Menu className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Navigation</span>
          </TabsTrigger>
          <TabsTrigger value="location" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm" data-testid="tab-location">
            <MapPin className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Location</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm" data-testid="tab-notifications">
            <Bell className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm" data-testid="tab-appearance">
            <Palette className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Appearance</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm" data-testid="tab-security">
            <Shield className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm" data-testid="tab-profile">
            <User className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="dataVisibility" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm" data-testid="tab-data-visibility">
            <Eye className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Privacy</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-b p-4 sm:p-6">
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
            <CardContent className="space-y-6 p-4 sm:p-6 pt-4 sm:pt-6">
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
                  <SelectTrigger className="w-full sm:w-[200px] min-h-[44px]" data-testid="select-default-page">
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
                  className="min-h-[44px] px-6"
                  data-testid="button-save-general"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="navigation" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border-b p-4 sm:p-6">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-500 rounded-lg">
                  <Menu className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Navigation Preferences</CardTitle>
                  <CardDescription>
                    Customize your sidebar menu and dashboard layout
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-4 sm:p-6 pt-4 sm:pt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-indigo-600" />
                  <h3 className="font-semibold">Default Dashboard Zone</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Choose which dashboard view to show when you log in
                </p>
                <Select 
                  value={dashboardPreferences?.defaultZone || "operations"}
                  onValueChange={(value) => updateDashboardPreferences({ defaultZone: value as any })}
                >
                  <SelectTrigger className="w-full min-h-[44px] p-3" data-testid="select-default-zone">
                    <SelectValue placeholder="Select default zone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operations">Operations (Admin Overview)</SelectItem>
                    <SelectItem value="fom">Field Operations Manager</SelectItem>
                    <SelectItem value="team">Team Management</SelectItem>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="performance">Performance & Analytics</SelectItem>
                    <SelectItem value="financial">Financial Operations</SelectItem>
                    <SelectItem value="data-collector">Data Collector</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Pin className="h-5 w-5 text-amber-600" />
                  <h3 className="font-semibold">Pinned Menu Items</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Pinned items appear at the top of their menu groups for quick access
                </p>
                <div className="flex flex-wrap gap-2">
                  {menuPreferences?.pinnedItems?.length > 0 ? (
                    menuPreferences.pinnedItems.map((url) => (
                      <Badge key={url} variant="secondary" className="gap-1 min-h-[32px] px-3 py-1">
                        <Pin className="h-3 w-3" />
                        {url.replace('/', '')}
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6 ml-1 min-h-[24px]"
                          onClick={() => {
                            const updated = menuPreferences.pinnedItems.filter(i => i !== url);
                            updateMenuPreferences({ pinnedItems: updated });
                          }}
                          data-testid={`button-unpin-${url.replace('/', '')}`}
                        >
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No pinned items. Right-click menu items to pin them.</p>
                  )}
                </div>
              </div>

              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center gap-2">
                  <EyeOff className="h-5 w-5 text-gray-600" />
                  <h3 className="font-semibold">Hidden Menu Items</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Hidden items won't appear in your sidebar menu
                </p>
                <div className="flex flex-wrap gap-2">
                  {menuPreferences?.hiddenItems?.length > 0 ? (
                    menuPreferences.hiddenItems.map((url) => (
                      <Badge key={url} variant="outline" className="gap-1 min-h-[32px] px-3 py-1">
                        <EyeOff className="h-3 w-3" />
                        {url.replace('/', '')}
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6 ml-1 min-h-[24px]"
                          onClick={() => {
                            const updated = menuPreferences.hiddenItems.filter(i => i !== url);
                            updateMenuPreferences({ hiddenItems: updated });
                          }}
                          data-testid={`button-show-${url.replace('/', '')}`}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No hidden items. Right-click menu items to hide them.</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4 border-t">
                <Button 
                  variant="outline"
                  className="min-h-[44px] px-6"
                  onClick={() => {
                    updateMenuPreferences({
                      hiddenItems: [],
                      pinnedItems: [],
                      collapsedGroups: [],
                      favoritePages: []
                    });
                    updateDashboardPreferences({
                      defaultZone: 'operations',
                      hiddenWidgets: [],
                      widgetOrder: [],
                      quickStats: [],
                      defaultTimeRange: 'week'
                    });
                    toast({
                      title: "Preferences reset",
                      description: "Navigation preferences have been reset to defaults.",
                      variant: "success",
                    });
                  }}
                  data-testid="button-reset-nav"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reset to Defaults
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="location" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-cyan-50 to-cyan-100 dark:from-cyan-900/20 dark:to-cyan-800/20 border-b p-4 sm:p-6">
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
            <CardContent className="p-4 sm:p-6">
              <LocationCapture />
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="notifications" className="space-y-4">
          <NotificationSettingsComponent />
        </TabsContent>
        
        <TabsContent value="appearance" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-b p-4 sm:p-6">
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
            <CardContent className="space-y-4 p-4 sm:p-6 pt-4 sm:pt-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg min-h-[60px]">
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
                  className="scale-110"
                  data-testid="switch-dark-mode"
                />
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg min-h-[60px]">
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
                  <SelectTrigger className="w-full sm:w-[200px] min-h-[44px]" data-testid="select-theme">
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="high-contrast">High Contrast</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg min-h-[60px]">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div className="space-y-1">
                    <Label htmlFor="language" className="text-base font-medium">Language / اللغة</Label>
                    <p className="text-sm text-muted-foreground">
                      Choose your preferred language
                    </p>
                  </div>
                </div>
                <LanguageSwitcher variant="full" />
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
                  className="min-h-[44px] px-6"
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
            <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-100 dark:from-emerald-900/20 dark:to-teal-800/20 border-b p-4 sm:p-6">
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
            <CardContent className="space-y-6 p-4 sm:p-6 pt-4 sm:pt-6">
              <div className="p-4 bg-muted/50 rounded-lg min-h-[80px]">
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
                      <Badge variant="default" className="bg-green-500 hover:bg-green-600 min-h-[28px] px-3">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="min-h-[28px] px-3">
                        <XCircle className="h-3 w-3 mr-1" />
                        Disabled
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {mfaEnabled ? (
                <div className="p-4 border rounded-lg bg-green-50 dark:bg-green-900/20 min-h-[100px]">
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
                        className="mt-2 min-h-[36px] px-4"
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
                <div className="p-4 border rounded-lg min-h-[100px]">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="space-y-2">
                      <p className="font-medium">Enhance your account security</p>
                      <p className="text-sm text-muted-foreground">
                        Two-factor authentication adds an extra layer of protection. When enabled, you'll need to enter a code from your authenticator app in addition to your password when signing in.
                      </p>
                      <Button
                        onClick={() => setShowMFASetup(true)}
                        className="mt-2 min-h-[44px] px-6"
                        data-testid="button-enable-2fa"
                      >
                        <Shield className="mr-2 h-4 w-4" />
                        Enable Two-Factor Authentication
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <BiometricSettingsSection />

              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-3">Supported Authenticator Apps</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {["Google Authenticator", "Authy", "1Password", "Microsoft Authenticator"].map((app) => (
                    <div key={app} className="flex items-center gap-2 p-3 bg-muted/50 rounded min-h-[44px] text-sm">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs sm:text-sm">{app}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="profile" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-orange-50 to-red-100 dark:from-orange-900/20 dark:to-red-800/20 border-b p-4 sm:p-6">
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
            <CardContent className="space-y-6 p-4 sm:p-6 pt-4 sm:pt-6">
              {/* Profile Picture Section */}
              <div className="flex flex-col items-center gap-4 pb-6 border-b">
                <Label className="text-base font-medium">Profile Picture <span className="text-destructive">*</span></Label>
                <div className="relative group">
                  <Avatar className="h-24 w-24 border-2 border-border">
                    {avatar ? (
                      <AvatarImage src={avatar} alt={name} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="text-2xl font-semibold bg-primary/10">
                      {getInitials(name || currentUser?.name || "U")}
                    </AvatarFallback>
                  </Avatar>
                  <div 
                    className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer min-h-[96px] min-w-[96px]"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {isUploadingAvatar ? (
                      <Upload className="h-6 w-6 text-white animate-pulse" />
                    ) : (
                      <Camera className="h-6 w-6 text-white" />
                    )}
                  </div>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  data-testid="input-avatar"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="min-h-[44px] px-6"
                  data-testid="button-upload-avatar"
                >
                  {isUploadingAvatar ? (
                    <>
                      <Upload className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Camera className="mr-2 h-4 w-4" />
                      {avatar ? "Change Photo" : "Upload Photo"}
                    </>
                  )}
                </Button>
                {!avatar && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-4 w-4" />
                    <span>Profile picture is required for site claiming</span>
                  </div>
                )}
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
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
              
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="p-4 bg-muted/50 rounded-lg space-y-2 min-h-[80px]">
                  <Label className="text-base font-medium">Current Role</Label>
                  <div className="flex items-center gap-2 pt-1">
                    <RoleBadge role={currentUser?.role || "User"} size="md" />
                  </div>
                </div>
                
                <div className="p-4 bg-muted/50 rounded-lg space-y-2 min-h-[80px]">
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
                  className="min-h-[44px] px-6"
                  data-testid="button-change-password"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Change Password
                </Button>
                <Button 
                  onClick={handleSaveProfile}
                  className="min-h-[44px] px-6"
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
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border-b p-4 sm:p-6">
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
            <CardContent className="space-y-4 p-4 sm:p-6 pt-4 sm:pt-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg min-h-[60px]">
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
                  checked={!!dataVisibilitySettings?.options?.shareLocationWithTeam}
                  onCheckedChange={handleDataSharingToggle}
                  className="scale-110"
                  data-testid="switch-location-sharing"
                />
              </div>
              
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg min-h-[60px]">
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
                  checked={!!dataVisibilitySettings?.options?.displayPersonalMetrics}
                  onCheckedChange={handleDisplayMetricsToggle}
                  className="scale-110"
                  data-testid="switch-display-metrics"
                />
              </div>
              
              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={() => {
                    toast({
                      title: "Settings saved",
                      description: "Your data visibility settings have been updated.",
                    });
                  }}
                  className="min-h-[44px] px-6"
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
        <DialogContent className="sm:max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
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
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
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
              <div className="relative">
                <Input
                  id="old-password"
                  type={showCurrentPassword ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11 pr-12"
                  data-testid="input-old-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute inset-y-0 right-1 my-auto h-9 w-9"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  data-testid="button-toggle-current-password"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
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
              <Button variant="ghost" className="min-h-[44px] px-6" data-testid="button-cancel-password">Cancel</Button>
            </DialogClose>
            <Button onClick={handleChangePassword} disabled={changing} className="min-h-[44px] px-6" data-testid="button-confirm-password">
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
