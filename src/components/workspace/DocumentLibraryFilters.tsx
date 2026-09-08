import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/workspaceDocuments';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock } from 'lucide-react';

export interface LibraryFilters {
  category: DocumentCategory | 'all';
  project: string;
  site: string;
  period: string;
  adminOnly: boolean;
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  category: 'all', project: '', site: '', period: '', adminOnly: false,
};

export function DocumentLibraryFilters({
  value, onChange, isAdmin, counts, projects, sites, resultCount,
}: {
  value: LibraryFilters;
  onChange: (value: LibraryFilters) => void;
  isAdmin: boolean;
  counts: Partial<Record<DocumentCategory | 'all', number>>;
  projects: string[];
  sites: string[];
  resultCount: number;
}) {
  const tabs = (Object.entries({ all: 'All', ...DOCUMENT_CATEGORIES }) as [DocumentCategory | 'all', string][])
    .filter(([key]) => isAdmin || !['site_permit', 'payment_receipt', 'site_image', 'mmp'].includes(key));
  const active = value.category !== 'all' || value.project || value.site || value.period || value.adminOnly;
  const projectSites = value.project
    ? sites // caller already scopes sites when project set; keep simple list
    : sites;

  return (
    <section aria-label="Document library filters" className="px-4 sm:px-8 py-3 space-y-3 border-b border-border bg-card/40">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5" role="tablist" aria-label="Document categories">
        {tabs.map(([key, label]) => {
          const n = counts[key] ?? 0;
          const selected = value.category === key;
          return (
            <Button
              key={key}
              size="sm"
              variant={selected ? 'secondary' : 'outline'}
              className="h-auto min-h-9 flex-col items-stretch gap-0.5 py-1.5 px-2"
              aria-pressed={selected}
              onClick={() => onChange({ ...value, category: key, site: key === 'site_image' ? value.site : value.site })}
            >
              <span className="text-xs font-medium leading-tight truncate">{label}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{n}</span>
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select
          value={value.project || '__all__'}
          onValueChange={(v) => onChange({ ...value, project: v === '__all__' ? '' : v, site: '' })}
        >
          <SelectTrigger className="h-9 w-[180px] text-xs" aria-label="Filter by project">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All projects</SelectItem>
            {projects.map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select
          value={value.site || '__all__'}
          onValueChange={(v) => onChange({ ...value, site: v === '__all__' ? '' : v })}
        >
          <SelectTrigger className="h-9 w-[180px] text-xs" aria-label="Filter by site">
            <SelectValue placeholder="All sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All sites</SelectItem>
            {projectSites.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input
          aria-label="Reporting period"
          type="month"
          className="h-9 w-44 text-xs"
          value={value.period}
          onChange={(e) => onChange({ ...value, period: e.target.value })}
        />

        {isAdmin && (
          <Button
            variant={value.adminOnly ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={value.adminOnly}
            onClick={() => onChange({ ...value, adminOnly: !value.adminOnly })}
          >
            <Lock className="h-3.5 w-3.5 mr-1.5" />Admin only
          </Button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">Showing {resultCount}</span>
        {active && (
          <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_LIBRARY_FILTERS)}>
            Clear filters
          </Button>
        )}
      </div>
    </section>
  );
}
