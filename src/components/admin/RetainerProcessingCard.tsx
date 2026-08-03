import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useWallet } from '@/context/wallet/WalletContext';
import { useClassification } from '@/context/classification/ClassificationContext';
import { Loader2, DollarSign, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export function RetainerProcessingCard() {
  const { processMonthlyRetainers } = useWallet();
  const { getCurrentUserClassifications } = useClassification();
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ processed: number; failed: number; total: number } | null>(null);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [alreadyPaidCount, setAlreadyPaidCount] = useState<number | null>(null);
  const [loadingEligible, setLoadingEligible] = useState(false);

  const getCurrentPeriod = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const loadEligibleUsers = async () => {
    setLoadingEligible(true);
    try {
      const currentPeriod = getCurrentPeriod();

      // Fetch eligible classifications and already-paid transactions in parallel
      const [users, { data: paidRows }] = await Promise.all([
        getCurrentUserClassifications(),
        supabase
          .from('wallet_transactions')
          .select('user_id')
          .eq('type', 'adjustment')
          .ilike('description', `%Monthly retainer%`)
          .ilike('description', `%${currentPeriod}%`),
      ]);

      const eligible = users.filter(u => u.hasRetainer && u.isActive);
      const paidUserIds = new Set((paidRows ?? []).map((r: any) => r.user_id));
      const alreadyPaid = eligible.filter(u => paidUserIds.has(u.userId)).length;

      setEligibleCount(eligible.length);
      setAlreadyPaidCount(alreadyPaid);
    } catch (error) {
      console.error('Failed to load eligible users:', error);
    } finally {
      setLoadingEligible(false);
    }
  };

  const handleProcessRetainers = async () => {
    setProcessing(true);
    setResult(null);
    try {
      const processResult = await processMonthlyRetainers();
      setResult(processResult);
      await loadEligibleUsers();
    } catch (error) {
      console.error('Failed to process retainers:', error);
    } finally {
      setProcessing(false);
    }
  };

  const pendingCount = eligibleCount !== null && alreadyPaidCount !== null
    ? eligibleCount - alreadyPaidCount
    : null;
  const allPaid = pendingCount !== null && pendingCount <= 0;

  return (
    <Card data-testid="card-retainer-processing">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Monthly Retainer Processing
            </CardTitle>
            <CardDescription>
              Process monthly retainer payments for classified team members
            </CardDescription>
          </div>
          <Badge variant="outline">
            {getCurrentPeriod()}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {eligibleCount !== null && (
          <Alert variant={allPaid ? 'default' : 'default'}>
            <Users className="h-4 w-4" />
            <AlertDescription>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-medium">{eligibleCount} eligible</span>
                {alreadyPaidCount !== null && (
                  <>
                    <span className="text-green-600 dark:text-green-400">
                      ✓ {alreadyPaidCount} already paid this month
                    </span>
                    {pendingCount !== null && pendingCount > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        {pendingCount} pending payment
                      </span>
                    )}
                    {allPaid && (
                      <span className="text-muted-foreground">
                        — all retainers processed for {getCurrentPeriod()}
                      </span>
                    )}
                  </>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert variant={result.failed > 0 ? 'destructive' : 'default'}>
            {result.failed > 0 ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            <AlertDescription>
              <div className="space-y-1">
                <div className="font-medium">Processing Complete</div>
                <div className="text-sm">
                  Successfully processed: {result.processed} / {result.total}
                </div>
                {result.failed > 0 && (
                  <div className="text-sm text-destructive">
                    Failed: {result.failed}
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border p-4 space-y-2">
          <h4 className="font-medium text-sm">How it works:</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Fetches all team members with active retainer classifications</li>
            <li>Checks if retainer was already paid for current month</li>
            <li>Adds retainer amount to each eligible member's wallet</li>
            <li>Creates transaction record for audit trail</li>
          </ul>
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button
          type="button"
          onClick={loadEligibleUsers}
          variant="outline"
          disabled={loadingEligible || processing}
          data-testid="button-refresh-eligible"
        >
          {loadingEligible ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Users className="h-4 w-4 mr-2" />
              Check Eligible Users
            </>
          )}
        </Button>

        <Button
          type="button"
          onClick={handleProcessRetainers}
          disabled={processing || allPaid}
          data-testid="button-process-retainers"
          variant={allPaid ? 'outline' : 'default'}
        >
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : allPaid ? (
            <>
              <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
              All retainers already paid this month
            </>
          ) : pendingCount !== null && pendingCount > 0 ? (
            <>
              <DollarSign className="h-4 w-4 mr-2" />
              Process {pendingCount} Retainer{pendingCount !== 1 ? 's' : ''}
            </>
          ) : (
            <>
              <DollarSign className="h-4 w-4 mr-2" />
              Process This Month's Retainers
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
