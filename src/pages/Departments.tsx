import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/context/user/UserContext";
import { useSuperAdmin } from "@/context/superAdmin/SuperAdminContext";
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
  ArrowLeft, Network, Shield, BarChart3, PieChart as PieIcon,
  TrendingUp, Award, UserX, CheckCircle2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  RadialBarChart, RadialBar,
} from "recharts";

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
  triggeredBy: string | null;
}) {
  const { error: notifError } = await supabase.from("notifications").insert({
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
  if (notifError) {
    console.error("[sendDeptNotification] notification insert failed:", notifError.message);
  }
  if (opts.recipientEmail) {
    const { error: emailError } = await supabase.functions.invoke("send-email", {
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
    if (emailError) {
      console.error("[sendDeptNotification] email send failed:", emailError.message);
    }
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
              entityId: existing.id, triggeredBy: currentUser?.id ?? null,
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
              entityId, triggeredBy: currentUser?.id ?? null,
            });
          }
        }
      }
      toast({ title: existing ? "Department updated" : "Department created" });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Exclude self and all descendants to prevent hierarchy cycles
  const getDescendantIds = (id: string): Set<string> => {
    const result = new Set<string>([id]);
    allDepts.forEach(d => { if (d.parent_department_id === id) getDescendantIds(d.id).forEach(x => result.add(x)); });
    return result;
  };
  const excludedIds = existing ? getDescendantIds(existing.id) : new Set<string>();
  const availableParents = allDepts.filter(d => !excludedIds.has(d.id));

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
      // Skip if department is unchanged — no DB write or notification needed
      const prevDeptId = employee.department_id ?? null;
      if (newDeptId === prevDeptId) {
        toast({ title: "No change", description: "Employee is already in this department." });
        onClose();
        return;
      }

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
        triggeredBy: currentUser?.id ?? null,
      });

      toast({ title: "Employee moved successfully" });
      onMoved();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      toast({ title: "Error", description: message, variant: "destructive" });
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

/* ─── Level palette ──────────────────────────────── */
const LEVEL_PALETTE = [
  { solid: "#0F2041", light: "#E8ECF3", label: "Level 1" },
  { solid: "#1D3461", light: "#E8EEF8", label: "Level 2" },
  { solid: "#2563EB", light: "#DBEAFE", label: "Level 3" },
  { solid: "#7C3AED", light: "#EDE9FE", label: "Level 4" },
  { solid: "#059669", light: "#D1FAE5", label: "Level 5" },
  { solid: "#D97706", light: "#FEF3C7", label: "Level 6" },
  { solid: "#BE185D", light: "#FCE7F3", label: "Level 7" },
];
function levelPalette(depth: number) {
  return LEVEL_PALETTE[Math.min(depth, LEVEL_PALETTE.length - 1)];
}

/* ─── Department Org Node ────────────────────────── */
function DeptOrgNode({
  dept, allProfiles, depth, navigate,
}: {
  dept: Department;
  allProfiles: Profile[];
  depth: number;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const children = dept.children ?? [];
  const members = allProfiles.filter(p => p.department_id === dept.id);
  const palette = levelPalette(depth);
  const accentColor = dept.color ?? palette.solid;

  return (
    <div className={depth > 0 ? "relative mt-3 ml-6 pl-4" : "mt-3"}>
      {/* Vertical connector line */}
      {depth > 0 && (
        <span
          className="absolute left-0 top-0 bottom-0 w-px"
          style={{ background: accentColor + "55", left: "0px" }}
        />
      )}
      {/* Horizontal connector */}
      {depth > 0 && (
        <span
          className="absolute top-5 left-0 h-px w-4"
          style={{ background: accentColor + "55" }}
        />
      )}

      {/* Node card */}
      <div
        className="rounded-xl border-2 shadow-sm overflow-hidden transition-shadow hover:shadow-md"
        style={{ borderColor: accentColor }}
        data-testid={`deptnode-${dept.id}`}
      >
        {/* Coloured header band */}
        <div
          className="flex items-center justify-between gap-2 px-3 py-2"
          style={{ background: accentColor, color: "#fff" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-3.5 w-3.5 shrink-0 opacity-80" />
            <span className="text-sm font-bold truncate">{dept.name}</span>
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: "rgba(255,255,255,0.25)", color: "#fff" }}
            >
              {palette.label}
            </span>
          </div>
          {children.length > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="shrink-0 opacity-80 hover:opacity-100 transition-opacity"
              data-testid={`button-expand-deptnode-${dept.id}`}
            >
              {expanded
                ? <ChevronDown className="h-4 w-4" />
                : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-3 py-2 flex flex-wrap items-center gap-3" style={{ background: palette.light + "cc" }}>
          {/* Manager */}
          <div className="flex items-center gap-1 min-w-0">
            <UserCheck className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[11px] text-muted-foreground truncate">
              {dept.manager?.full_name || dept.manager?.email || <em>No manager</em>}
            </span>
          </div>

          {/* Members badge */}
          <span
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: accentColor + "20", color: accentColor }}
          >
            <Users className="h-2.5 w-2.5" />
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>

          {/* Sub-depts badge */}
          {children.length > 0 && (
            <span
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: accentColor + "15", color: accentColor }}
            >
              <GitBranch className="h-2.5 w-2.5" />
              {children.length} sub-dept{children.length > 1 ? "s" : ""}
            </span>
          )}

          {/* Dept description */}
          {dept.description && (
            <span className="text-[10px] text-muted-foreground italic truncate max-w-xs">{dept.description}</span>
          )}

          {/* Navigate to detail */}
          <button
            className="ml-auto text-[10px] flex items-center gap-0.5 hover:underline"
            style={{ color: accentColor }}
            onClick={() => navigate(`/departments`)}
            data-testid={`button-dept-link-${dept.id}`}
          >
            View <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Children */}
      {expanded && children.length > 0 && (
        <div className="relative">
          {children.map(child => (
            <DeptOrgNode key={child.id} dept={child} allProfiles={allProfiles} depth={depth + 1} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Reporting Chain Node (unchanged) ──────────── */
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
  const [mode, setMode] = useState<"dept" | "reporting">("dept");
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const tree = buildTree(departments);

  // Department tree: filter to a branch if selected
  const treeToShow = deptFilter === "all"
    ? tree
    : (() => {
        function findBranch(nodes: Department[]): Department | null {
          for (const n of nodes) {
            if (n.id === deptFilter) return n;
            const found = findBranch(n.children ?? []);
            if (found) return found;
          }
          return null;
        }
        const branch = findBranch(tree);
        return branch ? [branch] : tree;
      })();

  // Reporting chain filter
  const filteredProfiles = deptFilter === "all" ? profiles : profiles.filter(p => p.department_id === deptFilter);
  const filteredIds = new Set(filteredProfiles.map(p => p.id));
  const roots = filteredProfiles.filter(p => !p.reports_to || !filteredIds.has(p.reports_to));

  const totalDepts = departments.length;
  const topLevel = tree.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
          <button
            onClick={() => setMode("dept")}
            className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${mode === "dept" ? "bg-[#1D3461] text-white" : "hover:bg-muted/60"}`}
            data-testid="toggle-dept-tree"
          >
            <Building2 className="h-3.5 w-3.5" />
            Department Tree
          </button>
          <button
            onClick={() => setMode("reporting")}
            className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${mode === "reporting" ? "bg-[#1D3461] text-white" : "hover:bg-muted/60"}`}
            data-testid="toggle-reporting-chain"
          >
            <Network className="h-3.5 w-3.5" />
            Reporting Chain
          </button>
        </div>

        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-52 h-9" data-testid="select-orgchart-dept">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <p className="text-xs text-muted-foreground ml-auto">
          {mode === "dept"
            ? `${totalDepts} dept${totalDepts !== 1 ? "s" : ""} · ${topLevel} top-level`
            : `${filteredProfiles.length} people · ${roots.length} top-level`}
        </p>
      </div>

      {/* Level colour legend */}
      {mode === "dept" && departments.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Levels:</span>
          {LEVEL_PALETTE.slice(0, Math.max(1, Math.min(7, topLevel + 2))).map((p, i) => (
            <span key={i} className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: p.light, color: p.solid }}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.solid }} />
              {p.label}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      {mode === "dept" ? (
        departments.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No departments yet</p>
            <p className="text-xs mt-1">Create departments using the "Departments" tab, then come back to see the org chart.</p>
          </div>
        ) : (
          <div className="bg-muted/10 rounded-xl border p-4 overflow-x-auto">
            {treeToShow.map(dept => (
              <DeptOrgNode key={dept.id} dept={dept} allProfiles={profiles} depth={0} navigate={navigate} />
            ))}
          </div>
        )
      ) : (
        roots.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
            <Network className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No reporting relationships configured</p>
            <p className="text-xs mt-1">Set "Reports To" in each employee's profile to build the reporting chain.</p>
          </div>
        ) : (
          <div className="bg-muted/10 rounded-xl border p-4">
            {roots.map(r => (
              <OrgNode key={r.id} profile={r} allProfiles={filteredProfiles} depth={0} navigate={navigate} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

/* ─── Overview / Analytics Tab ──────────────────── */
function OverviewTab({ departments, profiles }: { departments: Department[]; profiles: Profile[] }) {
  const flat = flattenTree(buildTree(departments));
  const assigned = profiles.filter(p => p.department_id).length;
  const unassigned = profiles.length - assigned;
  const managed = departments.filter(d => d.manager_user_id).length;
  const unmanaged = departments.length - managed;
  const avgTeam = departments.length ? (assigned / departments.length).toFixed(1) : "0";

  // Staff per department (top 12)
  const staffPerDept = flat
    .map(d => ({
      name: d.name.length > 18 ? d.name.slice(0, 16) + "…" : d.name,
      members: profiles.filter(p => p.department_id === d.id).length,
      color: d.color ?? "#1D3461",
    }))
    .filter(d => d.members > 0)
    .sort((a, b) => b.members - a.members)
    .slice(0, 12);

  // Role distribution
  const roleCounts: Record<string, number> = {};
  profiles.forEach(p => {
    const r = (p.role || "Unknown").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    roleCounts[r] = (roleCounts[r] || 0) + 1;
  });
  const roleData = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value], i) => ({ name, value, fill: LEVEL_PALETTE[i % LEVEL_PALETTE.length].solid }));

  // Assignment donut
  const assignDonut = [
    { name: "Assigned", value: assigned, fill: "#059669" },
    { name: "Unassigned", value: unassigned, fill: "#F59E0B" },
  ];

  // Management coverage radial
  const managedPct = departments.length ? Math.round((managed / departments.length) * 100) : 0;

  const STATS = [
    { label: "Total Departments", value: departments.length, icon: Building2, color: "#0F2041", light: "#E8ECF3" },
    { label: "Total Staff", value: profiles.length, icon: Users, color: "#2563EB", light: "#DBEAFE" },
    { label: "Assigned Staff", value: assigned, icon: CheckCircle2, color: "#059669", light: "#D1FAE5" },
    { label: "Unassigned", value: unassigned, icon: UserX, color: "#D97706", light: "#FEF3C7" },
    { label: "With Manager", value: managed, icon: Award, color: "#7C3AED", light: "#EDE9FE" },
    { label: "Avg Team Size", value: avgTeam, icon: TrendingUp, color: "#0891B2", light: "#CFFAFE" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATS.map(s => (
          <div
            key={s.label}
            className="rounded-xl p-4 flex flex-col gap-2 border shadow-sm"
            style={{ background: s.light, borderColor: s.color + "30" }}
          >
            <div className="flex items-center justify-between">
              <div className="p-1.5 rounded-lg" style={{ background: s.color + "20" }}>
                <s.icon className="h-4 w-4" style={{ color: s.color }} />
              </div>
            </div>
            <p className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] font-medium text-muted-foreground leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Staff per Dept Bar Chart */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[#2563EB]" />
              Staff per Department
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {staffPerDept.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No department members yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={staffPerDept} margin={{ top: 4, right: 16, left: -10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <RechartTooltip
                    formatter={(v: number) => [v, "Members"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="members" radius={[4, 4, 0, 0]}>
                    {staffPerDept.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Assignment Donut */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-[#059669]" />
              Staff Assignment
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4 flex flex-col items-center">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={assignDonut}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {assignDonut.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartTooltip formatter={(v: number) => [v, "People"]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex gap-4 justify-center mt-1">
              {assignDonut.map(d => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: d.fill }} />
                  <span className="font-medium">{d.name}</span>
                  <span className="text-muted-foreground">({d.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Role Distribution */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-[#7C3AED]" />
              Role Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {roleData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No staff data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={roleData} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                  <RechartTooltip formatter={(v: number) => [v, "People"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {roleData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Management Coverage Radial */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Award className="h-4 w-4 text-[#7C3AED]" />
              Management Coverage
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4 flex flex-col items-center">
            <div className="relative">
              <ResponsiveContainer width={170} height={170}>
                <RadialBarChart
                  cx="50%" cy="50%"
                  innerRadius={52} outerRadius={78}
                  startAngle={90} endAngle={-270}
                  data={[{ value: managedPct, fill: "#7C3AED" }, { value: 100 - managedPct, fill: "#EDE9FE" }]}
                  barSize={18}
                >
                  <RadialBar dataKey="value" cornerRadius={8} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-extrabold text-[#7C3AED]">{managedPct}%</span>
                <span className="text-[10px] text-muted-foreground">managed</span>
              </div>
            </div>
            <div className="flex gap-4 justify-center mt-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#7C3AED] inline-block" />
                <span className="font-medium">{managed} with manager</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EDE9FE] border border-[#7C3AED]/30 inline-block" />
                <span className="font-medium">{unmanaged} without</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─── Department Card ────────────────────────────── */
function DeptCard({
  dept, allProfiles, allDepts, depth, canManage, canMoveEmployees,
  onEdit, onDelete, onMoveEmployee, navigate,
}: {
  dept: Department;
  allProfiles: Profile[];
  allDepts: Department[];
  depth: number;
  canManage: boolean;
  canMoveEmployees: boolean;
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
                      {canMoveEmployees && (
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
              canManage={canManage} canMoveEmployees={canMoveEmployees}
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
  const { isSuperAdmin } = useSuperAdmin();
  const navigate = useNavigate();
  const { toast } = useToast();

  // super_admin (all variants) can create/edit/delete departments AND move employees
  const roleNorm = (currentUser?.role ?? "").toLowerCase().replace(/[_\s]/g, "");
  const canManage = isSuperAdmin || roleNorm === "superadmin";
  // admin (and super_admin) can move employees between departments
  const canMoveEmployees = canManage || roleNorm === "admin";

  // Only admin+ may access this page; non-admins see an access-denied screen
  const canAccess = canMoveEmployees;

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
      (classData || []).forEach((c) => { if (c.user_id && c.classification_level) classMap[c.user_id] = c.classification_level; });

      const memberCount: Record<string, number> = {};
      (profs || []).forEach(p => {
        if (p.department_id) memberCount[p.department_id] = (memberCount[p.department_id] || 0) + 1;
      });

      setDepartments(((depts || []).map(d => ({ ...d, member_count: memberCount[d.id] || 0 }))) as Department[]);
      setProfiles((profs || []).map(p => ({ ...p, classification_level: classMap[p.id] || null })) as Profile[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      toast({ title: "Error loading departments", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (canAccess) load(); }, [canAccess, load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error: unassignErr } = await supabase.from("profiles").update({ department_id: null }).eq("department_id", deleteTarget.id);
      if (unassignErr) throw unassignErr;
      const { error: reparentErr } = await supabase.from("departments").update({ parent_department_id: deleteTarget.parent_department_id }).eq("parent_department_id", deleteTarget.id);
      if (reparentErr) throw reparentErr;
      const { error } = await supabase.from("departments").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "Department deleted" });
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const tree = buildTree(departments);
  const flat = flattenTree(tree);
  const filteredFlat = search ? flat.filter(d => d.name.toLowerCase().includes(search.toLowerCase())) : null;
  const unassignedCount = profiles.filter(p => !p.department_id).length;

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Shield className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">Only administrators can access the Departments page.</p>
        <Button onClick={() => navigate("/dashboard")} data-testid="button-go-to-dashboard">
          Go to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full gap-0">

      {/* ── Gradient Hero Header ── */}
      <div
        className="relative overflow-hidden px-4 sm:px-8 pt-6 pb-8"
        style={{ background: "linear-gradient(135deg, #0F2041 0%, #1D3461 55%, #2563EB 100%)" }}
      >
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{ background: "#fff", transform: "translate(30%, -40%)" }} />
        <div className="absolute bottom-0 left-16 w-40 h-40 rounded-full opacity-5" style={{ background: "#fff", transform: "translateY(50%)" }} />

        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-white/70 hover:text-white hover:bg-white/10" onClick={() => navigate(-1)} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-white/10">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Departments</h1>
              </div>
              <p className="text-sm text-blue-200 mt-1 ml-11">Organisation structure, teams & reporting</p>
            </div>
          </div>
          {canManage && (
            <Button
              onClick={() => { setEditTarget(null); setFormOpen(true); }}
              className="bg-white text-[#1D3461] hover:bg-blue-50 font-semibold shadow-lg"
              data-testid="button-new-dept"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Department
            </Button>
          )}
        </div>

        {/* Quick stat pills in header */}
        <div className="relative flex flex-wrap gap-3 mt-6 ml-11">
          {[
            { label: "Departments", value: departments.length, color: "bg-white/15" },
            { label: "Total Staff", value: profiles.length, color: "bg-white/15" },
            { label: "Unassigned", value: unassignedCount, color: unassignedCount > 0 ? "bg-amber-400/25" : "bg-white/15" },
            { label: "Sub-depts", value: departments.filter(d => d.parent_department_id).length, color: "bg-white/15" },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-xl px-4 py-2 text-white`}>
              <p className="text-xl font-extrabold leading-none">{s.value}</p>
              <p className="text-[10px] text-blue-200 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6 flex flex-col gap-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-auto p-1 bg-muted/40 rounded-xl mb-4 flex-wrap">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 py-2 px-4 rounded-lg text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-overview">
            <BarChart3 className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-1.5 py-2 px-4 rounded-lg text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-departments">
            <Building2 className="h-4 w-4" /> Departments
          </TabsTrigger>
          <TabsTrigger value="orgchart" className="flex items-center gap-1.5 py-2 px-4 rounded-lg text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-orgchart">
            <Network className="h-4 w-4" /> Org Chart
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab departments={departments} profiles={profiles} />
        </TabsContent>

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
                    canManage={canManage} canMoveEmployees={canMoveEmployees}
                    onEdit={dept => { setEditTarget(dept); setFormOpen(true); }}
                    onDelete={setDeleteTarget} onMoveEmployee={setMoveTarget} navigate={navigate} />
                ))}
              </div>
            ) : (
              <div>
                {tree.map(d => (
                  <DeptCard key={d.id} dept={d} allProfiles={profiles} allDepts={departments} depth={0}
                    canManage={canManage} canMoveEmployees={canMoveEmployees}
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
                        {canMoveEmployees && (
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
      </div>{/* end p-4/p-6 wrapper */}

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

      {canMoveEmployees && moveTarget && (
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
