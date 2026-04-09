import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isProtectedOwner } from '@/lib/protected-accounts';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '../user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { ensureValidSession } from '@/lib/session-health';
import { withTimeout } from '@/utils/promise-with-timeout';
import { useRealtimeTable } from '@/hooks/useRealtimeResource';
import {
  SuperAdmin,
  CreateSuperAdmin,
  DeactivateSuperAdmin,
  DeleteSuperAdmin,
  SuperAdminStats,
  DeletionAuditLog,
  CreateDeletionLog,
} from '@/types/super-admin';

export interface ResetSiteVisitParams {
  siteVisitId: string;
  reason: string;
  deletedBy: string;
  deletedByName: string;
  deletedByRole: string;
  targetStatus?: 'new' | 'approved' | 'assigned' | 'dispatched';
}

export interface DeleteWalletTransactionParams {
  transactionId: string;
  reason: string;
  deletedBy: string;
  deletedByName: string;
  deletedByRole: string;
}

export interface ResetWalletParams {
  userId: string;
  walletId: string;
  reason: string;
  deletedBy: string;
  deletedByName: string;
  deletedByRole: string;
}

export interface ReclaimSiteParams {
  siteEntryId: string;
  reason: string;
  reclaimedBy: string;
  reclaimedByName: string;
  reclaimedByRole: string;
  cancelPendingAdvances?: boolean;
}

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
  deleteSuperAdmin: (data: DeleteSuperAdmin) => Promise<boolean>;
  logDeletion: (data: CreateDeletionLog) => Promise<boolean>;
  checkSuperAdminStatus: (userId: string) => Promise<boolean>;
  resetSiteVisit: (params: ResetSiteVisitParams) => Promise<boolean>;
  deleteWalletTransaction: (params: DeleteWalletTransactionParams) => Promise<boolean>;
  resetWallet: (params: ResetWalletParams) => Promise<boolean>;
  reclaimSite: (params: ReclaimSiteParams) => Promise<boolean>;
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

  const normalizedUserRole = (currentUser?.role || '').toLowerCase().replace(/[\s_-]/g, '');
  const isLikelySuperAdminRole = normalizedUserRole === 'superadmin';
  const isLikelyAdminRole = normalizedUserRole === 'admin' || normalizedUserRole === 'ict';

  const checkSuperAdminStatus = useCallback(async (userId: string): Promise<boolean> => {
    // Avoid unnecessary / fragile table reads for non-super-admin roles.
    if (!isLikelySuperAdminRole) return false;

    try {
      const { data, error } = await supabase
        .from('super_admins')
        .select('id, user_id, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        // Suppress RLS permission errors - just log and return false
        if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('RLS')) {
          console.log('[SuperAdmin] No permission to check status (expected for some roles)');
          return false;
        }
        throw error;
      }
      return !!data;
    } catch (error: any) {
      // Suppress permission-related errors silently
      if (!error.message?.includes('permission') && !error.message?.includes('RLS') && error.code !== '42501') {
        console.error('Failed to check super-admin status:', error);
      }
      return false;
    }
  }, [isLikelySuperAdminRole]);

  const refreshSuperAdmins = useCallback(async () => {
    // Only admins should fetch super-admin data
    if (!currentUser || (!isLikelyAdminRole && !isLikelySuperAdminRole)) {
      setSuperAdmins([]);
      setStats(null);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('super_admins')
        .select('id, user_id, appointed_by, appointed_at, appointment_reason, is_active, deactivated_at, deactivated_by, deactivation_reason, last_activity_at, deletion_count, adjustment_count, total_actions_count, created_at, updated_at, metadata')
        .order('created_at', { ascending: false });

      if (error) {
        // Silently handle all known non-critical DB errors:
        // 42501 = insufficient_privilege (RLS)
        // 42P01 = undefined_table (table not yet created in this env)
        // PGRST* = PostgREST-level errors
        const isSilentError =
          error.code === '42501' ||
          error.code === '42P01' ||
          error.code?.startsWith('PGRST') ||
          error.message?.includes('permission') ||
          error.message?.includes('RLS') ||
          error.message?.includes('policy') ||
          error.message?.includes('does not exist');
        if (isSilentError) {
          console.log('[SuperAdmin] Could not fetch super-admins:', error.code, error.message);
          setSuperAdmins([]);
          setStats(null);
          setLoading(false);
          return;
        }
        throw error;
      }

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
      // Never show a toast for super-admin data loading failures —
      // silently log instead to avoid noisy errors on the dashboard.
      console.warn('[SuperAdmin] refreshSuperAdmins error (suppressed):', error?.code, error?.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser, isLikelyAdminRole, isLikelySuperAdminRole]);

  const refreshDeletionLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('deletion_audit_log')
        .select('*')
        .order('deleted_at', { ascending: false })
        .limit(100);

      if (error) {
        const isSilentError =
          error.code === '42501' ||
          error.code === '42P01' ||
          error.code?.startsWith('PGRST') ||
          error.message?.includes('permission') ||
          error.message?.includes('RLS') ||
          error.message?.includes('policy') ||
          error.message?.includes('does not exist');
        console.log('[SuperAdmin] Could not fetch deletion logs:', error.code, error.message);
        setDeletionLogs([]);
        if (!isSilentError) throw error;
        return;
      }
      setDeletionLogs((data || []).map(transformDeletionLogFromDB));
    } catch (error: any) {
      console.warn('[SuperAdmin] refreshDeletionLogs error (suppressed):', error?.code, error?.message);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      // Optimistically set isSuperAdmin from profile.role so the sidebar
      // never flickers from non-admin → admin during the async DB check.
      if (isLikelySuperAdminRole) {
        setIsSuperAdmin(true);
      }
      // Check super admin status from super_admins table first
      checkSuperAdminStatus(currentUser.id).then(async (isSuper) => {
        if (isSuper) {
          setIsSuperAdmin(true);
        } else {
          // Fallback: Also check if user's role is 'superAdmin' in their profile
          // This handles cases where profile ID doesn't match auth ID
          const userRole = currentUser.role?.toLowerCase();
          if (userRole === 'superadmin' || userRole === 'super_admin') {
            setIsSuperAdmin(true);
            // Try to find and use their super_admin entry by email lookup
            try {
              const { data: profileByEmail } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', currentUser.email)
                .single();
              
              if (profileByEmail) {
                const { data: saEntry } = await supabase
                  .from('super_admins')
                  .select('*')
                  .eq('user_id', profileByEmail.id)
                  .eq('is_active', true)
                  .maybeSingle();
                
                if (saEntry) {
                  console.log('[SuperAdmin] Found super admin entry via email lookup');
                  setIsSuperAdmin(true);
                }
              }
            } catch (e) {
              console.log('[SuperAdmin] Email lookup fallback error:', e);
            }
          } else {
            setIsSuperAdmin(false);
          }
        }
      });
      refreshSuperAdmins();
      refreshDeletionLogs();
    }
  }, [currentUser, checkSuperAdminStatus, refreshSuperAdmins, refreshDeletionLogs]);

  useRealtimeTable('super_admins', refreshSuperAdmins, {
    enabled: !!currentUser && (isLikelyAdminRole || isLikelySuperAdminRole),
  });

  useRealtimeTable('deletion_audit_log', refreshDeletionLogs, {
    enabled: !!currentUser && (isLikelyAdminRole || isLikelySuperAdminRole),
  });

  const createSuperAdmin = async (data: CreateSuperAdmin): Promise<boolean> => {
    // Only the platform owner can appoint super admins
    if (!isProtectedOwner(currentUser?.id)) {
      toast({
        title: 'Not Authorised',
        description: 'Only the platform owner can appoint super administrators.',
        variant: 'destructive',
      });
      return false;
    }

    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive'
      });
      return false;
    }

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

      const { error } = await withTimeout(
        supabase.from('super_admins').insert({
        user_id: data.userId,
        appointed_by: data.appointedBy,
        appointment_reason: data.appointmentReason,
        is_active: true,
      }),
        15000,
        'Create super-admin timed out'
      );

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
    // Block any attempt to deactivate the protected owner's super admin entry
    const targetAdmin = superAdmins.find(a => a.id === data.superAdminId);
    if (targetAdmin && isProtectedOwner(targetAdmin.userId)) {
      toast({
        title: 'Protected Account',
        description: 'The owner account cannot be deactivated or modified by anyone.',
        variant: 'destructive',
      });
      return false;
    }

    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive'
      });
      return false;
    }

    console.log('[SuperAdmin] Deactivating super-admin:', data.superAdminId);
    try {
      const { data: updateData, error } = await withTimeout(
        supabase
        .from('super_admins')
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString(),
          deactivated_by: data.deactivatedBy,
          deactivation_reason: data.deactivationReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.superAdminId)
        .select(),
        15000,
        'Deactivate super-admin timed out'
      );

      console.log('[SuperAdmin] Deactivation result:', { updateData, error });

      if (error) {
        // Handle RLS permission errors specifically
        if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('RLS')) {
          console.error('[SuperAdmin] RLS permission denied:', error);
          toast({
            title: 'Permission Denied',
            description: 'You do not have permission to deactivate this super-admin. Please check RLS policies in Supabase.',
            variant: 'destructive',
          });
          return false;
        }
        throw error;
      }

      // Check if any row was actually updated
      if (!updateData || updateData.length === 0) {
        console.warn('[SuperAdmin] No rows updated - record may not exist or RLS blocked');
        toast({
          title: 'Warning',
          description: 'No record was updated. The super-admin may not exist or you lack permission.',
          variant: 'destructive',
        });
        return false;
      }

      toast({
        title: 'Super-Admin Deactivated',
        description: 'Super-admin account has been deactivated',
      });

      await refreshSuperAdmins();
      return true;
    } catch (error: any) {
      console.error('[SuperAdmin] Failed to deactivate super-admin:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to deactivate super-admin',
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteSuperAdmin = async (data: DeleteSuperAdmin): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive'
      });
      return false;
    }

    console.log('[SuperAdmin] Deleting super-admin:', data.superAdminId);
    try {
      const result = await withTimeout(
        (async () => {
      // First get the record data for audit log
      const { data: superAdminRecord, error: fetchError } = await supabase
        .from('super_admins')
        .select('*')
        .eq('id', data.superAdminId)
        .single();

      if (fetchError) {
        console.error('[SuperAdmin] Failed to fetch record for deletion:', fetchError);
        throw fetchError;
      }

      // Delete the record
      const { error } = await supabase
        .from('super_admins')
        .delete()
        .eq('id', data.superAdminId);

      console.log('[SuperAdmin] Delete result:', { error });

      if (error) {
        if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('RLS')) {
          console.error('[SuperAdmin] RLS permission denied for delete:', error);
          toast({
            title: 'Permission Denied',
            description: 'You do not have permission to delete this super-admin. Please check RLS policies in Supabase.',
            variant: 'destructive',
          });
          return false;
        }
        throw error;
      }

      // Log the deletion for audit trail
      await supabase.from('deletion_audit_log').insert({
        table_name: 'super_admins',
        record_id: data.superAdminId,
        record_data: superAdminRecord,
        deleted_by: data.deletedBy,
        deleted_by_role: 'superAdmin',
        deleted_by_name: currentUser?.fullName || currentUser?.email || 'Unknown',
        deletion_reason: data.deleteReason,
        is_restorable: false,
      });

      toast({
        title: 'Super-Admin Deleted',
        description: 'Super-admin record has been permanently removed',
      });

      await refreshSuperAdmins();
      return true;
        })(),
        15000,
        'Delete super-admin timed out'
      );

      return result;
    } catch (error: any) {
      console.error('[SuperAdmin] Failed to delete super-admin:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete super-admin',
        variant: 'destructive',
      });
      return false;
    }
  };

  const logDeletion = async (data: CreateDeletionLog): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      return false;
    }

    try {
      const result = await withTimeout(
        (async () => {
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
        })(),
        15000,
        'Log deletion timed out'
      );

      return result;
    } catch (error: any) {
      console.error('Failed to log deletion:', error);
      return false;
    }
  };

  const sendNotificationToUser = async (
    userId: string,
    title: string,
    message: string,
    type: string = 'info',
    relatedEntityId?: string,
    relatedEntityType?: string
  ) => {
    try {
      await supabase.from('notifications').insert({
        recipient_id: userId,
        title_en: title,
        title_ar: title,
        message_en: message,
        message_ar: message,
        entity_id: relatedEntityId,
        entity_type: relatedEntityType,
        event_type: 'system',
        status: 'pending',
        priority: 'high',
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  };

  const resetSiteVisit = async (params: ResetSiteVisitParams): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive'
      });
      return false;
    }

    try {
      return await withTimeout(
        (async () => {
      const { siteVisitId, reason, deletedBy, deletedByName, deletedByRole, targetStatus = 'assigned' } = params;
      const errors: string[] = [];

      await supabase.auth.getSession();

      const { data: siteVisit, error: fetchError } = await supabase
        .from('mmp_site_entries')
        .select('*, accepted_by, supervisor_id, site_name, site_code, status')
        .eq('id', siteVisitId)
        .maybeSingle();

      if (fetchError) {
        console.error('Reset site visit fetch error:', fetchError);
        toast({
          title: 'Error',
          description: `Failed to fetch site visit: ${fetchError.message}`,
          variant: 'destructive',
        });
        return false;
      }

      if (!siteVisit) {
        toast({
          title: 'Error',
          description: 'Site visit not found. It may have been deleted or you may not have permission.',
          variant: 'destructive',
        });
        return false;
      }

      const dataCollectorId = siteVisit.accepted_by;
      const supervisorId = siteVisit.supervisor_id;

      const resetFields: Record<string, any> = {
        status: targetStatus,
        updated_at: new Date().toISOString(),
      };

      if (targetStatus === 'new' || targetStatus === 'approved') {
        resetFields.accepted_by = null;
        resetFields.accepted_at = null;
        resetFields.visit_completed_at = null;
        resetFields.completion_notes = null;
        resetFields.gps_coordinates = null;
        resetFields.signature_data = null;
        resetFields.visit_completed_by = null;
      } else if (targetStatus === 'dispatched' || targetStatus === 'assigned') {
        resetFields.visit_completed_at = null;
        resetFields.completion_notes = null;
        resetFields.gps_coordinates = null;
        resetFields.signature_data = null;
        resetFields.visit_completed_by = null;
      }

      const { data: transactions, error: txnFetchError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .or(`site_visit_id.eq.${siteVisitId},related_site_visit_id.eq.${siteVisitId}`);

      if (txnFetchError) {
        errors.push(`Failed to fetch transactions: ${txnFetchError.message}`);
      }

      const { error: updateError } = await supabase
        .from('mmp_site_entries')
        .update(resetFields)
        .eq('id', siteVisitId);

      if (updateError) {
        throw new Error(`Failed to reset site visit status: ${updateError.message}`);
      }

      // 4. Log the site visit reset
      await logDeletion({
        tableName: 'mmp_site_entries',
        recordId: siteVisitId,
        recordData: { ...siteVisit, action: 'status_reset' },
        deletedBy,
        deletedByRole,
        deletedByName,
        deletionReason: reason,
        isRestorable: true,
      });

      // 5. Process related wallet transactions (less critical - log errors but continue)
      if (transactions && transactions.length > 0) {
        for (const txn of transactions) {
          try {
            // Log the deletion first
            await logDeletion({
              tableName: 'wallet_transactions',
              recordId: txn.id,
              recordData: txn,
              deletedBy,
              deletedByRole,
              deletedByName,
              deletionReason: `Site visit reset: ${reason}`,
              isRestorable: true,
            });

            // Get wallet and update balance
            const { data: wallet, error: walletError } = await supabase
              .from('wallets')
              .select('*')
              .eq('id', txn.wallet_id)
              .single();

            if (walletError) {
              errors.push(`Failed to fetch wallet for transaction ${txn.id}`);
              continue;
            }

            if (wallet) {
              const currentBalance = wallet.balances?.[txn.currency] || 0;
              const newBalance = currentBalance - txn.amount;
              const updatedBalances = { ...wallet.balances, [txn.currency]: Math.max(0, newBalance) };

              const { error: balanceError } = await supabase
                .from('wallets')
                .update({
                  balances: updatedBalances,
                  total_earned: Math.max(0, (parseFloat(wallet.total_earned) || 0) - txn.amount),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', wallet.id);

              if (balanceError) {
                errors.push(`Failed to update wallet balance: ${balanceError.message}`);
                continue;
              }
            }

            // Delete the transaction
            const { error: deleteError } = await supabase
              .from('wallet_transactions')
              .delete()
              .eq('id', txn.id);

            if (deleteError) {
              errors.push(`Failed to delete transaction ${txn.id}: ${deleteError.message}`);
            }
          } catch (txnError: any) {
            errors.push(`Transaction processing error: ${txnError.message}`);
          }
        }
      }

      const notificationTitle = 'Site Visit Status Reset';
      const notificationMessage = `Site visit "${siteVisit.site_name}" (${siteVisit.site_code}) has been reset to "${targetStatus}" by ${deletedByName}. Reason: ${reason}`;

      if (dataCollectorId) {
        await sendNotificationToUser(
          dataCollectorId,
          notificationTitle,
          notificationMessage,
          'warning',
          siteVisitId,
          'site_visit'
        );
      }

      if (supervisorId && supervisorId !== dataCollectorId) {
        await sendNotificationToUser(
          supervisorId,
          notificationTitle,
          notificationMessage,
          'warning',
          siteVisitId,
          'site_visit'
        );
      }

      // Show result with any partial errors
      if (errors.length > 0) {
        console.warn('Site visit reset completed with some errors:', errors);
        toast({
          title: 'Site Visit Reset (Partial)',
          description: `Site visit reset completed. ${errors.length} transaction(s) had issues - check audit log.`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Site Visit Reset',
          description: `Site visit has been reset to "${targetStatus}" and related transactions removed`,
        });
      }

      return true;
        })(),
        15000,
        'Reset site visit timed out'
      );
    } catch (error: any) {
      console.error('Failed to reset site visit:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset site visit',
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteWalletTransaction = async (params: DeleteWalletTransactionParams): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive'
      });
      return false;
    }

    try {
      return await withTimeout(
        (async () => {
      const { transactionId, reason, deletedBy, deletedByName, deletedByRole } = params;

      // 1. Get the transaction
      const { data: txn, error: fetchError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('id', transactionId)
        .single();

      if (fetchError || !txn) {
        toast({
          title: 'Error',
          description: 'Transaction not found',
          variant: 'destructive',
        });
        return false;
      }

      // 2. Delete the transaction FIRST (most important)
      const { error: deleteError } = await supabase
        .from('wallet_transactions')
        .delete()
        .eq('id', transactionId);

      if (deleteError) {
        throw new Error(`Failed to delete transaction: ${deleteError.message}`);
      }

      // 3. Log the deletion
      await logDeletion({
        tableName: 'wallet_transactions',
        recordId: transactionId,
        recordData: txn,
        deletedBy,
        deletedByRole,
        deletedByName,
        deletionReason: reason,
        isRestorable: true,
      });

      // 4. Update wallet balance (less critical - log error but don't fail)
      const { data: wallet, error: walletFetchError } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', txn.wallet_id)
        .single();

      let balanceUpdateFailed = false;
      if (!walletFetchError && wallet) {
        const currentBalance = wallet.balances?.[txn.currency] || 0;
        const newBalance = currentBalance - txn.amount;
        const updatedBalances = { ...wallet.balances, [txn.currency]: Math.max(0, newBalance) };

        const { error: balanceError } = await supabase
          .from('wallets')
          .update({
            balances: updatedBalances,
            total_earned: txn.amount > 0 
              ? Math.max(0, (parseFloat(wallet.total_earned) || 0) - txn.amount)
              : wallet.total_earned,
            updated_at: new Date().toISOString(),
          })
          .eq('id', wallet.id);

        if (balanceError) {
          console.error('Failed to update wallet balance:', balanceError);
          balanceUpdateFailed = true;
        }
      }

      // 5. Send notification to the user (non-critical)
      if (txn.user_id) {
        await sendNotificationToUser(
          txn.user_id,
          'Wallet Transaction Removed',
          `A transaction of ${txn.amount} ${txn.currency} has been removed from your wallet by ${deletedByName}. Reason: ${reason}`,
          'warning',
          transactionId,
          'wallet_transaction'
        );
      }

      toast({
        title: 'Transaction Deleted',
        description: balanceUpdateFailed 
          ? 'Transaction removed. Wallet balance may need manual adjustment.'
          : 'Wallet transaction has been removed and balance adjusted',
        variant: balanceUpdateFailed ? 'default' : 'default',
      });

      return true;
        })(),
        15000,
        'Delete wallet transaction timed out'
      );
    } catch (error: any) {
      console.error('Failed to delete wallet transaction:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete transaction',
        variant: 'destructive',
      });
      return false;
    }
  };

  const resetWallet = async (params: ResetWalletParams): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive'
      });
      return false;
    }

    try {
      return await withTimeout(
        (async () => {
      const { userId, walletId, reason, deletedBy, deletedByName, deletedByRole } = params;

      // 1. Get all transactions for this wallet
      const { data: transactions, error: fetchError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', walletId);

      if (fetchError) {
        throw new Error(`Failed to fetch transactions: ${fetchError.message}`);
      }

      // 2. Reset wallet balances FIRST (most important)
      const { error: walletError } = await supabase
        .from('wallets')
        .update({
          balances: {},
          total_earned: 0,
          total_withdrawn: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', walletId);

      if (walletError) {
        throw new Error(`Failed to reset wallet balances: ${walletError.message}`);
      }

      // 3. Delete all transactions
      if (transactions && transactions.length > 0) {
        const { error: deleteError } = await supabase
          .from('wallet_transactions')
          .delete()
          .eq('wallet_id', walletId);

        if (deleteError) {
          throw new Error(`Failed to delete transactions: ${deleteError.message}`);
        }

        // 4. Log all transactions as deleted (non-critical)
        for (const txn of transactions) {
          try {
            await logDeletion({
              tableName: 'wallet_transactions',
              recordId: txn.id,
              recordData: txn,
              deletedBy,
              deletedByRole,
              deletedByName,
              deletionReason: `Wallet reset: ${reason}`,
              isRestorable: true,
            });
          } catch (logError) {
            console.error('Failed to log transaction deletion:', logError);
          }
        }
      }

      // 5. Send notification to the user (non-critical)
      await sendNotificationToUser(
        userId,
        'Wallet Reset',
        `Your wallet has been reset by ${deletedByName}. All transactions have been cleared. Reason: ${reason}`,
        'warning',
        walletId,
        'wallet'
      );

      toast({
        title: 'Wallet Reset',
        description: `Wallet has been reset. ${transactions?.length || 0} transactions removed.`,
      });

      return true;
        })(),
        15000,
        'Reset wallet timed out'
      );
    } catch (error: any) {
      console.error('Failed to reset wallet:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset wallet',
        variant: 'destructive',
      });
      return false;
    }
  };

  const reclaimSite = async (params: ReclaimSiteParams): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      toast({
        title: 'Session expired',
        description: session.error || 'Please refresh and try again.',
        variant: 'destructive'
      });
      return false;
    }

    try {
      return await withTimeout(
        (async () => {
      const { siteEntryId, reason, reclaimedBy, reclaimedByName, reclaimedByRole, cancelPendingAdvances = true } = params;

      // 1. Get the site entry details first
      const { data: siteEntry, error: fetchError } = await supabase
        .from('mmp_site_entries')
        .select('*')
        .eq('id', siteEntryId)
        .single();

      if (fetchError || !siteEntry) {
        toast({
          title: 'Error',
          description: 'Site entry not found',
          variant: 'destructive',
        });
        return false;
      }

      const formerAssigneeId = siteEntry.accepted_by;
      const siteName = siteEntry.site_name || siteEntry.site_code || 'Unknown Site';
      const currentStatus = (siteEntry.status || '').toLowerCase().trim();

      if (!formerAssigneeId) {
        toast({
          title: 'Info',
          description: 'This site is not currently claimed by anyone',
        });
        return false;
      }

      // 2. Determine reclaim behavior - go back to PREVIOUS status in the workflow:
      // Flow: New → Approved → Dispatched → Accepted → Ongoing → Completed
      // - Dispatched → goes back to Approved (clear dispatch info, keep as new approved site)
      // - Accepted → goes back to Dispatched (clear claim info, keep costs)
      // - Ongoing → goes back to Accepted (keep claim info, revert progress)
      // - Completed → goes back to Ongoing (revert completion)
      
      let updateData: any;
      let previousStatus: string;
      
      if (currentStatus === 'dispatched' || currentStatus === 'assigned') {
        // Dispatched → stays Dispatched, clear ALL costs so new enumerator goes through fresh costing
        previousStatus = 'dispatched';
        updateData = {
          accepted_by: null,
          accepted_at: null,
          status: 'dispatched',
          cost: null,
          enumerator_fee: null,
          transport_fee: null,
          cost_acknowledged: null,
          cost_acknowledged_at: null,
          updated_at: new Date().toISOString(),
        };
      } else if (currentStatus === 'accepted' || currentStatus === 'claimed') {
        // Accepted → Dispatched (clear claim info AND costs — fresh costing required)
        previousStatus = 'dispatched';
        updateData = {
          accepted_by: null,
          accepted_at: null,
          status: 'dispatched',
          cost: null,
          enumerator_fee: null,
          transport_fee: null,
          cost_acknowledged: null,
          cost_acknowledged_at: null,
          updated_at: new Date().toISOString(),
        };
      } else if (currentStatus === 'ongoing' || currentStatus === 'in_progress') {
        // Ongoing → Accepted (revert progress, keep claim)
        previousStatus = 'accepted';
        updateData = {
          status: 'accepted',
          // Keep accepted_by, accepted_at, and costs
          updated_at: new Date().toISOString(),
        };
      } else if (currentStatus === 'completed') {
        // Completed → Ongoing (revert completion)
        previousStatus = 'ongoing';
        updateData = {
          status: 'ongoing',
          // Keep everything else
          updated_at: new Date().toISOString(),
        };
      } else {
        // Default: keep as dispatched with costs preserved
        previousStatus = 'dispatched';
        updateData = {
          accepted_by: null,
          accepted_at: null,
          status: 'dispatched',
          cost_acknowledged: null,
          cost_acknowledged_at: null,
          updated_at: new Date().toISOString(),
        };
      }
      
      console.log(`📍 Reclaiming site from "${currentStatus}" → "${previousStatus}"`);

      const { error: updateError } = await supabase
        .from('mmp_site_entries')
        .update(updateData)
        .eq('id', siteEntryId);

      if (updateError) {
        throw new Error(`Failed to reclaim site: ${updateError.message}`);
      }

      // 3a. Cancel pending advance requests linked to this site entry (if requested)
      if (cancelPendingAdvances) {
        const { data: pendingAdvances } = await supabase
          .from('down_payment_requests')
          .select('id, requested_amount, currency, metadata, requested_by')
          .eq('mmp_site_entry_id', siteEntryId)
          .in('status', ['pending_supervisor', 'pending_admin']);

        if (pendingAdvances && pendingAdvances.length > 0) {
          const cancelledAt = new Date().toISOString();
          for (const adv of pendingAdvances) {
            const existingMeta = typeof adv.metadata === 'object' && adv.metadata ? adv.metadata : {};
            await supabase
              .from('down_payment_requests')
              .update({
                status: 'cancelled',
                metadata: {
                  ...existingMeta,
                  cancelled_reason: `Site reclaimed by ${reclaimedByName}: ${reason}`,
                  site_reclaim_reason: reason,
                  cancelled_by: reclaimedBy,
                  cancelled_at: cancelledAt,
                  auto_cancelled_on_reclaim: true,
                },
                updated_at: cancelledAt,
              })
              .eq('id', adv.id);

            // Notify the advance requester their request was auto-cancelled
            if (adv.requested_by && adv.requested_by !== reclaimedBy) {
              await sendNotificationToUser(
                adv.requested_by,
                'Advance Request Cancelled',
                `Your advance request of ${Number(adv.requested_amount).toLocaleString()} ${adv.currency || 'SDG'} was automatically cancelled because the site was reclaimed. Reason: ${reason}`,
                'warning',
                adv.id,
                'financial'
              );
            }
          }

          console.log(`[Reclaim] Auto-cancelled ${pendingAdvances.length} pending advance request(s) for site ${siteEntryId}`);
        }
      }

      // 3b. Flag disbursed advances so Finance can manually reconcile them
      {
        const flaggedAt = new Date().toISOString();
        const { data: disbursedAdvances } = await supabase
          .from('down_payment_requests')
          .select('id, metadata')
          .eq('mmp_site_entry_id', siteEntryId)
          .eq('status', 'approved');

        if (disbursedAdvances && disbursedAdvances.length > 0) {
          for (const adv of disbursedAdvances) {
            const existingMeta = typeof adv.metadata === 'object' && adv.metadata ? adv.metadata : {};
            await supabase
              .from('down_payment_requests')
              .update({
                metadata: {
                  ...existingMeta,
                  site_reclaimed: true,
                  site_reclaimed_at: flaggedAt,
                  site_reclaimed_by: reclaimedByName,
                  site_reclaim_reason: reason,
                  manual_reconciliation_required: true,
                },
                updated_at: flaggedAt,
              })
              .eq('id', adv.id);
          }
          console.log(`[Reclaim] Flagged ${disbursedAdvances.length} disbursed advance(s) as requiring manual reconciliation for site ${siteEntryId}`);
        }
      }

      // 3. Log the reclaim action for audit trail
      await logDeletion({
        tableName: 'mmp_site_entries',
        recordId: siteEntryId,
        recordData: { 
          ...siteEntry, 
          action: 'site_reclaimed',
          former_assignee: formerAssigneeId,
          reclaim_reason: reason 
        },
        deletedBy: reclaimedBy,
        deletedByRole: reclaimedByRole,
        deletedByName: reclaimedByName,
        deletionReason: `Site reclaimed: ${reason}`,
        isRestorable: true,
      });

      // 4. Send notification to the former assignee
      if (formerAssigneeId) {
        await sendNotificationToUser(
          formerAssigneeId,
          'Site Reclaimed',
          `Your site "${siteName}" has been reclaimed by ${reclaimedByName}. Reason: ${reason}`,
          'warning',
          siteEntryId,
          'site_visit'
        );
      }

      // 5. Notify supervisors and financial admins about the reclaim + financial impact
      try {
        const { data: impactedAdvances } = await supabase
          .from('down_payment_requests')
          .select('id, requested_amount, currency, status')
          .eq('mmp_site_entry_id', siteEntryId);

        const cancelledCount = impactedAdvances?.filter(a => ['pending_supervisor', 'pending_admin'].includes(a.status)).length || 0;
        const disbursedCount = impactedAdvances?.filter(a => a.status === 'approved').length || 0;
        const disbursedTotal = impactedAdvances?.filter(a => a.status === 'approved').reduce((s, a) => s + Number(a.requested_amount), 0) || 0;

        let financialNote = '';
        if (cancelledCount > 0) financialNote += ` ${cancelledCount} pending advance(s) auto-cancelled.`;
        if (disbursedCount > 0) financialNote += ` ${disbursedCount} disbursed advance(s) totalling ${disbursedTotal.toLocaleString()} SDG require manual reconciliation.`;

        if (financialNote) {
          // Notify supervisor on the site entry
          const supervisorId = siteEntry.supervisor_id;
          if (supervisorId && supervisorId !== reclaimedBy) {
            await sendNotificationToUser(
              supervisorId,
              'Site Reclaimed — Advance Impact',
              `Site "${siteName}" reclaimed by ${reclaimedByName}.${financialNote}`,
              'warning',
              siteEntryId,
              'site_visit'
            );
          }

          // Notify financial admins
          const { data: financialUsers } = await supabase
            .from('profiles')
            .select('id')
            .in('role', ['financial_auditor', 'admin', 'superadmin'])
            .neq('id', reclaimedBy)
            .limit(10);

          if (financialUsers) {
            for (const fu of financialUsers) {
              await sendNotificationToUser(
                fu.id,
                'Advance Reconciliation Required',
                `Site "${siteName}" was reclaimed.${financialNote} Action required in Transportation Advance Report.`,
                'warning',
                siteEntryId,
                'financial'
              );
            }
          }
        }
      } catch (notifErr) {
        console.warn('[Reclaim] Failed to send financial notifications:', notifErr);
      }

      toast({
        title: 'Site Reclaimed',
        description: `Site "${siteName}" has been released back to the dispatch pool.`,
      });

      return true;
        })(),
        15000,
        'Reclaim site timed out'
      );
    } catch (error: any) {
      console.error('Failed to reclaim site:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reclaim site',
        variant: 'destructive',
      });
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
    deleteSuperAdmin,
    logDeletion,
    checkSuperAdminStatus,
    resetSiteVisit,
    deleteWalletTransaction,
    resetWallet,
    reclaimSite,
  };

  return <SuperAdminContext.Provider value={value}>{children}</SuperAdminContext.Provider>;
}
