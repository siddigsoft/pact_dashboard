import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  ClassificationLevel, 
  ClassificationRoleScope, 
  CLASSIFICATION_LABELS,
  ROLE_SCOPE_LABELS
} from '@/types/classification';
import { cn } from '@/lib/utils';
import { Crown, Star, Zap } from 'lucide-react';

interface ClassificationBadgeProps {
  level: ClassificationLevel;
  roleScope?: ClassificationRoleScope;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'text-xs px-2 py-1 gap-1',
  md: 'text-sm px-2.5 py-1.5 gap-1.5',
  lg: 'text-base px-3 py-2 gap-2',
};

const iconSizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
  lg: 'h-4 w-4',
};

const getLevelConfig = (level: ClassificationLevel) => {
  switch (level) {
    case 'A': 
      return {
        gradient: 'bg-gradient-to-r from-emerald-500 to-teal-500',
        border: 'border-emerald-400/50',
        glow: 'shadow-lg shadow-emerald-500/20',
        icon: Crown,
        iconColor: 'text-emerald-100'
      };
    case 'B': 
      return {
        gradient: 'bg-gradient-to-r from-blue-500 to-cyan-500',
        border: 'border-blue-400/50',
        glow: 'shadow-lg shadow-blue-500/20',
        icon: Star,
        iconColor: 'text-blue-100'
      };
    case 'C': 
      return {
        gradient: 'bg-gradient-to-r from-orange-500 to-amber-500',
        border: 'border-orange-400/50',
        glow: 'shadow-lg shadow-orange-500/20',
        icon: Zap,
        iconColor: 'text-orange-100'
      };
    default: 
      return {
        gradient: 'bg-gradient-to-r from-gray-500 to-slate-500',
        border: 'border-gray-400/50',
        glow: 'shadow-lg shadow-gray-500/20',
        icon: Star,
        iconColor: 'text-gray-100'
      };
  }
};

const ClassificationBadge: React.FC<ClassificationBadgeProps> = ({ 
  level, 
  roleScope,
  showTooltip = true, 
  size = 'sm',
  className
}) => {
  const config = getLevelConfig(level);
  const Icon = config.icon;

  const badgeContent = (
    <div
      className={cn(
        'inline-flex items-center rounded-md border text-white font-semibold transition-all hover:scale-105',
        config.gradient,
        config.border,
        config.glow,
        sizeClasses[size],
        className
      )}
      data-testid={`badge-classification-${level.toLowerCase()}`}
    >
      <Icon className={cn(iconSizeClasses[size], config.iconColor)} />
      <span>{CLASSIFICATION_LABELS[level]}</span>
    </div>
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
