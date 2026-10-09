import { ArrowRight, LockKeyhole, ShieldCheck, Users } from 'lucide-react';

type SecurityOverviewProps = {
  roleCount: number;
  activeRoleCount: number;
  userCount: number;
  assignmentCount: number;
  onOpenRoles: () => void;
};

export function SecurityOverview({
  roleCount,
  activeRoleCount,
  userCount,
  assignmentCount,
  onOpenRoles,
}: SecurityOverviewProps) {
  return (
    <div className="space-y-8 animate-fade-in">
      <header className="max-w-2xl space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Role baselines
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-slate-800 sm:text-2xl">
          Manage role defaults here
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          Permissions, pages, and tabs are set per role on the Roles tab.
        </p>
      </header>

      <dl className="grid gap-6 border-y border-slate-200 py-5 sm:grid-cols-3">
        <Stat
          icon={ShieldCheck}
          label="Active roles"
          value={`${activeRoleCount} of ${roleCount}`}
          note="baselines available to assign"
        />
        <Stat
          icon={Users}
          label="Directory users"
          value={String(userCount)}
          note="people in this workspace"
        />
        <Stat
          icon={LockKeyhole}
          label="Role assignments"
          value={String(assignmentCount)}
          note="user-to-role links"
        />
      </dl>

      <ActionLink title="Roles" detail="Create and edit role baselines." onClick={onOpenRoles} />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0">
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-800">{value}</dd>
        <p className="text-[11px] text-slate-500">{note}</p>
      </div>
    </div>
  );
}

function ActionLink({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full max-w-md items-start justify-between gap-3 rounded-md border border-slate-200 bg-transparent px-4 py-3 text-left transition-colors hover:border-slate-400 hover:bg-slate-50"
    >
      <span>
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span>
      </span>
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
