import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProjectReviewQueue } from './ProjectReviewQueue';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/context/user/UserContext', () => ({ useUser: () => ({ currentUser: { id: 'reviewer' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
function mount() {
  render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ProjectReviewQueue />
  </QueryClientProvider></MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);
describe('independent review queue', () => {
  it('shows reviewer-only work with a link to its actual task', async () => {
    mocks.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: { total: 1, items: [
      { id: 't', project_id: 'p', project_name: 'Project', title: 'Verify delivery', due_date: null },
    ] }, error: null }) });
    mount();
    const link = await screen.findByRole('link', { name: 'Review task' });
    expect(link.getAttribute('href')).toBe('/projects/p?tab=field_tasks&task=t');
    expect(screen.getByText('Verify delivery')).toBeTruthy();
  });
  it('fails visibly rather than showing a false empty queue', async () => {
    mocks.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: null, error: new Error('RPC unavailable') }) });
    mount();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('RPC unavailable'));
    expect(screen.queryByText('No project work is waiting for your acceptance.')).toBeNull();
  });
  it('loads bounded review pages', async () => {
    mocks.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: { total: 21, items: [] }, error: null }) });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'More reviews' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('get_my_project_review_queue', { p_offset: 20, p_limit: 20 }));
  });
});
