import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  ClassificationLevel, 
  ClassificationRoleScope, 
  CLASSIFICATION_COLORS,
  CLASSIFICATION_LABELS,
  ROLE_SCOPE_LABELS
} from '@/types/classification';
import { cn } from '@/lib/utils';

interface ClassificationBadgeProps {
  level: ClassificationLevel;
  roleScope?: ClassificationRoleScope;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-3 py-1.5',
};

const ClassificationBadge: React.FC<ClassificationBadgeProps> = ({ 
  level, 
  roleScope,
  showTooltip = true, 
  size = 'sm',
  className
}) => {
  const badgeContent = (
    <Badge
      variant="outline"
      className={cn(
        CLASSIFICATION_COLORS[level],
        sizeClasses[size],
        'font-semibold border-2 rounded-md no-default-hover-elevate transition-all',
        className
      )}
      data-testid={`badge-classification-${level.toLowerCase()}`}
    >
      {level}
    </Badge>
  );

  if (!showTooltip) {
    return badgeContent;
  }

  const tooltipText = roleScope 
    ? `${ROLE_SCOPE_LABELS[roleScope]} - ${CLASSIFICATION_LABELS[level]}`
    : CLASSIFICATION_LABELS[level];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm font-medium">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ClassificationBadge;
