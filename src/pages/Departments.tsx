import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/context/user/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Building2, Plus, Pencil, Trash2, ChevronRight, ChevronDown,
  Users, Search, UserCheck, AlertTriangle, Loader2, GitBranch,
  ArrowLeft, Network,
} from "lucide-react";
import { PageInfoBanner } from "@/components/financial/PageInfoBanner";

/* ─── Types ──────────────────────────────────────── */
interface Department {
  id: string;
  name: string;
  description: string | null;
  parent_department_id: string | null;
  manager_user_id: string | null;
  hub_id: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
  manager?: { full_name: string | null; email: string | null } | null;
  member_count?: number;
  children?: Department[];
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department_id: string | null;
  reports_to: string | null;
  classification_level?: string | null;
}

const DEPT_COLORS = [
  "#1D3461", "#2563EB", "#7C3AED", "#059669", "#D97706",
  "#DC2626", "#0891B2", "#BE185D",
];

/* ─── Helpers ────────────────────────────────────── */
function buildTree(flat: Department[]): Department[] {
  const map = new Map<string, Department>();
  flat.forEach(d => map.set(d.id, { ...d, children: [] }));
  const roots: Department[] = [];
  map.forEach(d => {
    if (d.parent_department_id && map.has(d.parent_department_id)) {
      map.get(d.parent_department_id)!.children!.push(d);
    } else {
      roots.push(d);
    }
  });
  return roots;
}

function flattenTree(tree: Department[]): Department[] {
  const result: Department[] = [];
  const walk = (nodes: Department[]) => {
    nodes.forEach(n => {
      result.push(n);
      if (n.children?.length) walk(n.children);
    });
  };
  walk(tree);
  return result;
}

/* ─── Notification + email helper ───────────────── */
async function sendDeptNotification(opts: {
  recipientId: string;
  recipientEmail: string | null;
  titleEn: string;
  titleAr: string;
  messageEn: string;
  messageAr: string;
  entityId: string;
  triggeredBy: string;
}) {
  await supabase.from("notifications").insert({
    event_type: "department_update",
    entity_type: "department",
    entity_id: opts.entityId,
    recipient_id: opts.recipientId,
    triggered_by: opts.triggeredBy,
    title_en: opts.titleEn,
    title_ar: opts.titleAr,
    message_en: opts.messageEn,
    message_ar: opts.messageAr,
    priority: "medium",
    action_url: "/departments",
  });
  if (opts.recipientEmail) {
    await supabase.functions.invoke("send-email", {
      body: {
        to: opts.recipientEmail,
        subject: opts.titleEn,
        html: `
          <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <div style="background:#0F2041;padding:20px;border-radius:8px 8px 0 0">
              <h1 style="color:#fff;margin:0;font-size:20px">PACT Command Center</h1>
            </div>
            <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none">
              <h2 style="color:#1D3461;margin-top:0">${opts.titleEn}</h2>
              <p style="color:#374151">${opts.messageEn}</p>
              <a href="https://app.pactorg.com/departments" style="display:inline-block;background:#1D3461;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:12px">
                View Departments
              </a>
            </div>
          </div>`,
      },
    });
  }
}

/* ─── Department Form Dialog ─────────────────────── */
function DeptFormDialog({
  open, onClose, existing, allDepts, profiles, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  existing: Department | null;
  allDepts: Department[];
  profiles: Profile[];
  onSaved: () => void;
}) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string>("none");
  const [managerId, setManagerId] = useState<string>("none");
  const [color, setColor] = useState(DEPT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setDescription(existing?.description ?? "");
      setParentId(existing?.parent_department_id ?? "none");
      setManagerId(existing?.manager_user_id ?? "none");
      setColor(existing?.color ?? DEPT_COLORS[0]);
    }
  }, [open, existing]);

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        parent_department_id: parentId === "none" ? null : parentId,
        manager_user_id: managerId === "none" ? null : managerId,
        color,
        updated_at: new Date().toISOString(),
      };
      let entityId = existing?.id ?? "";

      if (existing) {
        const prevManagerId = existing.manager_user_id;
        const { error } = await supabase.from("departments").update(payload).eq("id", existing.id);
        if (error) throw error;
        if (managerId !== "none" && managerId !== prevManagerId) {
          const mgr = profiles.find(p => p.id === managerId);
          if (mgr) {
            await sendDeptNotification({
              recipientId: managerId, recipientEmail: mgr.email,
              titleEn: `You are now managing: ${name}`,
              titleAr: `أنت الآن مدير قسم: ${name}`,
              messageEn: `You have been assigned as the department manager of "${name}". You can view your department and team members in the Departments page.`,
              messageAr: `تم تعيينك مديراً لقسم "${name}".`,
              entityId: existing.id, triggeredBy: currentUser?.id ?? "",
            });
          }
        }
      } else {
        const { data, error } = await supabase.from("departments").insert(payload).select().single();
        if (error) throw error;
        entityId = data.id;
        if (managerId !== "none") {
          const mgr = profiles.find(p => p.id === managerId);
          if (mgr) {
            await sendDeptNotification({
              recipientId: managerId, recipientEmail: mgr.email,
              titleEn: `You have been assigned to manage: ${name}`,
              titleAr: `تم تعيينك لإدارة قسم: ${name}`,
              messageEn: `A new department "${name}" has been created and you have been assigned as its manager.`,
              messageAr: `تم إنشاء قسم جديد "${name}" وتعيينك مديراً له.`,
              entityId, triggeredBy: currentUser?.id ?? "",
            });
          }
        }
      }
      toast({ title: existing ? "Department updated" : "Department created" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const availableParents = allDepts.filter(d => d.id !== existing?.id);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {existing ? "Edit Department" : "New Department"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Finance" data-testid="input-dept-name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" data-testid="input-dept-description" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Parent Department</label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger data-testid="select-dept-parent"><SelectValue placeholder="None (top-level)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (top-level)</SelectItem>
                {availableParents.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Department Manager</label>
            <Select value={managerId} onValueChange={setManagerId}>
              <SelectTrigger data-testid="select-dept-manager"><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Color</label>
            <div className="flex gap-2 flex-wrap">
              {DEPT_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }} data-testid={`color-swatch-${c}`} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-dept">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {existing ? "Save Changes" : "Create Department"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Move Employee Dialog ───────────────────────── */
function MoveEmployeeDialog({
  open, onClose, employee, departments, onMoved,
}: {
  open: boolean;
  onClose: () => void;
  employee: Profile | null;
  departments: Department[];
  onMoved: () => void;
}) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [targetDeptId, setTargetDeptId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && employee) setTargetDeptId(employee.department_id ?? "none");
  }, [open, employee]);

  const handleMove = async () => {
    if (!employee) return;
    setSaving(true);
    try {
      const newDeptId = targetDeptId === "none" ? null : targetDeptId;
      const { error } = await supabase.from("profiles")
        .update({ department_id: newDeptId, updated_at: new Date().toISOString() })
        .eq("id", employee.id);
      if (error) throw error;

      const dept = departments.find(d => d.id === newDeptId);
      await sendDeptNotification({
        recipientId: employee.id,
        recipientEmail: employee.email,
        titleEn: dept ? `You have been moved to: ${dept.name}` : "You have been removed from your department",
        titleAr: dept ? `تم نقلك إلى قسم: ${dept.name}` : "تمت إزالتك من قسمك",
        messageEn: dept ? `Your department assignment has been updated to "${dept.name}".` : "You have been unassigned from your current department.",
        messageAr: dept ? `تم تحديث قسمك إلى "${dept.name}".` : "تمت إزالتك من قسمك الحالي.",
        entityId: newDeptId ?? "none",
        triggeredBy: currentUser?.id ?? "",
      });

      toast({ title: "Employee moved successfully" });
      onMoved();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Move Employee</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">Moving <strong>{employee?.full_name || "employee"}</strong> to:</p>
          <Select value={targetDeptId} onValueChange={setTargetDeptId}>
            <SelectTrigger data-testid="select-move-dept"><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Department</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleMove} disabled={saving} data-testid="button-confirm-move">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Org Chart Node ─────────────────────────────── */
function OrgNode({
  profile, allProfiles, depth, navigate,
}: {
  profile: Profile;
  allProfiles: Profile[];
  depth: number;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const directReports = allProfiles.filter(p => p.reports_to === profile.id);

  return (
    <div className={`${depth > 0 ? "ml-6 border-l-2 border-border/40 pl-4" : ""} mt-2`}>
      <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg hover:bg-muted/40 group">
        {directReports.length > 0 ? (
          <button onClick={() => setExpanded(e => !e)} className="shrink-0 text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        <div
          className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0F2041] to-[#2563EB] flex items-center justify-center text-white text-[10px] font-bold shrink-0 cursor-pointer"
          onClick={() => navigate(`/users/${profile.id}`)}
        >
          {(profile.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold truncate cursor-pointer hover:text-primary"
            onClick={() => navigate(`/users/${profile.id}`)}
            data-testid={`orgnode-name-${profile.id}`}
          >
            {profile.full_name || profile.email || "Unknown"}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground capitalize">{profile.role?.replace(/_/g, " ") || "—"}</span>
            {profile.classification_level && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                {profile.classification_level}
              </Badge>
            )}
            {directReports.length > 0 && (
              <span className="text-[10px] text-primary font-medium">{directReports.length} report{directReports.length > 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
      </div>
      {expanded && directReports.length > 0 && (
        <div>
          {directReports.map(r => (
            <OrgNode key={r.id} profile={r} allProfiles={allProfiles} depth={depth + 1} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Org Chart Tab ──────────────────────────────── */
function OrgChartTab({ profiles, departments }: { profiles: Profile[]; departments: Department[] }) {
  const navigate = useNavigate();
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const filteredProfiles = deptFilter === "all" ? profiles : profiles.filter(p => p.department_id === deptFilter);
  const filteredIds = new Set(filteredProfiles.map(p => p.id));
  const roots = filteredProfiles.filter(p => !p.reports_to || !filteredIds.has(p.reports_to));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Network className="h-4 w-4 text-primary" />
          Reporting Chain Org Chart
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-48 h-9" data-testid="select-orgchart-dept">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground ml-auto">
          {filteredProfiles.length} people · {roots.length} top-level
        </p>
      </div>

      {roots.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No reporting relationships configured yet. Set "Reports To" in each employee's profile to build the chart.
        </div>
      ) : (
        <div className="bg-muted/10 rounded-xl border p-4">
          {roots.map(r => (
            <OrgNode key={r.id} profile={r} allProfiles={filteredProfiles} depth={0} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Department Card ────────────────────────────── */
function DeptCard({
  dept, allProfiles, allDepts, depth, canManage,
  onEdit, onDelete, onMoveEmployee, navigate,
}: {
  dept: Department;
  allProfiles: Profile[];
  allDepts: Department[];
  depth: number;
  canManage: boolean;
  onEdit: (d: Department) => void;
  onDelete: (d: Department) => void;
  onMoveEmployee: (p: Profile) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showMembers, setShowMembers] = useState(false);
  const members = allProfiles.filter(p => p.department_id === dept.id);
  const hasChildren = (dept.children?.length ?? 0) > 0;

  return (
    <div className={`${depth > 0 ? "ml-6 border-l-2 border-border/40 pl-4" : ""}`}>
      <Card className="mb-3 shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: dept.color ?? "#1D3461" }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base truncate">{dept.name}</h3>
                  {depth === 0 && <Badge variant="outline" className="text-[10px] shrink-0">Top Level</Badge>}
                  <Badge className="text-[10px] shrink-0 bg-primary/10 text-primary border-primary/20">
                    <Users className="h-2.5 w-2.5 mr-1" />
                    {members.length} {members.length === 1 ? "member" : "members"}
                  </Badge>
                </div>
                {dept.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{dept.description}</p>}
                {dept.manager && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Manager: <span className="font-medium text-foreground">{dept.manager.full_name || dept.manager.email || "—"}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {hasChildren && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(e => !e)} data-testid={`button-expand-dept-${dept.id}`}>
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMembers(m => !m)} title="Show members" data-testid={`button-members-dept-${dept.id}`}>
                <Users className="h-4 w-4" />
              </Button>
              {canManage && (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(dept)} data-testid={`button-edit-dept-${dept.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(dept)} data-testid={`button-delete-dept-${dept.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {showMembers && (
            <div className="mt-3 pt-3 border-t space-y-2">
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No members assigned</p>
              ) : (
                members.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg hover:bg-muted/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0F2041] to-[#2563EB] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                        {(m.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{m.full_name || m.email || "Unknown"}</p>
                        <div className="flex items-center gap-1">
                          <p className="text-[10px] text-muted-foreground capitalize">{m.role || "—"}</p>
                          {m.classification_level && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{m.classification_level}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigate(`/users/${m.id}`)} title="View profile" data-testid={`button-view-user-${m.id}`}>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                      {canManage && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onMoveEmployee(m)} title="Move to another department" data-testid={`button-move-user-${m.id}`}>
                          <GitBranch className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {hasChildren && expanded && (
        <div>
          {dept.children!.map(child => (
            <DeptCard key={child.id} dept={child} allProfiles={allProfiles} allDepts={allDepts} depth={depth + 1}
              canManage={canManage}
              onEdit={onEdit} onDelete={onDelete} onMoveEmployee={onMoveEmployee} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────── */
export default function Departments() {
  const { currentUser } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();

  // super_admin only can create/edit/delete/move employees
  const canManage = currentUser?.role === "super_admin" || currentUser?.role === "superadmin";

  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [moveTarget, setMoveTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: depts }, { data: profs }] = await Promise.all([
        supabase
          .from("departments")
          .select("*, manager:profiles!departments_manager_user_id_fkey(full_name,email)")
          .order("name"),
        supabase
          .from("profiles")
          .select("id, full_name, email, role, department_id, reports_to")
          .order("full_name"),
      ]);

      const { data: classData } = await supabase
        .from("user_classifications")
        .select("user_id, classification_level")
        .is("effective_until", null);
      const classMap: Record<string, string> = {};
      (classData || []).forEach((c: any) => { classMap[c.user_id] = c.classification_level; });

      const memberCount: Record<string, number> = {};
      (profs || []).forEach(p => {
        if (p.department_id) memberCount[p.department_id] = (memberCount[p.department_id] || 0) + 1;
      });

      setDepartments(((depts || []).map(d => ({ ...d, member_count: memberCount[d.id] || 0 }))) as Department[]);
      setProfiles(((profs || []).map((p: any) => ({ ...p, classification_level: classMap[p.id] || null }))) as Profile[]);
    } catch (err: any) {
      toast({ title: "Error loading departments", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await supabase.from("profiles").update({ department_id: null }).eq("department_id", deleteTarget.id);
      await supabase.from("departments").update({ parent_department_id: deleteTarget.parent_department_id }).eq("parent_department_id", deleteTarget.id);
      const { error } = await supabase.from("departments").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "Department deleted" });
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const tree = buildTree(departments);
  const flat = flattenTree(tree);
  const filteredFlat = search ? flat.filter(d => d.name.toLowerCase().includes(search.toLowerCase())) : null;
  const unassignedCount = profiles.filter(p => !p.department_id).length;

  return (
    <div className="flex flex-col min-h-full p-4 sm:p-6 gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate(-1)} data-testid="button-back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary shrink-0" />
            Departments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your organisation's departments and employee assignments</p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditTarget(null); setFormOpen(true); }} data-testid="button-new-dept">
            <Plus className="h-4 w-4 mr-2" />
            New Department
          </Button>
        )}
      </div>

      <PageInfoBanner
        title="Departments & Org Structure"
        description="Create departments, assign managers and employees, and move staff between teams. Department managers receive email and in-app notifications when appointed. Use the Org Chart tab to view reporting chains."
        icon={<Building2 className="h-5 w-5" />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Departments", value: departments.length, icon: Building2 },
          { label: "Total Staff", value: profiles.length, icon: Users },
          { label: "Unassigned Staff", value: unassignedCount, icon: AlertTriangle },
          { label: "Sub-departments", value: departments.filter(d => d.parent_department_id).length, icon: GitBranch },
        ].map(s => (
          <Card key={s.label} className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><s.icon className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="departments" className="w-full">
        <TabsList className="h-auto p-1 bg-muted/40 rounded-xl mb-4">
          <TabsTrigger value="departments" className="flex items-center gap-1.5 py-2 px-4 rounded-lg text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-departments">
            <Building2 className="h-4 w-4" /> Departments
          </TabsTrigger>
          <TabsTrigger value="orgchart" className="flex items-center gap-1.5 py-2 px-4 rounded-lg text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-orgchart">
            <Network className="h-4 w-4" /> Org Chart
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments">
          <div className="space-y-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search departments…" className="pl-9" data-testid="input-search-depts" />
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground text-sm">Loading departments…</p>
              </div>
            ) : departments.length === 0 ? (
              <Card className="shadow-sm border-dashed">
                <CardContent className="p-12 text-center">
                  <div className="p-4 rounded-full bg-muted/50 inline-block mb-4">
                    <Building2 className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">No Departments Yet</h3>
                  <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-4">Create your first department to start organising your team.</p>
                  {canManage && (
                    <Button onClick={() => { setEditTarget(null); setFormOpen(true); }} data-testid="button-create-first-dept">
                      <Plus className="h-4 w-4 mr-2" />Create Department
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : filteredFlat ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{filteredFlat.length} results</p>
                {filteredFlat.map(d => (
                  <DeptCard key={d.id} dept={d} allProfiles={profiles} allDepts={departments} depth={0}
                    canManage={canManage}
                    onEdit={dept => { setEditTarget(dept); setFormOpen(true); }}
                    onDelete={setDeleteTarget} onMoveEmployee={setMoveTarget} navigate={navigate} />
                ))}
              </div>
            ) : (
              <div>
                {tree.map(d => (
                  <DeptCard key={d.id} dept={d} allProfiles={profiles} allDepts={departments} depth={0}
                    canManage={canManage}
                    onEdit={dept => { setEditTarget(dept); setFormOpen(true); }}
                    onDelete={setDeleteTarget} onMoveEmployee={setMoveTarget} navigate={navigate} />
                ))}
              </div>
            )}

            {unassignedCount > 0 && !search && (
              <Card className="shadow-sm border-amber-200 dark:border-amber-800/40">
                <CardHeader className="p-4 border-b bg-amber-50/50 dark:bg-amber-900/10">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" /> Unassigned Staff ({unassignedCount})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    {profiles.filter(p => !p.department_id).slice(0, 10).map(p => (
                      <div key={p.id} className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg hover:bg-muted/40">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                            {(p.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{p.full_name || p.email || "Unknown"}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{p.role || "—"}</p>
                          </div>
                        </div>
                        {canManage && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setMoveTarget(p)} data-testid={`button-assign-dept-${p.id}`}>
                            Assign
                          </Button>
                        )}
                      </div>
                    ))}
                    {unassignedCount > 10 && (
                      <p className="text-xs text-muted-foreground text-center pt-1">…and {unassignedCount - 10} more.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="orgchart">
          <OrgChartTab profiles={profiles} departments={departments} />
        </TabsContent>
      </Tabs>

      {/* Dialogs: only render if user can manage */}
      {canManage && (
        <DeptFormDialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          existing={editTarget}
          allDepts={departments}
          profiles={profiles}
          onSaved={load}
        />
      )}

      {canManage && moveTarget && (
        <MoveEmployeeDialog
          open={!!moveTarget}
          onClose={() => setMoveTarget(null)}
          employee={moveTarget}
          departments={departments}
          onMoved={load}
        />
      )}

      {canManage && (
        <Dialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Delete Department
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3">
              <p className="text-sm">Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?</p>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
                <p>• All members will be unassigned</p>
                <p>• Sub-departments will be moved up one level</p>
                <p>• This action cannot be undone</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting} data-testid="button-confirm-delete-dept">
                {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
