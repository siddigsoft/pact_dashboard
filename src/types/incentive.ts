/**
 * TypeScript types for the Incentive Bonus System.
 *
 * Three DB tables:
 *   incentive_configs        → IncentiveConfig
 *   mmp_incentive_snapshots  → MmpIncentiveSnapshot
 *   mmp_incentive_payments   → MmpIncentivePayment
 */

// ─── Enums / literals ────────────────────────────────────────────────────────

export type IncentiveRole =
  | 'coordinator'
  | 'supervisor'
  | 'datacollector'
  | 'fom'
  | 'teamleader';

export type IncentiveSplitMethod = 'proportional' | 'equal';

export type IncentiveWhatCounts = 'wfp_confirmed' | 'submitted';

export type IncentiveSnapshotStatus =
  | 'calculating'
  | 'pre_approved'
  | 'approved'
  | 'paid';

export type IncentivePaymentStatus = 'pending' | 'paid';

export type IncentivePaymentMethod = 'wallet' | 'payroll';

// ─── DB row types (snake_case, as returned by Supabase) ──────────────────────

export interface IncentiveConfigRow {
  id: string;
  hub_id: string | null;
  role: IncentiveRole;
  is_active: boolean;
  bonus_pct: number;
  split_method: IncentiveSplitMethod;
  coverage_threshold_pct: number;
  what_counts: IncentiveWhatCounts;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MmpIncentiveSnapshotRow {
  id: string;
  mmp_id: string;
  status: IncentiveSnapshotStatus;
  total_dc_fee_pool_cents: number;
  total_bonus_cents: number;
  config_snapshot: Record<string, unknown> | null;
  pre_approved_by: string | null;
  pre_approved_at: string | null;
  approved_at: string | null;
  locked_at: string | null;
  skipped: boolean;
  skipped_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MmpIncentivePaymentRow {
  id: string;
  snapshot_id: string;
  mmp_id: string;
  user_id: string;
  role: IncentiveRole;
  state_id: string | null;
  hub_id: string | null;
  hub_name: string | null;
  dc_count: number;
  dc_fee_pool_cents: number;
  bonus_pct: number;
  bonus_amount_cents: number;
  currency: string;
  excluded: boolean;
  exclusion_note: string | null;
  payment_method: IncentivePaymentMethod | null;
  payroll_period: string | null;
  paid_by: string | null;
  paid_at: string | null;
  status: IncentivePaymentStatus;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

// ─── App-layer types (camelCase) ─────────────────────────────────────────────

export interface IncentiveConfig {
  id: string;
  hubId: string | null;
  role: IncentiveRole;
  isActive: boolean;
  bonusPct: number;
  splitMethod: IncentiveSplitMethod;
  coverageThresholdPct: number;
  whatCounts: IncentiveWhatCounts;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MmpIncentiveSnapshot {
  id: string;
  mmpId: string;
  status: IncentiveSnapshotStatus;
  totalDcFeePoolCents: number;
  totalBonusCents: number;
  configSnapshot: Record<string, unknown> | null;
  preApprovedBy: string | null;
  preApprovedAt: string | null;
  approvedAt: string | null;
  lockedAt: string | null;
  skipped: boolean;
  skippedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MmpIncentivePayment {
  id: string;
  snapshotId: string;
  mmpId: string;
  userId: string;
  role: IncentiveRole;
  stateId: string | null;
  hubId: string | null;
  hubName: string | null;
  dcCount: number;
  dcFeePoolCents: number;
  bonusPct: number;
  bonusAmountCents: number;
  currency: string;
  excluded: boolean;
  exclusionNote: string | null;
  paymentMethod: IncentivePaymentMethod | null;
  payrollPeriod: string | null;
  paidBy: string | null;
  paidAt: string | null;
  status: IncentivePaymentStatus;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields (optional — populated when fetched with joins)
  userName?: string;
  userEmail?: string;
}

// ─── Transforms ──────────────────────────────────────────────────────────────

export function transformIncentiveConfig(row: IncentiveConfigRow): IncentiveConfig {
  return {
    id: row.id,
    hubId: row.hub_id,
    role: row.role,
    isActive: row.is_active,
    bonusPct: Number(row.bonus_pct),
    splitMethod: row.split_method,
    coverageThresholdPct: Number(row.coverage_threshold_pct),
    whatCounts: row.what_counts,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function transformMmpIncentiveSnapshot(row: MmpIncentiveSnapshotRow): MmpIncentiveSnapshot {
  return {
    id: row.id,
    mmpId: row.mmp_id,
    status: row.status,
    totalDcFeePoolCents: row.total_dc_fee_pool_cents,
    totalBonusCents: row.total_bonus_cents,
    configSnapshot: row.config_snapshot,
    preApprovedBy: row.pre_approved_by,
    preApprovedAt: row.pre_approved_at,
    approvedAt: row.approved_at,
    lockedAt: row.locked_at,
    skipped: row.skipped,
    skippedReason: row.skipped_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function transformMmpIncentivePayment(row: MmpIncentivePaymentRow & {
  profiles?: { full_name?: string; email?: string } | null;
}): MmpIncentivePayment {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    mmpId: row.mmp_id,
    userId: row.user_id,
    role: row.role,
    stateId: row.state_id,
    hubId: row.hub_id,
    hubName: row.hub_name,
    dcCount: row.dc_count,
    dcFeePoolCents: row.dc_fee_pool_cents,
    bonusPct: Number(row.bonus_pct),
    bonusAmountCents: row.bonus_amount_cents,
    currency: row.currency,
    excluded: row.excluded,
    exclusionNote: row.exclusion_note,
    paymentMethod: row.payment_method,
    payrollPeriod: row.payroll_period,
    paidBy: row.paid_by,
    paidAt: row.paid_at,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userName: row.profiles?.full_name ?? undefined,
    userEmail: row.profiles?.email ?? undefined,
  };
}

// ─── Helper constants ────────────────────────────────────────────────────────

export const INCENTIVE_ROLE_LABELS: Record<IncentiveRole, string> = {
  coordinator:   'Coordinator',
  supervisor:    'Supervisor',
  datacollector: 'Data Collector',
  fom:           'FOM',
  teamleader:    'Team Leader',
};

export const INCENTIVE_STATUS_LABELS: Record<IncentiveSnapshotStatus, string> = {
  calculating:  'Calculating',
  pre_approved: 'Pre-Approved',
  approved:     'Approved',
  paid:         'Paid',
};

export const INCENTIVE_STATUS_COLORS: Record<IncentiveSnapshotStatus, string> = {
  calculating:  'bg-blue-100 text-blue-700',
  pre_approved: 'bg-amber-100 text-amber-700',
  approved:     'bg-green-100 text-green-700',
  paid:         'bg-emerald-100 text-emerald-700',
};

export const INCENTIVE_PAYMENT_STATUS_COLORS: Record<IncentivePaymentStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid:    'bg-emerald-100 text-emerald-700',
};

/** Roles that receive incentive payments (active by default at launch). */
export const DEFAULT_ACTIVE_INCENTIVE_ROLES: IncentiveRole[] = ['coordinator', 'supervisor'];

/** All roles that can ever be configured in the incentive system. */
export const ALL_INCENTIVE_ROLES: IncentiveRole[] = [
  'coordinator',
  'supervisor',
  'datacollector',
  'fom',
  'teamleader',
];

/** Format cents to a human-readable amount string. */
export function formatIncentiveCents(cents: number, currency = 'SDG'): string {
  const amount = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${currency} ${amount}`;
}
