import { useState, useRef, useEffect } from 'react';
import { CheckCircle2, Circle, SkipForward, Clock, User, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import type { FlowStage } from '@/config/projectFlows';
import type { FlowLogEntry } from '@/hooks/useProjectFlow';

interface Props {
  stages: FlowStage[];
  currentStageIndex: number;
  getStageStatus: (id: string) => 'completed' | 'current' | 'skipped' | 'upcoming';
  stageHistory?: FlowLogEntry[];
  compact?: boolean;
  className?: string;
}

function formatTs(iso: string) {
  try {
    return format(new Date(iso), 'dd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

export function FlowStrip({
  stages,
  currentStageIndex,
  getStageStatus,
  stageHistory = [],
  compact = false,
  className,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentNodeRef = useRef<HTMLDivElement>(null);

  // Auto-center current stage on mobile after render
  useEffect(() => {
    if (currentNodeRef.current && scrollRef.current) {
      currentNodeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [currentStageIndex]);

  return (
    <div ref={scrollRef} className={cn('w-full overflow-x-auto', className)}>
      <div className="flex items-center min-w-max px-1 py-2 gap-0">
        {stages.map((stage, idx) => {
          const status = getStageStatus(stage.id);
          const isFirst = idx === 0;
          const isCompleted = status === 'completed';
          const isCurrent = status === 'current';
          const historyEntry = stageHistory.filter(h => h.stageId === stage.id).at(-1);

          const nodeContent = isCompleted ? (
            <CheckCircle2 className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
          ) : status === 'skipped' ? (
            <SkipForward className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
          ) : isCurrent ? (
            <Circle className={cn(compact ? 'h-3 w-3' : 'h-4 w-4')} />
          ) : (
            <span className={cn('font-bold leading-none', compact ? 'text-[8px]' : 'text-[10px]')}>
              {idx + 1}
            </span>
          );

          const nodeEl = (
            <div
              title={compact ? stage.label : undefined}
              className={cn(
                'rounded-full flex items-center justify-center border-2 transition-all',
                compact ? 'h-6 w-6' : 'h-8 w-8',
                isCompleted && 'border-emerald-500 bg-emerald-500 text-white cursor-pointer hover:scale-110',
                isCurrent && 'border-[#1D3461] bg-[#1D3461] text-white ring-2 ring-[#1D3461]/30 animate-pulse',
                status === 'skipped' && 'border-muted-foreground/30 bg-muted text-muted-foreground/50',
                status === 'upcoming' && 'border-border bg-background text-muted-foreground',
              )}
            >
              {nodeContent}
            </div>
          );

          return (
            <div
              key={stage.id}
              className="flex items-center"
              ref={isCurrent ? currentNodeRef : undefined}
            >
              {!isFirst && (
                <div
                  className={cn(
                    'h-px w-6 flex-shrink-0 transition-colors',
                    isCompleted || isCurrent ? 'bg-emerald-500' : 'bg-border',
                  )}
                />
              )}

              <div className="flex flex-col items-center gap-1 group">
                {isCompleted ? (
                  <Popover
                    open={openId === stage.id}
                    onOpenChange={open => setOpenId(open ? stage.id : null)}
                  >
                    <PopoverTrigger asChild>{nodeEl}</PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="center"
                      className="w-64 p-3 space-y-2 text-sm"
                    >
                      <p className="font-semibold text-[13px]">{stage.label}</p>
                      {historyEntry ? (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3 flex-shrink-0" />
                            <span>{formatTs(historyEntry.advancedAt)}</span>
                          </div>
                          {historyEntry.advancedByName && (
                            <div className="flex items-center gap-1.5">
                              <User className="h-3 w-3 flex-shrink-0" />
                              <span>{historyEntry.advancedByName}</span>
                            </div>
                          )}
                          {historyEntry.notes && (
                            <div className="flex items-start gap-1.5">
                              <FileText className="h-3 w-3 flex-shrink-0 mt-0.5" />
                              <span className="break-words">{historyEntry.notes}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          Stage completed — no advancement record available.
                        </p>
                      )}
                    </PopoverContent>
                  </Popover>
                ) : (
                  nodeEl
                )}

                {!compact && (
                  <span
                    className={cn(
                      'text-[10px] leading-tight text-center max-w-[60px] line-clamp-2',
                      isCurrent && 'text-[#1D3461] font-semibold',
                      isCompleted && 'text-emerald-600 font-medium',
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
