import { Wallet, TrendingUp, TrendingDown, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { format } from 'date-fns';

interface WalletData {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  balances: Record<string, number>;
  totalEarned?: number;
  totalWithdrawn?: number;
  pendingPayouts?: number;
  updatedAt?: string;
  transactions?: Array<{
    id: string;
    type: string;
    amount: number;
    createdAt: string;
    description?: string;
    status?: string;
  }>;
}

interface WalletCardProps {
  wallet: WalletData;
  currency?: string;
  onClick?: (userId: string) => void;
}

const formatCurrency = (cents: number, currency: string = 'SDG') => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
};

export function WalletCard({ wallet, currency = 'SDG', onClick }: WalletCardProps) {
  const balance       = (wallet.balances?.[currency] || 0) * 100;
  const totalEarned   = (wallet.totalEarned   || 0) * 100;
  const totalWithdrawn = (wallet.totalWithdrawn || 0) * 100;
  const isActive      = balance > 0 || totalEarned > 0;
  const utilizationRate = totalEarned > 0 ? (totalWithdrawn / totalEarned) * 100 : 0;
  const initials = (wallet.userName || wallet.userId || 'U')[0].toUpperCase();

  return (
    <div
      className="rounded-2xl overflow-hidden border border-slate-700 hover:border-teal-500/60 bg-slate-800 shadow-lg shadow-black/30 hover:shadow-teal-900/20 cursor-pointer transition-all group"
      onClick={() => onClick?.(wallet.userId)}
      data-testid={`wallet-card-${wallet.userId}`}
    >
      {/* teal accent strip */}
      <div className="h-1 bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400" />

      {/* header */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-teal-900/50 group-hover:bg-teal-500 transition-colors">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white truncate leading-tight">{wallet.userName || wallet.userId}</p>
            <p className="text-xs text-teal-400 truncate mt-0.5">{wallet.userEmail || 'User Wallet'}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
          isActive
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'bg-slate-700 text-slate-400 border border-slate-600'
        }`}>
          {isActive ? 'ACTIVE' : 'INACTIVE'}
        </span>
      </div>

      {/* balance */}
      <div className="mx-5 mb-4 rounded-xl bg-slate-700/50 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Current Balance</p>
        <p className="text-2xl font-extrabold text-teal-300">{formatCurrency(balance, currency)}</p>
      </div>

      {/* earned / withdrawn grid */}
      <div className="mx-5 mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-700/30 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
            <ArrowUpRight className="w-3 h-3 text-emerald-400" /> Earned
          </div>
          <p className="font-bold text-emerald-400 text-sm">{formatCurrency(totalEarned, currency)}</p>
        </div>
        <div className="rounded-xl bg-slate-700/30 px-3 py-2">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
            <ArrowDownRight className="w-3 h-3 text-orange-400" /> Withdrawn
          </div>
          <p className="font-bold text-orange-400 text-sm">{formatCurrency(totalWithdrawn, currency)}</p>
        </div>
      </div>

      {/* progress bar */}
      {totalEarned > 0 && (
        <div className="mx-5 mb-4">
          <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider mb-1">
            <span>Payout Progress</span>
            <span className="text-teal-400 font-bold">{utilizationRate.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-1.5 bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full"
              style={{ width: `${Math.min(utilizationRate, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* timestamp */}
      {wallet.updatedAt && (
        <div className="mx-5 mb-4 flex items-center gap-1.5 text-[10px] text-slate-500">
          <Clock className="w-3 h-3" />
          <span className="uppercase tracking-wide">Updated {format(new Date(wallet.updatedAt), 'MMM dd, yyyy')}</span>
        </div>
      )}
    </div>
  );
}
