import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ visible: true, filter: () => true }));
const user = {
  id: 'user-1', role: 'admin', email: 'admin@example.com', full_name: 'Admin User',
};
const rows = {
  partners: [
    { id: 'p1', name: 'Acme', type: 'donor', sector: 'Health', country: 'Sudan', website: null, phone: null, email: null, address: null, focal_point_name: null, focal_point_email: null, focal_point_phone: null, status: 'active', notes: null, created_by: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
    { id: 'p2', name: 'Beta', type: 'ngo', sector: 'WASH', country: 'Sudan', website: null, phone: null, email: null, address: null, focal_point_name: null, focal_point_email: null, focal_point_phone: null, status: 'inactive', notes: null, created_by: null, created_at: '2024-01-01', updated_at: '2024-01-01' },
  ],
  assets: [
    { id: 'a1', asset_type: 'laptop', name: 'Laptop A', serial_number: 'A', model: null, purchase_date: null, purchase_value: null, current_condition: 'good', status: 'available', notes: null, hub_id: null },
    { id: 'a2', asset_type: 'phone', name: 'Phone B', serial_number: 'B', model: null, purchase_date: null, purchase_value: null, current_condition: 'good', status: 'retired', notes: null, hub_id: null },
  ],
  employees: [
    { id: 'e1', full_name: 'Alice', role: 'staff', email: 'alice@example.com', department_id: null, employment_type: 'full_time', contract_start_date: null, contract_end_date: null, contract_type: null, is_employee: true },
    { id: 'e2', full_name: 'Bob', role: 'staff', email: 'bob@example.com', department_id: null, employment_type: 'full_time', contract_start_date: null, contract_end_date: null, contract_type: null, is_employee: true },
  ],
};

function chain(table: string) {
  const data = table === 'crm_partners' ? rows.partners
    : table === 'hr_assets' ? rows.assets
      : table === 'profiles' ? rows.employees
        : table === 'departments' ? [] : [];
  const result = { data, error: null };
  const api: any = {};
  for (const method of ['select', 'order', 'eq', 'is', 'in', 'limit', 'maybeSingle', 'contains']) api[method] = () => api;
  api.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  return api;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => chain(table), rpc: () => chain('none') },
}));
vi.mock('@/context/CurrentUserAccessContext', () => ({
  useCurrentUserAccess: () => ({
    isFilterVisible: access.filter, isTabBlocked: () => false,
    overrides: new Map(), refresh: vi.fn(), loading: false, filterLoading: false, filterError: null,
  }),
}));
vi.mock('@/context/user/UserContext', () => ({
  useUser: () => ({ currentUser: user, users: rows.employees, refreshUsers: vi.fn(), approveUser: vi.fn(), rejectUser: vi.fn(), sendPasswordRecoveryEmail: vi.fn() }),
}));
vi.mock('@/hooks/use-authorization', () => ({
  useAuthorization: () => ({ isSuperAdmin: () => true, checkPermission: () => true }),
}));
vi.mock('@/hooks/usePageManageOverride', () => ({ usePageManageOverride: () => true }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({ roles: ['admin'], currentUser: user }),
  useAppContextSelector: (selector: (value: unknown) => unknown) => selector({ roles: ['admin'], currentUser: user }),
}));
vi.mock('@/context/superAdmin/SuperAdminContext', () => ({ useSuperAdmin: () => ({ isSuperAdmin: true }) }));
vi.mock('@/context/project/ProjectContext', () => ({ useProjectContext: () => ({ projects: [], updateProjectTeam: vi.fn(), fetchProjects: vi.fn() }) }));
vi.mock('@/context/approval/ApprovalContext', () => ({ useApproval: () => ({}) }));
vi.mock('@/context/role-management/RoleManagementContext', () => ({ useRoleManagement: () => ({ roles: [], getUserRolesByUserId: () => [] }) }));
vi.mock('@/context/location/LocationContext', () => ({ useLocation: () => ({ locations: [] }) }));
vi.mock('@/utils/report-export', () => ({ exportToExcel: vi.fn(), exportMultiSheetExcel: vi.fn() }));
vi.mock('@/utils/formattedExcelExport', () => ({ exportFormattedMultiSheetExcel: vi.fn() }));
vi.mock('@/services/NotificationTriggerService', () => ({ NotificationTriggerService: {} }));
vi.mock('@/services/notification-insert', () => ({ insertNotificationsToDb: vi.fn() }));
vi.mock('@/components/ui/connected-pages-bar', () => ({ ConnectedPagesBar: () => null }));
vi.mock('@/components/mmp/CycleProgressBar', () => ({ CycleProgressBar: () => null }));

import CRMPartners from '@/pages/CRMPartners';
import HRAssets from '@/pages/HRAssets';
import SalaryRetainerReport from '@/pages/SalaryRetainerReport';
import FieldOperationManager from '@/pages/FieldOperationManager';
import Departments from '@/pages/Departments';
import { exportToExcel } from '@/utils/report-export';

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

function renderPage(page: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{page}</QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...view, rerenderPage: (nextPage: React.ReactNode) => {
    access.filter = () => access.visible;
    view.rerender(<MemoryRouter><QueryClientProvider client={client}>{nextPage}</QueryClientProvider></MemoryRouter>);
  } };
}

describe('registered production page filter interactions', () => {
  beforeEach(() => { access.visible = true; access.filter = () => access.visible; vi.clearAllMocks(); });

  it('renders CRM partners and removes a hidden status filter while preserving partner rows', async () => {
    const view = renderPage(<CRMPartners />);
    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText(/Status/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search by name, contact, sector...'), { target: { value: 'Acme' } });
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    access.visible = false;
    view.rerenderPage(<CRMPartners />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search by name, contact, sector...')).not.toBeInTheDocument();
  });

  it('renders HR assets and removes hidden filter controls without removing export', async () => {
    const view = renderPage(<HRAssets />);
    expect(await screen.findByText('Laptop A')).toBeInTheDocument();
    expect(screen.getByTestId('button-export-assets')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('input-search-assets'), { target: { value: 'Laptop' } });
    expect(screen.queryByText('Phone B')).not.toBeInTheDocument();
    access.visible = false;
    view.rerenderPage(<HRAssets />);
    await waitFor(() => expect(screen.queryByText('Asset Type')).not.toBeInTheDocument());
    expect(screen.getByTestId('button-export-assets')).toBeInTheDocument();
    expect(screen.getByText('Phone B')).toBeInTheDocument();
  });

  it('renders Finance salary/retainer report and keeps export controls when filters hide', async () => {
    const view = renderPage(<SalaryRetainerReport />);
    expect(await screen.findByText('Salary & Retainer Cost Report')).toBeInTheDocument();
    expect(screen.getByTestId('button-export')).toBeInTheDocument();
    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('input-search'), { target: { value: 'Alice' } });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    access.visible = false;
    view.rerenderPage(<SalaryRetainerReport />);
    await waitFor(() => expect(screen.queryByTestId('input-search')).not.toBeInTheDocument());
    expect(screen.getByTestId('button-export')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('button-export'));
    fireEvent.click(screen.getByTestId('button-export'));
    fireEvent.click(await screen.findByText('Export Excel'));
    expect(exportToExcel).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ Employee: 'Alice' }), expect.objectContaining({ Employee: 'Bob' })]),
      expect.any(String),
      expect.any(String),
    );
  });

  it('renders Field Operations with mandatory access scope and hides its optional filters', async () => {
    const view = renderPage(<FieldOperationManager />);
    expect(await screen.findByText(/Field Operation Manager/i)).toBeInTheDocument();
    access.visible = false;
    view.rerenderPage(<FieldOperationManager />);
    await waitFor(() => expect(screen.queryByPlaceholderText('Search by MMP name, ID, or status...')).not.toBeInTheDocument());
    expect(screen.queryByText('Filter by Month')).not.toBeInTheDocument();
    expect(screen.getByText(/Field Operation Manager/i)).toBeInTheDocument();
  });

  it('renders Administration departments with tabs while hidden filters settle to neutral', async () => {
    const view = renderPage(<Departments />);
    expect(await screen.findByTestId('tab-departments')).toBeInTheDocument();
    access.visible = false;
    view.rerenderPage(<Departments />);
    await waitFor(() => expect(screen.queryByTestId('input-search-depts')).not.toBeInTheDocument());
    expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
    expect(screen.getByTestId('tab-orgchart')).toBeInTheDocument();
  });
});