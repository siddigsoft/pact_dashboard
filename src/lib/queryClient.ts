import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: 'always',
    },
  },
});
