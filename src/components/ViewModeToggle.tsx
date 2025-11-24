
import React from 'react';
import { Monitor, Smartphone, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useViewMode } from '@/context/ViewModeContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const ViewModeToggle: React.FC = () => {
  const { viewMode, toggleViewMode, isAutoDetect } = useViewMode();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`rounded-full bg-white dark:bg-gray-800 relative ${
            !isAutoDetect ? 'ring-2 ring-blue-500 ring-offset-2' : ''
          }`}
          onClick={toggleViewMode}
          aria-label={viewMode === 'mobile' ? 'Switch to desktop view' : 'Switch to mobile view'}
          title={viewMode === 'mobile' ? 'Desktop view' : 'Mobile view'}
        >
          {viewMode === 'mobile' ? (
            <Monitor className="h-5 w-5" />
          ) : (
            <Smartphone className="h-5 w-5" />
          )}
          {!isAutoDetect && (
            <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-blue-500 animate-pulse" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs space-y-1">
          <p className="font-semibold">
            {isAutoDetect ? '🔄 Auto-detect mode' : '🔒 Override active'}
          </p>
          <p>
            {isAutoDetect 
              ? `Currently: ${viewMode === 'mobile' ? 'Mobile' : 'Desktop'} (auto)`
              : `Forced: ${viewMode === 'mobile' ? 'Mobile' : 'Desktop'} view`
            }
          </p>
          <p className="text-muted-foreground">
            Click to {isAutoDetect ? 'override' : 'reset to auto'}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export default ViewModeToggle;
