import React, { createContext, useContext, useState, useEffect } from 'react';
import { Transaction } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { transactions } from '@/data/mockTransactions';
import { useUser } from '../user/UserContext';
import { supabase } from '@/integrations/supabase/client';

interface WalletContextType {
  transactions: Transaction[];
  withdrawFunds: (amount: number, method: string, bankDetails?: any) => Promise<boolean>;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => Promise<boolean>;
  getTransactionsByUserId: (userId: string) => Transaction[];
  getPendingWithdrawals: (userId: string) => Transaction[];
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appTransactions, setAppTransactions] = useState<Transaction[]>(transactions);
  const { toast } = useToast();
  const { currentUser, users, updateUser } = useUser();
  
  const [notificationsAPI, setNotificationsAPI] = useState<any>(null);
  const TABLE_NAME = 'wallet_transactions';
  
  useEffect(() => {
    try {
      import('../notifications/NotificationContext').then(module => {
        try {
          setNotificationsAPI({
            addNotification: (notification: any) => {
              try {
                const NotificationHelper = () => {
                  const { addNotification } = module.useNotifications();
                  React.useEffect(() => {
                    addNotification(notification);
                  }, []);
                  return null;
                };
                
                const div = document.createElement('div');
                document.body.appendChild(div);
                (async () => {
                  try {
                    const { createRoot } = await import('react-dom/client');
                    const root = createRoot(div);
                    root.render(<module.NotificationProvider><NotificationHelper /></module.NotificationProvider>);
                    setTimeout(() => {
                      try {
                        root.unmount();
                        document.body.removeChild(div);
                      } catch (error) {
                        console.error("Cleanup error:", error);
                      }
                    }, 100);
                  } catch (error) {
                    console.error('Failed to render notification helper:', error);
                  }
                })();
              } catch (error) {
                console.error("Failed to add notification:", error);
              }
            }
          });
        } catch (error) {
          console.error('Error using NotificationContext:', error);
        }
      }).catch(error => {
        console.error('Error importing NotificationContext:', error);
      });
    } catch (error) {
      console.error('Failed to set up notifications:', error);
    }
  }, []);

  useEffect(() => {
    const loadTransactionsFromDb = async () => {
      if (!currentUser?.id) return;
      try {
        let query = supabase
          .from(TABLE_NAME)
          .select('*')
          .order('created_at', { ascending: false });

        const role = currentUser.role;
        const isFinance = role === 'admin' || role === 'financialAdmin' || role === 'ict';
        if (!isFinance) {
          query = query.eq('user_id', currentUser.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        const mapped: Transaction[] = (data || []).map((r: any) => ({
          id: r.id || r.reference || `tx${Math.floor(Math.random() * 1000000)}`,
          userId: r.user_id,
          amount: Number(r.amount || 0),
          currency: r.currency || currentUser.wallet?.currency || 'SDG',
          type: r.type,
          status: r.status,
          description: r.description || '',
          createdAt: r.created_at || new Date().toISOString(),
          method: r.method || undefined,
          reference: r.reference || undefined,
          siteVisitId: r.site_visit_id || undefined,
          operationalCosts: r.operational_costs || undefined,
          taskDetails: r.task_details || undefined,
          bankDetails: r.bank_details || undefined,
        }));
        setAppTransactions(mapped);
      } catch (err) {
        console.warn('Falling back to mock transactions due to DB load error:', err);
        setAppTransactions(transactions);
      }
    };

    loadTransactionsFromDb();
  }, [currentUser?.id]);

  const addNotification = (notification: any) => {
    if (notificationsAPI && notificationsAPI.addNotification) {
      notificationsAPI.addNotification(notification);
    } else {
      console.log('Notification would be sent (but API not ready):', notification);
    }
  };

  const withdrawFunds = async (amount: number, method: string, bankDetails?: any): Promise<boolean> => {
    try {
      if (!currentUser) {
        toast({
          title: "Error",
          description: "You must be logged in to withdraw funds.",
          variant: "destructive",
        });
        return false;
      }

      const availableBalance = appTransactions
        .filter(t => t.userId === currentUser.id && t.status === 'completed')
        .reduce((sum, t) => sum + (t.type === 'credit' ? t.amount : -t.amount), 0);

      if (availableBalance < amount) {
        toast({
          title: "Insufficient funds",
          description: "Your wallet balance is too low for this withdrawal.",
          variant: "destructive",
        });
        return false;
      }

      const now = new Date().toISOString();
      const isCoordinatorOrDatacollector = ['coordinator', 'dataCollector'].includes(currentUser.role);
      
      const reference = `WD-${Math.floor(Math.random() * 1000000)}`;
      const status = isCoordinatorOrDatacollector ? 'pending' : 'completed';

      let createdTx: Transaction | null = null;
      try {
        const { data, error } = await supabase
          .from(TABLE_NAME)
          .insert([
            {
              user_id: currentUser.id,
              amount,
              currency: currentUser.wallet?.currency || 'SDG',
              type: 'debit',
              status,
              description: `Withdrawal via ${method}${isCoordinatorOrDatacollector ? ' (Pending Admin Approval)' : ''}`,
              created_at: now,
              method,
              reference,
              bank_details: method === 'Bank of Khartoum' ? bankDetails : null,
            },
          ])
          .select('*')
          .single();
        if (error) throw error;
        createdTx = {
          id: data.id || reference,
          userId: data.user_id,
          amount: Number(data.amount || amount),
          currency: data.currency || currentUser.wallet?.currency || 'SDG',
          type: 'debit',
          status: data.status || status,
          description: data.description || `Withdrawal via ${method}`,
          createdAt: data.created_at || now,
          method: data.method || method,
          reference: data.reference || reference,
          bankDetails: data.bank_details || (method === 'Bank of Khartoum' ? bankDetails : undefined),
        };
      } catch (dbErr) {
        console.warn('DB insert failed for withdrawal, using local fallback:', dbErr);
        createdTx = {
          id: `tx${appTransactions.length + 1}`,
          userId: currentUser.id,
          amount,
          currency: currentUser.wallet?.currency || 'SDG',
          type: 'debit',
          status,
          description: `Withdrawal via ${method}${isCoordinatorOrDatacollector ? ' (Pending Admin Approval)' : ''}`,
          createdAt: now,
          method,
          reference,
          bankDetails: method === 'Bank of Khartoum' ? bankDetails : undefined,
        };
      }

      setAppTransactions(prev => [...prev, createdTx!]);

      if (isCoordinatorOrDatacollector) {
        const admins = users.filter(u => u.role === 'admin');
        admins.forEach(admin => {
          addNotification({
            userId: admin.id,
            title: "Withdrawal Approval Required",
            message: `${currentUser.name} has requested a withdrawal of ${amount} ${currentUser.wallet.currency} via ${method}. Please review and approve.`,
            type: "warning",
            link: `/admin/transactions/${createdTx!.id}`,
            relatedEntityId: createdTx!.id,
            relatedEntityType: "transaction",
          });
        });

        addNotification({
          userId: currentUser.id,
          title: "Withdrawal Request Submitted",
          message: `Your request to withdraw ${amount} ${currentUser.wallet.currency} via ${method} has been submitted for admin approval.`,
          type: "info",
          link: `/wallet`,
          relatedEntityId: createdTx!.id,
          relatedEntityType: "transaction",
        });
      }

      toast({
        title: isCoordinatorOrDatacollector ? "Withdrawal request submitted" : "Withdrawal successful",
        description: isCoordinatorOrDatacollector
          ? `Your request to withdraw ${amount} ${currentUser.wallet.currency} has been submitted for admin approval.`
          : `${amount} ${currentUser.wallet.currency} has been withdrawn from your wallet.`,
      });
      return true;
    } catch (error) {
      console.error("Withdrawal error:", error);
      toast({
        title: "Withdrawal error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
      return false;
    }
  };

  const addTransaction = async (transaction: Omit<Transaction, 'id' | 'createdAt'>): Promise<boolean> => {
    try {
      const now = new Date().toISOString();
      let createdTx: Transaction | null = null;
      try {
        const { data, error } = await supabase
          .from(TABLE_NAME)
          .insert([
            {
              user_id: transaction.userId,
              amount: transaction.amount,
              currency: transaction.currency,
              type: transaction.type,
              status: transaction.status,
              description: transaction.description,
              created_at: now,
              method: transaction.method || null,
              reference: transaction.reference || null,
              site_visit_id: transaction.siteVisitId || null,
              operational_costs: transaction.operationalCosts || null,
              task_details: transaction.taskDetails || null,
              bank_details: transaction.bankDetails || null,
            },
          ])
          .select('*')
          .single();
        if (error) throw error;
        createdTx = {
          id: data.id || transaction.reference || `tx${appTransactions.length + 1}`,
          createdAt: data.created_at || now,
          userId: data.user_id,
          amount: Number(data.amount || transaction.amount),
          currency: data.currency || transaction.currency,
          type: data.type || transaction.type,
          status: data.status || transaction.status,
          description: data.description || transaction.description,
          method: data.method || transaction.method,
          reference: data.reference || transaction.reference,
          siteVisitId: data.site_visit_id || transaction.siteVisitId,
          operationalCosts: data.operational_costs || transaction.operationalCosts,
          taskDetails: data.task_details || transaction.taskDetails,
          bankDetails: data.bank_details || transaction.bankDetails,
        };
      } catch (dbErr) {
        console.warn('DB insert failed for addTransaction, using local fallback:', dbErr);
        createdTx = {
          id: `tx${appTransactions.length + 1}`,
          createdAt: now,
          ...transaction,
        } as Transaction;
      }

      setAppTransactions(prev => [...prev, createdTx!]);
      
      if (transaction.type === 'credit' && 
          transaction.userId === currentUser?.id && 
          transaction.status === 'completed') {
        updateUserBalance(transaction.userId, transaction.amount);
      }
      return true;
    } catch (e) {
      console.error('addTransaction error:', e);
      return false;
    }
  };
  
  const updateUserBalance = (userId: string, amount: number) => {
    if (currentUser && currentUser.id === userId) {
      const updatedUser = {
        ...currentUser,
        wallet: {
          ...currentUser.wallet,
          balance: currentUser.wallet.balance + amount,
        },
      };
      updateUser(updatedUser);
    }
  };
  
  const getTransactionsByUserId = (userId: string): Transaction[] => {
    return appTransactions.filter(t => t.userId === userId);
  };
  
  const getPendingWithdrawals = (userId: string): Transaction[] => {
    return appTransactions.filter(
      t => t.userId === userId && 
      t.type === 'debit' && 
      t.status === 'pending'
    );
  };

  return (
    <WalletContext.Provider
      value={{
        transactions: appTransactions,
        withdrawFunds,
        addTransaction,
        getTransactionsByUserId,
        getPendingWithdrawals,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
