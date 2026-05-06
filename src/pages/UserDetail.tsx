import { useState, useEffect, useRef, type FC } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useUser } from "@/context/user/UserContext";
import { isProtectedOwner } from "@/lib/protected-accounts";
import { AdminRoleConfirmDialog } from "@/components/ui/AdminRoleConfirmDialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Mail, Phone, Award, Calendar, Edit, UserCheck, UserX, CreditCard, User as UserIcon, ShieldCheck, Briefcase, Building2, FileSignature } from "lucide-react";
import { BankakAccountForm, BankakAccountFormValues } from "@/components/BankakAccountForm";
import type { User } from "@/types/user";
import { AppRole } from "@/types/roles";
import { sudanStates, getLocalitiesByState, getHubNameForState, hubs, getStatesInHub } from "@/data/sudanStates";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { VISIBLE_ROLE_CODES, normalizeRole, toRoleLabel } from "@/utils/roleMapping";
import { ProfileCompletenessIndicator } from "@/components/onboarding/ProfileCompletenessIndicator";

// Use centralized visible role codes (excludes superAdmin)
const availableRoles = VISIBLE_ROLE_CODES;

const UserDetail: FC = () => {
  const { id } = useParams<{ id: string }>();
  const { users, currentUser, updateUser, approveUser, rejectUser, refreshUsers, adminConfirmUserEmail, adminUpdateUserEmail } = useUser();
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [bankAccountFormOpen, setBankAccountFormOpen] = useState(false);

  const roleStr = (currentUser?.role || '').toLowerCase();
  const isAdminRole = roleStr === 'admin' || roleStr === 'super_admin' || roleStr === 'superadmin' || roleStr === 'ict';
  const canEditBankAccount = isAdminRole;
  const isAdmin = isAdminRole || (currentUser?.roles && currentUser.roles.some((r: any) => ['admin', 'super_admin', 'superadmin', 'ict'].includes(String(r).toLowerCase())));
  
  // Debug logging
  console.log('[UserDetail] currentUser role:', currentUser?.role, 'roleStr:', roleStr, 'isAdminRole:', isAdminRole, 'isAdmin:', isAdmin);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<User>>({});

  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isConfirmingEmail, setIsConfirmingEmail] = useState(false);
  const [adminRoleOtpOpen, setAdminRoleOtpOpen] = useState(false);

  // Add loading state for save
  const [isLoadingUser, setIsLoadingUser] = useState(false);

  // Employment record state
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [empDepartmentId, setEmpDepartmentId] = useState<string>("");
  const [empType, setEmpType] = useState<string>("");
  const [empContractStart, setEmpContractStart] = useState<string>("");
  const [empContractEnd, setEmpContractEnd] = useState<string>("");
  const [empReportsTo, setEmpReportsTo] = useState<string>("");
  const [taskDigestOptOut, setTaskDigestOptOut] = useState<boolean>(false);
  const [empSaving, setEmpSaving] = useState(false);
  // Tracks the last successfully saved department to avoid stale-closure issues
  // on consecutive saves within the same session.
  const savedDepartmentIdRef = useRef<string | null>(null);
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);

  // Classification management
  const { canManageFinances } = useAuthorization();
  const { getUserClassification, getClassificationHistory, assignClassification, refreshUserClassifications } = useClassification();
  const [classificationDialogOpen, setClassificationDialogOpen] = useState(false);
  
  const canManageClassifications = canManageFinances();
  const userClassification = user ? getUserClassification(user.id) : undefined;
  const [classificationHistory, setClassificationHistory] = useState<ClassificationHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hubDisplayName, setHubDisplayName] = useState<string | null>(null);
  
  // Location dropdown state management
  const [availableStates, setAvailableStates] = useState<typeof sudanStates>([]);
  const [availableLocalities, setAvailableLocalities] = useState<{ id: string; name: string; }[]>([]);

  useEffect(() => {
    if (id) {
      setIsLoadingUser(true);
      const foundUser = users.find(u => u.id === id);
      if (foundUser) {
        setUser(foundUser);
        // Normalize role to canonical code for dropdown matching
        const normalizedRole = foundUser.role ? (normalizeRole(foundUser.role as string) || foundUser.role) : '';
        setEditForm({ ...foundUser, role: normalizedRole as any });
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

  // Update available states when hub changes in edit mode
  useEffect(() => {
    if (editMode && editForm.hubId) {
      const statesInHub = getStatesInHub(editForm.hubId);
      setAvailableStates(statesInHub);
      
      // If current state is not in the new hub, reset state and locality
      if (editForm.stateId && !statesInHub.some(s => s.id === editForm.stateId)) {
        handleEditChange("stateId", undefined);
        handleEditChange("localityId", undefined);
      }
    } else if (editMode) {
      // If no hub selected, show all states
      setAvailableStates(sudanStates);
    }
  }, [editForm.hubId, editMode]);

  // Update available localities when state changes in edit mode
  useEffect(() => {
    if (editMode && editForm.stateId) {
      const localities = getLocalitiesByState(editForm.stateId);
      setAvailableLocalities(localities);
      
      // If current locality is not in the new state, reset locality
      if (editForm.localityId && !localities.some(l => l.id === editForm.localityId)) {
        handleEditChange("localityId", undefined);
      }
    } else if (editMode) {
      setAvailableLocalities([]);
    }
  }, [editForm.stateId, editMode]);

  // Initialize available states and localities when entering edit mode
  useEffect(() => {
    if (editMode && user) {
      if (user.hubId) {
        const statesInHub = getStatesInHub(user.hubId);
        setAvailableStates(statesInHub);
      } else {
        setAvailableStates(sudanStates);
      }
      
      if (user.stateId) {
        const localities = getLocalitiesByState(user.stateId);
        setAvailableLocalities(localities);
      }
    }
  }, [editMode, user]);

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

  // Load departments and employment data for this user
  useEffect(() => {
    const loadEmploymentData = async () => {
      const [deptRes, usersRes] = await Promise.all([
        supabase.from("departments").select("id, name").order("name"),
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
      ]);
      if (deptRes.error) console.error("[UserDetail] failed to load departments:", deptRes.error.message);
      else setDepartments(deptRes.data as { id: string; name: string }[]);
      if (usersRes.error) console.error("[UserDetail] failed to load profiles for reports-to:", usersRes.error.message);
      else setAllUsers(usersRes.data as { id: string; full_name: string | null; email: string | null }[]);
    };
    loadEmploymentData();
  }, []);

  // Populate employment fields when user loads; initialise the saved-dept ref
  useEffect(() => {
    if (user) {
      const deptId = user.departmentId ?? "";
      setEmpDepartmentId(deptId);
      setEmpType(user.employmentType ?? "");
      setEmpContractStart(user.contractStartDate ?? "");
      setEmpContractEnd(user.contractEndDate ?? "");
      setEmpReportsTo(user.reportsTo ?? "");
      savedDepartmentIdRef.current = deptId || null;
      // Load task digest opt-out from profile
      supabase
        .from("profiles")
        .select("task_digest_opt_out")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) setTaskDigestOptOut(data.task_digest_opt_out === true);
        });
    }
  }, [user?.id]);

  const handleEmploymentSave = async () => {
    if (!user) return;
    setEmpSaving(true);
    try {
      // Use the ref (last successfully saved value) rather than the stale user object
      // so that consecutive saves in the same session compare against the right value.
      const prevDepartmentId = savedDepartmentIdRef.current;

      // When employment record is saved, automatically mark as employee
      const hasEmploymentData = !!(empType || empContractStart || empDepartmentId);
      const { error } = await supabase.from("profiles").update({
        department_id: empDepartmentId || null,
        employment_type: empType || null,
        contract_start_date: empContractStart || null,
        contract_end_date: empContractEnd || null,
        reports_to: empReportsTo || null,
        task_digest_opt_out: taskDigestOptOut,
        is_employee: hasEmploymentData,
        updated_at: new Date().toISOString(),
      }).eq("id", user.id);
      if (error) throw error;

      // Notify employee when department actually changes
      const newDeptId = empDepartmentId || null;
      if (newDeptId !== prevDepartmentId) {
        const newDept = departments.find(d => d.id === newDeptId);
        const deptNameEn = newDept ? newDept.name : null;
        const { error: notifErr } = await supabase.from("notifications").insert({
          event_type: "department_update",
          entity_type: "profile",
          entity_id: user.id,
          recipient_id: user.id,
          triggered_by: currentUser?.id,
          title_en: deptNameEn ? `You have been moved to: ${deptNameEn}` : "You have been removed from your department",
          title_ar: deptNameEn ? `تم نقلك إلى قسم: ${deptNameEn}` : "تمت إزالتك من قسمك",
          message_en: deptNameEn ? `Your department assignment has been updated to "${deptNameEn}".` : "You have been unassigned from your current department.",
          message_ar: deptNameEn ? `تم تحديث قسمك إلى "${deptNameEn}".` : "تمت إزالتك من قسمك الحالي.",
          priority: "medium",
          action_url: `/users/${user.id}`,
        });
        if (notifErr) console.error("[UserDetail] dept notification insert failed:", notifErr.message);
        if (user.email) {
          const { error: emailErr } = await supabase.functions.invoke("send-email", {
            body: {
              to: user.email,
              subject: deptNameEn ? `Department Update — You have been moved to: ${deptNameEn}` : "Department Update",
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px"><div style="background:#0F2041;padding:20px;border-radius:8px 8px 0 0"><h1 style="color:#fff;margin:0;font-size:18px">PACT Command Center</h1></div><div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px"><h2 style="color:#1D3461">Department Update</h2><p>Dear ${user.name},</p><p>${deptNameEn ? `Your department assignment has been updated to "<strong>${deptNameEn}</strong>".` : "You have been unassigned from your current department."}</p><a href="https://app.pactorg.com/users/${user.id}" style="display:inline-block;background:#1D3461;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px">View Profile</a></div></div>`,
            },
          });
          if (emailErr) console.error("[UserDetail] dept email send failed:", emailErr.message);
        }
      }

      // Contract expiry reminders are sent automatically by the
      // contract-expiry-check scheduled edge function (daily at 08:00 UTC).
      // No per-save notification is triggered here to avoid duplicates.

      // Update the ref so subsequent saves in this session use the new value
      savedDepartmentIdRef.current = empDepartmentId || null;

      toast({ title: "Employment record updated" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setEmpSaving(false);
    }
  };

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
      // Check if email was changed - if so, update in Auth first
      // Normalize both emails for comparison (trim whitespace, lowercase)
      const normalizedEditEmail = (editForm.email || '').trim().toLowerCase();
      const normalizedUserEmail = (user.email || '').trim().toLowerCase();
      const emailChanged = normalizedEditEmail !== '' && normalizedEditEmail !== normalizedUserEmail;
      
      console.log('Email comparison:', { 
        editFormEmail: editForm.email, 
        userEmail: user.email, 
        normalizedEditEmail,
        normalizedUserEmail,
        emailChanged 
      });
      
      let newEmail = editForm.email;
      
      if (emailChanged && isAdmin && adminUpdateUserEmail) {
        // Add timeout for edge function call with extended timeout
        const emailPromise = adminUpdateUserEmail(user.id, editForm.email!);
        const timeoutPromise = new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Email update timed out')), 30000)
        );
        
        try {
          const emailSuccess = await Promise.race([emailPromise, timeoutPromise]);
          if (!emailSuccess) {
            toast({
              title: "Email update failed",
              description: "The profile was not updated. Please try again.",
              variant: "destructive"
            });
            setIsSaving(false);
            return;
          }
          // Email was successfully updated via edge function (both Auth and profile)
          newEmail = editForm.email!.toLowerCase();
        } catch (timeoutError) {
          console.error("Email update timeout:", timeoutError);
          toast({
            title: "Request timed out",
            description: "The email update took too long. Please check your connection and try again.",
            variant: "destructive"
          });
          setIsSaving(false);
          return;
        }
      }
      
      // Build updatedUser - if email was changed via edge function, it's already in profile
      // so we use the new email to keep local state in sync
      const updatedUser: User = { 
        ...user, 
        ...editForm,
        email: emailChanged ? newEmail : (editForm.email || user.email)
      };
      
      // Add timeout for profile update with retry logic
      const executeUpdate = async (attempt: number = 1): Promise<boolean> => {
        const updatePromise = updateUser(updatedUser);
        const updateTimeoutPromise = new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Profile update timed out')), 30000)
        );
        
        try {
          return await Promise.race([updatePromise, updateTimeoutPromise]);
        } catch (timeoutError) {
          console.error(`Profile update timeout (attempt ${attempt}):`, timeoutError);
          if (attempt < 2) {
            console.log("Retrying profile update...");
            return executeUpdate(attempt + 1);
          }
          throw timeoutError;
        }
      };
      
      let success: boolean;
      try {
        success = await executeUpdate();
      } catch (timeoutError) {
        console.error("Profile update failed after retries:", timeoutError);
        toast({
          title: "Request timed out",
          description: "The profile update took too long. Please check your connection and try again.",
          variant: "destructive"
        });
        setIsSaving(false);
        return;
      }

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
            secondaryHubId: (profile as any).secondary_hub_id || (profile as any).location?.secondary_hub_id || updatedUser.secondaryHubId || undefined,
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

  const handleConfirmEmail = async () => {
    if (!user || !adminConfirmUserEmail) return;
    setIsConfirmingEmail(true);
    const success = await adminConfirmUserEmail(user.id);
    setIsConfirmingEmail(false);
    if (success) {
      toast({ title: "Email confirmed", description: `${user.name}'s email has been manually confirmed.` });
    }
  };

  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold">Loading profile…</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-bold">User not found</h2>
          <p className="text-muted-foreground text-sm">If this persists, the user may not exist.</p>
          <Button variant="outline" onClick={() => navigate("/users")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Users
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-24">

      {/* ── Hero Banner ─────────────────────────────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-primary via-primary/85 to-primary/60 pt-16">
        {/* back-navigation inside banner */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-0 flex items-center justify-between">
          <button
            onClick={() => navigate("/users")}
            className="flex items-center gap-1.5 text-primary-foreground/80 hover:text-primary-foreground text-sm transition-colors"
            data-testid="button-back-users"
          >
            <ArrowLeft className="h-4 w-4" /> Users
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/signatures')}
              className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10 gap-1.5"
              data-testid="button-goto-signatures"
            >
              <FileSignature className="h-4 w-4" />
              <span className="hidden sm:inline">Signatures</span>
            </Button>
            {isAdmin && !editMode && (
              <Button
                onClick={handleEdit}
                size="sm"
                className="bg-white text-primary hover:bg-white/90 gap-1.5 shadow-sm font-semibold"
                data-testid="button-edit-user"
              >
                <Edit className="h-4 w-4" />
                Edit Profile
              </Button>
            )}
            {editMode && (
              <>
                <Button
                  onClick={() => {
                    const roleEscalation = user && editForm.role !== user.role && ['Admin', 'SuperAdmin'].includes(editForm.role || '');
                    if (roleEscalation && isProtectedOwner(currentUser?.id)) setAdminRoleOtpOpen(true);
                    else handleEditSave();
                  }}
                  disabled={isSaving}
                  size="sm"
                  className="bg-white text-primary hover:bg-white/90 font-semibold shadow-sm"
                >
                  {isSaving ? "Saving…" : "Save Changes"}
                </Button>
                <Button onClick={handleEditCancel} size="sm" variant="ghost" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10">
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Avatar + name row */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-16 flex flex-col sm:flex-row items-center sm:items-end gap-4">
          <div className="relative shrink-0">
            <Avatar className="h-24 w-24 sm:h-28 sm:w-28 shadow-2xl border-4 border-white/30 ring-4 ring-white/10">
              {user.avatar ? (
                <AvatarImage src={user.avatar} alt={user.name} className="object-cover" />
              ) : (
                <AvatarFallback className="bg-white/20 text-white text-3xl font-bold backdrop-blur-sm">
                  {getInitials(user.name)}
                </AvatarFallback>
              )}
            </Avatar>
            <span className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white shadow ${user.isApproved ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </div>
          <div className="text-center sm:text-left flex-1 min-w-0 pb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight truncate">{user.name}</h1>
            <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 mt-2">
              <RoleBadge role={user.role} size="sm" />
              <UserClassificationBadge userId={user.id} />
              <Badge variant={user.isApproved ? "default" : "destructive"} className="text-xs bg-white/20 text-white border-white/30 backdrop-blur-sm">
                {user.isApproved ? "Active" : "Pending"}
              </Badge>
            </div>
            <div className="flex flex-wrap justify-center sm:justify-start gap-x-4 gap-y-1 mt-3 text-primary-foreground/75 text-sm">
              {user.email && (
                <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{user.email}</span>
              )}
              {user.phone && (
                <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{user.phone}</span>
              )}
              {getUserLocation(user) !== "Not set" && (
                <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{getUserLocation(user)}</span>
              )}
            </div>
          </div>

          {/* Admin quick-actions */}
          {isAdmin && !editMode && (
            <div className="flex flex-col gap-2 shrink-0">
              {!user.isApproved && (
                <>
                  <Button onClick={handleApprove} disabled={isApproving} size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 shadow" data-testid="button-approve-user">
                    <UserCheck className="h-3.5 w-3.5" />{isApproving ? 'Approving…' : 'Approve'}
                  </Button>
                  <Button onClick={handleReject} disabled={isRejecting} size="sm" variant="destructive" className="gap-1.5 shadow" data-testid="button-reject-user">
                    <UserX className="h-3.5 w-3.5" />{isRejecting ? 'Rejecting…' : 'Reject'}
                  </Button>
                </>
              )}
              <Button onClick={handleConfirmEmail} disabled={isConfirmingEmail} size="sm" variant="ghost" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10 gap-1.5" data-testid="button-confirm-email">
                <ShieldCheck className="h-3.5 w-3.5" />{isConfirmingEmail ? 'Confirming…' : 'Confirm Email'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Content (overlaps the banner by pulling up with -mt) ──────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-10">

        {/* Profile completeness card */}
        {(currentUser?.id === user.id || isAdmin) && (
          <div className="mb-4">
            <ProfileCompletenessIndicator user={user} />
          </div>
        )}

        {/* ── Main Tab Panel ──────────────────────────────────────────────── */}
        <Card className="shadow-xl border-0 overflow-hidden rounded-2xl">
          <Tabs defaultValue="profile" className="w-full">
            {/* Tab bar */}
            <div className="border-b bg-background">
              <TabsList className="flex flex-row flex-nowrap h-auto p-0 bg-transparent w-full justify-start overflow-x-auto scrollbar-hide rounded-none gap-0">
                {[
                  { value: 'profile',        icon: <UserIcon className="h-4 w-4" />,    label: 'Profile'       },
                  { value: 'employment',     icon: <Briefcase className="h-4 w-4" />,   label: 'Employment'    },
                  { value: 'location',       icon: <MapPin className="h-4 w-4" />,      label: 'Location'      },
                  { value: 'performance',    icon: <Award className="h-4 w-4" />,       label: 'Performance'   },
                  { value: 'bank',           icon: <CreditCard className="h-4 w-4" />,  label: 'Bank'          },
                  ...(canManageClassifications
                    ? [{ value: 'classification', icon: <ShieldCheck className="h-4 w-4" />, label: 'Classification' }]
                    : []),
                ].map(t => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="flex items-center gap-1.5 px-4 py-3.5 text-xs sm:text-sm font-medium text-muted-foreground border-b-2 border-transparent rounded-none whitespace-nowrap
                      data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-transparent
                      hover:text-foreground hover:bg-muted/40 transition-all"
                  >
                    {t.icon}{t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* ── PROFILE TAB ─────────────────────────────────────────────── */}
            <TabsContent value="profile" className="p-5 sm:p-6 space-y-5 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Full Name</h3>
                  {editMode ? (
                    <Input value={editForm.name || ""} onChange={e => handleEditChange("name", e.target.value)} className="h-11 bg-background rounded-lg" />
                  ) : (
                    <p className="font-semibold text-base">{user.name}</p>
                  )}
                </div>
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Email</h3>
                  {editMode ? (
                    <Input type="email" value={editForm.email || ""} onChange={e => handleEditChange("email", e.target.value)} className="h-11 bg-background rounded-lg" />
                  ) : (
                    <p className="font-semibold text-base break-all">{user.email}</p>
                  )}
                </div>
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Phone</h3>
                  {editMode ? (
                    <Input value={editForm.phone || ""} onChange={e => handleEditChange("phone", e.target.value)} className="h-11 bg-background rounded-lg" placeholder="+249 xxx xxx xxx" />
                  ) : (
                    <p className="font-semibold text-base font-mono">{user.phone || <span className="text-muted-foreground italic font-sans">Not set</span>}</p>
                  )}
                </div>
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Employee ID</h3>
                  {editMode ? (
                    <Input value={editForm.employeeId || ""} onChange={e => handleEditChange("employeeId", e.target.value)} className="h-11 bg-background rounded-lg" />
                  ) : (
                    <p className="font-semibold text-base">{user.employeeId || <span className="text-muted-foreground italic">Not set</span>}</p>
                  )}
                </div>
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Role</h3>
                  {editMode ? (
                    <select
                      className="border rounded-lg px-3 py-2 w-full h-11 text-sm bg-background disabled:opacity-60 disabled:cursor-not-allowed"
                      value={editForm.role || ""}
                      onChange={e => handleEditChange("role", e.target.value)}
                      disabled={isProtectedOwner(user?.id)}
                      title={isProtectedOwner(user?.id) ? "This account's role is permanently protected" : undefined}
                    >
                      <option value="" disabled>Select role</option>
                      {availableRoles.map(role => (
                        <option key={role} value={role}>{toRoleLabel(role) || role}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex gap-2 items-center flex-wrap">
                      <RoleBadge role={user.role} size="sm" />
                      <UserClassificationBadge userId={user.id} />
                    </div>
                  )}
                </div>
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Status</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={user.isApproved ? "default" : "destructive"} className="px-3 py-1.5 text-xs font-semibold rounded-full">
                      {user.isApproved ? 'Active' : 'Pending Approval'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Last active: {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              {editMode && (
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={() => {
                      const roleEscalation = user && editForm.role !== user.role && ['Admin', 'SuperAdmin'].includes(editForm.role || '');
                      if (roleEscalation && isProtectedOwner(currentUser?.id)) setAdminRoleOtpOpen(true);
                      else handleEditSave();
                    }}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving…" : "Save Changes"}
                  </Button>
                  <Button onClick={handleEditCancel} variant="outline">Cancel</Button>
                </div>
              )}
            </TabsContent>

            {/* ── EMPLOYMENT TAB ──────────────────────────────────────────── */}
            <TabsContent value="employment" className="p-5 sm:p-6 space-y-5 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40">
                  <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" /> Department
                  </h4>
                  {isAdmin ? (
                    <Select value={empDepartmentId || "none"} onValueChange={v => setEmpDepartmentId(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-11" data-testid="select-emp-department"><SelectValue placeholder="No department" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Department</SelectItem>
                        {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-base">{departments.find(d => d.id === empDepartmentId)?.name || "—"}</p>
                  )}
                </div>

                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40">
                  <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Employment Type</h4>
                  {isAdmin ? (
                    <Select value={empType} onValueChange={setEmpType}>
                      <SelectTrigger className="h-11" data-testid="select-emp-type"><SelectValue placeholder="Select contract type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full-time">Full-Time</SelectItem>
                        <SelectItem value="part-time">Part-Time</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="intern">Intern</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-base capitalize">{empType || "—"}</p>
                  )}
                </div>

                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40">
                  <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Contract Start Date</h4>
                  {isAdmin ? (
                    <Input type="date" value={empContractStart} onChange={e => setEmpContractStart(e.target.value)} className="h-11" data-testid="input-contract-start" />
                  ) : (
                    <p className="font-semibold text-base">{empContractStart || "—"}</p>
                  )}
                </div>

                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40">
                  <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Contract End Date</h4>
                  {isAdmin ? (
                    <Input type="date" value={empContractEnd} onChange={e => setEmpContractEnd(e.target.value)} className="h-11" data-testid="input-contract-end" />
                  ) : (
                    <p className="font-semibold text-base">{empContractEnd || "—"}</p>
                  )}
                  {empContractEnd && (() => {
                    const d = Math.ceil((new Date(empContractEnd).getTime() - Date.now()) / 86400000);
                    if (d < 0) return <p className="text-xs text-destructive font-medium">Contract expired</p>;
                    if (d <= 30) return <p className="text-xs text-amber-600 font-medium">Expires in {d} day{d === 1 ? "" : "s"}</p>;
                    return null;
                  })()}
                </div>

                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 sm:col-span-2">
                  <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <UserCheck className="h-3.5 w-3.5" /> Reports To (Manager)
                  </h4>
                  {isAdmin ? (
                    <Select value={empReportsTo || "none"} onValueChange={v => setEmpReportsTo(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-11" data-testid="select-reports-to"><SelectValue placeholder="No manager" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Manager</SelectItem>
                        {allUsers.filter(u => u.id !== user.id).map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || u.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-base">{allUsers.find(u => u.id === empReportsTo)?.full_name || "—"}</p>
                  )}
                </div>
              </div>

              {isAdmin && (
                <div className="bg-muted/20 rounded-xl p-4 border border-border/40 space-y-2">
                  <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Notification Preferences</h4>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={taskDigestOptOut} onChange={e => setTaskDigestOptOut(e.target.checked)} data-testid="toggle-task-digest-opt-out" />
                      <div onClick={() => setTaskDigestOptOut(v => !v)} className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${taskDigestOptOut ? 'bg-destructive' : 'bg-muted'} border border-border/60`}>
                        <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${taskDigestOptOut ? 'translate-x-5' : 'translate-x-0'}`} />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Opt out of Daily Task Digest email</p>
                      <p className="text-xs text-muted-foreground">User will not receive the daily task summary email.</p>
                    </div>
                  </label>
                </div>
              )}

              {isAdmin && (
                <div className="flex justify-end pt-2">
                  <Button onClick={handleEmploymentSave} disabled={empSaving} data-testid="button-save-employment">
                    {empSaving ? "Saving…" : "Save Employment Record"}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── LOCATION TAB ────────────────────────────────────────────── */}
            <TabsContent value="location" className="p-5 sm:p-6 space-y-5 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Hub</h3>
                  {editMode ? (
                    <Select value={editForm.hubId || ""} onValueChange={v => handleEditChange("hubId", v)}>
                      <SelectTrigger className="h-11 bg-background"><SelectValue placeholder="Select hub" /></SelectTrigger>
                      <SelectContent>{hubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-base">{hubDisplayName || user.hubId || <span className="text-muted-foreground">Not set</span>}</p>
                  )}
                </div>
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Secondary Hub</h3>
                  {editMode ? (
                    <Select value={editForm.secondaryHubId || "__none__"} onValueChange={v => handleEditChange("secondaryHubId", v === "__none__" ? undefined : v)}>
                      <SelectTrigger className="h-11 bg-background"><SelectValue placeholder="No secondary hub" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No secondary hub</SelectItem>
                        {hubs.filter(h => h.id !== editForm.hubId).map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-base">{user.secondaryHubId ? (hubs.find(h => h.id === user.secondaryHubId)?.name || user.secondaryHubId) : <span className="text-muted-foreground">None</span>}</p>
                  )}
                </div>
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">State</h3>
                  {editMode ? (
                    <Select value={editForm.stateId || ""} onValueChange={v => handleEditChange("stateId", v)} disabled={!editForm.hubId}>
                      <SelectTrigger className="h-11 bg-background"><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent>{availableStates.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-base">{user.stateId ? (sudanStates.find(s => s.id === user.stateId)?.name || user.stateId) : <span className="text-muted-foreground">Not set</span>}</p>
                  )}
                </div>
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Locality</h3>
                  {editMode ? (
                    <Select value={editForm.localityId || "__none__"} onValueChange={v => handleEditChange("localityId", v === "__none__" ? undefined : v)} disabled={!editForm.stateId}>
                      <SelectTrigger className="h-11 bg-background"><SelectValue placeholder="Select locality (optional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {availableLocalities.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-base">{user.stateId && user.localityId ? (getLocalitiesByState(user.stateId).find(l => l.id === user.localityId)?.name || user.localityId) : <span className="text-muted-foreground">Not set</span>}</p>
                  )}
                </div>
              </div>

              {editMode && (
                <div className="flex items-center gap-3 pt-2">
                  <Button onClick={() => { const re = user && editForm.role !== user.role && ['Admin','SuperAdmin'].includes(editForm.role||''); if(re && isProtectedOwner(currentUser?.id)) setAdminRoleOtpOpen(true); else handleEditSave(); }} disabled={isSaving}>
                    {isSaving ? "Saving…" : "Save Location"}
                  </Button>
                  <Button onClick={handleEditCancel} variant="outline">Cancel</Button>
                </div>
              )}

              {user.location && (
                <div className="pt-2 space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4" />GPS Location Data
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Latitude', value: String(user.location.latitude) },
                      { label: 'Longitude', value: String(user.location.longitude) },
                      { label: 'Sharing', value: user.location.isSharing ? 'Enabled' : 'Disabled' },
                      { label: 'Last Updated', value: user.location.lastUpdated ? new Date(user.location.lastUpdated).toLocaleDateString() : 'N/A' },
                    ].map(item => (
                      <div key={item.label} className="bg-muted/20 rounded-xl p-3 border border-border/40 space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{item.label}</p>
                        <p className="font-semibold text-sm font-mono">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── PERFORMANCE TAB ─────────────────────────────────────────── */}
            <TabsContent value="performance" className="p-5 sm:p-6 mt-0">
              {user.performance ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Rating', value: `${user.performance.rating}/5`, color: 'text-primary' },
                    { label: 'Completed Tasks', value: String(user.performance.totalCompletedTasks), color: 'text-foreground' },
                    { label: 'On-Time Completion', value: `${user.performance.onTimeCompletion}%`, color: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Current Workload', value: String(user.performance.currentWorkload || 0), color: 'text-foreground' },
                  ].map(kpi => (
                    <div key={kpi.label} className="bg-muted/20 rounded-xl p-5 flex flex-col justify-center border border-border/40">
                      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest mb-2">{kpi.label}</h3>
                      <p className={`text-2xl sm:text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="p-4 rounded-2xl bg-muted/30 w-fit mx-auto mb-4">
                    <Award className="h-12 w-12 text-muted-foreground/40" />
                  </div>
                  <p className="text-muted-foreground">No performance data available yet.</p>
                </div>
              )}
            </TabsContent>

            {/* ── BANK TAB ─────────────────────────────────────────────────── */}
            <TabsContent value="bank" className="p-5 sm:p-6 mt-0">
              {user.bankAccount ? (
                <div className="space-y-4">
                  <div className="bg-muted/20 rounded-xl p-5 border border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Account Name</p>
                      <p className="font-semibold text-base break-words">{user.bankAccount.accountName}</p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Account Number</p>
                      <p className="font-semibold text-base font-mono">{user.bankAccount.accountNumber}</p>
                    </div>
                    <div className="sm:col-span-2 space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Branch</p>
                      <p className="font-semibold text-base break-words">{user.bankAccount.branch}</p>
                    </div>
                  </div>
                  {canEditBankAccount && (
                    <Button onClick={() => setBankAccountFormOpen(true)} className="gap-2">
                      <Edit className="h-4 w-4" />Edit Bank Account
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-16 space-y-4">
                  <div className="p-4 rounded-2xl bg-muted/30 w-fit mx-auto">
                    <CreditCard className="h-12 w-12 text-muted-foreground/40" />
                  </div>
                  <p className="text-muted-foreground">No bank account details yet.</p>
                  {canEditBankAccount && (
                    <Button onClick={() => setBankAccountFormOpen(true)} className="gap-2">
                      <Plus className="h-4 w-4" />Add Bank Account
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ── CLASSIFICATION TAB ─────────────────────────────────────── */}
            {canManageClassifications && (
              <TabsContent value="classification" className="p-5 sm:p-6 space-y-6 mt-0">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-base font-semibold">Classification & Compensation</h3>
                    <p className="text-sm text-muted-foreground">Manage classification level and retainer fees</p>
                  </div>
                  <Button onClick={() => setClassificationDialogOpen(true)} className="gap-2 w-full sm:w-auto" data-testid="button-manage-classification">
                    {userClassification ? <><Edit className="h-4 w-4" />Update</> : <><Plus className="h-4 w-4" />Assign</>}
                  </Button>
                </div>

                {userClassification ? (
                  <Card className="overflow-hidden border-l-4 border-l-primary">
                    <CardHeader className="p-4 bg-gradient-to-r from-primary/5 to-transparent">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Award className="h-5 w-5 text-primary" />
                          <CardTitle className="text-sm font-semibold">Active Classification</CardTitle>
                        </div>
                        <Badge variant={userClassification.effectiveUntil && new Date(userClassification.effectiveUntil) < new Date() ? "destructive" : "default"} className="text-xs">
                          {userClassification.effectiveUntil && new Date(userClassification.effectiveUntil) < new Date() ? 'Expired' : 'Active'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-muted/50 rounded-lg p-3 text-center">
                          <p className="text-xs text-muted-foreground mb-1">Level</p>
                          <div className="flex justify-center">
                            <ClassificationBadge level={userClassification.classificationLevel} size="md" showTooltip={false} />
                          </div>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3 text-center">
                          <p className="text-xs text-muted-foreground mb-1">Role</p>
                          <p className="font-semibold text-sm capitalize">{userClassification.roleScope}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3 text-center">
                          <p className="text-xs text-muted-foreground mb-1">From</p>
                          <p className="font-semibold text-sm">{new Date(userClassification.effectiveFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3 text-center">
                          <p className="text-xs text-muted-foreground mb-1">Until</p>
                          <p className="font-semibold text-sm">{userClassification.effectiveUntil ? new Date(userClassification.effectiveUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Ongoing'}</p>
                        </div>
                      </div>
                      {userClassification.hasRetainer && userClassification.retainerAmountCents ? (
                        <div className="pt-3 border-t grid grid-cols-2 gap-3">
                          <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                            <CreditCard className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Amount</p>
                              <p className="font-bold text-green-700 dark:text-green-400">{(userClassification.retainerAmountCents / 100).toLocaleString()} {userClassification.retainerCurrency}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
                            <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Frequency</p>
                              <p className="font-semibold capitalize">{userClassification.retainerFrequency}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground pt-2 border-t">No retainer fee configured</p>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-dashed border-2">
                    <CardContent className="p-10 text-center space-y-3">
                      <div className="p-4 rounded-full bg-muted/50 inline-block">
                        <ShieldCheck className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <h4 className="font-semibold text-lg">No Classification Assigned</h4>
                      <p className="text-muted-foreground text-sm max-w-md mx-auto">Assign a classification level to enable fee calculations and retainer payments.</p>
                    </CardContent>
                  </Card>
                )}

                <Card className="shadow-sm">
                  <CardHeader className="p-4 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-semibold">Classification History</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    {loadingHistory ? (
                      <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                        <span className="text-sm">Loading history…</span>
                      </div>
                    ) : classificationHistory.length > 0 ? (
                      <div className="space-y-3">
                        {classificationHistory.map((history, index) => (
                          <div key={history.id} className="flex items-start gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <ClassificationBadge level={history.classificationLevel} size="sm" showTooltip={false} />
                                <Badge variant="outline" className="text-xs capitalize">{history.roleScope}</Badge>
                                {index === 0 && classificationHistory.length > 1 && <Badge variant="secondary" className="text-xs">Previous</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {new Date(history.effectiveFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                {' → '}
                                {history.effectiveUntil ? new Date(history.effectiveUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Present'}
                              </p>
                              {history.changeReason && <p className="text-xs text-muted-foreground mt-1.5 pl-2 border-l-2 border-muted-foreground/30">{history.changeReason}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p className="text-sm">No classification history yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </Card>
      </div>

      <Dialog open={bankAccountFormOpen} onOpenChange={setBankAccountFormOpen}>
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{user?.bankAccount ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle>
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

      <AdminRoleConfirmDialog
        open={adminRoleOtpOpen}
        onClose={() => setAdminRoleOtpOpen(false)}
        onConfirmed={async () => { setAdminRoleOtpOpen(false); await handleEditSave(); }}
        targetUserName={user?.name || 'this user'}
        targetRole={editForm.role || ''}
        currentUserName={currentUser?.name || 'Platform Owner'}
      />
    </div>
  );
};

export default UserDetail;
