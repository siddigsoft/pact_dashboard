import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '../user/UserContext';
import { useToast } from '@/hooks/use-toast';
import {
  SuperAdmin,
  CreateSuperAdmin,
  DeactivateSuperAdmin,
  SuperAdminStats,
  DeletionAuditLog,
  CreateDeletionLog,
} from '@/types/super-admin';

interface SuperAdminContextType {
  superAdmins: SuperAdmin[];
  deletionLogs: DeletionAuditLog[];
  stats: SuperAdminStats | null;
  loading: boolean;
  isSuperAdmin: boolean;
  canAddSuperAdmin: boolean;
  refreshSuperAdmins: () => Promise<void>;
  refreshDeletionLogs: () => Promise<void>;
  createSuperAdmin: (data: CreateSuperAdmin) => Promise<boolean>;
  deactivateSuperAdmin: (data: DeactivateSuperAdmin) => Promise<boolean>;
  logDeletion: (data: CreateDeletionLog) => Promise<boolean>;
  checkSuperAdminStatus: (userId: string) => Promise<boolean>;
}

const SuperAdminContext = createContext<SuperAdminContextType | undefined>(undefined);

export function useSuperAdmin() {
  const context = useContext(SuperAdminContext);
  if (!context) {
    throw new Error('useSuperAdmin must be used within SuperAdminProvider');
  }
  return context;
}

function transformSuperAdminFromDB(data: any): SuperAdmin {
  return {
    id: data.id,
    userId: data.user_id,
    appointedBy: data.appointed_by,
    appointedAt: data.appointed_at,
    appointmentReason: data.appointment_reason,
    isActive: data.is_active,
    deactivatedAt: data.deactivated_at,
    deactivatedBy: data.deactivated_by,
    deactivationReason: data.deactivation_reason,
    lastActivityAt: data.last_activity_at,
    deletionCount: data.deletion_count || 0,
    adjustmentCount: data.adjustment_count || 0,
    totalActionsCount: data.total_actions_count || 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    metadata: data.metadata || {},
  };
}

function transformDeletionLogFromDB(data: any): DeletionAuditLog {
  return {
    id: data.id,
    tableName: data.table_name,
    recordId: data.record_id,
    recordData: data.record_data,
    deletedBy: data.deleted_by,
    deletedByRole: data.deleted_by_role,
    deletedByName: data.deleted_by_name,
    deletionReason: data.deletion_reason,
    deletedAt: data.deleted_at,
    isRestorable: data.is_restorable,
    restoredAt: data.restored_at,
    restoredBy: data.restored_by,
    restorationNotes: data.restoration_notes,
    createdAt: data.created_at,
    metadata: data.metadata || {},
  };
}

export function SuperAdminProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [superAdmins, setSuperAdmins] = useState<SuperAdmin[]>([]);
  const [deletionLogs, setDeletionLogs] = useState<DeletionAuditLog[]>([]);
  const [stats, setStats] = useState<SuperAdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const checkSuperAdminStatus = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('super_admins')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('Failed to check super-admin status:', error);
      return false;
    }
  }, []);

  const refreshSuperAdmins = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('super_admins')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const admins = (data || []).map(transformSuperAdminFromDB);
      setSuperAdmins(admins);

      const activeCount = admins.filter(a => a.isActive).length;
      setStats({
        activeCount,
        totalCount: admins.length,
        maxAllowed: 3,
        canAddMore: activeCount < 3,
        recentActivity: [],
      });
    } catch (error: any) {
      console.error('Failed to fetch super-admins:', error);
      toast({
        title: 'Error',
        description: 'Failed to load super-admin data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const refreshDeletionLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('deletion_audit_log')
        .select('*')
        .order('deleted_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setDeletionLogs((data || []).map(transformDeletionLogFromDB));
    } catch (error: any) {
      console.error('Failed to fetch deletion logs:', error);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      checkSuperAdminStatus(currentUser.id).then(setIsSuperAdmin);
      refreshSuperAdmins();
      refreshDeletionLogs();
    }
  }, [currentUser, checkSuperAdminStatus, refreshSuperAdmins, refreshDeletionLogs]);

  const createSuperAdmin = async (data: CreateSuperAdmin): Promise<boolean> => {
    try {
      const activeCount = superAdmins.filter(a => a.isActive).length;
      if (activeCount >= 3) {
        toast({
          title: 'Limit Reached',
          description: 'Maximum 3 super-admin accounts allowed. Deactivate one first.',
          variant: 'destructive',
        });
        return false;
      }

      const { error } = await supabase.from('super_admins').insert({
        user_id: data.userId,
        appointed_by: data.appointedBy,
        appointment_reason: data.appointmentReason,
        is_active: true,
      });

      if (error) throw error;

      toast({
        title: 'Super-Admin Created',
        description: 'New super-admin account has been created',
      });

      await refreshSuperAdmins();
      return true;
    } catch (error: any) {
      console.error('Failed to create super-admin:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create super-admin',
        variant: 'destructive',
      });
      return false;
    }
  };

  const deactivateSuperAdmin = async (data: DeactivateSuperAdmin): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('super_admins')
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivated_by: data.deactivatedBy,
          deactivation_reason: data.deactivationReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.superAdminId);

      if (error) throw error;

      toast({
        title: 'Super-Admin Deactivated',
        description: 'Super-admin account has been deactivated',
      });

      await refreshSuperAdmins();
      return true;
    } catch (error: any) {
      console.error('Failed to deactivate super-admin:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to deactivate super-admin',
        variant: 'destructive',
      });
      return false;
    }
  };

  const logDeletion = async (data: CreateDeletionLog): Promise<boolean> => {
    try {
      const { error } = await supabase.from('deletion_audit_log').insert({
        table_name: data.tableName,
        record_id: data.recordId,
        record_data: data.recordData,
        deleted_by: data.deletedBy,
        deleted_by_role: data.deletedByRole,
        deleted_by_name: data.deletedByName,
        deletion_reason: data.deletionReason,
        is_restorable: data.isRestorable ?? true,
      });

      if (error) throw error;

      await supabase.rpc('increment_super_admin_deletion_count', {
        p_user_id: data.deletedBy,
      });

      await refreshDeletionLogs();
      return true;
    } catch (error: any) {
      console.error('Failed to log deletion:', error);
      return false;
    }
  };

  const value: SuperAdminContextType = {
    superAdmins,
    deletionLogs,
    stats,
    loading,
    isSuperAdmin,
    canAddSuperAdmin: stats?.canAddMore ?? false,
    refreshSuperAdmins,
    refreshDeletionLogs,
    createSuperAdmin,
    deactivateSuperAdmin,
    logDeletion,
    checkSuperAdminStatus,
  };

  return <SuperAdminContext.Provider value={value}>{children}</SuperAdminContext.Provider>;
}
