import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HUB_TAB_REGISTRY, hubTabSlug } from '@/lib/hub-tab-defs';
import { COLUMN_REGISTRY } from '@/lib/column-registry';
import { RoleBaselineAccess } from '@/types/roles';

export function RoleBaselineAccessEditor({ value, onChange, allowCostScope }: {
  value: RoleBaselineAccess;
  onChange: (value: RoleBaselineAccess) => void;
  allowCostScope: boolean;
}) {
  const tabs = value.tab_rules ?? [];
  const columns = value.column_rules ?? [];
  const scope = value.cost_scope;
  return <div className="space-y-6">
    <section className="space-y-3">
      <h3 className="font-semibold">Hidden tabs</h3>
      <p className="text-sm text-muted-foreground">Select tabs to hide by default for this role. Another assigned role may grant access; user overrides take precedence. The parent hub must also be accessible.</p>
      {HUB_TAB_REGISTRY.map(hub => <div key={hub.hubSlug} className="space-y-2 border rounded-md p-3">
        <h4 className="text-sm font-medium">{hub.hubLabel}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{hub.sections.flatMap(section => section.tabs).map(tab => {
          const slug = hubTabSlug(hub.hubSlug, tab.tabId);
          return <label key={slug} className="flex items-center gap-2 text-sm"><Checkbox checked={tabs.find(item => item.page_slug === slug)?.is_blocked ?? false} onCheckedChange={checked => onChange({ ...value, tab_rules: [...tabs.filter(item => item.page_slug !== slug), { page_slug: slug, is_blocked: !!checked }] })} />{tab.label}</label>;
        })}</div>
      </div>)}
    </section>
    <section className="space-y-3">
      <h3 className="font-semibold">Hidden columns</h3>
      <p className="text-sm text-muted-foreground">Selected columns are hidden by default for this role. Individual user overrides remain separate.</p>
      {COLUMN_REGISTRY.map(page => <div key={page.pageSlug} className="space-y-2 border rounded-md p-3">
        <h4 className="text-sm font-medium">{page.pageLabel}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{page.columns.map(column => {
          const rule = columns.find(item => item.page_slug === page.pageSlug && item.column_key === column.key);
          return <label key={column.key} className="flex items-center gap-2 text-sm"><Checkbox checked={rule?.is_hidden ?? false} onCheckedChange={checked => onChange({ ...value, column_rules: [...columns.filter(item => item !== rule), { page_slug: page.pageSlug, column_key: column.key, is_hidden: !!checked }] })} />{column.label}</label>;
        })}</div>
      </div>)}
    </section>
    <section className="space-y-3">
      <h3 className="font-semibold">Cost Submission data scope</h3>
      {allowCostScope ? <>
        <Label htmlFor="role-cost-scope">Visibility policy</Label>
        <select id="role-cost-scope" className="block w-full rounded-md border bg-background p-2 text-sm" value={scope?.mode ?? ''} onChange={event => onChange({ ...value, cost_scope: event.target.value ? { mode: event.target.value as NonNullable<RoleBaselineAccess['cost_scope']>['mode'], include_values: [], exclude_values: [] } : undefined })}>
          <option value="">Preserve existing / application default</option>
          <option value="role_default">Role default</option><option value="none">No data</option><option value="own">Own submissions</option><option value="assigned">Assigned hub / queue</option><option value="selected">Selected scope</option><option value="country">Country-wide</option><option value="organization">Organization-wide</option>
        </select>
        {(scope?.mode === 'selected' || scope?.mode === 'country') && (['include_values', 'exclude_values'] as const).map(key => <div key={key} className="space-y-2">
          <Label>{key === 'include_values' ? 'Included selectors' : 'Excluded selectors (win over includes)'}</Label>
          {scope[key].map((selector, index) => <div key={index} className="flex gap-2">
            <select aria-label="Scope type" className="rounded-md border bg-background text-sm" value={selector.type} onChange={event => onChange({ ...value, cost_scope: { ...scope, [key]: scope[key].map((item, i) => i === index ? { ...item, type: event.target.value } : item) } })}>{['hub', 'project', 'state', 'country'].map(type => <option key={type}>{type}</option>)}</select>
            <Input aria-label="Scope ID or value" placeholder="ID or value" value={selector.value} onChange={event => onChange({ ...value, cost_scope: { ...scope, [key]: scope[key].map((item, i) => i === index ? { ...item, value: event.target.value } : item) } })} />
            <Input aria-label="Scope label" placeholder="Label" value={selector.label} onChange={event => onChange({ ...value, cost_scope: { ...scope, [key]: scope[key].map((item, i) => i === index ? { ...item, label: event.target.value } : item) } })} />
            <button type="button" aria-label="Remove selector" onClick={() => onChange({ ...value, cost_scope: { ...scope, [key]: scope[key].filter((_, i) => i !== index) } })}>Remove</button>
          </div>)}
          <button type="button" className="text-sm underline" onClick={() => onChange({ ...value, cost_scope: { ...scope, [key]: [...scope[key], { type: scope.mode === 'country' ? 'country' : 'hub', value: '', label: '' }] } })}>Add selector</button>
        </div>)}
      </> : <p className="text-sm text-muted-foreground">A Super Admin can configure Cost Submission scope after creation. Existing scope is preserved.</p>}
    </section>
  </div>;
}
