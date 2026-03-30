import { GitBranch, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { UseProjectFlowReturn } from '@/hooks/useProjectFlow';

interface Props {
  flow: UseProjectFlowReturn;
  projectName: string;
  onGoToFlow: () => void;
}

export function FlowStageBanner({ flow, projectName, onGoToFlow }: Props) {
  const { currentStage, currentStageIndex, activeStages, isLastStage } = flow;
  if (!currentStage) return null;

  const nextStage = !isLastStage ? activeStages[currentStageIndex + 1] : null;
  const pct = Math.round(((currentStageIndex + 1) / activeStages.length) * 100);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#1D3461]/20 bg-[#0F2041]/5 dark:bg-[#1D3461]/10 px-4 py-2.5 mb-4">
      <GitBranch className="h-4 w-4 text-[#1D3461] dark:text-blue-400 flex-shrink-0" />
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-[#1D3461] dark:text-blue-300">
          Flow:
        </span>
        <Badge
          variant="outline"
          className="text-xs border-[#1D3461]/40 text-[#1D3461] dark:text-blue-300 dark:border-blue-400/40"
        >
          {currentStage.label}
        </Badge>
        {nextStage && (
          <>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{nextStage.label}</span>
          </>
        )}
        <span className="text-xs text-muted-foreground ml-1">
          ({currentStageIndex + 1}/{activeStages.length} · {pct}%)
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-xs h-7 px-2 text-[#1D3461] dark:text-blue-300 hover:bg-[#1D3461]/10 flex-shrink-0"
        onClick={onGoToFlow}
      >
        View Flow
      </Button>
    </div>
  );
}
