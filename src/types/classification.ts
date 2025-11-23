// ============================================================================
// CLASSIFICATION SYSTEM TYPES
// ============================================================================
// TypeScript types for the team member classification system
// ============================================================================

export type ClassificationLevel = 'A' | 'B' | 'C';

export type ClassificationRoleScope = 'coordinator' | 'dataCollector' | 'supervisor';

export type RetainerFrequency = 'monthly' | 'quarterly' | 'annual';

export interface UserClassification {
  id: string;
  userId: string;
  classificationLevel: ClassificationLevel;
  roleScope: ClassificationRoleScope;
  effectiveFrom: string;
  effectiveUntil?: string;
  hasRetainer: boolean;
  retainerAmountCents: number;
  retainerCurrency: string;
  retainerFrequency: RetainerFrequency;
  assignedBy?: string;
  changeReason?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentUserClassification extends UserClassification {
  fullName: string;
  email: string;
  userRole: string;
}

export interface ClassificationFeeStructure {
  id: string;
  classificationLevel: ClassificationLevel;
  roleScope: ClassificationRoleScope;
  siteVisitBaseFeeCents: number;
  siteVisitTransportFeeCents: number;
  complexityMultiplier: number;
  currency: string;
  validFrom: string;
  validUntil?: string;
  metadata?: Record<string, any>;
  isActive: boolean;
  createdBy?: string;
  updatedBy?: string;
  changeNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassificationFeeResult {
  baseFeeCents: number;
  transportFeeCents: number;
  complexityMultiplier: number;
}

export interface CreateClassificationRequest {
  userId: string;
  classificationLevel: ClassificationLevel;
  roleScope: ClassificationRoleScope;
  effectiveFrom?: string;
  effectiveUntil?: string;
  hasRetainer?: boolean;
  retainerAmountCents?: number;
  retainerCurrency?: string;
  retainerFrequency?: RetainerFrequency;
  changeReason?: string;
  notes?: string;
}

export interface UpdateClassificationRequest {
  classificationLevel?: ClassificationLevel;
  effectiveFrom?: string;
  effectiveUntil?: string;
  hasRetainer?: boolean;
  retainerAmountCents?: number;
  retainerCurrency?: string;
  retainerFrequency?: RetainerFrequency;
  changeReason?: string;
  notes?: string;
  isActive?: boolean;
}

export interface CreateFeeStructureRequest {
  classificationLevel: ClassificationLevel;
  roleScope: ClassificationRoleScope;
  siteVisitBaseFeeCents: number;
  siteVisitTransportFeeCents: number;
  complexityMultiplier?: number;
  currency?: string;
  validFrom?: string;
  validUntil?: string;
  metadata?: Record<string, any>;
  changeNotes?: string;
}

export interface UpdateFeeStructureRequest {
  siteVisitBaseFeeCents?: number;
  siteVisitTransportFeeCents?: number;
  complexityMultiplier?: number;
  validFrom?: string;
  validUntil?: string;
  metadata?: Record<string, any>;
  changeNotes?: string;
  isActive?: boolean;
}

// Helper types for UI
export interface ClassificationBadgeProps {
  level: ClassificationLevel;
  roleScope?: ClassificationRoleScope;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export interface ClassificationHistory {
  id: string;
  classificationLevel: ClassificationLevel;
  roleScope: ClassificationRoleScope;
  effectiveFrom: string;
  effectiveUntil?: string;
  assignedBy?: string;
  assignedByName?: string;
  changeReason?: string;
  createdAt: string;
}

// Constants for UI display
export const CLASSIFICATION_COLORS: Record<ClassificationLevel, string> = {
  A: 'bg-emerald-500 text-white border-emerald-600',
  B: 'bg-blue-500 text-white border-blue-600',
  C: 'bg-amber-500 text-white border-amber-600',
};

export const CLASSIFICATION_LABELS: Record<ClassificationLevel, string> = {
  A: 'Level A - Experienced',
  B: 'Level B - Intermediate',
  C: 'Level C - Entry-level',
};

export const ROLE_SCOPE_LABELS: Record<ClassificationRoleScope, string> = {
  coordinator: 'Coordinator',
  dataCollector: 'Data Collector',
  supervisor: 'Supervisor',
};
