/**
 * Signatures Page
 * Main page for signature management and document signing
 */

import { useAppContext } from '@/context/AppContext';
import { SignatureManager } from '@/components/signature/SignatureManager';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield } from 'lucide-react';

export default function SignaturesPage() {
  const { currentUser } = useAppContext();
  const loading = !currentUser;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
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
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" />
          Digital Signatures
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your signatures and view signing history
        </p>
      </div>

      <SignatureManager
        userId={currentUser.id}
        userName={currentUser.name || currentUser.email || 'User'}
        userEmail={currentUser.email}
        userPhone={(currentUser as any).phone}
      />
    </div>
  );
}
