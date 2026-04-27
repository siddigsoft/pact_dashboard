import { useState, useMemo } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, ChevronDown, ChevronUp, Search, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { MatchResult, MatchTier, MatchOutcome } from '@/utils/wfpMatcher';

interface Props {
  results: MatchResult[];
  onChange: (updated: MatchResult[]) => void;
  disabled?: boolean;
}

const TIER_CONFIG: Record<MatchTier, { label: string; labelAr: string; color: string; icon: React.ReactNode; desc: string }> = {
  strong: { label: 'Strong',   labelAr: 'قوي',         color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', icon: <CheckCircle2 className="h-3.5 w-3.5" />, desc: 'Auto-confirmed' },
  weak:   { label: 'Weak',     labelAr: 'ضعيف',        color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',         icon: <AlertTriangle className="h-3.5 w-3.5" />, desc: 'Needs review' },
  fuzzy:  { label: 'Fuzzy',    labelAr: 'غير دقيق',    color: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',     icon: <HelpCircle className="h-3.5 w-3.5" />, desc: 'Needs review' },
  none:   { label: 'No Match', labelAr: 'لا تطابق',    color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',                 icon: <XCircle className="h-3.5 w-3.5" />, desc: 'Auto-rejected' },
};

const OUTCOME_CONFIG: Record<MatchOutcome, { label: string; color: string }> = {
  confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  rejected:  { label: 'Rejected',  color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
};

type FilterTier = 'all' | MatchTier;

function ReviewRow({ result, onUpdate, disabled }: { result: MatchResult; onUpdate: (r: MatchResult) => void; disabled?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(result.review_note || '');
  const tier = TIER_CONFIG[result.match_tier];
  const outcome = OUTCOME_CONFIG[result.outcome];
  const canOverride = result.match_tier === 'weak' || result.match_tier === 'fuzzy';

  const setOutcome = (o: MatchOutcome) => {
    onUpdate({ ...result, outcome: o, review_note: note });
  };

  return (
    <div className={cn('border rounded-lg mb-2 overflow-hidden transition-colors', expanded && 'ring-1 ring-blue-500/30')}>
      {/* Row header */}
      <div
        className={cn('flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40', expanded && 'bg-muted/30')}
        onClick={() => setExpanded(v => !v)}
        data-testid={`wfp-row-${result.wfp_row_number}`}
      >
        {/* Row # */}
        <span className="text-xs text-muted-foreground w-8 shrink-0">#{result.wfp_row_number}</span>

        {/* WFP site name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{result.wfp_site_name || '—'}</p>
          <p className="text-xs text-muted-foreground truncate">{[result.wfp_state, result.wfp_locality].filter(Boolean).join(' · ')}</p>
        </div>

        {/* Match tier badge */}
        <Badge className={cn('gap-1 shrink-0 text-xs', tier.color)}>
          {tier.icon} {tier.label}
        </Badge>

        {/* Score */}
        <span className="text-xs text-muted-foreground w-12 text-right shrink-0">
          {(result.match_score * 100).toFixed(0)}%
        </span>

        {/* Outcome badge */}
        <Badge className={cn('shrink-0 text-xs w-22 text-center', outcome.color)}>{outcome.label}</Badge>

        {/* Matched site name */}
        <div className="w-40 shrink-0 hidden md:block">
          {result.matched_site ? (
            <p className="text-xs truncate text-muted-foreground">{result.matched_site.site_name}</p>
          ) : (
            <p className="text-xs text-muted-foreground/50 italic">No site matched</p>
          )}
        </div>

        <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', expanded && 'rotate-180')} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 py-3 bg-muted/10 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">WFP Site</p>
              <p className="font-medium">{result.wfp_site_name || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">WFP State</p>
              <p className="font-medium">{result.wfp_state || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">WFP Locality</p>
              <p className="font-medium">{result.wfp_locality || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">WFP Partner</p>
              <p className="font-medium">{result.wfp_partner || '—'}</p>
            </div>
          </div>

          {result.matched_site && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs border-t pt-3">
              <div>
                <p className="text-muted-foreground">Matched MMP Site</p>
                <p className="font-medium">{result.matched_site.site_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">MMP State</p>
                <p className="font-medium">{result.matched_site.state || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">MMP Locality</p>
                <p className="font-medium">{result.matched_site.locality || '—'}</p>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground border-t pt-2">
            <span className="font-medium">Match scores: </span>{result.match_notes}
          </div>

          {/* Manual override for weak/fuzzy */}
          {canOverride && !disabled && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-semibold">Manual Review Decision</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={result.outcome === 'confirmed' ? 'default' : 'outline'}
                  className={result.outcome === 'confirmed' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                  onClick={() => setOutcome('confirmed')}
                  data-testid={`button-wfp-confirm-${result.wfp_row_number}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Confirm Match
                </Button>
                <Button
                  size="sm"
                  variant={result.outcome === 'rejected' ? 'destructive' : 'outline'}
                  onClick={() => setOutcome('rejected')}
                  data-testid={`button-wfp-reject-${result.wfp_row_number}`}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
                </Button>
              </div>
              <Textarea
                placeholder="Optional review note…"
                className="text-xs h-16 resize-none"
                value={note}
                onChange={e => {
                  setNote(e.target.value);
                  onUpdate({ ...result, outcome: result.outcome, review_note: e.target.value });
                }}
                data-testid={`textarea-wfp-note-${result.wfp_row_number}`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WFPMatchReviewTable({ results, onChange, disabled }: Props) {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<FilterTier>('all');

  const filtered = useMemo(() => {
    return results.filter(r => {
      if (tierFilter !== 'all' && r.match_tier !== tierFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (r.wfp_site_name || '').toLowerCase().includes(s)
          || (r.wfp_state || '').toLowerCase().includes(s)
          || (r.wfp_locality || '').toLowerCase().includes(s)
          || (r.matched_site?.site_name || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [results, search, tierFilter]);

  const updateOne = (updated: MatchResult) => {
    onChange(results.map(r => r.wfp_row_number === updated.wfp_row_number ? updated : r));
  };

  const pendingCount = results.filter(r => r.outcome === 'pending').length;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search site name, state…"
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-wfp-search"
          />
        </div>
        <Select value={tierFilter} onValueChange={v => setTierFilter(v as FilterTier)}>
          <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-wfp-tier-filter">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="strong">Strong</SelectItem>
            <SelectItem value="weak">Weak</SelectItem>
            <SelectItem value="fuzzy">Fuzzy</SelectItem>
            <SelectItem value="none">No Match</SelectItem>
          </SelectContent>
        </Select>
        {pendingCount > 0 && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-xs">
            {pendingCount} need review
          </Badge>
        )}
      </div>

      {/* Column headers */}
      <div className="hidden md:flex items-center gap-3 px-4 py-1 text-xs text-muted-foreground font-medium border-b">
        <span className="w-8">#</span>
        <span className="flex-1">WFP Site / Location</span>
        <span className="w-20">Tier</span>
        <span className="w-12 text-right">Score</span>
        <span className="w-22 text-center">Outcome</span>
        <span className="w-40">Matched MMP Site</span>
        <span className="w-4" />
      </div>

      {/* Rows */}
      <div className="max-h-[520px] overflow-y-auto pr-1 space-y-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No results match your filter.</p>
        ) : (
          filtered.map(r => (
            <ReviewRow key={r.wfp_row_number} result={r} onUpdate={updateOne} disabled={disabled} />
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground text-right">
        Showing {filtered.length} of {results.length} rows
      </p>
    </div>
  );
}
