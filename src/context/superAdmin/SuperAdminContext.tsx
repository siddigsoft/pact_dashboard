import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '../user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeTable } from '@/hooks/useRealtimeResource';
import {
  SuperAdmin,
  CreateSuperAdmin,
  DeactivateSuperAdmin,
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
  resetSiteVisit: (params: ResetSiteVisitParams) => Promise<boolean>;
  deleteWalletTransaction: (params: DeleteWalletTransactionParams) => Promise<boolean>;
  resetWallet: (params: ResetWalletParams) => Promise<boolean>;
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
  }, []);

  const refreshSuperAdmins = useCallback(async () => {
    // Only admins should fetch super-admin data
    const userRole = currentUser?.role?.toLowerCase();
    if (!currentUser || (userRole !== 'admin' && userRole !== 'superadmin')) {
      setSuperAdmins([]);
      setStats(null);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('super_admins')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Suppress RLS permission errors - just log them
        if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('RLS')) {
          console.log('[SuperAdmin] No permission to fetch super-admins (expected for non-admins)');
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
      // Only log and show error for unexpected errors, not permission issues
      const isPermissionError = error.code === '42501' || 
        error.message?.includes('permission') || 
        error.message?.includes('RLS') ||
        error.message?.includes('policy');
      
      if (!isPermissionError) {
        console.error('Failed to fetch super-admins:', error);
        toast({
          title: 'Error',
          description: 'Failed to load super-admin data',
          variant: 'destructive',
        });
      } else {
        console.log('[SuperAdmin] Permission denied (expected for non-admin roles)');
      }
    } finally {
      setLoading(false);
    }
  }, [currentUser, toast]);

  const refreshDeletionLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('deletion_audit_log')
        .select('*')
        .order('deleted_at', { ascending: false })
        .limit(100);

      if (error) {
        // Suppress RLS permission errors - just log them
        if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('RLS')) {
          console.log('[SuperAdmin] No permission to fetch deletion logs (expected for some roles)');
          setDeletionLogs([]);
          return;
        }
        throw error;
      }
      setDeletionLogs((data || []).map(transformDeletionLogFromDB));
    } catch (error: any) {
      // Suppress permission-related errors silently
      if (!error.message?.includes('permission') && !error.message?.includes('RLS') && error.code !== '42501') {
        console.error('Failed to fetch deletion logs:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      checkSuperAdminStatus(currentUser.id).then(setIsSuperAdmin);
      refreshSuperAdmins();
      refreshDeletionLogs();
    }
  }, [currentUser, checkSuperAdminStatus, refreshSuperAdmins, refreshDeletionLogs]);

  useRealtimeTable('super_admins', refreshSuperAdmins, {
    enabled: !!currentUser,
  });

  useRealtimeTable('deletion_audit_log', refreshDeletionLogs, {
    enabled: !!currentUser,
  });

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
        user_id: userId,
        title,
        message,
        type,
        is_read: false,
        related_entity_id: relatedEntityId,
        related_entity_type: relatedEntityType,
        category: 'system',
        priority: 'high',
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  };

  const resetSiteVisit = async (params: ResetSiteVisitParams): Promise<boolean> => {
    try {
      const { siteVisitId, reason, deletedBy, deletedByName, deletedByRole } = params;
      const errors: string[] = [];

      // 1. Get the site visit details first
      const { data: siteVisit, error: fetchError } = await supabase
        .from('mmp_site_entries')
        .select('*, accepted_by, supervisor_id, site_name, site_code, status')
        .eq('id', siteVisitId)
        .single();

      if (fetchError || !siteVisit) {
        toast({
          title: 'Error',
          description: 'Site visit not found',
          variant: 'destructive',
        });
        return false;
      }

      const dataCollectorId = siteVisit.accepted_by;
      const supervisorId = siteVisit.supervisor_id;

      // 2. Find related wallet transactions
      const { data: transactions, error: txnFetchError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .or(`site_visit_id.eq.${siteVisitId},reference_id.eq.${siteVisitId}`);

      if (txnFetchError) {
        throw new Error(`Failed to fetch related transactions: ${txnFetchError.message}`);
      }

      // 3. Reset the site visit status FIRST (most important operation)
      const { error: updateError } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'assigned',
          visit_completed_at: null,
          completion_notes: null,
          gps_coordinates: null,
          signature_data: null,
          updated_at: new Date().toISOString(),
        })
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

      // 6. Send notifications (non-critical - don't fail if these fail)
      const notificationTitle = 'Site Visit Status Reset';
      const notificationMessage = `Site visit "${siteVisit.site_name}" (${siteVisit.site_code}) has been reset to incomplete by ${deletedByName}. Reason: ${reason}`;

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
          description: 'Site visit has been reset to incomplete and related transactions removed',
        });
      }

      return true;
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
    try {
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
    try {
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
    resetSiteVisit,
    deleteWalletTransaction,
    resetWallet,
  };

  return <SuperAdminContext.Provider value={value}>{children}</SuperAdminContext.Provider>;
}
