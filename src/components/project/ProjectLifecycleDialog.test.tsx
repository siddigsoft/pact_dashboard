import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectLifecycleDialog } from './ProjectLifecycleDialog';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), audit: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/hooks/use-authorization', () => ({ useAuthorization: () => ({ checkPermission: () => true }) }));
vi.mock('@/hooks/toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/utils/audit-logger', () => ({ logAuditEvent: mocks.audit }));
vi.mock('@/lib/notify', () => ({ dispatchNotification: vi.fn() }));
const empty = { can_close: true, can_delete_empty: true, dependencies: {}, items: [] };
function mount(onDelete = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ProjectLifecycleDialog open mode="delete" projectId="p" projectName="Example" onClose={onClose} onDelete={onDelete} />
  </QueryClientProvider>);
  return { onDelete, onClose };
}
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: empty, error: null }); });
describe('project removal safety', () => {
  it('requires exact project-name confirmation before deleting', async () => {
    const { onDelete } = mount();
    const button = await screen.findByRole('button', { name: 'Delete empty project' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Confirm project name'), { target: { value: 'Example' } });
    fireEvent.click(button);
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
  });
  it('blocks deletion of populated projects and offers retention', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...empty, can_delete_empty: false, can_close: false, dependencies: { project_field_tasks: 12 } }, error: null });
    const { onDelete } = mount();
    const button = await screen.findByRole('button', { name: 'Delete empty project' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Close as completed' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('12')).toBeTruthy();
    fireEvent.click(button); expect(onDelete).not.toHaveBeenCalled();
  });
  it('does not close or navigate away after a failed deletion', async () => {
    const { onClose } = mount(vi.fn().mockRejectedValue(new Error('Linked records were added during confirmation.')));
    await screen.findByLabelText('Confirm project name');
    fireEvent.change(screen.getByLabelText('Confirm project name'), { target: { value: 'Example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete empty project' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Linked records were added during confirmation.');
    expect(onClose).not.toHaveBeenCalled();
  });
  it('fails closed and offers retry when safety checks fail', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Safety function not installed' } });
    mount();
    expect(await screen.findByRole('button', { name: 'Retry safety check' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete empty project' })).toBeNull();
  });
});
