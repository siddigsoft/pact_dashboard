import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Database, Plus, X, Loader2, MapPin, FolderOpen, Building2, DollarSign, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useSelectedUserAccess } from '@/context/role-management/SelectedUserAccessContext';
import { TabProps, DataScopeRow } from './types';

type ScopeType = 'hub' | 'project' | 'state' | 'cost_center';

const SCOPE_ICONS: Record<ScopeType, any> = {
  hub: Building2, project: FolderOpen, state: MapPin, cost_center: DollarSign,
};
const SCOPE_LABELS: Record<ScopeType, string> = {
  hub: 'Hub', project: 'Project', state: 'State / Region', cost_center: 'Cost Center',
};
const SUDAN_STATES = [
  'Khartoum', 'Omdurman', 'Kassala', 'Gedarif', 'Port Sudan', 'Atbara',
  'Al Qadarif', 'Wad Madani', 'Al Fasher', 'Nyala', 'El Obeid', 'Rabak',
  'Sennar', 'Damazin', 'Ed Daein', 'Kadugli', 'Dilling', 'Geneina',
  'Zalingei', 'Ed Damazin', 'Dongola', 'Berber', 'Malakal',
];

interface ScopeOption { value: string; label: string }

export function DataScopeTab({ userId, userRole, isSelectedSuperAdmin }: TabProps) {
  const { loading: dataLoading, savingKey, dataScopeRows, upsertDataScope, removeDataScope } = useSelectedUserAccess();

  const [hubOptions, setHubOptions] = useState<ScopeOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<ScopeOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const [addTarget, setAddTarget]       = useState<'user' | 'role'>('user');
  const [addScopeType, setAddScopeType] = useState<ScopeType>('hub');
  const [addValue, setAddValue]         = useState('');
  const [adding, setAdding]             = useState(false);
  const [showAddForm, setShowAddForm]   = useState(false);

  // Load hub + project options from DB
  useEffect(() => {
    async function loadOptions() {
      setOptionsLoading(true);
      try {
        const [hubRes, projRes] = await Promise.all([
          supabase.from('hubs').select('id, name').order('name'),
          supabase.from('projects').select('id, name').eq('status', 'active').order('name').limit(100),
        ]);
        setHubOptions((hubRes.data ?? []).map(h => ({ value: h.id, label: h.name ?? h.id })));
        setProjectOptions((projRes.data ?? []).map(p => ({ value: p.id, label: p.name ?? p.id })));
      } catch {
        // silently fail — text input fallback
      } finally {
        setOptionsLoading(false);
      }
    }
    loadOptions();
  }, []);

  const userRows  = dataScopeRows.filter(d => d.user_id === userId);
  const roleRows  = dataScopeRows.filter(d => d.role === userRole && !d.user_id);

  const valueOptions: ScopeOption[] = addScopeType === 'hub' ? hubOptions
    : addScopeType === 'project' ? projectOptions
    : addScopeType === 'state' ? SUDAN_STATES.map(s => ({ value: s, label: s }))
    : [];

  async function handleAdd() {
    if (!addValue) return;
    setAdding(true);
    const label = valueOptions.find(o => o.value === addValue)?.label ?? addValue;
    await upsertDataScope(addScopeType, addValue, label, addTarget);
    setAddValue('');
    setAdding(false);
    setShowAddForm(false);
  }

  if (isSelectedSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3 text-muted-foreground">
        <Shield className="h-10 w-10 opacity-20" />
        <p className="text-sm font-semibold">Super Admin — No Data Scope Restrictions</p>
        <p className="text-xs max-w-xs opacity-70">Super Admins always see all data. No scope restrictions can be applied.</p>
      </div>
    );
  }

  if (dataLoading) {
    return <div className="p-5 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* How it works */}
      <div className="mx-5 mt-4 flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs dark:bg-blue-900/20 dark:border-blue-800/30 dark:text-blue-300">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">How Data Scope works:</span> When scope rules are configured, queries for that user are filtered to only show records matching those hubs/projects/states.
          <br /><span className="opacity-70 text-[10px] mt-0.5 block">Role defaults apply to all users with that role. User overrides apply only to this specific user and take priority.</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* ── Role defaults ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-semibold">Role Defaults</p>
              <p className="text-[10px] text-muted-foreground">Applies to all users with role: <strong>{userRole}</strong></p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1"
              onClick={() => { setAddTarget('role'); setShowAddForm(true); }}>
              <Plus className="h-3 w-3" /> Add Rule
            </Button>
          </div>

          {roleRows.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-xl">
              No role-level data scope restrictions for <strong>{userRole}</strong>
            </div>
          ) : (
            <div className="space-y-1.5">
              {roleRows.map(row => <ScopeRow key={row.id} row={row} savingKey={savingKey} onRemove={removeDataScope} />)}
            </div>
          )}
        </section>

        {/* ── User overrides ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-semibold">User Overrides</p>
              <p className="text-[10px] text-muted-foreground">Only applies to this specific user</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1"
              onClick={() => { setAddTarget('user'); setShowAddForm(true); }}>
              <Plus className="h-3 w-3" /> Add Override
            </Button>
          </div>

          {userRows.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-xl">
              No user-level data scope overrides
            </div>
          ) : (
            <div className="space-y-1.5">
              {userRows.map(row => <ScopeRow key={row.id} row={row} savingKey={savingKey} onRemove={removeDataScope} />)}
            </div>
          )}
        </section>

        {/* ── Add form ── */}
        {showAddForm && (
          <section className="border rounded-xl p-4 space-y-3 bg-card">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">
                Add {addTarget === 'role' ? `Role Rule (${userRole})` : 'User Override'}
              </p>
              <button onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Scope Type</label>
                <Select value={addScopeType} onValueChange={v => { setAddScopeType(v as ScopeType); setAddValue(''); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SCOPE_LABELS) as ScopeType[]).map(t => (
                      <SelectItem key={t} value={t} className="text-xs">{SCOPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Value</label>
                {valueOptions.length > 0 ? (
                  <Select value={addValue} onValueChange={setAddValue}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {valueOptions.map(o => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <input
                    value={addValue}
                    onChange={e => setAddValue(e.target.value)}
                    placeholder={`Enter ${SCOPE_LABELS[addScopeType].toLowerCase()} value…`}
                    className="h-8 w-full text-xs border rounded px-2.5 bg-background"
                  />
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddForm(false)}>Cancel</Button>
              <Button size="sm" className="h-7 text-xs" disabled={!addValue || adding} onClick={handleAdd}>
                {adding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Add {addTarget === 'role' ? 'Role Rule' : 'User Override'}
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ScopeRow({ row, savingKey, onRemove }: { row: DataScopeRow; savingKey: string | null; onRemove: (id: string) => void }) {
  const Icon = SCOPE_ICONS[row.scope_type];
  const removing = savingKey === `scope:remove:${row.id}`;
  const isUserLevel = !!row.user_id;

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/60 bg-card">
      <div className={cn('h-6 w-6 rounded-md flex items-center justify-center shrink-0',
        isUserLevel ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
      )}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{row.scope_label ?? row.scope_value}</p>
        <p className="text-[10px] text-muted-foreground">{SCOPE_LABELS[row.scope_type]}</p>
      </div>
      <Badge className={cn('text-[9px] h-4 px-1.5 border-0 shrink-0',
        isUserLevel ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
      )}>
        {isUserLevel ? 'User' : 'Role'}
      </Badge>
      <button disabled={removing} onClick={() => onRemove(row.id)}
        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40">
        {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
