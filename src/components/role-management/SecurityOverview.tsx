import { ArrowRight, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

type SecurityOverviewProps = {
  roleCount: number;
  activeRoleCount: number;
  userCount: number;
  assignmentCount: number;
  onOpenPeople: () => void;
  onOpenRoles: () => void;
};

export function SecurityOverview({
  roleCount,
  activeRoleCount,
  userCount,
  assignmentCount,
  onOpenPeople,
  onOpenRoles,
}: SecurityOverviewProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      <section className="relative overflow-hidden rounded-xl border border-slate-700 bg-[#18252b] px-5 py-6 text-slate-50 shadow-sm sm:px-7">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,rgba(205,164,91,.18),transparent_65%)]" />
        <div className="relative max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Role baselines
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Edit roles here. Exceptions live elsewhere.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
            Role defaults (permissions, pages, tabs) are managed on the Roles tab.
            Per-person grants and blocks stay in Super Admin → Users.
          </p>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <PostureRow icon={ShieldCheck} label="Active roles" value={`${activeRoleCount} of ${roleCount}`} note="baselines available to assign" />
        <PostureRow icon={Users} label="Directory users" value={String(userCount)} note="people in this workspace" />
        <PostureRow icon={LockKeyhole} label="Role assignments" value={String(assignmentCount)} note="user-to-role links" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ActionCard title="Roles" detail="Create and edit role baselines — permissions, page defaults, and tab rules." onClick={onOpenRoles} />
        <ActionCard title="User exceptions" detail="Grant or block access for one person in Super Admin → Users." onClick={onOpenPeople} />
      </div>
    </div>
  );
}

function PostureRow({ icon: Icon, label, value, note }: { icon: typeof ShieldCheck; label: string; value: string; note: string }) {
  return (
    <Card className="border-slate-200/80 bg-[#fbfaf7] shadow-none">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-700">{label}</p>
          <p className="truncate text-[11px] text-slate-500">{note}</p>
        </div>
        <p className="font-mono text-sm font-semibold text-slate-800">{value}</p>
      </CardContent>
    </Card>
  );
}

function ActionCard({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-lg border border-slate-200 bg-[#fbfaf7] p-4 text-left transition-transform hover:-translate-y-0.5 hover:border-slate-400"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1" />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </button>
  );
}
