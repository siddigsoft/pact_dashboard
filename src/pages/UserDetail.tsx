import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useUser } from "@/context/user/UserContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Mail, Phone, Award, Calendar, Edit, UserCheck, UserX, CreditCard, User as UserIcon } from "lucide-react";
import { BankakAccountForm, BankakAccountFormValues } from "@/components/BankakAccountForm";
import type { User } from "@/types/user";
import { AppRole } from "@/types/roles";
import { sudanStates, getLocalitiesByState, getHubNameForState } from "@/data/sudanStates";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/context/settings/SettingsContext";
import UserClassificationBadge from "@/components/user/UserClassificationBadge";
import ClassificationBadge from "@/components/user/ClassificationBadge";
import RoleBadge from "@/components/user/RoleBadge";
import ManageClassificationDialog, { ClassificationFormData } from "@/components/admin/ManageClassificationDialog";
import { useClassification } from "@/context/classification/ClassificationContext";
import { useAuthorization } from "@/hooks/use-authorization";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Plus } from "lucide-react";
import type { ClassificationHistory } from "@/types/classification";

// Database role codes (camelCase) - matches Supabase app_role enum
const availableRoles = [
  "admin",
  "ict",
  "fom",
  "financialAdmin",
  "supervisor",
  "coordinator",
  "dataCollector",
  "reviewer"
] as const;

const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { users, currentUser, updateUser, approveUser, rejectUser, refreshUsers } = useUser();
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [bankAccountFormOpen, setBankAccountFormOpen] = useState(false);

  const canEditBankAccount = currentUser?.role === "admin" || currentUser?.role === "Admin" || currentUser?.role === "ict" || currentUser?.role === "ICT";
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "Admin" || (currentUser?.roles && (currentUser.roles.includes("admin" as any) || currentUser.roles.includes("Admin")));

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<User>>({});

  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  // Add loading state for save
  const [isLoadingUser, setIsLoadingUser] = useState(false);

  // Classification management
  const { canManageFinances } = useAuthorization();
  const { getUserClassification, getClassificationHistory, assignClassification, refreshUserClassifications } = useClassification();
  const [classificationDialogOpen, setClassificationDialogOpen] = useState(false);
  
  const canManageClassifications = canManageFinances();
  const userClassification = user ? getUserClassification(user.id) : undefined;
  const [classificationHistory, setClassificationHistory] = useState<ClassificationHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hubDisplayName, setHubDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      setIsLoadingUser(true);
      const foundUser = users.find(u => u.id === id);
      if (foundUser) {
        setUser(foundUser);
        setEditForm(foundUser);
        setIsLoadingUser(false);
      } else {
        toast({
          title: "User not found",
          description: `No user with ID ${id} exists`,
          variant: "destructive",
        });
        navigate("/users");
      }
    }
  }, [id, users, navigate, toast]);

  useEffect(() => {
    const fetchHubName = async () => {
      if (user?.hubId) {
        const { data } = await supabase
          .from('hubs')
          .select('name')
          .eq('id', user.hubId)
          .maybeSingle();
        setHubDisplayName(data?.name ?? user.hubId);
        return;
      }
      if (user?.stateId) {
        const derived = getHubNameForState(user.stateId);
        setHubDisplayName(derived ?? null);
        return;
      }
      setHubDisplayName(null);
    };
    fetchHubName();
  }, [user?.hubId, user?.stateId]);

  useEffect(() => {
    const fetchClassificationHistory = async () => {
      if (user?.id && canManageClassifications) {
        setLoadingHistory(true);
        try {
          const history = await getClassificationHistory(user.id);
          setClassificationHistory(history);
        } catch (error) {
          console.error('Error fetching classification history:', error);
          setClassificationHistory([]);
        } finally {
          setLoadingHistory(false);
        }
      }
    };
    fetchClassificationHistory();
  }, [user?.id, canManageClassifications, getClassificationHistory]);

  const handleBankAccountSubmit = (values: BankakAccountFormValues) => {
    if (!user) return;

    const updatedUser: User = {
      ...user,
      bankAccount: {
        accountName: values.accountName,
        accountNumber: values.accountNumber,
        branch: values.branch
      }
    };

    if (updateUser) {
      updateUser(updatedUser)
        .then((success) => {
          if (success) {
            setUser(updatedUser);
            toast({
              title: "Bank Account Updated",
              description: `Bank account details updated for ${user.name}`,
            });
            setBankAccountFormOpen(false);
          }
        })
        .catch(error => {
          console.error("Error updating bank account:", error);
          toast({
            title: "Update failed",
            description: "There was a problem updating the bank account information.",
            variant: "destructive"
          });
        });
    }
  };

  const handleClassificationSave = async (data: ClassificationFormData) => {
    if (!user) return;

    try {
      await assignClassification(user.id, data);
      
      // Refresh classification context to update UI immediately
      await refreshUserClassifications();
      
      // Also refresh user data
      if (refreshUsers) {
        await refreshUsers();
      }
      
      toast({
        title: "Classification Updated",
        description: `Classification updated for ${user.name}`,
      });
      setClassificationDialogOpen(false);
    } catch (error) {
      console.error("Error updating classification:", error);
      toast({
        title: "Update failed",
        description: "There was a problem updating the classification.",
        variant: "destructive"
      });
    }
  };

  const getUserLocation = (user: User) => {
    const parts: string[] = [];
    if (hubDisplayName) parts.push(hubDisplayName);
    if (user.stateId) {
      const state = sudanStates.find(s => s.id === user.stateId);
      if (state?.name) parts.push(state.name);
    }
    if (user.stateId && user.localityId) {
      const locality = getLocalitiesByState(user.stateId).find(l => l.id === user.localityId);
      if (locality?.name) parts.push(locality.name);
    }
    return parts.length ? parts.join(", ") : "Not set";
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const handleEdit = () => {
    setEditMode(true);
  };

  const handleEditCancel = () => {
    setEditMode(false);
    setEditForm(user || {});
  };

  const handleEditChange = (field: keyof User, value: any) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleEditSave = async () => {
    if (!updateUser || !user) return;
    setIsSaving(true);

    try {
      const updatedUser: User = { ...user, ...editForm };
      const success = await updateUser(updatedUser);

      if (success) {
        // Fetch the latest user data from the database
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (error || !profile) {
          setUser(updatedUser);
          setEditForm(updatedUser);
        } else {
          const mappedUser: User = {
            id: profile.id,
            name: profile.full_name || profile.username || 'Unknown',
            email: profile.email || updatedUser.email || '',
            role: profile.role || updatedUser.role,
            roles: updatedUser.roles,
            stateId: profile.state_id || updatedUser.stateId,
            hubId: profile.hub_id || updatedUser.hubId,
            localityId: profile.locality_id || updatedUser.localityId,
            avatar: profile.avatar_url || updatedUser.avatar,
            username: profile.username || updatedUser.username,
            fullName: profile.full_name || updatedUser.fullName,
            phone: profile.phone || updatedUser.phone,
            employeeId: profile.employee_id || updatedUser.employeeId,
            bankAccount: (profile as any).bank_account || updatedUser.bankAccount,
            lastActive: updatedUser.lastActive || new Date().toISOString(),
            isApproved: profile.status === 'approved' || false,
            availability: profile.availability || updatedUser.availability || 'offline',
            createdAt: profile.created_at || updatedUser.createdAt || new Date().toISOString(),
            location: (typeof profile.location === 'string')
              ? (() => { try { return JSON.parse(profile.location); } catch { return updatedUser.location; } })()
              : (profile.location || updatedUser.location),
            performance: updatedUser.performance,
          };
          setUser(mappedUser);
          setEditForm(mappedUser);
        }

        toast({
          title: "User updated",
          description: "User information was successfully updated and will persist between sessions.",
          variant: "success"
        });
        setEditMode(false); // <-- move this here so it only closes on success
      } else {
        toast({
          title: "Update failed",
          description: "There was a problem updating the user information.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error saving user:", error);
      toast({
        title: "Update failed",
        description: "There was a problem updating the user information.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !approveUser) return;
    setIsApproving(true);
    await approveUser(user.id);
    setIsApproving(false);
    toast({ title: "User approved", description: `${user.name} has been approved.` });
  };

  const handleReject = async () => {
    if (!user || !rejectUser) return;
    setIsRejecting(true);
    await rejectUser(user.id);
    setIsRejecting(false);
    toast({ title: "User rejected", description: `${user.name} has been rejected.` });
    navigate("/users");
  };

  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold mb-2">Loading user details...</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Loading user details...</h2>
          <p className="text-gray-500">If this persists, the user may not exist.</p>
          <Button 
            className="mt-4" 
            variant="outline" 
            onClick={() => navigate("/users")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Users
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6 md:space-y-8">
      <div className="flex items-center justify-between mb-2">
        <Button 
          variant="outline" 
          onClick={() => navigate("/users")}
          className="min-h-[44px] px-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Users
        </Button>
        {isAdmin && !editMode && (
          <Button onClick={handleEdit} variant="outline" className="min-h-[44px] px-4">
            <Edit className="h-4 w-4 mr-1" />
            Edit User
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
        {/* Profile Card */}
        <Card className="lg:col-span-1 shadow-lg border-0 bg-gradient-to-b from-primary/5 to-background">
          <CardContent className="pt-4 sm:pt-6 md:pt-8 pb-3 sm:pb-4 md:pb-6 px-3 sm:px-4 md:px-6 flex flex-col items-center">
            <Avatar className="h-20 w-20 sm:h-24 md:h-32 md:w-32 shadow-lg border-4 border-background -mt-12 sm:-mt-16 md:-mt-20 mb-3 sm:mb-4">
              {user.avatar ? (
                <AvatarImage src={user.avatar} alt={user.name} />
              ) : (
                <AvatarFallback className="bg-primary text-primary-foreground text-xl sm:text-2xl md:text-3xl">
                  {getInitials(user.name)}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="text-center w-full px-2">
              {editMode ? (
                <Input
                  className="font-bold text-lg sm:text-xl md:text-2xl text-center mb-2 h-12 min-h-[44px]"
                  value={editForm.name || ""}
                  onChange={e => handleEditChange("name", e.target.value)}
                />
              ) : (
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold leading-tight">{user.name}</h2>
              )}
              <div className="flex flex-wrap justify-center items-center gap-1 sm:gap-2 mt-2">
                {editMode ? (
                  <select
                    className="border rounded px-3 py-2 text-center min-h-[44px] text-sm w-full max-w-xs"
                    value={editForm.role || ""}
                    onChange={e => handleEditChange("role", e.target.value)}
                  >
                    <option value="" disabled>Select role</option>
                    {availableRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <RoleBadge role={user.role} size="sm" />
                    <UserClassificationBadge userId={user.id} />
                    <Badge className="min-h-[32px] px-2 sm:px-3 text-xs sm:text-sm" variant={user.isApproved ? "default" : "destructive"}>
                      {user.isApproved ? "Active" : "Pending"}
                    </Badge>
                  </>
                )}
              </div>
            </div>
            <div className="w-full mt-3 sm:mt-4 md:mt-6 space-y-2 sm:space-y-3">
              <div className="flex items-center gap-3 min-h-[44px] p-2 sm:p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {editMode ? (
                    <Input
                      type="email"
                      value={editForm.email || ""}
                      onChange={e => handleEditChange("email", e.target.value)}
                      className="h-10 text-sm sm:text-base"
                      placeholder="user@example.com"
                    />
                  ) : (
                    <span className="text-sm sm:text-base break-all">{user.email}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 min-h-[44px] p-2 sm:p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {editMode ? (
                    <Input
                      value={editForm.phone || ""}
                      onChange={e => handleEditChange("phone", e.target.value)}
                      className="h-10 text-sm sm:text-base"
                      placeholder="+249 xxx xxx xxx"
                    />
                  ) : (
                    <span className="text-sm sm:text-base">{user.phone || "N/A"}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 min-h-[44px] p-2 sm:p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  {editMode ? (
                    <Input
                      value={editForm.stateId || ""}
                      placeholder="State ID"
                      onChange={e => handleEditChange("stateId", e.target.value)}
                      className="h-10 text-sm sm:text-base"
                    />
                  ) : (
                    <span className="text-sm sm:text-base break-words">{getUserLocation(user)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 min-h-[44px] p-2 sm:p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Award className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm sm:text-base">Rating: {user.performance?.rating ?? "-"}/5</span>
              </div>
              <div className="flex items-center gap-3 min-h-[44px] p-2 sm:p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm sm:text-base break-words">
                  Last Active: {user.lastActive ? new Date(user.lastActive).toLocaleString() : "N/A"}
                </span>
              </div>
            </div>
            {/* Action Buttons */}
            {!user.isApproved && isAdmin && !editMode && (
              <div className="w-full flex flex-col gap-2 mt-4 sm:mt-6">
                <Button onClick={handleApprove} disabled={isApproving} variant="default" className="min-h-[44px] px-6 w-full">
                  <UserCheck className="h-4 w-4 mr-2" />
                  Approve User
                </Button>
                <Button onClick={handleReject} disabled={isRejecting} variant="destructive" className="min-h-[44px] px-6 w-full">
                  <UserX className="h-4 w-4 mr-2" />
                  Reject User
                </Button>
              </div>
            )}
            {editMode && (
              <div className="w-full flex flex-col gap-2 mt-4 sm:mt-6">
                <Button
                  onClick={handleEditSave}
                  disabled={isSaving}
                  variant="default"
                  className="min-h-[44px] px-6 w-full"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
                <Button onClick={handleEditCancel} variant="outline" className="min-h-[44px] px-6 w-full">
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details Tabs */}
        <Card className="lg:col-span-2 shadow-lg border-0">
          <CardHeader className="p-3 sm:p-4 md:p-6">
            <CardTitle className="text-base sm:text-lg md:text-xl">User Details</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-6">
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1 h-auto p-1 mb-3 sm:mb-4">
                <TabsTrigger value="details" className="flex items-center gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm">
                  <UserIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Details</span>
                </TabsTrigger>
                <TabsTrigger value="performance" className="flex items-center gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm">
                  <Award className="h-4 w-4" />
                  <span className="hidden sm:inline">Performance</span>
                </TabsTrigger>
                <TabsTrigger value="bankak" className="flex items-center gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm">
                  <CreditCard className="h-4 w-4" />
                  <span className="hidden sm:inline">Bank</span>
                </TabsTrigger>
                <TabsTrigger value="location" className="flex items-center gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm">
                  <MapPin className="h-4 w-4" />
                  <span className="hidden sm:inline">Location</span>
                </TabsTrigger>
                {canManageClassifications && (
                  <TabsTrigger value="classification" className="flex items-center gap-1 p-2 sm:p-3 min-h-[44px] text-xs sm:text-sm">
                    <Award className="h-4 w-4" />
                    <span className="hidden sm:inline">Class</span>
                  </TabsTrigger>
                )}
              </TabsList>
              
              <TabsContent value="details" className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                  <div className="space-y-1">
                    <h3 className="font-medium text-xs sm:text-sm text-muted-foreground">Full Name</h3>
                    {editMode ? (
                      <Input
                        value={editForm.name || ""}
                        onChange={e => handleEditChange("name", e.target.value)}
                        className="h-11 min-h-[44px] text-sm sm:text-base"
                      />
                    ) : (
                      <p className="font-semibold text-sm sm:text-base md:text-base leading-relaxed">{user.name}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-medium text-xs sm:text-sm text-muted-foreground">Email</h3>
                    {editMode ? (
                      <Input
                        type="email"
                        value={editForm.email || ""}
                        onChange={e => handleEditChange("email", e.target.value)}
                        className="h-11 min-h-[44px] text-sm sm:text-base"
                      />
                    ) : (
                      <p className="font-semibold text-sm sm:text-base md:text-base break-all leading-relaxed">{user.email}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-medium text-xs sm:text-sm text-muted-foreground">Role</h3>
                    {editMode ? (
                      <select
                        className="border rounded px-3 py-2 w-full h-11 min-h-[44px] text-sm sm:text-base"
                        value={editForm.role || ""}
                        onChange={e => handleEditChange("role", e.target.value)}
                      >
                        <option value="" disabled>Select role</option>
                        {availableRoles.map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex gap-2 items-center pt-1">
                        <RoleBadge role={user.role} size="sm" />
                        <UserClassificationBadge userId={user.id} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-medium text-xs sm:text-sm text-muted-foreground">Employee ID</h3>
                    {editMode ? (
                      <Input
                        value={editForm.employeeId || ""}
                        onChange={e => handleEditChange("employeeId", e.target.value)}
                        className="h-11 min-h-[44px] text-sm sm:text-base"
                      />
                    ) : (
                      <p className="font-semibold text-sm sm:text-base md:text-base leading-relaxed">{user.employeeId || 'N/A'}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-medium text-xs sm:text-sm text-muted-foreground">Phone</h3>
                    {editMode ? (
                      <Input
                        value={editForm.phone || ""}
                        onChange={e => handleEditChange("phone", e.target.value)}
                        className="h-11 min-h-[44px] text-sm sm:text-base"
                      />
                    ) : (
                      <p className="font-semibold text-sm sm:text-base md:text-base leading-relaxed">{user.phone || 'N/A'}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-medium text-xs sm:text-sm text-muted-foreground">Status</h3>
                    <Badge variant={user.isApproved ? "default" : "destructive"} className="mt-1 min-h-[32px] px-3 text-xs sm:text-sm">
                      {user.isApproved ? 'Active' : 'Pending Approval'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-medium text-xs sm:text-sm text-muted-foreground">Hub</h3>
                    <p className="font-semibold text-sm sm:text-base md:text-base leading-relaxed break-words">{hubDisplayName || user.hubId || 'Not set'}</p>
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-medium text-xs sm:text-sm text-muted-foreground">State</h3>
                    <p className="font-semibold text-sm sm:text-base md:text-base leading-relaxed break-words">{user.stateId ? (sudanStates.find(s => s.id === user.stateId)?.name || user.stateId) : 'Not set'}</p>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <h3 className="font-medium text-xs sm:text-sm text-muted-foreground">Locality</h3>
                    <p className="font-semibold text-sm sm:text-base md:text-base leading-relaxed break-words">{user.stateId && user.localityId ? (getLocalitiesByState(user.stateId).find(l => l.id === user.localityId)?.name || user.localityId) : 'Not set'}</p>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="performance">
                {user.performance ? (
                  <div className="space-y-3 sm:space-y-4">
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4">
                      <div className="bg-muted rounded-lg p-3 sm:p-4 min-h-[80px] flex flex-col justify-center">
                        <h3 className="font-medium text-xs sm:text-sm mb-1">Rating</h3>
                        <p className="text-lg sm:text-xl md:text-2xl font-bold">{user.performance.rating}/5</p>
                      </div>
                      <div className="bg-muted rounded-lg p-3 sm:p-4 min-h-[80px] flex flex-col justify-center">
                        <h3 className="font-medium text-xs sm:text-sm mb-1">Completed Tasks</h3>
                        <p className="text-lg sm:text-xl md:text-2xl font-bold">{user.performance.totalCompletedTasks}</p>
                      </div>
                      <div className="bg-muted rounded-lg p-3 sm:p-4 min-h-[80px] flex flex-col justify-center">
                        <h3 className="font-medium text-xs sm:text-sm mb-1">On-Time Completion</h3>
                        <p className="text-lg sm:text-xl md:text-2xl font-bold">{user.performance.onTimeCompletion}%</p>
                      </div>
                      <div className="bg-muted rounded-lg p-3 sm:p-4 min-h-[80px] flex flex-col justify-center">
                        <h3 className="font-medium text-xs sm:text-sm mb-1">Current Workload</h3>
                        <p className="text-lg sm:text-xl md:text-2xl font-bold">{user.performance.currentWorkload || 0}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 sm:py-12">
                    <Award className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm sm:text-base text-muted-foreground">No performance data available.</p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="bankak">
                {user.bankAccount ? (
                  <div className="space-y-3 sm:space-y-4">
                    <div className="bg-muted rounded-lg p-3 sm:p-4">
                      <h3 className="font-medium text-sm sm:text-base mb-3">Bank Account Details</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="space-y-1">
                          <p className="text-xs sm:text-sm text-muted-foreground">Account Name</p>
                          <p className="font-medium text-sm sm:text-base break-words">{user.bankAccount.accountName}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs sm:text-sm text-muted-foreground">Account Number</p>
                          <p className="font-medium text-sm sm:text-base font-mono">{user.bankAccount.accountNumber}</p>
                        </div>
                        <div className="sm:col-span-2 space-y-1">
                          <p className="text-xs sm:text-sm text-muted-foreground">Branch</p>
                          <p className="font-medium text-sm sm:text-base break-words">{user.bankAccount.branch}</p>
                        </div>
                      </div>
                    </div>
                    {canEditBankAccount && (
                      <Button onClick={() => setBankAccountFormOpen(true)} className="min-h-[44px] px-4 sm:px-6 w-full sm:w-auto">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Bank Account
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 sm:py-8">
                    <CreditCard className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm sm:text-base text-muted-foreground mb-4">No bank account details available.</p>
                    {canEditBankAccount && (
                      <Button onClick={() => setBankAccountFormOpen(true)} className="min-h-[44px] px-6">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Bank Account
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="location">
                {user.location ? (
                  <div className="space-y-4">
                    <div className="bg-muted rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Latitude</p>
                        <p className="font-medium text-base">{user.location.latitude}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Longitude</p>
                        <p className="font-medium text-base">{user.location.longitude}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Last Updated</p>
                        <p className="font-medium text-base">
                          {user.location.lastUpdated ? new Date(user.location.lastUpdated).toLocaleString() : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Location Sharing</p>
                        <p className="font-medium text-base">
                          {user.location.isSharing ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                    </div>
                    <div className="h-[250px] sm:h-[300px] bg-slate-100 rounded-lg flex items-center justify-center">
                      <div className="text-center p-4">
                        <MapPin className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground text-sm sm:text-base">Map view is not available in this view</p>
                        <p className="text-xs text-muted-foreground mt-1">Check the Field Team page for interactive map</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No location data available.</p>
                )}
              </TabsContent>

              {canManageClassifications && (
                <TabsContent value="classification">
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">Current Classification</h3>
                        <p className="text-sm text-muted-foreground">Manage user classification and retainer</p>
                      </div>
                      <Button
                        onClick={() => setClassificationDialogOpen(true)}
                        className="min-h-[44px] px-4 w-full sm:w-auto"
                        data-testid="button-manage-classification"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {userClassification ? 'Update Classification' : 'Assign Classification'}
                      </Button>
                    </div>

                    {userClassification ? (
                      <Card>
                        <CardHeader className="p-4 sm:p-6">
                          <CardTitle className="text-base">Active Classification</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-6 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground mb-2">Level</p>
                              <ClassificationBadge 
                                level={userClassification.classificationLevel} 
                                size="md"
                                showTooltip={false}
                              />
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Role Scope</p>
                              <p className="font-medium text-base">{userClassification.roleScope}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Effective From</p>
                              <p className="font-medium text-base">
                                {new Date(userClassification.effectiveFrom).toLocaleDateString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Status</p>
                              <p className="font-medium text-base">
                                {userClassification.effectiveUntil && new Date(userClassification.effectiveUntil) < new Date()
                                  ? 'Expired'
                                  : 'Active'}
                              </p>
                            </div>
                            {userClassification.hasRetainer && userClassification.retainerAmountCents && (
                              <>
                                <div>
                                  <p className="text-sm text-muted-foreground">Retainer Amount</p>
                                  <p className="font-medium text-base">
                                    {(userClassification.retainerAmountCents / 100).toFixed(2)} {userClassification.retainerCurrency}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">Retainer Period</p>
                                  <p className="font-medium text-base capitalize">{userClassification.retainerFrequency}</p>
                                </div>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>No Classification Assigned</AlertTitle>
                        <AlertDescription>
                          This user doesn't have a classification assigned yet. Click the button above to assign one.
                        </AlertDescription>
                      </Alert>
                    )}

                    {classificationHistory.length > 0 ? (
                      <Card>
                        <CardHeader className="p-4 sm:p-6">
                          <CardTitle className="text-base">Classification History</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 sm:p-6">
                          <div className="space-y-2">
                            {classificationHistory.map((history) => (
                              <div key={history.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-muted rounded min-h-[80px] gap-2">
                                <div className="space-y-2 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <ClassificationBadge 
                                      level={history.classificationLevel} 
                                      size="sm"
                                      showTooltip={false}
                                    />
                                    <span className="text-sm font-medium">{history.roleScope}</span>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {new Date(history.effectiveFrom).toLocaleDateString()} - 
                                    {history.effectiveUntil ? new Date(history.effectiveUntil).toLocaleDateString() : 'Present'}
                                  </p>
                                  {history.changeReason && (
                                    <p className="text-xs text-muted-foreground italic">
                                      Reason: {history.changeReason}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ) : !loadingHistory ? (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>No Classification History</AlertTitle>
                        <AlertDescription>
                          This user has no classification history available.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Card>
                        <CardContent className="p-6 text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                          <p className="text-sm text-muted-foreground">Loading classification history...</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={bankAccountFormOpen} onOpenChange={setBankAccountFormOpen}>
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              {user?.bankAccount ? "Edit Bank Account" : "Add Bank Account"}
            </DialogTitle>
          </DialogHeader>
          <BankakAccountForm 
            onSubmit={handleBankAccountSubmit}
            isSubmitting={false}
            existingDetails={user?.bankAccount as any}
            currentUserRole={currentUser?.role}
          />
        </DialogContent>
      </Dialog>

      {user && (
        <ManageClassificationDialog
          open={classificationDialogOpen}
          onOpenChange={setClassificationDialogOpen}
          onSave={handleClassificationSave}
          userId={user.id}
          userName={user.name}
          currentClassification={userClassification}
        />
      )}
    </div>
  );
};

export default UserDetail;
