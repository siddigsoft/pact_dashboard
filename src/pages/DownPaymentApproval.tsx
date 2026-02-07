import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { DownPaymentApprovalPanel } from '@/components/downPayment/DownPaymentApprovalPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DollarSign, Shield, AlertTriangle, Info, Users, UserCheck, TrendingUp, Receipt, Wallet } from 'lucide-react';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

export default function DownPaymentApproval() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  
  const userRole = currentUser?.role?.toLowerCase();
  const isSupervisor = userRole === 'supervisor' || userRole === 'hubsupervisor';
  const isAdmin = userRole === 'admin' || userRole === 'financialadmin' || userRole === 'superadmin' || userRole === 'ict' || isSuperAdmin;
  const isFOM = userRole === 'fom' || userRole === 'field operation manager';
  
  const [selectedTier, setSelectedTier] = useState<'tier1' | 'tier2'>(isAdmin ? 'tier2' : 'tier1');
  
  if (!isSupervisor && !isAdmin && !isFOM) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-semibold">Access Denied</h2>
              <p className="text-muted-foreground max-w-md">
                You don't have permission to access this page. Only supervisors and administrators can approve down-payment requests.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const approvalRole = selectedTier === 'tier1' ? 'supervisor' : 'admin';

  return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="h-7 w-7 text-primary" />
              Down-Payment Approval
            </h1>
            <p className="text-muted-foreground mt-1">
              {selectedTier === 'tier1' 
                ? 'Review and approve transportation advance requests from team members'
                : 'Process approved down-payment requests and manage payments'
              }
            </p>
          </div>
          
          {isAdmin && (
            <div className="flex items-center gap-2 p-1 bg-muted rounded-lg">
              <Button
                variant={selectedTier === 'tier1' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedTier('tier1')}
                className="gap-2"
                data-testid="button-tier1"
              >
                <Users className="h-4 w-4" />
                Tier 1: Supervisor
              </Button>
              <Button
                variant={selectedTier === 'tier2' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedTier('tier2')}
                className="gap-2"
                data-testid="button-tier2"
              >
                <UserCheck className="h-4 w-4" />
                Tier 2: Admin
              </Button>
            </div>
          )}
          
          {!isAdmin && (
            <Badge variant="outline" className="self-start flex items-center gap-1">
              <Shield className="h-3 w-3" />
              {isSupervisor ? 'Tier 1: Supervisor Review' : 'Tier 2: Admin Processing'}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/financial-operations')}
            data-testid="button-goto-financial-ops"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Financial Ops
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/budget')}
            data-testid="button-goto-budget"
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Budget
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/cost-submission')}
            data-testid="button-goto-cost-submissions"
          >
            <Receipt className="h-4 w-4 mr-2" />
            Cost Submissions
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/wallet')}
            data-testid="button-goto-wallet"
          >
            <Wallet className="h-4 w-4 mr-2" />
            Wallet
          </Button>
        </div>

        <PageInfoBanner
          title="Down-Payment Approval"
          description="Manage transportation advance (down-payment) requests. Field staff request advance payments before site visits to cover transportation costs. These advances are later deducted when the site visit fee is credited to their wallet."
          workflowSteps={[
            { step: 1, role: 'Data Collector', action: 'Requests advance', description: 'A field staff member requests a transportation advance before going on a site visit.' },
            { step: 2, role: 'Supervisor', action: 'Reviews request (Tier 1)', description: 'Supervisor reviews and approves or rejects the advance request.' },
            { step: 3, role: 'Admin', action: 'Approves payment (Tier 2)', description: 'Admin or Finance Admin approves the advance and authorizes the payment amount.' },
            { step: 4, role: 'Finance Admin', action: 'Disburses funds', description: 'Finance processes the payment. The amount is recorded as a debit in the staff member\'s wallet.' },
            { step: 5, role: 'System', action: 'Auto-deducts on completion', description: 'When the site visit is completed and fees are credited, the advance amount is automatically deducted.' },
          ]}
        />

        <Alert className={selectedTier === 'tier1' ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30' : ''}>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {selectedTier === 'tier1' ? (
              <>
                <strong>Tier 1 - Supervisor Approval Flow:</strong> Review down-payment requests from data collectors and coordinators. 
                Approved requests will be forwarded to Tier 2 (Admin) for final processing and payment.
              </>
            ) : (
              <>
                <strong>Tier 2 - Admin Processing Flow:</strong> Process requests that have been approved by supervisors. 
                You can approve, reject, or process payments directly to the requester's wallet.
              </>
            )}
          </AlertDescription>
        </Alert>

        <DownPaymentApprovalPanel userRole={approvalRole} />
      </div>
  );
}
