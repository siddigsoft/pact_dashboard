import { useState, useMemo, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  Shield,
  ChevronDown,
  ChevronRight,
  Loader2,
  Key,
  Columns,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  MinusCircle,
  X,
  Users,
  Wallet,
  RotateCcw,
  Mail,
  ArrowLeftRight,
  RefreshCcw,
  Pencil,
  Trash2,
  Settings2,
  FileText,
  MapPin,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MODULE_REGISTRY,
  ModuleAction,
  ModuleDefinition,
  ModulePage,
} from "@/types/moduleRegistry";
import { ResourceType, ActionType } from "@/types/roles";
import { COLUMN_REGISTRY, columnStorageSlug } from "@/lib/column-registry";
import { useSelectedUserAccess } from "@/context/role-management/SelectedUserAccessContext";
import { TabProps, AccessEffect } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { useAppContext } from "@/context/AppContext";
import { useToast } from "@/hooks/use-toast";
import { toDisplayLabel } from "@/utils/roleMapping";

// ── Cost submission fine-grained actions (not in MODULE_REGISTRY — user-override only) ──
const CS_BUTTON_ACTIONS: {
  action: string;
  label: string;
  labelAr: string;
  description: string;
  defaultRoles: string;
  icon: any;
  color: string;
  group: "payment" | "moderation" | "data";
}[] = [
  {
    action: "mark_paid",
    label: "Mark Paid",
    labelAr: "تحديد كمدفوع",
    description: "Disburse funds — mark approved submissions as paid.",
    defaultRoles: "SuperAdmin, Admin, Finance Admin",
    icon: Wallet,
    color: "green",
  },
  {
    action: "revert_paid",
    label: "Revert Paid",
    labelAr: "إرجاع الدفعة",
    description: 'Undo a "Paid" mark, restore submission to Approved.',
    defaultRoles: "SuperAdmin, Admin",
    icon: RotateCcw,
    color: "orange",
  },
  {
    action: "send_to_finance",
    label: "Send to Finance",
    labelAr: "إرسال للمالية",
    description: "Email payment requests to finance staff.",
    defaultRoles: "SuperAdmin, Admin",
    icon: Mail,
    color: "blue",
  },
  {
    action: "reconcile",
    label: "Reconcile",
    labelAr: "مطابقة / تسوية",
    description: "Open the reconciliation panel on paid submissions.",
    defaultRoles: "Everyone (no gate currently)",
    icon: ArrowLeftRight,
    color: "purple",
  },
  {
    action: "recall",
    label: "Recall Submission",
    labelAr: "سحب الطلب",
    description: "Recall/pull-back a submission that is under review.",
    defaultRoles: "SuperAdmin, Admin",
    icon: RefreshCcw,
    color: "amber",
  },
  {
    action: "revert_tier",
    label: "Revert Tier Approval",
    labelAr: "إرجاع موافقة المرحلة",
    description: "Step back one approval tier (T1/T2/T3/T4) on any submission.",
    defaultRoles: "SuperAdmin, Admin",
    icon: RotateCcw,
    color: "amber",
  },
  {
    action: "edit",
    label: "Edit Any Submission",
    labelAr: "تعديل أي طلب",
    description: "Edit submissions at any status, not just own pending ones.",
    defaultRoles: "SuperAdmin (any), Admin (pending)",
    icon: Pencil,
    color: "sky",
  },
];

const CS_GROUP_LABELS = {
  payment: "Payment Actions",
  moderation: "Moderation",
  data: "Data Management",
};

const CS_COLOR_CLASSES: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  green: {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-600",
    border: "border-green-300",
  },
  orange: {
    bg: "bg-orange-100 dark:bg-orange-900/30",
    text: "text-orange-600",
    border: "border-orange-300",
  },
  blue: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-600",
    border: "border-blue-300",
  },
  purple: {
    bg: "bg-purple-100 dark:bg-purple-900/30",
    text: "text-purple-600",
    border: "border-purple-300",
  },
  amber: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-600",
    border: "border-amber-300",
  },
  sky: {
    bg: "bg-sky-100 dark:bg-sky-900/30",
    text: "text-sky-600",
    border: "border-sky-300",
  },
  red: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-600",
    border: "border-red-300",
  },
};

const ACTION_LABELS: Partial<Record<ActionType, string>> = {
  read: "View",
  create: "Create",
  update: "Edit",
  delete: "Delete",
  approve: "Approve",
  reject: "Reject",
  assign: "Assign",
  archive: "Archive",
  close: "Close",
  reverse: "Reverse",
  reconcile: "Reconcile",
  import: "Import",
  publish: "Publish",
  send: "Send",
  recall: "Recall",
  revert: "Revert",
  restore: "Restore",
  submit: "Submit",
  override: "Override",
  export: "Export",
};
const ACTION_ICONS: Partial<Record<ActionType, any>> = {
  read: Eye,
  create: CheckCircle2,
  update: Key,
  delete: XCircle,
  approve: CheckCircle2,
  reject: XCircle,
  assign: Users,
  archive: Settings2,
  close: X,
  reverse: RotateCcw,
  reconcile: ArrowLeftRight,
  import: ArrowLeftRight,
  publish: CheckCircle2,
  send: Mail,
  recall: RefreshCcw,
  revert: RotateCcw,
  restore: RotateCcw,
  submit: CheckCircle2,
  override: Settings2,
  export: Columns,
};

const MMP_REPORT_BUTTONS = [
  {
    action: "full_report" as const,
    label: "Full MMP Report",
    description:
      "View and download the complete MMP status report as PDF or Excel.",
    icon: FileText,
  },
  {
    action: "state_report" as const,
    label: "State MMP Report",
    description:
      "View and download the state-scoped MMP status report as PDF or Excel.",
    icon: MapPin,
  },
  {
    action: "hub_report" as const,
    label: "Hub / Coordinator MMP Report",
    description:
      "View and download the assigned-hub or coordinator-scoped MMP status report as PDF or Excel.",
    icon: Building2,
  },
];
const MMP_REPORT_ACTIONS = new Set(
  MMP_REPORT_BUTTONS.map(({ action }) => action),
);

function StatusIcon({ eff, small }: { eff: AccessEffect; small?: boolean }) {
  const sz = small ? "h-3 w-3" : "h-3.5 w-3.5";
  if (eff === "superadmin" || eff === "granted" || eff === "role-yes")
    return (
      <CheckCircle2
        className={cn(
          sz,
          eff === "granted"
            ? "text-emerald-500"
            : eff === "role-yes"
              ? "text-blue-400"
              : "text-red-400",
        )}
      />
    );
  if (eff === "blocked") return <XCircle className={cn(sz, "text-red-500")} />;
  return <MinusCircle className={cn(sz, "text-slate-300")} />;
}

// ── MMP report button access ─────────────────────────────────────────────────
// These are pinned in Buttons & Actions so each report scope can be overridden
// independently. They remain in the registry for search and Reports filtering.
function MmpReportButtonsSection() {
  const { savingKey, effectiveAction, explainAction, toggleAction } =
    useSelectedUserAccess();

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 py-3 bg-indigo-50/80 border-b border-indigo-100">
        <Columns className="h-4 w-4 text-indigo-600" />
        <span className="text-xs font-semibold tracking-wide text-indigo-900 flex-1">
          MMP Report Buttons
        </span>
        <Badge className="text-[10px] h-5 px-1.5 bg-white text-indigo-800 border-indigo-200 border">
          Scoped access
        </Badge>
      </div>
      <div className="divide-y">
        {MMP_REPORT_BUTTONS.map((perm) => {
          const eff = effectiveAction("mmp", perm.action);
          const trace = explainAction("mmp", perm.action);
          const saving = savingKey === `perm:mmp:${perm.action}`;
          const hasOverride = eff === "granted" || eff === "blocked";
          return (
            <div
              key={perm.action}
              className={cn(
                "flex flex-wrap items-center gap-3 px-3 py-2.5 border-b last:border-b-0",
                eff === "granted"
                  ? "bg-emerald-50/50 dark:bg-emerald-900/5"
                  : eff === "blocked"
                    ? "bg-red-50/50 dark:bg-red-900/5 opacity-80"
                    : eff === "role-yes"
                      ? "bg-blue-50/20"
                      : "opacity-75",
              )}
            >
              <StatusIcon eff={eff} small />
              <perm.icon className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1">
                <span className="text-xs font-medium">{perm.label}</span>
                <span className="basis-full text-[10px] leading-snug text-muted-foreground">
                  {perm.description}
                </span>
                <span
                  className="basis-full text-[10px] leading-snug text-muted-foreground/80"
                  title={trace.summary}
                >
                  {trace.source === "user_override"
                    ? "Override"
                    : trace.source === "super_admin"
                      ? "Super Admin"
                      : "Role default"}
                  : {trace.summary}
                </span>
              </div>
              {hasOverride && (
                <Badge
                  className={cn(
                    "text-[10px] h-5 px-1.5 border-0 shrink-0",
                    eff === "granted"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800",
                  )}
                >
                  {eff === "granted" ? "Granted" : "Blocked"}
                </Badge>
              )}
              <button
                disabled={saving}
                onClick={() => toggleAction("mmp", perm.action)}
                className={cn(
                  "min-w-[4.5rem] shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                  eff === "granted"
                    ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                    : eff === "blocked"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : eff === "role-yes"
                        ? "border-red-300 bg-white text-red-700 hover:bg-red-50"
                        : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50",
                )}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" />
                ) : eff === "granted" ? (
                  "Remove"
                ) : eff === "blocked" ? (
                  "Restore"
                ) : eff === "role-yes" ? (
                  "Block"
                ) : (
                  "Grant"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Active Grants panel (cross-user) ─────────────────────────────────────────
interface GrantedRow {
  id: string;
  user_id: string;
  resource: string;
  action: string;
}

function ActiveGrantsPanel() {
  const { users } = useAppContext();
  const { toast } = useToast();
  const [rows, setRows] = useState<GrantedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("user_permission_overrides")
        .select("id, user_id, resource, action")
        .eq("is_granted", true)
        .order("resource")
        .order("action");
      setRows((data || []) as GrantedRow[]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (row: GrantedRow) => {
    setRevoking(row.id);
    try {
      await supabase
        .from("user_permission_overrides")
        .delete()
        .eq("id", row.id);
      const { data: authData } = await supabase.auth.getUser();
      await supabase
        .from("permission_override_audit_log")
        .insert({
          user_id: row.user_id,
          resource: row.resource,
          action: row.action,
          old_granted: true,
          new_granted: null,
          changed_by: authData?.user?.id,
          reason: "Revoked via Access Manager",
          event_type: "deleted",
        })
        .select();
      const user = users.find((u) => u.id === row.user_id);
      toast({
        title: `Permission revoked from ${user?.name ?? "user"}`,
        description: `${row.resource} → ${row.action}`,
      });
      await load();
    } catch (e: any) {
      toast({
        title: "Failed to revoke",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setRevoking(null);
    }
  };

  // Group by user
  const byUser = useMemo(() => {
    const map = new Map<string, GrantedRow[]>();
    for (const r of rows) {
      if (!map.has(r.user_id)) map.set(r.user_id, []);
      map.get(r.user_id)!.push(r);
    }
    return Array.from(map.entries()).map(([uid, grants]) => ({
      uid,
      grants,
      user: users.find((u) => u.id === uid),
    }));
  }, [rows, users]);

  if (loading)
    return (
      <div className="p-5 space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );

  if (rows.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3 text-muted-foreground">
        <Shield className="h-10 w-10 opacity-20" />
        <p className="text-sm font-semibold">No Active Grants</p>
        <p className="text-xs max-w-xs opacity-70">
          No users currently have individually granted permission overrides.
        </p>
      </div>
    );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <p className="text-xs text-muted-foreground mb-1">
        {byUser.length} user{byUser.length !== 1 ? "s" : ""} with active grants
        across {rows.length} permission{rows.length !== 1 ? "s" : ""}. Revoke
        any grant to remove it immediately.
      </p>
      {byUser.map(({ uid, grants, user }) => (
        <Card key={uid} className="border-border/60">
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                  {(user?.name || "?")
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">
                  {user?.name ?? uid}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email ?? ""}
                </p>
                {user?.role && (
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4 px-1.5 mt-1"
                  >
                    {toDisplayLabel(user.role)}
                  </Badge>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {grants.map((g) => {
                    const isRevoking = revoking === g.id;
                    const csDef = CS_BUTTON_ACTIONS.find(
                      (a) =>
                        a.action === g.action &&
                        g.resource === "cost_submissions",
                    );
                    const label = csDef
                      ? csDef.label
                      : `${g.resource} → ${g.action}`;
                    return (
                      <span
                        key={g.id}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-background",
                          csDef
                            ? `${CS_COLOR_CLASSES[csDef.color]?.text} ${CS_COLOR_CLASSES[csDef.color]?.border}`
                            : "text-emerald-600 border-emerald-300",
                        )}
                      >
                        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                        {label}
                        <button
                          onClick={() => revoke(g)}
                          disabled={isRevoking}
                          className="ml-0.5 hover:text-red-500 transition-colors disabled:opacity-40"
                          title="Revoke"
                        >
                          {isRevoking ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <XCircle className="h-2.5 w-2.5" />
                          )}
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Cost Submission Button Access section ─────────────────────────────────────
function CsButtonAccessSection({
  userId,
  userRole,
  isSelectedSuperAdmin,
}: {
  userId: string;
  userRole: string;
  isSelectedSuperAdmin: boolean;
}) {
  const { loading, savingKey, effectiveAction, explainAction, toggleAction } =
    useSelectedUserAccess();
  const [expanded, setExpanded] = useState(false);

  if (isSelectedSuperAdmin) return null;
  if (loading) return <Skeleton className="h-12 rounded-lg" />;

  const groups = Array.from(new Set(CS_BUTTON_ACTIONS.map((a) => a.group)));

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-3 bg-orange-50/80 hover:bg-orange-50 transition-colors border-b border-orange-100"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-orange-700" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-orange-700" />
        )}
        <Settings2 className="h-4 w-4 text-orange-600" />
        <span className="text-xs font-semibold tracking-wide text-orange-900 flex-1 text-left">
          Cost Submission — Button Access
        </span>
        <Badge className="text-[10px] h-5 px-1.5 bg-white text-orange-800 border-orange-200 border">
          Fine-grained overrides
        </Badge>
      </button>

      {expanded && (
        <div className="divide-y">
          {groups.map((group) => {
            const groupActions = CS_BUTTON_ACTIONS.filter(
              (a) => a.group === group,
            );
            return (
              <div key={group} className="px-3 pt-2 pb-3">
                <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  {CS_GROUP_LABELS[group]}
                </p>
                <div className="space-y-2">
                  {groupActions.map((perm) => {
                    const eff = effectiveAction(
                      "cost_submissions",
                      perm.action,
                    );
                    const trace = explainAction(
                      "cost_submissions",
                      perm.action,
                    );
                    const saving =
                      savingKey === `perm:cost_submissions:${perm.action}`;
                    const Icon = perm.icon;
                    const colors =
                      CS_COLOR_CLASSES[perm.color] ?? CS_COLOR_CLASSES.blue;
                    const hasOverride = eff === "granted" || eff === "blocked";
                    return (
                      <div
                        key={perm.action}
                        className={cn(
                          "flex items-start gap-2.5 px-2.5 py-2 rounded-lg",
                          eff === "granted"
                            ? "bg-emerald-50/50 dark:bg-emerald-900/5"
                            : eff === "blocked"
                              ? "bg-red-50/50 dark:bg-red-900/5 opacity-60"
                              : "",
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 p-1.5 rounded-md shrink-0",
                            colors.bg,
                            colors.text,
                          )}
                        >
                          <Icon className="h-3 w-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold leading-tight">
                            {perm.label}
                            <span className="block text-[10px] font-normal text-muted-foreground">
                              {perm.labelAr}
                            </span>
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                            {perm.description}
                          </p>
                          <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                            Default: {perm.defaultRoles}
                          </p>
                          <p
                            className="text-[9px] text-muted-foreground/80 mt-0.5"
                            title={trace.summary}
                          >
                            {trace.source === "user_override"
                              ? "Override"
                              : "Role default"}
                            : {trace.summary}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                          {hasOverride && (
                            <Badge
                              className={cn(
                                "text-[9px] h-4 px-1.5 border-0",
                                eff === "granted"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-700",
                              )}
                            >
                              {eff === "granted" ? "Granted" : "Blocked"}
                            </Badge>
                          )}
                          <button
                            disabled={saving}
                            onClick={() =>
                              toggleAction("cost_submissions", perm.action)
                            }
                            className={cn(
                              "text-[10px] border rounded px-2 py-0.5 font-medium transition-colors disabled:opacity-40 min-w-[60px] text-center",
                              eff === "granted"
                                ? "text-amber-600 border-amber-200 hover:bg-amber-50"
                                : eff === "blocked"
                                  ? "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                  : "text-emerald-600 border-emerald-200 hover:bg-emerald-50",
                            )}
                          >
                            {saving ? (
                              <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                            ) : eff === "granted" ? (
                              "Remove"
                            ) : eff === "blocked" ? (
                              "Restore"
                            ) : (
                              "Grant"
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main PermissionsTab ───────────────────────────────────────────────────────
type PermissionsSection = "actions" | "columns" | "grants" | "all";
type ActionFilter = "all" | "buttons" | "reports";

export function PermissionsTab({
  userId,
  userRole,
  isSelectedSuperAdmin,
  section = "all",
  actionFilter = "all",
}: TabProps & { section?: PermissionsSection; actionFilter?: ActionFilter }) {
  const {
    loading,
    savingKey,
    effectiveAction,
    explainAction,
    toggleAction,
    columnConfigs,
    upsertColumnVisibility,
    removeColumnVisibility,
    effectiveRoleNames,
  } = useSelectedUserAccess();
  const [activeSection, setActiveSection] = useState<
    "actions" | "columns" | "grants"
  >("actions");
  const [moduleSearch, setModuleSearch] = useState("");
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set(),
  );
  const [selectedPage, setSelectedPage] = useState(
    COLUMN_REGISTRY[0]?.pageSlug ?? "",
  );
  const [selectedRoleDefault, setSelectedRoleDefault] = useState(userRole);

  useEffect(() => {
    if (!effectiveRoleNames.includes(selectedRoleDefault))
      setSelectedRoleDefault(effectiveRoleNames[0] ?? userRole);
  }, [effectiveRoleNames, selectedRoleDefault, userRole]);

  function toggleModule(m: string) {
    setExpandedModules((prev) => {
      const n = new Set(prev);
      n.has(m) ? n.delete(m) : n.add(m);
      return n;
    });
  }

  const filteredModules = useMemo(() => {
    const q = moduleSearch.toLowerCase();
    const pinnedMmpReportsVisible = actionFilter === "buttons" && !moduleSearch;
    type RegisteredAction = {
      action: ModuleAction;
      module: ModuleDefinition;
      page: ModulePage;
      isReportAccess: boolean;
      searchText: string;
    };
    const actionsByKey = new Map<string, RegisteredAction>();

    // A permission key is the action identity. The registry can mention that
    // same permission on multiple pages, but the access manager must render
    // one control for it (and retain all registry text for searching).
    MODULE_REGISTRY.forEach((mod) =>
      mod.pages.forEach((pg) =>
        pg.actions.forEach((a) => {
          // Reports contains access to report pages/content. Clickable operations
          // such as export, download, generate, and report launchers belong to
          // Buttons & Actions. The resource check is important for report pages
          // whose visible label is "Documents", "Archive", etc.
          const isReportAccess =
            a.action === "read" &&
            (a.resource === "reports" ||
              /report|analytics/i.test(
                `${a.label} ${a.description || ""} ${pg.page}`,
              ));
          const searchText = [
            a.label,
            a.resource,
            a.description,
            pg.page,
            mod.module,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          const existing = actionsByKey.get(a.key);
          if (existing) {
            existing.isReportAccess ||= isReportAccess;
            existing.searchText += ` ${searchText}`;
          } else {
            actionsByKey.set(a.key, {
              action: a,
              module: mod,
              page: pg,
              isReportAccess,
              searchText,
            });
          }
        }),
      ),
    );

    // Keep the first registry location as the display location while every
    // duplicate registration remains searchable through searchText above.
    return Array.from(actionsByKey.values())
      .filter(({ action, isReportAccess, searchText }) => {
        const matchesType =
          actionFilter === "all" ||
          (actionFilter === "reports"
            ? isReportAccess
            : !isReportAccess || MMP_REPORT_ACTIONS.has(action.action));
        return matchesType && (!q || searchText.includes(q));
      })
      .reduce<ModuleDefinition[]>((modules, registered) => {
        const actions = pinnedMmpReportsVisible
          ? registered.page.actions.filter(
              (a) => !MMP_REPORT_ACTIONS.has(a.action),
            )
          : registered.page.actions;
        if (actions.length === 0) return modules;
        let mod = modules.find(
          (candidate) => candidate.module === registered.module.module,
        );
        if (!mod) {
          mod = { ...registered.module, pages: [] };
          modules.push(mod);
        }
        let page = mod.pages.find(
          (candidate) => candidate.page === registered.page.page,
        );
        if (!page) {
          page = { ...registered.page, actions: [] };
          mod.pages.push(page);
        }
        actions.forEach((action) => {
          // Keep the first registry location for normal rendering; duplicate
          // registrations are already collapsed above.
          if (action.key === registered.action.key) page!.actions.push(action);
        });
        return modules;
      }, []);
  }, [moduleSearch, actionFilter]);
  const visibleSection = section === "all" ? activeSection : section;

  const pageDef = COLUMN_REGISTRY.find((p) => p.pageSlug === selectedPage);
  const userColMap = useMemo(
    () =>
      Object.fromEntries(
        columnConfigs
          .filter((c) => c.user_id === userId)
          .map((c) => [`${c.page_slug}:${c.column_key}`, c]),
      ),
    [columnConfigs, userId],
  );
  const roleColMap = useMemo(
    () =>
      Object.fromEntries(
        columnConfigs
          .filter((c) => c.role === selectedRoleDefault)
          .map((c) => [`${c.page_slug}:${c.column_key}`, c]),
      ),
    [columnConfigs, selectedRoleDefault],
  );

  if (isSelectedSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3 text-muted-foreground">
        <Shield className="h-10 w-10 opacity-20" />
        <p className="text-sm font-semibold">
          Super Admin — Full Permissions, No Overrides
        </p>
        <p className="text-xs max-w-xs opacity-70">
          Super Admins always have all permissions. No overrides can be applied.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-5 space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Section tabs */}
        {section === "all" && (
          <div className="px-5 pt-3 border-b bg-card/50">
            <div className="flex gap-1 mb-0">
              {(
                [
                  { key: "actions", icon: Key, label: "Action Permissions" },
                  { key: "columns", icon: Columns, label: "Column Visibility" },
                  { key: "grants", icon: Users, label: "Active Grants" },
                ] as const
              ).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={cn(
                    "px-4 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5",
                    activeSection === s.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <s.icon className="h-3 w-3" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Action Permissions ── */}
        {visibleSection === "actions" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center dark:bg-background">
              <div className="relative min-w-0 flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                  placeholder={
                    actionFilter === "reports"
                      ? "Search reports and exports…"
                      : "Search buttons and actions…"
                  }
                  className="h-9 border-slate-200 bg-slate-50/80 pl-9 text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-600">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" /> Role
                  default
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{" "}
                  Granted
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-800">
                  <XCircle className="h-3.5 w-3.5 text-red-500" /> Blocked
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                  <MinusCircle className="h-3.5 w-3.5 text-slate-400" /> No
                  access
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {/* Pinned: Cost Submission fine-grained button access */}
              {!moduleSearch && actionFilter !== "reports" && (
                <CsButtonAccessSection
                  userId={userId}
                  userRole={userRole}
                  isSelectedSuperAdmin={isSelectedSuperAdmin}
                />
              )}
              {/* Pinned: each MMP report scope has its own override */}
              {!moduleSearch && actionFilter === "buttons" && (
                <MmpReportButtonsSection />
              )}

              {/* Standard module accordion */}
              {filteredModules.map((mod) => {
                const isOpen = expandedModules.has(mod.module);
                const overrideCount = mod.pages
                  .flatMap((pg) => pg.actions)
                  .filter((a) => {
                    const eff = effectiveAction(
                      a.resource,
                      a.action as ActionType,
                    );
                    return eff === "granted" || eff === "blocked";
                  }).length;
                return (
                  <div key={mod.module}>
                    <button
                      onClick={() => toggleModule(mod.module)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                      )}
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 flex-1 text-left">
                        {mod.module}
                      </span>
                      {overrideCount > 0 && (
                        <Badge className="text-[10px] h-5 px-1.5 bg-amber-100 text-amber-800 border-0">
                          {overrideCount} override
                          {overrideCount !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </button>

                    {isOpen &&
                      mod.pages.map((pg) => (
                        <div
                          key={pg.page}
                          className="ml-2 mb-3 rounded-lg border border-slate-200 bg-slate-50/50 p-2 dark:bg-slate-900/20"
                        >
                          <p className="text-xs font-medium text-slate-600 px-2 py-1.5">
                            {pg.page}
                          </p>
                          <div className="space-y-1">
                            {pg.actions.map((a) => {
                              const eff = effectiveAction(
                                a.resource,
                                a.action as ActionType,
                              );
                              const trace = explainAction(
                                a.resource,
                                a.action as ActionType,
                              );
                              const saving =
                                savingKey === `perm:${a.resource}:${a.action}`;
                              const Icon =
                                ACTION_ICONS[a.action as ActionType] ?? Key;
                              const hasOverride =
                                eff === "granted" || eff === "blocked";
                              return (
                                <div
                                  key={`${a.resource}:${a.action}`}
                                  className={cn(
                                    "flex flex-wrap items-center gap-3 rounded-md border bg-white px-3 py-2.5 dark:bg-background",
                                    eff === "granted"
                                      ? "border-emerald-200 bg-emerald-50/40"
                                      : eff === "blocked"
                                        ? "border-red-200 bg-red-50/30 opacity-80"
                                        : eff === "role-yes"
                                          ? "border-blue-100"
                                          : "border-slate-200 opacity-75",
                                  )}
                                >
                                  <StatusIcon eff={eff} />
                                  <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                      {a.label}
                                    </span>
                                    {a.description && (
                                      <span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                                        {a.description}
                                      </span>
                                    )}
                                    <span
                                      className="text-[11px] text-slate-500"
                                      title={trace.summary}
                                    >
                                      {trace.source === "user_override"
                                        ? "Override"
                                        : trace.source === "super_admin"
                                          ? "Super Admin"
                                          : "Role default"}
                                      : {trace.summary}
                                    </span>
                                  </div>
                                  {hasOverride && (
                                    <Badge
                                      className={cn(
                                        "text-[10px] h-5 px-1.5 border-0 shrink-0",
                                        eff === "granted"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-red-100 text-red-800",
                                      )}
                                    >
                                      {eff === "granted"
                                        ? "Granted"
                                        : "Blocked"}
                                    </Badge>
                                  )}
                                  <button
                                    disabled={saving}
                                    onClick={() =>
                                      toggleAction(
                                        a.resource,
                                        a.action as ActionType,
                                      )
                                    }
                                    className={cn(
                                      "min-w-[4.5rem] shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                                      eff === "granted"
                                        ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                                        : eff === "blocked"
                                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                                          : eff === "role-yes"
                                            ? "border-red-300 bg-white text-red-700 hover:bg-red-50"
                                            : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50",
                                    )}
                                  >
                                    {saving ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" />
                                    ) : eff === "granted" ? (
                                      "Remove"
                                    ) : eff === "blocked" ? (
                                      "Restore"
                                    ) : eff === "role-yes" ? (
                                      "Block"
                                    ) : (
                                      "Grant"
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Column Visibility ── */}
        {visibleSection === "columns" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-5 py-2.5 border-b flex items-center gap-3">
              <div className="flex-1 max-w-xs">
                <Select value={selectedPage} onValueChange={setSelectedPage}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Select a page…" />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMN_REGISTRY.map((p) => (
                      <SelectItem
                        key={p.pageSlug}
                        value={p.pageSlug}
                        className="text-xs"
                      >
                        {p.pageLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Eye = visible · Slash = hidden · Blue = role rule · Purple =
                user override
              </p>
              <Select
                value={selectedRoleDefault}
                onValueChange={setSelectedRoleDefault}
              >
                <SelectTrigger
                  className="h-7 w-44 text-xs"
                  aria-label="Role default to edit"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {effectiveRoleNames.map((role) => (
                    <SelectItem key={role} value={role} className="text-xs">
                      {toDisplayLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 overflow-auto">
              <div className="min-w-[34rem]">
                <div className="px-5 py-1.5 border-b bg-muted/20 grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>Column</span>
                  <span className="w-28 text-center">
                    Role Default
                    <br />
                    <span className="font-normal text-[9px] normal-case">
                      Applies to all {toDisplayLabel(selectedRoleDefault)} users
                    </span>
                  </span>
                  <span className="w-28 text-center">
                    User Override
                    <br />
                    <span className="font-normal text-[9px] normal-case">
                      Only this user
                    </span>
                  </span>
                </div>
                {pageDef?.columns.map((col) => {
                  const storageSlug = columnStorageSlug(pageDef);
                  const roleKey = `${storageSlug}:${col.key}`;
                  const roleRow = roleColMap[roleKey];
                  const userRow = userColMap[roleKey];
                  const roleSaving =
                    savingKey === `col:role:${storageSlug}:${col.key}`;
                  const userSaving =
                    savingKey === `col:user:${storageSlug}:${col.key}`;
                  const roleRemoveSaving = roleRow
                    ? savingKey === `col:remove:${roleRow.id}`
                    : false;
                  const userRemoveSaving = userRow
                    ? savingKey === `col:remove:${userRow.id}`
                    : false;

                  return (
                    <div
                      key={col.key}
                      className="px-5 py-2.5 border-b grid grid-cols-[1fr_auto_auto] gap-2 items-center hover:bg-muted/20"
                    >
                      <div>
                        <p className="text-xs font-medium">{col.label}</p>
                        {col.sensitive && (
                          <Badge className="text-[9px] h-3.5 px-1 bg-orange-100 text-orange-700 border-0 mt-0.5">
                            sensitive
                          </Badge>
                        )}
                      </div>

                      {/* Role default toggle */}
                      <div className="w-28 flex items-center justify-center gap-1.5">
                        {roleRow ? (
                          <>
                            <span
                              className={cn(
                                "text-[10px] flex items-center gap-0.5",
                                roleRow.is_hidden
                                  ? "text-red-600"
                                  : "text-emerald-600",
                              )}
                            >
                              {roleRow.is_hidden ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              {roleRow.is_hidden ? "Hidden" : "Visible"}
                            </span>
                            <button
                              type="button"
                              disabled={roleRemoveSaving}
                              aria-label={`Remove role column override for ${col.label}`}
                              onClick={() => removeColumnVisibility(roleRow.id)}
                              className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                            >
                              {roleRemoveSaving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </button>
                          </>
                        ) : (
                          <div className="flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  disabled={roleSaving}
                                  onClick={() =>
                                    upsertColumnVisibility(
                                      storageSlug,
                                      col.key,
                                      true,
                                      "role",
                                      selectedRoleDefault,
                                    )
                                  }
                                  className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 border rounded text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40"
                                >
                                  {roleSaving ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <EyeOff className="h-3 w-3" />
                                  )}
                                  Hide
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                Hide for all{" "}
                                {toDisplayLabel(selectedRoleDefault)} users
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </div>

                      {/* User override toggle */}
                      <div className="w-28 flex items-center justify-center gap-1.5">
                        {userRow ? (
                          <>
                            <span
                              className={cn(
                                "text-[10px] flex items-center gap-0.5",
                                userRow.is_hidden
                                  ? "text-red-600"
                                  : "text-emerald-600",
                              )}
                            >
                              {userRow.is_hidden ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              {userRow.is_hidden ? "Hidden" : "Visible"}
                            </span>
                            <button
                              type="button"
                              disabled={userRemoveSaving}
                              aria-label={`Remove user column override for ${col.label}`}
                              onClick={() => removeColumnVisibility(userRow.id)}
                              className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                            >
                              {userRemoveSaving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </button>
                          </>
                        ) : (
                          <div className="flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  disabled={userSaving}
                                  onClick={() =>
                                    upsertColumnVisibility(
                                      storageSlug,
                                      col.key,
                                      true,
                                      "user",
                                    )
                                  }
                                  className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 border rounded text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40"
                                >
                                  {userSaving ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <EyeOff className="h-3 w-3" />
                                  )}
                                  Hide
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                Hide only for this user
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Active Grants (cross-user overview) ── */}
        {visibleSection === "grants" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-5 py-2.5 border-b bg-card/50">
              <p className="text-xs text-muted-foreground">
                All users who currently have individually granted permission
                overrides — across every resource and action. Revoke any badge
                to remove it immediately.
              </p>
            </div>
            <ActiveGrantsPanel />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
