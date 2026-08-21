import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceAccessGate } from '../WorkspaceAccessGate';

const {
  toastMock,
  invalidateQueries,
  state,
  grantChain,
  requestChain,
  insertMock,
  profilesInMock,
  invokeMock,
} = vi.hoisted(() => {
  const toastMock = vi.fn();
  const invalidateQueries = vi.fn();
  const state = {
    mockUser: {
      id: 'user-1',
      name: 'Hope Birungi',
      role: 'admin',
    } as { id: string; name: string; role: string } | null,
    isSuperAdmin: false,
  };
  const grantChain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  const requestChain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
  };
  const insertMock = vi.fn();
  const profilesInMock = vi.fn();
  const invokeMock = vi.fn();
  return {
    toastMock,
    invalidateQueries,
    state,
    grantChain,
    requestChain,
    insertMock,
    profilesInMock,
    invokeMock,
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({ currentUser: state.mockUser }),
}));

vi.mock('@/hooks/use-authorization', () => ({
  useAuthorization: () => ({
    hasAnyRole: (roles: string[]) =>
      state.isSuperAdmin && roles.some(r => ['super_admin', 'superAdmin', 'SuperAdmin'].includes(r)),
  }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries }),
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'workspace_access_grants') {
        grantChain.select.mockReturnValue(grantChain);
        grantChain.eq.mockReturnValue(grantChain);
        return grantChain;
      }
      if (table === 'workspace_access_requests') {
        requestChain.select.mockReturnValue(requestChain);
        requestChain.eq.mockReturnValue(requestChain);
        requestChain.order.mockReturnValue(requestChain);
        return {
          ...requestChain,
          insert: insertMock,
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: profilesInMock,
          }),
        };
      }
      return {};
    },
    functions: { invoke: invokeMock },
  },
}));

function renderGate() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceAccessGate>
        <div data-testid="workspace-children">Hub Content</div>
      </WorkspaceAccessGate>
    </QueryClientProvider>,
  );
}

describe('WorkspaceAccessGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.mockUser = { id: 'user-1', name: 'Hope Birungi', role: 'admin' };
    state.isSuperAdmin = false;
    grantChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    requestChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    insertMock.mockResolvedValue({ error: null });
    profilesInMock.mockResolvedValue({ data: [{ id: 'sa-1' }], error: null });
    invokeMock.mockResolvedValue({ data: null, error: null });
  });

  it('lets super admins straight into the hub', async () => {
    state.isSuperAdmin = true;
    renderGate();
    expect(await screen.findByTestId('workspace-children')).toHaveTextContent('Hub Content');
    expect(screen.queryByTestId('btn-request-access')).not.toBeInTheDocument();
  });

  it('lets users with an active grant into the hub', async () => {
    grantChain.maybeSingle.mockResolvedValue({
      data: { id: 'g1', user_id: 'user-1', access_level: 'viewer', is_active: true },
      error: null,
    });
    renderGate();
    expect(await screen.findByTestId('workspace-children')).toHaveTextContent('Hub Content');
  });

  it('shows the request form when there is no grant', async () => {
    renderGate();
    expect(await screen.findByText('Workspace Access Required')).toBeInTheDocument();
    expect(screen.getByTestId('btn-request-access')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-children')).not.toBeInTheDocument();
  });

  it('shows pending state when a request is awaiting review', async () => {
    requestChain.maybeSingle.mockResolvedValue({
      data: { id: 'r1', user_id: 'user-1', status: 'pending', created_at: '2026-08-21T00:00:00Z' },
      error: null,
    });
    renderGate();
    expect(await screen.findByText('Access Pending')).toBeInTheDocument();
    expect(screen.getByText(/Awaiting review/i)).toBeInTheDocument();
    expect(screen.queryByTestId('btn-request-access')).not.toBeInTheDocument();
  });

  it('shows rejected state and allows a new request', async () => {
    requestChain.maybeSingle.mockResolvedValue({
      data: { id: 'r2', user_id: 'user-1', status: 'rejected', created_at: '2026-08-20T00:00:00Z' },
      error: null,
    });
    renderGate();
    expect(await screen.findByText('Access Not Granted')).toBeInTheDocument();
    expect(screen.getByText(/Previous request was rejected/i)).toBeInTheDocument();
    expect(screen.getByTestId('btn-request-access')).toBeInTheDocument();
  });

  it('submits a request and notifies superAdmin role variants', async () => {
    const user = userEvent.setup();
    renderGate();
    await screen.findByTestId('btn-request-access');

    await user.type(screen.getByTestId('input-access-reason'), 'Need shared project files');
    await user.click(screen.getByTestId('btn-request-access'));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'user-1',
        user_name: 'Hope Birungi',
        user_role: 'admin',
        reason: 'Need shared project files',
        status: 'pending',
      }));
    });

    await waitFor(() => {
      expect(profilesInMock).toHaveBeenCalledWith('role', [
        'superAdmin',
        'SuperAdmin',
        'super_admin',
        'superadmin',
      ]);
      expect(invokeMock).toHaveBeenCalledWith(
        'dispatch-notification',
        expect.objectContaining({
          body: expect.objectContaining({
            event_type: 'workspace_access_request',
            recipient_ids: ['sa-1'],
            action_url: '/workspace?action=manage-access',
          }),
        }),
      );
    });

    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Access request sent',
    }));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['workspace_access_request_mine', 'user-1'],
    });
  });
});
