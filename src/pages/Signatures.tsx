/**
 * Signatures Page
 * Main page for signature management and document signing
 * Features real-time updates for signature changes
 */

import { Suspense, lazy } from 'react';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield } from 'lucide-react';
import { DataFreshnessBadge } from '@/components/realtime';

const SignatureManager = lazy(() => 
  import('@/components/signature/SignatureManager').then(module => ({ 
    default: module.SignatureManager 
  }))
);

function SignaturesSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="pt-6 space-y-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 flex-1" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignaturesPage() {
  const { currentUser } = useAppContext();
  const loading = !currentUser;

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <SignaturesSkeleton />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Please sign in to manage your signatures</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            Digital Signatures
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your signatures and view signing history
          </p>
        </div>
        <DataFreshnessBadge variant="badge" />
      </div>

      <Suspense fallback={<SignaturesSkeleton />}>
        <SignatureManager
          userId={currentUser.id}
          userName={currentUser.name || currentUser.email || 'User'}
          userEmail={currentUser.email}
          userPhone={(currentUser as any).phone}
        />
      </Suspense>
    </div>
  );
}
