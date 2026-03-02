import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, X, FileText, MapPin, Tag, Building2, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MmpOption {
  id: string;
  label: string;
  count?: number;
}

export interface MmpFilterBarProps {
  mmpOptions: MmpOption[];
  mmpFilter: string;
  onMmpFilterChange: (value: string) => void;

  statusOptions?: string[];
  statusFilter?: string;
  onStatusFilterChange?: (value: string) => void;

  hubOptions?: string[];
  hubFilter?: string;
  onHubFilterChange?: (value: string) => void;

  stateOptions?: string[];
  stateFilter?: string;
  onStateFilterChange?: (value: string) => void;

  localityOptions?: string[];
  localityFilter?: string;
  onLocalityFilterChange?: (value: string) => void;

  totalCount?: number;
  filteredCount?: number;

  onClearAll: () => void;
  className?: string;
  title?: string;
}

export function MmpFilterBar({
  mmpOptions,
  mmpFilter,
  onMmpFilterChange,
  statusOptions,
  statusFilter = 'all',
  onStatusFilterChange,
  hubOptions,
  hubFilter = 'all',
  onHubFilterChange,
  stateOptions,
  stateFilter = 'all',
  onStateFilterChange,
  localityOptions,
  localityFilter = 'all',
  onLocalityFilterChange,
  totalCount,
  filteredCount,
  onClearAll,
  className,
  title = 'Filter Sites by MMP',
}: MmpFilterBarProps) {
  const activeFilters = [
    mmpFilter !== 'all',
    statusFilter !== 'all',
    hubFilter !== 'all',
    stateFilter !== 'all',
    localityFilter !== 'all',
  ].filter(Boolean).length;

  const isFiltered = activeFilters > 0;
  const selectedMmp = mmpOptions.find(m => m.id === mmpFilter);

  if (mmpOptions.length === 0) return null;

  return (
    <div className={cn('mb-4 rounded-xl overflow-hidden border border-blue-200 shadow-md', className)}>

      {/* ── Gradient header ──────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#4A90E2] to-[#2E5C8A] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <SlidersHorizontal className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white font-semibold text-sm">{title}</span>
            {isFiltered && totalCount !== undefined && filteredCount !== undefined && (
              <span className="text-white/70 text-xs">
                — {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} sites
              </span>
            )}
          </div>
          {activeFilters > 0 && (
            <Badge className="bg-white/25 text-white border-0 text-xs px-2 py-0.5 ml-1">
              {activeFilters} active
            </Badge>
          )}
        </div>

        {isFiltered && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-7 text-xs text-white hover:bg-white/20 hover:text-white border border-white/30 rounded-lg gap-1"
          >
            <X className="h-3 w-3" />
            Clear All
          </Button>
        )}
      </div>

      {/* ── Filter strip ─────────────────────────────────────────────── */}
      <div className="bg-[#F0F7FF] px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2.5">

          {/* MMP selector */}
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-[#4A90E2] flex-shrink-0" />
            <Select value={mmpFilter} onValueChange={onMmpFilterChange}>
              <SelectTrigger
                className="h-8 text-xs bg-[#F8FAFF] border-[#EDF2F7] focus:border-[#4A90E2] focus:ring-1 focus:ring-[#4A90E2]/30 w-[220px] rounded-lg"
                data-testid="select-mmp-filter"
              >
                <SelectValue placeholder="All MMPs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All MMPs {totalCount !== undefined ? `(${totalCount.toLocaleString()} sites)` : `(${mmpOptions.length})`}
                </SelectItem>
                {mmpOptions.map(mmp => (
                  <SelectItem key={mmp.id} value={mmp.id}>
                    {mmp.label}{mmp.count !== undefined ? ` — ${mmp.count} sites` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status filter */}
          {statusOptions && statusOptions.length > 0 && onStatusFilterChange && (
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-[#4A90E2] flex-shrink-0" />
              <Select value={statusFilter} onValueChange={onStatusFilterChange}>
                <SelectTrigger
                  className="h-8 text-xs bg-[#F8FAFF] border-[#EDF2F7] focus:border-[#4A90E2] focus:ring-1 focus:ring-[#4A90E2]/30 w-[150px] rounded-lg"
                  data-testid="select-status-filter"
                >
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statusOptions.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Hub filter */}
          {hubOptions && hubOptions.length > 0 && onHubFilterChange && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-[#4A90E2] flex-shrink-0" />
              <Select value={hubFilter} onValueChange={onHubFilterChange}>
                <SelectTrigger
                  className="h-8 text-xs bg-[#F8FAFF] border-[#EDF2F7] focus:border-[#4A90E2] focus:ring-1 focus:ring-[#4A90E2]/30 w-[150px] rounded-lg"
                  data-testid="select-hub-filter"
                >
                  <SelectValue placeholder="All Hubs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hubs</SelectItem>
                  {hubOptions.map(h => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* State filter */}
          {stateOptions && stateOptions.length > 0 && onStateFilterChange && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-[#4A90E2] flex-shrink-0" />
              <Select value={stateFilter} onValueChange={onStateFilterChange}>
                <SelectTrigger
                  className="h-8 text-xs bg-[#F8FAFF] border-[#EDF2F7] focus:border-[#4A90E2] focus:ring-1 focus:ring-[#4A90E2]/30 w-[150px] rounded-lg"
                  data-testid="select-state-filter"
                >
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {stateOptions.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Locality filter */}
          {localityOptions !== undefined && onLocalityFilterChange && (
            <div className="flex items-center gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5 text-[#4A90E2] flex-shrink-0" />
              <Select
                value={localityFilter}
                onValueChange={onLocalityFilterChange}
                disabled={stateFilter === 'all'}
              >
                <SelectTrigger
                  className="h-8 text-xs bg-[#F8FAFF] border-[#EDF2F7] focus:border-[#4A90E2] focus:ring-1 focus:ring-[#4A90E2]/30 w-[150px] rounded-lg disabled:opacity-50"
                  data-testid="select-locality-filter"
                >
                  <SelectValue placeholder={stateFilter === 'all' ? 'Select State First' : 'All Localities'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Localities</SelectItem>
                  {localityOptions.map(l => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* ── Active filter chips ───────────────────────────────────── */}
        {isFiltered && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {mmpFilter !== 'all' && selectedMmp && (
              <span className="inline-flex items-center gap-1 bg-[#4A90E2]/10 border border-[#4A90E2]/30 text-[#4A90E2] text-xs rounded-full px-2.5 py-0.5 font-medium">
                <FileText className="h-3 w-3" />
                {selectedMmp.label}
                <button type="button" onClick={() => onMmpFilterChange('all')} className="ml-0.5 hover:text-blue-800">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-[#4A90E2]/10 border border-[#4A90E2]/30 text-[#4A90E2] text-xs rounded-full px-2.5 py-0.5 font-medium">
                <Tag className="h-3 w-3" />
                {statusFilter}
                <button type="button" onClick={() => onStatusFilterChange?.('all')} className="ml-0.5 hover:text-blue-800">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {hubFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-[#4A90E2]/10 border border-[#4A90E2]/30 text-[#4A90E2] text-xs rounded-full px-2.5 py-0.5 font-medium">
                <Building2 className="h-3 w-3" />
                {hubFilter}
                <button type="button" onClick={() => onHubFilterChange?.('all')} className="ml-0.5 hover:text-blue-800">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {stateFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-[#4A90E2]/10 border border-[#4A90E2]/30 text-[#4A90E2] text-xs rounded-full px-2.5 py-0.5 font-medium">
                <MapPin className="h-3 w-3" />
                {stateFilter}
                <button type="button" onClick={() => onStateFilterChange?.('all')} className="ml-0.5 hover:text-blue-800">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {localityFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-[#4A90E2]/10 border border-[#4A90E2]/30 text-[#4A90E2] text-xs rounded-full px-2.5 py-0.5 font-medium">
                <LayoutGrid className="h-3 w-3" />
                {localityFilter}
                <button type="button" onClick={() => onLocalityFilterChange?.('all')} className="ml-0.5 hover:text-blue-800">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Result summary bar ────────────────────────────────────────── */}
      {isFiltered && (
        <div className="bg-[#4A90E2]/8 border-t border-blue-100 px-4 py-1.5 flex items-center gap-2">
          <Filter className="h-3 w-3 text-[#4A90E2]" />
          <span className="text-xs text-[#4A90E2] font-medium">
            {filteredCount !== undefined && totalCount !== undefined
              ? `Showing ${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()} sites · ${activeFilters} filter${activeFilters > 1 ? 's' : ''} applied`
              : `${activeFilters} filter${activeFilters > 1 ? 's' : ''} applied`}
          </span>
        </div>
      )}
    </div>
  );
}
