import { Link, useLocation } from "react-router-dom";
import {
  FolderKanban, CheckSquare, Building2, Banknote, BarChart3, Briefcase,
  Users, Settings, LayoutDashboard, ShieldCheck, ClipboardList,
  Map, FileText, DollarSign, BookOpen, MessageSquare, PieChart,
} from "lucide-react";
import { useAuthorization } from "@/hooks/use-authorization";
import { cn } from "@/lib/utils";

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  icon: React.ElementType;
  color: string;
  light: string;
  roles?: string[];
}

const ALL_PAGES: QuickLink[] = [
  {
    id: "projects",
    label: "Projects",
    url: "/projects",
    icon: FolderKanban,
    color: "#2563EB",
    light: "#DBEAFE",
    roles: ["super_admin", "superAdmin", "SuperAdmin", "admin", "Admin"],
  },
  {
    id: "analytics",
    label: "Project Analytics",
    url: "/programme-hub?tab=analytics",
    icon: BarChart3,
    color: "#7C3AED",
    light: "#EDE9FE",
    roles: ["super_admin", "superAdmin", "SuperAdmin", "admin", "Admin"],
  },
  {
    id: "portfolio",
    label: "Portfolio Dashboard",
    url: "/programme-hub?tab=portfolio",
    icon: Briefcase,
    color: "#0F2041",
    light: "#E8ECF3",
    roles: ["super_admin", "superAdmin", "SuperAdmin", "admin", "Admin"],
  },
  {
    id: "my-tasks",
    label: "My Tasks",
    url: "/my-tasks",
    icon: CheckSquare,
    color: "#059669",
    light: "#D1FAE5",
  },
  {
    id: "departments",
    label: "Departments",
    url: "/admin?tab=departments",
    icon: Building2,
    color: "#0F2041",
    light: "#E8ECF3",
    roles: ["super_admin", "superAdmin", "SuperAdmin", "admin", "Admin"],
  },
  {
    id: "hr",
    label: "My Payroll",
    url: "/hr-hub?tab=payslips",
    icon: Banknote,
    color: "#D97706",
    light: "#FEF3C7",
  },
  {
    id: "users",
    label: "User Management",
    url: "/admin?tab=users",
    icon: Users,
    color: "#2563EB",
    light: "#DBEAFE",
    roles: ["super_admin", "superAdmin", "SuperAdmin", "admin", "Admin"],
  },
  {
    id: "role-management",
    label: "Role Management",
    url: "/admin?tab=role-management",
    icon: ShieldCheck,
    color: "#7C3AED",
    light: "#EDE9FE",
    roles: ["super_admin", "superAdmin", "SuperAdmin", "admin", "Admin"],
  },
  {
    id: "settings",
    label: "Settings",
    url: "/admin?tab=settings",
    icon: Settings,
    color: "#4b5563",
    light: "#F3F4F6",
    roles: ["super_admin", "superAdmin", "SuperAdmin", "admin", "Admin"],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    color: "#0f766e",
    light: "#CCFBF1",
  },
  {
    id: "mmp",
    label: "MMP",
    url: "/mmp",
    icon: ClipboardList,
    color: "#0369a1",
    light: "#E0F2FE",
  },
  {
    id: "field-ops",
    label: "Field Ops",
    url: "/field-ops-hub",
    icon: Map,
    color: "#15803d",
    light: "#DCFCE7",
  },
  {
    id: "reports",
    label: "Reports",
    url: "/reports",
    icon: FileText,
    color: "#b45309",
    light: "#FEF3C7",
  },
  {
    id: "finance",
    label: "Finance",
    url: "/finance-hub",
    icon: DollarSign,
    color: "#be185d",
    light: "#FCE7F3",
  },
  {
    id: "accounting",
    label: "Accounting",
    url: "/accounting-hub",
    icon: BookOpen,
    color: "#1d4ed8",
    light: "#DBEAFE",
  },
  {
    id: "communication",
    label: "Communication",
    url: "/communication-hub",
    icon: MessageSquare,
    color: "#0891b2",
    light: "#CFFAFE",
  },
  {
    id: "analytics-hub",
    label: "Analytics",
    url: "/analytics-hub",
    icon: PieChart,
    color: "#7C3AED",
    light: "#EDE9FE",
    roles: ["super_admin", "superAdmin", "SuperAdmin", "admin", "Admin"],
  },
  {
    id: "admin",
    label: "Admin Hub",
    url: "/admin",
    icon: Settings,
    color: "#4b5563",
    light: "#F3F4F6",
    roles: ["super_admin", "superAdmin", "SuperAdmin", "admin", "Admin"],
  },
];

const PAGE_MAP = Object.fromEntries(ALL_PAGES.map(p => [p.id, p]));

interface ConnectedPagesBarProps {
  /** IDs from ALL_PAGES to show. If omitted, falls back to legacy behaviour. */
  pages?: string[];
  /** Legacy: exclude one page by id */
  exclude?: string;
  /** Legacy: only show these ids */
  include?: string[];
  className?: string;
  currentPath?: string;
}

export function ConnectedPagesBar({ pages, exclude, include, className }: ConnectedPagesBarProps) {
  const { pathname, search } = useLocation();
  const currentFull = pathname + search;
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const superAdmin = isSuperAdmin();

  const candidates: QuickLink[] = pages
    ? pages.map(id => PAGE_MAP[id]).filter(Boolean)
    : ALL_PAGES;

  const visible = candidates.filter(p => {
    if (p.id === exclude) return false;
    if (include && !include.includes(p.id)) return false;
    if (!p.roles || p.roles.length === 0) return true;
    return superAdmin || hasAnyRole(p.roles);
  });

  if (visible.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {visible.map(p => {
        const isActive =
          currentFull === p.url ||
          currentFull.startsWith(p.url + '?') ||
          pathname === p.url.split('?')[0];
        return (
          <Link
            key={p.id}
            to={p.url}
            data-testid={`quicknav-${p.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border"
            style={
              isActive
                ? { background: p.color, color: "#fff", borderColor: p.color }
                : { background: p.light, color: p.color, borderColor: p.color + "30" }
            }
          >
            <p.icon className="h-3.5 w-3.5 shrink-0" />
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
