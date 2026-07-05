// T017: shared row types for HR/finance tables that predate the generated
// Supabase types (they were added via manual SQL migrations under
// supabase/migrations/, so `src/integrations/supabase/types.ts` — which is
// only regenerated from an introspected live schema — doesn't know about
// them). Components previously reached for `supabase.from('table' as any)`
// everywhere they touched these tables, losing all type-checking on both the
// query and the returned rows. Centralizing the row shapes here lets call
// sites cast once (`as unknown as T[]`) with an actual known shape instead of
// scattering untyped `as any` casts.
//
// NOTE: this covers the tables introduced in this session's HR/Finance work.
// A full sweep of every legacy `as any` table cast in the codebase is a
// larger, separate effort and out of scope here.

export interface HrSalaryAdvanceRow {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  issue_date: string;
  reason: string | null;
  monthly_recovery: number | null;
  notes: string | null;
  status: 'active' | 'fully_recovered' | 'written_off';
  created_at: string;
  created_by: string | null;
}

export interface HrSalaryAdvanceRecoveryRow {
  id: string;
  advance_id: string;
  recovery_date: string;
  amount: number;
  payroll_period: string | null;
  notes: string | null;
  created_at: string;
}

export interface HrEosbSettingsRow {
  id: string;
  tier1_years_threshold: number;
  tier1_days_per_year: number;
  tier2_days_per_year: number;
  days_per_month: number;
  min_service_months: number;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export interface EosbAccrualRow {
  id: string;
  user_id: string;
  period: string;
  opening_balance: number;
  accrued_amount: number;
  closing_balance: number;
  base_salary: number | null;
  currency: string;
  created_at: string;
}

export interface EmployeeSalaryConfigRow {
  id: string;
  user_id: string;
  base_salary: number;
  currency: string;
  allowances: unknown[];
  deductions: unknown[];
  effective_date: string | null;
  created_by: string | null;
}

export interface AcctGlBridgeLogRow {
  id: string;
  source_table: string;
  source_id: string;
  status: 'success' | 'error' | 'skipped';
  event_type: string;
  created_at: string;
}
