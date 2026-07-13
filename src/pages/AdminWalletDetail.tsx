import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Wallet, WalletTransaction } from '@/types/wallet';
import { ArrowLeft, MapPin, TrendingUp, DollarSign, Briefcase, Calendar, CheckCircle, Clock, XCircle, Pencil, Check, X, Loader2, History, Truck, FileText, Printer, CreditCard, Upload } from 'lucide-react';

const currencyFmt = (amount: number, currency: string) => 
  new Intl.NumberFormat(undefined, { 
    style: 'currency', 
    currency: currency || 'SDG', 
    currencyDisplay: 'narrowSymbol' 
  }).format(amount);

const AdminWalletDetail = () => {
  const params = useParams();
  const navigate = useNavigate();
  const userId = params.userId as string;
  const { toast } = useToast();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [siteVisits, setSiteVisits] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [currency, setCurrency] = useState('SDG');
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjDirection, setAdjDirection] = useState<'credit'|'debit'>('credit');
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingSiteVisits, setLoadingSiteVisits] = useState(true);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editTxAmount, setEditTxAmount] = useState('');
  const [savingTx, setSavingTx] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [applyingRates, setApplyingRates] = useState(false);
  const [downPayments, setDownPayments] = useState<any[]>([]);
  const [mmps, setMmps] = useState<{ id: string; name: string }[]>([]);
  const [selectedMmp, setSelectedMmp] = useState<string>('all');
  const [siteVisitCosts, setSiteVisitCosts] = useState<any[]>([]);
  const [operationalCosts, setOperationalCosts] = useState<any[]>([]);
  // Per-MMP rate overrides — pre-filled from actual site entries, editable
  const [mmpRateOverrides, setMmpRateOverrides] = useState<Record<string, { enumRate: number; transRate: number }>>({});
  const [showRateEditor, setShowRateEditor] = useState(false);
  // Admin Direct Payment dialog
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payFile, setPayFile] = useState<File | null>(null);
  const [paying, setPaying] = useState(false);

  const loadWalletData = async () => {
    if (!userId) return;

    try {
      // ── Phase 1: wallet balance + transactions (fast — show immediately) ─────
      setLoading(true);
      setLoadingProfile(true);
      setLoadingSiteVisits(true);

      const [profileResult, rpcResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role, hub_id')
          .eq('id', userId)
          .single(),
        supabase.rpc('admin_get_user_wallet_data', { p_user_id: userId }),
      ]);

      if (profileResult.error) {
        console.error('Failed to load profile:', profileResult.error);
      } else if (profileResult.data) {
        setUserProfile(profileResult.data);
      }
      setLoadingProfile(false);

      let txnData: any[] = [];

      const walletRaw = rpcResult.data?.wallet;
      if (rpcResult.error || !walletRaw) {
        console.error('Failed to load wallet:', rpcResult.error);
        setWallet(null);
      } else {
        const transformedWallet: Wallet = {
          id: walletRaw.id,
          userId: walletRaw.user_id,
          balances: walletRaw.balances || { SDG: 0 },
          totalEarned: parseFloat(walletRaw.total_earned || 0),
          totalWithdrawn: parseFloat(walletRaw.total_withdrawn || 0),
          createdAt: walletRaw.created_at,
          updatedAt: walletRaw.updated_at,
        };
        setWallet(transformedWallet);
        const walletCurrencies = Object.keys(transformedWallet.balances);
        if (walletCurrencies.length > 0 && !walletCurrencies.includes(currency)) {
          setCurrency(walletCurrencies[0] || 'SDG');
        }
      }

      const rawTxns: any[] = rpcResult.data?.transactions || [];
      if (rawTxns.length > 0) {
        txnData = rawTxns;
        const transformedTxns: WalletTransaction[] = txnData.map(t => ({
          id: t.id,
          walletId: t.wallet_id,
          userId: t.user_id,
          type: t.type,
          amount: parseFloat(t.amount),
          currency: t.currency,
          siteVisitId: t.site_visit_id,
          withdrawalRequestId: t.withdrawal_request_id,
          description: t.description,
          metadata: t.metadata,
          balanceBefore: t.balance_before ? parseFloat(t.balance_before) : undefined,
          balanceAfter: t.balance_after ? parseFloat(t.balance_after) : undefined,
          createdBy: t.created_by,
          createdAt: t.created_at,
        }));
        setTransactions(transformedTxns);
      }

      // Phase 1 done — page is interactive now
      setLoading(false);

      // ── Phase 2: site visits + costs (background — doesn't block the UI) ────
      const [sitesResult, dpResult, svcResult, ocResult] = await Promise.all([
        supabase
          .from('mmp_site_entries')
          .select(`
            id,
            site_name,
            site_code,
            status,
            state,
            locality,
            accepted_at,
            visit_completed_at,
            enumerator_fee,
            transport_fee,
            cost,
            mmp_file_id,
            mmp_files(id, name)
          `)
          .eq('accepted_by', userId)
          .order('accepted_at', { ascending: false })
          .limit(200),
        supabase
          .from('down_payment_requests')
          .select('id, site_name, mmp_site_entry_id, total_paid_amount, remaining_amount, requested_amount, status, requested_at, payment_proof_url, supporting_documents')
          .eq('requested_by', userId)
          .not('status', 'in', '("pending_supervisor","pending_admin","rejected","cancelled","deleted")')
          .order('requested_at', { ascending: false }),
        supabase
          .from('site_visit_cost_submissions')
          .select('id, site_visit_id, mmp_file_id, submitted_at, total_cost_cents, transportation_cost_cents, accommodation_cost_cents, meal_allowance_cents, other_costs_cents, currency, status, supporting_documents, payment_proof_url, wallet_transaction_id, submission_notes')
          .eq('submitted_by', userId)
          .order('submitted_at', { ascending: false })
          .limit(200),
        supabase
          .from('operational_cost_submissions')
          .select('id, mmp_file_id, hub_id, submitted_at, amount_cents, currency, status, description, expense_category, expense_date, vendor, reference_number, supporting_documents, payment_proof_url')
          .eq('submitted_by', userId)
          .order('submitted_at', { ascending: false })
          .limit(200),
      ]);

      if (sitesResult.error) {
        console.error('Failed to load site visits:', sitesResult.error);
      } else if (sitesResult.data) {
        const sitesWithPayments = sitesResult.data.map(site => {
          const payment = txnData.find(
            t => t.site_visit_id === site.id && (t.type === 'earning' || t.type === 'site_visit_fee')
          );
          const isCompleted = site.status?.toLowerCase() === 'completed' || site.status?.toLowerCase() === 'verified';
          return {
            ...site,
            isCompleted,
            payment: payment ? { amount: parseFloat(payment.amount), date: payment.created_at } : null
          };
        });
        setSiteVisits(sitesWithPayments);

        // Resolve MMP names
        const mmpIds = [...new Set(sitesResult.data.map((s: any) => s.mmp_file_id).filter(Boolean))];
        if (mmpIds.length > 0) {
          const joinedNames = new Map<string, string>();
          for (const s of sitesResult.data) {
            if (s.mmp_file_id && (s as any).mmp_files?.name) {
              joinedNames.set(s.mmp_file_id, (s as any).mmp_files.name);
            }
          }
          const unresolvedIds = mmpIds.filter(id => !joinedNames.has(id));
          if (unresolvedIds.length > 0) {
            const { data: mmpData } = await supabase
              .from('mmp_files')
              .select('id, name')
              .in('id', unresolvedIds);
            if (mmpData) {
              for (const m of mmpData) joinedNames.set(m.id, m.name);
            }
          }
          const builtMmps = mmpIds.map(id => ({ id, name: joinedNames.get(id) || id }));
          setMmps(builtMmps);
          // Pre-fill rate editor with existing fees from site entries (most common value per MMP)
          const prefill: Record<string, { enumRate: number; transRate: number }> = {};
          for (const mmpId of mmpIds) {
            const sitesForMmp = sitesResult.data.filter((s: any) => s.mmp_file_id === mmpId);
            const enumCounts = new Map<number, number>();
            for (const s of sitesForMmp) {
              const ef = Number(s.enumerator_fee || 0);
              if (ef > 0) enumCounts.set(ef, (enumCounts.get(ef) || 0) + 1);
            }
            const topEnum = [...enumCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
            if (topEnum > 0) {
              prefill[mmpId] = { enumRate: topEnum, transRate: 0 };
            }
          }
          setMmpRateOverrides(prefill);
        } else {
          setMmps([]);
        }
      }
      setLoadingSiteVisits(false);

      if (!dpResult.error && dpResult.data) {
        setDownPayments(dpResult.data);
      } else {
        if (dpResult.error) console.warn('Could not load down payment records:', dpResult.error?.message);
        setDownPayments([]);
      }

      if (!svcResult.error && svcResult.data) {
        setSiteVisitCosts(svcResult.data);
      } else {
        if (svcResult.error) console.warn('site_visit_cost_submissions fetch:', svcResult.error?.message);
        setSiteVisitCosts([]);
      }

      if (!ocResult.error && ocResult.data) {
        setOperationalCosts(ocResult.data);
      } else {
        if (ocResult.error) console.warn('operational_cost_submissions fetch:', ocResult.error?.message);
        setOperationalCosts([]);
      }
    } catch (error) {
      console.error('Error loading wallet data:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while loading wallet data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setLoadingProfile(false);
      setLoadingSiteVisits(false);
    }
  };

  useEffect(() => {
    loadWalletData();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(loadWalletData, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`admin_wallet_detail_${userId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'wallets', 
        filter: `user_id=eq.${userId}` 
      }, loadWalletData)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'wallet_transactions', 
        filter: `user_id=eq.${userId}` 
      }, loadWalletData);
    channel.subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (error) {
        console.error('Error removing channel:', error);
      }
    };
  }, [userId]);

  // Compute work statistics
  const workStats = useMemo(() => {
    const completedSites = siteVisits.filter(s => s.status?.toLowerCase() === 'completed' || s.status?.toLowerCase() === 'verified').length;
    const pendingSites = siteVisits.filter(s => s.status?.toLowerCase() === 'assigned' || s.status?.toLowerCase() === 'in progress').length;
    const totalSites = siteVisits.length;
    const completionRate = totalSites > 0 ? (completedSites / totalSites) * 100 : 0;

    return { completedSites, pendingSites, totalSites, completionRate };
  }, [siteVisits]);

  // Compute earnings breakdown by source
  const earningsBreakdown = useMemo(() => {
    // Check for both old 'site_visit_fee' and new 'earning' transaction types
    const siteVisitEarnings = transactions
      .filter(t => t.type === 'earning' || t.type === 'site_visit_fee')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const bonuses = transactions
      .filter(t => t.type === 'bonus')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const adjustments = transactions
      .filter(t => t.type === 'adjustment')
      .reduce((sum, t) => sum + t.amount, 0);

    const withdrawals = transactions
      .filter(t => t.type === 'withdrawal')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return { siteVisitEarnings, bonuses, adjustments, withdrawals };
  }, [transactions]);

  const totals = useMemo(() => {
    let earned = 0;
    let withdrawn = 0;
    for (const t of transactions) {
      const amt = Number(t.amount || 0);
      if (['earning', 'site_visit_fee', 'bonus', 'adjustment'].includes(t.type)) {
        earned += amt;
      } else if (['withdrawal', 'penalty', 'debit'].includes(t.type)) {
        withdrawn += Math.abs(amt);
      }
    }
    return { earned, withdrawn };
  }, [transactions]);

  // Total transport advances already paid in cash via the Down Payments page.
  // Only the actually-paid portion (total_paid_amount) is deducted — not the
  // remaining/unpaid portion, and not rejected/cancelled records.
  const totalAdvancesPaid = useMemo(() => {
    return downPayments.reduce((sum, dp) => {
      const paid = parseFloat(dp.total_paid_amount || 0);
      return sum + (paid > 0 ? paid : 0);
    }, 0);
  }, [downPayments]);

  // Bank-statement ledger: merge wallet transactions + down payment cash entries,
  // sorted oldest-first, then compute running balance after each entry.
  const statementLedger = useMemo(() => {
    type LedgerRow = {
      id: string;
      date: string;
      description: string;
      category: string;
      credit: number;
      debit: number;
      balance: number;
      source: 'transaction' | 'advance';
    };

    const creditTypes = ['earning', 'site_visit_fee', 'bonus', 'adjustment', 'adjustment_credit'];
    const debitTypes  = ['withdrawal', 'penalty', 'debit', 'adjustment_debit'];

    const rows: Omit<LedgerRow, 'balance'>[] = [];

    // Wallet transactions
    for (const t of transactions) {
      const amt = Math.abs(Number(t.amount || 0));
      const isCredit = creditTypes.includes(t.type);
      const isDebit  = debitTypes.includes(t.type);
      if (!isCredit && !isDebit) continue;
      rows.push({
        id: t.id,
        date: t.createdAt,
        description: t.description || t.type.replace(/_/g, ' '),
        category: t.type.replace(/_/g, ' '),
        credit: isCredit ? amt : 0,
        debit:  isDebit  ? amt : 0,
        source: 'transaction',
      });
    }

    // Down payment cash-paid entries (treated as debits — transport advance)
    for (const dp of downPayments) {
      const paid = parseFloat(dp.total_paid_amount || 0);
      if (paid <= 0) continue;
      rows.push({
        id: `dp-${dp.id}`,
        date: dp.requested_at,
        description: `Transport advance${dp.site_name ? ` — ${dp.site_name}` : ''} (${(dp.status || '').replace(/_/g, ' ')})`,
        category: 'Transport Advance',
        credit: 0,
        debit: paid,
        source: 'advance',
      });
    }

    // Sort chronologically (oldest first for statement readability)
    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Compute running balance
    let running = 0;
    const ledger: LedgerRow[] = rows.map(r => {
      running = running + r.credit - r.debit;
      return { ...r, balance: running };
    });

    return ledger;
  }, [transactions, downPayments]);

  // Per-site transport breakdown: enum fee, transport fee, advance paid, remaining owed
  const transportBreakdown = useMemo(() => {
    return siteVisits.map(site => {
      const enumFee   = Number(site.enumerator_fee || 0);
      const transFee  = Number(site.transport_fee || 0);
      // Find if a down payment was made for this site entry
      const advance   = downPayments.find(dp => dp.mmp_site_entry_id === site.id);
      const advPaid   = advance ? parseFloat(advance.total_paid_amount || 0) : 0;
      const advStatus = advance?.status || null;
      const remaining = transFee - advPaid;
      return { ...site, enumFee, transFee, advPaid, advStatus, remaining };
    });
  }, [siteVisits, downPayments]);

  // MMP-filtered site visits and derived data
  const filteredSiteVisits = useMemo(() =>
    selectedMmp === 'all' ? siteVisits : siteVisits.filter(s => s.mmp_file_id === selectedMmp),
    [siteVisits, selectedMmp]
  );

  const filteredTransportBreakdown = useMemo(() => {
    const base = selectedMmp === 'all' ? siteVisits : siteVisits.filter(s => s.mmp_file_id === selectedMmp);
    return base.map(site => {
      const enumFee  = Number(site.enumerator_fee || 0);
      const transFee = Number(site.transport_fee  || 0);
      const advance  = downPayments.find(dp => dp.mmp_site_entry_id === site.id);
      const advPaid  = advance ? parseFloat(advance.total_paid_amount || 0) : 0;
      const advStatus = advance?.status || null;
      const remaining = transFee - advPaid;
      // Apply per-MMP rate override if set (display-only, never changes wallet data)
      const mmpId = site.mmp_file_id || '';
      const override = mmpRateOverrides[mmpId];
      const displayEnumFee  = override?.enumRate  ? override.enumRate  : enumFee;
      const displayTransFee = override?.transRate ? override.transRate : transFee;
      return { ...site, enumFee, transFee, advPaid, advStatus, remaining, displayEnumFee, displayTransFee };
    });
  }, [siteVisits, downPayments, selectedMmp, mmpRateOverrides]);

  // Filtered cost submissions by MMP
  const filteredSiteVisitCosts = useMemo(() =>
    selectedMmp === 'all' ? siteVisitCosts : siteVisitCosts.filter(c => c.mmp_file_id === selectedMmp),
    [siteVisitCosts, selectedMmp]
  );
  const filteredOperationalCosts = useMemo(() =>
    selectedMmp === 'all' ? operationalCosts : operationalCosts.filter(c => c.mmp_file_id === selectedMmp),
    [operationalCosts, selectedMmp]
  );

  // Helper: parse receipt URLs from a down-payment or cost-submission row
  const parseReceipts = (row: any): string[] => {
    const urls: string[] = [];
    // payment_proof_url can be a plain URL string or a JSON array of strings
    if (row?.payment_proof_url) {
      try {
        const parsed = JSON.parse(row.payment_proof_url);
        if (Array.isArray(parsed)) urls.push(...parsed.filter(Boolean));
        else if (typeof parsed === 'string' && parsed) urls.push(parsed);
      } catch {
        urls.push(row.payment_proof_url);
      }
    }
    // supporting_documents is a JSONB array of { url, filename, … } objects
    if (row?.supporting_documents) {
      try {
        const docs = Array.isArray(row.supporting_documents)
          ? row.supporting_documents
          : JSON.parse(row.supporting_documents);
        for (const d of docs) {
          const u = d?.url || d?.fileUrl || d?.file_url;
          if (u) urls.push(u);
        }
      } catch {}
    }
    return [...new Set(urls)]; // deduplicate
  };

  // Sites where money is still owed — either transport not fully paid by advance,
  // or the enumerator fee hasn't been credited as a wallet transaction yet.
  const unpaidFees = useMemo(() => {
    return transportBreakdown
      .map(site => {
        const unpaidTransport = site.transFee > 0 && site.remaining > 0.005 ? site.remaining : 0;
        const unpaidEnum      = site.isCompleted && site.enumFee > 0 && !site.payment ? site.enumFee : 0;
        const totalUnpaid     = unpaidTransport + unpaidEnum;
        return { ...site, unpaidTransport, unpaidEnum, totalUnpaid };
      })
      .filter(s => s.totalUnpaid > 0);
  }, [transportBreakdown]);

  const startEditTx = (txn: WalletTransaction) => {
    setEditingTxId(txn.id);
    setEditTxAmount(String(txn.amount));
  };

  const cancelEditTx = () => {
    setEditingTxId(null);
    setEditTxAmount('');
  };

  const saveEditTx = async (txnId: string) => {
    const newAmount = parseFloat(editTxAmount);
    if (isNaN(newAmount) || newAmount === 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid non-zero amount', variant: 'destructive' });
      return;
    }

    setSavingTx(true);
    try {
      const updateData: Record<string, any> = { amount: newAmount };
      
      const { error } = await supabase
        .from('wallet_transactions')
        .update(updateData)
        .eq('id', txnId);

      if (error) throw error;

      toast({ title: 'Transaction Updated', description: `Amount updated to ${newAmount.toLocaleString()} ${currency}` });
      setEditingTxId(null);
      setEditTxAmount('');
      await loadWalletData();
    } catch (error: any) {
      toast({ title: 'Update Failed', description: error?.message || 'Could not update transaction', variant: 'destructive' });
    } finally {
      setSavingTx(false);
    }
  };

  // ── Apply rate overrides to mmp_site_entries then recalculate wallet ────────
  const applyRatesAndRecalculate = async () => {
    const overridedMmps = Object.entries(mmpRateOverrides).filter(
      ([, ov]) => ov.enumRate > 0 || ov.transRate > 0
    );
    if (overridedMmps.length === 0) {
      toast({ title: 'No rates set', description: 'Enter at least one Enum or Trans rate before applying.', variant: 'destructive' });
      return;
    }
    setApplyingRates(true);
    try {
      let sitesUpdated = 0;
      for (const [mmpId, ov] of overridedMmps) {
        // Get the site IDs for this user in this MMP
        const mmpSites = siteVisits.filter(s => s.mmp_file_id === mmpId);
        if (mmpSites.length === 0) continue;
        const siteIds = mmpSites.map(s => s.id);

        // Only update enumerator_fee — transport is fixed/already paid
        const updatePayload: Record<string, number> = {};
        if (ov.enumRate > 0) updatePayload.enumerator_fee = ov.enumRate;

        const { error } = await supabase
          .from('mmp_site_entries')
          .update(updatePayload)
          .in('id', siteIds);

        if (error) throw error;
        sitesUpdated += siteIds.length;
      }

      toast({
        title: `${sitesUpdated} site${sitesUpdated !== 1 ? 's' : ''} updated`,
        description: 'Fee rates saved to site entries. Recalculating wallet…',
      });

      // Reload site visits so recalculateWalletTotals picks up new fee values
      await loadWalletData();
      await recalculateWalletTotals();
    } catch (err: any) {
      toast({ title: 'Apply Failed', description: err?.message || 'Could not update site entries.', variant: 'destructive' });
    } finally {
      setApplyingRates(false);
    }
  };

  const handleAdminDirectPayment = async () => {
    if (!wallet) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a positive amount to pay.', variant: 'destructive' });
      return;
    }
    const currentBalance = (wallet.balances?.[currency] ?? 0) as number;
    if (amount > currentBalance) {
      toast({ title: 'Insufficient balance', description: `Balance is only ${currencyFmt(currentBalance, currency)}`, variant: 'destructive' });
      return;
    }
    setPaying(true);
    try {
      // 1. Upload receipt if provided
      let proofUrl: string | null = null;
      if (payFile) {
        const ext = payFile.name.split('.').pop() || 'jpg';
        const filePath = `wallet-payments/${userId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('mmp-files')
          .upload(filePath, payFile, { cacheControl: '3600', upsert: false });
        if (uploadErr) throw new Error(`Receipt upload failed: ${uploadErr.message}`);
        proofUrl = supabase.storage.from('mmp-files').getPublicUrl(filePath).data.publicUrl;
      }

      // 2. Deduct from wallet balance
      const newBalance = Number((currentBalance - amount).toFixed(2));
      const newBalances = { ...wallet.balances, [currency]: newBalance };
      const newTotalWithdrawn = Number(wallet.total_withdrawn ?? 0) + amount;

      const { error: walletErr } = await supabase
        .from('wallets')
        .update({
          balances: newBalances,
          total_withdrawn: newTotalWithdrawn,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wallet.id);
      if (walletErr) throw walletErr;

      // 3. Record withdrawal transaction (with proof URL stored in description for now)
      const desc = [
        `Admin direct payment`,
        payNote ? `— ${payNote}` : '',
        proofUrl ? `| receipt: ${proofUrl}` : '',
      ].filter(Boolean).join(' ');

      const { error: txErr } = await supabase.from('wallet_transactions').insert({
        wallet_id: wallet.id,
        user_id: userId,
        type: 'withdrawal',
        amount: -amount,
        amount_cents: Math.round(amount * 100),
        currency,
        description: desc,
        balance_before: currentBalance,
        balance_after: newBalance,
      });
      if (txErr) throw txErr;

      toast({ title: 'Payment processed', description: `${currencyFmt(amount, currency)} paid directly to ${userProfile?.full_name || 'enumerator'}.` });
      setPayOpen(false);
      setPayAmount('');
      setPayNote('');
      setPayFile(null);
      await loadWalletData();
    } catch (err: any) {
      toast({ title: 'Payment failed', description: err?.message || 'Could not process payment.', variant: 'destructive' });
    } finally {
      setPaying(false);
    }
  };

  const recalculateWalletTotals = async () => {
    if (!wallet) return;
    setRecalculating(true);
    try {
      const { data: allTransactions, error: txError } = await supabase
        .from('wallet_transactions')
        .select('id, amount, type, currency, site_visit_id, related_site_visit_id, description')
        .eq('user_id', userId);

      if (txError) throw txError;

      const earningTxs = (allTransactions || []).filter(tx =>
        (tx.type === 'earning' || tx.type === 'site_visit_fee') &&
        (tx.site_visit_id || tx.related_site_visit_id)
      );

      let txUpdated = 0;

      if (earningTxs.length > 0) {
        const siteEntryIds = earningTxs
          .map(tx => tx.site_visit_id || tx.related_site_visit_id)
          .filter(Boolean) as string[];

        const { data: entries } = await supabase
          .from('mmp_site_entries')
          .select('id, site_name, site_code, enumerator_fee, transport_fee, cost')
          .in('id', siteEntryIds);

        const entryDataMap = new Map(
          (entries || []).map(e => {
            const enumFee = Number(e.enumerator_fee || 0);
            const transportFee = Number(e.transport_fee || 0);
            const storedCost = Number(e.cost || 0);
            const calculatedTotal = enumFee + transportFee;
            const totalFee = calculatedTotal > 0 ? calculatedTotal : (storedCost > 0 ? storedCost : 0);
            console.log(`[Recalculate] Site "${e.site_name}" (${e.id}): enumerator_fee=${e.enumerator_fee}, transport_fee=${e.transport_fee}, cost=${e.cost} → totalFee=${totalFee} (using ${calculatedTotal > 0 ? 'enum+transport' : 'cost field'})`);
            return [e.id, { 
              totalFee, 
              enumFee, 
              transportFee, 
              storedCost,
              siteName: e.site_name || '', 
              siteCode: e.site_code || '' 
            }];
          })
        );

        for (const tx of earningTxs) {
          const entryId = tx.site_visit_id || tx.related_site_visit_id;
          if (!entryId) continue;
          const entryData = entryDataMap.get(entryId);
          if (!entryData || entryData.totalFee <= 0) continue;

          let needsUpdate = false;
          const updatePayload: Record<string, any> = {};

          if (Math.abs(Number(tx.amount) - entryData.totalFee) >= 0.01) {
            updatePayload.amount = entryData.totalFee;
            needsUpdate = true;
          }

          if (entryData.siteName) {
            const correctDesc = `Site visit completed: ${entryData.siteName}`;
            if (tx.description !== correctDesc) {
              updatePayload.description = correctDesc;
              needsUpdate = true;
            }
          }

          if (needsUpdate) {
            await supabase
              .from('wallet_transactions')
              .update(updatePayload)
              .eq('id', tx.id);
            txUpdated++;
            console.log(`[Recalculate] Updated tx ${tx.id}: amount ${tx.amount} → ${updatePayload.amount ?? tx.amount}, site: ${entryData.siteName}`);
          }
        }
      }

      const { data: refreshedTxs, error: refreshError } = await supabase
        .from('wallet_transactions')
        .select('amount, type, currency')
        .eq('user_id', userId);

      if (refreshError) throw refreshError;

      let newTotalEarned = 0;
      let newTotalWithdrawn = 0;
      const balancesByCurrency: Record<string, number> = {};

      for (const tx of (refreshedTxs || [])) {
        const amt = Number(tx.amount || 0);
        const txCurrency = tx.currency || currency;
        if (!balancesByCurrency[txCurrency]) balancesByCurrency[txCurrency] = 0;
        
        if (['earning', 'site_visit_fee', 'adjustment', 'bonus'].includes(tx.type)) {
          newTotalEarned += amt;
          balancesByCurrency[txCurrency] += amt;
        } else if (['withdrawal', 'penalty', 'debit'].includes(tx.type)) {
          newTotalWithdrawn += Math.abs(amt);
          balancesByCurrency[txCurrency] -= Math.abs(amt);
        }
      }

      const newBalances: Record<string, number> = {};
      for (const [cur, bal] of Object.entries(balancesByCurrency)) {
        newBalances[cur] = bal;
      }

      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          total_earned: newTotalEarned,
          total_withdrawn: newTotalWithdrawn,
          balances: newBalances,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wallet.id);

      if (updateError) throw updateError;

      const primaryCurrency = Object.keys(balancesByCurrency)[0] || currency;
      const primaryBalance = balancesByCurrency[primaryCurrency] || 0;
      
      let toastDesc = '';
      if (txUpdated > 0) {
        toastDesc = `${txUpdated} transactions corrected. `;
      } else if (earningTxs.length > 0) {
        toastDesc = 'No corrections needed (amounts match site entries). ';
      }
      toastDesc += `Earned: ${newTotalEarned.toLocaleString()} ${primaryCurrency}, Balance: ${primaryBalance.toLocaleString()} ${primaryCurrency}`;
      
      toast({ 
        title: 'Wallet Recalculated', 
        description: toastDesc
      });
      await loadWalletData();
    } catch (error: any) {
      toast({ title: 'Recalculation Failed', description: error?.message || 'Could not recalculate wallet', variant: 'destructive' });
    } finally {
      setRecalculating(false);
    }
  };

  const handleAdjustBalance = async () => {
    if (!wallet || !adjAmount) return;

    const amount = parseFloat(adjAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid positive amount',
        variant: 'destructive',
      });
      return;
    }

    try {
      const adjustmentAmount = adjDirection === 'credit' ? amount : -amount;
      const currentBalance = wallet.balances[currency] || 0;
      const newBalance = currentBalance + adjustmentAmount;

      if (newBalance < 0) {
        toast({
          title: 'Invalid Operation',
          description: 'Debit amount would result in negative balance',
          variant: 'destructive',
        });
        return;
      }

      const { error: txnError } = await supabase
        .from('wallet_transactions')
        .insert({
          wallet_id: wallet.id,
          user_id: userId,
          type: 'adjustment',
          amount: adjustmentAmount,
          currency: currency,
          description: adjReason || `Manual ${adjDirection} adjustment`,
          balance_before: currentBalance,
          balance_after: newBalance,
        });

      if (txnError) throw txnError;

      const updatedBalances = { ...wallet.balances, [currency]: newBalance };
      const { error: walletError } = await supabase
        .from('wallets')
        .update({ 
          balances: updatedBalances,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wallet.id);

      if (walletError) throw walletError;

      toast({
        title: 'Success',
        description: `Balance ${adjDirection}ed successfully`,
      });

      setAdjOpen(false);
      setAdjAmount('');
      setAdjReason('');
      await loadWalletData();
    } catch (error: any) {
      console.error('Failed to adjust balance:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to adjust balance',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
        <span className="ml-3 text-slate-400">Loading wallet data…</span>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-slate-400 text-lg">No wallet found for this user</div>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  // Actual spendable balance = earned - withdrawn - cash advances already paid
  const currentBalance = totals.earned - totals.withdrawn - totalAdvancesPaid;
  const initials = (userProfile?.full_name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  /* ── shared panel style ── */
  const panel = 'rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden';
  const panelHeader = 'px-5 py-4 bg-slate-900/60 border-b border-slate-700 flex items-center gap-2';
  const thClass = 'text-slate-500 text-[11px] font-semibold uppercase tracking-wider py-3';

  return (
    <div className="space-y-5 p-3 md:p-6" data-testid="page-admin-wallet-detail">

      {/* ── Back ── */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors font-medium"
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Wallets
      </button>

      {/* ══════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════ */}
      <div className="rounded-2xl overflow-hidden border border-teal-800/60 shadow-xl shadow-black/30">
        {/* top accent strip */}
        <div className="h-1.5 bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400" />

        <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* avatar + info */}
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-teal-900/50 select-none">
                {initials}
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white leading-tight tracking-wide">
                  {userProfile?.full_name || 'Unknown User'}
                </h1>
                <p className="text-sm text-teal-400 mt-0.5">{userProfile?.email}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {userProfile?.role && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                      {userProfile.role}
                    </span>
                  )}
                  {userProfile?.hub_id && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-700 text-slate-300 border border-slate-600">
                      Hub: {userProfile.hub_id}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Adjust Balance dialog */}
            <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
              <DialogTrigger asChild>
                <Button
                  data-testid="button-adjust-balance"
                  className="bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-xl px-6 h-11 shadow-lg shadow-teal-900/40 shrink-0"
                >
                  Adjust Balance
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-900 border-slate-700">
                <DialogHeader>
                  <DialogTitle className="text-slate-100">Manual Balance Adjustment</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300">Direction</label>
                    <div className="flex gap-2">
                      <Button variant={adjDirection === 'credit' ? 'default' : 'outline'} onClick={() => setAdjDirection('credit')} data-testid="button-direction-credit" className="flex-1">Credit (Add)</Button>
                      <Button variant={adjDirection === 'debit' ? 'default' : 'outline'} onClick={() => setAdjDirection('debit')} data-testid="button-direction-debit" className="flex-1">Debit (Subtract)</Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300">Amount ({currency})</label>
                    <Input type="number" min="0" step="0.01" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="Enter amount" data-testid="input-adjustment-amount" className="bg-slate-800 border-slate-600 text-slate-100" />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300">Reason (optional)</label>
                    <Input value={adjReason} onChange={e => setAdjReason(e.target.value)} placeholder="Reason for adjustment" data-testid="input-adjustment-reason" className="bg-slate-800 border-slate-600 text-slate-100" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAdjustBalance} disabled={!adjAmount} data-testid="button-submit-adjustment" className="bg-teal-600 hover:bg-teal-500">Submit Adjustment</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Admin Direct Payment dialog */}
            <Dialog open={payOpen} onOpenChange={open => { setPayOpen(open); if (!open) { setPayAmount(''); setPayNote(''); setPayFile(null); } }}>
              <DialogTrigger asChild>
                <Button
                  data-testid="button-admin-direct-pay"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-6 h-11 shadow-lg shadow-emerald-900/40 shrink-0 flex items-center gap-2"
                >
                  <CreditCard className="h-4 w-4" /> Pay Enumerator
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-slate-100 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-emerald-400" />
                    Admin Direct Payment
                  </DialogTitle>
                  <p className="text-xs text-slate-400 mt-1">
                    Pay the enumerator directly. This deducts from their wallet balance immediately — no withdrawal request needed.
                  </p>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300">Amount ({currency})</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      placeholder="Enter amount"
                      data-testid="input-direct-pay-amount"
                      className="bg-slate-800 border-slate-600 text-slate-100"
                    />
                    <p className="text-[11px] text-slate-500">
                      Available balance: <span className="text-teal-400 font-semibold">{currencyFmt((wallet?.balances?.[currency] ?? 0) as number, currency)}</span>
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300">Payment Note</label>
                    <Input
                      value={payNote}
                      onChange={e => setPayNote(e.target.value)}
                      placeholder="e.g. Enumerator fee for MMP January cycle"
                      data-testid="input-direct-pay-note"
                      className="bg-slate-800 border-slate-600 text-slate-100"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                      <Upload className="h-3.5 w-3.5 text-slate-400" />
                      Payment Receipt <span className="text-slate-500 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={e => setPayFile(e.target.files?.[0] || null)}
                        className="hidden"
                        id="pay-receipt-upload"
                        data-testid="input-direct-pay-receipt"
                      />
                      <label
                        htmlFor="pay-receipt-upload"
                        className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-slate-600 bg-slate-800 hover:bg-slate-700/60 px-4 py-3 text-sm text-slate-400 transition-colors"
                      >
                        <Upload className="h-4 w-4 shrink-0" />
                        {payFile ? (
                          <span className="text-emerald-400 truncate">{payFile.name}</span>
                        ) : (
                          <span>Click to upload receipt (image or PDF)</span>
                        )}
                      </label>
                      {payFile && (
                        <button
                          onClick={() => setPayFile(null)}
                          className="absolute right-2 top-2 text-slate-500 hover:text-red-400 text-xs"
                        >
                          ✕ remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleAdminDirectPayment}
                    disabled={paying || !payAmount || parseFloat(payAmount) <= 0}
                    data-testid="button-submit-direct-pay"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white w-full"
                  >
                    {paying ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                    ) : (
                      <><CreditCard className="h-4 w-4 mr-2" />Confirm Payment</>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          4 METRIC CARDS
      ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Balance — shows net after advances deducted */}
        <div className="rounded-2xl bg-teal-700 border border-teal-600 p-5 shadow-lg shadow-teal-900/30">
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200/80 mb-3">Net Balance ({currency})</p>
          <p className="text-xl md:text-2xl font-extrabold text-white leading-none break-all" data-testid="text-balance">
            {currencyFmt(currentBalance, currency)}
          </p>
          {totalAdvancesPaid > 0 && (
            <p className="text-[10px] text-teal-300/70 mt-2 leading-tight">
              Advances deducted: {currencyFmt(totalAdvancesPaid, currency)}
            </p>
          )}
        </div>
        {/* Total Earned */}
        <div className="rounded-2xl bg-emerald-700 border border-emerald-600 p-5 shadow-lg shadow-emerald-900/30">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-200/80 mb-3">Total Earned</p>
          <p className="text-xl md:text-2xl font-extrabold text-white leading-none break-all" data-testid="text-total-earned">
            {currencyFmt(totals.earned, currency)}
          </p>
        </div>
        {/* Transport Advances Paid — only if any exist */}
        {totalAdvancesPaid > 0 ? (
          <div className="rounded-2xl bg-orange-700 border border-orange-600 p-5 shadow-lg shadow-orange-900/30">
            <p className="text-[11px] font-bold uppercase tracking-widest text-orange-200/80 mb-3">Transport Advances</p>
            <p className="text-xl md:text-2xl font-extrabold text-white leading-none break-all" data-testid="text-advances-paid">
              − {currencyFmt(totalAdvancesPaid, currency)}
            </p>
            <p className="text-[10px] text-orange-300/70 mt-2">{downPayments.length} advance{downPayments.length !== 1 ? 's' : ''} paid in cash</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-violet-700 border border-violet-600 p-5 shadow-lg shadow-violet-900/30">
            <p className="text-[11px] font-bold uppercase tracking-widest text-violet-200/80 mb-3">Total Withdrawn</p>
            <p className="text-xl md:text-2xl font-extrabold text-white leading-none break-all" data-testid="text-total-withdrawn">
              {currencyFmt(totals.withdrawn, currency)}
            </p>
          </div>
        )}
        {/* Transaction Count */}
        <div className="rounded-2xl bg-slate-700 border border-slate-600 p-5 shadow-lg shadow-slate-900/30">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-300/80 mb-3">Transactions</p>
          <p className="text-xl md:text-2xl font-extrabold text-amber-400 leading-none" data-testid="text-transaction-count">
            {transactions.length}
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          MMP FILTER + RATE OVERRIDES (display-only)
      ══════════════════════════════════════════════ */}
      {mmps.length > 0 && (
        <div className="rounded-2xl bg-slate-800 border border-slate-700 px-5 py-4 flex flex-wrap items-start gap-4">
          {/* MMP filter */}
          <div className="flex flex-col gap-1.5 min-w-[240px]">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Filter by MMP
              {selectedMmp !== 'all' && (
                <button
                  onClick={() => setSelectedMmp('all')}
                  className="ml-2 text-[10px] text-teal-400 hover:text-teal-300 normal-case font-normal tracking-normal underline"
                >
                  clear
                </button>
              )}
            </p>
            <Select value={selectedMmp} onValueChange={setSelectedMmp} data-testid="select-mmp-filter">
              <SelectTrigger className="bg-slate-900 border-slate-600 text-slate-100 rounded-xl h-9 text-sm">
                <SelectValue>
                  {selectedMmp === 'all'
                    ? `All MMPs — ${siteVisits.length} site${siteVisits.length !== 1 ? 's' : ''}`
                    : (() => {
                        const m = mmps.find(x => x.id === selectedMmp);
                        const count = siteVisits.filter(s => s.mmp_file_id === selectedMmp).length;
                        return m ? `${m.name} (${count} sites)` : selectedMmp;
                      })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All MMPs — {siteVisits.length} site{siteVisits.length !== 1 ? 's' : ''}</SelectItem>
                {mmps.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({siteVisits.filter(s => s.mmp_file_id === m.id).length} sites)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedMmp !== 'all' && (
              <p className="text-[10px] text-teal-400 mt-0.5">
                Showing {filteredSiteVisits.length} of {siteVisits.length} sites
              </p>
            )}
          </div>

          {/* Per-MMP fee rate override editor */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Fee Rate Adjustments
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRateEditor(v => !v)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700 rounded-xl h-9 text-xs"
              data-testid="button-toggle-rate-editor"
            >
              {showRateEditor ? 'Hide Rate Editor' : 'Edit Fee Rates Per MMP'}
            </Button>
          </div>

          {/* Rate editor panel */}
          {showRateEditor && (
            <div className="w-full border-t border-slate-700 pt-4 mt-1">
              <p className="text-xs text-slate-400 mb-3">
                Enumerator rates are <span className="text-teal-400 font-semibold">pre-filled</span> from each MMP's site entries. Change any rate to see the before/after per site, then click <strong className="text-teal-400">Apply Rates & Recalculate Wallet</strong> to update all sites and the wallet balance. Transport fees are not touched here — they are fixed or already paid.
              </p>
              <div className="space-y-3">
                {mmps.map(m => {
                  const ov = mmpRateOverrides[m.id] || { enumRate: 0, transRate: 0 };
                  const mmpSites = siteVisits.filter(s => s.mmp_file_id === m.id);
                  const newRate = ov.enumRate;
                  return (
                    <div key={m.id} className="rounded-xl bg-slate-900/60 border border-slate-700 overflow-hidden">
                      {/* MMP header row */}
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/60 bg-slate-900/40">
                        <p className="text-xs font-semibold text-slate-100 flex-1 truncate">{m.name}</p>
                        <span className="text-[10px] text-slate-500">{mmpSites.length} site{mmpSites.length !== 1 ? 's' : ''}</span>
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-slate-400 uppercase tracking-wider whitespace-nowrap">Enum Rate ({currency})</label>
                          <Input
                            type="number"
                            min={0}
                            step={100}
                            placeholder="Enter rate"
                            value={ov.enumRate || ''}
                            onChange={e => setMmpRateOverrides(prev => ({
                              ...prev,
                              [m.id]: { ...ov, enumRate: parseFloat(e.target.value) || 0 }
                            }))}
                            className="h-8 w-36 text-xs bg-slate-800 border-slate-600 text-slate-100"
                            data-testid={`input-enum-rate-${m.id}`}
                          />
                          {ov.enumRate > 0 && (
                            <button
                              onClick={() => setMmpRateOverrides(prev => ({ ...prev, [m.id]: { ...ov, enumRate: 0 } }))}
                              className="text-[10px] text-slate-500 hover:text-red-400 px-1"
                            >✕</button>
                          )}
                        </div>
                      </div>
                      {/* Sites before/after table */}
                      {mmpSites.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-700/40">
                                <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Site</th>
                                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                                <th className="text-right px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Current Fee</th>
                                {newRate > 0 && <th className="text-right px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-teal-500">New Fee</th>}
                                {newRate > 0 && <th className="text-right px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-amber-500">Diff</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {mmpSites.map(site => {
                                const current = Number(site.enumerator_fee || 0);
                                const diff = newRate > 0 ? newRate - current : null;
                                const sl = site.status?.toLowerCase();
                                const isDone = sl === 'completed' || sl === 'verified';
                                return (
                                  <tr key={site.id} className="border-b border-slate-700/20 hover:bg-slate-800/40">
                                    <td className="px-4 py-2 text-slate-200 font-medium truncate max-w-[180px]">{site.site_name}</td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold ${isDone ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                                        {site.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-right text-slate-300 font-mono">
                                      {current > 0 ? currencyFmt(current, currency) : <span className="text-slate-600">—</span>}
                                    </td>
                                    {newRate > 0 && (
                                      <td className="px-4 py-2 text-right text-teal-300 font-mono font-semibold">
                                        {currencyFmt(newRate, currency)}
                                      </td>
                                    )}
                                    {newRate > 0 && (
                                      <td className="px-4 py-2 text-right font-mono font-semibold">
                                        {diff === null || diff === 0
                                          ? <span className="text-slate-600">—</span>
                                          : diff > 0
                                            ? <span className="text-emerald-400">+{currencyFmt(diff, currency)}</span>
                                            : <span className="text-red-400">{currencyFmt(diff, currency)}</span>}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                              {/* Total row */}
                              <tr className="bg-slate-900/50 border-t border-slate-600">
                                <td colSpan={2} className="px-4 py-2 text-slate-400 font-semibold text-right text-[10px] uppercase tracking-wider">Total</td>
                                <td className="px-4 py-2 text-right text-slate-200 font-bold font-mono">
                                  {currencyFmt(mmpSites.reduce((s, x) => s + Number(x.enumerator_fee || 0), 0), currency)}
                                </td>
                                {newRate > 0 && (
                                  <td className="px-4 py-2 text-right text-teal-300 font-bold font-mono">
                                    {currencyFmt(newRate * mmpSites.length, currency)}
                                  </td>
                                )}
                                {newRate > 0 && (
                                  <td className="px-4 py-2 text-right font-bold font-mono">
                                    {(() => {
                                      const totalDiff = (newRate * mmpSites.length) - mmpSites.reduce((s, x) => s + Number(x.enumerator_fee || 0), 0);
                                      return totalDiff === 0
                                        ? <span className="text-slate-600">—</span>
                                        : totalDiff > 0
                                          ? <span className="text-emerald-400">+{currencyFmt(totalDiff, currency)}</span>
                                          : <span className="text-red-400">{currencyFmt(totalDiff, currency)}</span>;
                                    })()}
                                  </td>
                                )}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Apply button */}
              {Object.values(mmpRateOverrides).some(ov => ov.enumRate > 0) && (
                <div className="mt-4 flex items-center gap-3">
                  <Button
                    size="sm"
                    onClick={applyRatesAndRecalculate}
                    disabled={applyingRates || recalculating}
                    className="bg-teal-600 hover:bg-teal-700 text-white h-9 text-xs rounded-xl"
                    data-testid="button-apply-rates-recalculate"
                  >
                    {applyingRates ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Applying…</>
                    ) : (
                      'Apply Rates & Recalculate Wallet'
                    )}
                  </Button>
                  <p className="text-[11px] text-slate-500">
                    Saves the rates above to this enumerator's site entries and updates the wallet balance.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TABS
      ══════════════════════════════════════════════ */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto bg-slate-800 border border-slate-700 rounded-xl p-1 h-auto gap-1 no-scrollbar">
          {[
            { value: 'overview',      label: 'Overview' },
            { value: 'sites',         label: 'Sites' },
            { value: 'transport',     label: 'Transport' },
            { value: 'earnings',      label: 'Earnings' },
            { value: 'transactions',  label: 'Transactions' },
            { value: 'statement',     label: 'Statement' },
            { value: 'costs',         label: `Costs${(siteVisitCosts.length + operationalCosts.length) > 0 ? ` (${siteVisitCosts.length + operationalCosts.length})` : ''}` },
          ].map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              data-testid={`tab-${value}`}
              className="flex-shrink-0 rounded-lg py-2 px-3 text-xs md:text-sm font-medium text-slate-400 data-[state=active]:bg-teal-600 data-[state=active]:text-white data-[state=active]:shadow transition-all"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="space-y-4">

          {/* ── Unpaid Fees Alert ── */}
          {unpaidFees.length > 0 && (() => {
            const totalUnpaidTransport = unpaidFees.reduce((s, r) => s + r.unpaidTransport, 0);
            const totalUnpaidEnum      = unpaidFees.reduce((s, r) => s + r.unpaidEnum,      0);
            const grandTotal           = totalUnpaidTransport + totalUnpaidEnum;
            return (
              <div className={panel}>
                <div className={`${panelHeader} justify-between`}>
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <h3 className="font-semibold text-slate-100 text-sm">Unpaid Fees — {unpaidFees.length} site{unpaidFees.length !== 1 ? 's' : ''}</h3>
                  </div>
                  <span className="text-base font-extrabold text-amber-300">{currencyFmt(grandTotal, currency)}</span>
                </div>
                <div className="px-5 py-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Unpaid Transport</p>
                    <p className="text-xl font-extrabold text-orange-300">{currencyFmt(totalUnpaidTransport, currency)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{unpaidFees.filter(r => r.unpaidTransport > 0).length} site{unpaidFees.filter(r => r.unpaidTransport > 0).length !== 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Unpaid Enum Fee</p>
                    <p className="text-xl font-extrabold text-amber-300">{currencyFmt(totalUnpaidEnum, currency)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{unpaidFees.filter(r => r.unpaidEnum > 0).length} completed site{unpaidFees.filter(r => r.unpaidEnum > 0).length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="px-5 pb-4 border-t border-slate-700">
                  <p className="text-xs text-slate-500 italic pt-3">See the Transport tab for the full breakdown per site.</p>
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={panel}>
              <div className={panelHeader}>
                <Briefcase className="w-4 h-4 text-teal-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Work Statistics</h3>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { label: 'Total Sites',      value: workStats.totalSites,      color: 'text-white' },
                  { label: 'Completed',        value: workStats.completedSites,  color: 'text-emerald-400' },
                  { label: 'Pending',          value: workStats.pendingSites,    color: 'text-amber-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center py-1">
                    <span className="text-sm text-slate-400">{label}</span>
                    <span className={`text-2xl font-bold ${color}`}>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-3 border-t border-slate-700">
                  <span className="text-sm text-slate-400">Completion Rate</span>
                  <span className="text-2xl font-bold text-teal-400">{workStats.completionRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className={panel}>
              <div className={panelHeader}>
                <TrendingUp className="w-4 h-4 text-teal-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Financial Summary</h3>
              </div>
              <div className="p-5 space-y-1">
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-slate-400">Total Earned</span>
                  <span className="text-base font-bold text-emerald-400">{currencyFmt(totals.earned, currency)}</span>
                </div>
                {totals.withdrawn > 0 && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-slate-400">Formal Withdrawals</span>
                    <span className="text-base font-bold text-violet-400">− {currencyFmt(totals.withdrawn, currency)}</span>
                  </div>
                )}
                {totalAdvancesPaid > 0 && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-slate-400 flex items-center gap-1">
                      Transport Advances
                      <span className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-medium">cash paid</span>
                    </span>
                    <span className="text-base font-bold text-orange-400">− {currencyFmt(totalAdvancesPaid, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 border-t border-slate-700">
                  <span className="text-sm font-semibold text-slate-200">Net Balance</span>
                  <span className="text-xl font-extrabold text-teal-300">{currencyFmt(currentBalance, currency)}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── SITES ── */}
        <TabsContent value="sites" className="space-y-4">
          {/* Status counter chips */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Credited',        count: siteVisits.filter(s => s.isCompleted && s.payment).length,  icon: CheckCircle, bg: 'bg-emerald-600', iconBg: 'bg-emerald-500/30' },
              { label: 'Pending Payment', count: siteVisits.filter(s => s.isCompleted && !s.payment).length, icon: Clock,        bg: 'bg-amber-600',   iconBg: 'bg-amber-500/30' },
              { label: 'In Progress',     count: siteVisits.filter(s => !s.isCompleted).length,              icon: MapPin,       bg: 'bg-slate-600',   iconBg: 'bg-slate-500/30' },
            ].map(({ label, count, icon: Icon, bg, iconBg }) => (
              <div key={label} className={`rounded-xl ${bg} p-4 flex items-center justify-between shadow`}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{label}</p>
                  <p className="text-3xl font-extrabold text-white mt-1 leading-none">{count}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            ))}
          </div>

          {/* Sites table */}
          <div className={panel}>
            <div className={panelHeader}>
              <MapPin className="w-4 h-4 text-teal-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Sites Visited</h3>
              <span className="ml-auto text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{siteVisits.length}</span>
              <span className="text-xs text-slate-600 hidden sm:inline">Only completed sites receive payment</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-900/40 hover:bg-slate-900/40">
                    <TableHead className={thClass}>Site Name</TableHead>
                    <TableHead className={thClass}>Status</TableHead>
                    <TableHead className={thClass}>Assigned</TableHead>
                    <TableHead className={thClass}>Completed</TableHead>
                    <TableHead className={`${thClass} text-right`}>Enum Fee</TableHead>
                    <TableHead className={`${thClass} text-right`}>Transport</TableHead>
                    <TableHead className={`${thClass} text-right`}>Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSiteVisits.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-slate-500 h-24">No sites visited yet</TableCell></TableRow>
                  ) : filteredSiteVisits.map((site) => {
                    const enumFee   = Number(site.enumerator_fee || 0);
                    const transFee  = Number(site.transport_fee  || 0);
                    const totalFee  = enumFee + transFee > 0 ? enumFee + transFee : Number(site.cost || 0);
                    const sl        = site.status?.toLowerCase();
                    const isDone    = sl === 'completed' || sl === 'verified';
                    return (
                      <TableRow key={site.id} className="border-slate-700/40 hover:bg-slate-700/30 transition-colors">
                        <TableCell className="text-slate-100 font-medium">{site.site_name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
                            isDone        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : sl === 'assigned' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-slate-600/60 text-slate-300 border border-slate-600'
                          }`}>
                            {site.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">{site.accepted_at ? new Date(site.accepted_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-slate-400 text-sm">{site.visit_completed_at ? new Date(site.visit_completed_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {enumFee > 0 ? <span className="text-teal-300">{currencyFmt(enumFee, currency)}</span> : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {transFee > 0 ? <span className="text-teal-300">{currencyFmt(transFee, currency)}</span> : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {site.payment ? (
                            <span className="text-emerald-400 font-semibold flex items-center justify-end gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />{currencyFmt(site.payment.amount, currency)}
                            </span>
                          ) : site.isCompleted ? (
                            <span className="text-amber-400 font-medium flex items-center justify-end gap-1">
                              <Clock className="w-3.5 h-3.5" />{totalFee > 0 ? currencyFmt(totalFee, currency) : 'Pending'}
                            </span>
                          ) : (
                            <span className="text-slate-600 flex items-center justify-end gap-1 text-xs">
                              <XCircle className="w-3.5 h-3.5" />Not eligible
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredSiteVisits.length > 0 && (
                    <TableRow className="border-t-2 border-slate-600 bg-slate-900/50">
                      <TableCell colSpan={4} className="text-slate-400 text-right text-sm font-semibold py-3">Totals</TableCell>
                      <TableCell className="text-right text-teal-300 font-bold">{currencyFmt(filteredSiteVisits.reduce((s, v) => s + Number(v.enumerator_fee || 0), 0), currency)}</TableCell>
                      <TableCell className="text-right text-teal-300 font-bold">{currencyFmt(filteredSiteVisits.reduce((s, v) => s + Number(v.transport_fee || 0), 0), currency)}</TableCell>
                      <TableCell className="text-right text-emerald-400 font-bold">{currencyFmt(filteredSiteVisits.reduce((s, v) => { const ef = Number(v.enumerator_fee || 0); const tf = Number(v.transport_fee || 0); return s + (ef + tf > 0 ? ef + tf : Number(v.cost || 0)); }, 0), currency)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── TRANSPORT ── */}
        <TabsContent value="transport" className="space-y-4">
          {/* Active rate override banner */}
          {Object.keys(mmpRateOverrides).length > 0 && selectedMmp !== 'all' && mmpRateOverrides[selectedMmp] && (
            <div className="rounded-xl bg-amber-900/30 border border-amber-700/50 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-300">
              <span className="font-bold">Display override active for this MMP:</span>
              <span>Enum rate = {currencyFmt(mmpRateOverrides[selectedMmp].enumRate || 0, currency)}</span>
              <span>·</span>
              <span>Transport rate = {currencyFmt(mmpRateOverrides[selectedMmp].transRate || 0, currency)}</span>
              <span className="ml-1 text-amber-500">(wallet unchanged)</span>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(() => {
              const td = filteredTransportBreakdown;
              const totalTransFee  = td.reduce((s, r) => s + r.displayTransFee, 0);
              const totalAdvPaid   = td.reduce((s, r) => s + r.advPaid,  0);
              const totalRemaining = td.filter(r => r.remaining > 0).reduce((s, r) => s + r.remaining, 0);
              const sitesWithAdv   = td.filter(r => r.advPaid > 0).length;
              return [
                { label: 'Total Transport Fees',    value: currencyFmt(totalTransFee,  currency), color: 'bg-teal-700 border-teal-600',     note: `${td.length} site${td.length !== 1 ? 's' : ''}` },
                { label: 'Advances Paid in Cash',   value: currencyFmt(totalAdvPaid,   currency), color: 'bg-orange-700 border-orange-600',  note: `${sitesWithAdv} advance${sitesWithAdv !== 1 ? 's' : ''}` },
                { label: 'Balance Still Owed',      value: currencyFmt(totalRemaining, currency), color: 'bg-amber-700 border-amber-600',    note: 'unpaid portion' },
                { label: 'Net After Advances',      value: currencyFmt(totalTransFee - totalAdvPaid, currency), color: 'bg-slate-700 border-slate-600', note: 'fee − advances' },
              ].map(({ label, value, color, note }) => (
                <div key={label} className={`rounded-2xl border p-5 shadow-lg ${color}`}>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/60 mb-2">{label}</p>
                  <p className="text-lg md:text-xl font-extrabold text-white leading-none break-all">{value}</p>
                  <p className="text-[10px] text-white/50 mt-2">{note}</p>
                </div>
              ));
            })()}
          </div>

          {/* Per-site transport breakdown table */}
          <div className={panel}>
            <div className={panelHeader}>
              <Truck className="w-4 h-4 text-orange-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Transport Payments by Site</h3>
              <span className="ml-auto text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{filteredTransportBreakdown.length} sites</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-900/40 hover:bg-slate-900/40">
                    <TableHead className={thClass}>Site</TableHead>
                    <TableHead className={thClass}>Status</TableHead>
                    <TableHead className={thClass}>Completed</TableHead>
                    <TableHead className={`${thClass} text-right`}>Enum Fee</TableHead>
                    <TableHead className={`${thClass} text-right`}>Transport Fee</TableHead>
                    <TableHead className={`${thClass} text-right`}>Advance Paid / Receipts</TableHead>
                    <TableHead className={`${thClass} text-right`}>Still Owed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransportBreakdown.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-slate-500 h-24">No site visits found</TableCell></TableRow>
                  ) : filteredTransportBreakdown.map(site => {
                    const advStatusColors: Record<string, string> = {
                      fully_paid:    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                      partially_paid:'bg-amber-500/20 text-amber-300 border-amber-500/30',
                      approved:      'bg-blue-500/20 text-blue-300 border-blue-500/30',
                    };
                    // Find the matching down-payment record for receipt links
                    const dp = downPayments.find(d => d.mmp_site_entry_id === site.id);
                    const receipts = dp ? parseReceipts(dp) : [];
                    return (
                      <TableRow key={site.id} className="border-slate-700/40 hover:bg-slate-700/20 transition-colors">
                        <TableCell className="text-slate-100 font-medium text-sm">{site.site_name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold border ${
                            site.isCompleted ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-slate-600/40 text-slate-300 border-slate-600'
                          }`}>{site.status}</span>
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">{site.visit_completed_at ? new Date(site.visit_completed_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-right text-sm text-teal-300 font-medium">
                          {site.displayEnumFee > 0 ? (
                            <span className={site.displayEnumFee !== site.enumFee ? 'text-amber-300' : ''}>
                              {currencyFmt(site.displayEnumFee, currency)}
                            </span>
                          ) : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm text-teal-300 font-medium">
                          {site.displayTransFee > 0 ? (
                            <span className={site.displayTransFee !== site.transFee ? 'text-amber-300' : ''}>
                              {currencyFmt(site.displayTransFee, currency)}
                            </span>
                          ) : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {site.advPaid > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-bold text-orange-400">− {currencyFmt(site.advPaid, currency)}</span>
                              {site.advStatus && (
                                <span className={`inline-flex px-1.5 py-0 rounded text-[10px] font-semibold border ${advStatusColors[site.advStatus] || 'bg-slate-600/40 text-slate-300 border-slate-600'}`}>
                                  {site.advStatus.replace(/_/g, ' ')}
                                </span>
                              )}
                              {/* Receipt links from down payment */}
                              {receipts.length > 0 && (
                                <div className="flex flex-col items-end gap-0.5 mt-1">
                                  {receipts.map((url, i) => (
                                    <a
                                      key={i}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 underline"
                                      data-testid={`link-receipt-${site.id}-${i}`}
                                    >
                                      <FileText className="w-3 h-3" />
                                      Receipt {receipts.length > 1 ? i + 1 : ''}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : <span className="text-slate-600">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {site.remaining > 0.01 ? (
                            <span className="font-semibold text-amber-400">{currencyFmt(site.remaining, currency)}</span>
                          ) : site.transFee > 0 ? (
                            <span className="text-emerald-400 font-semibold">Settled</span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredTransportBreakdown.length > 0 && (
                    <TableRow className="border-t-2 border-slate-600 bg-slate-900/50">
                      <TableCell colSpan={3} className="text-slate-400 text-right text-sm font-semibold py-3">Totals</TableCell>
                      <TableCell className="text-right font-bold text-teal-300">{currencyFmt(filteredTransportBreakdown.reduce((s, r) => s + r.displayEnumFee, 0), currency)}</TableCell>
                      <TableCell className="text-right font-bold text-teal-300">{currencyFmt(filteredTransportBreakdown.reduce((s, r) => s + r.displayTransFee, 0), currency)}</TableCell>
                      <TableCell className="text-right font-bold text-orange-400">− {currencyFmt(filteredTransportBreakdown.reduce((s, r) => s + r.advPaid, 0), currency)}</TableCell>
                      <TableCell className="text-right font-bold text-amber-400">{currencyFmt(filteredTransportBreakdown.filter(r => r.remaining > 0).reduce((s, r) => s + r.remaining, 0), currency)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* ── Unpaid Fees table ── */}
          {unpaidFees.length > 0 ? (
            <div className={panel}>
              <div className={`${panelHeader} justify-between`}>
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-amber-400" />
                  <h3 className="font-semibold text-slate-100 text-sm">Unpaid Fees</h3>
                  <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium">{unpaidFees.length} site{unpaidFees.length !== 1 ? 's' : ''}</span>
                </div>
                <span className="text-sm font-extrabold text-amber-300">
                  Total: {currencyFmt(unpaidFees.reduce((s, r) => s + r.totalUnpaid, 0), currency)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-red-800/40 bg-slate-900/40 hover:bg-slate-900/40">
                      <TableHead className={thClass}>Site</TableHead>
                      <TableHead className={thClass}>Status</TableHead>
                      <TableHead className={thClass}>Completed</TableHead>
                      <TableHead className={`${thClass} text-right`}>Unpaid Transport</TableHead>
                      <TableHead className={`${thClass} text-right`}>Unpaid Enum Fee</TableHead>
                      <TableHead className={`${thClass} text-right`}>Total Owed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unpaidFees.map(site => (
                      <TableRow key={site.id} className="border-slate-700/40 hover:bg-slate-700/30 transition-colors">
                        <TableCell className="text-slate-100 font-medium text-sm">{site.site_name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold border ${
                            site.isCompleted
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}>{site.status}</span>
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">
                          {site.visit_completed_at ? new Date(site.visit_completed_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {site.unpaidTransport > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-bold text-orange-400">{currencyFmt(site.unpaidTransport, currency)}</span>
                              {site.advPaid > 0 && (
                                <span className="text-[10px] text-slate-500">partial — {currencyFmt(site.advPaid, currency)} already paid</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-emerald-400 text-xs font-semibold flex items-center justify-end gap-1">
                              <CheckCircle className="w-3 h-3" /> Settled
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {site.unpaidEnum > 0 ? (
                            <span className="font-bold text-amber-400">{currencyFmt(site.unpaidEnum, currency)}</span>
                          ) : (
                            <span className="text-emerald-400 text-xs font-semibold flex items-center justify-end gap-1">
                              <CheckCircle className="w-3 h-3" /> Paid
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-extrabold text-red-400 text-sm">
                          {currencyFmt(site.totalUnpaid, currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-slate-600 bg-slate-900/40">
                      <TableCell colSpan={3} className="text-slate-300 text-right font-bold text-sm py-4">Total Unpaid</TableCell>
                      <TableCell className="text-right font-bold text-orange-400">
                        {currencyFmt(unpaidFees.reduce((s, r) => s + r.unpaidTransport, 0), currency)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-amber-400">
                        {currencyFmt(unpaidFees.reduce((s, r) => s + r.unpaidEnum, 0), currency)}
                      </TableCell>
                      <TableCell className="text-right font-extrabold text-amber-300 text-base">
                        {currencyFmt(unpaidFees.reduce((s, r) => s + r.totalUnpaid, 0), currency)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-700/40 bg-emerald-900/10 px-6 py-8 text-center">
              <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-emerald-300 font-semibold">All fees settled</p>
              <p className="text-slate-500 text-sm mt-1">No unpaid transport or enumerator fees</p>
            </div>
          )}
        </TabsContent>

        {/* ── EARNINGS ── */}
        <TabsContent value="earnings" className="space-y-4">
          {/* Source cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Site Visit Payments', value: earningsBreakdown.siteVisitEarnings, icon: MapPin,     bg: 'bg-teal-700 border-teal-600',     iconBg: 'bg-teal-600/60' },
              { label: 'Bonuses',             value: earningsBreakdown.bonuses,            icon: TrendingUp, bg: 'bg-amber-700 border-amber-600',   iconBg: 'bg-amber-600/60' },
              { label: 'Manual Adjustments',  value: earningsBreakdown.adjustments,        icon: Calendar,   bg: 'bg-slate-700 border-slate-600',   iconBg: 'bg-slate-600/60' },
              { label: 'Withdrawals',         value: earningsBreakdown.withdrawals,         icon: DollarSign, bg: 'bg-violet-700 border-violet-600', iconBg: 'bg-violet-600/60' },
            ].map(({ label, value, icon: Icon, bg, iconBg }) => (
              <div key={label} className={`rounded-2xl border p-5 shadow flex items-start justify-between gap-2 ${bg}`}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-2">{label}</p>
                  <p className="text-xl font-extrabold text-white truncate">{currencyFmt(value, currency)}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            ))}
          </div>

          {/* Totals panel */}
          <div className={panel}>
            <div className={panelHeader}>
              <DollarSign className="w-4 h-4 text-teal-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Summary</h3>
            </div>
            <div className="p-5 space-y-1">
              <div className="flex justify-between items-center py-3 border-b border-slate-700">
                <span className="text-sm text-slate-400">Total Earned</span>
                <span className="text-lg font-bold text-emerald-400">{currencyFmt(earningsBreakdown.siteVisitEarnings + earningsBreakdown.bonuses + earningsBreakdown.adjustments, currency)}</span>
              </div>
              {earningsBreakdown.withdrawals > 0 && (
                <div className="flex justify-between items-center py-3 border-b border-slate-700">
                  <span className="text-sm text-slate-400">Formal Withdrawals</span>
                  <span className="text-lg font-bold text-violet-400">− {currencyFmt(earningsBreakdown.withdrawals, currency)}</span>
                </div>
              )}
              {totalAdvancesPaid > 0 && (
                <div className="flex justify-between items-center py-3 border-b border-slate-700">
                  <span className="text-sm text-slate-400 flex items-center gap-2">
                    Transport Advances Paid in Cash
                    <span className="text-[10px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded font-medium">{downPayments.length} record{downPayments.length !== 1 ? 's' : ''}</span>
                  </span>
                  <span className="text-lg font-bold text-orange-400">− {currencyFmt(totalAdvancesPaid, currency)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-4">
                <span className="text-base font-semibold text-slate-200">Net Balance</span>
                <span className="text-2xl font-extrabold text-teal-300">
                  {currencyFmt(currentBalance, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Down Payment Records detail — only shown if any exist */}
          {downPayments.length > 0 && (
            <div className={panel}>
              <div className={panelHeader}>
                <DollarSign className="w-4 h-4 text-orange-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Transport Advances Detail</h3>
                <span className="ml-auto text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full font-medium">{downPayments.length} advance{downPayments.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 bg-slate-900/40 hover:bg-slate-900/40">
                      <TableHead className={thClass}>Site</TableHead>
                      <TableHead className={thClass}>Status</TableHead>
                      <TableHead className={`${thClass} text-right`}>Requested</TableHead>
                      <TableHead className={`${thClass} text-right`}>Paid in Cash</TableHead>
                      <TableHead className={`${thClass} text-right`}>Remaining</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {downPayments.map(dp => {
                      const paid = parseFloat(dp.total_paid_amount || 0);
                      const remaining = parseFloat(dp.remaining_amount || 0);
                      const requested = parseFloat(dp.requested_amount || 0);
                      const statusColors: Record<string, string> = {
                        fully_paid: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                        partially_paid: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
                        approved: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                      };
                      const statusClass = statusColors[dp.status] || 'bg-slate-600/40 text-slate-300 border-slate-600';
                      return (
                        <TableRow key={dp.id} className="border-slate-700/40 hover:bg-slate-700/20">
                          <TableCell className="text-slate-200 font-medium text-sm">{dp.site_name || '—'}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold border ${statusClass}`}>
                              {dp.status?.replace('_', ' ')}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-slate-400 text-sm">{currencyFmt(requested, currency)}</TableCell>
                          <TableCell className="text-right font-bold text-orange-400 text-sm">
                            {paid > 0 ? `− ${currencyFmt(paid, currency)}` : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {remaining > 0
                              ? <span className="text-amber-400 font-medium">{currencyFmt(remaining, currency)}</span>
                              : <span className="text-slate-600">—</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2 border-slate-600 bg-slate-900/50">
                      <TableCell colSpan={3} className="text-slate-400 text-right font-semibold text-sm py-3">Total Deducted from Balance</TableCell>
                      <TableCell className="text-right font-extrabold text-orange-400">− {currencyFmt(totalAdvancesPaid, currency)}</TableCell>
                      <TableCell className="text-right font-bold text-amber-400">
                        {currencyFmt(downPayments.reduce((s, dp) => s + parseFloat(dp.remaining_amount || 0), 0), currency)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── TRANSACTIONS ── */}
        <TabsContent value="transactions">
          <div className={panel}>
            <div className={`${panelHeader} justify-between`}>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-teal-400" />
                <h3 className="font-semibold text-slate-100 text-sm">Transaction History</h3>
                <span className="text-xs bg-slate-700 text-slate-400 px-2.5 py-0.5 rounded-full font-medium">{transactions.length}</span>
              </div>
              <Button variant="outline" size="sm" onClick={recalculateWalletTotals} disabled={recalculating || transactions.length === 0} className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs h-8" data-testid="button-recalculate-wallet">
                {recalculating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5 mr-1.5" />}
                Sync & Recalculate
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-900/40 hover:bg-slate-900/40">
                    <TableHead className={thClass}>Date</TableHead>
                    <TableHead className={thClass}>Type</TableHead>
                    <TableHead className={thClass}>Description</TableHead>
                    <TableHead className={`${thClass} text-right`}>Amount</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-slate-500 h-24">No transactions yet</TableCell></TableRow>
                  ) : transactions.map((txn) => (
                    <TableRow key={txn.id} data-testid={`row-transaction-${txn.id}`} className="border-slate-700/40 hover:bg-slate-700/30 transition-colors">
                      <TableCell className="text-slate-400 text-sm whitespace-nowrap">{new Date(txn.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-700 text-slate-200 capitalize">
                          {txn.type.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm max-w-[220px]">
                        {txn.description ? (() => {
                          const receiptMatch = txn.description.match(/\|\s*receipt:\s*(https?:\/\/\S+)/);
                          const displayDesc = receiptMatch
                            ? txn.description.replace(/\|\s*receipt:\s*https?:\/\/\S+/, '').trim()
                            : txn.description;
                          return (
                            <span className="flex items-center gap-1.5 flex-wrap">
                              <span className="truncate max-w-[160px]">{displayDesc}</span>
                              {receiptMatch && (
                                <a
                                  href={receiptMatch[1]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-[10px] text-teal-400 hover:text-teal-300 border border-teal-700/50 rounded px-1.5 py-0.5 shrink-0"
                                  data-testid={`link-pay-receipt-${txn.id}`}
                                >
                                  <FileText className="h-2.5 w-2.5" />Receipt
                                </a>
                              )}
                            </span>
                          );
                        })() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingTxId === txn.id ? (
                          <Input type="number" value={editTxAmount} onChange={e => setEditTxAmount(e.target.value)} className="w-32 ml-auto text-right bg-slate-700 border-slate-500 text-slate-100" data-testid={`input-tx-amount-${txn.id}`} autoFocus onKeyDown={e => { if (e.key === 'Enter') saveEditTx(txn.id); if (e.key === 'Escape') cancelEditTx(); }} />
                        ) : (
                          <span className={`font-bold text-sm ${txn.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {txn.amount >= 0 ? '+' : ''}{currencyFmt(txn.amount, txn.currency)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {editingTxId === txn.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button size="icon" variant="ghost" onClick={() => saveEditTx(txn.id)} disabled={savingTx} className="h-7 w-7 text-emerald-400" data-testid={`button-save-tx-${txn.id}`}>{savingTx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}</Button>
                            <Button size="icon" variant="ghost" onClick={cancelEditTx} className="h-7 w-7 text-red-400" data-testid={`button-cancel-tx-${txn.id}`}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" onClick={() => startEditTx(txn)} className="h-7 w-7 text-slate-500 hover:text-slate-200" data-testid={`button-edit-tx-${txn.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {transactions.length > 0 && (() => {
                    const earnTypes    = ['earning', 'site_visit_fee', 'bonus', 'adjustment'];
                    const advanceTypes = ['down_payment', 'advance_deduction'];
                    const totalEarned  = transactions.filter(t => earnTypes.includes(t.type)).reduce((s, t) => s + t.amount, 0);
                    const totalAdv     = transactions.filter(t => advanceTypes.includes(t.type)).reduce((s, t) => s + Math.abs(t.amount), 0);
                    const totalDed     = transactions.filter(t => t.amount < 0 && !advanceTypes.includes(t.type)).reduce((s, t) => s + t.amount, 0);
                    return (
                      <>
                        <TableRow className="border-t-2 border-slate-600 bg-emerald-900/20">
                          <TableCell colSpan={3} className="text-slate-400 text-right text-sm font-semibold py-3">Total Earned</TableCell>
                          <TableCell className="text-right text-emerald-400 font-bold">+{currencyFmt(totalEarned, currency)}</TableCell>
                          <TableCell />
                        </TableRow>
                        {totalAdv > 0 && (
                          <TableRow className="bg-amber-900/20">
                            <TableCell colSpan={3} className="text-slate-400 text-right text-sm font-semibold">Advances Paid</TableCell>
                            <TableCell className="text-right text-amber-400 font-bold">− {currencyFmt(totalAdv, currency)}</TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                        {totalDed < 0 && (
                          <TableRow className="bg-red-900/20">
                            <TableCell colSpan={3} className="text-slate-400 text-right text-sm font-semibold">Total Deducted</TableCell>
                            <TableCell className="text-right text-red-400 font-bold">{currencyFmt(totalDed, currency)}</TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                        <TableRow className="bg-teal-900/20">
                          <TableCell colSpan={3} className="text-slate-200 text-right font-bold py-3">Net Balance</TableCell>
                          <TableCell className="text-right text-teal-300 font-extrabold text-base">{currencyFmt(totalEarned - totalAdv + totalDed, currency)}</TableCell>
                          <TableCell />
                        </TableRow>
                      </>
                    );
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── STATEMENT ── */}
        <TabsContent value="statement" className="space-y-4">
          {/* Statement header card */}
          <div className="rounded-2xl overflow-hidden border border-teal-800/60 shadow-xl shadow-black/30">
            <div className="h-1 bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400" />
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-5 h-5 text-teal-400" />
                  <h2 className="text-lg font-bold text-white">Wallet Statement</h2>
                </div>
                <p className="text-sm text-slate-400">{userProfile?.full_name || 'Unknown User'} · {userProfile?.email}</p>
                <p className="text-xs text-slate-500 mt-1">Generated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · Currency: {currency}</p>
              </div>
              <div className="flex flex-col items-start md:items-end gap-2">
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Closing Balance</p>
                  <p className={`text-2xl font-extrabold ${currentBalance >= 0 ? 'text-teal-300' : 'text-red-400'}`}>
                    {currencyFmt(currentBalance, currency)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs h-8 gap-1.5"
                  data-testid="button-print-statement"
                >
                  <Printer className="h-3.5 w-3.5" /> Print Statement
                </Button>
              </div>
            </div>
          </div>

          {/* Opening balance row + ledger */}
          <div className={panel}>
            <div className={panelHeader}>
              <History className="w-4 h-4 text-teal-400" />
              <h3 className="font-semibold text-slate-100 text-sm">Full Ledger</h3>
              <span className="ml-auto text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{statementLedger.length} entries</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-900/40 hover:bg-slate-900/40">
                    <TableHead className={thClass}>#</TableHead>
                    <TableHead className={thClass}>Date</TableHead>
                    <TableHead className={thClass}>Description</TableHead>
                    <TableHead className={thClass}>Category</TableHead>
                    <TableHead className={`${thClass} text-right`}>Credit (+)</TableHead>
                    <TableHead className={`${thClass} text-right`}>Debit (−)</TableHead>
                    <TableHead className={`${thClass} text-right`}>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening balance row */}
                  <TableRow className="border-slate-700/40 bg-slate-900/30">
                    <TableCell className="text-slate-600 text-xs">—</TableCell>
                    <TableCell className="text-slate-500 text-xs">Opening Balance</TableCell>
                    <TableCell colSpan={3} className="text-slate-500 text-xs italic">Start of account</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-bold text-slate-400">{currencyFmt(0, currency)}</TableCell>
                  </TableRow>

                  {statementLedger.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-slate-500 h-24">No entries yet</TableCell>
                    </TableRow>
                  ) : statementLedger.map((row, idx) => (
                    <TableRow
                      key={row.id}
                      className={`border-slate-700/40 hover:bg-slate-700/20 transition-colors ${row.source === 'advance' ? 'bg-orange-900/10' : ''}`}
                      data-testid={`row-statement-${row.id}`}
                    >
                      <TableCell className="text-slate-600 text-xs tabular-nums">{idx + 1}</TableCell>
                      <TableCell className="text-slate-400 text-xs whitespace-nowrap tabular-nums">
                        {new Date(row.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-slate-200 text-sm max-w-[200px] md:max-w-xs">
                        <div className="truncate" title={row.description}>{row.description}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold capitalize whitespace-nowrap ${
                          row.source === 'advance'
                            ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                            : row.credit > 0
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                        }`}>
                          {row.category}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {row.credit > 0
                          ? <span className="font-bold text-emerald-400">+ {currencyFmt(row.credit, currency)}</span>
                          : <span className="text-slate-700">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {row.debit > 0
                          ? <span className={`font-bold ${row.source === 'advance' ? 'text-orange-400' : 'text-red-400'}`}>− {currencyFmt(row.debit, currency)}</span>
                          : <span className="text-slate-700">—</span>}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-bold text-sm ${row.balance >= 0 ? 'text-white' : 'text-red-400'}`}>
                        {currencyFmt(row.balance, currency)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Closing totals */}
                  {statementLedger.length > 0 && (() => {
                    const totalCredit = statementLedger.reduce((s, r) => s + r.credit, 0);
                    const totalDebit  = statementLedger.reduce((s, r) => s + r.debit,  0);
                    return (
                      <>
                        <TableRow className="border-t-2 border-slate-600 bg-slate-900/60">
                          <TableCell colSpan={4} className="text-slate-300 text-right font-bold text-sm py-4">Statement Totals</TableCell>
                          <TableCell className="text-right font-extrabold text-emerald-400 tabular-nums">+ {currencyFmt(totalCredit, currency)}</TableCell>
                          <TableCell className="text-right font-extrabold text-red-400 tabular-nums">− {currencyFmt(totalDebit, currency)}</TableCell>
                          <TableCell className={`text-right font-extrabold tabular-nums text-base ${currentBalance >= 0 ? 'text-teal-300' : 'text-red-400'}`}>
                            {currencyFmt(currentBalance, currency)}
                          </TableCell>
                        </TableRow>
                        {totalAdvancesPaid > 0 && (
                          <TableRow className="bg-orange-900/10 border-orange-800/30">
                            <TableCell colSpan={4} className="text-orange-300/70 text-right text-xs py-2">
                              Incl. transport advances deducted from balance
                            </TableCell>
                            <TableCell />
                            <TableCell className="text-right text-xs font-semibold text-orange-400 tabular-nums">
                              − {currencyFmt(totalAdvancesPaid, currency)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                      </>
                    );
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ── COSTS ── */}
        <TabsContent value="costs" className="space-y-4">
          {/* Summary cards */}
          {(() => {
            const allCosts = [
              ...filteredSiteVisitCosts.map(c => ({
                id: c.id,
                type: 'site_visit' as const,
                date: c.submitted_at,
                amountCents: c.total_cost_cents || 0,
                currency: c.currency || currency,
                status: c.status,
                description: c.submission_notes || 'Site visit expenses',
                mmpFileId: c.mmp_file_id,
                receipts: parseReceipts(c),
              })),
              ...filteredOperationalCosts.map(c => ({
                id: c.id,
                type: 'operational' as const,
                date: c.submitted_at,
                amountCents: c.amount_cents || 0,
                currency: c.currency || currency,
                status: c.status,
                description: c.description || c.expense_category || 'Operational expense',
                mmpFileId: c.mmp_file_id,
                receipts: parseReceipts(c),
              })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const totalCents = allCosts.reduce((s, c) => s + c.amountCents, 0);
            const paidCosts = allCosts.filter(c => c.status === 'approved' || c.status === 'paid');
            const pendingCosts = allCosts.filter(c => c.status === 'pending' || c.status === 'submitted' || c.status === 'pending_review');
            const withReceipts = allCosts.filter(c => c.receipts.length > 0);

            const statusColors: Record<string, string> = {
              approved:       'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
              paid:           'bg-teal-500/20 text-teal-300 border-teal-500/30',
              pending:        'bg-amber-500/20 text-amber-300 border-amber-500/30',
              submitted:      'bg-blue-500/20 text-blue-300 border-blue-500/30',
              pending_review: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
              rejected:       'bg-red-500/20 text-red-300 border-red-500/30',
            };

            return (
              <>
                {/* KPI cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Submitted',    value: currencyFmt(totalCents / 100, currency),                                  note: `${allCosts.length} submission${allCosts.length !== 1 ? 's' : ''}`,     color: 'bg-teal-700 border-teal-600' },
                    { label: 'Approved / Paid',    value: currencyFmt(paidCosts.reduce((s, c) => s + c.amountCents, 0) / 100, currency), note: `${paidCosts.length} approved`,                                        color: 'bg-emerald-700 border-emerald-600' },
                    { label: 'Pending Review',     value: currencyFmt(pendingCosts.reduce((s, c) => s + c.amountCents, 0) / 100, currency), note: `${pendingCosts.length} awaiting`,                                    color: 'bg-amber-700 border-amber-600' },
                    { label: 'With Receipts',      value: `${withReceipts.length}`,                                                note: `of ${allCosts.length} total`,                                             color: 'bg-slate-700 border-slate-600' },
                  ].map(({ label, value, note, color }) => (
                    <div key={label} className={`rounded-2xl border p-5 shadow-lg ${color}`}>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-white/60 mb-2">{label}</p>
                      <p className="text-lg md:text-xl font-extrabold text-white leading-none break-all">{value}</p>
                      <p className="text-[10px] text-white/50 mt-2">{note}</p>
                    </div>
                  ))}
                </div>

                {/* Cost submissions table */}
                <div className={panel}>
                  <div className={panelHeader}>
                    <FileText className="w-4 h-4 text-teal-400" />
                    <h3 className="font-semibold text-slate-100 text-sm">Cost Submissions</h3>
                    <span className="ml-auto text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{allCosts.length} records</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-700 bg-slate-900/40 hover:bg-slate-900/40">
                          <TableHead className={thClass}>Date</TableHead>
                          <TableHead className={thClass}>Type</TableHead>
                          <TableHead className={thClass}>Description</TableHead>
                          <TableHead className={thClass}>Status</TableHead>
                          <TableHead className={`${thClass} text-right`}>Amount</TableHead>
                          <TableHead className={thClass}>Receipts</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allCosts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-slate-500 h-24">
                              No cost submissions found{selectedMmp !== 'all' ? ' for this MMP' : ''}
                            </TableCell>
                          </TableRow>
                        ) : allCosts.map(c => (
                          <TableRow key={c.id} className="border-slate-700/40 hover:bg-slate-700/20 transition-colors">
                            <TableCell className="text-slate-400 text-sm whitespace-nowrap">
                              {c.date ? new Date(c.date).toLocaleDateString() : '—'}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold border ${
                                c.type === 'site_visit'
                                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                  : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                              }`}>
                                {c.type === 'site_visit' ? 'Site Visit' : 'Operational'}
                              </span>
                            </TableCell>
                            <TableCell className="text-slate-200 text-sm max-w-[200px] truncate" title={c.description}>
                              {c.description}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold border ${statusColors[c.status] || 'bg-slate-600/40 text-slate-300 border-slate-600'}`}>
                                {c.status?.replace(/_/g, ' ')}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold text-teal-300 text-sm">
                              {currencyFmt(c.amountCents / 100, currency)}
                            </TableCell>
                            <TableCell>
                              {c.receipts.length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                  {c.receipts.map((url, i) => (
                                    <a
                                      key={i}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 underline whitespace-nowrap"
                                      data-testid={`link-cost-receipt-${c.id}-${i}`}
                                    >
                                      <FileText className="w-3 h-3" />
                                      {c.receipts.length > 1 ? `Receipt ${i + 1}` : 'Receipt'}
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {allCosts.length > 0 && (
                          <TableRow className="border-t-2 border-slate-600 bg-slate-900/50">
                            <TableCell colSpan={4} className="text-slate-400 text-right font-semibold text-sm py-3">Total</TableCell>
                            <TableCell className="text-right font-extrabold text-teal-300 tabular-nums">
                              {currencyFmt(allCosts.reduce((s, c) => s + c.amountCents, 0) / 100, currency)}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            );
          })()}
        </TabsContent>

      </Tabs>
    </div>
  );
};

export default AdminWalletDetail;
