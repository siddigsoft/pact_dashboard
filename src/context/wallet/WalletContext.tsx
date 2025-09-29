import React, { createContext, useContext, useState, useEffect } from 'react';
import { Transaction } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { transactions } from '@/data/mockTransactions';
import { useUser } from '../user/UserContext';

interface WalletContextType {
  transactions: Transaction[];
  withdrawFunds: (amount: number, method: string, bankDetails?: any) => Promise<boolean>;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => void;
  getTransactionsByUserId: (userId: string) => Transaction[];
  getPendingWithdrawals: (userId: string) => Transaction[];
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appTransactions, setAppTransactions] = useState<Transaction[]>(transactions);
  const { toast } = useToast();
  const { currentUser, users, updateUser } = useUser();
  
  const [notificationsAPI, setNotificationsAPI] = useState<any>(null);
  
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

      if (currentUser.wallet.balance < amount) {
        toast({
          title: "Insufficient funds",
          description: "Your wallet balance is too low for this withdrawal.",
          variant: "destructive",
        });
        return false;
      }

      const now = new Date().toISOString();
      const isCoordinatorOrDatacollector = ['coordinator', 'dataCollector'].includes(currentUser.role);
      
      const newTransaction: Transaction = {
        id: `tx${appTransactions.length + 1}`,
        userId: currentUser.id,
        amount,
        currency: currentUser.wallet.currency,
        type: 'debit',
        status: isCoordinatorOrDatacollector ? 'pending' : 'completed',
        description: `Withdrawal via ${method}${isCoordinatorOrDatacollector ? ' (Pending Admin Approval)' : ''}`,
        createdAt: now,
        method,
        reference: `WD-${Math.floor(Math.random() * 1000000)}`,
        bankDetails: method === 'Bank of Khartoum' ? bankDetails : undefined,
      };

      setAppTransactions(prev => [...prev, newTransaction]);

      if (!isCoordinatorOrDatacollector) {
        const updatedUser = {
          ...currentUser,
          wallet: {
            ...currentUser.wallet,
            balance: currentUser.wallet.balance - amount,
          },
        };
        updateUser(updatedUser);
      } else {
        const admins = users.filter(u => u.role === 'admin');
        admins.forEach(admin => {
          addNotification({
            userId: admin.id,
            title: "Withdrawal Approval Required",
            message: `${currentUser.name} has requested a withdrawal of ${amount} ${currentUser.wallet.currency} via ${method}. Please review and approve.`,
            type: "warning",
            link: `/admin/transactions/${newTransaction.id}`,
            relatedEntityId: newTransaction.id,
            relatedEntityType: "transaction",
          });
        });

        addNotification({
          userId: currentUser.id,
          title: "Withdrawal Request Submitted",
          message: `Your request to withdraw ${amount} ${currentUser.wallet.currency} via ${method} has been submitted for admin approval.`,
          type: "info",
          link: `/wallet`,
          relatedEntityId: newTransaction.id,
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

  const addTransaction = (transaction: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newTransaction: Transaction = {
      id: `tx${appTransactions.length + 1}`,
      createdAt: new Date().toISOString(),
      ...transaction,
    };

    setAppTransactions(prev => [...prev, newTransaction]);
    
    if (transaction.type === 'credit' && 
        transaction.userId === currentUser?.id && 
        transaction.status === 'completed') {
      updateUserBalance(transaction.userId, transaction.amount);
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
