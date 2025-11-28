export interface TrackerPlanConfig {
  id: string;
  name: string;
  project_id?: string;
  project_name?: string;
  hub_id?: string;
  hub_name?: string;
  month: number;
  year: number;
  states: string[];
  localities: string[];
  activity_types: string[];
  created_by: string;
  created_at: string;
  updated_at?: string;
}

export interface TrackerPlanRun {
  id: string;
  config_id: string;
  run_date: string;
  planned_count: number;
  actual_count: number;
  coverage_percentage: number;
  planned_budget: number;
  actual_cost: number;
  variance: number;
  export_file_url?: string;
  created_by: string;
  created_at: string;
}

export interface TrackerLineItem {
  id: string;
  run_id?: string;
  registry_site_id?: string;
  mmp_site_entry_id?: string;
  site_visit_id?: string;
  site_code: string;
  site_name: string;
  state: string;
  locality: string;
  hub_office?: string;
  cp_name?: string;
  activity_at_site?: string;
  survey_tool?: string;
  planned_date?: string;
  actual_date?: string;
  planned_status: 'pending' | 'dispatched' | 'assigned' | 'scheduled';
  actual_status: 'not_started' | 'in_progress' | 'completed' | 'cancelled';
  enumerator_id?: string;
  enumerator_name?: string;
  enumerator_classification?: string;
  planned_budget: number;
  actual_cost: number;
  enumerator_fee: number;
  transport_cost: number;
  accommodation_cost: number;
  meal_per_diem: number;
  logistics_cost: number;
  invoice_amount: number;
  invoice_status: 'pending' | 'included' | 'invoiced' | 'paid';
  notes?: string;
  is_variance: boolean;
}

export interface TrackerSummary {
  totalPlanned: number;
  totalActual: number;
  coveragePercentage: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  cancelledCount: number;
  totalPlannedBudget: number;
  totalActualCost: number;
  totalVariance: number;
  totalEnumeratorFees: number;
  totalTransportCost: number;
  stateBreakdown: StateBreakdown[];
  hubBreakdown: HubBreakdown[];
  enumeratorBreakdown: EnumeratorBreakdown[];
}

export interface StateBreakdown {
  state: string;
  planned: number;
  actual: number;
  coverage: number;
  budget: number;
  cost: number;
}

export interface HubBreakdown {
  hub: string;
  planned: number;
  actual: number;
  coverage: number;
  budget: number;
  cost: number;
}

export interface EnumeratorBreakdown {
  enumeratorId: string;
  enumeratorName: string;
  classification: string;
  sitesCompleted: number;
  totalFees: number;
  totalTransport: number;
  totalAmount: number;
}

export interface TrackerFilters {
  projectId?: string;
  hubId?: string;
  month?: number;
  year?: number;
  states: string[];
  localities: string[];
  activityTypes: string[];
  status?: string;
  enumeratorId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface InvoicePreparation {
  id: string;
  tracker_run_id: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  project_name: string;
  hub_name?: string;
  period: string;
  total_sites: number;
  total_enumerator_fees: number;
  total_transport_costs: number;
  total_accommodation: number;
  total_meals: number;
  total_logistics: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: 'draft' | 'pending' | 'sent' | 'paid';
  notes?: string;
  line_items: InvoiceLineItem[];
  created_at: string;
  created_by: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  category: 'enumerator_fee' | 'transport' | 'accommodation' | 'meals' | 'logistics' | 'other';
}
