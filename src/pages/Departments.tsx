import { useState, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConnectedPagesBar } from "@/components/ui/connected-pages-bar";
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
  LayoutGrid, AlignLeft, Table2, ArrowUpDown, ChevronsUpDown,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
  avatar_url?: string | null;
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
function MemberAvatar({ m, accent, navigate }: { m: Profile; accent: string; navigate: ReturnType<typeof useNavigate> }) {
  return m.avatar_url ? (
    <img
      src={m.avatar_url}
      alt={m.full_name || ""}
      title={m.full_name || m.email || ""}
      className="w-6 h-6 rounded-full object-cover ring-1 ring-white cursor-pointer hover:scale-110 transition-transform shrink-0"
      onClick={() => navigate(`/users/${m.id}`)}
    />
  ) : (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold ring-1 ring-white cursor-pointer hover:scale-110 transition-transform shrink-0"
      style={{ background: accent }}
      title={m.full_name || m.email || ""}
      onClick={() => navigate(`/users/${m.id}`)}
    >
      {(m.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
    </div>
  );
}

function DeptOrgNode({
  dept, allProfiles, depth, navigate, forceExpand,
}: {
  dept: Department;
  allProfiles: Profile[];
  depth: number;
  navigate: ReturnType<typeof useNavigate>;
  forceExpand?: boolean | null;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [showMembers, setShowMembers] = useState(false);
  const children = dept.children ?? [];

  useEffect(() => {
    if (forceExpand === true) setExpanded(true);
    else if (forceExpand === false) setExpanded(false);
  }, [forceExpand]);
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
        <div className="px-3 py-2 space-y-2" style={{ background: palette.light + "cc" }}>
          {/* Row 1: Manager + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <UserCheck className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[11px] text-muted-foreground truncate">
                {dept.manager?.full_name || dept.manager?.email || <em>No manager</em>}
              </span>
            </div>
            <span
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full cursor-pointer hover:opacity-80"
              style={{ background: accentColor + "20", color: accentColor }}
              onClick={() => members.length > 0 && setShowMembers(s => !s)}
              title={members.length > 0 ? "Click to show/hide members" : ""}
            >
              <Users className="h-2.5 w-2.5" />
              {members.length} {members.length === 1 ? "member" : "members"}
              {members.length > 0 && (showMembers ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />)}
            </span>
            {children.length > 0 && (
              <span
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: accentColor + "15", color: accentColor }}
              >
                <GitBranch className="h-2.5 w-2.5" />
                {children.length} sub-dept{children.length > 1 ? "s" : ""}
              </span>
            )}
            {dept.description && (
              <span className="text-[10px] text-muted-foreground italic truncate max-w-xs">{dept.description}</span>
            )}
            <button
              className="ml-auto text-[10px] flex items-center gap-0.5 hover:underline"
              style={{ color: accentColor }}
              onClick={() => navigate(`/departments`)}
              data-testid={`button-dept-link-${dept.id}`}
            >
              View <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          {/* Row 2: Member avatar strip */}
          {members.length > 0 && (
            <div className="flex items-center gap-1">
              {members.slice(0, 6).map(m => (
                <MemberAvatar key={m.id} m={m} accent={accentColor} navigate={navigate} />
              ))}
              {members.length > 6 && (
                <span className="text-[9px] text-muted-foreground font-semibold ml-1">+{members.length - 6} more</span>
              )}
            </div>
          )}
          {/* Row 3: Expanded member list */}
          {showMembers && members.length > 0 && (
            <div className="border-t pt-2 space-y-1 max-h-36 overflow-y-auto" style={{ borderColor: accentColor + "30" }}>
              {members.map(m => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-1.5 py-0.5 rounded-md hover:bg-black/5 cursor-pointer transition-colors"
                  onClick={() => navigate(`/users/${m.id}`)}
                >
                  <MemberAvatar m={m} accent={accentColor} navigate={navigate} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold truncate">{m.full_name || m.email}</p>
                    <p className="text-[9px] text-muted-foreground capitalize">{m.role?.replace(/_/g, " ") || "—"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded && children.length > 0 && (
        <div className="relative">
          {children.map(child => (
            <DeptOrgNode key={child.id} dept={child} allProfiles={allProfiles} depth={depth + 1} navigate={navigate} forceExpand={forceExpand} />
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

/* ─── Compact Org Node (for "compact" view) ─────── */
function CompactOrgNode({
  dept, allProfiles, depth, navigate,
}: {
  dept: Department;
  allProfiles: Profile[];
  depth: number;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [expanded, setExpanded] = useState(depth < 3);
  const children = dept.children ?? [];
  const members = allProfiles.filter(p => p.department_id === dept.id);
  const palette = levelPalette(depth);
  const accentColor = dept.color ?? palette.solid;

  return (
    <div className={depth > 0 ? "relative mt-1.5 ml-5 pl-3" : "mt-1.5"}>
      {depth > 0 && <span className="absolute left-0 top-0 bottom-0 w-px" style={{ background: accentColor + "50" }} />}
      {depth > 0 && <span className="absolute top-3.5 left-0 h-px w-3" style={{ background: accentColor + "50" }} />}

      <div
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-default"
        style={{ borderColor: accentColor + "50", background: palette.light + "cc" }}
        data-testid={`compact-node-${dept.id}`}
      >
        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ background: accentColor }}>
          <Building2 className="h-2.5 w-2.5 text-white" />
        </div>
        <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
          {dept.manager?.full_name && (
            <span className="text-xs font-bold truncate shrink-0" style={{ color: accentColor }}>
              {dept.manager.full_name}
            </span>
          )}
          {dept.manager?.full_name && (
            <span className="text-[9px] text-muted-foreground/60 shrink-0">·</span>
          )}
          <span className="text-[11px] font-medium text-muted-foreground truncate">{dept.name}</span>
        </div>
        <span className="text-[9px] font-medium px-1.5 py-0 rounded-full shrink-0" style={{ background: accentColor + "20", color: accentColor }}>
          {palette.label}
        </span>
        <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground shrink-0">
          <Users className="h-2.5 w-2.5" />{members.length}
        </span>
        {children.length > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            data-testid={`compact-expand-${dept.id}`}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
        <button
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(`/departments`)}
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {expanded && children.length > 0 && (
        <div className="relative">
          {children.map(child => (
            <CompactOrgNode key={child.id} dept={child} allProfiles={allProfiles} depth={depth + 1} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Cards Grid view ────────────────────────────── */
function OrgCardsGrid({
  departments, allProfiles, navigate,
}: {
  departments: Department[];
  allProfiles: Profile[];
  navigate: ReturnType<typeof useNavigate>;
}) {
  const flat = flattenTree(buildTree(departments));

  function getDepth(dept: Department, flat: Department[]): number {
    let d = 0;
    let cur = dept;
    while (cur.parent_department_id) {
      const parent = flat.find(f => f.id === cur.parent_department_id);
      if (!parent) break;
      d++;
      cur = parent;
    }
    return d;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {flat.map(dept => {
        const depth = getDepth(dept, flat);
        const palette = levelPalette(depth);
        const accentColor = dept.color ?? palette.solid;
        const members = allProfiles.filter(p => p.department_id === dept.id);
        const parentDept = dept.parent_department_id ? flat.find(f => f.id === dept.parent_department_id) : null;
        const avatarMembers = members.slice(0, 5);
        const roleCounts: Record<string, number> = {};
        members.forEach(m => {
          const r = (m.role || "unknown").replace(/_/g, " ");
          roleCounts[r] = (roleCounts[r] || 0) + 1;
        });
        const topRoles = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).slice(0, 2);

        return (
          <div
            key={dept.id}
            className="rounded-xl border shadow-sm hover:shadow-md transition-all overflow-hidden group cursor-pointer"
            style={{ borderColor: accentColor + "40" }}
            onClick={() => navigate(`/departments`)}
            data-testid={`orgcard-${dept.id}`}
          >
            {/* Gradient header */}
            <div
              className="px-4 py-3 flex items-center justify-between gap-2"
              style={{ background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%)` }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{dept.name}</p>
                  {parentDept && (
                    <p className="text-[9px] text-white/70 truncate">↳ {parentDept.name}</p>
                  )}
                </div>
              </div>
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ background: "rgba(255,255,255,0.25)", color: "#fff" }}
              >
                {palette.label}
              </span>
            </div>

            {/* Body */}
            <div className="p-3 space-y-2.5" style={{ background: palette.light + "88" }}>
              {/* Stats row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: accentColor + "18", color: accentColor }}>
                  <Users className="h-2.5 w-2.5" /> {members.length} {members.length === 1 ? "member" : "members"}
                </span>
                {(dept.children?.length ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/60 text-muted-foreground">
                    <GitBranch className="h-2.5 w-2.5" /> {dept.children!.length} sub-dept{dept.children!.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Manager */}
              <div className="flex items-center gap-1.5">
                <UserCheck className="h-3 w-3 shrink-0" style={{ color: dept.manager ? accentColor : "#94a3b8" }} />
                {dept.manager ? (
                  <span className="text-[10px] text-muted-foreground truncate">
                    <span className="font-semibold text-foreground">{dept.manager.full_name || dept.manager.email}</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-600 font-medium">No manager</span>
                )}
              </div>

              {/* Description */}
              {dept.description && (
                <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">{dept.description}</p>
              )}

              {/* Member avatars */}
              {members.length > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {avatarMembers.map((m, i) => (
                      <div
                        key={m.id}
                        className="w-6 h-6 rounded-full border-2 border-background flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                        style={{ background: accentColor, marginLeft: i > 0 ? "-5px" : "0", zIndex: avatarMembers.length - i }}
                        title={m.full_name || m.email || ""}
                      >
                        {(m.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                    ))}
                    {members.length > 5 && (
                      <div
                        className="w-6 h-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[7px] font-bold text-muted-foreground shrink-0"
                        style={{ marginLeft: "-5px" }}
                      >
                        +{members.length - 5}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {topRoles.map(([role, count]) => (
                      <span
                        key={role}
                        className="text-[8px] px-1.5 py-0.5 rounded-full capitalize"
                        style={{ background: accentColor + "18", color: accentColor }}
                      >
                        {role} ({count})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Table view ─────────────────────────────────── */
function OrgTableView({
  departments, allProfiles, navigate,
}: {
  departments: Department[];
  allProfiles: Profile[];
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [sortField, setSortField] = useState<"name" | "members" | "children">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");

  const flat = flattenTree(buildTree(departments));

  function getDepth(dept: Department): number {
    let d = 0;
    let cur = dept;
    while (cur.parent_department_id) {
      const parent = flat.find(f => f.id === cur.parent_department_id);
      if (!parent) break;
      d++;
      cur = parent;
    }
    return d;
  }

  const rows = flat.map(dept => ({
    dept,
    depth: getDepth(dept),
    members: allProfiles.filter(p => p.department_id === dept.id).length,
    children: dept.children?.length ?? 0,
    parentName: dept.parent_department_id ? flat.find(f => f.id === dept.parent_department_id)?.name ?? "—" : "—",
  }));

  const filtered = search
    ? rows.filter(r => r.dept.name.toLowerCase().includes(search.toLowerCase()) || (r.dept.description || "").toLowerCase().includes(search.toLowerCase()))
    : rows;

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === "name") cmp = a.dept.name.localeCompare(b.dept.name);
    else if (sortField === "members") cmp = a.members - b.members;
    else if (sortField === "children") cmp = a.children - b.children;
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortBtn({ field, label }: { field: typeof sortField; label: string }) {
    const active = sortField === field;
    return (
      <button
        className={`flex items-center gap-1 font-semibold hover:text-foreground transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
        onClick={() => toggleSort(field)}
      >
        {label}
        {active
          ? <ArrowUpDown className="h-3 w-3" />
          : <ChevronsUpDown className="h-3 w-3 opacity-50" />}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter departments…"
          className="pl-9 h-9 text-sm"
          data-testid="input-table-search"
        />
      </div>

      <div className="rounded-xl border overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="py-2 pl-4 w-8">#</TableHead>
              <TableHead className="py-2"><SortBtn field="name" label="Department" /></TableHead>
              <TableHead className="py-2 hidden sm:table-cell text-muted-foreground text-xs font-semibold">Parent</TableHead>
              <TableHead className="py-2 hidden md:table-cell text-muted-foreground text-xs font-semibold">Level</TableHead>
              <TableHead className="py-2 hidden md:table-cell text-muted-foreground text-xs font-semibold">Manager</TableHead>
              <TableHead className="py-2"><SortBtn field="members" label="Members" /></TableHead>
              <TableHead className="py-2 hidden sm:table-cell"><SortBtn field="children" label="Sub-depts" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No departments found</TableCell>
              </TableRow>
            ) : sorted.map(({ dept, depth, members, children, parentName }, idx) => {
              const palette = levelPalette(depth);
              const accentColor = dept.color ?? palette.solid;
              return (
                <TableRow
                  key={dept.id}
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/departments`)}
                  data-testid={`table-row-dept-${dept.id}`}
                >
                  <TableCell className="pl-4 py-2.5 text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                  <TableCell className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: accentColor + "20" }}>
                        <Building2 className="h-3 w-3" style={{ color: accentColor }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{dept.name}</p>
                        {dept.description && <p className="text-[9px] text-muted-foreground truncate">{dept.description}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 hidden sm:table-cell">
                    <span className="text-xs text-muted-foreground">{parentName}</span>
                  </TableCell>
                  <TableCell className="py-2.5 hidden md:table-cell">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: palette.light, color: palette.solid }}>
                      {palette.label}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 hidden md:table-cell">
                    {dept.manager ? (
                      <span className="text-xs text-muted-foreground truncate max-w-[120px] block">{dept.manager.full_name || dept.manager.email || "—"}</span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-medium">Unmanaged</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2.5">
                    <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: accentColor }}>
                      <Users className="h-3 w-3" />{members}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 hidden sm:table-cell">
                    {children > 0 ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <GitBranch className="h-3 w-3" />{children}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{sorted.length} of {departments.length} departments</p>
    </div>
  );
}

/* ─── Shared props for new view components ─────────── */
interface CommonOrgProps {
  departments: Department[];
  allProfiles: Profile[];
  navigate: ReturnType<typeof useNavigate>;
}

/* ─── 1. Classic (Top-Down) ──────────────────────── */
function ClassicOrgNode({ dept, allProfiles, navigate, depth = 0 }: {
  dept: Department; allProfiles: Profile[]; navigate: ReturnType<typeof useNavigate>; depth?: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const children = dept.children ?? [];
  const members = allProfiles.filter(p => p.department_id === dept.id);
  const palette = levelPalette(depth);
  const accent = dept.color ?? palette.solid;
  return (
    <div className="flex flex-col items-center min-w-[130px] max-w-[160px]">
      <div
        className="rounded-xl border-2 px-3 py-2.5 w-full text-center cursor-pointer hover:shadow-md transition-all shadow-sm"
        style={{ borderColor: accent, background: palette.light }}
        onClick={() => navigate("/departments")}
      >
        <div className="w-8 h-8 rounded-lg mx-auto mb-1 flex items-center justify-center" style={{ background: accent }}>
          <Building2 className="h-4 w-4 text-white" />
        </div>
        <p className="text-[11px] font-bold leading-snug truncate" style={{ color: accent }}>{dept.name}</p>
        <p className="text-[9px] text-muted-foreground mt-0.5">{members.length} members</p>
        {dept.manager && <p className="text-[9px] text-muted-foreground truncate">{dept.manager.full_name || dept.manager.email}</p>}
        {children.length > 0 && (
          <button onClick={e => { e.stopPropagation(); setOpen(v => !v); }} className="mt-1 text-[9px] font-bold" style={{ color: accent }}>
            {open ? "▲ hide" : `▼ +${children.length}`}
          </button>
        )}
      </div>
      {open && children.length > 0 && (
        <div className="flex flex-col items-center w-full">
          <div className="w-0.5 h-5" style={{ background: accent + "60" }} />
          {children.length > 1 && (
            <div className="h-0.5 self-stretch" style={{ background: accent + "40" }} />
          )}
          <div className="flex flex-wrap justify-center gap-2 mt-0">
            {children.map(child => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="w-0.5 h-5" style={{ background: accent + "60" }} />
                <ClassicOrgNode dept={child} allProfiles={allProfiles} navigate={navigate} depth={depth + 1} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function ClassicOrgChart({ departments, allProfiles, navigate }: CommonOrgProps) {
  const tree = buildTree(departments);
  return (
    <div className="overflow-x-auto pb-4 bg-muted/10 rounded-xl border p-4">
      <div className="flex gap-6 justify-start min-w-max">
        {tree.map(root => <ClassicOrgNode key={root.id} dept={root} allProfiles={allProfiles} navigate={navigate} />)}
      </div>
    </div>
  );
}

/* ─── 2. Horizontal (Left-to-Right) ─────────────── */
function HorizontalOrgNode({ dept, allProfiles, navigate, depth = 0 }: {
  dept: Department; allProfiles: Profile[]; navigate: ReturnType<typeof useNavigate>; depth?: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const children = dept.children ?? [];
  const members = allProfiles.filter(p => p.department_id === dept.id);
  const palette = levelPalette(depth);
  const accent = dept.color ?? palette.solid;
  return (
    <div className="flex items-center">
      <div
        className="rounded-lg border-2 px-3 py-2 min-w-[120px] max-w-[170px] cursor-pointer hover:shadow-md transition-all shadow-sm shrink-0"
        style={{ borderColor: accent, background: palette.light }}
        onClick={() => navigate("/departments")}
      >
        <p className="text-[11px] font-bold leading-snug truncate" style={{ color: accent }}>{dept.name}</p>
        <p className="text-[9px] text-muted-foreground">{members.length} members · {palette.label}</p>
        {dept.manager && <p className="text-[9px] text-muted-foreground truncate">{dept.manager.full_name || dept.manager.email}</p>}
        {children.length > 0 && (
          <button onClick={e => { e.stopPropagation(); setOpen(v => !v); }} className="text-[9px] font-bold mt-0.5" style={{ color: accent }}>
            {open ? "◀ hide" : `▶ +${children.length}`}
          </button>
        )}
      </div>
      {open && children.length > 0 && (
        <div className="flex items-center">
          <div className="h-0.5 w-5" style={{ background: accent + "60" }} />
          <div className="flex flex-col gap-1.5">
            {children.map((child, i) => (
              <div key={child.id} className="flex items-center">
                {children.length > 1 && <div className="w-0.5 h-full absolute" />}
                <div className="h-0.5 w-3" style={{ background: accent + "40" }} />
                <HorizontalOrgNode dept={child} allProfiles={allProfiles} navigate={navigate} depth={depth + 1} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function HorizontalOrgChart({ departments, allProfiles, navigate }: CommonOrgProps) {
  const tree = buildTree(departments);
  return (
    <div className="overflow-x-auto pb-4 bg-muted/10 rounded-xl border p-4">
      <div className="flex flex-col gap-4 min-w-max">
        {tree.map(root => <HorizontalOrgNode key={root.id} dept={root} allProfiles={allProfiles} navigate={navigate} />)}
      </div>
    </div>
  );
}

/* ─── 3. Circular / Hub-and-Spoke Org Chart ─────── */
function HubDeptCard({
  dept, allProfiles, navigate, depth,
}: { dept: Department; allProfiles: Profile[]; navigate: ReturnType<typeof useNavigate>; depth: number }) {
  const [open, setOpen] = useState(true);
  const children = dept.children ?? [];
  const members = allProfiles.filter(p => p.department_id === dept.id);
  const palette = levelPalette(depth);
  const accent = dept.color ?? palette.solid;

  return (
    <div className="flex flex-col items-center">
      {/* Card */}
      <div
        className="rounded-xl border-2 overflow-hidden shadow-md hover:shadow-xl transition-all w-44 cursor-pointer select-none"
        style={{ borderColor: accent }}
        onClick={() => navigate("/departments")}
        data-testid={`hub-card-${dept.id}`}
      >
        {/* Header band */}
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: accent }}>
          <Building2 className="h-3.5 w-3.5 text-white/80 shrink-0" />
          <p className="text-[11px] font-bold text-white truncate flex-1">{dept.name}</p>
          <span className="text-[9px] font-bold text-white/80 shrink-0 bg-white/20 px-1.5 py-0.5 rounded-full">
            {members.length}
          </span>
        </div>
        {/* Body */}
        <div className="px-2.5 py-2 space-y-1.5" style={{ background: palette.light + "dd" }}>
          {/* Manager */}
          <div className="flex items-center gap-1">
            <UserCheck className="h-3 w-3 shrink-0" style={{ color: accent + "cc" }} />
            <p className="text-[9px] truncate" style={{ color: accent + "cc" }}>
              {dept.manager?.full_name || dept.manager?.email || <em className="opacity-50">No manager</em>}
            </p>
          </div>
          {/* Member avatars */}
          {members.length > 0 && (
            <div className="flex items-center gap-0.5 flex-wrap">
              {members.slice(0, 5).map(m => (
                m.avatar_url ? (
                  <img
                    key={m.id}
                    src={m.avatar_url}
                    alt={m.full_name || ""}
                    title={m.full_name || m.email || ""}
                    className="w-5 h-5 rounded-full object-cover ring-1 ring-white hover:scale-110 transition-transform"
                    onClick={e => { e.stopPropagation(); navigate(`/users/${m.id}`); }}
                  />
                ) : (
                  <div
                    key={m.id}
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[7px] font-bold ring-1 ring-white hover:scale-110 transition-transform"
                    style={{ background: accent }}
                    title={m.full_name || m.email || ""}
                    onClick={e => { e.stopPropagation(); navigate(`/users/${m.id}`); }}
                  >
                    {(m.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                )
              ))}
              {members.length > 5 && (
                <span className="text-[8px] font-semibold ml-0.5" style={{ color: accent + "99" }}>+{members.length - 5}</span>
              )}
            </div>
          )}
          {/* Sub-depts + expand toggle */}
          {children.length > 0 && (
            <button
              className="text-[9px] flex items-center gap-1 font-semibold hover:opacity-70 transition-opacity"
              style={{ color: accent }}
              onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
            >
              <GitBranch className="h-2.5 w-2.5" />
              {children.length} sub-dept{children.length > 1 ? "s" : ""}
              {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Children subtree */}
      {open && children.length > 0 && (
        <div className="flex flex-col items-center">
          {/* vertical stem */}
          <div className="w-0.5 h-5" style={{ background: accent + "60" }} />
          {/* horizontal bar if multiple children */}
          {children.length > 1 && (
            <div className="relative flex gap-4 justify-center">
              <div
                className="absolute top-0 left-0 right-0 h-0.5"
                style={{ background: accent + "40" }}
              />
              {children.map(child => (
                <div key={child.id} className="flex flex-col items-center pt-0">
                  <div className="w-0.5 h-5" style={{ background: accent + "60" }} />
                  <HubDeptCard dept={child} allProfiles={allProfiles} navigate={navigate} depth={depth + 1} />
                </div>
              ))}
            </div>
          )}
          {children.length === 1 && (
            <HubDeptCard dept={children[0]} allProfiles={allProfiles} navigate={navigate} depth={depth + 1} />
          )}
        </div>
      )}
    </div>
  );
}

function CircularOrgChart({ departments, allProfiles, navigate }: CommonOrgProps) {
  const tree = buildTree(departments);
  const allFlat = flattenTree(tree);
  const totalMembers = allProfiles.filter(p => p.department_id).length;

  return (
    <div className="flex flex-col items-center gap-0 py-6 overflow-x-auto min-w-full">
      {/* Center hub */}
      <div
        className="w-28 h-28 rounded-full flex flex-col items-center justify-center text-white shadow-2xl border-4 border-white ring-2 ring-[#2563EB]/30 z-10"
        style={{ background: "linear-gradient(135deg, #0F2041 0%, #1D3461 60%, #2563EB 100%)" }}
      >
        <Building2 className="h-6 w-6 mb-1 opacity-90" />
        <span className="text-[10px] font-black uppercase tracking-wider">PACT Org</span>
        <span className="text-[9px] font-semibold opacity-80 mt-0.5">{allFlat.length} depts</span>
        <span className="text-[8px] opacity-60">{totalMembers} staff</span>
      </div>

      {/* Vertical stem from hub to L1 row */}
      {tree.length > 0 && <div className="w-0.5 h-8 bg-[#1D3461]/30" />}

      {/* Top-level departments */}
      {tree.length > 0 && (
        <div className="relative flex gap-6 flex-wrap justify-center px-6">
          {/* Horizontal crossbar */}
          {tree.length > 1 && (
            <div
              className="absolute top-0 left-1/4 right-1/4 h-0.5"
              style={{ background: "#1D346130" }}
            />
          )}
          {tree.map(dept => (
            <div key={dept.id} className="flex flex-col items-center">
              {/* Short vertical drop from crossbar to card */}
              <div className="w-0.5 h-5 bg-[#1D3461]/30" />
              <HubDeptCard dept={dept} allProfiles={allProfiles} navigate={navigate} depth={0} />
            </div>
          ))}
        </div>
      )}

      {/* Summary bar */}
      <div className="mt-8 flex flex-wrap gap-3 justify-center text-[10px] text-muted-foreground border-t pt-4 w-full max-w-2xl">
        {LEVEL_PALETTE.slice(0, Math.min(3, Math.max(1, tree.length > 0 ? 2 : 1))).map((p, i) => (
          <span key={i} className="flex items-center gap-1 font-semibold px-2.5 py-1 rounded-full" style={{ background: p.light, color: p.solid }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.solid }} />
            {p.label}
          </span>
        ))}
        <span className="flex items-center gap-1 ml-auto">
          <Users className="h-3 w-3" />
          {allFlat.length} dept{allFlat.length !== 1 ? "s" : ""} · {totalMembers} staff
        </span>
      </div>
    </div>
  );
}

/* ─── 4. Flat Org Chart ──────────────────────────── */
function FlatOrgChart({ departments, allProfiles, navigate }: CommonOrgProps) {
  const flat = flattenTree(buildTree(departments));
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">All {flat.length} departments shown at equal weight — no hierarchy applied.</p>
      <div className="flex flex-wrap gap-2">
        {flat.map(dept => {
          const members = allProfiles.filter(p => p.department_id === dept.id);
          const hasChildren = (dept.children?.length ?? 0) > 0;
          return (
            <button
              key={dept.id}
              onClick={() => navigate("/departments")}
              className="flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm hover:shadow-md transition-all shadow-sm"
              style={{ borderColor: (dept.color ?? "#1D3461") + "50", background: (dept.color ?? "#1D3461") + "08" }}
            >
              <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: dept.color ?? "#1D3461" }}>
                <Building2 className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold leading-none" style={{ color: dept.color ?? "#1D3461" }}>{dept.name}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {members.length} member{members.length !== 1 ? "s" : ""}{hasChildren ? ` · ${dept.children!.length} sub-dept${dept.children!.length > 1 ? "s" : ""}` : ""}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 5. Team-Based Org Chart ────────────────────── */
function TeamBasedOrgChart({ departments, allProfiles, navigate }: CommonOrgProps) {
  const flat = flattenTree(buildTree(departments));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {flat.map(dept => {
        const members = allProfiles.filter(p => p.department_id === dept.id);
        const accent = dept.color ?? "#1D3461";
        return (
          <div key={dept.id} className="rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-all">
            <div className="px-3.5 py-2.5 flex items-center justify-between gap-2" style={{ background: accent }}>
              <div className="flex items-center gap-2 min-w-0">
                <Users className="h-4 w-4 text-white/80 shrink-0" />
                <p className="text-sm font-bold text-white truncate">{dept.name}</p>
              </div>
              <span className="text-[10px] font-bold text-white/70 shrink-0">{members.length} members</span>
            </div>
            <div className="p-2.5 space-y-1 max-h-40 overflow-y-auto">
              {members.length === 0 ? (
                <p className="text-[10px] text-muted-foreground py-2 text-center">No members</p>
              ) : members.map(m => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/users/${m.id}`)}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                    style={{ background: accent }}
                  >
                    {(m.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold truncate">{m.full_name || m.email}</p>
                    <p className="text-[9px] text-muted-foreground capitalize">{m.role?.replace(/_/g, " ") || "—"}</p>
                  </div>
                </div>
              ))}
            </div>
            {dept.manager && (
              <div className="px-3 py-1.5 border-t bg-muted/20 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <UserCheck className="h-3 w-3" style={{ color: accent }} />
                <span className="font-semibold text-foreground">{dept.manager.full_name || dept.manager.email}</span> (Manager)
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── 6. Photo Org Chart ─────────────────────────── */
function PhotoOrgChart({ allProfiles, navigate }: CommonOrgProps) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? allProfiles.filter(p => (p.full_name || "").toLowerCase().includes(search.toLowerCase()) || (p.email || "").toLowerCase().includes(search.toLowerCase()) || (p.role || "").toLowerCase().includes(search.toLowerCase()))
    : allProfiles;
  const ROLE_COLORS: Record<string, string> = {
    super_admin: "#0F2041", admin: "#1D3461", field_coordinator: "#2563EB",
    data_collector: "#059669", hub_manager: "#7C3AED", finance: "#D97706",
  };
  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search people…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filtered.map(p => {
          const initials = (p.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
          const accent = ROLE_COLORS[p.role || ""] ?? "#1D3461";
          return (
            <div
              key={p.id}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border hover:shadow-md transition-all cursor-pointer text-center"
              style={{ borderColor: accent + "30" }}
              onClick={() => navigate(`/users/${p.id}`)}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-black shadow-md"
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}
              >
                {initials}
              </div>
              <p className="text-[11px] font-bold leading-tight">{p.full_name || p.email}</p>
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded-full capitalize"
                style={{ background: accent + "18", color: accent }}
              >
                {(p.role || "unknown").replace(/_/g, " ")}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} of {allProfiles.length} people</p>
    </div>
  );
}

/* ─── 7. Color-Coded Org Chart ───────────────────── */
function ColorCodedOrgChart({ departments, allProfiles, navigate }: CommonOrgProps) {
  const flat = flattenTree(buildTree(departments));
  const maxMembers = Math.max(1, ...flat.map(d => allProfiles.filter(p => p.department_id === d.id).length));
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Bar width reflects team size relative to the largest team.</p>
      <div className="space-y-1.5">
        {flat.map(dept => {
          const members = allProfiles.filter(p => p.department_id === dept.id);
          const pct = Math.max(6, Math.round((members.length / maxMembers) * 100));
          const accent = dept.color ?? "#1D3461";
          return (
            <div
              key={dept.id}
              className="flex items-center gap-3 group cursor-pointer"
              onClick={() => navigate("/departments")}
            >
              <div className="w-36 shrink-0 text-right">
                <p className="text-[11px] font-bold truncate" style={{ color: accent }}>{dept.name}</p>
                <p className="text-[9px] text-muted-foreground">{members.length} members</p>
              </div>
              <div className="flex-1 h-8 rounded-full bg-muted/30 overflow-hidden shadow-inner">
                <div
                  className="h-full rounded-full flex items-center px-2.5 transition-all duration-500 group-hover:brightness-110"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}, ${accent}bb)` }}
                >
                  {pct > 20 && <span className="text-[9px] font-bold text-white truncate">{members.length > 0 ? members.slice(0, 3).map(m => (m.full_name || "?").split(" ")[0]).join(", ") : ""}</span>}
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 8. Matrix Org Chart ────────────────────────── */
function MatrixOrgChart({ departments, allProfiles, navigate }: CommonOrgProps) {
  const flat = flattenTree(buildTree(departments));
  const roleSet = Array.from(new Set(allProfiles.map(p => (p.role || "unknown").replace(/_/g, " ")))).sort();
  const topRoles = roleSet.slice(0, 8);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs min-w-[600px]">
        <thead>
          <tr className="bg-muted/40">
            <th className="text-left py-2 px-3 font-bold rounded-tl-lg w-36 border-r border-border">Department</th>
            {topRoles.map(role => (
              <th key={role} className="py-2 px-2 font-semibold capitalize text-center border-r border-border last:border-r-0 last:rounded-tr-lg">
                {role}
              </th>
            ))}
            <th className="py-2 px-3 font-bold text-center rounded-tr-lg">Total</th>
          </tr>
        </thead>
        <tbody>
          {flat.map((dept, rowIdx) => {
            const members = allProfiles.filter(p => p.department_id === dept.id);
            const accent = dept.color ?? "#1D3461";
            return (
              <tr
                key={dept.id}
                className="border-t border-border hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => navigate("/departments")}
              >
                <td className="py-2.5 px-3 border-r border-border">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
                    <span className="font-semibold truncate max-w-[110px]" style={{ color: accent }}>{dept.name}</span>
                  </div>
                </td>
                {topRoles.map(role => {
                  const count = members.filter(m => (m.role || "unknown").replace(/_/g, " ") === role).length;
                  return (
                    <td key={role} className="py-2.5 px-2 text-center border-r border-border last:border-r-0">
                      {count > 0 ? (
                        <span
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-[11px] font-bold"
                          style={{ background: accent }}
                        >{count}</span>
                      ) : (
                        <span className="text-muted-foreground/30">·</span>
                      )}
                    </td>
                  );
                })}
                <td className="py-2.5 px-3 text-center font-bold" style={{ color: accent }}>{members.length}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/20">
            <td className="py-2 px-3 font-bold text-xs rounded-bl-lg">Totals</td>
            {topRoles.map(role => {
              const total = allProfiles.filter(p => (p.role || "unknown").replace(/_/g, " ") === role).length;
              return <td key={role} className="py-2 px-2 text-center font-bold">{total || "—"}</td>;
            })}
            <td className="py-2 px-3 text-center font-black text-[#1D3461] rounded-br-lg">{allProfiles.length}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ─── 9. Functional Org Chart ────────────────────── */
function FunctionalOrgChart({ allProfiles, navigate }: CommonOrgProps) {
  const roleGroups: Record<string, Profile[]> = {};
  allProfiles.forEach(p => {
    const r = (p.role || "unknown").replace(/_/g, " ");
    if (!roleGroups[r]) roleGroups[r] = [];
    roleGroups[r].push(p);
  });
  const ROLE_COLORS: Record<string, string> = {
    "super admin": "#0F2041", "admin": "#1D3461", "field coordinator": "#2563EB",
    "data collector": "#059669", "hub manager": "#7C3AED", "finance": "#D97706",
  };
  const getColor = (role: string) => ROLE_COLORS[role] ?? "#64748b";
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {Object.entries(roleGroups).sort((a, b) => b[1].length - a[1].length).map(([role, people]) => {
          const accent = getColor(role);
          return (
            <div key={role} className="rounded-xl border overflow-hidden shadow-sm w-44 flex-shrink-0">
              <div className="px-3 py-2.5" style={{ background: accent }}>
                <p className="text-xs font-bold text-white capitalize">{role}</p>
                <p className="text-[9px] text-white/70">{people.length} people</p>
              </div>
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {people.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => navigate(`/users/${p.id}`)}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                      style={{ background: accent }}
                    >
                      {(p.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <p className="text-[10px] font-medium truncate">{p.full_name || p.email}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 10. Divisional Org Chart ───────────────────── */
function DivisionalOrgChart({ departments, allProfiles, navigate }: CommonOrgProps) {
  const tree = buildTree(departments);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {tree.map(div => {
        const allDivMembers = allProfiles.filter(p => {
          const allIds = flattenTree([div]).map(d => d.id);
          return allIds.includes(p.department_id ?? "");
        });
        const accent = div.color ?? "#1D3461";
        return (
          <div key={div.id} className="rounded-2xl border-2 overflow-hidden shadow-sm hover:shadow-md transition-all" style={{ borderColor: accent + "60" }}>
            {/* Division header */}
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">{div.name}</p>
                  <p className="text-[10px] text-white/70">{allDivMembers.length} total members</p>
                </div>
              </div>
              {div.manager && (
                <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-2 py-1">
                  <UserCheck className="h-3 w-3 text-white/80" />
                  <p className="text-[10px] text-white/90 font-semibold truncate max-w-[90px]">{div.manager.full_name || div.manager.email}</p>
                </div>
              )}
            </div>
            {/* Sub-departments */}
            {(div.children ?? []).length > 0 && (
              <div className="p-3 flex flex-wrap gap-2 bg-muted/10">
                {(div.children ?? []).map(sub => {
                  const subMembers = allProfiles.filter(p => p.department_id === sub.id);
                  const subAccent = sub.color ?? levelPalette(1).solid;
                  return (
                    <div
                      key={sub.id}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer hover:shadow-sm transition-all"
                      style={{ borderColor: subAccent + "50", background: subAccent + "0f" }}
                      onClick={() => navigate("/departments")}
                    >
                      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ background: subAccent }}>
                        <Building2 className="h-2.5 w-2.5 text-white" />
                      </div>
                      <span className="text-[11px] font-semibold" style={{ color: subAccent }}>{sub.name}</span>
                      <span className="text-[9px] text-muted-foreground">({subMembers.length})</span>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Quick member avatars */}
            {allDivMembers.length > 0 && (
              <div className="px-3 pb-3 flex items-center gap-1 flex-wrap">
                {allDivMembers.slice(0, 8).map(m => (
                  <div
                    key={m.id}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold cursor-pointer hover:ring-2 transition-all"
                    style={{ background: accent, ringColor: accent }}
                    title={m.full_name || m.email || ""}
                    onClick={() => navigate(`/users/${m.id}`)}
                  >
                    {(m.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                ))}
                {allDivMembers.length > 8 && (
                  <span className="text-[10px] text-muted-foreground font-medium ml-1">+{allDivMembers.length - 8} more</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Org Chart Tab ──────────────────────────────── */
type OrgMode = "dept" | "cards" | "compact" | "table" | "reporting" |
  "classic" | "horizontal" | "circular" | "flat" | "team" |
  "photo" | "colorcode" | "matrix" | "functional" | "divisional";

function OrgChartTab({ profiles, departments }: { profiles: Profile[]; departments: Department[] }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<OrgMode>("dept");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [orgSearch, setOrgSearch] = useState("");
  const [forceExpand, setForceExpand] = useState<boolean | null>(null);

  const tree = buildTree(departments);
  const flat = flattenTree(tree);

  // Department tree: filter to a branch if selected
  const branchTree = deptFilter === "all"
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

  // Search filter: prune tree to nodes matching name or having matching descendants
  function filterOrgTree(nodes: Department[], q: string): Department[] {
    return nodes.reduce<Department[]>((acc, n) => {
      const filteredChildren = filterOrgTree(n.children ?? [], q);
      if (n.name.toLowerCase().includes(q) || filteredChildren.length > 0) {
        acc.push({ ...n, children: filteredChildren });
      }
      return acc;
    }, []);
  }
  const q = orgSearch.trim().toLowerCase();
  const treeToShow = q ? filterOrgTree(branchTree, q) : branchTree;

  // Reporting chain filter
  const filteredProfiles = deptFilter === "all" ? profiles : profiles.filter(p => p.department_id === deptFilter);
  const filteredIds = new Set(filteredProfiles.map(p => p.id));
  const roots = filteredProfiles.filter(p => !p.reports_to || !filteredIds.has(p.reports_to));

  // Auto-infer reporting chain from department structure when reports_to not configured
  const hasExplicitReporting = filteredProfiles.some(p => p.reports_to && filteredIds.has(p.reports_to));

  // Build dept manager + parent maps from flat dept list
  const deptManagerMap: Record<string, string> = {};
  const deptParentMap: Record<string, string | null> = {};
  flat.forEach(d => {
    if (d.manager_user_id) deptManagerMap[d.id] = d.manager_user_id;
    deptParentMap[d.id] = d.parent_department_id ?? null;
  });

  function findAncestorManager(deptId: string | null, selfId: string): string | null {
    if (!deptId) return null;
    const mgr = deptManagerMap[deptId];
    if (mgr && mgr !== selfId) return mgr;
    return findAncestorManager(deptParentMap[deptId] ?? null, selfId);
  }

  // Build effective profiles: use explicit reports_to if available, else infer from dept
  const effectiveProfiles: Profile[] = filteredProfiles.map(p => {
    if (hasExplicitReporting) {
      return { ...p, reports_to: (p.reports_to && filteredIds.has(p.reports_to)) ? p.reports_to : null };
    }
    const inferred = p.department_id ? findAncestorManager(p.department_id, p.id) : null;
    return { ...p, reports_to: inferred };
  });
  const effectiveRoots = effectiveProfiles.filter(p => !p.reports_to || !new Set(effectiveProfiles.map(x => x.id)).has(p.reports_to));

  const totalDepts = departments.length;
  const topLevel = tree.length;

  const VIEW_MODES: { id: OrgMode; label: string; icon: string; showFilter: boolean; group: string }[] = [
    // Existing
    { id: "dept",       label: "Tree (Top-Down)",         icon: "🌳", showFilter: true,  group: "Classic" },
    { id: "cards",      label: "Cards Grid",              icon: "🃏", showFilter: false, group: "Classic" },
    { id: "compact",    label: "Compact",                 icon: "📋", showFilter: true,  group: "Classic" },
    { id: "table",      label: "Table",                   icon: "📊", showFilter: false, group: "Classic" },
    { id: "reporting",  label: "Reporting Chain",         icon: "🔗", showFilter: true,  group: "Classic" },
    // New
    { id: "classic",    label: "Classic Hierarchical",    icon: "🏛️", showFilter: false, group: "Hierarchy" },
    { id: "horizontal", label: "Horizontal",              icon: "↔️", showFilter: false, group: "Hierarchy" },
    { id: "circular",   label: "Circular",                icon: "⭕", showFilter: false, group: "Hierarchy" },
    { id: "divisional", label: "Divisional",              icon: "🏢", showFilter: false, group: "Hierarchy" },
    { id: "flat",       label: "Flat",                    icon: "▬",  showFilter: false, group: "Layout" },
    { id: "team",       label: "Team-Based",              icon: "👥", showFilter: false, group: "Layout" },
    { id: "functional", label: "Functional",              icon: "⚙️", showFilter: false, group: "Layout" },
    { id: "photo",      label: "Photo",                   icon: "🖼️", showFilter: false, group: "People" },
    { id: "colorcode",  label: "Color-Coded",             icon: "🎨", showFilter: false, group: "People" },
    { id: "matrix",     label: "Matrix",                  icon: "🔢", showFilter: false, group: "People" },
  ];

  const currentMode = VIEW_MODES.find(m => m.id === mode)!;

  const isTreeMode = mode === "dept" || mode === "compact";
  const showExpandControls = isTreeMode;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* View selector */}
        <Select value={mode} onValueChange={v => { setMode(v as OrgMode); setForceExpand(null); }}>
          <SelectTrigger className="w-52 h-9 font-medium text-sm" data-testid="select-org-view">
            <span className="flex items-center gap-1.5">
              <span className="text-base leading-none">{currentMode.icon}</span>
              <span className="truncate">{currentMode.label}</span>
            </span>
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {["Classic", "Hierarchy", "Layout", "People"].map(group => (
              <div key={group}>
                <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{group}</div>
                {VIEW_MODES.filter(m => m.group === group).map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>

        {/* Dept filter — only for modes that support it */}
        {currentMode.showFilter && (
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-44 h-9 text-sm" data-testid="select-orgchart-dept">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {/* Search input */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={orgSearch}
            onChange={e => setOrgSearch(e.target.value)}
            placeholder="Search departments…"
            className="h-9 pl-8 text-sm"
            data-testid="input-org-search"
          />
        </div>

        {/* Expand / Collapse all — tree modes only */}
        {showExpandControls && (
          <div className="flex gap-1">
            <Button
              variant="outline" size="sm" className="h-9 text-xs gap-1.5"
              onClick={() => setForceExpand(true)}
              data-testid="button-expand-all"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" /> Expand All
            </Button>
            <Button
              variant="outline" size="sm" className="h-9 text-xs gap-1.5"
              onClick={() => setForceExpand(false)}
              data-testid="button-collapse-all"
            >
              <ChevronDown className="h-3.5 w-3.5" /> Collapse
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground ml-auto shrink-0">
          {mode === "reporting"
            ? `${filteredProfiles.length} people · ${effectiveRoots.length} top-level`
            : mode === "photo" || mode === "functional"
            ? `${allProfiles.length} people`
            : q
            ? `${flattenTree(treeToShow).length} of ${totalDepts} dept${totalDepts !== 1 ? "s" : ""}`
            : `${totalDepts} dept${totalDepts !== 1 ? "s" : ""} · ${topLevel} top-level`}
        </p>
      </div>

      {/* Level colour legend — for tree/compact modes */}
      {(mode === "dept" || mode === "compact") && departments.length > 0 && (
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

      {/* Search result hint */}
      {q && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
          <Search className="h-3.5 w-3.5 shrink-0" />
          Showing results for "<strong>{orgSearch}</strong>" — {flattenTree(treeToShow).length} department{flattenTree(treeToShow).length !== 1 ? "s" : ""} found
        </div>
      )}

      {/* ── Content ── */}

      {/* Cards Grid */}
      {mode === "cards" && (
        departments.length === 0 ? (
          <EmptyOrgState icon={<LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" />
        ) : (
          <OrgCardsGrid departments={departments} allProfiles={profiles} navigate={navigate} />
        )
      )}

      {/* Compact Tree */}
      {mode === "compact" && (
        departments.length === 0 ? (
          <EmptyOrgState icon={<AlignLeft className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" />
        ) : (
          <div className="bg-muted/10 rounded-xl border p-4 overflow-x-auto">
            {treeToShow.map(dept => (
              <CompactOrgNode key={dept.id} dept={dept} allProfiles={profiles} depth={0} navigate={navigate} />
            ))}
          </div>
        )
      )}

      {/* Table */}
      {mode === "table" && (
        departments.length === 0 ? (
          <EmptyOrgState icon={<Table2 className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" />
        ) : (
          <OrgTableView departments={flat} allProfiles={profiles} navigate={navigate} />
        )
      )}

      {/* Department Tree */}
      {mode === "dept" && (
        treeToShow.length === 0 ? (
          q ? (
            <EmptyOrgState icon={<Search className="h-10 w-10 mx-auto mb-3 opacity-30" />} message={`No departments match "${orgSearch}"`} sub="Try a different search term." />
          ) : (
            <EmptyOrgState icon={<Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" sub='Create departments using the "Departments" tab, then come back here.' />
          )
        ) : (
          <div className="bg-muted/10 rounded-xl border p-4 overflow-x-auto">
            {treeToShow.map(dept => (
              <DeptOrgNode key={dept.id} dept={dept} allProfiles={profiles} depth={0} navigate={navigate} forceExpand={forceExpand} />
            ))}
          </div>
        )
      )}

      {/* Reporting Chain */}
      {mode === "reporting" && (
        <div className="space-y-3">
          {/* Source banner */}
          <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs ${hasExplicitReporting ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300" : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"}`}>
            <span className="text-base leading-none mt-0.5">{hasExplicitReporting ? "✅" : "🔶"}</span>
            <div>
              {hasExplicitReporting ? (
                <><strong>Explicit reporting chain</strong> — hierarchy sourced from the "Reports To" field set on each employee's profile.</>
              ) : (
                <><strong>Auto-inferred from department structure</strong> — each person is shown under their department manager.{" "}
                To use individual reporting lines, set <strong>"Reports To"</strong> in each employee's profile (User Detail → Employment Record tab).</>
              )}
            </div>
          </div>

          {effectiveRoots.length === 0 ? (
            <EmptyOrgState icon={<Network className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No reporting relationships found" sub="No department managers are configured. Set a manager on each department to build an auto-inferred chain." />
          ) : (
            <div className="bg-muted/10 rounded-xl border p-4">
              {effectiveRoots.map(r => (
                <OrgNode key={r.id} profile={r} allProfiles={effectiveProfiles} depth={0} navigate={navigate} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 10 New Views ── */}
      {mode === "classic" && (
        departments.length === 0
          ? <EmptyOrgState icon={<Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" />
          : <ClassicOrgChart departments={departments} allProfiles={profiles} navigate={navigate} />
      )}

      {mode === "horizontal" && (
        departments.length === 0
          ? <EmptyOrgState icon={<Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" />
          : <HorizontalOrgChart departments={departments} allProfiles={profiles} navigate={navigate} />
      )}

      {mode === "circular" && (
        departments.length === 0
          ? <EmptyOrgState icon={<Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" />
          : <CircularOrgChart departments={departments} allProfiles={profiles} navigate={navigate} />
      )}

      {mode === "divisional" && (
        departments.length === 0
          ? <EmptyOrgState icon={<Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" />
          : <DivisionalOrgChart departments={departments} allProfiles={profiles} navigate={navigate} />
      )}

      {mode === "flat" && (
        departments.length === 0
          ? <EmptyOrgState icon={<LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" />
          : <FlatOrgChart departments={departments} allProfiles={profiles} navigate={navigate} />
      )}

      {mode === "team" && (
        departments.length === 0
          ? <EmptyOrgState icon={<Users className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" />
          : <TeamBasedOrgChart departments={departments} allProfiles={profiles} navigate={navigate} />
      )}

      {mode === "functional" && (
        profiles.length === 0
          ? <EmptyOrgState icon={<Users className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No staff profiles found" />
          : <FunctionalOrgChart departments={departments} allProfiles={profiles} navigate={navigate} />
      )}

      {mode === "photo" && (
        profiles.length === 0
          ? <EmptyOrgState icon={<Users className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No staff profiles found" />
          : <PhotoOrgChart departments={departments} allProfiles={profiles} navigate={navigate} />
      )}

      {mode === "colorcode" && (
        departments.length === 0
          ? <EmptyOrgState icon={<Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" />
          : <ColorCodedOrgChart departments={departments} allProfiles={profiles} navigate={navigate} />
      )}

      {mode === "matrix" && (
        departments.length === 0
          ? <EmptyOrgState icon={<Table2 className="h-10 w-10 mx-auto mb-3 opacity-30" />} message="No departments yet" />
          : <MatrixOrgChart departments={departments} allProfiles={profiles} navigate={navigate} />
      )}
    </div>
  );
}

function EmptyOrgState({ icon, message, sub }: { icon: ReactNode; message: string; sub?: string }) {
  return (
    <div className="text-center py-16 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
      {icon}
      <p className="font-medium">{message}</p>
      {sub && <p className="text-xs mt-1">{sub}</p>}
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
  const accentColor = dept.color ?? "#1D3461";

  // Parent dept name for non-root depts
  const parentDept = dept.parent_department_id
    ? allDepts.find(d => d.id === dept.parent_department_id)
    : null;

  // Role breakdown: top 3 roles in this dept
  const roleCounts: Record<string, number> = {};
  members.forEach(m => {
    const r = (m.role || "unknown").replace(/_/g, " ");
    roleCounts[r] = (roleCounts[r] || 0) + 1;
  });
  const topRoles = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Top member avatars (max 4)
  const avatarMembers = members.slice(0, 4);

  return (
    <div className={`${depth > 0 ? "ml-6 border-l-2 pl-4" : ""}`} style={depth > 0 ? { borderColor: accentColor + "40" } : undefined}>
      <div
        className="mb-3 rounded-xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden"
        style={{ borderColor: accentColor + "30" }}
      >
        {/* Color accent top bar */}
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}99)` }} />

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {/* Icon swatch */}
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: accentColor + "18" }}>
                <Building2 className="h-5 w-5" style={{ color: accentColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base truncate">{dept.name}</h3>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: accentColor + "15", color: accentColor }}
                  >
                    {depth === 0 ? "Top Level" : `Level ${depth + 1}`}
                  </span>
                  <span
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: accentColor + "12", color: accentColor }}
                  >
                    <Users className="h-2.5 w-2.5" />
                    {members.length} {members.length === 1 ? "member" : "members"}
                  </span>
                  {hasChildren && (
                    <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      <GitBranch className="h-2.5 w-2.5" />
                      {dept.children!.length} sub-dept{dept.children!.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Parent breadcrumb */}
                {parentDept && (
                  <div className="flex items-center gap-1 mt-1">
                    <Building2 className="h-3 w-3 text-muted-foreground/60" />
                    <span className="text-[10px] text-muted-foreground">Under: <span className="font-medium text-foreground/70">{parentDept.name}</span></span>
                  </div>
                )}

                {dept.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{dept.description}</p>
                )}

                {/* Manager row */}
                <div className="flex items-center gap-1 mt-1.5">
                  <UserCheck className="h-3.5 w-3.5 shrink-0" style={{ color: dept.manager ? accentColor : undefined }} />
                  {dept.manager ? (
                    <span className="text-xs text-muted-foreground">
                      Manager: <span className="font-semibold text-foreground">{dept.manager.full_name || dept.manager.email}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-amber-600 font-medium">No manager assigned</span>
                  )}
                </div>

                {/* Member avatar row + role pills */}
                {members.length > 0 && (
                  <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                    {/* Stacked avatars */}
                    <div className="flex items-center">
                      {avatarMembers.map((m, i) => (
                        <div
                          key={m.id}
                          className="w-6 h-6 rounded-full border-2 border-background flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                          style={{ background: accentColor, marginLeft: i > 0 ? "-6px" : "0", zIndex: avatarMembers.length - i }}
                          title={m.full_name || m.email || ""}
                        >
                          {(m.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                      ))}
                      {members.length > 4 && (
                        <div
                          className="w-6 h-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground shrink-0"
                          style={{ marginLeft: "-6px" }}
                        >
                          +{members.length - 4}
                        </div>
                      )}
                    </div>

                    {/* Top role pills */}
                    <div className="flex flex-wrap gap-1">
                      {topRoles.map(([role, count]) => (
                        <span
                          key={role}
                          className="text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize"
                          style={{ background: accentColor + "12", color: accentColor }}
                        >
                          {role} ({count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {hasChildren && (
                <button
                  className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-muted/60"
                  onClick={() => setExpanded(e => !e)}
                  data-testid={`button-expand-dept-${dept.id}`}
                >
                  {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>
              )}
              <button
                className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-muted/60"
                onClick={() => setShowMembers(m => !m)}
                title="Show members"
                data-testid={`button-members-dept-${dept.id}`}
              >
                <Users className="h-4 w-4 text-muted-foreground" />
              </button>
              {canManage && (
                <>
                  <button
                    className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-muted/60"
                    onClick={() => onEdit(dept)}
                    data-testid={`button-edit-dept-${dept.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50 text-destructive"
                    onClick={() => onDelete(dept)}
                    data-testid={`button-delete-dept-${dept.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {showMembers && (
            <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: accentColor + "20" }}>
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No members assigned</p>
              ) : (
                members.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                        style={{ background: accentColor }}
                      >
                        {(m.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{m.full_name || m.email || "Unknown"}</p>
                        <div className="flex items-center gap-1">
                          <p className="text-[10px] text-muted-foreground capitalize">{m.role?.replace(/_/g, " ") || "—"}</p>
                          {m.classification_level && (
                            <span className="text-[9px] px-1.5 py-0 rounded-full border" style={{ color: accentColor, borderColor: accentColor + "40" }}>
                              {m.classification_level}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-muted/60" onClick={() => navigate(`/users/${m.id}`)} data-testid={`button-view-user-${m.id}`}>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      {canMoveEmployees && (
                        <button className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-muted/60" onClick={() => onMoveEmployee(m)} data-testid={`button-move-user-${m.id}`}>
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

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
  const canMoveEmployees = canManage;

  // Only Super Admin may access this page
  const canAccess = canManage;

  const qc = useQueryClient();
  const DEPT_KEY = ["departments-page-data"] as const;

  const { data: pageData, isLoading: loading } = useQuery({
    queryKey: DEPT_KEY,
    enabled: !!canAccess,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [{ data: depts }, { data: profs }, { data: classData }] = await Promise.all([
        supabase
          .from("departments")
          .select("*, manager:profiles!departments_manager_user_id_fkey(full_name,email)")
          .order("name"),
        supabase
          .from("profiles")
          .select("id, full_name, email, role, department_id, reports_to, avatar_url")
          .order("full_name"),
        supabase
          .from("user_classifications")
          .select("user_id, classification_level")
          .is("effective_until", null),
      ]);
      const classMap: Record<string, string> = {};
      (classData ?? []).forEach((c) => { if (c.user_id && c.classification_level) classMap[c.user_id] = c.classification_level; });
      const memberCount: Record<string, number> = {};
      (profs ?? []).forEach(p => {
        if (p.department_id) memberCount[p.department_id] = (memberCount[p.department_id] || 0) + 1;
      });
      const departments = ((depts ?? []).map(d => ({ ...d, member_count: memberCount[(d as any).id] || 0 }))) as Department[];
      const profiles = (profs ?? []).map(p => ({ ...p, classification_level: classMap[p.id] || null })) as Profile[];
      return { departments, profiles };
    },
  });

  const departments = useMemo(() => pageData?.departments ?? [], [pageData]);
  const profiles    = useMemo(() => pageData?.profiles    ?? [], [pageData]);

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [moveTarget, setMoveTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      qc.invalidateQueries({ queryKey: DEPT_KEY });
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
        className="relative px-4 sm:px-8 pt-6 pb-8"
        style={{ background: "linear-gradient(135deg, #0F2041 0%, #1D3461 55%, #2563EB 100%)" }}
      >
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 pointer-events-none" style={{ background: "#fff", transform: "translate(30%, -40%)" }} />
        <div className="absolute bottom-0 left-16 w-40 h-40 rounded-full opacity-5 pointer-events-none" style={{ background: "#fff", transform: "translateY(50%)" }} />

        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-white/70 hover:text-white hover:bg-white/10" onClick={() => navigate(-1)} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="p-2 rounded-xl bg-white/10">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Departments</h1>
              <p className="text-xs text-blue-200 mt-0.5">Organisation structure, teams & reporting</p>
            </div>
          </div>
          {canManage && (
            <Button
              onClick={() => { setEditTarget(null); setFormOpen(true); }}
              className="bg-white/10 border border-white/30 text-white hover:bg-white/20 font-semibold"
              data-testid="button-new-dept"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Department
            </Button>
          )}
        </div>

        {/* Quick stat pills in header */}
        <div className="relative flex flex-wrap gap-3 mt-5">
          {[
            { label: "Departments", value: departments.length, cls: "bg-white/10 border border-white/20" },
            { label: "Total Staff", value: profiles.length, cls: "bg-white/10 border border-white/20" },
            { label: "Unassigned", value: unassignedCount, cls: unassignedCount > 0 ? "bg-amber-500/30 border border-amber-300/40" : "bg-white/10 border border-white/20" },
            { label: "Sub-depts", value: departments.filter(d => d.parent_department_id).length, cls: "bg-white/10 border border-white/20" },
          ].map(s => (
            <div key={s.label} className={`${s.cls} rounded-xl px-4 py-2 text-white`}>
              <p className="text-xl font-extrabold leading-none">{s.value}</p>
              <p className="text-[10px] text-blue-200/80 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-6 flex flex-col gap-6">
      {/* Quick Navigation */}
      <ConnectedPagesBar exclude="departments" />

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-auto p-1 bg-[#0F2041]/8 border border-[#1D3461]/20 rounded-xl mb-4 flex-wrap">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 py-2 px-4 rounded-lg text-sm font-medium data-[state=active]:bg-[#1D3461] data-[state=active]:text-white data-[state=active]:shadow-sm" data-testid="tab-overview">
            <BarChart3 className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-1.5 py-2 px-4 rounded-lg text-sm font-medium data-[state=active]:bg-[#1D3461] data-[state=active]:text-white data-[state=active]:shadow-sm" data-testid="tab-departments">
            <Building2 className="h-4 w-4" /> Departments
          </TabsTrigger>
          <TabsTrigger value="orgchart" className="flex items-center gap-1.5 py-2 px-4 rounded-lg text-sm font-medium data-[state=active]:bg-[#1D3461] data-[state=active]:text-white data-[state=active]:shadow-sm" data-testid="tab-orgchart">
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
          onSaved={() => qc.invalidateQueries({ queryKey: DEPT_KEY })}
        />
      )}

      {canMoveEmployees && moveTarget && (
        <MoveEmployeeDialog
          open={!!moveTarget}
          onClose={() => setMoveTarget(null)}
          employee={moveTarget}
          departments={departments}
          onMoved={() => qc.invalidateQueries({ queryKey: DEPT_KEY })}
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
