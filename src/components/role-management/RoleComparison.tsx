import { Check, Shield, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RoleWithPermissions } from '@/types/roles';

export function RoleComparison({ roles }: { roles: RoleWithPermissions[] }) {
  const visible = roles.slice(0, 6);
  const permissionStats = visible.map(role => {
    const permissionKeys = new Set(role.permissions.map(permission => `${permission.resource}:${permission.action}`));
    return {
      role,
      permissions: permissionKeys.size,
      resources: new Set(role.permissions.map(permission => permission.resource)).size,
      exports: role.permissions.filter(permission => permission.action === 'export').length,
      updates: role.permissions.filter(permission => ['create', 'update', 'delete', 'approve', 'assign', 'manage'].includes(permission.action)).length,
    };
  });
  const rows = [
    { label: 'Permission entries', key: 'permissions' as const },
    { label: 'Protected resources', key: 'resources' as const },
    { label: 'Report / export grants', key: 'exports' as const },
    { label: 'Write-capable grants', key: 'updates' as const },
  ];
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="rounded-xl border border-slate-700 bg-[#18252b] p-5 text-slate-50">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">Comparison view</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">See the boundary between roles.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Compare the loaded permission baseline before assigning access. Page, tab, presentation, and scope defaults remain available in each role editor.</p>
      </div>
      <Card className="overflow-hidden border-slate-200/80 bg-[#fbfaf7] shadow-none">
        <CardHeader className="border-b border-slate-200/80 px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-800"><Shield className="h-4 w-4 text-slate-500" /> Baseline matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr><th className="w-56 px-5 py-3">Loaded baseline</th>{permissionStats.map(({ role }) => <th key={role.id} className="px-4 py-3">{role.display_name || role.name}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.key} className="border-t border-slate-200/80">
                  <td className="px-5 py-3 font-medium text-slate-700">{row.label}</td>
                  {permissionStats.map(stats => <td key={stats.role.id} className="px-4 py-3"><span className="inline-flex items-center gap-1 text-slate-700"><Check className="h-3.5 w-3.5 text-emerald-600" /> {stats[row.key]}</span></td>)}
                </tr>
              ))}
              <tr className="border-t border-slate-200/80">
                <td className="px-5 py-3 font-medium text-slate-700">Role protection</td>
                {permissionStats.map(({ role }) => <td key={role.id} className="px-4 py-3"><Badge variant="outline" className="text-[10px]">{role.is_system_role ? 'System role' : 'Custom role'}</Badge></td>)}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="flex items-center gap-2 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> Showing {visible.length} of {roles.length} roles. Counts come from the loaded role permission service; no access is inferred from labels.</div>
    </div>
  );
}