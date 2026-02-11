import { useState, useMemo, useRef, useEffect } from 'react';
import { FileText, Check, X, ChevronDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useDashboardMmpFilter } from '@/context/dashboard/DashboardMmpFilterContext';
import { format } from 'date-fns';

export function MmpGlobalFilter() {
  const {
    selectedMmpIds,
    toggleMmpId,
    clearSelection,
    selectAll,
    isFiltering,
    availableMmps,
    selectedMmps,
  } = useDashboardMmpFilter();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredMmps = useMemo(() => {
    if (!search.trim()) return availableMmps;
    const q = search.toLowerCase();
    return availableMmps.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.hub || '').toLowerCase().includes(q) ||
      (m.projectName || '').toLowerCase().includes(q) ||
      (m.month || '').toLowerCase().includes(q) ||
      (m.region || '').toLowerCase().includes(q)
    );
  }, [availableMmps, search]);

  const getMmpLabel = (mmp: typeof availableMmps[0]) => {
    const parts: string[] = [];
    if (mmp.name) {
      parts.push(mmp.name.length > 35 ? mmp.name.substring(0, 35) + '...' : mmp.name);
    }
    return parts.join(' ') || `MMP ${mmp.id.slice(0, 6)}`;
  };

  const getMmpSublabel = (mmp: typeof availableMmps[0]) => {
    const parts: string[] = [];
    if (mmp.hub) parts.push(mmp.hub);
    if (mmp.month && mmp.year) parts.push(`${mmp.month}/${mmp.year}`);
    if (mmp.entries) parts.push(`${mmp.entries} sites`);
    return parts.join(' | ');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={isFiltering ? 'default' : 'outline'}
          size="sm"
          className={cn(
            "gap-1.5 text-xs font-medium",
            isFiltering && "shadow-sm"
          )}
          data-testid="button-mmp-global-filter"
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">MMP Filter</span>
          {isFiltering && (
            <Badge
              variant="secondary"
              className="ml-0.5 h-5 min-w-[20px] px-1.5 text-[10px] font-bold rounded-full bg-background/20 text-current"
            >
              {selectedMmpIds.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[340px] sm:w-[400px] p-0"
        data-testid="popover-mmp-filter"
      >
        <div className="p-3 border-b border-border/50 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold" data-testid="text-mmp-filter-title">Filter by MMP</span>
            </div>
            <div className="flex items-center gap-1">
              {isFiltering && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="h-6 px-2 text-[10px]"
                  data-testid="button-mmp-clear-filter"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={selectAll}
                className="h-6 px-2 text-[10px]"
                data-testid="button-mmp-select-all"
              >
                Select All
              </Button>
            </div>
          </div>
          <Input
            placeholder="Search MMPs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs"
            data-testid="input-mmp-search"
          />
          {isFiltering && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span>Showing data for {selectedMmpIds.length} of {availableMmps.length} MMPs</span>
            </div>
          )}
        </div>

        <ScrollArea className="h-[280px]">
          <div className="p-1">
            {filteredMmps.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
                No MMPs found
              </div>
            ) : (
              filteredMmps.map(mmp => {
                const isSelected = selectedMmpIds.includes(mmp.id);
                return (
                  <button
                    key={mmp.id}
                    onClick={() => toggleMmpId(mmp.id)}
                    className={cn(
                      "w-full flex items-start gap-2.5 p-2 rounded-md text-left transition-colors",
                      isSelected
                        ? "bg-primary/10 border border-primary/20"
                        : "hover-elevate border border-transparent"
                    )}
                    data-testid={`button-mmp-option-${mmp.id}`}
                  >
                    <div className={cn(
                      "flex items-center justify-center w-5 h-5 mt-0.5 rounded border flex-shrink-0 transition-colors",
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border bg-background"
                    )}>
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" data-testid={`text-mmp-name-${mmp.id}`}>
                        {getMmpLabel(mmp)}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {getMmpSublabel(mmp)}
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-[9px] flex-shrink-0 mt-0.5"
                    >
                      {mmp.status}
                    </Badge>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>

        {isFiltering && selectedMmps.length > 0 && (
          <div className="p-2 border-t border-border/50">
            <div className="flex flex-wrap gap-1">
              {selectedMmps.slice(0, 3).map(mmp => (
                <Badge
                  key={mmp.id}
                  variant="secondary"
                  className="text-[10px] gap-1 cursor-pointer"
                  onClick={() => toggleMmpId(mmp.id)}
                  data-testid={`badge-mmp-selected-${mmp.id}`}
                >
                  {(mmp.name || `MMP`).substring(0, 20)}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              ))}
              {selectedMmps.length > 3 && (
                <Badge variant="outline" className="text-[10px]">
                  +{selectedMmps.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
