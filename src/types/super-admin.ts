// Super-Admin Types

export interface SuperAdmin {
  id: string;
  
  // User reference
  userId: string;
  
  // Appointment details
  appointedBy?: string;
  appointedAt: string;
  appointmentReason: string;
  
  // Status
  isActive: boolean;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivationReason?: string;
  
  // Activity tracking
  lastActivityAt?: string;
  deletionCount: number;
  adjustmentCount: number;
  totalActionsCount: number;
  
  // Audit
  createdAt: string;
  updatedAt: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

export interface CreateSuperAdmin {
  userId: string;
  appointedBy?: string;
  appointmentReason: string;
}

export interface DeactivateSuperAdmin {
  superAdminId: string;
  deactivatedBy: string;
  deactivationReason: string;
}

export interface SuperAdminStats {
  activeCount: number;
  totalCount: number;
  maxAllowed: number;
  canAddMore: boolean;
  recentActivity: {
    userId: string;
    userName: string;
    action: string;
    timestamp: string;
  }[];
}

// Deletion Audit Log Types
export interface DeletionAuditLog {
  id: string;
  
  // What was deleted
  tableName: string;
  recordId: string;
  recordData: Record<string, any>; // Complete snapshot
  
  // Who deleted it
  deletedBy: string;
  deletedByRole: string;
  deletedByName?: string;
  deletionReason: string; // MANDATORY
  
  // When
  deletedAt: string;
  
  // Restoration
  isRestorable: boolean;
  restoredAt?: string;
  restoredBy?: string;
  restorationNotes?: string;
  
  // Audit
  createdAt: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

export interface CreateDeletionLog {
  tableName: string;
  recordId: string;
  recordData: Record<string, any>;
  deletedBy: string;
  deletedByRole: string;
  deletedByName?: string;
  deletionReason: string;
  isRestorable?: boolean;
}

export interface RestoreDeletedRecord {
  deletionLogId: string;
  restoredBy: string;
  restorationNotes?: string;
}
