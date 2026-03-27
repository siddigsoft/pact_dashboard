import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 min — reduce burst refetches on tab focus
      gcTime: 1000 * 60 * 10,
      retry: (failureCount, error: any) => {
        const status = error?.status;
        // Never retry 503 — the server is overloaded; backing off is handled upstream.
        if (status === 503) return false;
        if (status === 401 || status === 403) return failureCount < 2;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(2000 * 2 ** attemptIndex, 15000),
      refetchOnWindowFocus: false,
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
