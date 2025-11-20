
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Upload, ChevronLeft } from 'lucide-react';
import { useMMP } from '@/context/mmp/MMPContext';
import { MMPList } from '@/components/mmp/MMPList';
import { useAuthorization } from '@/hooks/use-authorization';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

const MMP = () => {
  const navigate = useNavigate();
  const { mmpFiles, loading } = useMMP();
  const { checkPermission, hasAnyRole, currentUser } = useAuthorization();
  const [activeTab, setActiveTab] = useState('new');

  const isAdmin = hasAnyRole(['admin']);
  const isFOM = hasAnyRole(['fom']);
  const isCoordinator = hasAnyRole(['coordinator']);
  const canRead = checkPermission('mmp', 'read') || isAdmin || isFOM || isCoordinator;
  const canCreate = (checkPermission('mmp', 'create') || isAdmin) && hasAnyRole(['admin', 'ict']);

  // Set initial active tab based on role
  useEffect(() => {
    if (isCoordinator) {
      setActiveTab('verified');
    } else {
      setActiveTab('new');
    }
  }, [isCoordinator]);

  // Categorize MMPs
  const categorizedMMPs = useMemo(() => {
    let filteredMMPs = mmpFiles;

    // For FOM users, only show MMPs forwarded to them or their verified MMPs
    if (isFOM && currentUser) {
      filteredMMPs = mmpFiles.filter(mmp => {
        const workflow = mmp.workflow as any;
        const forwardedToFomIds = workflow?.forwardedToFomIds || [];
        const isForwardedToThisFOM = forwardedToFomIds.includes(currentUser.id);
        
        // Include MMPs forwarded to this FOM or verified MMPs under this FOM
        return isForwardedToThisFOM || mmp.type === 'verified-template';
      });
    }

    // For Coordinator users, show verified MMPs that contain sites they can verify
    if (isCoordinator && currentUser) {
      filteredMMPs = mmpFiles.filter(mmp => 
        mmp.type === 'verified-template' || 
        mmp.status === 'approved' ||
        ((mmp.workflow as any)?.currentStage && ['permitsVerified', 'cpVerification', 'completed'].includes((mmp.workflow as any)?.currentStage))
      );
    }

    const newMMPs = filteredMMPs.filter(mmp => {
      if (isFOM) {
        // For FOM: New MMPs are those forwarded to them that haven't been verified yet
        const workflow = mmp.workflow as any;
        const forwardedToFomIds = workflow?.forwardedToFomIds || [];
        return forwardedToFomIds.includes(currentUser?.id || '') && 
               mmp.status !== 'approved' && 
               mmp.type !== 'verified-template';
      } else if (isCoordinator) {
        // For Coordinator: They don't see "new" MMPs, only verified ones with sites to verify
        return false;
      } else {
        // For admin/other roles: New MMPs are pending ones not forwarded
        return mmp.status === 'pending' && 
               (!(mmp.workflow as any)?.forwardedToFomIds || (mmp.workflow as any)?.forwardedToFomIds.length === 0);
      }
    });
    
    const forwardedMMPs = filteredMMPs.filter(mmp => {
      if (isFOM) {
        // For FOM: Forwarded means verified MMPs that are sent to coordinators
        return mmp.type === 'verified-template' || 
               (mmp.status === 'approved' && (mmp.workflow as any)?.currentStage === 'completed');
      } else if (isCoordinator) {
        // For Coordinator: They don't have a "forwarded" category
        return false;
      } else {
        // For admin/other roles: Forwarded means MMPs that have been forwarded to FOMs
        return (mmp.workflow as any)?.forwardedToFomIds && (mmp.workflow as any)?.forwardedToFomIds.length > 0;
      }
    });
    
    const verifiedMMPs = filteredMMPs.filter(mmp => {
      if (isCoordinator) {
        // For Coordinator: Show MMPs that have been forwarded to coordinators
        return (mmp.workflow as any)?.forwardedToCoordinators === true;
      } else if (isFOM) {
        // For FOM: Verified means MMPs with sites available for verification
        return mmp.type === 'verified-template' || 
               mmp.status === 'approved' ||
               ((mmp.workflow as any)?.currentStage && ['permitsVerified', 'cpVerification', 'completed'].includes((mmp.workflow as any)?.currentStage));
      } else {
        // For admin/other roles: keep existing logic
        return mmp.status === 'approved' || 
               mmp.type === 'verified-template' ||
               ((mmp.workflow as any)?.currentStage && ['permitsVerified', 'cpVerification', 'completed'].includes((mmp.workflow as any)?.currentStage));
      }
    });

    return {
      new: newMMPs,
      forwarded: forwardedMMPs,
      verified: verifiedMMPs
    };
  }, [mmpFiles, isFOM, currentUser]);

  if (!canRead) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="w-full">
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-10 min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-blue-100 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 py-8 px-2 md:px-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-blue-600/90 to-blue-400/80 dark:from-blue-900 dark:to-blue-700 p-7 rounded-2xl shadow-xl border border-blue-100 dark:border-blue-900">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="hover:bg-blue-100 dark:hover:bg-blue-900/40"
          >
            <ChevronLeft className="h-5 w-5 text-white dark:text-blue-200" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-white to-blue-200 dark:from-blue-200 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">
              MMP Management
            </h1>
            <p className="text-blue-100 dark:text-blue-200/80 font-medium">
              {isAdmin || hasAnyRole(['ict'])
                ? 'Upload MMPs and manage Site visits.'
                : isFOM
                  ? 'Manage your MMP files and site visits'
                  : 'Upload and manage your MMP files'}
            </p>
          </div>
        </div>
        {canCreate && (
          <Button
            className="bg-gradient-to-r from-blue-700 to-blue-500 hover:from-blue-800 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-2 rounded-full font-semibold"
            onClick={() => navigate('/mmp/upload')}
          >
            <Upload className="h-5 w-5 mr-2" />
            Upload MMP
          </Button>
        )}
      </div>

      {/* Content Section */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">
            Loading MMP files...
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full mb-6 ${isCoordinator ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {!isCoordinator && (
                <TabsTrigger value="new" className="flex items-center gap-2">
                  New MMPs
                  <Badge variant="secondary">{categorizedMMPs.new.length}</Badge>
                </TabsTrigger>
              )}
              {!isCoordinator && (
                <TabsTrigger value="forwarded" className="flex items-center gap-2">
                  {isFOM ? 'Forwarded Sites' : 'Forwarded MMPs'}
                  <Badge variant="secondary">{categorizedMMPs.forwarded.length}</Badge>
                </TabsTrigger>
              )}
              <TabsTrigger value={isCoordinator ? "verified" : "verified"} className="flex items-center gap-2">
                {isCoordinator ? "MMPs to Review" : "Verified Sites"}
                <Badge variant="secondary">{categorizedMMPs.verified.length}</Badge>
              </TabsTrigger>
            </TabsList>

            {!isCoordinator && (
              <TabsContent value="new">
                <MMPList mmpFiles={categorizedMMPs.new} />
              </TabsContent>
            )}

            {!isCoordinator && (
              <TabsContent value="forwarded">
                <MMPList mmpFiles={categorizedMMPs.forwarded} />
              </TabsContent>
            )}

            <TabsContent value="verified">
              <MMPList mmpFiles={categorizedMMPs.verified} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default MMP;
