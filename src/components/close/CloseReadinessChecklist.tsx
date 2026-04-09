import { useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, ExternalLink, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useState } from 'react';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  passed: boolean;
  count: number;
  total: number;
  link?: string;
  notConfigured?: boolean;
}

interface CloseReadinessChecklistProps {
  title: string;
  items: ChecklistItem[];
  score: number;
  allPassed: boolean;
  loading: boolean;
  isSuperAdmin: boolean;
  onOverride?: (justification: string) => void;
  overrideLabel?: string;
  className?: string;
}

export function CloseReadinessChecklist({
  title,
  items,
  score,
  allPassed,
  loading,
  isSuperAdmin,
  onOverride,
  overrideLabel = 'Override Gate',
  className = '',
}: CloseReadinessChecklistProps) {
  const navigate = useNavigate();
  const [showOverride, setShowOverride] = useState(false);
  const [justification, setJustification] = useState('');

  const handleOverride = () => {
    if (!justification.trim()) return;
    onOverride?.(justification.trim());
    setShowOverride(false);
    setJustification('');
  };

  return (
    <Card className={`border-2 ${allPassed ? 'border-green-500/40 bg-green-50/30 dark:bg-green-950/10' : 'border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10'} ${className}`} data-testid="card-close-readiness">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2" data-testid="text-checklist-title">
            {allPassed
              ? <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              : <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Close Readiness Score</span>
            <Badge
              variant={allPassed ? 'default' : 'outline'}
              className={`font-bold text-sm px-3 ${allPassed ? 'bg-green-600 hover:bg-green-600' : 'text-amber-700 dark:text-amber-400 border-amber-500/50'}`}
              data-testid="badge-readiness-score"
            >
              {loading ? '…' : `${score}%`}
            </Badge>
          </div>
        </div>
        {!allPassed && (
          <Progress
            value={score}
            className="h-2 mt-2"
            data-testid="progress-readiness"
          />
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2" data-testid="checklist-loading">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking readiness…
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => {
              // isWarning: notConfigured items show amber whether or not they are passed
              // (passed+notConfigured = green border but amber icon/info; !passed+notConfigured = amber row)
              const isWarning = Boolean(item.notConfigured);
              const showAmberRow = isWarning && !item.passed;
              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    showAmberRow
                      ? 'border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20'
                      : item.passed
                        ? 'border-green-500/20 bg-green-50/40 dark:bg-green-950/20'
                        : 'border-red-500/30 bg-red-50/40 dark:bg-red-950/20'
                  }`}
                  data-testid={`checklist-item-${item.id}`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isWarning
                      ? <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      : item.passed
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        : <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className={`text-sm font-medium ${
                        isWarning
                          ? 'text-amber-800 dark:text-amber-200'
                          : item.passed
                            ? 'text-green-800 dark:text-green-200'
                            : 'text-red-800 dark:text-red-200'
                      }`}>
                        {item.label}
                        {isWarning && <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">(not configured)</span>}
                      </p>
                      {item.total > 0 && (
                        <span className={`text-xs font-mono ${
                          isWarning
                            ? 'text-amber-700 dark:text-amber-300'
                            : item.passed
                              ? 'text-green-700 dark:text-green-300'
                              : 'text-red-700 dark:text-red-300'
                        }`}>
                          {item.count}/{item.total}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.description}
                      {isWarning && ' Set the required status field to enable this gate.'}
                    </p>
                    {!item.passed && item.link && (
                      <Button
                        variant="link"
                        size="sm"
                        className={`px-0 h-auto text-xs mt-1 ${isWarning ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}
                        onClick={() => navigate(item.link!)}
                        data-testid={`link-resolve-${item.id}`}
                      >
                        {isWarning ? 'Configure' : 'Resolve'} <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!allPassed && !loading && (
          <p className="text-xs text-muted-foreground pt-1">
            {items.filter(i => !i.passed).length} item{items.filter(i => !i.passed).length !== 1 ? 's' : ''} must be resolved before closing.
          </p>
        )}

        {allPassed && !loading && (
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 pt-1">
            <ShieldCheck className="h-4 w-4" />
            All pre-close requirements satisfied. You may proceed.
          </div>
        )}

        {!allPassed && isSuperAdmin && onOverride && (
          <div className="pt-2 border-t" data-testid="superadmin-override-section">
            {!showOverride ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-amber-500/50 text-amber-700 dark:text-amber-400"
                onClick={() => setShowOverride(true)}
                data-testid="button-show-override"
              >
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                Super Admin Override
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Override requires a recorded justification
                </p>
                <Textarea
                  placeholder="Enter justification for bypassing the finance gate…"
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                  className="min-h-[80px] text-sm"
                  data-testid="input-override-justification"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={!justification.trim()}
                    onClick={handleOverride}
                    data-testid="button-confirm-override"
                  >
                    {overrideLabel}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowOverride(false); setJustification(''); }}
                    data-testid="button-cancel-override"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
