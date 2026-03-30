import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { X, ChevronDown, ChevronUp, Link2, Search, FileSpreadsheet, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { format, parseISO, isValid } from 'date-fns';

interface MmpResult {
  id: string;
  name: string;
  mmpId?: string;
  hub?: string;
  month?: string;
  year?: number;
}

interface SiteVisitResult {
  id: string;
  siteName: string;
  siteCode?: string;
  visitDate?: string;
  state?: string;
  locality?: string;
}

interface MmpRow {
  id: string;
  name: string;
  mmp_id?: string;
  hub?: string;
  month?: string;
  year?: number;
}

interface SiteVisitRow {
  id: string;
  site_name?: string;
  site_code?: string;
  visit_date?: string;
  state?: string;
  locality?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function searchMMPs(q: string): Promise<MmpResult[]> {
  const base = supabase
    .from('mmp_files')
    .select('id, name, mmp_id, hub, month, year')
    .not('status', 'eq', 'deleted')
    .limit(20);

  const { data, error } = q.trim()
    ? await base.or(`name.ilike.%${q.trim()}%,mmp_id.ilike.%${q.trim()}%`)
    : await base.order('created_at', { ascending: false });

  if (error) return [];
  return (data as MmpRow[] ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    mmpId: r.mmp_id,
    hub: r.hub,
    month: r.month,
    year: r.year,
  }));
}

async function searchSiteVisits(q: string): Promise<SiteVisitResult[]> {
  const trim = q.trim();

  if (!trim) {
    const { data } = await supabase
      .from('site_visits')
      .select('id, site_name, site_code, visit_date, state, locality')
      .order('created_at', { ascending: false })
      .limit(20);
    return (data as SiteVisitRow[] ?? []).map(rowToSv);
  }

  if (UUID_PATTERN.test(trim)) {
    const [byId, byName] = await Promise.all([
      supabase
        .from('site_visits')
        .select('id, site_name, site_code, visit_date, state, locality')
        .eq('id', trim)
        .limit(1),
      supabase
        .from('site_visits')
        .select('id, site_name, site_code, visit_date, state, locality')
        .or(`site_name.ilike.%${trim}%,site_code.ilike.%${trim}%`)
        .limit(20),
    ]);
    const seen = new Set<string>();
    return [...(byId.data as SiteVisitRow[] ?? []), ...(byName.data as SiteVisitRow[] ?? [])]
      .filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
      .map(rowToSv);
  }

  const { data } = await supabase
    .from('site_visits')
    .select('id, site_name, site_code, visit_date, state, locality')
    .or(`site_name.ilike.%${trim}%,site_code.ilike.%${trim}%`)
    .limit(20);
  return (data as SiteVisitRow[] ?? []).map(rowToSv);
}

function rowToSv(r: SiteVisitRow): SiteVisitResult {
  return {
    id: r.id,
    siteName: r.site_name || 'Unnamed Site',
    siteCode: r.site_code,
    visitDate: r.visit_date,
    state: r.state,
    locality: r.locality,
  };
}

async function fetchMmpLabels(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await supabase.from('mmp_files').select('id, name').in('id', ids);
  const map: Record<string, string> = {};
  for (const r of (data as { id: string; name: string }[] ?? [])) map[r.id] = r.name;
  return map;
}

async function fetchSvLabels(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await supabase.from('site_visits').select('id, site_name').in('id', ids);
  const map: Record<string, string> = {};
  for (const r of (data as { id: string; site_name?: string }[] ?? [])) map[r.id] = r.site_name || r.id;
  return map;
}

function formatVisitDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, 'dd MMM yyyy') : null;
  } catch {
    return null;
  }
}

function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

interface SearchDropdownProps<T> {
  placeholder: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  results: T[];
  isLoading: boolean;
  onSearch: (q: string) => void;
  searchValue: string;
  renderItem: (item: T) => React.ReactNode;
  getId: (item: T) => string;
  testPrefix: string;
}

function SearchDropdown<T>({
  placeholder,
  selectedIds,
  onToggle,
  results,
  isLoading,
  onSearch,
  searchValue,
  renderItem,
  getId,
  testPrefix,
}: SearchDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-8 h-8 text-sm"
          placeholder={placeholder}
          value={searchValue}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onSearch(e.target.value);
            setOpen(true);
          }}
          data-testid={`${testPrefix}-search-input`}
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-52 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No results found</div>
          ) : (
            results.map((item) => {
              const id = getId(item);
              const selected = selectedIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    'w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex items-center justify-between gap-2',
                    selected && 'bg-accent/50',
                  )}
                  onClick={() => onToggle(id)}
                  data-testid={`${testPrefix}-option-${id}`}
                >
                  <span className="flex-1 min-w-0">{renderItem(item)}</span>
                  {selected && <span className="text-primary font-bold flex-shrink-0">✓</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  relatedMMPs: string[];
  onRelatedMMPsChange: (ids: string[]) => void;
  relatedSiteVisits: string[];
  onRelatedSiteVisitsChange: (ids: string[]) => void;
}

export function LinkedEntitiesSection({
  relatedMMPs,
  onRelatedMMPsChange,
  relatedSiteVisits,
  onRelatedSiteVisitsChange,
}: Props) {
  const [expanded, setExpanded] = useState(relatedMMPs.length > 0 || relatedSiteVisits.length > 0);
  const [mmpSearch, setMmpSearch] = useState('');
  const [svSearch, setSvSearch] = useState('');
  const debouncedMmpSearch = useDebounce(mmpSearch);
  const debouncedSvSearch = useDebounce(svSearch);

  const [resolvedMmpLabels, setResolvedMmpLabels] = useState<Record<string, string>>({});
  const [resolvedSvLabels, setResolvedSvLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    const missing = relatedMMPs.filter((id) => !resolvedMmpLabels[id]);
    if (missing.length === 0) return;
    fetchMmpLabels(missing).then((map) =>
      setResolvedMmpLabels((prev) => ({ ...prev, ...map })),
    );
  }, [relatedMMPs.join(',')]);

  useEffect(() => {
    const missing = relatedSiteVisits.filter((id) => !resolvedSvLabels[id]);
    if (missing.length === 0) return;
    fetchSvLabels(missing).then((map) =>
      setResolvedSvLabels((prev) => ({ ...prev, ...map })),
    );
  }, [relatedSiteVisits.join(',')]);

  const mmpQuery = useQuery({
    queryKey: ['mmp_search', debouncedMmpSearch],
    queryFn: () => searchMMPs(debouncedMmpSearch),
    staleTime: 30_000,
  });

  const svQuery = useQuery({
    queryKey: ['sv_search', debouncedSvSearch],
    queryFn: () => searchSiteVisits(debouncedSvSearch),
    staleTime: 30_000,
  });

  const mmpResults: MmpResult[] = mmpQuery.data ?? [];
  const svResults: SiteVisitResult[] = svQuery.data ?? [];

  useEffect(() => {
    if (mmpResults.length > 0) {
      const newLabels: Record<string, string> = {};
      for (const m of mmpResults) newLabels[m.id] = m.name;
      setResolvedMmpLabels((prev) => ({ ...prev, ...newLabels }));
    }
  }, [mmpResults]);

  useEffect(() => {
    if (svResults.length > 0) {
      const newLabels: Record<string, string> = {};
      for (const sv of svResults) newLabels[sv.id] = sv.siteName;
      setResolvedSvLabels((prev) => ({ ...prev, ...newLabels }));
    }
  }, [svResults]);

  function toggleMmp(id: string) {
    if (relatedMMPs.includes(id)) {
      onRelatedMMPsChange(relatedMMPs.filter((x) => x !== id));
    } else {
      onRelatedMMPsChange([...relatedMMPs, id]);
    }
  }

  function toggleSv(id: string) {
    if (relatedSiteVisits.includes(id)) {
      onRelatedSiteVisitsChange(relatedSiteVisits.filter((x) => x !== id));
    } else {
      onRelatedSiteVisitsChange([...relatedSiteVisits, id]);
    }
  }

  const totalSelected = relatedMMPs.length + relatedSiteVisits.length;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        data-testid="button-toggle-linked-entities"
      >
        <span className="flex items-center gap-2 font-medium text-sm">
          <Link2 className="h-4 w-4 text-[#1D3461] dark:text-blue-400" />
          Linked MMPs &amp; Site Visits
          {totalSelected > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1">
              {totalSelected}
            </span>
          )}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="p-4 space-y-5">
          {/* MMPs */}
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              MMPs
            </p>

            {relatedMMPs.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {relatedMMPs.map((id) => {
                  const label = resolvedMmpLabels[id] ?? id;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-[#1D3461]/30 bg-[#0F2041]/5 dark:bg-[#1D3461]/20 px-2.5 py-0.5 text-xs text-[#1D3461] dark:text-blue-300"
                      data-testid={`chip-mmp-${id}`}
                    >
                      <span className="max-w-[180px] truncate">{label}</span>
                      <button
                        type="button"
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => toggleMmp(id)}
                        data-testid={`button-remove-mmp-${id}`}
                        aria-label={`Remove MMP ${label}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <SearchDropdown<MmpResult>
              placeholder="Search by name or code…"
              selectedIds={relatedMMPs}
              onToggle={toggleMmp}
              results={mmpResults}
              isLoading={mmpQuery.isFetching}
              onSearch={setMmpSearch}
              searchValue={mmpSearch}
              testPrefix="mmp"
              getId={(m) => m.id}
              renderItem={(m) => (
                <span className="flex flex-col">
                  <span className="font-medium truncate">{m.name}</span>
                  {(m.mmpId || m.hub || m.month) && (
                    <span className="text-muted-foreground">
                      {[m.mmpId, m.hub, m.month && m.year ? `${m.month} ${m.year}` : m.month].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              )}
            />
          </div>

          {/* Site Visits */}
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <MapPin className="h-3.5 w-3.5" />
              Site Visits
            </p>

            {relatedSiteVisits.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {relatedSiteVisits.map((id) => {
                  const label = resolvedSvLabels[id] ?? id;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-[#1D3461]/30 bg-[#0F2041]/5 dark:bg-[#1D3461]/20 px-2.5 py-0.5 text-xs text-[#1D3461] dark:text-blue-300"
                      data-testid={`chip-sv-${id}`}
                    >
                      <span className="max-w-[180px] truncate">{label}</span>
                      <button
                        type="button"
                        className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => toggleSv(id)}
                        data-testid={`button-remove-sv-${id}`}
                        aria-label={`Remove site visit ${label}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <SearchDropdown<SiteVisitResult>
              placeholder="Search by site name or site code…"
              selectedIds={relatedSiteVisits}
              onToggle={toggleSv}
              results={svResults}
              isLoading={svQuery.isFetching}
              onSearch={setSvSearch}
              searchValue={svSearch}
              testPrefix="sv"
              getId={(sv) => sv.id}
              renderItem={(sv) => (
                <span className="flex flex-col">
                  <span className="font-medium truncate">{sv.siteName}</span>
                  <span className="text-muted-foreground">
                    {[sv.siteCode, formatVisitDate(sv.visitDate), sv.locality, sv.state].filter(Boolean).join(' · ')}
                  </span>
                </span>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
