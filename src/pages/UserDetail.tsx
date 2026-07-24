import { useState, useEffect, useRef, type FC } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "@/context/user/UserContext";
import { isProtectedOwner } from "@/lib/protected-accounts";
import { AdminRoleConfirmDialog } from "@/components/ui/AdminRoleConfirmDialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Mail, Phone, Award, Calendar, Edit, UserCheck, UserX, CreditCard, User as UserIcon, ShieldCheck, Briefcase, Building2, FileSignature, Upload, Download, Trash2, Loader2, FileText, Eye, GraduationCap, Zap, Globe, FolderOpen, ChevronDown, Info, Camera, RefreshCw } from "lucide-react";
import { BankakAccountForm, BankakAccountFormValues } from "@/components/BankakAccountForm";
import type { User } from "@/types/user";
import { AppRole } from "@/types/roles";
import { sudanStates, getLocalitiesByState, getHubNameForState, hubs, getStatesInHub } from "@/data/sudanStates";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { insertNotificationsToDb } from "@/services/notification-insert";
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
import { VISIBLE_ROLE_CODES, normalizeRole, toRoleLabel, getRoleHint } from "@/utils/roleMapping";
import { ProfileCompletenessIndicator } from "@/components/onboarding/ProfileCompletenessIndicator";
import EmployeePersonalTab from "@/components/hr/EmployeePersonalTab";
import EmployeeEducationTab from "@/components/hr/EmployeeEducationTab";
import EmployeeDependentsTab from "@/components/hr/EmployeeDependentsTab";
import EmployeeNextOfKinSection from "@/components/hr/EmployeeNextOfKinSection";
import EmployeeITAccountsTab from "@/components/hr/EmployeeITAccountsTab";
import EmployeeEquipmentTab from "@/components/hr/EmployeeEquipmentTab";
import EmployeePoliciesTab from "@/components/hr/EmployeePoliciesTab";
import EmployeeDocumentsTab from "@/components/hr/EmployeeDocumentsTab";
import EmployeeSkillsTab from "@/components/hr/EmployeeSkillsTab";
import EmployeeTrainingTab from "@/components/hr/EmployeeTrainingTab";
import EmployeeBenefitsTab from "@/components/hr/EmployeeBenefitsTab";
import { generateEmployeeCV } from "@/utils/employeeCvExport";
import {
  generateReverseChronologicalCV,
  generateFunctionalCV,
  generateCombinationCV,
  generateEuropassCV,
  CV_FORMAT_OPTIONS,
  type CvFormatId,
} from "@/utils/cvFormats";
import { syncProfileFolder, getProfileSummarySignedUrl, computeFolderName, ensureWorkspaceHubFolders, syncDocsToWorkspaceOnly } from "@/utils/employeeProfileFolder";
import EmployeeBadgeDialog from "@/components/hr/EmployeeBadgeDialog";

// Use centralized visible role codes (excludes superAdmin)
const availableRoles = VISIBLE_ROLE_CODES;

const TAB_GROUPS = [
  {
    id: 'profile', label: 'Profile', color: '#3b82f6', Icon: UserIcon,
    tabs: [
      { id: 'overview',    emoji: '🏠', label: 'Overview',              description: 'General info — name, contact details, employee ID, role, and account status at a glance.' },
      { id: 'employment',  emoji: '💼', label: 'Employment & Contract',  description: 'Contract type, department, hub assignment, employment start/end dates, and terms.' },
      { id: 'personal',    emoji: '👤', label: 'Personal Details',       description: 'Date of birth, nationality, marital status, and personal identification details.' },
      { id: 'location',    emoji: '📍', label: 'Location & Work',        description: 'Work hub, assigned state and locality for field staff, or country/city for non-field staff.' },
    ],
  },
  {
    id: 'background', label: 'Background', color: '#8b5cf6', Icon: GraduationCap,
    tabs: [
      { id: 'education',   emoji: '🎓', label: 'Education & Experience', description: 'Academic qualifications, institutions, graduation years, and prior work experience history.' },
      { id: 'documents',   emoji: '📁', label: 'Document Vault',         description: 'Uploaded staff documents — contracts, national IDs, certificates, and other files.' },
      { id: 'skills',      emoji: '⚡', label: 'Skills & Languages',     description: 'Professional skills, language proficiencies, and competency levels recorded for this staff member.' },
      { id: 'training',    emoji: '🏅', label: 'Training & Certs',       description: 'Training courses, professional certifications, licenses, and workshops attended.' },
      { id: 'dependents',  emoji: '👨‍👩‍👧', label: 'Dependents',            description: 'Family members, dependents, and designated insurance/benefit beneficiaries.' },
      { id: 'equipment',   emoji: '🖥️', label: 'Equipment',   description: 'Organizational assets currently or previously assigned to this employee — laptops, phones, access cards, and other issued equipment.' },
      { id: 'policies',    emoji: '📋', label: 'Policy Acknowledgements', description: 'Track which organizational policies this employee has read and formally acknowledged, including timestamps and digital sign-off records.' },
    ],
  },
  {
    id: 'finance', label: 'Finance', color: '#D97706', Icon: CreditCard,
    tabs: [
      { id: 'compensation', emoji: '💰', label: 'Compensation & Bank',   description: 'Salary grade, bank account details, payment method, and pay history for this staff member.' },
      { id: 'performance',  emoji: '📊', label: 'Performance',           description: 'Performance review scores, quarterly objectives, and development notes from review cycles.' },
      { id: 'benefits',     emoji: '🩺', label: 'Benefits',              description: 'Active benefit enrollments, open enrollment requests, and covered dependents for this staff member.' },
    ],
  },
  {
    id: 'system', label: 'System', color: '#ef4444', Icon: ShieldCheck,
    tabs: [
      { id: 'access',      emoji: '🔒', label: 'Access & Security',       description: 'User role assignment, login history, two-factor authentication status, and page-level permission overrides.' },
      { id: 'it-accounts', emoji: '💻', label: 'IT Accounts', adminOnly: true, description: 'Provisioned system accounts, usernames, and access status across organizational tools.' },
    ],
  },
];

/* ── Location & Work helpers (module-level — never redefined on render) ─── */
function LocField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
        {label}
        {required && <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full">Required</span>}
      </h3>
      {children}
    </div>
  );
}

interface LocAddressValues { country: string; city: string; address_line1: string; address_line2: string; }
function LocationAddressForm({ initialValues, saving, onSave, onCancel, isAdmin }: {
  initialValues: LocAddressValues;
  saving: boolean;
  onSave: (v: LocAddressValues) => void;
  onCancel: () => void;
  isAdmin: boolean;
}) {
  const [v, setV] = useState<LocAddressValues>(initialValues);
  const upd = (k: keyof LocAddressValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV(prev => ({ ...prev, [k]: e.target.value }));
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <LocField label="Country">
          <Input value={v.country} onChange={upd('country')} className="h-11 bg-background" placeholder="e.g. Sudan" />
        </LocField>
        <LocField label="City">
          <Input value={v.city} onChange={upd('city')} className="h-11 bg-background" placeholder="e.g. Khartoum" />
        </LocField>
        <LocField label="Address Line 1">
          <Input value={v.address_line1} onChange={upd('address_line1')} className="h-11 bg-background" placeholder="Street / Block / Area" />
        </LocField>
        <LocField label="Address Line 2">
          <Input value={v.address_line2} onChange={upd('address_line2')} className="h-11 bg-background" placeholder="Apartment / Building (optional)" />
        </LocField>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={() => onSave(v)} disabled={saving}>
            {saving ? "Saving…" : "Save Location"}
          </Button>
          <Button onClick={onCancel} variant="outline">Cancel</Button>
        </div>
      )}
    </>
  );
}

const UserDetail: FC = () => {
  const { id } = useParams<{ id: string }>();
  const { users, currentUser, updateUser, approveUser, rejectUser, refreshUsers, adminConfirmUserEmail, adminUpdateUserEmail } = useUser();
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [bankAccountFormOpen, setBankAccountFormOpen] = useState(false);
  const [deleteBankAccountConfirmOpen, setDeleteBankAccountConfirmOpen] = useState(false);
  const [isDeletingBankAccount, setIsDeletingBankAccount] = useState(false);

  const roleStr = (currentUser?.role || '').toLowerCase();
  const isAdminRole = roleStr === 'admin' || roleStr === 'super_admin' || roleStr === 'superadmin' || roleStr === 'ict' || roleStr === 'hr_admin';
  const canEditBankAccount = isAdminRole;
  const isAdmin = isAdminRole || (currentUser?.roles && currentUser.roles.some((r: any) => ['admin', 'super_admin', 'superadmin', 'ict', 'hr_admin'].includes(String(r).toLowerCase())));

  // Classification & Compensation is only relevant for field-staff roles.
  // Check the VIEWED user's primary role AND additional roles.
  const FIELD_STAFF_ROLES = ['supervisor', 'coordinator', 'datacollector', 'data_collector', 'hubsupervisor', 'hub_supervisor'];
  const viewedUserRole = (user?.role || '').toLowerCase().replace(/[\s_-]/g, '');
  const viewedUserAdditional = [
    ...(Array.isArray(user?.additionalRoles) ? user.additionalRoles : []),
    ...(Array.isArray(user?.roles) ? user.roles : []),
  ].map((r: any) => String(r).toLowerCase().replace(/[\s_-]/g, ''));
  const showCompensation = FIELD_STAFF_ROLES.includes(viewedUserRole) ||
    viewedUserAdditional.some(r => FIELD_STAFF_ROLES.includes(r));

  // Only Admin, SuperAdmin, and HR_Admin can edit profile data.
  // ICT and other admin-tier roles are view-only on employee profiles.
  const EDIT_ROLES = ['admin', 'super_admin', 'superadmin', 'hr_admin'];
  const canEditProfile = EDIT_ROLES.includes(roleStr)
    || (currentUser?.roles && currentUser.roles.some((r: any) => EDIT_ROLES.includes(String(r).toLowerCase())));
  
  // Debug logging
  console.log('[UserDetail] currentUser role:', currentUser?.role, 'roleStr:', roleStr, 'isAdminRole:', isAdminRole, 'isAdmin:', isAdmin);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<User>>({});
  const [isSaving, setIsSaving] = useState(false);
  // Synchronous reentrancy guard — prevents concurrent handleEditSave calls
  // even when React hasn't yet re-rendered the disabled button state
  const isSavingRef = useRef(false);

  // ── Avatar upload ─────────────────────────────────────────────────────────
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  // Local count so UI updates immediately after a successful upload
  const [localPhotoCount, setLocalPhotoCount] = useState<number | null>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast({ title: 'Invalid file', description: 'Please choose an image file.', variant: 'destructive' }); return; }
    setAvatarUploading(true);
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg';
      const path = `avatars/${user.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${publicUrl}?t=${Date.now()}`;
      // Use the SECURITY DEFINER RPC so any authenticated user can update their own
      // avatar while enforcing the 3-upload cap for non-admins.
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('update_profile_avatar', { p_user_id: user.id, p_url: url });
      if (rpcErr) throw rpcErr;
      if (rpcResult?.error) throw new Error(rpcResult.error);
      const updatedUser = { ...user, avatar: url, photoUploadCount: rpcResult?.count ?? ((user.photoUploadCount ?? 0) + 1) };
      setUser(prev => prev ? updatedUser : prev);
      setLocalPhotoCount(rpcResult?.count ?? ((localPhotoCount ?? (user.photoUploadCount ?? 0)) + 1));
      toast({ title: 'Photo updated', description: 'Profile picture saved successfully.' });
      // Silently sync the new photo into the workspace folder (if folder already exists)
      void syncDocsToWorkspaceOnly(updatedUser);
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSection = searchParams.get('tab') || 'overview';
  const activeSection = TAB_GROUPS.flatMap(g => g.tabs).some(t => t.id === rawSection) ? rawSection : 'overview';
  const setActiveSection = (section: string) => {
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('tab', section); return p; }, { replace: true });
  };
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const activeGroup = TAB_GROUPS.find(g => g.tabs.some(t => t.id === activeSection)) ?? TAB_GROUPS[0];
  const activeTabInGroup = activeGroup.tabs.find(t => t.id === activeSection) ?? activeGroup.tabs[0];
  const accent = activeGroup.color;
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
  const [empCountryCode, setEmpCountryCode] = useState<string>("");
  const [empProbationEnd, setEmpProbationEnd] = useState<string>("");
  const [empProbationConfirmed, setEmpProbationConfirmed] = useState<boolean>(false);
  const [showConfirmEmploymentDialog, setShowConfirmEmploymentDialog] = useState(false);
  const [empWorkingPattern, setEmpWorkingPattern] = useState<string>("");
  const [empSaving, setEmpSaving] = useState(false);
  const [empEditMode, setEmpEditMode] = useState(false);
  const [regenIdConfirm, setRegenIdConfirm] = useState(false);
  const [regenIdLoading, setRegenIdLoading] = useState(false);
  const [cvExporting, setCvExporting] = useState(false);
  const [showCvMenu, setShowCvMenu] = useState(false);
  const cvMenuRef = useRef<HTMLDivElement>(null);
  const [showBadgeDialog, setShowBadgeDialog] = useState(false);
  const [empSummary, setEmpSummary] = useState<string>("");
  const [profileFolderPath, setProfileFolderPath] = useState<string | null>(null);
  const [folderSyncing, setFolderSyncing] = useState(false);
  const [docsSyncing, setDocsSyncing] = useState(false);
  const [docsVerified, setDocsVerified] = useState<{ allVerified: boolean; verified: number; total: number }>({ allVerified: false, verified: 0, total: 0 });
  const [hasPersonalDetails, setHasPersonalDetails] = useState(false);
  const [contractPreview, setContractPreview] = useState<{ url: string; name: string; mime: string | null } | null>(null);
  const [perfTrend, setPerfTrend] = useState<{ period: string; rating: number }[]>([]);
  const [employeeReviews, setEmployeeReviews] = useState<any[]>([]);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<any | null>(null);
  const [savingReview, setSavingReview] = useState(false);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  const [viewingReview, setViewingReview] = useState<any | null>(null);
  const [reviewForm, setReviewForm] = useState({
    review_period: '', review_type: 'annual', overall_rating: 0,
    strengths: '', development_areas: '', manager_comments: '', next_goals: '',
  });
  // Tracks the last successfully saved department to avoid stale-closure issues
  // on consecutive saves within the same session.
  const savedDepartmentIdRef = useRef<string | null>(null);
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);

  // ── Additional / secondary roles ─────────────────────────────────────────
  // ── Additional roles stored as JSONB on profiles.additional_roles ──────────
  // Schema: [{role, hub_id, assigned_at, assigned_by}]
  // Migration (run once in Supabase SQL Editor):
  //   ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS additional_roles jsonb DEFAULT '[]'::jsonb;
  interface AdditionalRole { role: string; hub_id: string | null; assigned_at: string | null; assigned_by?: string | null }
  const [additionalRoles, setAdditionalRoles] = useState<AdditionalRole[]>([]);
  const [addRoleMode, setAddRoleMode]           = useState(false);
  const [newRolePick, setNewRolePick]           = useState('');
  const [newRoleHub, setNewRoleHub]             = useState('');
  const [addRoleSaving, setAddRoleSaving]       = useState(false);
  const [rolesNeedsMigration, setRolesNeedsMigration] = useState(false);

  const fetchAdditionalRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('additional_roles')
      .eq('id', userId)
      .single();
    if (error?.message?.includes('additional_roles')) {
      // Column not yet added — migration not applied
      setRolesNeedsMigration(true);
      setAdditionalRoles([]);
    } else if (error) {
      setAdditionalRoles([]);
    } else {
      const arr = Array.isArray(data?.additional_roles) ? data.additional_roles : [];
      setAdditionalRoles(arr as AdditionalRole[]);
      setRolesNeedsMigration(false);
    }
  };

  const saveAdditionalRoles = async (updated: AdditionalRole[]) => {
    const { error } = await supabase
      .from('profiles')
      .update({ additional_roles: updated })
      .eq('id', user!.id);
    if (error?.message?.includes('additional_roles')) {
      setRolesNeedsMigration(true);
      throw new Error('Migration needed — see panel for instructions.');
    }
    if (error) throw error;
    setAdditionalRoles(updated);
  };

  const handleAddRole = async () => {
    if (!user || !newRolePick) return;
    setAddRoleSaving(true);
    try {
      const alreadyExists = additionalRoles.some(r => r.role === newRolePick);
      if (alreadyExists) {
        toast({ title: 'Role already assigned', description: `${toRoleLabel(newRolePick)} is already an additional role for this user.`, variant: 'destructive' });
        return;
      }
      const newEntry: AdditionalRole = {
        role: newRolePick,
        hub_id: newRoleHub || null,
        assigned_at: new Date().toISOString(),
        assigned_by: currentUser?.id ?? null,
      };
      await saveAdditionalRoles([...additionalRoles, newEntry]);
      toast({ title: 'Role added', description: `${toRoleLabel(newRolePick)} added as an additional role.` });
      setAddRoleMode(false);
      setNewRolePick('');
      setNewRoleHub('');
    } catch (e: any) {
      toast({ title: 'Error adding role', description: e.message, variant: 'destructive' });
    } finally {
      setAddRoleSaving(false);
    }
  };

  const handleRemoveAdditionalRole = async (roleToRemove: string) => {
    if (!user) return;
    try {
      const updated = additionalRoles.filter(r => r.role !== roleToRemove);
      await saveAdditionalRoles(updated);
      toast({ title: 'Role removed' });
    } catch (e: any) {
      toast({ title: 'Error removing role', description: e.message, variant: 'destructive' });
    }
  };

  // ── Location personal data (city/address for non-field staff) ───────────
  const [locPersonal, setLocPersonal] = useState({ address_line1: '', address_line2: '', city: '', country: '' });
  const [locPersonalId, setLocPersonalId] = useState<string | null>(null);
  const [locSaving, setLocSaving] = useState(false);

  // ── Contract documents ────────────────────────────────────────────────────
  interface StaffContract {
    id: string;
    profile_id: string;
    file_name: string;
    file_path: string;
    file_size: number | null;
    file_type: string | null;
    notes: string | null;
    uploaded_by: string | null;
    created_at: string;
    uploader_name?: string;
  }
  const [contracts, setContracts] = useState<StaffContract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractUploading, setContractUploading] = useState(false);
  const [contractNotes, setContractNotes] = useState('');
  const [contractDeleteId, setContractDeleteId] = useState<string | null>(null);
  const contractFileRef = useRef<HTMLInputElement>(null);

  const fetchContracts = async (profileId: string) => {
    setContractsLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff_contracts')
        .select('*, uploader:uploaded_by(full_name)')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setContracts((data ?? []).map((r: any) => ({ ...r, uploader_name: r.uploader?.full_name ?? null })));
    } catch (e: any) {
      toast({ title: 'Failed to load contracts', description: e.message, variant: 'destructive' });
    } finally {
      setContractsLoading(false);
    }
  };

  const handleContractUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setContractUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const safeExt = ext ? `.${ext}` : '';
      const timestamp = Date.now();
      const path = `${user.id}/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('staff-contracts').upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('staff_contracts').insert({
        profile_id: user.id,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        file_type: file.type || null,
        notes: contractNotes.trim() || null,
        uploaded_by: currentUser?.id ?? null,
      });
      if (insertError) throw insertError;
      toast({ title: 'Contract uploaded', description: file.name });
      setContractNotes('');
      if (contractFileRef.current) contractFileRef.current.value = '';
      await fetchContracts(user.id);
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setContractUploading(false);
    }
  };

  const handleContractDownload = async (contract: StaffContract) => {
    try {
      const { data, error } = await supabase.storage.from('staff-contracts').createSignedUrl(contract.file_path, 120);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (e: any) {
      toast({ title: 'Download failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleContractView = async (contract: StaffContract) => {
    try {
      const { data, error } = await supabase.storage.from('staff-contracts').createSignedUrl(contract.file_path, 3600);
      if (error) throw error;
      setContractPreview({ url: data.signedUrl, name: contract.file_name, mime: contract.file_type });
    } catch (e: any) {
      toast({ title: 'Preview failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleContractDelete = async (contract: StaffContract) => {
    try {
      await supabase.storage.from('staff-contracts').remove([contract.file_path]);
      await supabase.from('staff_contracts').delete().eq('id', contract.id);
      toast({ title: 'Contract deleted', description: contract.file_name });
      setContractDeleteId(null);
      if (user) await fetchContracts(user.id);
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    }
  };

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
      const foundUser = users.find(u => u.id === id);
      if (foundUser) {
        // Only show the full loading spinner on the very first load (user is null).
        // On subsequent refreshes triggered by realtime subscription updates we
        // silently update the user object so child tab components (EmployeeEducationTab
        // etc.) are NOT unmounted and do NOT lose their local form state.
        if (!user) setIsLoadingUser(true);
        setUser(foundUser);
        // IMPORTANT: only reset editForm when NOT in edit mode.
        // Realtime heartbeat updates fire frequently (every few minutes) and
        // re-running setEditForm while the admin is mid-edit would silently
        // overwrite any changes they've made — including the role dropdown.
        if (!editMode) {
          const normalizedRole = foundUser.role ? (normalizeRole(foundUser.role as string) || foundUser.role) : '';
          setEditForm({ ...foundUser, role: normalizedRole as any });
        }
        setIsLoadingUser(false);
      } else if (!user) {
        // Only navigate away if we have never loaded the user (not a transient
        // refresh gap where users momentarily doesn't contain this ID).
        toast({
          title: "User not found",
          description: `No user with ID ${id} exists`,
          variant: "destructive",
        });
        navigate("/users");
      }
    }
  }, [id, users, navigate, toast, editMode]);

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

  // Load professional summary + profile folder path for overview banner
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('hr_employee_personal')
      .select('professional_summary, profile_folder_path, date_of_birth')
      .eq('profile_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.professional_summary) setEmpSummary(data.professional_summary);
        if (data?.profile_folder_path)  setProfileFolderPath(data.profile_folder_path);
        setHasPersonalDetails(!!data?.date_of_birth);
      });
  }, [user?.id]);

  // Fetch document count independently so the overview card shows real numbers
  // without requiring the user to visit the Documents tab first
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('hr_employee_documents')
      .select('id, verification_status')
      .eq('profile_id', user.id)
      .then(({ data }) => {
        if (!data) return;
        const total    = data.length;
        const verified = data.filter((d: any) => d.verification_status === 'verified').length;
        setDocsVerified({ allVerified: total > 0 && verified === total, verified, total });
      });
  }, [user?.id]);

  // Auto-create workspace dossier when profile loads with an employee ID but no folder yet
  useEffect(() => {
    if (!user?.employeeId || profileFolderPath || folderSyncing) return;
    // Only auto-trigger once — when the folder doesn't exist yet
    void triggerFolderSync(user);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.employeeId, profileFolderPath]);

  // Lightweight: always ensure Workspace Hub folder hierarchy exists on page load,
  // even for employees whose profileFolderPath was set before this feature.
  useEffect(() => {
    if (!user?.employeeId || !user?.id) return;
    void ensureWorkspaceHubFolders(user);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.employeeId]);

  // Load performance reviews for this employee (all + trend)
  const loadEmployeeReviews = () => {
    if (!user?.id) return;
    supabase
      .from('performance_reviews')
      .select('*')
      .eq('reviewee_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setEmployeeReviews(data);
          const completed = data
            .filter((r: any) => r.status === 'completed' && r.overall_rating != null)
            .slice(0, 4).reverse();
          setPerfTrend(completed.map((r: any) => ({ period: r.review_period ?? '—', rating: Number(r.overall_rating) })));
        }
      });
  };

  useEffect(() => { loadEmployeeReviews(); }, [user?.id]);

  const openAddReview = () => {
    setEditingReview(null);
    setReviewForm({ review_period: '', review_type: 'annual', overall_rating: 0, strengths: '', development_areas: '', manager_comments: '', next_goals: '' });
    setReviewDialogOpen(true);
  };

  const openEditReview = (rev: any) => {
    setEditingReview(rev);
    setReviewForm({
      review_period: rev.review_period || '',
      review_type: rev.review_type || 'annual',
      overall_rating: rev.overall_rating || 0,
      strengths: rev.strengths || '',
      development_areas: rev.development_areas || '',
      manager_comments: rev.manager_comments || '',
      next_goals: rev.next_goals || '',
    });
    setReviewDialogOpen(true);
  };

  const handleSaveReview = async () => {
    if (!reviewForm.review_period || !user?.id) return;
    setSavingReview(true);
    const payload = {
      reviewee_id: user.id,
      reviewer_id: currentUser?.id,
      review_period: reviewForm.review_period,
      review_type: reviewForm.review_type,
      overall_rating: reviewForm.overall_rating || null,
      strengths: reviewForm.strengths || null,
      development_areas: reviewForm.development_areas || null,
      manager_comments: reviewForm.manager_comments || null,
      next_goals: reviewForm.next_goals || null,
      status: 'completed',
      cycle_phase: 'manager_review',
      goals: [],
      competencies: [],
      self_assessment_enabled: false,
      peer_feedback_enabled: false,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const op = editingReview
      ? supabase.from('performance_reviews').update(payload).eq('id', editingReview.id)
      : supabase.from('performance_reviews').insert({ ...payload, created_at: new Date().toISOString() });
    const { error } = await op as any;
    setSavingReview(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: editingReview ? 'Review updated' : 'Review added', description: `Performance review for ${user.name} saved.` });
      setReviewDialogOpen(false);
      loadEmployeeReviews();
    }
  };

  const handleDeleteReview = async (id: string) => {
    setDeletingReviewId(id);
    const { error } = await supabase.from('performance_reviews').delete().eq('id', id);
    setDeletingReviewId(null);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Review deleted' });
      loadEmployeeReviews();
    }
  };

  // Fetch city/address from hr_employee_personal for non-field-staff
  useEffect(() => {
    const FIELD_STAFF = ['datacollector', 'coordinator', 'supervisor'];
    const role = (user?.role || '').toLowerCase();
    if (!user || FIELD_STAFF.includes(role)) return;
    supabase.from('hr_employee_personal').select('id,address_line1,address_line2,city,country').eq('profile_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setLocPersonal({ address_line1: data.address_line1 || '', address_line2: data.address_line2 || '', city: data.city || '', country: data.country || '' });
          setLocPersonalId(data.id);
        }
      });
  }, [user?.id, user?.role]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close dropdown when group changes
  useEffect(() => { setDropOpen(false); }, [activeGroup.id]);

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
        .select("task_digest_opt_out, country_code, probation_end_date, probation_confirmed, working_pattern")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setTaskDigestOptOut(data.task_digest_opt_out === true);
            if (data.country_code) setEmpCountryCode(data.country_code);
            setEmpProbationEnd((data as any).probation_end_date ?? "");
            setEmpProbationConfirmed((data as any).probation_confirmed === true);
            setEmpWorkingPattern((data as any).working_pattern ?? "");
          }
        });
    }
  }, [user?.id]);

  const handleEmploymentSave = async () => {
    if (!user) return;
    // Required field validation
    const missingEmp: string[] = [];
    if (!empType) missingEmp.push('Employment Type');
    if (!empContractStart) missingEmp.push('Contract Start Date');
    if (missingEmp.length > 0) {
      toast({ title: 'Required fields missing', description: `Please fill in: ${missingEmp.join(', ')}`, variant: 'destructive' });
      return;
    }
    setEmpSaving(true);
    try {
      // Use the ref (last successfully saved value) rather than the stale user object
      // so that consecutive saves in the same session compare against the right value.
      const prevDepartmentId = savedDepartmentIdRef.current;

      // Auto-generate employee ID if not yet assigned and contract start date is set
      let autoEmployeeId: string | null = null;
      if (!user.employeeId && empContractStart && empCountryCode) {
        const { data: genId, error: genErr } = await supabase.rpc('generate_employee_id', {
          p_country_code: empCountryCode.trim().toUpperCase(),
          p_contract_date: empContractStart,
        });
        if (!genErr && genId) autoEmployeeId = genId as string;
      }

      // Core fields — always exist in the profiles table
      const corePayload: Record<string, unknown> = {
        department_id: empDepartmentId || null,
        employment_type: empType || null,
        contract_start_date: empContractStart || null,
        contract_end_date: empContractEnd || null,
        reports_to: empReportsTo || null,
        task_digest_opt_out: taskDigestOptOut,
        country_code: empCountryCode || null,
        updated_at: new Date().toISOString(),
      };
      if (autoEmployeeId) corePayload.employee_id = autoEmployeeId;

      // Optional columns added by migration 20250715_hr_task81_compliance_fields
      // They may not exist in older DB instances — include them in the full attempt,
      // but fall back to corePayload silently if a schema-cache error is returned.
      const fullPayload: Record<string, unknown> = {
        ...corePayload,
        probation_end_date: empProbationEnd || null,
        probation_confirmed: empProbationConfirmed,
        working_pattern: empWorkingPattern || null,
      };

      const { error: fullError } = await supabase.from("profiles").update(fullPayload).eq("id", user.id);
      if (fullError) {
        const isSchemaErr = fullError.message?.toLowerCase().includes('schema cache') ||
                            fullError.message?.toLowerCase().includes('column') ||
                            (fullError as any)?.code === '42703';
        if (isSchemaErr) {
          // Optional columns missing in this DB — save core fields only
          console.warn("[UserDetail] Optional employment columns missing, saving core only:", fullError.message);
          const { error: coreError } = await supabase.from("profiles").update(corePayload).eq("id", user.id);
          if (coreError) throw coreError;
        } else {
          throw fullError;
        }
      }

      // Build the definitive user snapshot for the rest of this save operation.
      // We must use freshUser (not `user`) everywhere below so that:
      //   a) triggerFolderSync uses the correct employeeId
      //   b) a second "Save" click in the same session doesn't re-generate another ID
      const freshUser = autoEmployeeId ? { ...user, employeeId: autoEmployeeId } : user;
      if (autoEmployeeId) {
        // Update local state immediately — don't wait for realtime to propagate.
        // Without this, user.employeeId stays null and every subsequent save
        // generates yet another ID and creates another workspace folder.
        setUser(freshUser);
        toast({ title: `Employee ID assigned: ${autoEmployeeId}`, description: "Generated from country code + contract date." });
      }

      // Notify employee when department actually changes
      const newDeptId = empDepartmentId || null;
      if (newDeptId !== prevDepartmentId) {
        const newDept = departments.find(d => d.id === newDeptId);
        const deptNameEn = newDept ? newDept.name : null;
        await insertNotificationsToDb([{
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
        }]);
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
      setEmpEditMode(false);
      // Pass freshUser so the folder sync uses the newly-assigned ID (if any)
      // rather than the stale `user` closure which still has employeeId = null.
      void triggerFolderSync(freshUser);
    } catch (err: unknown) {
      const message = err instanceof Error
        ? err.message
        : (err as any)?.message || "An unexpected error occurred.";
      console.error("[UserDetail] handleEmploymentSave error:", err);
      toast({ title: "Error saving employment record", description: message, variant: "destructive" });
    } finally {
      setEmpSaving(false);
    }
  };

  // ── Fix Employee ID prefix (corrects country prefix mismatch) ───────────────
  // IMPORTANT: this must NEVER call generate_employee_id() — that mints a brand-new
  // sequential number and creates yet another workspace folder. Instead we only
  // replace the leading country-code letters while keeping the date+sequence intact.
  // e.g.  SD202607210010  →  UG202607210010   (same number, correct prefix)
  const handleRegenerateId = async () => {
    if (!empCountryCode || !user?.id || !user.employeeId) return;
    setRegenIdLoading(true);
    try {
      const correctPrefix  = empCountryCode.trim().toUpperCase();
      const existingId     = user.employeeId;

      // Strip old prefix letters (e.g. "SD") and attach the correct ones
      const oldPrefixLen   = existingId.match(/^([A-Z]+)/)?.[1]?.length ?? 2;
      const fixedId        = correctPrefix + existingId.slice(oldPrefixLen);

      if (fixedId === existingId) {
        toast({ title: 'No change needed', description: 'The prefix is already correct.' });
        setRegenIdConfirm(false);
        return;
      }

      const oldFolderName = computeFolderName(user);
      const newFolderName = computeFolderName({ ...user, employeeId: fixedId });

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ employee_id: fixedId })
        .eq('id', user.id);
      if (updateErr) throw updateErr;

      // Rename the workspace folder so the path stays consistent.
      // Use ilike so we match regardless of capitalisation drift.
      if (oldFolderName && newFolderName && oldFolderName !== newFolderName) {
        await supabase
          .from('workspace_folders')
          .update({ name: newFolderName })
          .ilike('name', oldFolderName);
      }

      toast({ title: '✅ Employee ID prefix fixed', description: `${existingId} → ${fixedId}` });
      setRegenIdConfirm(false);
      setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      toast({ title: 'Failed to fix ID prefix', description: err.message, variant: 'destructive' });
    } finally {
      setRegenIdLoading(false);
    }
  };

  // ── Workspace folder sync: triggered automatically once employeeId is set ──
  const triggerFolderSync = async (freshUser?: any) => {
    const u = freshUser || user;
    if (!u) return;
    // Only require employeeId + name — other fields enrich the CV but are not blockers
    if (!u.employeeId || !u.name) return;
    setFolderSyncing(true);
    try {
      const ctx = {
        departmentName: departments.find((d: any) => d.id === empDepartmentId)?.name,
        contractType:   empType,
        contractStart:  empContractStart,
        contractEnd:    empContractEnd,
        employmentType: empType,
        reportsToName:  allUsers.find((au: any) => au.id === empReportsTo)?.full_name ?? undefined,
        hubName:        hubs.find((h: any) => h.id === u.hubId)?.name || u.hubId || undefined,
      };
      const { folderPath, error } = await syncProfileFolder(u, ctx);
      if (folderPath) {
        setProfileFolderPath(folderPath);
        toast({ title: '📁 Workspace dossier updated', description: `Folder: ${computeFolderName(u)}`, variant: 'success' });
      } else if (error) {
        console.warn('[UserDetail] folder sync failed:', error);
      }
    } finally {
      setFolderSyncing(false);
    }
  };

  // ── Docs-only sync (no PDF regeneration) ────────────────────────────────────
  const handleSyncDocsOnly = async () => {
    if (!user) return;
    setDocsSyncing(true);
    try {
      const { synced, total, error } = await syncDocsToWorkspaceOnly(user);
      if (error) {
        toast({ title: 'Sync failed', description: error, variant: 'destructive' });
      } else if (synced > 0) {
        toast({ title: `✅ ${synced} document${synced !== 1 ? 's' : ''} synced`, description: `All ${total} HR document${total !== 1 ? 's' : ''} now in your Workspace folder.` });
      } else {
        toast({ title: 'Already up to date', description: `${total} document${total !== 1 ? 's' : ''} are already in your Workspace folder.` });
      }
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setDocsSyncing(false);
    }
  };

  useEffect(() => {
    if (user?.id) fetchContracts(user.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && activeSection === 'access') fetchAdditionalRoles(user.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeSection]);

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

  const handleDeleteBankAccount = async () => {
    if (!user || !updateUser) return;
    setIsDeletingBankAccount(true);
    const updatedUser: User = { ...user, bankAccount: undefined };
    try {
      const success = await updateUser(updatedUser);
      if (success) {
        setUser(updatedUser);
        toast({ title: "Bank Account Removed", description: `Bank account details have been deleted for ${user.name}.` });
        setDeleteBankAccountConfirmOpen(false);
      }
    } catch (err) {
      console.error("Error deleting bank account:", err);
      toast({ title: "Delete failed", description: "Could not remove the bank account. Please try again.", variant: "destructive" });
    } finally {
      setIsDeletingBankAccount(false);
    }
  };

  const handleBankAccountSubmit = (values: BankakAccountFormValues) => {
    if (!user) return;

    const updatedUser: User = {
      ...user,
      bankAccount: {
        accountName:   values.accountName,
        accountNumber: values.accountNumber,
        bankName:      values.bankName      || undefined,
        branch:        values.branch        || undefined,
        iban:          values.iban          || undefined,
        swiftBic:      values.swiftBic      || undefined,
        country:       values.country       || undefined,
        currency:      values.currency      || undefined,
        routingNumber: values.routingNumber || undefined,
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
    // Synchronous guard — blocks re-entrant calls before React re-renders the button
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    // Location & Work required field validation
    if (activeSection === 'location') {
      const FIELD_STAFF_ROLES = ['datacollector', 'coordinator', 'supervisor'];
      const isFieldStaff = FIELD_STAFF_ROLES.includes((user.role || '').toLowerCase());
      if (isFieldStaff && !editForm.hubId) {
        isSavingRef.current = false;
        toast({ title: 'Required field missing', description: 'Please select a Hub before saving.', variant: 'destructive' });
        return;
      }
    }

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
        // Use updatedUser directly — an immediate DB re-fetch can return stale
        // data if Supabase hasn't flushed the write yet, causing visible revert.
        // updateUser() already confirmed the DB write succeeded, so local state
        // is the source of truth at this point.
        setUser(updatedUser);
        setEditForm(updatedUser);

        toast({
          title: "User updated",
          description: "User information was successfully updated and will persist between sessions.",
          variant: "success"
        });
        setEditMode(false);
        void triggerFolderSync(updatedUser);
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
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !approveUser) return;

    // Document verification gate — block if there are unverified/rejected docs
    if (docsVerified.total > 0 && !docsVerified.allVerified) {
      const remaining = docsVerified.total - docsVerified.verified;
      toast({
        title: "Cannot activate — documents not fully verified",
        description: `${remaining} document(s) still need HR verification. Go to the Documents tab to verify them first.`,
        variant: "destructive",
      });
      return;
    }

    setIsApproving(true);
    await approveUser(user.id);
    setIsApproving(false);
    toast({ title: "User approved", description: `${user.name} has been approved and activated.` });
  };

  const handleReject = async () => {
    if (!user || !rejectUser) return;
    setIsRejecting(true);
    const ok = await rejectUser(user.id);
    setIsRejecting(false);
    if (ok) {
      toast({ title: "User rejected", description: `${user.name} has been rejected.` });
      navigate("/users");
    }
    // If !ok, rejectUser already showed its own "Rejection blocked" toast — no duplicate needed
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

  // Roles that can view ANY profile (read-only, no edit)
  const VIEW_ALL_ROLES = ['countryDirector', 'country_director', 'fom', 'fieldOpManager', 'seniorOperationsLead', 'senior_operations_lead', 'financialAdmin', 'financial_admin', 'projectManager', 'project_manager'];
  const canViewAllProfiles = VIEW_ALL_ROLES.includes(roleStr)
    || (currentUser?.roles && currentUser.roles.some((r: any) => VIEW_ALL_ROLES.includes(String(r).toLowerCase())));

  // Access control: non-admin, non-viewer users can only see their own profile.
  const isOwnProfile = currentUser?.id === user.id;
  if (!isAdmin && !canViewAllProfiles && !isOwnProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4 max-w-sm px-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold">Access Restricted</h2>
          <p className="text-muted-foreground text-sm">
            You can only view your own profile. Contact HR or an administrator if you need assistance.
          </p>
          <Button variant="outline" onClick={() => navigate(`/users/${currentUser?.id}`)}>
            <UserIcon className="mr-2 h-4 w-4" /> Go to My Profile
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-24">

      {/* ── Compact Page Header (scrolls with page — not sticky) ─────────── */}
      {/* Hidden file input for avatar upload */}
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

      <div className="shadow-lg" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 60%, #0f2240 100%)' }}>

        {/* Single identity row — breadcrumb + avatar + name + actions */}
        {(() => {
          const fields = [user.name, user.email, user.phone, user.hubId, user.employeeId, user.bankAccount, empDepartmentId, empContractStart];
          const pct = Math.round((fields.filter(Boolean).length / fields.length) * 100);
          const initials = user.name?.split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase() || '??';
          return (
            <div className="px-4 py-2.5 flex items-center gap-3">

              {/* Back breadcrumb */}
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white/80 transition-colors shrink-0"
                data-testid="button-back-users"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Back</span>
              </button>
              <span className="text-white/20 text-xs shrink-0">›</span>

              {/* Avatar — click to upload */}
              <div className="relative shrink-0 group cursor-pointer" onClick={() => avatarInputRef.current?.click()} title="Click to change photo">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-extrabold text-sm shadow-md ring-2 ring-white/15 overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${accent}cc, ${accent}88)` }}
                >
                  {avatarUploading
                    ? <Loader2 className="h-4 w-4 animate-spin text-white" />
                    : user.avatar
                      ? <img src={user.avatar} alt={user.name} className="h-9 w-9 object-cover" />
                      : initials}
                </div>
                {/* Upload overlay on hover */}
                {!avatarUploading && (
                  <div className="absolute inset-0 rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0a1628] ${user.isApproved ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              </div>

              {/* Name + badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-white font-bold text-[13px] leading-tight truncate max-w-[200px]">{user.name}</span>
                  <RoleBadge role={user.role} size="sm" />
                  <UserClassificationBadge userId={user.id} />
                  <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${user.isApproved ? 'bg-emerald-400/20 text-emerald-300' : 'bg-amber-400/20 text-amber-300'}`}>
                    ● {user.isApproved ? 'Active' : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-white/40 text-[10px] truncate capitalize">
                    {empType || 'Staff Member'}{user.email ? ` · ${user.email}` : ''}
                  </p>
                  {/* Inline profile completeness */}
                  <div className="hidden md:flex items-center gap-1.5 shrink-0">
                    <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-[9px] font-bold ${pct >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>{pct}%</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {isAdmin && !editMode && !user.isApproved && (
                  <>
                    <Button onClick={handleApprove} disabled={isApproving} size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white gap-1 h-7 text-[11px] px-2 border-0" data-testid="button-approve-user">
                      <UserCheck className="h-3 w-3" /><span className="hidden sm:inline">{isApproving ? 'Approving…' : 'Approve'}</span>
                    </Button>
                    <Button onClick={handleReject} disabled={isRejecting} size="sm" variant="destructive" className="gap-1 h-7 text-[11px] px-2" data-testid="button-reject-user">
                      <UserX className="h-3 w-3" /><span className="hidden sm:inline">{isRejecting ? 'Rejecting…' : 'Reject'}</span>
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => navigate(`/signatures?user=${user.id}`)} className="text-white/60 hover:text-white hover:bg-white/10 gap-1 h-7 text-[11px] px-2" data-testid="button-goto-signatures">
                  <FileSignature className="h-3 w-3" /><span className="hidden md:inline">Signatures</span>
                </Button>

                {/* CV Export dropdown */}
                <div className="relative" ref={cvMenuRef}>
                  <button
                    disabled={cvExporting}
                    onClick={() => setShowCvMenu(v => !v)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-emerald-300 bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-400/20 rounded-lg px-2 h-7 transition-all disabled:opacity-50"
                    data-testid="button-export-cv"
                    title="Export CV"
                  >
                    {cvExporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    <span className="hidden md:inline">{cvExporting ? 'Exporting…' : 'CV'}</span>
                    {!cvExporting && <ChevronDown className="h-2.5 w-2.5 opacity-60" />}
                  </button>
                  {showCvMenu && !cvExporting && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowCvMenu(false)} />
                      <div className="absolute right-0 top-full mt-1.5 z-50 w-80 rounded-xl border border-white/10 bg-[#0d1f3c] shadow-2xl overflow-hidden">
                        <div className="px-3 py-2 border-b border-white/8">
                          <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Choose Export Format</p>
                        </div>
                        <div className="py-1">
                          {CV_FORMAT_OPTIONS.map(fmt => (
                            <button
                              key={fmt.id}
                              data-testid={`cv-format-${fmt.id}`}
                              onClick={async () => {
                                setShowCvMenu(false);
                                setCvExporting(true);
                                const cvCtx = {
                                  departmentName: departments.find(d => d.id === empDepartmentId)?.name,
                                  contractStart:  empContractStart,
                                  contractEnd:    empContractEnd,
                                  employmentType: empType,
                                  reportsToName:  allUsers.find(u => u.id === empReportsTo)?.full_name ?? undefined,
                                  hubName:        hubs.find(h => h.id === user.hubId)?.name || user.hubId || undefined,
                                };
                                try {
                                  if (fmt.id === 'un_p11')              await generateEmployeeCV(user, cvCtx);
                                  else if (fmt.id === 'reverse_chronological') await generateReverseChronologicalCV(user, cvCtx);
                                  else if (fmt.id === 'functional')     await generateFunctionalCV(user, cvCtx);
                                  else if (fmt.id === 'combination')    await generateCombinationCV(user, cvCtx);
                                  else if (fmt.id === 'europass')       await generateEuropassCV(user, cvCtx);
                                  toast({ title: `${fmt.label} exported`, description: 'PDF downloaded successfully.' });
                                } catch (e: any) {
                                  toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
                                } finally { setCvExporting(false); }
                              }}
                              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-white/6 transition-colors text-left group"
                            >
                              <span className="text-lg leading-none mt-0.5 shrink-0">{fmt.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[12px] font-semibold text-white/90 group-hover:text-white">{fmt.label}</span>
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/8 text-white/40 uppercase tracking-wide">{fmt.pages}</span>
                                </div>
                                <p className="text-[10px] text-white/40 mt-0.5 leading-snug">{fmt.description}</p>
                                <p className="text-[9px] mt-1 text-white/30">ATS: <span className="text-emerald-400/70">{fmt.ats}</span></p>
                              </div>
                            </button>
                          ))}
                        </div>
                        <div className="px-3 py-2 border-t border-white/8 bg-white/3">
                          <p className="text-[9px] text-white/25 leading-snug">All formats export as PDF using profile data on file.</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Employee Badge */}
                {user.employeeId && user.name && (
                  <button
                    onClick={() => setShowBadgeDialog(true)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20 rounded-lg px-2 h-7 transition-all"
                    data-testid="button-generate-badge"
                    title="Generate Employee Badge"
                  >
                    <CreditCard className="h-3 w-3" />
                    <span className="hidden md:inline">Badge</span>
                  </button>
                )}

                {isAdmin && !editMode && !user.isApproved === false && (
                  <button onClick={() => navigate('/hr?tab=offboarding')} className="hidden md:flex items-center gap-1 text-[11px] font-semibold text-red-400 bg-red-400/10 hover:bg-red-400/20 border border-red-400/20 rounded-lg px-2 h-7 transition-all">
                    <UserX className="h-3 w-3" />Offboard
                  </button>
                )}

                {canEditProfile && !editMode && (
                  <Button onClick={handleEdit} size="sm" className="bg-white text-[#0d1f3c] hover:bg-white/90 gap-1 h-7 text-[11px] px-2.5 font-semibold shadow" data-testid="button-edit-user">
                    <Edit className="h-3 w-3" />Edit
                  </Button>
                )}
                {editMode && (
                  <>
                    <Button onClick={() => { const re = user && editForm.role !== user.role && ['Admin','SuperAdmin'].includes(editForm.role||''); if(re && isProtectedOwner(currentUser?.id)) setAdminRoleOtpOpen(true); else handleEditSave(); }} disabled={isSaving} size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white h-7 text-[11px] px-2.5 font-semibold shadow border-0">
                      {isSaving ? 'Saving…' : 'Save'}
                    </Button>
                    <Button onClick={handleEditCancel} size="sm" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10 h-7 text-[11px] px-2">Cancel</Button>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Level 2: Group tabs ── */}
        <div className="px-5 pt-3 flex items-end gap-1.5">
          {TAB_GROUPS.map(g => {
            const visibleTabs = g.tabs.filter(t => {
              if ((t as any).adminOnly && !isAdmin) return false;
              if ((t as any).fieldStaffOnly && !showCompensation) return false;
              return true;
            });
            if (visibleTabs.length === 0) return null;
            const isActive = activeGroup.id === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => { setActiveSection(visibleTabs[0].id); setDropOpen(false); }}
                className={`group relative flex items-center gap-2 px-4 pt-2.5 pb-3 rounded-t-xl text-sm font-semibold transition-all duration-150 border border-b-0 shrink-0 ${isActive ? 'text-white' : 'text-gray-400 border-transparent hover:text-gray-200 hover:border-white/10'}`}
                style={isActive ? { backgroundColor: `${g.color}1e`, borderColor: `${g.color}40` } : {}}
              >
                {isActive && <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full" style={{ backgroundColor: g.color }} />}
                <g.Icon className="h-3.5 w-3.5 shrink-0" style={isActive ? { color: g.color } : {}} />
                <span>{g.label}</span>
                <span
                  className={`ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1 ${isActive ? '' : 'text-gray-500 bg-white/5'}`}
                  style={isActive ? { backgroundColor: `${g.color}44`, color: g.color } : {}}
                >
                  {visibleTabs.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Level 3: Sub-tab dropdown ── */}
        <div
          className="relative px-4 py-2 border-t flex items-center gap-3"
          style={{ borderColor: `${accent}30`, backgroundColor: `${accent}0a` }}
          ref={dropRef}
        >
          <button
            type="button"
            onClick={() => setDropOpen(v => !v)}
            className={`flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-150 border min-w-0 flex-1 max-w-sm ${dropOpen ? 'bg-white/10 border-white/20 text-white' : 'bg-white/5 border-white/10 text-gray-200 hover:bg-white/8 hover:text-white'}`}
          >
            <span className="text-[13px] leading-none shrink-0">{activeTabInGroup.emoji}</span>
            <span className="truncate">{activeTabInGroup.label}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 ml-auto opacity-60 transition-transform duration-150 ${dropOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-gray-400 shrink-0">
            <span className="px-2 py-1 rounded-full font-medium" style={{ backgroundColor: `${accent}22`, color: accent }}>
              {activeGroup.tabs.findIndex(t => t.id === activeSection) + 1} / {activeGroup.tabs.length}
            </span>
            <span className="opacity-50">{activeGroup.label}</span>
          </div>
          {dropOpen && (
            <div
              className="absolute top-full left-4 right-4 mt-1 rounded-xl border shadow-2xl overflow-hidden z-50"
              style={{
                background: 'linear-gradient(135deg, #0d1f3c 0%, #0f2240 100%)',
                borderColor: `${accent}35`,
                boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px ${accent}25`,
              }}
            >
              <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: `${accent}25`, backgroundColor: `${accent}12` }}>
                <span className="text-[13px]">{activeTabInGroup.emoji}</span>
                <span className="text-[12px] font-bold text-white tracking-wide">{activeGroup.label}</span>
                <span className="ml-auto text-[10px] text-gray-400">{activeGroup.tabs.filter(t => !((t as any).adminOnly && !isAdmin) && !((t as any).fieldStaffOnly && !showCompensation)).length} pages</span>
              </div>
              <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {activeGroup.tabs.filter(t => !((t as any).adminOnly && !isAdmin) && !((t as any).fieldStaffOnly && !showCompensation)).map(t => {
                  const isActive = activeSection === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { setActiveSection(t.id); setDropOpen(false); }}
                      className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-left transition-all duration-100 ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'}`}
                      style={isActive ? { backgroundColor: `${accent}28`, outline: `1px solid ${accent}50` } : {}}
                    >
                      <span className="text-[13px] leading-none shrink-0 mt-0.5" style={{ opacity: isActive ? 1 : 0.6 }}>{t.emoji}</span>
                      <span className="text-[12px] font-medium leading-tight">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Description strip ── */}
      <div
        className="flex items-start gap-3 px-5 py-2.5 border-b border-l-[3px]"
        style={{ borderLeftColor: accent, backgroundColor: `${accent}08`, borderBottomColor: `${accent}20` }}
      >
        <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: accent }} />
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">{activeTabInGroup.description}</p>
      </div>

      {/* ── Full-width Content ──────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 pb-16">
        <div className="w-full">

            {/* ── Content card ──────────────────────────────────────────── */}
            <Card className="shadow-xl border-0 overflow-hidden rounded-2xl">

              {/* Section header bar */}
              <div
                className="border-b px-5 py-3 flex items-center justify-between border-l-[3px]"
                style={{ borderLeftColor: accent, backgroundColor: `${accent}06`, borderBottomColor: `${accent}18` }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}18` }}>
                    <span className="text-sm leading-none">{activeTabInGroup.emoji}</span>
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-foreground leading-none">{activeTabInGroup.label}</h2>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{activeGroup.label} section</p>
                  </div>
                </div>
                {(activeSection === 'overview' || activeSection === 'location') && canEditProfile && !editMode && (
                  <Button size="sm" variant="outline" onClick={handleEdit} className="gap-1.5 h-8 text-xs" data-testid="button-edit-section">
                    <Edit className="h-3 w-3" /> Edit
                  </Button>
                )}
                {editMode && (activeSection === 'overview' || activeSection === 'location') && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        const roleEscalation = user && editForm.role !== user.role && ['Admin', 'SuperAdmin'].includes(editForm.role || '');
                        if (roleEscalation && isProtectedOwner(currentUser?.id)) setAdminRoleOtpOpen(true);
                        else handleEditSave();
                      }}
                      disabled={isSaving}
                      className="h-8 text-xs"
                      style={{ backgroundColor: accent, borderColor: accent }}
                    >
                      {isSaving ? 'Saving…' : 'Save Changes'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleEditCancel} className="h-8 text-xs">Cancel</Button>
                  </div>
                )}
              </div>

            {/* ── PENDING APPROVAL BANNER — always visible regardless of active tab ── */}
            {isAdmin && !user.isApproved && (
              <div className="mx-4 mt-3 rounded-xl border border-red-400/50 bg-red-50 dark:bg-red-950/30 dark:border-red-700/50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0 mt-0.5">
                    <UserCheck className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-red-800 dark:text-red-300">Access Pending Approval</p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 leading-relaxed">
                      This account is waiting for admin approval. The user cannot log in until you approve their access.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 pl-11 sm:pl-0">
                  <Button
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white gap-1.5 h-8 text-xs font-semibold"
                    onClick={() => approveUser(user.id)}
                    disabled={isApproving}
                    data-testid="button-approve-user-banner"
                  >
                    {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                    {isApproving ? 'Approving…' : 'Approve Access'}
                  </Button>
                  <button
                    onClick={() => setActiveSection('access')}
                    className="text-[11px] text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium underline underline-offset-2 whitespace-nowrap"
                  >
                    View details →
                  </button>
                </div>
              </div>
            )}

            {/* ── ACTIVE USER — quick account status strip for admins ── */}
            {isAdmin && user.isApproved && activeSection === 'overview' && (
              <div className="mx-4 mt-3 rounded-xl border border-green-200/60 dark:border-green-800/40 bg-green-50/60 dark:bg-green-950/20 px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400">Account Active</span>
                  <span className="text-xs text-muted-foreground hidden sm:inline">· Last active: {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveSection('access')}
                    className="text-[11px] text-muted-foreground hover:text-foreground font-medium flex items-center gap-1"
                  >
                    <ShieldCheck className="h-3 w-3" /> Access & Roles →
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                    onClick={() => rejectUser(user.id)}
                    disabled={isRejecting}
                    data-testid="button-deactivate-user-banner"
                  >
                    {isRejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserX className="h-3 w-3" />}
                    Deactivate
                  </Button>
                </div>
              </div>
            )}

            {/* ── OVERVIEW SECTION ───────────────────────────────────────── */}
            {activeSection === 'overview' && (<div className="p-5 sm:p-6 space-y-5">

              {/* ── Profile Completeness Banner ─────────────────────────────── */}
              {!editMode && (() => {
                const created = (user as any).createdAt ? new Date((user as any).createdAt) : null;
                const daysOn = created ? Math.floor((Date.now() - created.getTime()) / 86400000) : null;
                const checks = [
                  { label: 'Phone number',     done: !!user.phone,                              section: 'overview',     emoji: '📞' },
                  { label: 'Employee ID',      done: !!user.employeeId,                         section: 'overview',     emoji: '🪪' },
                  { label: 'Department set',   done: !!empDepartmentId,                         section: 'employment',   emoji: '🏢' },
                  { label: 'Bank account',     done: !!user.bankAccount,                        section: 'compensation', emoji: '🏦' },
                  { label: 'Personal details', done: hasPersonalDetails,                         section: 'personal',     emoji: '👤' },
                  { label: 'Documents',        done: docsVerified.total > 0,                    section: 'documents',    emoji: '📁' },
                ];
                const doneCnt = checks.filter(c => c.done).length;
                const pct = Math.round(doneCnt / checks.length * 100);
                const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
                const textColor = pct >= 80 ? 'text-green-600 dark:text-green-400' : pct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
                return (
                  <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm">Profile Completeness</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{doneCnt} of {checks.length} key fields filled{daysOn !== null ? ` · ${daysOn.toLocaleString()} days on record` : ''}</p>
                      </div>
                      <span className={`text-2xl font-black ${textColor}`}>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {checks.map(c => (
                        <button
                          key={c.label}
                          onClick={() => setActiveSection(c.section)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors
                            ${c.done
                              ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800'
                              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/50 cursor-pointer'}`}
                        >
                          <span>{c.emoji}</span>
                          <span>{c.label}</span>
                          <span className="opacity-60">{c.done ? '✓' : '→'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── Workspace Dossier card ───────────────────────────────────── */}
              {(profileFolderPath || folderSyncing) && (
                <div className={`rounded-xl border p-4 space-y-3 transition-all ${folderSyncing ? 'border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800' : 'border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {folderSyncing
                        ? <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400" />
                        : <FolderOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                      <div>
                        <p className="font-semibold text-sm text-foreground">
                          {folderSyncing ? 'Updating workspace dossier…' : 'Workspace Dossier'}
                        </p>
                        {!folderSyncing && profileFolderPath && (
                          <p className="text-[11px] text-muted-foreground font-mono">HR / Profiles / {profileFolderPath.replace(/^(HR\/Profiles|HR|profiles)\//, '')}</p>
                        )}
                      </div>
                    </div>
                    {!folderSyncing && profileFolderPath && isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            const url = await getProfileSummarySignedUrl(profileFolderPath);
                            if (url) window.open(url, '_blank');
                            else toast({ title: 'Could not open file', description: 'The summary PDF may not have been generated yet.', variant: 'destructive' });
                          }}
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-700 rounded-lg px-2.5 py-1.5 transition-all"
                        >
                          <FileText className="h-3.5 w-3.5" /> Open CV
                        </button>
                        <button
                          onClick={() => void handleSyncDocsOnly()}
                          disabled={docsSyncing}
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg px-2.5 py-1.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                          title="Sync all HR documents into the Workspace Hub folder"
                        >
                          {docsSyncing
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RefreshCw className="h-3.5 w-3.5" />}
                          {docsSyncing ? 'Syncing…' : 'Sync Docs'}
                        </button>
                      </div>
                    )}
                  </div>
                  {!folderSyncing && (
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div className="rounded-lg bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-900 p-2 text-center">
                        <p className="font-bold text-emerald-700 dark:text-emerald-300">PROFILE_SUMMARY.pdf</p>
                        <p className="text-muted-foreground">Auto-generated CV</p>
                      </div>
                      <div className="rounded-lg bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-900 p-2 text-center">
                        <p className="font-bold text-emerald-700 dark:text-emerald-300">{docsVerified.total} document{docsVerified.total !== 1 ? 's' : ''}</p>
                        <p className="text-muted-foreground">In HR profile</p>
                      </div>
                      <div className="rounded-lg bg-white/70 dark:bg-white/5 border border-blue-100 dark:border-blue-900 p-2 text-center">
                        <p className="font-bold text-blue-700 dark:text-blue-300">Sync Docs</p>
                        <p className="text-muted-foreground">Copies to workspace</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Professional Summary card ────────────────────────────────── */}
              {empSummary ? (
                <div className="rounded-xl border border-border/40 bg-gradient-to-br from-muted/20 to-transparent p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> Professional Summary
                    </h3>
                    {canEditProfile && !editMode && (
                      <button onClick={() => setActiveSection('personal')} className="text-[10px] text-primary hover:underline">Edit →</button>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90">{empSummary}</p>
                </div>
              ) : canEditProfile && !editMode && (
                <button
                  onClick={() => setActiveSection('personal')}
                  className="w-full flex items-center gap-2 p-3.5 rounded-xl border border-dashed border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all text-sm text-muted-foreground hover:text-primary group"
                >
                  <FileText className="h-4 w-4 group-hover:text-primary" />
                  <span>Add Professional Summary / Background — shown at the top of the CV export</span>
                </button>
              )}

              {/* ── Profile Photo ──────────────────────────────────────────── */}
              {(isAdmin || isOwnProfile) && (() => {
                const photoCount  = localPhotoCount ?? (user.photoUploadCount ?? 0);
                const isLocked    = !isAdmin && photoCount >= 3;
                const canClick    = !isLocked && !avatarUploading;
                return (
                  <div className="bg-muted/20 rounded-xl p-4 border border-border/40 hover:border-border/60 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Profile Photo</h3>
                      {/* Upload counter — shown only to non-admins */}
                      {!isAdmin && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isLocked
                            ? 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/40'
                            : photoCount === 2
                            ? 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40'
                            : 'text-muted-foreground bg-muted'
                        }`}>
                          {photoCount}/3 changes used
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Avatar preview */}
                      <div
                        className={`relative h-20 w-20 rounded-xl overflow-hidden shrink-0 ring-2 ring-border/40 ${canClick ? 'cursor-pointer group' : 'cursor-not-allowed opacity-80'}`}
                        onClick={() => canClick && avatarInputRef.current?.click()}
                        title={isLocked ? 'Upload limit reached — contact HR or Admin' : 'Click to change photo'}
                      >
                        {avatarUploading ? (
                          <div className="h-full w-full flex items-center justify-center bg-muted">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : user.avatar ? (
                          <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xl font-extrabold text-white" style={{ background: `linear-gradient(135deg, ${accent}cc, ${accent}88)` }}>
                            {user.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '??'}
                          </div>
                        )}
                        {canClick && !avatarUploading && (
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Camera className="h-5 w-5 text-white" />
                          </div>
                        )}
                      </div>
                      {/* Info + button */}
                      <div className="space-y-2 flex-1 min-w-0">
                        <p className="text-sm font-medium">{user.avatar ? 'Photo uploaded' : 'No photo yet'}</p>
                        <p className="text-xs text-muted-foreground">JPG, PNG, or WebP · Max 5 MB</p>
                        {isLocked ? (
                          <p className="text-xs text-red-600 dark:text-red-400 font-medium leading-snug">
                            Upload limit reached. Contact HR or Admin to update your photo.
                          </p>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => avatarInputRef.current?.click()}
                            disabled={avatarUploading}
                            data-testid="button-change-photo"
                          >
                            {avatarUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                            {avatarUploading ? 'Uploading…' : user.avatar ? 'Change Photo' : 'Upload Photo'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Full Name</h3>
                  {editMode ? (
                    <Input value={editForm.fullName ?? editForm.name ?? ""} onChange={e => { handleEditChange("fullName", e.target.value); handleEditChange("name", e.target.value); }} className="h-11 bg-background rounded-lg" />
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
                {(() => {
                  const idPrefix = user.employeeId?.match(/^([A-Z]+)/)?.[1] ?? null;
                  const hasMismatch = idPrefix && empCountryCode && idPrefix !== empCountryCode;
                  const missingCountry = idPrefix && !empCountryCode;
                  const borderClass = hasMismatch ? 'border-red-300 dark:border-red-700' : missingCountry ? 'border-amber-300 dark:border-amber-700' : 'border-border/40';
                  return (
                    <div className={`bg-muted/20 rounded-xl p-4 space-y-2 border hover:border-border/60 transition-colors ${borderClass}`}>
                      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                        Employee ID
                        {hasMismatch && <span className="text-[9px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded-full">Prefix mismatch</span>}
                        {missingCountry && <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full">Verify country</span>}
                      </h3>
                      {editMode ? (
                        <Input value={editForm.employeeId || ""} onChange={e => handleEditChange("employeeId", e.target.value)} className="h-11 bg-background rounded-lg" />
                      ) : (
                        <>
                          <p className="font-semibold text-base font-mono">{user.employeeId || <span className="text-muted-foreground italic font-sans">Not set</span>}</p>
                          {hasMismatch && (
                            <div className="flex items-start gap-2 text-[11px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2.5 py-2 rounded-md border border-red-200 dark:border-red-800">
                              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <span className="flex-1">
                                ID prefix <strong>{idPrefix}</strong> doesn't match assigned country <strong>{empCountryCode}</strong> — workspace folder is named with the wrong country code.
                                {isAdmin && <> Go to <strong>Employment tab</strong> to fix.</>}
                              </span>
                            </div>
                          )}
                          {missingCountry && (
                            <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2 rounded-md border border-amber-200 dark:border-amber-800">
                              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                              <span className="flex-1">
                                ID has prefix <strong>{idPrefix}</strong> but no country is set — go to <strong>Employment tab</strong>, set the correct country and save to verify.
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
                <div className="bg-muted/20 rounded-xl p-4 space-y-2 border border-border/40 hover:border-border/60 transition-colors">
                  <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">Role</h3>
                  {editMode ? (
                    <div className="space-y-2">
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
                      {editForm.role && (() => {
                        const hint = getRoleHint(editForm.role);
                        if (!hint) return null;
                        return (
                          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-3 space-y-1 text-xs">
                            <p className="text-blue-800 dark:text-blue-200 leading-relaxed">{hint.description}</p>
                            <p className="text-blue-600 dark:text-blue-400"><span className="font-semibold">Pages affected: </span>{hint.affects}</p>
                          </div>
                        );
                      })()}
                    </div>
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
            </div>)}

            {/* ── EMPLOYMENT SECTION ──────────────────────────────────────── */}
            {activeSection === 'employment' && (<div className="p-3 sm:p-4 space-y-3">
              {/* Section header with Edit toggle */}
              {isAdmin && (
                <div className="flex items-center justify-between pb-1">
                  <p className="text-[11px] text-muted-foreground">
                    {empEditMode ? 'Make changes below, then save.' : 'View-only. Click Edit to make changes.'}
                  </p>
                  {empEditMode ? (
                    <button
                      onClick={() => setEmpEditMode(false)}
                      className="text-[11px] font-semibold text-muted-foreground hover:text-foreground border border-border/60 rounded-lg px-3 py-1 transition-all"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => setEmpEditMode(true)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/60 rounded-lg px-3 py-1 transition-all"
                      data-testid="btn-edit-employment"
                    >
                      ✏️ Edit
                    </button>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Department */}
                <div className="bg-muted/20 rounded-lg p-3 space-y-1.5 border border-border/40">
                  <h4 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> Department
                  </h4>
                  {isAdmin && empEditMode ? (
                    <Select value={empDepartmentId || "none"} onValueChange={v => setEmpDepartmentId(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-emp-department"><SelectValue placeholder="No department" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Department</SelectItem>
                        {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-sm">{departments.find(d => d.id === empDepartmentId)?.name || "—"}</p>
                  )}
                </div>

                {/* Employment Type */}
                <div className="bg-muted/20 rounded-lg p-3 space-y-1.5 border border-border/40">
                  <h4 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    Employment Type <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full">Required</span>
                  </h4>
                  {isAdmin && empEditMode ? (
                    <Select value={empType} onValueChange={setEmpType}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-emp-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full-time">Full-Time</SelectItem>
                        <SelectItem value="part-time">Part-Time</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                        <SelectItem value="intern">Intern</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-sm capitalize">{empType || "—"}</p>
                  )}
                </div>

                {/* Contract Start Date */}
                <div className="bg-muted/20 rounded-lg p-3 space-y-1.5 border border-border/40">
                  <h4 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    Contract Start <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full">Required</span>
                  </h4>
                  {isAdmin && empEditMode ? (
                    <Input type="date" value={empContractStart} onChange={e => setEmpContractStart(e.target.value)} className="h-8 text-sm" data-testid="input-contract-start" />
                  ) : (
                    <p className="font-semibold text-sm">{empContractStart || "—"}</p>
                  )}
                </div>

                {/* Contract End Date */}
                <div className="bg-muted/20 rounded-lg p-3 space-y-1.5 border border-border/40">
                  <h4 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">Contract End</h4>
                  {isAdmin && empEditMode ? (
                    <Input type="date" value={empContractEnd} onChange={e => setEmpContractEnd(e.target.value)} className="h-8 text-sm" data-testid="input-contract-end" />
                  ) : (
                    <p className="font-semibold text-sm">{empContractEnd || "—"}</p>
                  )}
                  {empContractEnd && (() => {
                    const d = Math.ceil((new Date(empContractEnd).getTime() - Date.now()) / 86400000);
                    if (d < 0) return <p className="text-xs text-destructive font-medium">Contract expired</p>;
                    if (d <= 30) return <p className="text-xs text-amber-600 font-medium">Expires in {d} day{d === 1 ? "" : "s"}</p>;
                    return null;
                  })()}
                </div>

                {/* Probation Status */}
                <div className="bg-muted/20 rounded-lg p-3 space-y-1.5 border border-border/40">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">Probation</h4>
                    {empProbationConfirmed
                      ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-1.5 py-0.5">✅ Confirmed</span>
                      : empProbationEnd
                        ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5">🕐 In Probation</span>
                        : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted/30 border border-border/40 rounded-full px-1.5 py-0.5">— Not Set</span>
                    }
                  </div>
                  {isAdmin && empEditMode ? (
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">End Date</label>
                      <Input type="date" value={empProbationEnd} onChange={e => { setEmpProbationEnd(e.target.value); if (e.target.value) setEmpProbationConfirmed(false); }} className="h-8 text-sm" data-testid="input-probation-end" />
                    </div>
                  ) : (
                    <p className="font-semibold text-sm">{empProbationEnd || "—"}</p>
                  )}
                  {empProbationEnd && !empProbationConfirmed && (() => {
                    const d = Math.ceil((new Date(empProbationEnd).getTime() - Date.now()) / 86400000);
                    return (
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-medium ${d <= 0 ? 'text-red-500' : d <= 14 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {d <= 0 ? `Ended ${Math.abs(d)}d ago` : `Ends in ${d}d`}
                        </p>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setShowConfirmEmploymentDialog(true)}
                            className="text-[10px] font-semibold text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded px-2 py-0.5 transition-all"
                            data-testid="btn-confirm-employment"
                          >
                            ✓ Confirm
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Working Pattern */}
                <div className="bg-muted/20 rounded-lg p-3 space-y-1.5 border border-border/40">
                  <h4 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">Working Pattern</h4>
                  {isAdmin && empEditMode ? (
                    <Select value={empWorkingPattern || "none"} onValueChange={v => setEmpWorkingPattern(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-working-pattern"><SelectValue placeholder="Not specified" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not Specified</SelectItem>
                        <SelectItem value="full-time">Full-Time</SelectItem>
                        <SelectItem value="part-time">Part-Time</SelectItem>
                        <SelectItem value="remote">Remote</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                        <SelectItem value="field">Field-based</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-sm capitalize">{empWorkingPattern || "—"}</p>
                  )}
                </div>

                {/* Country Code */}
                <div className="bg-muted/20 rounded-lg p-3 space-y-1.5 border border-border/40">
                  <h4 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    🌍 Country Code <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full">Required for ID</span>
                  </h4>
                  {isAdmin && empEditMode ? (
                    <Select value={empCountryCode || "none"} onValueChange={v => setEmpCountryCode(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-country-code"><SelectValue placeholder="Select country…" /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="none">— Not set —</SelectItem>
                        <SelectItem value="SD">🇸🇩 SD — Sudan</SelectItem>
                        <SelectItem value="SS">🇸🇸 SS — South Sudan</SelectItem>
                        <SelectItem value="ET">🇪🇹 ET — Ethiopia</SelectItem>
                        <SelectItem value="KE">🇰🇪 KE — Kenya</SelectItem>
                        <SelectItem value="UG">🇺🇬 UG — Uganda</SelectItem>
                        <SelectItem value="SO">🇸🇴 SO — Somalia</SelectItem>
                        <SelectItem value="ER">🇪🇷 ER — Eritrea</SelectItem>
                        <SelectItem value="DJ">🇩🇯 DJ — Djibouti</SelectItem>
                        <SelectItem value="CD">🇨🇩 CD — DR Congo</SelectItem>
                        <SelectItem value="CF">🇨🇫 CF — Central African Republic</SelectItem>
                        <SelectItem value="TD">🇹🇩 TD — Chad</SelectItem>
                        <SelectItem value="LY">🇱🇾 LY — Libya</SelectItem>
                        <SelectItem value="EG">🇪🇬 EG — Egypt</SelectItem>
                        <SelectItem value="NG">🇳🇬 NG — Nigeria</SelectItem>
                        <SelectItem value="GH">🇬🇭 GH — Ghana</SelectItem>
                        <SelectItem value="TZ">🇹🇿 TZ — Tanzania</SelectItem>
                        <SelectItem value="RW">🇷🇼 RW — Rwanda</SelectItem>
                        <SelectItem value="ZM">🇿🇲 ZM — Zambia</SelectItem>
                        <SelectItem value="ZW">🇿🇼 ZW — Zimbabwe</SelectItem>
                        <SelectItem value="GB">🇬🇧 GB — United Kingdom</SelectItem>
                        <SelectItem value="US">🇺🇸 US — United States</SelectItem>
                        <SelectItem value="OTHER">🌐 OTHER — Other</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-sm font-mono">{empCountryCode || "—"}</p>
                  )}
                  {!empCountryCode && empContractStart && (
                    <p className="text-[11px] text-amber-600">Set country to auto-generate Employee ID</p>
                  )}
                </div>

                {/* Employee ID */}
                <div className="bg-muted/20 rounded-lg p-3 space-y-1.5 border border-border/40">
                  <h4 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">Employee ID</h4>
                  {user.employeeId ? (
                    <>
                      <p className="font-semibold text-sm font-mono">{user.employeeId}</p>
                      {(() => {
                        const idPrefix = user.employeeId?.match(/^([A-Z]+)/)?.[1] ?? null;
                        const mismatch = idPrefix && empCountryCode && idPrefix !== empCountryCode;
                        if (!mismatch) return null;
                        return (
                          <div className="flex items-start gap-2 text-[11px] text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2.5 py-2 rounded-md border border-red-200 dark:border-red-800 mt-1">
                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span className="flex-1">
                              ID prefix <strong>{idPrefix}</strong> doesn't match country <strong>{empCountryCode}</strong>. This caused the folder to be named with the wrong country code.
                            </span>
                            {isAdmin && (
                              <button
                                onClick={() => setRegenIdConfirm(true)}
                                className="ml-1 shrink-0 text-[10px] font-bold text-red-700 dark:text-red-400 underline hover:no-underline"
                                data-testid="btn-regenerate-employee-id"
                              >
                                Fix ID
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      {empContractStart && empCountryCode ? "Auto-assigned on save" : "Set country + start date to enable"}
                    </p>
                  )}
                </div>

                {/* Reports To */}
                <div className="bg-muted/20 rounded-lg p-3 space-y-1.5 border border-border/40">
                  <h4 className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <UserCheck className="h-3 w-3" /> Reports To
                  </h4>
                  {isAdmin && empEditMode ? (
                    <Select value={empReportsTo || "none"} onValueChange={v => setEmpReportsTo(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-reports-to"><SelectValue placeholder="No manager" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Manager</SelectItem>
                        {allUsers.filter(u => u.id !== user.id).map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || u.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-semibold text-sm">{allUsers.find(u => u.id === empReportsTo)?.full_name || "—"}</p>
                  )}
                </div>
              </div>

              {/* Notification Preferences — only visible in edit mode */}
              {isAdmin && empEditMode && (
                <div className="bg-muted/20 rounded-lg p-3 border border-border/40">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <div className="relative flex-shrink-0">
                      <input type="checkbox" className="sr-only" checked={taskDigestOptOut} onChange={e => setTaskDigestOptOut(e.target.checked)} data-testid="toggle-task-digest-opt-out" />
                      <div onClick={() => setTaskDigestOptOut(v => !v)} className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${taskDigestOptOut ? 'bg-destructive' : 'bg-muted'} border border-border/60`}>
                        <div className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${taskDigestOptOut ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium">Opt out of Daily Task Digest email</p>
                      <p className="text-[11px] text-muted-foreground">User will not receive the daily task summary.</p>
                    </div>
                  </label>
                </div>
              )}

              {isAdmin && empEditMode && (
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setEmpEditMode(false)}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground border border-border/60 rounded-lg px-4 py-1.5 transition-all"
                  >
                    Cancel
                  </button>
                  <Button size="sm" onClick={handleEmploymentSave} disabled={empSaving} data-testid="button-save-employment">
                    {empSaving ? "Saving…" : "Save Employment Record"}
                  </Button>
                </div>
              )}
            </div>)}

            {/* ── LOCATION SECTION ────────────────────────────────────────── */}
            {activeSection === 'location' && (() => {
              const FIELD_STAFF = ['datacollector', 'coordinator', 'supervisor'];
              const isFieldStaff = FIELD_STAFF.includes((user.role || '').toLowerCase());

              return (
                <div className="p-5 sm:p-6 space-y-5">
                  {isFieldStaff ? (
                    /* ── Field Staff: Hub / State / Locality ── */
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <LocField label="Hub" required>
                          {editMode ? (
                            <Select value={editForm.hubId || ""} onValueChange={v => handleEditChange("hubId", v)}>
                              <SelectTrigger className="h-11 bg-background"><SelectValue placeholder="Select hub" /></SelectTrigger>
                              <SelectContent>{hubs.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : (
                            <p className="font-semibold text-base">{hubDisplayName || user.hubId || <span className="text-muted-foreground">Not set</span>}</p>
                          )}
                        </LocField>
                        <LocField label="Secondary Hub">
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
                        </LocField>
                        <LocField label="State">
                          {editMode ? (
                            <Select value={editForm.stateId || ""} onValueChange={v => handleEditChange("stateId", v)} disabled={!editForm.hubId}>
                              <SelectTrigger className="h-11 bg-background"><SelectValue placeholder="Select state" /></SelectTrigger>
                              <SelectContent>{availableStates.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : (
                            <p className="font-semibold text-base">{user.stateId ? (sudanStates.find(s => s.id === user.stateId)?.name || user.stateId) : <span className="text-muted-foreground">Not set</span>}</p>
                          )}
                        </LocField>
                        <LocField label="Locality">
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
                        </LocField>
                      </div>
                      {editMode && (
                        <div className="flex items-center gap-3 pt-2">
                          <Button onClick={() => { const re = user && editForm.role !== user.role && ['Admin','SuperAdmin'].includes(editForm.role||''); if(re && isProtectedOwner(currentUser?.id)) setAdminRoleOtpOpen(true); else handleEditSave(); }} disabled={isSaving}>
                            {isSaving ? "Saving…" : "Save Location"}
                          </Button>
                          <Button onClick={handleEditCancel} variant="outline">Cancel</Button>
                        </div>
                      )}
                    </>
                  ) : (
                    /* ── Non-Field Staff: Country / City / Address ── */
                    <>
                      {editMode ? (
                        <LocationAddressForm
                          initialValues={locPersonal}
                          saving={locSaving}
                          onSave={async (vals) => {
                            setLocSaving(true);
                            try {
                              const payload = { profile_id: user.id, ...vals };
                              if (locPersonalId) {
                                await supabase.from('hr_employee_personal').update(payload).eq('id', locPersonalId);
                              } else {
                                const { data } = await supabase.from('hr_employee_personal').insert(payload).select('id').single();
                                if (data) setLocPersonalId(data.id);
                              }
                              setLocPersonal(vals);
                              toast({ title: "Location saved", description: "Address details updated successfully." });
                              setEditMode(false);
                            } catch { toast({ title: "Save failed", variant: "destructive" }); }
                            finally { setLocSaving(false); }
                          }}
                          onCancel={handleEditCancel}
                          isAdmin={!!canEditProfile}
                        />
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <LocField label="Country">
                            <p className="font-semibold text-base">{locPersonal.country || <span className="text-muted-foreground">Not set</span>}</p>
                          </LocField>
                          <LocField label="City">
                            <p className="font-semibold text-base">{locPersonal.city || <span className="text-muted-foreground">Not set</span>}</p>
                          </LocField>
                          <LocField label="Address Line 1">
                            <p className="font-semibold text-base">{locPersonal.address_line1 || <span className="text-muted-foreground">Not set</span>}</p>
                          </LocField>
                          <LocField label="Address Line 2">
                            <p className="font-semibold text-base">{locPersonal.address_line2 || <span className="text-muted-foreground italic text-sm">—</span>}</p>
                          </LocField>
                        </div>
                      )}
                    </>
                  )}

                  {/* GPS Location Data — shown for all roles */}
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
                </div>
              );
            })()}

            {/* ── BENEFITS SECTION ────────────────────────────────────────── */}
            {activeSection === 'benefits' && (
              <div className="p-5 sm:p-6">
                <EmployeeBenefitsTab userId={user.id} viewedBySelf={currentUser?.id === user.id} />
              </div>
            )}

            {/* ── PERFORMANCE SECTION ─────────────────────────────────────── */}
            {activeSection === 'performance' && (<div className="p-5 sm:p-6 space-y-5">

              {/* Header row */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Performance Reviews</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{employeeReviews.length} review{employeeReviews.length !== 1 ? 's' : ''} on record</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" asChild>
                    <a href="/hr?tab=performance" target="_blank" rel="noopener noreferrer">
                      <Globe className="h-3.5 w-3.5" />Full HR Page
                    </a>
                  </Button>
                  {isAdmin && (
                    <Button size="sm" className="gap-1.5 text-xs h-8" onClick={openAddReview}>
                      <Plus className="h-3.5 w-3.5" />Add Review
                    </Button>
                  )}
                </div>
              </div>

              {/* Task-based KPIs */}
              {user.performance && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Rating', value: `${user.performance.rating}/5`, color: 'text-primary' },
                    { label: 'Completed Tasks', value: String(user.performance.totalCompletedTasks), color: 'text-foreground' },
                    { label: 'On-Time', value: `${user.performance.onTimeCompletion}%`, color: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Workload', value: String(user.performance.currentWorkload || 0), color: 'text-foreground' },
                  ].map(kpi => (
                    <div key={kpi.label} className="bg-muted/20 rounded-xl p-4 border border-border/40">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">{kpi.label}</p>
                      <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Review Score Trend */}
              {perfTrend.length > 0 && (
                <div className="bg-muted/20 rounded-xl p-4 border border-border/40">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Award className="h-3.5 w-3.5" />Score Trend — last {perfTrend.length} cycles
                  </p>
                  <div className="h-24">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={perfTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <XAxis dataKey="period" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 5]} ticks={[1,2,3,4,5]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, padding: '4px 10px' }} formatter={(v: number) => [`${v.toFixed(1)} / 5`, 'Rating']} />
                        <ReferenceLine y={3} stroke="#e2e8f0" strokeDasharray="4 2" />
                        <Line type="monotone" dataKey="rating" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Reviews list */}
              {employeeReviews.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Review History</p>
                  {employeeReviews.map((rev: any) => {
                    const statusColors: Record<string, string> = {
                      completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                      submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                      draft:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                    };
                    const statusCls = statusColors[rev.status] || 'bg-muted text-muted-foreground';
                    return (
                      <div key={rev.id} className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/10 p-4 hover:bg-muted/20 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{rev.review_period || '—'}</span>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{rev.review_type}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCls}`}>{rev.status}</span>
                          </div>
                          <div className="flex items-center gap-4 mt-1.5">
                            {rev.overall_rating != null && (
                              <span className="flex items-center gap-1 text-amber-500 text-sm font-semibold">
                                {'★'.repeat(Math.round(rev.overall_rating))}{'☆'.repeat(5 - Math.round(rev.overall_rating))}
                                <span className="text-muted-foreground font-normal text-xs ml-1">{Number(rev.overall_rating).toFixed(1)}/5</span>
                              </span>
                            )}
                            {rev.reviewed_at && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(rev.reviewed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {rev.strengths && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1"><span className="font-medium text-foreground">Strengths:</span> {rev.strengths}</p>}
                          {rev.development_areas && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1"><span className="font-medium text-foreground">Development:</span> {rev.development_areas}</p>}
                          <button
                            className="mt-2 text-[11px] text-primary font-semibold hover:underline flex items-center gap-1"
                            onClick={() => setViewingReview(rev)}
                          >
                            <Eye className="h-3 w-3" /> View full notes
                          </button>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setViewingReview(rev)} title="View full details">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {isAdmin && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditReview(rev)} title="Edit review">
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteReview(rev.id)}
                                disabled={deletingReviewId === rev.id}
                                title="Delete review"
                              >
                                {deletingReviewId === rev.id
                                  ? <span className="animate-spin h-3 w-3 border-2 border-destructive/30 border-t-destructive rounded-full" />
                                  : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 space-y-3">
                  <div className="p-4 rounded-2xl bg-muted/30 w-fit mx-auto">
                    <Award className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm text-muted-foreground">No performance reviews yet.</p>
                  {isAdmin && (
                    <Button size="sm" className="gap-2" onClick={openAddReview}>
                      <Plus className="h-4 w-4" />Add First Review
                    </Button>
                  )}
                </div>
              )}
            </div>)}

            {/* ── COMPENSATION & BANK SECTION ──────────────────────────────── */}
            {activeSection === 'compensation' && (<div className="p-5 sm:p-6 space-y-6">
              {user.bankAccount ? (
                <div className="space-y-4">
                  <div className="bg-muted/20 rounded-xl p-5 border border-border/40 space-y-4">
                    {/* Core details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Account Holder Name</p>
                        <p className="font-semibold text-base break-words">{user.bankAccount.accountName}</p>
                      </div>
                      {user.bankAccount.bankName && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Bank Name</p>
                          <p className="font-semibold text-base break-words">{user.bankAccount.bankName}</p>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Account Number</p>
                        <p className="font-semibold text-base font-mono tracking-wider">{user.bankAccount.accountNumber}</p>
                      </div>
                      {user.bankAccount.branch && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Branch</p>
                          <p className="font-semibold text-base break-words">{user.bankAccount.branch}</p>
                        </div>
                      )}
                      {user.bankAccount.country && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Country</p>
                          <p className="font-semibold text-base">
                            {({SD:"🇸🇩 Sudan",SS:"🇸🇸 South Sudan",KE:"🇰🇪 Kenya",ET:"🇪🇹 Ethiopia",
                               UG:"🇺🇬 Uganda",EG:"🇪🇬 Egypt",JO:"🇯🇴 Jordan",AE:"🇦🇪 UAE",
                               GB:"🇬🇧 United Kingdom",US:"🇺🇸 United States",DE:"🇩🇪 Germany",
                               FR:"🇫🇷 France",OTHER:"🌍 Other"} as Record<string,string>
                            )[user.bankAccount.country] || user.bankAccount.country}
                          </p>
                        </div>
                      )}
                      {user.bankAccount.currency && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Currency</p>
                          <p className="font-semibold text-base">{user.bankAccount.currency}</p>
                        </div>
                      )}
                    </div>
                    {/* International banking fields */}
                    {(user.bankAccount.iban || user.bankAccount.swiftBic || user.bankAccount.routingNumber) && (
                      <div className="border-t border-border/40 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <p className="sm:col-span-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">International Banking</p>
                        {user.bankAccount.iban && (
                          <div className="sm:col-span-2 space-y-1.5">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">IBAN</p>
                            <p className="font-semibold text-base font-mono tracking-wider break-all">{user.bankAccount.iban}</p>
                          </div>
                        )}
                        {user.bankAccount.swiftBic && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">SWIFT / BIC</p>
                            <p className="font-semibold text-base font-mono uppercase">{user.bankAccount.swiftBic}</p>
                          </div>
                        )}
                        {user.bankAccount.routingNumber && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Routing / Sort Code</p>
                            <p className="font-semibold text-base font-mono">{user.bankAccount.routingNumber}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {canEditBankAccount && (
                    <div className="flex items-center gap-2">
                      <Button onClick={() => setBankAccountFormOpen(true)} variant="outline" className="gap-2">
                        <Edit className="h-4 w-4" />Edit
                      </Button>
                      <Button
                        onClick={() => setDeleteBankAccountConfirmOpen(true)}
                        variant="destructive"
                        className="gap-2"
                        data-testid="button-delete-bank-account"
                      >
                        <Trash2 className="h-4 w-4" />Delete
                      </Button>
                    </div>
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

            {/* Classification sub-section — field staff only */}
            {showCompensation && canManageClassifications && (
              <div className="border-t pt-6 px-6 pb-6 space-y-6">
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
              </div>)}
            </div>)}

            {/* ── DOCUMENTS SECTION ────────────────────────────────────────── */}
            {activeSection === 'documents' && (<div className="p-5 sm:p-6 space-y-6">
              <EmployeeDocumentsTab
                userId={user.id}
                isAdmin={!!canEditProfile}
                currentUserId={currentUser?.id}
                employeeEmail={user.email ?? undefined}
                employeeName={user.name}
                employeeId={user.id}
                onVerificationChange={(allVerified, verified, total) =>
                  setDocsVerified({ allVerified, verified, total })
                }
                onDocumentUploaded={() => void triggerFolderSync()}
                hrFolderName={user.employeeId ? computeFolderName(user) : undefined}
              />
              <div className="border-t pt-6">
                <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><FileSignature className="h-4 w-4 text-indigo-600" /> Employment Contracts</h3>

              {/* Upload card — admin only */}
              {isAdmin && (
                <Card className="border border-indigo-200 bg-indigo-50/40 shadow-sm">
                  <CardHeader className="p-4 border-b border-indigo-100 bg-indigo-50">
                    <div className="flex items-center gap-2">
                      <Upload className="h-4 w-4 text-indigo-600" />
                      <CardTitle className="text-sm font-semibold text-indigo-800">Upload Contract Document</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <p className="text-xs text-muted-foreground">Accepted formats: PDF, DOCX, DOC, JPG, PNG (max 20 MB)</p>
                    <div className="space-y-2">
                      <Input
                        placeholder="Notes (optional) — e.g. 'Renewal 2025', 'Signed copy'"
                        value={contractNotes}
                        onChange={e => setContractNotes(e.target.value)}
                        className="text-sm"
                        data-testid="input-contract-notes"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          ref={contractFileRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={handleContractUpload}
                          data-testid="input-contract-file"
                        />
                        <Button
                          onClick={() => contractFileRef.current?.click()}
                          disabled={contractUploading}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                          data-testid="button-upload-contract"
                        >
                          {contractUploading
                            ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading…</>
                            : <><Upload className="h-4 w-4" />Choose File & Upload</>}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Contract list */}
              <Card className="shadow-sm">
                <CardHeader className="p-4 border-b bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileSignature className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm font-semibold">
                        Contract Documents
                        {contracts.length > 0 && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">({contracts.length} file{contracts.length !== 1 ? 's' : ''})</span>
                        )}
                      </CardTitle>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => user && fetchContracts(user.id)}
                      disabled={contractsLoading}
                      className="h-7 px-2 text-xs"
                    >
                      {contractsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {contractsLoading ? (
                    <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">Loading contracts…</span>
                    </div>
                  ) : contracts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                      <div className="p-4 rounded-full bg-muted/50">
                        <FileSignature className="h-8 w-8" />
                      </div>
                      <p className="text-sm font-medium">No contracts uploaded yet</p>
                      {isAdmin && <p className="text-xs">Use the upload panel above to add the first contract</p>}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {contracts.map(c => {
                        const isConfirmingDelete = contractDeleteId === c.id;
                        const sizeKb = c.file_size ? (c.file_size / 1024).toFixed(0) : null;
                        const sizeMb = c.file_size && c.file_size > 1024 * 1024 ? (c.file_size / 1024 / 1024).toFixed(1) + ' MB' : sizeKb ? sizeKb + ' KB' : null;
                        const isPdf = c.file_type === 'application/pdf' || c.file_name.toLowerCase().endsWith('.pdf');
                        const uploadDate = new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                        return (
                          <div key={c.id} className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors">
                            {/* File icon */}
                            <div className={`shrink-0 p-2.5 rounded-xl ${isPdf ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                              <FileText className="h-5 w-5" />
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{c.file_name}</p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                                <span className="text-xs text-muted-foreground">{uploadDate}</span>
                                {sizeMb && <span className="text-xs text-muted-foreground">{sizeMb}</span>}
                                {c.uploader_name && <span className="text-xs text-muted-foreground">by {c.uploader_name}</span>}
                              </div>
                              {c.notes && (
                                <p className="text-xs text-indigo-700 bg-indigo-50 rounded px-2 py-0.5 mt-1.5 inline-block">{c.notes}</p>
                              )}
                            </div>
                            {/* Actions */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleContractView(c)}
                                className="h-8 w-8 p-0 text-primary hover:bg-primary/10"
                                title="View inline"
                                data-testid={`button-view-contract-${c.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleContractDownload(c)}
                                className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-50"
                                title="Download"
                                data-testid={`button-download-contract-${c.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              {isAdmin && !isConfirmingDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setContractDeleteId(c.id)}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                  title="Delete"
                                  data-testid={`button-delete-contract-${c.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                              {isAdmin && isConfirmingDelete && (
                                <div className="flex items-center gap-1">
                                  <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => handleContractDelete(c)}>Delete</Button>
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setContractDeleteId(null)}>Cancel</Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
              </div>
            </div>)}

            {/* ── Contract inline preview Dialog ─────────────────────────── */}
            {contractPreview && (() => {
              const { url, name, mime } = contractPreview;
              const isPdf   = mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
              const isImage = (mime?.startsWith('image/') ?? false) || /\.(png|jpe?g|gif|webp)$/i.test(name);
              const canPreview = isPdf || isImage;
              return (
                <Dialog open onOpenChange={() => setContractPreview(null)}>
                  <DialogContent className="max-w-5xl w-[95vw] h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold truncate">{name}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => setContractPreview(null)}>✕</Button>
                    </div>
                    <div className="flex-1 overflow-auto">
                      {canPreview
                        ? isPdf
                          ? <iframe src={url} className="w-full h-full border-none" title={name} />
                          : <img src={url} alt={name} className="max-w-full max-h-full object-contain mx-auto p-4" />
                        : <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                            <FileText className="h-12 w-12 opacity-30" />
                            <p className="text-sm">Preview not available for this file type.</p>
                            <Button variant="outline" size="sm" onClick={() => window.open(url, '_blank')}>Open in new tab</Button>
                          </div>
                      }
                    </div>
                  </DialogContent>
                </Dialog>
              );
            })()}

            {/* ── PERSONAL SECTION ─────────────────────────────────────────── */}
            {activeSection === 'personal' && (<div className="p-5 sm:p-6">
              <EmployeePersonalTab userId={user.id} isAdmin={!!canEditProfile} />
            </div>)}

            {/* ── EDUCATION SECTION ────────────────────────────────────────── */}
            {/* NOTE: This section uses CSS display instead of conditional rendering so
                EmployeeEducationTab never unmounts and never loses its form state.
                React's && operator would unmount the component on every realtime ping
                (setUser creates a new object → re-render → activeSection check flickers). */}
            <div className="p-5 sm:p-6" style={{ display: activeSection === 'education' ? undefined : 'none' }}>
              <EmployeeEducationTab userId={user.id} isAdmin={!!canEditProfile} />
            </div>

            {/* ── SKILLS SECTION ───────────────────────────────────────────── */}
            {activeSection === 'skills' && (<div className="p-5 sm:p-6">
              <EmployeeSkillsTab userId={user.id} isAdmin={!!canEditProfile} empType={empType} />
            </div>)}

            {/* ── TRAINING & CERTIFICATIONS SECTION ────────────────────────── */}
            {activeSection === 'training' && (<div className="p-5 sm:p-6">
              <EmployeeTrainingTab userId={user.id} isAdmin={!!canEditProfile} />
            </div>)}

            {/* ── DEPENDENTS SECTION ───────────────────────────────────────── */}
            {activeSection === 'dependents' && (
              <div className="p-5 sm:p-6 space-y-8">
                <EmployeeNextOfKinSection userId={user.id} isAdmin={!!canEditProfile} />
                <div className="border-t border-border/40 pt-6">
                  <EmployeeDependentsTab userId={user.id} isAdmin={!!canEditProfile} />
                </div>
              </div>
            )}

            {/* ── ACCESS & SECURITY SECTION ────────────────────────────────── */}
            {activeSection === 'access' && (
              <div className="p-5 sm:p-6 space-y-5">
                {isAdmin && (
                  <div className="bg-muted/20 rounded-xl p-4 space-y-3 border border-border/40">
                    <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" /> System Role
                    </h4>
                    <div className="flex items-center gap-3 flex-wrap">
                      <RoleBadge role={user.role} size="sm" />
                      <UserClassificationBadge userId={user.id} />
                      {!editMode && (
                        <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleEdit} data-testid="button-change-role">
                          <Edit className="h-3 w-3" /> Change Role
                        </Button>
                      )}
                    </div>
                    {editMode && (
                      <div className="space-y-3">
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
                        {editForm.role && (() => {
                          const hint = getRoleHint(editForm.role);
                          if (!hint) return null;
                          return (
                            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 p-3 space-y-1 text-xs">
                              <p className="text-blue-800 dark:text-blue-200 leading-relaxed">{hint.description}</p>
                              <p className="text-blue-600 dark:text-blue-400"><span className="font-semibold">Pages affected: </span>{hint.affects}</p>
                            </div>
                          );
                        })()}
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => { const re = user && editForm.role !== user.role && ['Admin','SuperAdmin'].includes(editForm.role||''); if(re && isProtectedOwner(currentUser?.id)) setAdminRoleOtpOpen(true); else handleEditSave(); }} disabled={isSaving}>
                            {isSaving ? 'Saving…' : 'Save Role'}
                          </Button>
                          <Button size="sm" variant="outline" onClick={handleEditCancel}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Additional / Secondary Roles ────────────────────────── */}
                {isAdmin && (() => {
                  const MIGRATION_SQL = `-- Run once in Supabase SQL Editor (safe to re-run)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS additional_roles jsonb DEFAULT '[]'::jsonb;`;

                  return (
                    <div className="bg-muted/20 rounded-xl p-4 space-y-3 border border-border/40">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                          <Plus className="h-3.5 w-3.5" /> Additional Roles
                        </h4>
                        {!addRoleMode && !rolesNeedsMigration && (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAddRoleMode(true)}>
                            <Plus className="h-3 w-3" /> Add Role
                          </Button>
                        )}
                      </div>

                      {/* ── Migration required banner ── */}
                      {rolesNeedsMigration ? (
                        <div className="rounded-lg border border-amber-400/40 bg-amber-50/60 dark:bg-amber-900/20 p-3 space-y-3">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">One-time database setup required</p>
                              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                                One quick SQL change is needed on your <strong>profiles</strong> table to store additional roles.
                                Run the two-line SQL below in your <strong>Supabase SQL Editor</strong>, then click <em>I've run it, try again</em>.
                              </p>
                              <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1 font-medium">
                                💡 If you see <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">"column already exists"</code> — that means it's done! Click <em>I've run it, try again</em> below.
                              </p>
                            </div>
                          </div>
                          <div className="relative">
                            <pre className="text-[10px] leading-relaxed font-mono bg-[#0d1117] text-green-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{MIGRATION_SQL}</pre>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(MIGRATION_SQL);
                                toast({ title: 'SQL copied!', description: 'Paste it into Supabase SQL Editor and click Run.' });
                              }}
                              className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-semibold bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded transition-colors"
                            >
                              <Upload className="h-3 w-3" /> Copy SQL
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href="https://supabase.com/dashboard/project/_/sql/new"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                            >
                              <Globe className="h-3 w-3" /> Open Supabase SQL Editor ↗
                            </a>
                            <span className="text-muted-foreground text-[10px]">—</span>
                            <button
                              onClick={async () => {
                                setRolesNeedsMigration(false);
                                await fetchAdditionalRoles(user.id);
                                setAddRoleMode(true);
                              }}
                              className="text-[11px] text-muted-foreground hover:text-foreground underline"
                            >
                              I've run it, try again
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-[11px] text-muted-foreground">
                            Secondary roles this user holds in addition to their primary role — optionally scoped to a specific hub.
                          </p>

                          {additionalRoles.length === 0 && !addRoleMode && (
                            <p className="text-xs text-muted-foreground italic">No additional roles assigned.</p>
                          )}
                          <div className="space-y-2">
                            {additionalRoles.map(ar => (
                              <div key={ar.role} className="flex items-center justify-between gap-3 p-2.5 rounded-lg border bg-background text-sm">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="secondary" className="text-xs font-medium">
                                    {toRoleLabel(ar.role) || ar.role}
                                  </Badge>
                                  {ar.hub_id && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <MapPin className="h-3 w-3" /> {hubs.find(h => h.id === ar.hub_id)?.name || ar.hub_id}
                                    </span>
                                  )}
                                  {ar.assigned_at && (
                                    <span className="text-[10px] text-muted-foreground">
                                      Since {new Date(ar.assigned_at).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                                <Button size="sm" variant="ghost"
                                  className="h-6 w-6 p-0 text-red-500 hover:bg-red-50 hover:text-red-600 shrink-0"
                                  onClick={() => handleRemoveAdditionalRole(ar.role)}
                                  title="Remove this role">
                                  <UserX className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>

                          {addRoleMode && (
                            <div className="rounded-lg border bg-background p-3 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-xs font-medium">Role</label>
                                  <select
                                    className="border rounded-lg px-3 py-2 w-full h-9 text-xs bg-background"
                                    value={newRolePick}
                                    onChange={e => setNewRolePick(e.target.value)}
                                  >
                                    <option value="">Select role…</option>
                                    {(VISIBLE_ROLE_CODES as readonly string[])
                                      .filter(r => normalizeRole(r) !== normalizeRole(user.role || ''))
                                      .map(r => (
                                        <option key={r} value={r}>{toRoleLabel(r) || r}</option>
                                      ))}
                                  </select>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-xs font-medium">
                                    Hub Scope
                                    {['supervisor','hubSupervisor','hub_supervisor'].some(s => normalizeRole(newRolePick) === normalizeRole(s)) && (
                                      <span className="text-red-500 ml-1">*</span>
                                    )}
                                  </label>
                                  <select
                                    className="border rounded-lg px-3 py-2 w-full h-9 text-xs bg-background"
                                    value={newRoleHub}
                                    onChange={e => setNewRoleHub(e.target.value)}
                                  >
                                    <option value="">— Select hub —</option>
                                    {hubs.map(h => (
                                      <option key={h.id} value={h.id}>{h.name}</option>
                                    ))}
                                  </select>
                                  {['supervisor','hubSupervisor','hub_supervisor'].some(s => normalizeRole(newRolePick) === normalizeRole(s)) && !newRoleHub && (
                                    <p className="text-[10px] text-red-500">Hub is required for Supervisor role</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={handleAddRole}
                                  disabled={
                                    !newRolePick ||
                                    addRoleSaving ||
                                    (['supervisor','hubSupervisor','hub_supervisor'].some(s => normalizeRole(newRolePick) === normalizeRole(s)) && !newRoleHub)
                                  }
                                  className="gap-1.5"
                                >
                                  {addRoleSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                  {addRoleSaving ? 'Saving…' : 'Add Role'}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setAddRoleMode(false); setNewRolePick(''); setNewRoleHub(''); }}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                <div className="bg-muted/20 rounded-xl p-4 space-y-3 border border-border/40">
                  <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                    <UserCheck className="h-3.5 w-3.5" /> Account Status
                  </h4>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant={user.isApproved ? "default" : "destructive"} className="px-3 py-1.5 text-xs font-semibold rounded-full">
                      {user.isApproved ? '● Active' : '● Pending Approval'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">Last active: {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {!user.isApproved && (
                        <Button size="sm" className="gap-1.5" onClick={() => approveUser(user.id)} disabled={isApproving} data-testid="button-approve-user-access">
                          {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} Approve
                        </Button>
                      )}
                      {user.isApproved && (
                        <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => rejectUser(user.id)} disabled={isRejecting} data-testid="button-deactivate-user-access">
                          {isRejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />} Deactivate
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {isAdmin && (
                  <div className="bg-muted/20 rounded-xl p-4 space-y-3 border border-border/40">
                    <h4 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" /> Email Management
                    </h4>
                    <p className="text-sm break-all font-medium">{user.email}</p>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm" variant="outline" className="gap-1.5"
                        onClick={async () => {
                          setIsConfirmingEmail(true);
                          try {
                            await adminConfirmUserEmail(user.id);
                            toast({ title: 'Email confirmed successfully' });
                          } catch (e: any) {
                            toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
                          } finally { setIsConfirmingEmail(false); }
                        }}
                        disabled={isConfirmingEmail} data-testid="button-confirm-email"
                      >
                        {isConfirmingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Confirm Email
                      </Button>
                      <Button
                        size="sm" variant="outline" className="gap-1.5"
                        onClick={async () => {
                          const newEmail = window.prompt('Enter new email address:');
                          if (!newEmail) return;
                          try {
                            await adminUpdateUserEmail(user.id, newEmail);
                            toast({ title: 'Email updated', description: `Changed to ${newEmail}` });
                          } catch (e: any) {
                            toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
                          }
                        }}
                        data-testid="button-update-email"
                      >
                        <Edit className="h-3.5 w-3.5" /> Update Email
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── EQUIPMENT SECTION ────────────────────────────────────────── */}
            {activeSection === 'equipment' && (<div className="p-5 sm:p-6">
              <EmployeeEquipmentTab userId={user.id} isAdmin={!!canEditProfile} />
            </div>)}

            {/* ── POLICIES SECTION ──────────────────────────────────────────── */}
            {activeSection === 'policies' && (<div className="p-5 sm:p-6">
              <EmployeePoliciesTab userId={user.id} userRole={user.role as string | undefined} userName={user.fullName ?? undefined} />
            </div>)}

            {/* ── IT ACCOUNTS SECTION ──────────────────────────────────────── */}
            {activeSection === 'it-accounts' && (<div className="p-5 sm:p-6">
              <EmployeeITAccountsTab userId={user.id} isAdmin={!!canEditProfile} />
            </div>)}

            </Card>
        </div>
      </div>

      {/* ── Review Detail View Dialog ────────────────────────────── */}
      <Dialog open={!!viewingReview} onOpenChange={open => { if (!open) setViewingReview(null); }}>
        <DialogContent className="sm:max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
          {viewingReview && (() => {
            const rev = viewingReview;
            const statusColors: Record<string, string> = {
              completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
              submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
              draft:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
            };
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-amber-500" />
                    {rev.review_period || 'Performance Review'}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">{rev.review_type}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColors[rev.status] || 'bg-muted text-muted-foreground'}`}>{rev.status}</span>
                    {rev.reviewed_at && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(rev.reviewed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                  {/* Rating */}
                  {rev.overall_rating != null && (
                    <div className="flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-4">
                      <div className="text-2xl text-amber-400 leading-none font-bold tracking-tighter">
                        {'★'.repeat(Math.round(rev.overall_rating))}{'☆'.repeat(5 - Math.round(rev.overall_rating))}
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 leading-none">{Number(rev.overall_rating).toFixed(1)}<span className="text-sm font-normal text-muted-foreground ml-1">/5</span></p>
                        <p className="text-xs text-muted-foreground mt-0.5">Overall Rating</p>
                      </div>
                    </div>
                  )}

                  {/* Notes sections */}
                  {[
                    { label: 'Strengths', value: rev.strengths, icon: '💪', color: 'emerald' },
                    { label: 'Development Areas', value: rev.development_areas, icon: '📈', color: 'blue' },
                    { label: 'Manager Comments', value: rev.manager_comments, icon: '💬', color: 'purple' },
                    { label: 'Next Goals', value: rev.next_goals, icon: '🎯', color: 'amber' },
                  ].filter(s => s.value).map(section => (
                    <div key={section.label} className="space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <span>{section.icon}</span>{section.label}
                      </p>
                      <div className="rounded-lg bg-muted/30 border border-border/40 px-4 py-3">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{section.value}</p>
                      </div>
                    </div>
                  ))}

                  {!rev.strengths && !rev.development_areas && !rev.manager_comments && !rev.next_goals && (
                    <p className="text-sm text-muted-foreground text-center py-4">No notes recorded for this review.</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" className="flex-1" onClick={() => setViewingReview(null)}>Close</Button>
                    {isAdmin && (
                      <Button className="flex-1 gap-2" onClick={() => { setViewingReview(null); openEditReview(rev); }}>
                        <Edit className="h-4 w-4" />Edit Review
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit Performance Review Dialog ─────────────────── */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-500" />
              {editingReview ? 'Edit Performance Review' : 'Add Performance Review'}
            </DialogTitle>
            {user && <p className="text-sm text-muted-foreground mt-0.5">for {user.name}</p>}
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Review Period <span className="text-destructive">*</span></label>
                <input
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. Q1 2026, Annual 2025"
                  value={reviewForm.review_period}
                  onChange={e => setReviewForm(p => ({ ...p, review_period: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Review Type</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={reviewForm.review_type}
                  onChange={e => setReviewForm(p => ({ ...p, review_type: e.target.value }))}
                >
                  <option value="annual">Annual</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="probation">Probation</option>
                  <option value="mid_year">Mid-Year</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Overall Rating</label>
              <div className="flex items-center gap-2">
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setReviewForm(p => ({ ...p, overall_rating: n }))}
                    className={`text-2xl transition-transform hover:scale-110 ${n <= reviewForm.overall_rating ? 'text-amber-400' : 'text-muted-foreground/30'}`}
                  >★</button>
                ))}
                {reviewForm.overall_rating > 0 && (
                  <span className="text-sm font-semibold text-muted-foreground ml-1">{reviewForm.overall_rating}/5</span>
                )}
                {reviewForm.overall_rating > 0 && (
                  <button type="button" className="text-xs text-muted-foreground underline ml-1" onClick={() => setReviewForm(p => ({ ...p, overall_rating: 0 }))}>Clear</button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Strengths</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={2} placeholder="Key strengths demonstrated..."
                value={reviewForm.strengths}
                onChange={e => setReviewForm(p => ({ ...p, strengths: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Development Areas</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={2} placeholder="Areas to improve..."
                value={reviewForm.development_areas}
                onChange={e => setReviewForm(p => ({ ...p, development_areas: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Manager Comments</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={2} placeholder="Overall comments from manager..."
                value={reviewForm.manager_comments}
                onChange={e => setReviewForm(p => ({ ...p, manager_comments: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Next Goals</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={2} placeholder="Goals for next period..."
                value={reviewForm.next_goals}
                onChange={e => setReviewForm(p => ({ ...p, next_goals: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setReviewDialogOpen(false)} disabled={savingReview}>Cancel</Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleSaveReview}
                disabled={savingReview || !reviewForm.review_period}
              >
                {savingReview
                  ? <><span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />Saving…</>
                  : <><Award className="h-3.5 w-3.5" />{editingReview ? 'Update Review' : 'Save Review'}</>
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      <AlertDialog open={deleteBankAccountConfirmOpen} onOpenChange={setDeleteBankAccountConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Delete Bank Account
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the bank account details for <strong>{user?.name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingBankAccount}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBankAccount}
              disabled={isDeletingBankAccount}
              className="bg-destructive hover:bg-destructive/90 gap-2"
            >
              {isDeletingBankAccount ? (
                <><span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" />Deleting…</>
              ) : (
                <><Trash2 className="h-3.5 w-3.5" />Delete Account</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {user && showBadgeDialog && (
        <EmployeeBadgeDialog
          open={showBadgeDialog}
          onClose={() => setShowBadgeDialog(false)}
          user={{
            id:             user.id,
            name:           user.name,
            role:           user.role || "",
            roleLabel:      toRoleLabel(user.role || "") || user.role || "",
            email:          user.email || undefined,
            phone:          user.phone || undefined,
            avatar:         user.avatar || undefined,
            employeeId:     user.employeeId || undefined,
            hubName:        hubDisplayName || hubs.find(h => h.id === user.hubId)?.name || user.hubId || undefined,
            departmentName: departments.find(d => d.id === empDepartmentId)?.name || undefined,
          }}
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

      <AlertDialog open={showConfirmEmploymentDialog} onOpenChange={setShowConfirmEmploymentDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Employment</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark <strong>{user?.name || 'this employee'}</strong> as permanently employed, clearing their probation status. This action is logged and cannot be undone without admin access.
              <br /><br />
              Please make sure you have completed the probation review before confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                setEmpProbationConfirmed(true);
                setEmpProbationEnd("");
                setShowConfirmEmploymentDialog(false);
                toast({ title: "Employment confirmed", description: `${user?.name || 'Employee'} has been moved from probation to confirmed status. Save to apply.` });
              }}
              data-testid="btn-confirm-employment-confirm"
            >
              ✓ Confirm Employment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate Employee ID confirmation */}
      <AlertDialog open={regenIdConfirm} onOpenChange={setRegenIdConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Fix Employee ID Prefix?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  The current ID <strong className="font-mono">{user?.employeeId}</strong> starts with <strong>{user?.employeeId?.match(/^([A-Z]+)/)?.[1]}</strong> but this employee's country is <strong>{empCountryCode}</strong>.
                </p>
                <p>
                  Only the country prefix will be corrected —{' '}
                  <strong className="font-mono">
                    {user?.employeeId
                      ? empCountryCode + user.employeeId.slice(user.employeeId.match(/^([A-Z]+)/)?.[1]?.length ?? 2)
                      : ''}
                  </strong>.{' '}
                  The sequence number stays the same. No new folder will be created — the existing workspace folder will be renamed to match.
                </p>
                <p className="text-amber-600 dark:text-amber-400 font-medium">
                  Any links or references using the old folder name will need to be updated manually.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenIdLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleRegenerateId}
              disabled={regenIdLoading}
              data-testid="btn-confirm-regen-employee-id"
            >
              {regenIdLoading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Fixing…</> : '🔧 Fix Prefix'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserDetail;
