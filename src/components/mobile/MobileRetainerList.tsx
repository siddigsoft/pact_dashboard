/**
 * MobileRetainerList Component
 * Mobile-optimized retainer list with filtering and offline support
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  WifiOff,
  Plus,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { MobileRetainerCard } from './MobileRetainerCard';
import { MobileFullScreenSignature, SignatureResult } from './MobileFullScreenSignature';
import type { Retainer, RetainerStatus } from '@/types/retainer';

interface MobileRetainerListProps {
  userId: string;
  userRole: string;
  offline?: boolean;
  className?: string;
}

interface RetainerKPIs {
  outstanding: number;
  pending: number;
  expiringSoon: number;
  currency: string;
}

export function MobileRetainerList({
  userId,
  userRole,
  offline = false,
  className,
}: MobileRetainerListProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retainers, setRetainers] = useState<Retainer[]>([]);
  const [kpis, setKpis] = useState<RetainerKPIs | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RetainerStatus | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const [selectedRetainer, setSelectedRetainer] = useState<Retainer | null>(null);

  const canApprove = ['finance_admin', 'super_admin'].includes(userRole);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Mock data
      const mockRetainers: Retainer[] = [
        {
          id: '1',
          userId: 'user1',
          userName: 'Ahmed Hassan',
          projectName: 'Field Survey Q4',
          amountCents: 50000,
          currency: 'SDG',
          period: '2024-12',
          status: 'pending',
          priority: 'high',
          holdReason: 'Performance bond for field equipment',
          approvalStatus: 'pending',
          createdBy: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: '2',
          userId: 'user2',
          userName: 'Fatima Ali',
          projectName: 'Data Collection Phase 2',
          amountCents: 75000,
          currency: 'SDG',
          period: '2024-12',
          status: 'approved',
          priority: 'normal',
          holdReason: 'Contract completion guarantee',
          approvalStatus: 'approved',
          expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
          createdBy: userId,
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          updatedAt: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: '3',
          userId: 'user3',
          userName: 'Mohamed Osman',
          amountCents: 30000,
          currency: 'SDG',
          period: '2024-11',
          status: 'released',
          priority: 'low',
          holdReason: 'Monthly performance retainer',
          approvalStatus: 'approved',
          createdBy: userId,
          createdAt: new Date(Date.now() - 2592000000).toISOString(),
          updatedAt: new Date(Date.now() - 172800000).toISOString(),
        },
      ];

      const mockKPIs: RetainerKPIs = {
        outstanding: 125000,
        pending: 50000,
        expiringSoon: 75000,
        currency: 'SDG',
      };

      setRetainers(mockRetainers);
      setKpis(mockKPIs);
    } catch (error) {
      console.error('Failed to load retainers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    hapticPresets.buttonPress();
    await loadData();
    setRefreshing(false);
  };

  const filteredRetainers = useMemo(() => {
    return retainers.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          r.userName?.toLowerCase().includes(query) ||
          r.projectName?.toLowerCase().includes(query) ||
          r.holdReason?.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [retainers, statusFilter, searchQuery]);

  const handleApprove = (retainer: Retainer) => {
    setSelectedRetainer(retainer);
    setShowSignature(true);
  };

  const handleSignatureComplete = async (signature: SignatureResult) => {
    if (!selectedRetainer) return;
    
    setRetainers(prev => prev.map(r => 
      r.id === selectedRetainer.id 
        ? { ...r, status: 'approved' as RetainerStatus, approvalStatus: 'approved', approvedAt: new Date().toISOString() }
        : r
    ));
    
    setShowSignature(false);
    setSelectedRetainer(null);
    hapticPresets.success();
  };

  const handleRelease = (retainer: Retainer) => {
    setRetainers(prev => prev.map(r => 
      r.id === retainer.id 
        ? { ...r, status: 'released' as RetainerStatus, releasedAt: new Date().toISOString() }
        : r
    ));
    hapticPresets.success();
  };

  const formatAmount = (cents: number, currency: string) => {
    return `${currency} ${(cents / 100).toLocaleString()}`;
  };

  const statusOptions: { value: RetainerStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'released', label: 'Released' },
    { value: 'expired', label: 'Expired' },
  ];

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="p-4 border-b border-black/10 dark:border-white/10 bg-white dark:bg-black safe-area-inset-top">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-black dark:text-white">Retainers</h1>
          <div className="flex items-center gap-2">
            {offline && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/5 dark:bg-white/5">
                <WifiOff className="h-4 w-4 text-black/60 dark:text-white/60" />
              </div>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
              data-testid="button-refresh-retainers"
              aria-label="Refresh retainers"
            >
              <RefreshCw className={cn("h-5 w-5 text-black dark:text-white", refreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* KPI Summary */}
        {kpis && (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            <div className="flex-shrink-0 px-4 py-2 rounded-full bg-black dark:bg-white">
              <p className="text-xs text-white/60 dark:text-black/60">Outstanding</p>
              <p className="text-sm font-bold text-white dark:text-black">
                {formatAmount(kpis.outstanding, kpis.currency)}
              </p>
            </div>
            <div className="flex-shrink-0 px-4 py-2 rounded-full bg-black/10 dark:bg-white/10">
              <p className="text-xs text-black/60 dark:text-white/60">Pending</p>
              <p className="text-sm font-bold text-black dark:text-white">
                {formatAmount(kpis.pending, kpis.currency)}
              </p>
            </div>
            <div className="flex-shrink-0 px-4 py-2 rounded-full bg-black/10 dark:bg-white/10">
              <p className="text-xs text-black/60 dark:text-white/60">Expiring Soon</p>
              <p className="text-sm font-bold text-black dark:text-white">
                {formatAmount(kpis.expiringSoon, kpis.currency)}
              </p>
            </div>
          </div>
        )}

        {/* Search & Filters */}
        <div className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-black/40 dark:text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search retainers..."
              className={cn(
                "w-full pl-12 pr-4 py-3 rounded-full",
                "bg-black/5 dark:bg-white/5",
                "text-black dark:text-white",
                "placeholder:text-black/40 dark:placeholder:text-white/40",
                "focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white",
                "min-h-[44px]"
              )}
              data-testid="input-search-retainers"
              aria-label="Search retainers"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setStatusFilter(option.value);
                  hapticPresets.selection();
                }}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap min-h-[44px]",
                  statusFilter === option.value
                    ? "bg-black dark:bg-white text-white dark:text-black"
                    : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
                )}
                data-testid={`button-filter-${option.value}`}
                aria-label={`Filter by ${option.label}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Retainer List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 rounded-2xl bg-black/5 dark:bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filteredRetainers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <DollarSign className="h-16 w-16 text-black/20 dark:text-white/20 mb-4" />
            <p className="text-black/60 dark:text-white/60">No retainers found</p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-sm text-black dark:text-white underline"
                data-testid="button-clear-search"
                aria-label="Clear search"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredRetainers.map((retainer) => (
              <motion.div
                key={retainer.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <MobileRetainerCard
                  retainer={retainer}
                  onApprove={handleApprove}
                  onRelease={handleRelease}
                  canApprove={canApprove}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Full Screen Signature */}
      <MobileFullScreenSignature
        isOpen={showSignature}
        onClose={() => {
          setShowSignature(false);
          setSelectedRetainer(null);
        }}
        onComplete={handleSignatureComplete}
        title="Approve Retainer"
        description={selectedRetainer ? `Sign to approve ${formatAmount(selectedRetainer.amountCents, selectedRetainer.currency)} for ${selectedRetainer.userName}` : undefined}
        requireBiometric={true}
        documentType="Retainer Approval"
        documentId={selectedRetainer?.id}
        offline={offline}
      />
    </div>
  );
}

export default MobileRetainerList;
