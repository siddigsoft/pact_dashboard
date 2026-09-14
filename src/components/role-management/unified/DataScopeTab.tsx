import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Shield, Plus, X, Loader2, MapPin, FolderOpen, Building2, DollarSign, Info,
  Globe2, Save, RotateCcw, Check, Ban,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useSelectedUserAccess } from '@/context/role-management/SelectedUserAccessContext';
import {
  TabProps, DataScopeRow, DataScopePolicyMode, DataScopeResource, DataScopeSelector,
} from './types';

type ScopeType = 'hub' | 'project' | 'state' | 'country' | 'cost_center';
type ScopeOption = { value: string; label: string };

const SCOPE_ICONS: Record<string, any> = {
  hub: Building2, project: FolderOpen, state: MapPin, country: Globe2, cost_center: DollarSign,
};
const SCOPE_LABELS: Record<string, string> = {
  hub: 'Hub', project: 'Project', state: 'State / Region', country: 'Country', cost_center: 'Cost Center',
};
const POLICY_MODES: Array<{ value: DataScopePolicyMode; label: string; description: string }> = [
  { value: 'role_default', label: 'Role Default', description: 'Inherit the role’s Cost Submission policy.' },
  { value: 'none', label: 'No Data', description: 'Do not show Cost Submissions to this principal.' },
  { value: 'own', label: 'Own', description: 'Only submissions created by the user.' },
  { value: 'assigned', label: 'Assigned Hub / Queue', description: 'Submissions routed through the user’s primary or secondary assigned hub.' },
  { value: 'selected', label: 'Selected Scope', description: 'Limit by the selected hubs, projects, states, or countries.' },
  { value: 'country', label: 'Country-wide', description: 'All Cost Submissions in the selected country.' },
  { value: 'organization', label: 'Organization-wide', description: 'All organization Cost Submissions.' },
];
const SUDAN_STATES = [
  'Khartoum', 'Omdurman', 'Kassala', 'Gedarif', 'Port Sudan', 'Atbara',
  'Al Qadarif', 'Wad Madani', 'Al Fasher', 'Nyala', 'El Obeid', 'Rabak',
  'Sennar', 'Damazin', 'Ed Daein', 'Kadugli', 'Dilling', 'Geneina',
  'Zalingei', 'Ed Damazin', 'Dongola', 'Berber', 'Malakal',
];

export function DataScopeTab({ userId, userRole, isSelectedSuperAdmin }: TabProps) {
  const {
    loading: dataLoading, savingKey, dataScopeRows, scopePreview, scopePreviewError,
    upsertDataScope, replaceCostSubmissionPolicy, removeDataScope,
  } = useSelectedUserAccess();
  const [resource, setResource] = useState<DataScopeResource>('operational_cost_submissions');
  const [hubOptions, setHubOptions] = useState<ScopeOption[]>([]);
  const [projectOptions, setProjectOptions] = useState<ScopeOption[]>([]);
  const [stateOptions, setStateOptions] = useState<ScopeOption[]>(
    SUDAN_STATES.map(value => ({ value, label: value })),
  );
  const [countryOptions, setCountryOptions] = useState<ScopeOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [target, setTarget] = useState<'user' | 'role'>('user');
  const [policyMode, setPolicyMode] = useState<DataScopePolicyMode>('role_default');
  const [scopeType, setScopeType] = useState<ScopeType>('hub');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [draftIncludes, setDraftIncludes] = useState<DataScopeSelector[]>([]);
  const [draftExcludes, setDraftExcludes] = useState<DataScopeSelector[]>([]);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [showLegacyAdd, setShowLegacyAdd] = useState(false);
  const [legacyTarget, setLegacyTarget] = useState<'user' | 'role'>('user');
  const [legacyScopeType, setLegacyScopeType] = useState<ScopeType>('hub');
  const [legacyValue, setLegacyValue] = useState('');
  const [addingLegacy, setAddingLegacy] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      setOptionsLoading(true);
      const db = supabase as any;
      try {
        const [hubRes, projectRes, stateRes, countryRes] = await Promise.all([
          db.from('hubs').select('id, name').order('name'),
          db.from('projects').select('id, name').eq('status', 'active').order('name').limit(200),
          db.from('states').select('id, name').order('name'),
          db.from('countries').select('id, name_en, name').eq('is_active', true).order('name_en'),
        ]);
        setHubOptions((hubRes.data ?? []).map((row: any) => ({ value: row.id, label: row.name ?? row.id })));
        setProjectOptions((projectRes.data ?? []).map((row: any) => ({ value: row.id, label: row.name ?? row.id })));
        if (stateRes.data?.length) {
          setStateOptions(stateRes.data.map((row: any) => ({ value: row.id ?? row.name, label: row.name ?? row.id })));
        }
        setCountryOptions((countryRes.data ?? []).map((row: any) => ({
          value: row.id, label: row.name_en ?? row.name ?? row.id,
        })));
      } finally {
        setOptionsLoading(false);
      }
    }
    loadOptions();
  }, []);

  const userRows = dataScopeRows.filter(row => row.user_id === userId);
  const roleRows = dataScopeRows.filter(row => row.role === userRole && !row.user_id);
  const costRows = dataScopeRows.filter(row => row.resource === 'operational_cost_submissions');
  const legacyRows = dataScopeRows.filter(row => !row.resource || row.resource === 'legacy');
  const costUserRows = costRows.filter(row => row.user_id === userId);
  const costRoleRows = costRows.filter(row => row.role === userRole && !row.user_id);
  const effectiveCostRows = costUserRows.length > 0 ? costUserRows : costRoleRows;

  // The SQL contract stores one policy row with complete JSON selector arrays.
  // Rehydrate the draft whenever the target changes (or the provider refreshes).
  useEffect(() => {
    const row = target === 'user' ? costUserRows[0] : costRoleRows[0];
    setPolicyMode(row?.mode ?? 'role_default');
    setDraftIncludes(row?.include_values ?? []);
    setDraftExcludes(row?.exclude_values ?? []);
    setSelectedValues([]);
  }, [target, userId, userRole, costUserRows[0]?.id, costRoleRows[0]?.id]);

  const valueOptions = scopeType === 'hub' ? hubOptions
    : scopeType === 'project' ? projectOptions
      : scopeType === 'state' ? stateOptions
        : scopeType === 'country' ? countryOptions : [];
  const legacyValueOptions = legacyScopeType === 'hub' ? hubOptions
    : legacyScopeType === 'project' ? projectOptions
      : legacyScopeType === 'state' ? stateOptions : [];

  const selectedMode = POLICY_MODES.find(mode => mode.value === policyMode);
  const effectiveSummary = useMemo(() => {
    if (!effectiveCostRows.length) return 'No Cost Submission policy saved — using the application default.';
    const includes = effectiveCostRows.flatMap(row => row.include_values ?? []);
    const excludes = effectiveCostRows.flatMap(row => row.exclude_values ?? []);
    const first = effectiveCostRows[0];
    const mode = POLICY_MODES.find(item => item.value === first.mode)?.label ?? 'Selected Scope';
    return `${mode}${includes.length ? ` · ${includes.length} included rule${includes.length === 1 ? '' : 's'}` : ''}${excludes.length ? ` · ${excludes.length} exclusion${excludes.length === 1 ? '' : 's'} (wins)` : ''}`;
  }, [effectiveCostRows]);

  function resetPolicy() {
    setTarget('user');
    setPolicyMode('role_default');
    setScopeType('hub');
    setSelectedValues([]);
    setDraftIncludes([]);
    setDraftExcludes([]);
  }

  function addDraftSelectors(exclusion: boolean) {
    const selected = valueOptions.filter(option => selectedValues.includes(option.value))
      .map(option => ({ type: scopeType as DataScopeSelector['type'], value: option.value, label: option.label }));
    if (!selected.length) return;
    const setter = exclusion ? setDraftExcludes : setDraftIncludes;
    setter(current => [...current, ...selected.filter(item => !current.some(existing => existing.type === item.type && existing.value === item.value))]);
    setSelectedValues([]);
  }

  function removeDraftSelector(exclusion: boolean, selector: DataScopeSelector) {
    const setter = exclusion ? setDraftExcludes : setDraftIncludes;
    setter(current => current.filter(item => !(item.type === selector.type && item.value === selector.value)));
  }

  async function savePolicy() {
    setSavingPolicy(true);
    try {
      const selectorsEnabled = policyMode === 'selected' || policyMode === 'country';
      await replaceCostSubmissionPolicy(
        target,
        policyMode,
        selectorsEnabled ? draftIncludes : [],
        selectorsEnabled ? draftExcludes : [],
      );
    } finally {
      setSavingPolicy(false);
    }
  }

  async function addLegacyRule() {
    if (!legacyValue) return;
    setAddingLegacy(true);
    const label = legacyValueOptions.find(option => option.value === legacyValue)?.label ?? legacyValue;
    await upsertDataScope(legacyScopeType, legacyValue, label, legacyTarget);
    setLegacyValue('');
    setAddingLegacy(false);
    setShowLegacyAdd(false);
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
    return <div className="p-5 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="mx-5 mt-4 flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs dark:bg-blue-900/20 dark:border-blue-800/30 dark:text-blue-300">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div><span className="font-semibold">Exclusions always win.</span> User overrides take precedence over role defaults. Save a policy to update the effective Cost Submission scope and preview count.</div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <section className="rounded-xl border bg-card p-4 space-y-4">
          <div>
            <label htmlFor="scope-resource" className="text-xs font-semibold block">Resource</label>
            <p className="text-[10px] text-muted-foreground mt-0.5">Choose which records this policy protects.</p>
          </div>
            <Select value={resource} onValueChange={value => setResource(value as DataScopeResource)}>
            <SelectTrigger id="scope-resource" className="h-9 text-xs" aria-label="Data scope resource">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="operational_cost_submissions" className="text-xs">Cost Submission</SelectItem>
              <SelectItem value="legacy" className="text-xs">Other resources (legacy rules)</SelectItem>
            </SelectContent>
          </Select>
        </section>

        {resource === 'operational_cost_submissions' ? (
          <>
            <section className="rounded-xl border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-semibold">Cost Submission policy</p><p className="text-[10px] text-muted-foreground">Set a role default or a user override.</p></div>
                <Badge variant="outline" className="text-[9px]">{target === 'role' ? 'Role default' : 'User override'}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="scope-target" className="text-[10px] text-muted-foreground mb-1 block">Applies to</label>
                  <Select value={target} onValueChange={value => setTarget(value as 'user' | 'role')}>
                    <SelectTrigger id="scope-target" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="user" className="text-xs">User override</SelectItem><SelectItem value="role" className="text-xs">Role default ({userRole})</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="scope-policy-mode" className="text-[10px] text-muted-foreground mb-1 block">Policy mode</label>
                  <Select value={policyMode} onValueChange={value => { setPolicyMode(value as DataScopePolicyMode); setSelectedValues([]); }}>
                    <SelectTrigger id="scope-policy-mode" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{POLICY_MODES.map(mode => <SelectItem key={mode.value} value={mode.value} className="text-xs">{mode.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">{selectedMode?.description}</p>

              {(policyMode === 'selected' || policyMode === 'country') && (
                <div className="space-y-2">
                  <label htmlFor="scope-dimension" className="text-[10px] text-muted-foreground block">Scope dimension</label>
                  <Select value={scopeType} onValueChange={value => { setScopeType(value as ScopeType); setSelectedValues([]); }}>
                    <SelectTrigger id="scope-dimension" className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(policyMode === 'country' ? ['country'] : ['hub', 'project', 'state', 'country']).map(type => (
                        <SelectItem key={type} value={type} className="text-xs">{SCOPE_LABELS[type]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {optionsLoading ? <p className="text-[10px] text-muted-foreground">Loading available {SCOPE_LABELS[scopeType].toLowerCase()}s…</p> : valueOptions.length ? (
                    <div role="group" aria-label={`Select ${SCOPE_LABELS[scopeType].toLowerCase()} scope`} className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1">
                      {valueOptions.map(option => {
                        const checked = selectedValues.includes(option.value);
                        return <label key={option.value} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted cursor-pointer">
                          <input type="checkbox" checked={checked} onChange={() => setSelectedValues(current => checked ? current.filter(value => value !== option.value) : [...current, option.value])} className="h-3.5 w-3.5 rounded border-input accent-primary" />
                          <span>{option.label}</span>
                        </label>;
                      })}
                    </div>
                  ) : <p className="text-[10px] text-muted-foreground border rounded p-2">No {SCOPE_LABELS[scopeType].toLowerCase()} options are available.</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" disabled={!selectedValues.length} onClick={() => addDraftSelectors(false)}>
                      <Check className="h-3 w-3 mr-1" />Add to include
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" disabled={!selectedValues.length} onClick={() => addDraftSelectors(true)}>
                      <Ban className="h-3 w-3 mr-1" />Add to exclusion
                    </Button>
                  </div>
                  <SelectorChips title="Included" selectors={draftIncludes} onRemove={selector => removeDraftSelector(false, selector)} />
                  <SelectorChips title="Excluded" selectors={draftExcludes} onRemove={selector => removeDraftSelector(true, selector)} exclusion />
                </div>
              )}

              <p className="text-[10px] text-muted-foreground">Add selectors to the include or exclusion chips above. Exclusions always win and are saved with the same policy atomically.</p>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={resetPolicy}><RotateCcw className="h-3 w-3 mr-1" />Reset</Button>
                <Button type="button" size="sm" className="h-8 text-xs" disabled={savingPolicy || ((policyMode === 'selected' || policyMode === 'country') && !draftIncludes.length && !draftExcludes.length)} onClick={savePolicy}>
                  {savingPolicy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}Save policy
                </Button>
              </div>
            </section>

            <section className="rounded-xl border bg-muted/20 p-4">
              <p className="text-xs font-semibold">Effective Cost Submission scope</p>
              <p className="text-xs mt-1">{effectiveSummary}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{costUserRows.length ? 'User override is active.' : 'Role default is active.'}</p>
              {scopePreview && <p className="mt-2 text-xs font-medium text-primary" role="status">Preview: {scopePreview.count == null ? 'count unavailable' : `${scopePreview.count.toLocaleString()} matching submission${scopePreview.count === 1 ? '' : 's'}`}</p>}
              {scopePreviewError && <p className="mt-2 text-[10px] text-destructive" role="alert">{scopePreviewError}</p>}
            </section>
            <PolicyRows rows={costRows} savingKey={savingKey} onRemove={removeDataScope} />
          </>
        ) : (
          <LegacyScopeEditor
            rows={legacyRows}
            userId={userId}
            userRole={userRole}
            userRows={userRows}
            roleRows={roleRows}
            showAddForm={showLegacyAdd}
            setShowAddForm={setShowLegacyAdd}
            target={legacyTarget}
            setTarget={setLegacyTarget}
            scopeType={legacyScopeType}
            setScopeType={setLegacyScopeType}
            value={legacyValue}
            setValue={setLegacyValue}
            valueOptions={legacyValueOptions}
            adding={addingLegacy}
            onAdd={addLegacyRule}
            savingKey={savingKey}
            onRemove={removeDataScope}
          />
        )}
      </div>
    </div>
  );
}

function SelectorChips({ title, selectors, onRemove, exclusion = false }: {
  title: string;
  selectors: DataScopeSelector[];
  onRemove: (selector: DataScopeSelector) => void;
  exclusion?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5 min-h-6">
        {selectors.length ? selectors.map(selector => (
          <Badge key={`${selector.type}:${selector.value}`} variant="outline" className={cn('gap-1 text-[10px]', exclusion && 'border-destructive/50 text-destructive')}>
            {selector.label}
            <button type="button" aria-label={`Remove ${selector.label} from ${title.toLowerCase()} selectors`} onClick={() => onRemove(selector)} className="rounded-full hover:bg-muted">
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        )) : <span className="text-[10px] text-muted-foreground">None</span>}
      </div>
    </div>
  );
}

function PolicyRows({ rows, savingKey, onRemove }: { rows: DataScopeRow[]; savingKey: string | null; onRemove: (id: string) => void }) {
  if (!rows.length) return <div className="text-center py-5 text-xs text-muted-foreground border border-dashed rounded-xl">No Cost Submission policy rules saved.</div>;
  return <div className="space-y-1.5"><p className="text-xs font-semibold">Saved policy rules</p>{rows.map(row => {
    const mode = POLICY_MODES.find(item => item.value === row.mode)?.label ?? row.scope_label ?? row.scope_value;
    return <div key={row.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
      <div className="min-w-0 flex-1"><p className="text-xs font-medium truncate">{mode}</p><p className="text-[10px] text-muted-foreground truncate">{row.user_id ? 'User override' : 'Role default'}</p><div className="flex flex-wrap gap-1 mt-1">{(row.include_values ?? []).map(selector => <Badge key={`i:${selector.type}:${selector.value}`} variant="outline" className="text-[9px]">{selector.label}</Badge>)}{(row.exclude_values ?? []).map(selector => <Badge key={`e:${selector.type}:${selector.value}`} variant="outline" className="text-[9px] border-destructive/50 text-destructive">Exclude: {selector.label}</Badge>)}</div></div>
      <Badge variant="outline" className="text-[9px]">{row.user_id ? 'User' : 'Role'}</Badge>
      <button type="button" aria-label={`Remove ${mode} rule`} disabled={savingKey === `scope:remove:${row.id}`} onClick={() => onRemove(row.id)} className="text-muted-foreground hover:text-destructive disabled:opacity-40">{savingKey === `scope:remove:${row.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}</button>
    </div>;
  })}</div>;
}

function LegacyScopeEditor(props: {
  rows: DataScopeRow[]; userId: string; userRole: string; userRows: DataScopeRow[]; roleRows: DataScopeRow[];
  showAddForm: boolean; setShowAddForm: (value: boolean) => void; target: 'user' | 'role'; setTarget: (value: 'user' | 'role') => void;
  scopeType: ScopeType; setScopeType: (value: ScopeType) => void; value: string; setValue: (value: string) => void;
  valueOptions: ScopeOption[]; adding: boolean; onAdd: () => void; savingKey: string | null; onRemove: (id: string) => void;
}) {
  const { rows, showAddForm, setShowAddForm, target, setTarget, scopeType, setScopeType, value, setValue, valueOptions, adding, onAdd, savingKey, onRemove } = props;
  return <section className="space-y-4">
    <div className="flex items-center justify-between"><div><p className="text-xs font-semibold">Legacy generic scope rules</p><p className="text-[10px] text-muted-foreground">Existing hub, project, state, and cost center rows are preserved.</p></div><Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => setShowAddForm(true)}><Plus className="h-3 w-3" />Add rule</Button></div>
    {!rows.length ? <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-xl">No legacy scope rules.</div> : <div className="space-y-1.5">{rows.map(row => <ScopeRow key={row.id} row={row} savingKey={savingKey} onRemove={onRemove} />)}</div>}
    {showAddForm && <div className="border rounded-xl p-4 space-y-3 bg-card"><div className="flex justify-between"><p className="text-xs font-semibold">Add legacy scope rule</p><button type="button" aria-label="Close add scope form" onClick={() => setShowAddForm(false)}><X className="h-3.5 w-3.5" /></button></div><div className="grid grid-cols-2 gap-3"><div><label className="text-[10px] text-muted-foreground mb-1 block">Applies to</label><Select value={target} onValueChange={v => setTarget(v as 'user' | 'role')}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user" className="text-xs">User override</SelectItem><SelectItem value="role" className="text-xs">Role default</SelectItem></SelectContent></Select></div><div><label className="text-[10px] text-muted-foreground mb-1 block">Scope type</label><Select value={scopeType} onValueChange={v => { setScopeType(v as ScopeType); setValue(''); }}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{(['hub', 'project', 'state', 'cost_center'] as ScopeType[]).map(type => <SelectItem key={type} value={type} className="text-xs">{SCOPE_LABELS[type]}</SelectItem>)}</SelectContent></Select></div></div>{valueOptions.length ? <Select value={value} onValueChange={setValue}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select value…" /></SelectTrigger><SelectContent>{valueOptions.map(option => <SelectItem key={option.value} value={option.value} className="text-xs">{option.label}</SelectItem>)}</SelectContent></Select> : <input aria-label="Scope value" value={value} onChange={event => setValue(event.target.value)} placeholder={`Enter ${SCOPE_LABELS[scopeType].toLowerCase()} value…`} className="h-8 w-full text-xs border rounded px-2.5 bg-background" />}<div className="flex justify-end gap-2"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddForm(false)}>Cancel</Button><Button size="sm" className="h-7 text-xs" disabled={!value || adding} onClick={onAdd}>{adding && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Add rule</Button></div></div>}
  </section>;
}

function ScopeRow({ row, savingKey, onRemove }: { row: DataScopeRow; savingKey: string | null; onRemove: (id: string) => void }) {
  const Icon = SCOPE_ICONS[row.scope_type] ?? DatabaseIcon;
  const removing = savingKey === `scope:remove:${row.id}`;
  return <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/60 bg-card"><div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-blue-100 text-blue-700"><Icon className="h-3 w-3" /></div><div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{row.scope_label ?? row.scope_value}</p><p className="text-[10px] text-muted-foreground">{SCOPE_LABELS[row.scope_type] ?? row.scope_type}</p></div><Badge className={cn('text-[9px] h-4 px-1.5 border-0 shrink-0', row.user_id ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}>{row.user_id ? 'User' : 'Role'}</Badge><button type="button" aria-label={`Remove ${row.scope_label ?? row.scope_value}`} disabled={removing} onClick={() => onRemove(row.id)} className="text-muted-foreground hover:text-destructive disabled:opacity-40">{removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}</button></div>;
}

function DatabaseIcon(props: { className?: string }) {
  return <DollarSign {...props} />;
}