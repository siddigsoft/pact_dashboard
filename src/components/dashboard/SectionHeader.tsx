
import React from 'react';
import { cn } from '@/lib/utils';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const SectionHeader = ({ 
  title, 
  description, 
  icon, 
  className 
}: SectionHeaderProps) => {
  return (
    <div className={cn("flex items-center justify-between mb-4", className)}>
      <div className="flex items-center gap-2">
        {icon && <div className="mr-1">{icon}</div>}
        <h2 className="text-xl font-semibold">{title}</h2>
        {description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">{description}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
