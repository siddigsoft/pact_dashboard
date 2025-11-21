import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export const RefreshButton = () => {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    try {
      window.location.reload();

      toast({
        title: 'Dashboard Refreshed',
        description: 'All data has been updated successfully.',
        duration: 2000
      });
    } catch (error) {
      console.error('[RefreshButton] Refresh error:', error);
      toast({
        title: 'Refresh Failed',
        description: 'Failed to refresh dashboard data. Please try again.',
        variant: 'destructive',
        duration: 3000
      });
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="flex items-center gap-2"
      data-testid="button-refresh-dashboard"
    >
      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">Refresh</span>
    </Button>
  );
};
