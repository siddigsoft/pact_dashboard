import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock3, LockKeyhole, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { AccessInventory } from '@/lib/access-inventory';

type SecurityOverviewProps = {
  roleCount: number;
  activeRoleCount: number;
  userCount: number;
  assignmentCount: number;
  inventory: AccessInventory;
  inventoryIssueCount: number;
  onOpenPeople: () => void;
  onOpenRoles: () => void;
  onOpenGovernance: () => void;
};

export function SecurityOverview({
  roleCount,
  activeRoleCount,
  userCount,
  assignmentCount,
  inventory,
  inventoryIssueCount,
  onOpenPeople,
  onOpenRoles,
  onOpenGovernance,
}: SecurityOverviewProps) {
  const registeredTargetCount = inventory.pages.length
    + inventory.tabs.length
    + inventory.actions.length
    + inventory.filters.length
    + inventory.columns.length
    + inventory.scopes.length;
  const verifiedBoundaryCount = Object.values(inventory)
    .flat()
    .filter(item => item.serverEnforcement === 'verified').length;
  const unverifiedSensitiveColumnCount = inventory.columns
    .filter(item => item.sensitive && item.serverEnforcement !== 'verified').length;
  const signals = [
    { label: 'Active role baselines', value: `${activeRoleCount}/${roleCount}`, note: 'active roles available for assignment', tone: activeRoleCount === roleCount ? 'good' : 'neutral' },
    { label: 'Verified source boundaries', value: String(verifiedBoundaryCount), note: 'targets with named RPC, RLS, or server evidence', tone: verifiedBoundaryCount ? 'good' : 'warn' },
    { label: 'Sensitive columns to verify', value: String(unverifiedSensitiveColumnCount), note: 'registered columns without source-denial evidence', tone: unverifiedSensitiveColumnCount ? 'warn' : 'good' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <section className="relative overflow-hidden rounded-xl border border-slate-700 bg-[#18252b] px-5 py-6 text-slate-50 shadow-sm sm:px-7">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_center,rgba(205,164,91,.18),transparent_65%)]" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
               <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Policy workspace
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Access is a programme decision.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Review who can see sensitive operational data, why they can see it, and where a local exception needs attention.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-slate-300">
            <Clock3 className="h-3.5 w-3.5 text-amber-300" />
            Application metadata inventory
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {signals.map((signal) => (
          <Card key={signal.label} className="border-slate-200/80 bg-[#fbfaf7] shadow-none">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{signal.label}</p>
                <span className={cn('h-2 w-2 rounded-full', signal.tone === 'good' ? 'bg-emerald-500' : signal.tone === 'warn' ? 'bg-amber-500' : 'bg-slate-400')} />
              </div>
              <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-slate-800">{signal.value}</p>
              <p className="mt-1 text-xs text-slate-500">{signal.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <Card className="border-slate-200/80 bg-[#fbfaf7] shadow-none">
          <CardHeader className="border-b border-slate-200/80 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm text-slate-800">Enforcement evidence</CardTitle>
                <p className="mt-1 text-xs text-slate-500">Verified boundaries are counted separately from configuration metadata.</p>
              </div>
               <Badge variant="outline" className={inventoryIssueCount ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                 {inventoryIssueCount ? 'Review mappings' : 'No mapping drift'}
               </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
            <PostureRow icon={ShieldCheck} label="Active role baseline" value={`${activeRoleCount} of ${roleCount}`} note="roles available to assign" />
            <PostureRow icon={Users} label="Directory identities" value={String(userCount)} note="users loaded into this workspace" />
            <PostureRow icon={LockKeyhole} label="Role assignments" value={String(assignmentCount)} note="canonical user-to-role links" />
             <PostureRow icon={Activity} label="Registered metadata" value={String(registeredTargetCount)} note="not proof of source enforcement" />
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/50 shadow-none">
          <CardHeader className="px-5 pb-2 pt-5">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              <CardTitle className="text-sm">Review before you change</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <p className="text-xs leading-5 text-amber-900/75">
              Role edits affect every assigned person. User overrides are safer for temporary field conditions, but should carry a reason and an expiry.
            </p>
            <Button variant="link" className="mt-3 h-auto gap-1 p-0 text-xs text-amber-900" onClick={onOpenGovernance}>
               Open registry review <ArrowRight className="h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ActionCard title="People & effective access" detail="Inspect a person’s resolved access and exceptions." onClick={onOpenPeople} />
        <ActionCard title="Roles & policy baseline" detail="Edit the reusable access contract for a role." onClick={onOpenRoles} />
        <ActionCard title="Governance inventory" detail="Review registered targets and unresolved mappings." onClick={onOpenGovernance} />
      </div>
    </div>
  );
}

function PostureRow({ icon: Icon, label, value, note }: { icon: typeof ShieldCheck; label: string; value: string; note: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/70 p-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-700">{label}</p>
        <p className="truncate text-[11px] text-slate-500">{note}</p>
      </div>
      <p className="font-mono text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function ActionCard({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group rounded-lg border border-slate-200 bg-[#fbfaf7] p-4 text-left transition-transform hover:-translate-y-0.5 hover:border-slate-400">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1" />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </button>
  );
}