import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useWallet } from '@/context/wallet/WalletContext';
import { useClassification } from '@/context/classification/ClassificationContext';
import { Loader2, DollarSign, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function RetainerProcessingCard() {
  const { processMonthlyRetainers } = useWallet();
  const { getCurrentUserClassifications } = useClassification();
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ processed: number; failed: number; total: number } | null>(null);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [loadingEligible, setLoadingEligible] = useState(false);

  const getCurrentPeriod = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const loadEligibleUsers = async () => {
    setLoadingEligible(true);
    try {
      const users = await getCurrentUserClassifications();
      const eligible = users.filter(u => u.hasRetainer && u.isActive);
      setEligibleCount(eligible.length);
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
          <Alert>
            <Users className="h-4 w-4" />
            <AlertDescription>
              {eligibleCount} team members are currently eligible for monthly retainers
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
          onClick={handleProcessRetainers}
          disabled={processing}
          data-testid="button-process-retainers"
        >
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
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
