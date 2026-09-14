import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const authorization = vi.hoisted(() => ({
  grants: {} as Record<string, Set<string>>,
}));

vi.mock('@/hooks/use-authorization', () => ({
  useAuthorization: () => ({
    checkPermission: (resource: string, action: string) =>
      authorization.grants[resource]?.has(action) ?? false,
    hasAnyRole: () => false,
    isAuthenticated: true,
    loading: false,
  }),
}));

vi.mock('@/context/AppContext', () => ({
  useAppContext: () => ({
    authReady: true,
    currentUser: null,
  }),
}));

vi.mock('@/hooks/usePageManageOverride', () => ({
  usePageManageOverride: () => false,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/financial/PageInfoBanner', () => ({
  PageInfoBanner: ({ title }: { title: string }) => React.createElement('div', null, title),
}));

vi.mock('@/components/ui/page-loader', () => ({
  PageLoader: ({ label }: { label?: string }) => React.createElement('div', null, label),
}));

vi.mock('@/components/auth/ReportExportGate', () => ({
  ReportExportGate: ({
    resource,
    action = 'export',
    children,
  }: {
    resource: string;
    action?: string;
    children: React.ReactNode;
  }) => {
    const permitted = authorization.grants[resource]?.has(action) ?? false;
    return permitted ? React.createElement(React.Fragment, null, children) : null;
  },
}));

vi.mock('@/utils/report-export', () => ({
  exportToExcel: vi.fn(),
}));

vi.mock('@/lib/accountingFormat', () => ({
  formatNumber: (value: number) => String(value),
  downloadCsv: vi.fn(),
}));

vi.mock('@/services/NotificationTriggerService', () => ({
  NotificationTriggerService: { send: vi.fn() },
}));

vi.mock('recharts', () => {
  const Stub = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  return {
    ResponsiveContainer: Stub,
    BarChart: Stub,
    Bar: Stub,
    XAxis: Stub,
    YAxis: Stub,
    Tooltip: Stub,
    Cell: Stub,
    Legend: Stub,
    LabelList: Stub,
    ComposedChart: Stub,
    Line: Stub,
    CartesianGrid: Stub,
  };
});

function queryResult() {
  const query: Record<string, any> = {};
  const response = { data: [], error: null };
  for (const method of ['select', 'order', 'eq', 'in', 'limit', 'is', 'not', 'update', 'insert']) {
    query[method] = vi.fn(() => query);
  }
  query.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  query.then = (resolve: (value: typeof response) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);
  return query;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => queryResult()),
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
    },
  },
}));

vi.mock('@/hooks/useAccountingQueries', () => ({
  useApAgingQuery: () => ({
    data: { vendors: [], lines: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useBudgetEncumbranceQuery: () => ({
    data: {
      tableExists: true,
      encumbrances: [],
      funds: [],
      accounts: [],
      budgetLines: [],
      actuals: [],
      glLogMap: {},
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import AccountingAPAging from '@/pages/AccountingAPAging';
import AccountingChequeRegister from '@/pages/AccountingChequeRegister';
import AccountingBudgetVsActual from '@/pages/AccountingBudgetVsActual';
import AccountingBudgetPlanning from '@/pages/AccountingBudgetPlanning';
import AccountingBudgetEncumbrance from '@/pages/AccountingBudgetEncumbrance';
import AccountingCashFlowForecast from '@/pages/AccountingCashFlowForecast';
import AccountingDepreciationRun from '@/pages/AccountingDepreciationRun';

type PageCase = {
  name: string;
  Component: React.ComponentType;
  resource: string;
  heading: string;
  exportTestId: string;
};

const pages: PageCase[] = [
  {
    name: 'AP Aging',
    Component: AccountingAPAging,
    resource: 'procurement',
    heading: 'AP Aging Report',
    exportTestId: 'button-export-ap-aging',
  },
  {
    name: 'Cheque Register',
    Component: AccountingChequeRegister,
    resource: 'procurement',
    heading: 'Cheque & Payment Register',
    exportTestId: 'button-export-cheque-register',
  },
  {
    name: 'Budget Variance',
    Component: AccountingBudgetVsActual,
    resource: 'finances',
    heading: 'Budget vs. Actual',
    exportTestId: 'button-export-budget-vs-actual',
  },
  {
    name: 'Budget Planning',
    Component: AccountingBudgetPlanning,
    resource: 'finances',
    heading: 'Budget Planning',
    exportTestId: 'button-export-budget-planning',
  },
  {
    name: 'Budget Encumbrance',
    Component: AccountingBudgetEncumbrance,
    resource: 'finances',
    heading: 'Budget Encumbrance',
    exportTestId: 'button-export-budget-enc',
  },
  {
    name: 'Cash Flow Forecast',
    Component: AccountingCashFlowForecast,
    resource: 'finances',
    heading: 'Cash Flow Forecast',
    exportTestId: 'button-export-cash-flow-forecast',
  },
  {
    name: 'Depreciation Run',
    Component: AccountingDepreciationRun,
    resource: 'fixed_assets',
    heading: 'Depreciation Run',
    exportTestId: 'button-export-depreciation-run',
  },
];

function renderPage(Component: React.ComponentType) {
  return render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>,
  );
}

function pageHeading(page: PageCase) {
  return screen.findByRole('heading', { name: page.heading });
}

describe('accounting report page permissions (task 621)', () => {
  beforeEach(() => {
    authorization.grants = {};
  });

  afterEach(() => {
    cleanup();
  });

  it.each(pages)('$name renders with its canonical read permission', async (page) => {
    authorization.grants = { [page.resource]: new Set(['read']) };

    renderPage(page.Component);

    expect(await pageHeading(page)).toBeInTheDocument();
  });

  it.each(pages)('$name rejects an accounting-only read permission', async (page) => {
    authorization.grants = { accounting: new Set(['read']) };

    renderPage(page.Component);

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: page.heading })).not.toBeInTheDocument(),
    );
  });

  it.each(pages)('$name exposes export only with canonical export permission', async (page) => {
    authorization.grants = { [page.resource]: new Set(['read', 'export']) };
    renderPage(page.Component);
    expect(await screen.findByTestId(page.exportTestId)).toBeInTheDocument();

    cleanup();
    authorization.grants = { [page.resource]: new Set(['read']) };
    renderPage(page.Component);
    expect(await pageHeading(page)).toBeInTheDocument();
    expect(screen.queryByTestId(page.exportTestId)).not.toBeInTheDocument();
  });
});