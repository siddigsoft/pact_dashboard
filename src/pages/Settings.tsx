import { useEffect, useState, useRef, type ChangeEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuthorization } from "@/hooks/use-authorization";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  Settings as SettingsIcon,
  Bell,
  User,
  MapPin,
  Sparkles,
  Eye,
  Globe,
  Lock,
  Save,
  RefreshCw,
  Shield,
  Smartphone,
  CheckCircle,
  XCircle,
  Menu,
  EyeOff,
  LayoutDashboard,
  Camera,
  Upload,
  AlertCircle,
  Banknote,
  CheckCircle2,
  Megaphone,
  Mail,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/context/settings/SettingsContext";
import { Input } from "@/components/ui/input";
import { useUser } from "@/context/user/UserContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import LocationCapture from "@/components/LocationCapture";
import RoleBadge from "@/components/user/RoleBadge";
import UserClassificationBadge from "@/components/user/UserClassificationBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { useMFA } from "@/hooks/use-mfa";
import { BankakAccountForm, BankakAccountFormValues } from "@/components/BankakAccountForm";
import { Badge } from "@/components/ui/badge";
import { NotificationSettings as NotificationSettingsComponent } from "@/components/settings/NotificationSettings";
import { useViewMode } from "@/context/ViewModeContext";
import { MobileSettingsScreen } from "@/components/mobile/MobileSettingsScreen";

const Settings = () => {
  const { viewMode } = useViewMode();
  const isMobile = viewMode === "mobile";
  const { toast } = useToast();
  const { currentUser, updateUser, logout } = useUser();
  const {
    notificationSettings,
    dashboardPreferences,
    updateDashboardPreferences,
    loading,
  } = useSettings();

  if (isMobile) {
    return (
      <MobileSettingsScreen
        user={{
          name: currentUser?.name || "User",
          email: currentUser?.email || "",
          avatarUrl: currentUser?.avatar,
          role: currentUser?.role || "User",
        }}
        onLogout={async () => {
          await logout();
        }}
      />
    );
  }

  const {
    mfaEnabled,
    loading: mfaLoading,
    checkMFAStatus,
    unenrollMFA,
  } = useMFA();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [changing, setChanging] = useState(false);
  const [activeTab, setActiveTab] = useState("navigation");
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [disablingMFA, setDisablingMFA] = useState(false);

  const [name, setName] = useState(currentUser?.name || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [avatar, setAvatar] = useState(currentUser?.avatar || "");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [bankAccountSubmitting, setBankAccountSubmitting] = useState(false);

  const { checkPermission } = useAuthorization();
  const canOpenBroadcastCenter = checkPermission('broadcast', 'read');

  const handleBankAccountSubmit = async (values: BankakAccountFormValues) => {
    if (!currentUser) return;
    setBankAccountSubmitting(true);
    try {
      const updatedUser = {
        ...currentUser,
        bankAccount: {
          accountName: values.accountName,
          accountNumber: values.accountNumber,
          branch: values.branch,
        },
      };
      const success = await updateUser(updatedUser as any);
      if (success) {
        toast({
          title: 'Bank Account Saved / تم حفظ بيانات الحساب',
          description: 'Your bank account details have been saved. / تم حفظ بيانات حسابك البنكي.',
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save bank account details.',
        variant: 'destructive',
      });
    } finally {
      setBankAccountSubmitting(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setEmail(currentUser.email || "");
      setAvatar(currentUser.avatar || "");
    }
  }, [currentUser]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const handleAvatarUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid File",
        description: "Please upload an image file (JPG, PNG, etc.)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Image must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingAvatar(true);

    try {
      const fileExt = file.name.split(".").pop() ?? 'jpg';
      // Use fixed filename UUID.ext (no timestamp) so the path always matches
      // the storage RLS policy "avatars/<uuid>.<ext>".  upsert:true replaces
      // the previous file.  Cache-busting is handled via the query string below.
      const filePath = `avatars/${currentUser.id}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Append cache-buster so the browser doesn't serve a stale image
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", currentUser.id);

      if (updateError) {
        throw updateError;
      }

      setAvatar(avatarUrl);

      if (updateUser) {
        updateUser({ ...currentUser, avatar: avatarUrl });
      }

      toast({
        title: "Avatar Updated",
        description: "Your profile picture has been updated successfully",
      });
    } catch (error: any) {
      console.error("Avatar upload error:", error);
      toast({
        title: "Upload Failed",
        description:
          error.message || "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  useEffect(() => {
    checkMFAStatus();
  }, [checkMFAStatus]);

  const handleSaveProfile = async () => {
    if (!currentUser) return;

    // Validate required avatar
    if (!avatar && !currentUser.avatar) {
      toast({
        title: "Profile picture required",
        description:
          "Please upload a profile picture before saving. This is required for site claiming.",
        variant: "destructive",
      });
      return;
    }

    try {
      const success = await updateUser({
        ...currentUser,
        name,
        email,
        avatar: avatar || currentUser.avatar,
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

  const handleDisableMFA = async () => {
    setDisablingMFA(true);
    try {
      const success = await unenrollMFA();
      if (success) {
        toast({
          title: "2FA Disabled",
          description:
            "Two-factor authentication has been disabled for your account.",
          variant: "default",
        });
        await checkMFAStatus();
      } else {
        toast({
          title: "Error",
          description:
            "Failed to disable two-factor authentication. Please try again.",
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
      const { supabase } = await import("@/integrations/supabase/client");

      const { data, error } = await supabase.functions.invoke(
        "self-change-password",
        {
          body: {
            currentPassword: oldPassword,
            newPassword: newPassword,
          },
        },
      );

      if (error || !data?.success) {
        toast({
          title: "Password change failed",
          description:
            data?.error || error?.message || "Could not change password.",
          variant: "destructive",
        });
        setChanging(false);
        return;
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
    <div className="container mx-auto p-3 pt-36 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-24 sm:pb-8">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Card
          className="hover-elevate active:scale-95 cursor-pointer overflow-hidden relative bg-gradient-to-br from-green-500 to-emerald-700 text-white border-0 min-h-[120px]"
          onClick={() => setActiveTab("notifications")}
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
              Alerts & quiet hours
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-20 w-20 sm:h-24 sm:w-24 text-white/10" />
        </Card>

        <Card
          className="hover-elevate active:scale-95 cursor-pointer overflow-hidden relative bg-gradient-to-br from-orange-500 to-red-600 text-white border-0 min-h-[120px]"
          onClick={() => setActiveTab("profile")}
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
            <p className="text-xs text-white/80 mt-1">Personal information</p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-20 w-20 sm:h-24 sm:w-24 text-white/10" />
        </Card>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 gap-1 h-auto p-1">
          <TabsTrigger
            value="navigation"
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm"
            data-testid="tab-navigation"
          >
            <Menu className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Navigation</span>
          </TabsTrigger>
          <TabsTrigger
            value="location"
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm"
            data-testid="tab-location"
          >
            <MapPin className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Location</span>
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm"
            data-testid="tab-notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger
            value="language"
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm"
            data-testid="tab-language"
          >
            <Globe className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Language</span>
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm"
            data-testid="tab-security"
          >
            <Shield className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger
            value="profile"
            className="flex flex-col sm:flex-row items-center gap-1 sm:gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm"
            data-testid="tab-profile"
          >
            <User className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Profile</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="navigation" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border-b p-4 sm:p-6">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-500 rounded-lg">
                  <Menu className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">
                    Navigation Preferences
                  </CardTitle>
                  <CardDescription>
                    Choose where the dashboard opens for you
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
                  onValueChange={(value) =>
                    updateDashboardPreferences({ defaultZone: value as any })
                  }
                >
                  <SelectTrigger
                    className="w-full min-h-[44px] p-3"
                    data-testid="select-default-zone"
                  >
                    <SelectValue placeholder="Select default zone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operations">
                      Operations (Admin Overview)
                    </SelectItem>
                    <SelectItem value="fom">
                      Field Operations Manager
                    </SelectItem>
                    <SelectItem value="team">Team Management</SelectItem>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="data-collector">
                      Data Collector
                    </SelectItem>
                  </SelectContent>
                </Select>
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

        <TabsContent value="language" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-b p-4 sm:p-6">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <Globe className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Language</CardTitle>
                  <CardDescription>
                    Choose the language the app is shown in
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-6 pt-4 sm:pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg min-h-[60px]">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div className="space-y-1">
                    <Label htmlFor="language" className="text-base font-medium">
                      Language / اللغة
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Choose your preferred language
                    </p>
                  </div>
                </div>
                <LanguageSwitcher variant="full" />
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
                      <Label className="text-base font-medium">
                        Two-Factor Authentication (2FA)
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Add an extra layer of security to your account using an
                        authenticator app
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {mfaLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : mfaEnabled ? (
                      <Badge
                        variant="default"
                        className="bg-green-500 hover:bg-green-600 min-h-[28px] px-3"
                      >
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
                        Your account is protected with an authenticator app.
                        You'll need to enter a code from your app when signing
                        in.
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
                      <p className="font-medium">
                        Enhance your account security
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Two-factor authentication adds an extra layer of
                        protection. When enabled, you'll need to enter a code
                        from your authenticator app in addition to your password
                        when signing in.
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

              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-3">
                  Supported Authenticator Apps
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    "Google Authenticator",
                    "Authy",
                    "1Password",
                    "Microsoft Authenticator",
                  ].map((app) => (
                    <div
                      key={app}
                      className="flex items-center gap-2 p-3 bg-muted/50 rounded min-h-[44px] text-sm"
                    >
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
          <Card className="border shadow-sm overflow-hidden">
            {/* ── Hero / Banner ─────────────────────────────────────────── */}
            <div className="relative h-36 bg-gradient-to-br from-orange-400 via-rose-400 to-purple-500 dark:from-orange-600 dark:via-rose-600 dark:to-purple-700">
              <div className="absolute inset-0 opacity-20"
                style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            </div>

            {/* ── Avatar overlapping banner ─────────────────────────────── */}
            <div className="flex flex-col items-center -mt-16 pb-4 px-6">
              <div className="relative group">
                <div className="rounded-full p-1 bg-background shadow-xl ring-4 ring-background">
                  <Avatar className="h-28 w-28">
                    {avatar ? (
                      <AvatarImage src={avatar} alt={name} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="text-3xl font-bold bg-gradient-to-br from-orange-400 to-rose-500 text-white">
                      {getInitials(name || currentUser?.name || "U")}
                    </AvatarFallback>
                  </Avatar>
                </div>
                {/* Camera overlay */}
                <div
                  className="absolute inset-1 bg-black/55 rounded-full opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {isUploadingAvatar ? (
                    <Upload className="h-6 w-6 text-white animate-pulse" />
                  ) : (
                    <>
                      <Camera className="h-5 w-5 text-white" />
                      <span className="text-white text-[10px] mt-0.5 font-medium">Change</span>
                    </>
                  )}
                </div>
                {/* Upload progress ring */}
                {isUploadingAvatar && (
                  <div className="absolute -inset-1 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
                )}
              </div>

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                data-testid="input-avatar"
              />

              {/* Name & Role display */}
              <div className="mt-3 text-center space-y-1.5">
                <h2 className="text-xl font-bold tracking-tight">{name || currentUser?.name}</h2>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <RoleBadge role={currentUser?.role || "User"} size="md" />
                  {currentUser && (
                    <UserClassificationBadge userId={currentUser.id} size="md" showUnassigned={false} />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{email || currentUser?.email}</p>
              </div>

              {/* Upload button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="mt-3 h-8 px-4 text-xs border-dashed"
                data-testid="button-upload-avatar"
              >
                {isUploadingAvatar ? (
                  <><Upload className="mr-1.5 h-3.5 w-3.5 animate-spin" />Uploading...</>
                ) : (
                  <><Camera className="mr-1.5 h-3.5 w-3.5" />{avatar ? "Change Photo" : "Upload Photo"}</>
                )}
              </Button>

              {!avatar && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>Profile photo required for site claiming</span>
                </div>
              )}
            </div>

            {/* ── Divider ───────────────────────────────────────────────── */}
            <div className="border-t mx-6" />

            {/* ── Edit fields ───────────────────────────────────────────── */}
            <CardContent className="space-y-5 p-5 sm:p-6 pt-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-semibold flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    Full Name
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-10"
                    placeholder="Your full name"
                    data-testid="input-name"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-semibold flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10"
                    placeholder="your@email.com"
                    data-testid="input-email"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between gap-3 pt-2 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowChangePassword(true)}
                  className="min-h-[40px] px-5"
                  data-testid="button-change-password"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Change Password
                </Button>
                <Button
                  onClick={handleSaveProfile}
                  className="min-h-[40px] px-6 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white border-0"
                  data-testid="button-save-profile"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Profile
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bank Account Details Card */}
          <Card className="border shadow-sm">
            <CardHeader className="bg-gradient-to-r from-amber-50 to-yellow-100 dark:from-amber-900/20 dark:to-yellow-800/20 border-b p-4 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-500 rounded-lg">
                    <Banknote className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Bank Account Details
                      {currentUser?.bankAccount?.accountNumber ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <span className="text-xs font-normal text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-2 py-0.5">Required</span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      بيانات الحساب البنكي — Required for all fund requests and withdrawals
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              {!currentUser?.bankAccount?.accountNumber && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 p-3">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    You must add your bank account details before submitting any withdrawal or advance fund request. / يجب إضافة بيانات حسابك البنكي قبل تقديم أي طلب سحب أو سلفة.
                  </p>
                </div>
              )}
              <BankakAccountForm
                onSubmit={handleBankAccountSubmit}
                isSubmitting={bankAccountSubmitting}
                existingDetails={currentUser?.bankAccount as any}
                currentUserRole={currentUser?.role}
                isEditable={true}
              />
            </CardContent>
          </Card>

          {/* Admin Broadcast Center Link */}
          {canOpenBroadcastCenter && (
            <Card className="border border-violet-500/30 shadow-sm">
              <CardHeader className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-800/20 border-b p-4 sm:p-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-violet-600 rounded-lg">
                    <Megaphone className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Broadcast Center
                      <span className="text-xs font-normal bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded">Admin Only</span>
                    </CardTitle>
                    <CardDescription>
                      Send custom notifications or announcements to all users or specific groups / إرسال إشعارات مخصصة لجميع المستخدمين أو مجموعات محددة
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-start gap-3 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/10 p-3 mb-4">
                  <AlertCircle className="w-4 h-4 text-violet-600 dark:text-violet-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-violet-700 dark:text-violet-300">
                    The Broadcast Center lets you compose and send any notification to all users, specific roles, or users missing bank accounts. Includes quick templates, priority settings, and broadcast history.
                  </p>
                </div>
                <a href="/admin/broadcast">
                  <Button className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                    <Megaphone className="w-4 h-4 mr-2" /> Open Broadcast Center
                  </Button>
                </a>
              </CardContent>
            </Card>
          )}

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
                description:
                  "Two-factor authentication has been enabled for your account.",
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
              <Button
                variant="ghost"
                className="min-h-[44px] px-6"
                data-testid="button-cancel-password"
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleChangePassword}
              disabled={changing}
              className="min-h-[44px] px-6"
              data-testid="button-confirm-password"
            >
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
