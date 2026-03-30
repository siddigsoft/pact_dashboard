import { CheckCircle2, Circle, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowStage } from '@/config/projectFlows';

interface Props {
  stages: FlowStage[];
  currentStageIndex: number;
  getStageStatus: (id: string) => 'completed' | 'current' | 'skipped' | 'upcoming';
  compact?: boolean;
  className?: string;
}

export function FlowStrip({ stages, currentStageIndex, getStageStatus, compact = false, className }: Props) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div className="flex items-center min-w-max px-1 py-2 gap-0">
        {stages.map((stage, idx) => {
          const status = getStageStatus(stage.id);
          const isFirst = idx === 0;

          return (
            <div key={stage.id} className="flex items-center">
              {/* Connector line */}
              {!isFirst && (
                <div
                  className={cn(
                    'h-px w-6 flex-shrink-0 transition-colors',
                    status === 'completed' ? 'bg-emerald-500' : 'bg-border',
                  )}
                />
              )}

              {/* Stage node */}
              <div className="flex flex-col items-center gap-1 group">
                <div
                  title={stage.label}
                  className={cn(
                    'rounded-full flex items-center justify-center border-2 transition-all',
                    compact ? 'h-6 w-6' : 'h-8 w-8',
                    status === 'completed' &&
                      'border-emerald-500 bg-emerald-500 text-white',
                    status === 'current' &&
                      'border-[#1D3461] bg-[#1D3461] text-white ring-2 ring-[#1D3461]/30',
                    status === 'skipped' &&
                      'border-muted-foreground/30 bg-muted text-muted-foreground/50',
                    status === 'upcoming' &&
                      'border-border bg-background text-muted-foreground',
                  )}
                >
                  {status === 'completed' ? (
                    <CheckCircle2 className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
                  ) : status === 'skipped' ? (
                    <SkipForward className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
                  ) : (
                    <Circle className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
                  )}
                </div>

                {!compact && (
                  <span
                    className={cn(
                      'text-[10px] leading-tight text-center max-w-[60px] line-clamp-2',
                      status === 'current' && 'text-[#1D3461] font-semibold',
                      status === 'completed' && 'text-emerald-600 font-medium',
                      status === 'skipped' && 'text-muted-foreground/50 line-through',
                      status === 'upcoming' && 'text-muted-foreground',
                    )}
                  >
                    {stage.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
