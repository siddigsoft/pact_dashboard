import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Eye, 
  EyeOff, 
  Plus, 
  Send,
  History,
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  AlertCircle,
  Clock,
  Check,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { format } from 'date-fns';

interface Transaction {
  id: string;
  type: 'credit' | 'debit' | 'pending';
  amount: number;
  currency?: string;
  description: string;
  category?: string;
  timestamp: Date;
  status?: 'completed' | 'pending' | 'failed';
  reference?: string;
}

interface MobileWalletCardProps {
  balance: number;
  currency?: string;
  pendingAmount?: number;
  walletName?: string;
  cardColor?: 'black' | 'gradient' | 'white';
  showBalance?: boolean;
  onToggleBalance?: () => void;
  onAddFunds?: () => void;
  onSend?: () => void;
  onHistory?: () => void;
  className?: string;
}

export function MobileWalletCard({
  balance,
  currency = 'SDG',
  pendingAmount = 0,
  walletName = 'My Wallet',
  cardColor = 'black',
  showBalance: initialShowBalance = true,
  onToggleBalance,
  onAddFunds,
  onSend,
  onHistory,
  className,
}: MobileWalletCardProps) {
  const [showBalance, setShowBalance] = useState(initialShowBalance);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const handleToggleBalance = useCallback(() => {
    hapticPresets.selection();
    setShowBalance(!showBalance);
    onToggleBalance?.();
  }, [showBalance, onToggleBalance]);

  const cardStyles = {
    black: 'bg-black text-white',
    gradient: 'bg-gradient-to-br from-neutral-900 to-neutral-700 text-white',
    white: 'bg-white text-black border border-black/10',
  };

  return (
    <div 
      className={cn(
        "rounded-3xl p-6 relative overflow-hidden",
        cardStyles[cardColor],
        className
      )}
      data-testid="wallet-card"
    >
      <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-white/5 -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white/5 translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              cardColor === 'white' ? 'bg-black/5' : 'bg-white/10'
            )}>
              <Wallet className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium opacity-80">{walletName}</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleBalance}
            className={cn(
              "rounded-full",
              cardColor === 'white' ? 'text-black hover:bg-black/5' : 'text-white hover:bg-white/10'
            )}
            data-testid="button-toggle-balance"
          >
            {showBalance ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </Button>
        </div>

        <div className="mb-6">
          <p className="text-xs opacity-60 mb-1">Available Balance</p>
          <motion.div
            initial={false}
            animate={{ opacity: 1 }}
            className="flex items-baseline gap-2"
          >
            <span className="text-3xl font-bold">
              {showBalance ? formatCurrency(balance) : '••••••'}
            </span>
            <span className="text-sm opacity-60">{currency}</span>
          </motion.div>

          {pendingAmount > 0 && (
            <div className="flex items-center gap-1 mt-2">
              <Clock className="h-3 w-3 opacity-60" />
              <span className="text-xs opacity-60">
                {showBalance ? `${formatCurrency(pendingAmount)} pending` : '•••• pending'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onAddFunds && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                hapticPresets.buttonPress();
                onAddFunds();
              }}
              className={cn(
                "rounded-full flex-1",
                cardColor === 'white' 
                  ? 'bg-black text-white hover:bg-black/90' 
                  : 'bg-white text-black hover:bg-white/90'
              )}
              data-testid="button-add-funds"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}

          {onSend && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                hapticPresets.buttonPress();
                onSend();
              }}
              className={cn(
                "rounded-full flex-1",
                cardColor === 'white'
                  ? 'bg-black/10 text-black hover:bg-black/20'
                  : 'bg-white/10 text-white hover:bg-white/20'
              )}
              data-testid="button-send"
            >
              <Send className="h-4 w-4 mr-1" />
              Send
            </Button>
          )}

          {onHistory && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                hapticPresets.buttonPress();
                onHistory();
              }}
              className={cn(
                "rounded-full",
                cardColor === 'white' ? 'hover:bg-black/5' : 'hover:bg-white/10'
              )}
              data-testid="button-history"
            >
              <History className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface TransactionListProps {
  transactions: Transaction[];
  onTransactionPress?: (transaction: Transaction) => void;
  showHeader?: boolean;
  limit?: number;
  className?: string;
}

export function TransactionList({
  transactions,
  onTransactionPress,
  showHeader = true,
  limit,
  className,
}: TransactionListProps) {
  const displayTransactions = limit ? transactions.slice(0, limit) : transactions;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className={cn("", className)} data-testid="transaction-list">
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-black dark:text-white">
            Recent Transactions
          </h3>
          {limit && transactions.length > limit && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              data-testid="button-view-all"
            >
              View All
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      )}

      {displayTransactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CreditCard className="h-10 w-10 text-black/20 dark:text-white/20 mb-3" />
          <p className="text-sm text-black/60 dark:text-white/60">No transactions yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayTransactions.map((transaction) => (
            <TransactionItem
              key={transaction.id}
              transaction={transaction}
              onPress={() => {
                hapticPresets.buttonPress();
                onTransactionPress?.(transaction);
              }}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TransactionItemProps {
  transaction: Transaction;
  onPress?: () => void;
  formatCurrency: (amount: number) => string;
}

function TransactionItem({ transaction, onPress, formatCurrency }: TransactionItemProps) {
  const getIcon = () => {
    switch (transaction.type) {
      case 'credit':
        return <ArrowDownLeft className="h-4 w-4" />;
      case 'debit':
        return <ArrowUpRight className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
    }
  };

  const getIconBg = () => {
    switch (transaction.type) {
      case 'credit':
        return 'bg-black/10 dark:bg-white/10 text-black dark:text-white';
      case 'debit':
        return 'bg-black/10 dark:bg-white/10 text-black dark:text-white';
      case 'pending':
        return 'bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60';
    }
  };

  const getStatusIcon = () => {
    switch (transaction.status) {
      case 'completed':
        return <Check className="h-3 w-3 text-black dark:text-white" />;
      case 'failed':
        return <X className="h-3 w-3 text-destructive" />;
      case 'pending':
        return <Clock className="h-3 w-3 text-black/40 dark:text-white/40" />;
      default:
        return null;
    }
  };

  return (
    <motion.button
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 text-left touch-manipulation"
      onClick={onPress}
      whileTap={{ scale: 0.98 }}
      data-testid={`transaction-${transaction.id}`}
    >
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
        getIconBg()
      )}>
        {getIcon()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium text-black dark:text-white truncate">
            {transaction.description}
          </p>
          {getStatusIcon()}
        </div>
        <p className="text-xs text-black/60 dark:text-white/60">
          {transaction.category && `${transaction.category} • `}
          {format(transaction.timestamp, 'MMM d, HH:mm')}
        </p>
      </div>

      <div className="text-right flex-shrink-0">
        <p className={cn(
          "text-sm font-semibold",
          transaction.type === 'credit' ? "text-black dark:text-white" : "text-black dark:text-white",
          transaction.type === 'pending' && "text-black/60 dark:text-white/60"
        )}>
          {transaction.type === 'credit' ? '+' : '-'}
          {formatCurrency(transaction.amount)}
        </p>
      </div>
    </motion.button>
  );
}

interface WalletStatsProps {
  income: number;
  expenses: number;
  currency?: string;
  period?: string;
  className?: string;
}

export function WalletStats({
  income,
  expenses,
  currency = 'SDG',
  period = 'This Month',
  className,
}: WalletStatsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className={cn("", className)} data-testid="wallet-stats">
      <p className="text-xs text-black/40 dark:text-white/40 mb-3">{period}</p>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-black dark:text-white" />
            </div>
            <span className="text-xs text-black/60 dark:text-white/60">Income</span>
          </div>
          <p className="text-lg font-bold text-black dark:text-white">
            +{formatCurrency(income)}
          </p>
          <p className="text-xs text-black/40 dark:text-white/40">{currency}</p>
        </div>

        <div className="p-4 rounded-xl bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-black dark:text-white" />
            </div>
            <span className="text-xs text-black/60 dark:text-white/60">Expenses</span>
          </div>
          <p className="text-lg font-bold text-black dark:text-white">
            -{formatCurrency(expenses)}
          </p>
          <p className="text-xs text-black/40 dark:text-white/40">{currency}</p>
        </div>
      </div>
    </div>
  );
}

interface BalanceAlertProps {
  threshold: number;
  currentBalance: number;
  currency?: string;
  onDismiss?: () => void;
  className?: string;
}

export function BalanceAlert({
  threshold,
  currentBalance,
  currency = 'SDG',
  onDismiss,
  className,
}: BalanceAlertProps) {
  if (currentBalance >= threshold) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20",
        className
      )}
      data-testid="balance-alert"
    >
      <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-destructive">Low Balance Warning</p>
        <p className="text-xs text-destructive/80">
          Your balance is below {threshold} {currency}
        </p>
      </div>
      {onDismiss && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            hapticPresets.buttonPress();
            onDismiss();
          }}
          className="text-destructive"
          data-testid="button-dismiss-alert"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </motion.div>
  );
}
