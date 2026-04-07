import { Link, useLocation } from "react-router-dom";
import { FolderKanban, CheckSquare, Building2, Banknote, BarChart3, Briefcase } from "lucide-react";
import { useAuthorization } from "@/hooks/use-authorization";

const PAGES = [
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
    url: "/projects/analytics",
    icon: BarChart3,
    color: "#7C3AED",
    light: "#EDE9FE",
    roles: ["super_admin", "superAdmin", "SuperAdmin", "admin", "Admin"],
  },
  {
    id: "portfolio",
    label: "Portfolio Dashboard",
    url: "/portfolio",
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
    roles: [] as string[], // visible to everyone
  },
  {
    id: "departments",
    label: "Departments",
    url: "/departments",
    icon: Building2,
    color: "#0F2041",
    light: "#E8ECF3",
    roles: ["super_admin", "superAdmin", "SuperAdmin", "admin", "Admin"],
  },
  {
    id: "hr",
    label: "My Payroll",
    url: "/hr",
    icon: Banknote,
    color: "#D97706",
    light: "#FEF3C7",
    roles: [] as string[], // visible to all authenticated users
  },
];

export function ConnectedPagesBar({ exclude }: { exclude?: string }) {
  const { pathname } = useLocation();
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const superAdmin = isSuperAdmin();

  const visible = PAGES.filter(p => {
    if (p.id === exclude) return false;
    if (p.roles.length === 0) return true; // public page
    if (superAdmin) return true;
    return hasAnyRole(p.roles);
  });

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-0 py-1">
      {visible.map(p => {
        const isActive = pathname === p.url || pathname.startsWith(p.url + '?');
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
