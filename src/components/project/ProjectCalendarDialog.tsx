/**
 * ProjectCalendarDialog
 * Lets project editors configure the working calendar:
 *  - which days of the week are working days (Mon–Sun toggles)
 *  - specific holiday / non-working dates (exceptions)
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Loader2, CalendarDays, Plus, Trash2, RefreshCw } from 'lucide-react';
import { DAY_NAMES, DEFAULT_WORKING_DAYS } from '@/utils/workingDays';
import { format, parseISO } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string;
  /** Called after a successful save so the parent can refetch. */
  onSaved?: (workingDays: number[], exceptions: string[]) => void;
}

export function ProjectCalendarDialog({
  open, onOpenChange, projectId, projectName = 'Project', onSaved,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workingDays, setWorkingDays] = useState<number[]>(DEFAULT_WORKING_DAYS);
  const [exceptions, setExceptions] = useState<string[]>([]);
  const [newException, setNewException] = useState('');

  // Load current settings when dialog opens
  useEffect(() => {
    if (!open || !projectId) return;
    setLoading(true);
    supabase
      .from('projects')
      .select('working_days, calendar_exceptions')
      .eq('id', projectId)
      .single()
      .then(({ data, error }) => {
        setLoading(false);
        if (error || !data) return;
        setWorkingDays((data as any).working_days ?? DEFAULT_WORKING_DAYS);
        setExceptions(((data as any).calendar_exceptions as string[] | null) ?? []);
      });
  }, [open, projectId]);

  const toggleDay = (day: number) => {
    setWorkingDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  const addException = () => {
    const v = newException.trim();
    if (!v || exceptions.includes(v)) return;
    setExceptions(prev => [...prev, v].sort());
    setNewException('');
  };

  const removeException = (date: string) =>
    setExceptions(prev => prev.filter(d => d !== date));

  const handleReset = () => {
    setWorkingDays(DEFAULT_WORKING_DAYS);
    setExceptions([]);
  };

  const handleSave = async () => {
    if (workingDays.length === 0) {
      toast({ title: 'Select at least one working day', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('projects')
      .update({ working_days: workingDays, calendar_exceptions: exceptions as any })
      .eq('id', projectId);
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to save calendar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Project calendar saved' });
    onSaved?.(workingDays, exceptions);
    onOpenChange(false);
  };

  const wdCount = workingDays.length;
  const weeksLabel = wdCount === 5 && workingDays.every(d => [1,2,3,4,5].includes(d))
    ? 'Mon – Fri'
    : wdCount === 6 ? 'Mon – Sat'
    : wdCount === 7 ? 'All days'
    : `${wdCount} days/week`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4.5 w-4.5 text-[#1D3461]" />
            Project Calendar
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Configure working days and holidays for <span className="font-semibold">{projectName}</span>.
            Durations shown throughout the flow are calculated using this calendar.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Working days */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Working Days</p>
                <Badge variant="outline" className="text-[11px] font-normal">{weeksLabel}</Badge>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_NAMES.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={cn(
                      'w-11 h-9 rounded-lg border text-xs font-medium transition-all',
                      workingDays.includes(d.value)
                        ? 'bg-[#1D3461] text-white border-[#1D3461]'
                        : 'bg-background text-muted-foreground border-border hover:border-[#1D3461]/40',
                    )}
                  >
                    {d.short}
                  </button>
                ))}
              </div>
            </div>

            {/* Exceptions / holidays */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Holidays & Non-Working Dates</p>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={newException}
                  onChange={e => setNewException(e.target.value)}
                  className="h-8 text-xs flex-1"
                  onKeyDown={e => { if (e.key === 'Enter') addException(); }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5"
                  onClick={addException}
                  disabled={!newException}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {exceptions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-1">No exceptions — all working days in the pattern above are active.</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {exceptions.map(d => (
                    <div key={d} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs">
                      <span className="font-medium">
                        {(() => { try { return format(parseISO(d), 'EEE, dd MMM yyyy'); } catch { return d; } })()}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeException(d)}
                        className="text-muted-foreground hover:text-destructive ml-2"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground space-y-0.5">
              <p><span className="font-semibold text-foreground">{wdCount}</span> working days per week</p>
              {exceptions.length > 0 && (
                <p><span className="font-semibold text-foreground">{exceptions.length}</span> holiday exclusion{exceptions.length !== 1 ? 's' : ''}</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto h-8 text-xs px-3 gap-1"
            onClick={handleReset}
          >
            <RefreshCw className="h-3 w-3" /> Reset to Default
          </Button>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-[#1D3461] hover:bg-[#0F2041] text-white"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Save Calendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
