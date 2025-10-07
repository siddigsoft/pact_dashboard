
import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useViewMode } from '@/context/ViewModeContext';

const ViewModeToggle: React.FC = () => {
  const { viewMode, toggleViewMode } = useViewMode();

  return (
    <Button
      variant="outline"
      size="icon"
      className="rounded-full bg-white dark:bg-gray-800"
      onClick={toggleViewMode}
      aria-label={viewMode === 'mobile' ? 'Switch to desktop view' : 'Switch to mobile view'}
      title={viewMode === 'mobile' ? 'Desktop view' : 'Mobile view'}
    >
      {viewMode === 'mobile' ? (
        <Monitor className="h-5 w-5" />
      ) : (
        <Smartphone className="h-5 w-5" />
      )}
    </Button>
  );
};

export default ViewModeToggle;
