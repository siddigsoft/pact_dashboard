import { useUser } from '@/context/user/UserContext';
import { DownPaymentProvider } from '@/context/downPayment/DownPaymentContext';
import { DownPaymentApprovalPanel } from '@/components/downPayment/DownPaymentApprovalPanel';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DollarSign, Shield, AlertTriangle, Info } from 'lucide-react';

export default function DownPaymentApproval() {
  const { currentUser } = useUser();
  
  const userRole = currentUser?.role?.toLowerCase();
  const isSupervisor = userRole === 'supervisor' || userRole === 'hubsupervisor';
  const isAdmin = userRole === 'admin' || userRole === 'financialadmin';
  
  if (!isSupervisor && !isAdmin) {
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

  const approvalRole = isSupervisor ? 'supervisor' : 'admin';

  return (
    <DownPaymentProvider>
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="h-7 w-7 text-primary" />
              Down-Payment Approval
            </h1>
            <p className="text-muted-foreground mt-1">
              {isSupervisor 
                ? 'Review and approve transportation advance requests from your team'
                : 'Process approved down-payment requests and manage payments'
              }
            </p>
          </div>
          <Badge variant="outline" className="self-start flex items-center gap-1">
            <Shield className="h-3 w-3" />
            {isSupervisor ? 'Tier 1: Supervisor Review' : 'Tier 2: Admin Processing'}
          </Badge>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {isSupervisor ? (
              <>
                <strong>Supervisor Approval Flow:</strong> Review down-payment requests from data collectors and coordinators in your hub. 
                Approved requests will be forwarded to the finance team for final processing and payment.
              </>
            ) : (
              <>
                <strong>Admin Processing Flow:</strong> Process requests that have been approved by supervisors. 
                You can approve, reject, or process payments directly to the requester's wallet.
              </>
            )}
          </AlertDescription>
        </Alert>

        <DownPaymentApprovalPanel userRole={approvalRole} />
      </div>
    </DownPaymentProvider>
  );
}
