import { useState, useCallback } from 'react';
import { AutoReleaseService } from '@/services/auto-release.service';
import { useToast } from '@/hooks/use-toast';

interface AutoReleaseState {
  isRunning: boolean;
  lastRun: Date | null;
  lastResults: {
    processed: number;
    released: number;
    errors: number;
  } | null;
}

export function useAutoRelease() {
  const { toast } = useToast();
  const [state, setState] = useState<AutoReleaseState>({
    isRunning: false,
    lastRun: null,
    lastResults: null,
  });

  const runAutoRelease = useCallback(async () => {
    if (state.isRunning) return;

    setState(prev => ({ ...prev, isRunning: true }));

    try {
      const results = await AutoReleaseService.processAutoReleases();
      
      setState({
        isRunning: false,
        lastRun: new Date(),
        lastResults: {
          processed: results.processed,
          released: results.released,
          errors: results.errors,
        },
      });

      if (results.released > 0) {
        toast({
          title: 'Auto-Release Complete',
          description: `${results.released} site${results.released > 1 ? 's' : ''} released due to unconfirmed claims.`,
        });
      }

      return results;
    } catch (error) {
      console.error('Auto-release hook error:', error);
      setState(prev => ({ ...prev, isRunning: false }));
      
      toast({
        title: 'Auto-Release Failed',
        description: 'Could not process auto-releases. Please try again.',
        variant: 'destructive',
      });
      
      return null;
    }
  }, [state.isRunning, toast]);

  const checkSingleSite = useCallback(async (siteId: string) => {
    return AutoReleaseService.checkSingleSite(siteId);
  }, []);

  return {
    ...state,
    runAutoRelease,
    checkSingleSite,
  };
}

export default useAutoRelease;
