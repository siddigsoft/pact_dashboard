import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  User,
  ArrowRightLeft
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuthorization } from '@/hooks/use-authorization';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  TransportAdvanceRecovery,
  RecoveryMethod,
  RecoveryStatus,
  RECOVERY_METHOD_LABELS
} from '@/types/recall';
import { processRecovery as executeProcessRecovery } from '@/utils/recallUtils';

interface RecoveryDashboardProps {
  mmpId?: string;
}

interface RecoveryRecord {
  id: string;
  mmp_id: string;
  mmp_name?: string;
  site_entry_id: string;
  site_name?: string;
  data_collector_id: string;
  data_collector_name?: string;
  original_amount: number;
  recovered_amount: number;
  pending_amount: number;
  currency: string;
  recovery_method: RecoveryMethod;
  status: RecoveryStatus;
  notes?: string;
  processed_by?: string;
  processed_at?: string;
  created_at: string;
}

const STATUS_CONFIG: Record<RecoveryStatus, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: ArrowRightLeft },
  recovered: { label: 'Recovered', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: CheckCircle2 },
  written_off: { label: 'Written Off', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: XCircle }
};

const METHOD_LABELS: Record<RecoveryMethod, string> = {
  deduct_future: 'Deduct Future',
  cash_return: 'Cash Return',
  write_off: 'Write Off'
};

export function RecoveryDashboard({ mmpId }: RecoveryDashboardProps) {
  const { currentUser: profile } = useAuthorization();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [recoveries, setRecoveries] = useState<RecoveryRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [selectedRecovery, setSelectedRecovery] = useState<RecoveryRecord | null>(null);
  const [processAmount, setProcessAmount] = useState('');
  const [processNotes, setProcessNotes] = useState('');
  const [processMethod, setProcessMethod] = useState<RecoveryMethod>('deduct_future');
  const [isProcessing, setIsProcessing] = useState(false);

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin' || profile?.role === 'ict';
  const isFinance = profile?.role === 'finance';
  const canProcess = isSuperAdmin || isAdmin || isFinance;

  useEffect(() => {
    loadRecoveries();
  }, [mmpId, activeTab]);

  const loadRecoveries = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('mmp_site_entries')
        .select(`
          id,
          mmp_id,
          site_name,
          assigned_to,
          claimed_by,
          transport_advance_amount,
          transport_advance_paid,
          transport_advance_recovered,
          recall_status,
          recall_recovery_method,
          recall_recovery_status,
          recalled_at,
          recalled_by
        `)
        .eq('transport_advance_paid', true);

      if (mmpId) {
        query = query.eq('mmp_id', mmpId);
      }

      const { data: siteEntries, error } = await query;
      if (error) throw error;

      const recalledEntries = (siteEntries || []).filter(
        (entry: any) => entry.recall_status === 'recalled' && entry.transport_advance_amount > 0
      );

      const recoveryRecords: RecoveryRecord[] = [];

      for (const entry of recalledEntries) {
        const originalAmount = entry.transport_advance_amount || 0;
        const recoveredAmount = entry.transport_advance_recovered || 0;
        const status: RecoveryStatus = entry.recall_recovery_status || 
          (recoveredAmount >= originalAmount ? 'recovered' : 'pending');

        recoveryRecords.push({
          id: entry.id,
          mmp_id: entry.mmp_id,
          mmp_name: undefined,
          site_entry_id: entry.id,
          site_name: entry.site_name,
          data_collector_id: entry.claimed_by || entry.assigned_to,
          data_collector_name: undefined,
          original_amount: originalAmount,
          recovered_amount: recoveredAmount,
          pending_amount: originalAmount - recoveredAmount,
          currency: 'SDG',
          recovery_method: entry.recall_recovery_method || 'deduct_future',
          status,
          notes: undefined,
          processed_by: undefined,
          processed_at: undefined,
          created_at: entry.recalled_at || new Date().toISOString()
        });
      }

      const filtered = activeTab === 'pending'
        ? recoveryRecords.filter(r => r.status === 'pending' || r.status === 'in_progress')
        : recoveryRecords.filter(r => r.status === 'recovered' || r.status === 'written_off' || r.status === 'cancelled');

      setRecoveries(filtered);
    } catch (error) {
      console.error('Error loading recoveries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessClick = (recovery: RecoveryRecord) => {
    setSelectedRecovery(recovery);
    setProcessAmount(recovery.pending_amount.toString());
    setProcessMethod(recovery.recovery_method);
    setProcessNotes('');
    setProcessDialogOpen(true);
  };

  const handleProcessSubmit = async () => {
    if (!selectedRecovery) return;

    const amount = parseFloat(processAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid amount',
        variant: 'destructive'
      });
      return;
    }

    if (amount > selectedRecovery.pending_amount) {
      toast({
        title: 'Amount Too High',
        description: 'Recovery amount cannot exceed pending amount',
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);
    try {
      const result = await executeProcessRecovery(
        selectedRecovery.site_entry_id,
        profile?.fullName || 'Unknown',
        processMethod,
        amount,
        processNotes || undefined
      );

      if (!result.success) {
        throw new Error(result.error || 'Processing failed');
      }

      toast({
        title: 'Recovery Processed',
        description: `Successfully processed ${amount} ${selectedRecovery.currency} recovery`,
      });

      setProcessDialogOpen(false);
      loadRecoveries();
    } catch (error: any) {
      toast({
        title: 'Processing Failed',
        description: error.message || 'An error occurred',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const totalPending = recoveries
    .filter(r => r.status === 'pending' || r.status === 'in_progress')
    .reduce((sum, r) => sum + r.pending_amount, 0);

  const totalRecovered = recoveries
    .filter(r => r.status === 'recovered')
    .reduce((sum, r) => sum + r.recovered_amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Recovery Dashboard
        </CardTitle>
        <CardDescription>
          Manage transportation advance recoveries from recalled sites
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-700 dark:text-yellow-300">Pending Recovery</span>
              </div>
              <p className="text-2xl font-bold text-yellow-800 dark:text-yellow-200 mt-1">
                {totalPending.toLocaleString()} SDG
              </p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-300">Total Recovered</span>
              </div>
              <p className="text-2xl font-bold text-green-800 dark:text-green-200 mt-1">
                {totalRecovered.toLocaleString()} SDG
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'pending' | 'completed')}>
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending-recoveries">
              Pending
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed-recoveries">
              Completed
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : recoveries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No {activeTab} recoveries found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Data Collector</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    {canProcess && activeTab === 'pending' && (
                      <TableHead className="text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recoveries.map((recovery) => {
                    const statusConfig = STATUS_CONFIG[recovery.status];
                    const StatusIcon = statusConfig.icon;
                    
                    return (
                      <TableRow key={recovery.id}>
                        <TableCell>
                          <div className="font-medium">{recovery.site_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {recovery.mmp_name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {recovery.data_collector_name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {recovery.pending_amount.toLocaleString()} {recovery.currency}
                          </div>
                          {recovery.recovered_amount > 0 && (
                            <div className="text-xs text-green-600">
                              Recovered: {recovery.recovered_amount.toLocaleString()}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {METHOD_LABELS[recovery.recovery_method]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusConfig.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        {canProcess && activeTab === 'pending' && (
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleProcessClick(recovery)}
                              data-testid={`button-process-recovery-${recovery.id}`}
                            >
                              Process
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Recovery</DialogTitle>
              <DialogDescription>
                Process recovery for {selectedRecovery?.site_name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Original Amount</Label>
                  <p className="font-medium">
                    {selectedRecovery?.original_amount.toLocaleString()} {selectedRecovery?.currency}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Pending Amount</Label>
                  <p className="font-medium">
                    {selectedRecovery?.pending_amount.toLocaleString()} {selectedRecovery?.currency}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="process-method">Recovery Method</Label>
                <Select
                  value={processMethod}
                  onValueChange={(v) => setProcessMethod(v as RecoveryMethod)}
                >
                  <SelectTrigger id="process-method" data-testid="select-process-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deduct_future">Deduct from Future Payments</SelectItem>
                    <SelectItem value="cash_return">Cash Return Received</SelectItem>
                    {isSuperAdmin && (
                      <SelectItem value="write_off">Write Off</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="process-amount">Amount to Recover</Label>
                <Input
                  id="process-amount"
                  type="number"
                  value={processAmount}
                  onChange={(e) => setProcessAmount(e.target.value)}
                  placeholder="Enter amount"
                  data-testid="input-process-amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="process-notes">Notes</Label>
                <Textarea
                  id="process-notes"
                  value={processNotes}
                  onChange={(e) => setProcessNotes(e.target.value)}
                  placeholder="Add any notes about this recovery..."
                  rows={2}
                  data-testid="textarea-process-notes"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setProcessDialogOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleProcessSubmit}
                disabled={isProcessing}
                data-testid="button-submit-recovery"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Process Recovery'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default RecoveryDashboard;
