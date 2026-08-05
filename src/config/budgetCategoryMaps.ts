/**
 * budgetCategoryMaps.ts — single source of truth for budget category mappings.
 *
 * Why this file exists:
 *   LEGACY_KEY_MAP (EditProjectBudgetDialog) and BUDGET_CAT_TO_EXPENSE /
 *   BUDGET_CAT_LABELS (ProjectCostTab) used to be hand-maintained in parallel.
 *   Whenever a new legacy key was added to one file the other would silently
 *   drift, causing the Cost Tab reconciliation chart to drop categories.
 *   All three maps are now derived from the structures below so there is one
 *   place to add a new key and every consumer stays in sync automatically.
 */

// ── 1. Canonical category definitions ────────────────────────────────────────
//   value  : the canonical DB key stored in category_allocations
//   label  : human-readable label shown in selects and charts
//   expense : nearest expense_category key used by cost submissions

export interface CanonicalCategory {
  value: string;
  label: string;
  /** Maps to this expense_category key in cost submissions */
  expense: string;
}

export const CANONICAL_CATEGORIES: CanonicalCategory[] = [
  { value: 'personnel_labor_fees',        label: 'Personnel & Labor Fees',         expense: 'other' },
  { value: 'transportation_logistics',    label: 'Transportation & Logistics',      expense: 'general_transport' },
  { value: 'equipment_supplies',          label: 'Equipment & Supplies',            expense: 'equipment' },
  { value: 'field_operations_activities', label: 'Field Operations & Activities',   expense: 'meetings' },
  { value: 'internet_communication',      label: 'Internet & Communication',        expense: 'communications' },
  { value: 'permits_taxes_legal',         label: 'Permits, Taxes & Legal Fees',     expense: 'permits' },
  { value: 'management_overhead',         label: 'Management & Overhead',           expense: 'other' },
  { value: 'contingency_reserve',         label: 'Contingency / Reserve',           expense: 'other' },
];

/** Canonical category options for Select components (value + label only). */
export const CATEGORY_OPTIONS = CANONICAL_CATEGORIES.map(c => ({
  value: c.value,
  label: c.label,
}));

// ── 2. Legacy key → canonical key map ────────────────────────────────────────
//   Every key observed in historical budget data that differs from the eight
//   canonical keys above must be listed here.  Keys that ARE canonical already
//   pass through `LEGACY_KEY_MAP[key] ?? key` unchanged — no entry needed.

export const LEGACY_KEY_MAP: Record<string, string> = {
  // ── Transportation ────────────────────────────────────────────────────────
  transportation_and_visit_fees:   'transportation_logistics',
  transportation:                  'transportation_logistics',
  transport:                       'transportation_logistics',
  vehicle:                         'transportation_logistics',
  site_visits:                     'transportation_logistics',

  // ── Personnel / labor ────────────────────────────────────────────────────
  professional_fees:               'personnel_labor_fees',
  personnel_fees:                  'personnel_labor_fees',
  enumerator_fees:                 'personnel_labor_fees',
  supervisor_fees:                 'personnel_labor_fees',
  supervision_fees:                'personnel_labor_fees',
  contractor_fees:                 'personnel_labor_fees',
  facilitator_fees:                'personnel_labor_fees',
  evaluation_team_fees:            'personnel_labor_fees',
  reviewer_fees:                   'personnel_labor_fees',
  review_fees:                     'personnel_labor_fees',
  proposal_writing_fees:           'personnel_labor_fees',
  key_informant_incentives:        'personnel_labor_fees',
  incentives:                      'personnel_labor_fees',
  allowances:                      'personnel_labor_fees',
  per_diem:                        'personnel_labor_fees',

  // ── Equipment / supplies ─────────────────────────────────────────────────
  equipment:                       'equipment_supplies',
  supplies:                        'equipment_supplies',
  materials:                       'equipment_supplies',
  data_collection_tools:           'equipment_supplies',
  printing:                        'equipment_supplies',
  printing_and_materials:          'equipment_supplies',
  training_materials:              'equipment_supplies',
  publication_costs:               'equipment_supplies',

  // ── Field ops / activities ───────────────────────────────────────────────
  accommodation:                   'field_operations_activities',
  catering:                        'field_operations_activities',
  meals:                           'field_operations_activities',
  training:                        'field_operations_activities',
  meetings:                        'field_operations_activities',
  field_operations:                'field_operations_activities',
  report_production:               'field_operations_activities',
  venue_costs:                     'field_operations_activities',
  workshop_facilitation:           'field_operations_activities',
  construction_costs:              'field_operations_activities',
  research_protocol_costs:         'field_operations_activities',

  // ── Internet / comms ─────────────────────────────────────────────────────
  internet_and_communication_fees: 'internet_communication',
  communications:                  'internet_communication',
  communication:                   'internet_communication',

  // ── Permits / legal ──────────────────────────────────────────────────────
  permit_fee:                      'permits_taxes_legal',
  permits:                         'permits_taxes_legal',

  // ── Overhead / admin ─────────────────────────────────────────────────────
  management_overhead_legacy:      'management_overhead',
  overhead:                        'management_overhead',
  data_management:                 'management_overhead',
  document_management:             'management_overhead',

  // ── Contingency / catch-all ──────────────────────────────────────────────
  contingency:                     'contingency_reserve',
  miscellaneous:                   'contingency_reserve',
  other:                           'contingency_reserve',
};

// ── 3. Per-legacy expense overrides ──────────────────────────────────────────
//   Most legacy keys inherit their expense_category from their canonical target.
//   A small number of legacy keys intentionally map to a *different* expense
//   bucket than their canonical category's default.  Add entries here only when
//   the legacy key genuinely belongs to a more-specific expense bucket.

export const LEGACY_EXPENSE_OVERRIDE: Record<string, string> = {
  // key_informant_incentives and incentives are personnel-adjacent but should
  // appear in the 'incentives' expense bucket, not the generic 'other' bucket
  // that personnel_labor_fees defaults to.
  key_informant_incentives: 'incentives',
  incentives:               'incentives',

  // Printing items belong in 'printing', not the 'equipment' bucket that
  // equipment_supplies defaults to.
  printing:                 'printing',
  printing_and_materials:   'printing',

  // Training maps to the 'training' expense bucket, not 'meetings' that
  // field_operations_activities defaults to.
  training:                 'training',
};

// ── 4. Derived maps (auto-built — do NOT hand-edit) ───────────────────────────

// canonical key → expense_category key
const _canonicalToExpense: Record<string, string> = Object.fromEntries(
  CANONICAL_CATEGORIES.map(c => [c.value, c.expense]),
);

// canonical key → human label
const _canonicalToLabel: Record<string, string> = Object.fromEntries(
  CANONICAL_CATEGORIES.map(c => [c.value, c.label]),
);

/**
 * Maps every budget category_allocations key (canonical **and** legacy) to its
 * nearest expense_category key.  Used by ProjectCostTab for reconciliation.
 *
 * Resolution order:
 *   1. Canonical key → uses CANONICAL_CATEGORIES[n].expense
 *   2. Legacy key with an explicit LEGACY_EXPENSE_OVERRIDE entry → uses that
 *   3. Legacy key without override → inherits canonical target's expense
 */
export const BUDGET_CAT_TO_EXPENSE: Record<string, string> = {
  // Canonical keys first
  ..._canonicalToExpense,
  // Legacy keys: use per-key override when present, else inherit canonical expense
  ...Object.fromEntries(
    Object.entries(LEGACY_KEY_MAP).map(([legacy, canonical]) => [
      legacy,
      LEGACY_EXPENSE_OVERRIDE[legacy] ?? _canonicalToExpense[canonical] ?? 'other',
    ]),
  ),
};

/**
 * Human labels for every budget category key (canonical **and** legacy).
 * All legacy keys resolve to the same label as their canonical counterpart so
 * every surface (BudgetCard, EditProjectBudgetDialog, ProjectCostTab) is
 * consistent.
 */
export const BUDGET_CAT_LABELS: Record<string, string> = {
  // Canonical keys first
  ..._canonicalToLabel,
  // Legacy keys resolved through their canonical target
  ...Object.fromEntries(
    Object.entries(LEGACY_KEY_MAP).map(([legacy, canonical]) => [
      legacy,
      _canonicalToLabel[canonical] ?? canonical,
    ]),
  ),
};
