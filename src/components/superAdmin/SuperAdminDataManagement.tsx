import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useUser } from '@/context/user/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Shield, 
  RotateCcw, 
  Trash2, 
  Wallet, 
  MapPin, 
  AlertTriangle, 
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';

interface SiteVisitData {
  id: string;
  site_name: string;
  site_code: string;
  status: string;
  accepted_by: string;
  accepted_by_name?: string;
  supervisor_id?: string;
  supervisor_name?: string;
  visit_completed_at?: string;
  enumerator_fee?: number;
}

interface WalletData {
  id: string;
  user_id: string;
  user_name?: string;
  balances: Record<string, number>;
  total_earned: number;
  total_withdrawn: number;
  transaction_count?: number;
}

interface TransactionData {
  id: string;
  wallet_id: string;
  user_id: string;
  user_name?: string;
  type: string;
  amount: number;
  currency: string;
  description?: string;
  site_visit_id?: string;
  created_at: string;
}

export function SuperAdminDataManagement() {
  const { currentUser, users } = useUser();
  const { isSuperAdmin, resetSiteVisit, deleteWalletTransaction, resetWallet } = useSuperAdmin();

  const [activeTab, setActiveTab] = useState('site-visits');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [siteVisits, setSiteVisits] = useState<SiteVisitData[]>([]);
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [transactions, setTransactions] = useState<TransactionData[]>([]);

  const [selectedSiteVisit, setSelectedSiteVisit] = useState<SiteVisitData | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionData | null>(null);

  const [showResetSiteVisitDialog, setShowResetSiteVisitDialog] = useState(false);
  const [showResetWalletDialog, setShowResetWalletDialog] = useState(false);
  const [showDeleteTransactionDialog, setShowDeleteTransactionDialog] = useState(false);

  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadSiteVisits = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, site_code, status, accepted_by, supervisor_id, visit_completed_at, enumerator_fee')
        .in('status', ['completed', 'verified'])
        .order('visit_completed_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const enriched = (data || []).map(sv => {
        const collector = users.find(u => u.id === sv.accepted_by);
        const supervisor = users.find(u => u.id === sv.supervisor_id);
        return {
          ...sv,
          accepted_by_name: collector?.name || 'Unknown',
          supervisor_name: supervisor?.name || 'N/A',
        };
      });

      setSiteVisits(enriched);
    } catch (error) {
      console.error('Failed to load site visits:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWallets = async () => {
    setLoading(true);
    try {
      const { data: walletsData, error: walletsError } = await supabase
        .from('wallets')
        .select('*')
        .order('updated_at', { ascending: false });

      if (walletsError) throw walletsError;

      const { data: txnCounts } = await supabase
        .from('wallet_transactions')
        .select('wallet_id');

      const countMap: Record<string, number> = {};
      (txnCounts || []).forEach((t: any) => {
        countMap[t.wallet_id] = (countMap[t.wallet_id] || 0) + 1;
      });

      const enriched = (walletsData || []).map(w => {
        const user = users.find(u => u.id === w.user_id);
        return {
          id: w.id,
          user_id: w.user_id,
          user_name: user?.name || 'Unknown',
          balances: w.balances || {},
          total_earned: parseFloat(w.total_earned) || 0,
          total_withdrawn: parseFloat(w.total_withdrawn) || 0,
          transaction_count: countMap[w.id] || 0,
        };
      });

      setWallets(enriched);
    } catch (error) {
      console.error('Failed to load wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const enriched = (data || []).map(t => {
        const user = users.find(u => u.id === t.user_id);
        return {
          id: t.id,
          wallet_id: t.wallet_id,
          user_id: t.user_id,
          user_name: user?.name || 'Unknown',
          type: t.type,
          amount: parseFloat(t.amount),
          currency: t.currency,
          description: t.description,
          site_visit_id: t.site_visit_id,
          created_at: t.created_at,
        };
      });

      setTransactions(enriched);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      if (activeTab === 'site-visits') loadSiteVisits();
      else if (activeTab === 'wallets') loadWallets();
      else if (activeTab === 'transactions') loadTransactions();
    }
  }, [activeTab, isSuperAdmin, users]);

  const handleResetSiteVisit = async () => {
    if (!selectedSiteVisit || !currentUser || !reason.trim()) return;

    setProcessing(true);
    const success = await resetSiteVisit({
      siteVisitId: selectedSiteVisit.id,
      reason: reason.trim(),
      deletedBy: currentUser.id,
      deletedByName: currentUser.name || currentUser.email || 'Super Admin',
      deletedByRole: currentUser.role || 'superadmin',
    });

    setProcessing(false);
    if (success) {
      setShowResetSiteVisitDialog(false);
      setSelectedSiteVisit(null);
      setReason('');
      loadSiteVisits();
    }
  };

  const handleResetWallet = async () => {
    if (!selectedWallet || !currentUser || !reason.trim()) return;

    setProcessing(true);
    const success = await resetWallet({
      userId: selectedWallet.user_id,
      walletId: selectedWallet.id,
      reason: reason.trim(),
      deletedBy: currentUser.id,
      deletedByName: currentUser.name || currentUser.email || 'Super Admin',
      deletedByRole: currentUser.role || 'superadmin',
    });

    setProcessing(false);
    if (success) {
      setShowResetWalletDialog(false);
      setSelectedWallet(null);
      setReason('');
      loadWallets();
    }
  };

  const handleDeleteTransaction = async () => {
    if (!selectedTransaction || !currentUser || !reason.trim()) return;

    setProcessing(true);
    const success = await deleteWalletTransaction({
      transactionId: selectedTransaction.id,
      reason: reason.trim(),
      deletedBy: currentUser.id,
      deletedByName: currentUser.name || currentUser.email || 'Super Admin',
      deletedByRole: currentUser.role || 'superadmin',
    });

    setProcessing(false);
    if (success) {
      setShowDeleteTransactionDialog(false);
      setSelectedTransaction(null);
      setReason('');
      loadTransactions();
    }
  };

  const openResetSiteVisitDialog = (sv: SiteVisitData) => {
    setSelectedSiteVisit(sv);
    setReason('');
    setShowResetSiteVisitDialog(true);
  };

  const openResetWalletDialog = (w: WalletData) => {
    setSelectedWallet(w);
    setReason('');
    setShowResetWalletDialog(true);
  };

  const openDeleteTransactionDialog = (t: TransactionData) => {
    setSelectedTransaction(t);
    setReason('');
    setShowDeleteTransactionDialog(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" /> Completed</Badge>;
      case 'verified':
        return <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" /> Verified</Badge>;
      case 'assigned':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Assigned</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredSiteVisits = siteVisits.filter(sv => 
    sv.site_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sv.site_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sv.accepted_by_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredWallets = wallets.filter(w =>
    w.user_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTransactions = transactions.filter(t =>
    t.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.type?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <Shield className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-2xl font-bold">Access Denied</h2>
            <p className="text-muted-foreground">
              Only super-admins can access this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-super-admin-data-management">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Data Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Reset site visits, manage wallet transactions, and clean data
          </p>
        </div>
      </div>

      <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/20">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">
                Destructive Actions
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                All actions on this page are logged and audited. Deleted data can be reviewed in the deletion audit log. 
                Affected users will receive notifications about changes to their data.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            if (activeTab === 'site-visits') loadSiteVisits();
            else if (activeTab === 'wallets') loadWallets();
            else if (activeTab === 'transactions') loadTransactions();
          }}
          disabled={loading}
          data-testid="button-refresh"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="site-visits" data-testid="tab-site-visits">
            <MapPin className="h-4 w-4 mr-2" />
            Site Visits
          </TabsTrigger>
          <TabsTrigger value="wallets" data-testid="tab-wallets">
            <Wallet className="h-4 w-4 mr-2" />
            Wallets
          </TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-transactions">
            <Trash2 className="h-4 w-4 mr-2" />
            Transactions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="site-visits" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Completed Site Visits ({filteredSiteVisits.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading...</p>
              ) : filteredSiteVisits.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No completed site visits found</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site</TableHead>
                        <TableHead>Data Collector</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Completed At</TableHead>
                        <TableHead>Fee</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSiteVisits.map((sv) => (
                        <TableRow key={sv.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{sv.site_name}</p>
                              <p className="text-sm text-muted-foreground">{sv.site_code}</p>
                            </div>
                          </TableCell>
                          <TableCell>{sv.accepted_by_name}</TableCell>
                          <TableCell>{getStatusBadge(sv.status)}</TableCell>
                          <TableCell>
                            {sv.visit_completed_at 
                              ? format(new Date(sv.visit_completed_at), 'MMM d, yyyy HH:mm')
                              : 'N/A'}
                          </TableCell>
                          <TableCell>{sv.enumerator_fee ? `${sv.enumerator_fee} SDG` : 'N/A'}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openResetSiteVisitDialog(sv)}
                              data-testid={`button-reset-site-visit-${sv.id}`}
                            >
                              <RotateCcw className="h-4 w-4 mr-1" />
                              Reset
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallets" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                User Wallets ({filteredWallets.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading...</p>
              ) : filteredWallets.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No wallets found</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Total Earned</TableHead>
                        <TableHead>Transactions</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWallets.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell className="font-medium">{w.user_name}</TableCell>
                          <TableCell>
                            {Object.entries(w.balances).map(([currency, amount]) => (
                              <div key={currency}>{amount} {currency}</div>
                            ))}
                            {Object.keys(w.balances).length === 0 && <span className="text-muted-foreground">0</span>}
                          </TableCell>
                          <TableCell>{w.total_earned} SDG</TableCell>
                          <TableCell>{w.transaction_count}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openResetWalletDialog(w)}
                              disabled={(w.transaction_count || 0) === 0}
                              data-testid={`button-reset-wallet-${w.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Reset Wallet
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Wallet Transactions ({filteredTransactions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading...</p>
              ) : filteredTransactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No transactions found</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.user_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{t.type}</Badge>
                          </TableCell>
                          <TableCell className={t.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {t.amount >= 0 ? '+' : ''}{t.amount} {t.currency}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{t.description || 'N/A'}</TableCell>
                          <TableCell>{format(new Date(t.created_at), 'MMM d, yyyy HH:mm')}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => openDeleteTransactionDialog(t)}
                              data-testid={`button-delete-transaction-${t.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showResetSiteVisitDialog} onOpenChange={setShowResetSiteVisitDialog}>
        <DialogContent data-testid="dialog-reset-site-visit">
          <DialogHeader>
            <DialogTitle>Reset Site Visit to Incomplete</DialogTitle>
            <DialogDescription>
              This will reset the site visit status and remove any associated wallet transactions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-md">
              <p className="text-sm font-medium">
                Site: {selectedSiteVisit?.site_name} ({selectedSiteVisit?.site_code})
              </p>
              <p className="text-sm text-muted-foreground">
                Data Collector: {selectedSiteVisit?.accepted_by_name}
              </p>
            </div>

            <div>
              <Label htmlFor="reset-reason">Reason for Reset *</Label>
              <Textarea
                id="reset-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this site visit is being reset..."
                rows={3}
                data-testid="textarea-reset-reason"
              />
            </div>

            <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
              <li>Site visit status will be changed to "assigned"</li>
              <li>Associated wallet transaction will be deleted</li>
              <li>Wallet balance will be adjusted accordingly</li>
              <li>Data collector and supervisor will be notified</li>
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetSiteVisitDialog(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetSiteVisit}
              disabled={processing || !reason.trim()}
              data-testid="button-confirm-reset"
            >
              {processing ? 'Resetting...' : 'Reset Site Visit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetWalletDialog} onOpenChange={setShowResetWalletDialog}>
        <DialogContent data-testid="dialog-reset-wallet">
          <DialogHeader>
            <DialogTitle>Reset Wallet</DialogTitle>
            <DialogDescription>
              This will delete all transactions and reset the wallet balance to zero.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-md">
              <p className="text-sm font-medium">
                User: {selectedWallet?.user_name}
              </p>
              <p className="text-sm text-muted-foreground">
                Transactions: {selectedWallet?.transaction_count} | Earned: {selectedWallet?.total_earned} SDG
              </p>
            </div>

            <div>
              <Label htmlFor="wallet-reset-reason">Reason for Reset *</Label>
              <Textarea
                id="wallet-reset-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this wallet is being reset..."
                rows={3}
                data-testid="textarea-wallet-reset-reason"
              />
            </div>

            <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
              <li>All wallet transactions will be deleted</li>
              <li>Wallet balance will be reset to zero</li>
              <li>User will be notified of this change</li>
              <li>All deletions will be logged for audit</li>
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetWalletDialog(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetWallet}
              disabled={processing || !reason.trim()}
              data-testid="button-confirm-wallet-reset"
            >
              {processing ? 'Resetting...' : 'Reset Wallet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteTransactionDialog} onOpenChange={setShowDeleteTransactionDialog}>
        <DialogContent data-testid="dialog-delete-transaction">
          <DialogHeader>
            <DialogTitle>Delete Transaction</DialogTitle>
            <DialogDescription>
              This will delete the transaction and adjust the wallet balance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-md">
              <p className="text-sm font-medium">
                User: {selectedTransaction?.user_name}
              </p>
              <p className="text-sm text-muted-foreground">
                Amount: {selectedTransaction?.amount} {selectedTransaction?.currency} | Type: {selectedTransaction?.type}
              </p>
            </div>

            <div>
              <Label htmlFor="transaction-delete-reason">Reason for Deletion *</Label>
              <Textarea
                id="transaction-delete-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this transaction is being deleted..."
                rows={3}
                data-testid="textarea-transaction-delete-reason"
              />
            </div>

            <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
              <li>Transaction will be permanently deleted</li>
              <li>Wallet balance will be adjusted</li>
              <li>User will be notified of this change</li>
              <li>Deletion will be logged for audit</li>
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteTransactionDialog(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTransaction}
              disabled={processing || !reason.trim()}
              data-testid="button-confirm-transaction-delete"
            >
              {processing ? 'Deleting...' : 'Delete Transaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
