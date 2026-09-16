import type { PropsWithChildren } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: { id: 'user-a' } as { id: string } | null, rpc: vi.fn() }));
vi.mock('@/context/AppContext', () => ({ useAppContext: () => ({ currentUser: mocks.user }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
import { useCurrentUserAccessManifest } from '@/hooks/useCurrentUserAccessManifest';

const context = (userId: string) => ({ user_id: userId, roles: ['Admin'], page_overrides: {}, action_overrides: {}, role_permissions: [], generated_at: 'now' });
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
};

afterEach(() => { mocks.user = { id: 'user-a' }; mocks.rpc.mockReset(); });

describe('signed-in manifest cache isolation', () => {
  it('uses a separate cache for each signed-in account and rejects a mismatched RPC identity', async () => {
    const { client, wrapper } = setup();
    mocks.rpc.mockResolvedValue({ data: context('user-a'), error: null });
    const hook = renderHook(() => useCurrentUserAccessManifest(true), { wrapper });
    await waitFor(() => expect(hook.result.current.data?.user_id).toBe('user-a'));
    mocks.user = { id: 'user-b' };
    hook.rerender();
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
    expect(client.getQueryData(['current-user-access-manifest', 'user-b'])).toBeUndefined();
    hook.unmount(); client.clear();
  });

  it('does not expose previously cached grants when a refresh fails', async () => {
    const { client, wrapper } = setup();
    mocks.rpc.mockResolvedValue({ data: context('user-a'), error: null });
    const hook = renderHook(() => useCurrentUserAccessManifest(true), { wrapper });
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    await act(async () => { await client.invalidateQueries({ queryKey: ['current-user-access-manifest'] }); });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
    hook.unmount(); client.clear();
  });

  it('does not expose the real user cache to disabled View As observers', async () => {
    const { client, wrapper } = setup();
    mocks.rpc.mockResolvedValue({ data: context('user-a'), error: null });
    const hook = renderHook(({ enabled }) => useCurrentUserAccessManifest(enabled), { initialProps: { enabled: true }, wrapper });
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    hook.rerender({ enabled: false });
    expect(hook.result.current.data).toBeUndefined();
    hook.unmount(); client.clear();
  });
});
