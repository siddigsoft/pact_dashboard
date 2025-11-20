
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
import { supabase } from '@/integrations/supabase/client';

const MMP = () => {
  const navigate = useNavigate();
  const { mmpFiles, loading } = useMMP();
  const { checkPermission, hasAnyRole, currentUser } = useAuthorization();
  const [activeTab, setActiveTab] = useState('new');
  // Subcategory state for Forwarded MMPs (Admin/ICT only)
  const [forwardedSubTab, setForwardedSubTab] = useState<'pending' | 'verified' | 'rejected'>('pending');
  // Subcategory state for Verified Sites (Admin/ICT only)
  const [verifiedSubTab, setVerifiedSubTab] = useState<'newSites' | 'approvedCosted' | 'dispatched' | 'completed' | 'rejected'>('newSites');
  const [siteVisitStats, setSiteVisitStats] = useState<Record<string, {
    exists: boolean;
    hasCosted: boolean;
    hasAssigned: boolean;
    hasInProgress: boolean;
    hasCompleted: boolean;
    hasRejected: boolean;
  }>>({});

  // Helper function to normalize role checking (handles both lowercase and proper case)
  const hasRole = (rolesToCheck: string[]) => {
    if (!currentUser) return false;
    
    // Get user's role (single) and roles (array) - normalize to lowercase for comparison
    const userRole = currentUser.role?.toLowerCase() || '';
    const userRoles = (currentUser.roles || []).map(r => r.toLowerCase());
    
    // Check if any of the provided roles match
    return rolesToCheck.some(role => {
      const normalizedRole = role.toLowerCase();
      return userRole === normalizedRole || userRoles.includes(normalizedRole);
    });
  };

  const isAdmin = hasRole(['Admin', 'admin']);
  const isICT = hasRole(['ICT', 'ict']);
  const isFOM = hasRole(['Field Operation Manager (FOM)', 'fom', 'field operation manager']);
  const isCoordinator = hasRole(['Coordinator', 'coordinator']);
  const canRead = checkPermission('mmp', 'read') || isAdmin || isFOM || isCoordinator || isICT;
  const canCreate = (checkPermission('mmp', 'create') || isAdmin || isICT);

  // Debug: Log role checks
  useEffect(() => {
    if (currentUser) {
      console.log('🔍 MMP Page - Current User:', currentUser);
      console.log('🔍 User Role:', currentUser.role);
      console.log('🔍 User Roles Array:', currentUser.roles);
      console.log('🔍 isAdmin:', isAdmin);
      console.log('🔍 isICT:', isICT);
      console.log('🔍 isFOM:', isFOM);
      console.log('🔍 isCoordinator:', isCoordinator);
      console.log('🔍 canCreate:', canCreate);
    }
  }, [currentUser, isAdmin, isICT, isFOM, isCoordinator, canCreate]);

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
        // For FOM: New MMPs are those forwarded to them that haven't been processed yet
        const workflow = mmp.workflow as any;
        const forwardedToFomIds = workflow?.forwardedToFomIds || [];
        return forwardedToFomIds.includes(currentUser?.id || '') && 
               !workflow?.permitsUploaded &&
               workflow?.currentStage !== 'permitsVerified';
      } else if (isCoordinator) {
        // For Coordinator: They don't see "new" MMPs, only verified ones with sites to verify
        return false;
      } else if (isAdmin || isICT) {
        // For admin/ICT: New MMPs are those uploaded but not forwarded to any FOM yet
        return mmp.status === 'pending' && 
               (!(mmp.workflow as any)?.forwardedToFomIds || (mmp.workflow as any)?.forwardedToFomIds.length === 0);
      }
      return false;
    });
    
    const forwardedMMPs = filteredMMPs.filter(mmp => {
      if (isFOM) {
        // For FOM: Forwarded means MMPs they've processed and sent to coordinators
        const workflow = mmp.workflow as any;
        return workflow?.forwardedToCoordinators === true ||
               workflow?.currentStage === 'coordinatorReview';
      } else if (isCoordinator) {
        // For Coordinator: They don't have a "forwarded" category
        return false;
      } else if (isAdmin || isICT) {
        // For admin/ICT: Forwarded means MMPs that have been forwarded to FOMs
        return (mmp.workflow as any)?.forwardedToFomIds && (mmp.workflow as any)?.forwardedToFomIds.length > 0;
      }
      return false;
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

  // Forwarded subcategories for Admin/ICT view
  const forwardedSubcategories = useMemo(() => {
    const base = categorizedMMPs.forwarded || [];
    const pending = base.filter(mmp => {
      const hasFederalPermit = Boolean(mmp.permits && (mmp.permits as any).federal);
      return !hasFederalPermit && mmp.status !== 'approved' && mmp.status !== 'rejected';
    });
    const verified = base.filter(mmp => mmp.status === 'approved');
    const rejected = base.filter(mmp => mmp.status === 'rejected');
    return { pending, verified, rejected };
  }, [categorizedMMPs.forwarded]);

  // Verified subcategories for Admin/ICT
  const verifiedSubcategories = useMemo(() => {
    const base = categorizedMMPs.verified || [];
    return {
      newSites: base.filter(mmp => {
        const stage = (mmp.workflow as any)?.currentStage;
        const stats = siteVisitStats[mmp.id];
        const coordinatorVerified = Boolean((mmp.workflow as any)?.coordinatorVerified);
        // New Sites: verified by coordinators and saved, not yet approved/costed/advanced
        return coordinatorVerified && (stage === 'verified' || stage === 'draft') && mmp.status === 'pending' && !(stats?.hasCosted || stats?.hasInProgress || stats?.hasCompleted);
      }),
      approvedCosted: base.filter(mmp => {
        const stats = siteVisitStats[mmp.id];
        // Approved & Costed: reviewed by admin/ICT/finance and costs added
        return mmp.status === 'approved' || Boolean(stats?.hasCosted);
      }),
      dispatched: base.filter(mmp => {
        const stats = siteVisitStats[mmp.id];
        // Dispatched: approved and accepted by enumerators (inProgress is proxy for accepted)
        return Boolean(stats?.hasInProgress || stats?.hasAssigned);
      }),
      // Completed: rely on site visits completed or workflow stage
      completed: base.filter(mmp => {
        const stats = siteVisitStats[mmp.id];
        return Boolean(stats?.hasCompleted) || (mmp.workflow as any)?.currentStage === 'completed';
      }),
      rejected: base.filter(mmp => {
        const stats = siteVisitStats[mmp.id];
        return mmp.status === 'rejected' || Boolean(stats?.hasRejected);
      })
    };
  }, [categorizedMMPs.verified, siteVisitStats]);

  // Load site visit stats for verified MMPs (Admin/ICT)
  useEffect(() => {
    const loadStats = async () => {
      if (!(isAdmin || isICT)) return;
      const list = categorizedMMPs.verified || [];
      if (list.length === 0) {
        setSiteVisitStats({});
        return;
      }
      const ids = list.map(m => m.id);
      try {
        const { data, error } = await supabase
          .from('site_visits')
          .select('mmp_id,status,fees')
          .in('mmp_id', ids);
        if (error) throw error;
        const map: Record<string, {
          exists: boolean; hasCosted: boolean; hasAssigned: boolean; hasInProgress: boolean; hasCompleted: boolean; hasRejected: boolean;
        }> = {};
        for (const row of (data || []) as any[]) {
          const id = row.mmp_id;
          if (!map[id]) {
            map[id] = { exists: false, hasCosted: false, hasAssigned: false, hasInProgress: false, hasCompleted: false, hasRejected: false };
          }
          map[id].exists = true;
          const status = String(row.status || '').toLowerCase();
          if (status === 'assigned') map[id].hasAssigned = true;
          if (status === 'inprogress' || status === 'accepted') map[id].hasInProgress = true;
          if (status === 'completed') map[id].hasCompleted = true;
          if (status === 'rejected' || status === 'declined') map[id].hasRejected = true;
          const fees = row.fees || {};
          const total = Number(fees.total || 0);
          if (total > 0) map[id].hasCosted = true;
        }
        setSiteVisitStats(map);
      } catch (e) {
        console.warn('Failed to load site visit stats', e);
        setSiteVisitStats({});
      }
    };
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isICT, categorizedMMPs.verified?.length]);

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
              {isAdmin || isICT
                ? 'Upload, validate, and forward MMPs to Field Operations Managers'
                : isFOM
                  ? 'Process MMPs, attach permits, and assign sites to coordinators'
                  : isCoordinator
                  ? 'Review and verify site assignments'
                  : 'Manage your MMP files and site visits'}
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
                  <TabsTrigger value="new" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
                    New MMPs
                    <Badge variant="secondary">{categorizedMMPs.new.length}</Badge>
                  </TabsTrigger>
                )}
                {!isCoordinator && (
                  <TabsTrigger value="forwarded" className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
                    {isFOM ? 'Forwarded Sites' : 'Forwarded MMPs'}
                    <Badge variant="secondary">{categorizedMMPs.forwarded.length}</Badge>
                  </TabsTrigger>
                )}
                <TabsTrigger value={isCoordinator ? "verified" : "verified"} className="flex items-center gap-2 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-900">
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
                  {(isAdmin || isICT) && (
                    <div className="mb-4 flex flex-wrap gap-2 items-center">
                      <div className="text-sm font-medium text-muted-foreground mr-2">Subcategory:</div>
                      <Button
                        variant={forwardedSubTab === 'pending' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setForwardedSubTab('pending')}
                        className={forwardedSubTab === 'pending' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                      >
                        Pending
                        <Badge variant="secondary" className="ml-2">
                          {forwardedSubcategories.pending.length}
                        </Badge>
                      </Button>
                      <Button
                        variant={forwardedSubTab === 'verified' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setForwardedSubTab('verified')}
                        className={forwardedSubTab === 'verified' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                      >
                        Verified
                        <Badge variant="secondary" className="ml-2">
                          {forwardedSubcategories.verified.length}
                        </Badge>
                      </Button>
                      <Button
                        variant={forwardedSubTab === 'rejected' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setForwardedSubTab('rejected')}
                        className={forwardedSubTab === 'rejected' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                      >
                        Rejected
                        <Badge variant="secondary" className="ml-2">
                          {forwardedSubcategories.rejected.length}
                        </Badge>
                      </Button>
                    </div>
                  )}
                  <MMPList
                    mmpFiles={(isAdmin || isICT) ? forwardedSubcategories[forwardedSubTab] : categorizedMMPs.forwarded}
                  />
                </TabsContent>
              )}

              <TabsContent value="verified">
                {(isAdmin || isICT) && (
                  <div className="mb-4 flex flex-wrap gap-2 items-center">
                    <div className="text-sm font-medium text-muted-foreground mr-2">Subcategory:</div>
                    <Button
                      variant={verifiedSubTab === 'newSites' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVerifiedSubTab('newSites')}
                      className={verifiedSubTab === 'newSites' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                    >
                      New Sites
                      <Badge variant="secondary" className="ml-2">{verifiedSubcategories.newSites.length}</Badge>
                    </Button>
                    <Button
                      variant={verifiedSubTab === 'approvedCosted' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVerifiedSubTab('approvedCosted')}
                      className={verifiedSubTab === 'approvedCosted' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                    >
                      Approved & Costed
                      <Badge variant="secondary" className="ml-2">{verifiedSubcategories.approvedCosted.length}</Badge>
                    </Button>
                    <Button
                      variant={verifiedSubTab === 'dispatched' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVerifiedSubTab('dispatched')}
                      className={verifiedSubTab === 'dispatched' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                    >
                      Dispatched
                      <Badge variant="secondary" className="ml-2">{verifiedSubcategories.dispatched.length}</Badge>
                    </Button>
                    <Button
                      variant={verifiedSubTab === 'completed' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVerifiedSubTab('completed')}
                      className={verifiedSubTab === 'completed' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                    >
                      Completed
                      <Badge variant="secondary" className="ml-2">{verifiedSubcategories.completed.length}</Badge>
                    </Button>
                    <Button
                      variant={verifiedSubTab === 'rejected' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setVerifiedSubTab('rejected')}
                      className={verifiedSubTab === 'rejected' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                    >
                      Rejected
                      <Badge variant="secondary" className="ml-2">{verifiedSubcategories.rejected.length}</Badge>
                    </Button>
                  </div>
                )}
                <MMPList mmpFiles={(isAdmin || isICT) ? verifiedSubcategories[verifiedSubTab] : categorizedMMPs.verified} />
              </TabsContent>
            </Tabs>
        )}
      </div>
    </div>
  );
};

export default MMP;
