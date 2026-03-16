import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 min — refetch sooner after idle
      gcTime: 1000 * 60 * 10,
      retry: (failureCount, error: any) => {
        const status = error?.status;
        if (status === 401 || status === 403) return failureCount < 2;
        if (status >= 400 && status < 500) return false;
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      networkMode: 'online',
    },
    mutations: {
      retry: (failureCount, error: any) => {
        const status = error?.status;
        if (status === 401 || status === 403) return failureCount < 1;
        return false;
      },
      networkMode: 'online',
    },
  },
});
