
import React, { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Bell, Palette, User, Shield, Database, Wallet, MapPin } from "lucide-react";
import { useSettings } from "@/context/settings/SettingsContext";
import { Input } from "@/components/ui/input";
import { useUser } from "@/context/user/UserContext";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogClose, DialogDescription } from "@/components/ui/dialog";
import LocationCapture from "@/components/LocationCapture";

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
    updateWalletSettings,
    loading
  } = useSettings();

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changing, setChanging] = useState(false);
  
  // Profile form state
  const [name, setName] = useState(currentUser?.name || "");
  const [email, setEmail] = useState(currentUser?.email || "");

  // Update form values when currentUser changes
  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || "");
      setEmail(currentUser.email || "");
    }
  }, [currentUser]);

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

  const handleThemeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    updateAppearanceSettings({
      ...appearanceSettings,
      theme: event.target.value
    });
  };

  const handleDefaultPageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    updateUserSettings({
      defaultPage: event.target.value
    });
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    
    try {
      // Update user data through context
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

  const handleAutoWithdrawalToggle = (checked: boolean) => {
    updateWalletSettings({
      auto_withdraw: checked
    });
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
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account settings and preferences.
          </p>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">
            <SettingsIcon className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="location">
            <MapPin className="h-4 w-4 mr-2" />
            Location
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="h-4 w-4 mr-2" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="profile">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="dataVisibility">
            <Database className="h-4 w-4 mr-2" />
            Data Visibility
          </TabsTrigger>
          <TabsTrigger value="wallet">
            <Wallet className="h-4 w-4 mr-2" />
            Wallet
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure general system preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="default-page">Default Landing Page</Label>
                  <p className="text-sm text-muted-foreground">
                    Choose which page to show after login
                  </p>
                </div>
                <select 
                  id="default-page"
                  className="px-3 py-2 border rounded-md"
                  value={userSettings?.settings?.defaultPage || "dashboard"}
                  onChange={handleDefaultPageChange}
                >
                  <option value="dashboard">Dashboard</option>
                  <option value="mmp">MMP Management</option>
                  <option value="site-visits">Site Visits</option>
                  <option value="reports">Reports</option>
                </select>
              </div>
              <div className="pt-4">
                <Button onClick={() => updateUserSettings({ defaultPage: userSettings?.settings?.defaultPage || "dashboard" })}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="location" className="space-y-4">
          <LocationCapture />
        </TabsContent>
        
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Configure how and when you receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="notifications" 
                  checked={notificationSettings.enabled}
                  onCheckedChange={handleNotificationsToggle}
                />
                <Label htmlFor="notifications">Enable notifications</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="email-notifications" 
                  checked={notificationSettings.email}
                  onCheckedChange={handleEmailNotificationsToggle}
                  disabled={!notificationSettings.enabled}
                />
                <Label htmlFor="email-notifications">Email notifications</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="sound-alerts" 
                  checked={notificationSettings.sound}
                  onCheckedChange={handleSoundAlertsToggle}
                  disabled={!notificationSettings.enabled}
                />
                <Label htmlFor="sound-alerts">Sound alerts</Label>
              </div>
              
              <div className="pt-4">
                <Button onClick={() => updateNotificationSettings(notificationSettings)}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="appearance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Appearance Settings</CardTitle>
              <CardDescription>
                Customize the look and feel of the application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="dark-mode" 
                  checked={appearanceSettings.darkMode}
                  onCheckedChange={handleDarkModeToggle}
                />
                <Label htmlFor="dark-mode">Dark Mode</Label>
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="theme">Theme</Label>
                <select 
                  id="theme"
                  className="w-full px-3 py-2 border rounded-md"
                  value={appearanceSettings.theme}
                  onChange={handleThemeChange}
                >
                  <option value="default">Default</option>
                  <option value="high-contrast">High Contrast</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>
              
              <div className="pt-4">
                <Button onClick={() => updateAppearanceSettings(appearanceSettings)}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
              <CardDescription>
                Manage your personal information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input 
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="role">Role</Label>
                  <Input 
                    id="role"
                    value={currentUser?.role || "User"}
                    disabled
                  />
                </div>
              </div>
              
              <div className="pt-4 flex flex-col sm:flex-row gap-2">
                <Button onClick={handleSaveProfile}>Save Changes</Button>
                <Button variant="outline" onClick={() => setShowChangePassword(true)}>
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dataVisibility" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Visibility Settings</CardTitle>
              <CardDescription>
                Control how your data is shared and displayed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="location-sharing" 
                  checked={!!userSettings?.settings?.shareLocationWithTeam}
                  onCheckedChange={handleDataSharingToggle}
                />
                <Label htmlFor="location-sharing">Share location with team</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="display-metrics" 
                  checked={!!userSettings?.settings?.displayPersonalMetrics}
                  onCheckedChange={(checked) => {
                    updateDataVisibilitySettings({
                      options: { displayPersonalMetrics: checked }
                    });
                  }}
                />
                <Label htmlFor="display-metrics">Display personal metrics on team dashboard</Label>
              </div>
              
              <div className="pt-4">
                <Button onClick={() => {
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
                }}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="wallet" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Wallet Settings</CardTitle>
              <CardDescription>
                Configure your wallet and payment preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="auto-withdraw" 
                  checked={!!userSettings?.settings?.autoWithdraw}
                  onCheckedChange={handleAutoWithdrawalToggle}
                />
                <Label htmlFor="auto-withdraw">Auto-withdraw when balance exceeds threshold</Label>
              </div>
              
              {userSettings?.settings?.autoWithdraw && (
                <div className="grid gap-2 pl-8">
                  <Label htmlFor="withdraw-threshold">Withdrawal threshold ({currentUser?.wallet?.currency || "SDG"})</Label>
                  <Input 
                    id="withdraw-threshold"
                    type="number"
                    value={userSettings?.settings?.withdrawThreshold || 500}
                    onChange={(e) => {
                      updateWalletSettings({
                        notification_prefs: {
                          withdrawThreshold: parseInt(e.target.value)
                        }
                      });
                    }}
                  />
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="payment-notifications" 
                  checked={!!userSettings?.settings?.paymentNotifications}
                  onCheckedChange={(checked) => {
                    updateWalletSettings({
                      notification_prefs: { 
                        onPayment: checked
                      }
                    });
                  }}
                />
                <Label htmlFor="payment-notifications">Receive notifications for new payments</Label>
              </div>
              
              <div className="pt-4">
                <Button onClick={() => {
                  updateWalletSettings({
                    notification_prefs: {
                      onPayment: !!userSettings?.settings?.paymentNotifications,
                      withdrawThreshold: userSettings?.settings?.withdrawThreshold || 500
                    },
                    auto_withdraw: !!userSettings?.settings?.autoWithdraw
                  });
                  
                  toast({
                    title: "Settings saved",
                    description: "Your wallet settings have been updated.",
                    variant: "success",
                  });
                }}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Update your account password below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="old-password">Current Password</Label>
              <Input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-row flex justify-end">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={handleChangePassword} disabled={changing}>
              {changing ? "Changing..." : "Change Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
