import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/workspaceDocuments';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';

export interface LibraryFilters {
  category: DocumentCategory | 'all'; project: string; site: string; period: string; adminOnly: boolean;
}
export const EMPTY_LIBRARY_FILTERS: LibraryFilters = { category: 'all', project: '', site: '', period: '', adminOnly: false };
export function DocumentLibraryFilters({ value, onChange, isAdmin }: {
  value: LibraryFilters; onChange: (value: LibraryFilters) => void; isAdmin: boolean;
}) {
  const active = value.category !== 'all' || value.project || value.site || value.period || value.adminOnly;
  return <section aria-label="Document library filters" className="px-4 sm:px-8 py-3 space-y-3 border-b border-border">
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Document categories">
      {Object.entries({ all: 'All documents', ...DOCUMENT_CATEGORIES }).filter(([key]) =>
        isAdmin || !['site_permit', 'payment_receipt', 'site_image', 'mmp'].includes(key)
      ).map(([key, label]) => <Button key={key} size="sm" variant={value.category === key ? 'secondary' : 'ghost'}
        aria-pressed={value.category === key} onClick={() => onChange({ ...value, category: key as LibraryFilters['category'] })}>{label}</Button>)}
    </div>
    <div className="flex flex-wrap gap-2 items-center">
      <Input aria-label="Filter by project" placeholder="Project" className="h-9 w-40" value={value.project} onChange={e => onChange({ ...value, project: e.target.value })} />
      <Input aria-label="Filter by site" placeholder="Site" className="h-9 w-40" value={value.site} onChange={e => onChange({ ...value, site: e.target.value })} />
      <Input aria-label="Reporting period" type="month" className="h-9 w-44" value={value.period} onChange={e => onChange({ ...value, period: e.target.value })} />
      {isAdmin && <Button variant={value.adminOnly ? 'secondary' : 'outline'} size="sm" aria-pressed={value.adminOnly}
        onClick={() => onChange({ ...value, adminOnly: !value.adminOnly })}><Lock className="h-3.5 w-3.5 mr-1.5" />Admin only</Button>}
      {active && <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_LIBRARY_FILTERS)}>Clear filters</Button>}
    </div>
  </section>;
}
