import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectTaskReviewPanel } from './ProjectTaskReviewPanel';
import type { FieldTask } from '@/hooks/useProjectTasks';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), notify: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/notify', () => ({ dispatchNotification: mocks.notify }));
const task = { id: 'task', projectId: 'project', title: 'Example', status: 'done', reviewRequired: true,
  assignedTo: '00000000-0000-4000-8000-000000000001', assignedToName: 'Owner',
  coAssigneeIds: ['00000000-0000-4000-8000-000000000002'], updatedAt: '2026-11-06T12:00:00Z',
  acceptanceCriteria: 'Check the supporting evidence.' } as FieldTask;
function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ProjectTaskReviewPanel task={task} />
  </QueryClientProvider>);
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks(); mocks.notify.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({ data: { accepted: false, can_review: true, reviews: [] }, error: null });
});
describe('independent task reviews', () => {
  it('loading review status does not send any notification', async () => {
    mount(); await screen.findByRole('button', { name: 'Accept work' });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('project_task_review_state', { p_task: task.id });
  });
  it('saves individual contributions before notifying assignees', async () => {
    mount();
    const button = await screen.findByRole('button', { name: 'Accept work' });
    fireEvent.change(screen.getByLabelText('Review decision note'), { target: { value: 'The evidence meets the criteria.' } });
    const fields = screen.getAllByPlaceholderText(/Record this person/);
    fireEvent.change(fields[0], { target: { value: 'Prepared the verified evidence.' } });
    fireEvent.change(fields[1], { target: { value: 'Completed the field activity.' } });
    fireEvent.click(button);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('review_project_task', {
      p_task: task.id, p_decision: 'accepted', p_note: 'The evidence meets the criteria.',
      p_contributions: { [task.assignedTo!]: 'Prepared the verified evidence.', [task.coAssigneeIds[0]]: 'Completed the field activity.' },
    }));
    await waitFor(() => expect(mocks.notify).toHaveBeenCalledOnce());
  });
});
