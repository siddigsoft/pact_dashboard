
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Upload, ChevronLeft, Trash2 } from 'lucide-react';
import { useMMP } from '@/context/mmp/MMPContext';
import { MMPList } from '@/components/mmp/MMPList';
import { useAuthorization } from '@/hooks/use-authorization';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { SiteVisitRow } from '@/components/mmp/MMPCategorySitesTable';
import MMPCategorySitesTable from '@/components/mmp/MMPCategorySitesTable';
import MMPSiteEntriesTable from '@/components/mmp/MMPSiteEntriesTable';
import { supabase } from '@/integrations/supabase/client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

// Using relative import fallback in case path alias resolution misses new file
import BulkClearForwardedDialog from '../components/mmp/BulkClearForwardedDialog';

const MMP = () => {
  const navigate = useNavigate();
  const { mmpFiles, loading, updateMMP } = useMMP();
  const { checkPermission, hasAnyRole, currentUser } = useAuthorization();
  const [activeTab, setActiveTab] = useState('new');
  // Subcategory state for Forwarded MMPs (Admin/ICT only)
  const [forwardedSubTab, setForwardedSubTab] = useState<'pending' | 'verified'>('pending');
  // Subcategory state for Verified Sites (Admin/ICT only)
  const [verifiedSubTab, setVerifiedSubTab] = useState<'newSites' | 'approvedCosted' | 'dispatched' | 'completed'>('newSites');
  // Subcategory state for New MMPs (FOM only)
  const [newFomSubTab, setNewFomSubTab] = useState<'pending' | 'verified'>('pending');
  const [siteVisitStats, setSiteVisitStats] = useState<Record<string, {
    exists: boolean;
    hasCosted: boolean;
    hasAssigned: boolean;
    hasInProgress: boolean;
    hasCompleted: boolean;
    hasRejected: boolean;
  }>>({});
  const [siteVisitRows, setSiteVisitRows] = useState<SiteVisitRow[]>([]);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

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
        // Keep showing items forwarded to this FOM under "New MMPs" until they are forwarded to coordinators
        return forwardedToFomIds.includes(currentUser?.id || '') &&
               workflow?.forwardedToCoordinators !== true;
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

  // Forwarded subcategories for Admin/ICT view (Removed Rejected)
  const forwardedSubcategories = useMemo(() => {
    const base = categorizedMMPs.forwarded || [];
    const pending = base.filter(mmp => {
      const hasFederalPermit = Boolean(mmp.permits && (mmp.permits as any).federal);
      return !hasFederalPermit && mmp.status !== 'approved' && mmp.status !== 'rejected';
    });
    const verified = base.filter(mmp => mmp.status === 'approved');
    return { pending, verified };
  }, [categorizedMMPs.forwarded]);

  // New MMP subcategories for FOM (Removed Rejected)
  const newFomSubcategories = useMemo(() => {
    if (!isFOM) return { pending: [], verified: [] } as Record<string, typeof categorizedMMPs.new>;
    const base = categorizedMMPs.new || [];
    const pending = base.filter(mmp => mmp.status !== 'approved' && mmp.status !== 'rejected');
    const verified = base.filter(mmp => mmp.status === 'approved');
    return { pending, verified };
  }, [isFOM, categorizedMMPs.new]);

  // Verified subcategories for Admin/ICT
  const verifiedSubcategories = useMemo(() => {
    const base = categorizedMMPs.verified || [];
    return {
      newSites: base.filter(mmp => {
        const stage = (mmp.workflow as any)?.currentStage;
        const stats = siteVisitStats[mmp.id];
        const coordinatorVerified = Boolean((mmp.workflow as any)?.coordinatorVerified);
        // New Sites includes:
        // 1) Coordinator-verified MMPs still in early stage and pending, with no cost/dispatch/completion
        const isCoordinatorNew = coordinatorVerified && (stage === 'verified' || stage === 'draft') && mmp.status === 'pending' && !(stats?.hasCosted || stats?.hasInProgress || stats?.hasCompleted || stats?.hasRejected);
        // 2) Verified-template MMPs that have no cost/dispatch/completion/rejection yet (status may already be approved)
        const isVerifiedTemplateNew = (mmp.type === 'verified-template') && !(stats?.hasCosted || stats?.hasInProgress || stats?.hasCompleted || stats?.hasRejected);
        return isCoordinatorNew || isVerifiedTemplateNew;
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
      })
    };
  }, [categorizedMMPs.verified, siteVisitStats]);

  // Build unified site rows (site_visits + fallback to mmp.siteEntries) for given MMP list
  const buildSiteRowsFromMMPs = (mmps: any[], filterFn?: (row: SiteVisitRow) => boolean): SiteVisitRow[] => {
    const rows: SiteVisitRow[] = [];
    const existingIds = new Set(siteVisitRows.map(r => r.mmpId));
    for (const mmp of mmps) {
      // Use siteEntries when we don't yet have site_visits for this MMP
      if (!existingIds.has(mmp.id) && Array.isArray(mmp.siteEntries)) {
        for (const se of mmp.siteEntries) {
          const row: SiteVisitRow = {
            id: se.id || `${mmp.id}-site-${rows.length}`,
            mmpId: mmp.id,
            siteName: se.siteName || se.siteCode || se.state || 'Site',
            siteCode: se.siteCode,
            state: se.state,
            locality: se.locality,
            status: (se.status || 'pending'),
            feesTotal: 0,
            assignedAt: undefined,
            completedAt: undefined,
            rejectionReason: undefined,
          };
          if (!filterFn || filterFn(row)) {
            rows.push(row);
          }
        }
      }
    }
    // Merge with siteVisitRows restricted to those MMPs
    const visitRows = siteVisitRows.filter(r => {
      const matchesMMP = mmps.find(m => m.id === r.mmpId);
      if (!matchesMMP) return false;
      return !filterFn || filterFn(r);
    });
    return [...visitRows, ...rows];
  };

  // Verified site rows per subcategory (all roles seeing Verified tab)
  const verifiedCategorySiteRows = useMemo(() => {
    const subKey = verifiedSubTab;
    
    // For "newSites" subcategory, get all MMPs with verified sites
    if (subKey === 'newSites') {
      // Get all MMPs from verified category (they may or may not be marked coordinatorVerified yet)
      const allVerifiedMMPs = categorizedMMPs.verified || [];
      
      if (allVerifiedMMPs.length === 0) return [];
      
      // Filter to only show verified sites from any MMP
      const verifiedSites = buildSiteRowsFromMMPs(allVerifiedMMPs, (row) => {
        // Show sites that are verified (from site_visits or mmp_site_entries)
        // Check both lowercase and capitalized versions
        const status = row.status?.toLowerCase() || '';
        return status === 'verified';
      });
      
      // Only return sites that are actually verified
      return verifiedSites;
    }
    
    const mmps = verifiedSubcategories[subKey] || [];
    if (mmps.length === 0) return [];
    return buildSiteRowsFromMMPs(mmps);
  }, [verifiedSubTab, verifiedSubcategories, categorizedMMPs.verified, siteVisitRows]);

  // Group verified site rows by MMP for display
  const verifiedVisibleMMPs = useMemo(() => {
    // For "newSites" subcategory, show all MMPs that have verified sites
    if (verifiedSubTab === 'newSites') {
      // Use the verifiedCategorySiteRows which already has the filtered verified sites
      const verifiedSites = verifiedCategorySiteRows;
      
      // Get unique MMP IDs from verified sites
      const mmpIdsWithVerifiedSites = new Set(verifiedSites.map(s => s.mmpId));
      
      // Return only MMPs that have verified sites
      const allVerifiedMMPs = categorizedMMPs.verified || [];
      return allVerifiedMMPs.filter(mmp => mmpIdsWithVerifiedSites.has(mmp.id));
    }
    
    return (isAdmin || isICT || isFOM || isCoordinator)
      ? (verifiedSubcategories[verifiedSubTab] || [])
      : (categorizedMMPs.verified || []);
  }, [isAdmin, isICT, isFOM, isCoordinator, verifiedSubTab, verifiedSubcategories, categorizedMMPs.verified, verifiedCategorySiteRows]);

  const verifiedGroupedRows = useMemo(() => {
    // For "newSites" subcategory, filter to only show verified sites
    const filterFn = verifiedSubTab === 'newSites' 
      ? (row: SiteVisitRow) => {
          const status = row.status?.toLowerCase() || '';
          return status === 'verified';
        }
      : undefined;
    
    return verifiedVisibleMMPs.map(m => ({
      mmp: m,
      rows: buildSiteRowsFromMMPs([m], filterFn),
    }));
  }, [verifiedVisibleMMPs, verifiedSubTab, siteVisitRows]);

  // Forwarded site rows per subcategory (FOM only for site data)
  const forwardedCategorySiteRows = useMemo(() => {
    if (!isFOM) return [] as SiteVisitRow[];
    const mmps = forwardedSubcategories[forwardedSubTab] || [];
    if (mmps.length === 0) return [];
    return buildSiteRowsFromMMPs(mmps);
  }, [isFOM, forwardedSubTab, forwardedSubcategories, siteVisitRows]);

  // Aggregated site entries (raw MMP.siteEntries) for Forwarded section
  const forwardedEntries = useMemo(() => {
    const mmps = (isAdmin || isICT || isFOM) ? (forwardedSubcategories[forwardedSubTab] || []) : (categorizedMMPs.forwarded || []);
    const entries: any[] = [];
    for (const m of mmps) {
      const list = (m as any).siteEntries || [];
      if (Array.isArray(list)) {
        list.forEach((se: any, idx: number) => {
          entries.push({
            ...se,
            __mmpId: m.id,
            __siteIndex: idx,
            _key: se?.id || se?.siteCode || `${m.id}-site-${idx}`,
          });
        });
      }
    }
    return entries;
  }, [isAdmin, isICT, isFOM, forwardedSubTab, forwardedSubcategories, categorizedMMPs.forwarded]);

  // - Coordinator: Verified only
  useEffect(() => {
    const loadStats = async () => {
      if (!(isAdmin || isICT || isFOM || isCoordinator)) return;
      let list: any[] = [];
      if (isFOM) {
        list = [ ...(categorizedMMPs.verified || []), ...(categorizedMMPs.forwarded || []) ];
      } else if (isAdmin || isICT || isCoordinator) {
        list = [ ...(categorizedMMPs.verified || []) ];
      }
      if (list.length === 0) {
        setSiteVisitStats({});
        return;
      }
      const ids = list.map(m => m.id);
      try {
        // Load from site_visits
        const { data: siteVisitsData, error: siteVisitsError } = await supabase
          .from('site_visits')
          .select('id,mmp_id,status,fees,site_name,site_code,state,locality,assigned_at,completed_at,rejection_reason,verified_by,verified_at')
          .in('mmp_id', ids);
        if (siteVisitsError) throw siteVisitsError;
        
        // Also load from mmp_site_entries for verified sites
        const { data: mmpEntriesData, error: mmpEntriesError } = await supabase
          .from('mmp_site_entries')
          .select('id,mmp_file_id,status,site_code,state,locality,site_name,verification_notes')
          .in('mmp_file_id', ids)
          .eq('status', 'Verified');
        if (mmpEntriesError) console.warn('Failed to load mmp_site_entries:', mmpEntriesError);
        
        const map: Record<string, {
          exists: boolean; hasCosted: boolean; hasAssigned: boolean; hasInProgress: boolean; hasCompleted: boolean; hasRejected: boolean;
        }> = {};
        const rows: SiteVisitRow[] = [];
        const siteVisitMap = new Map<string, SiteVisitRow>();
        
        // Process site_visits
        for (const row of (siteVisitsData || []) as any[]) {
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
          
          const siteRow: SiteVisitRow = {
            id: row.id,
            mmpId: row.mmp_id,
            siteName: row.site_name || row.site_code || row.id,
            siteCode: row.site_code || undefined,
            state: row.state || undefined,
            locality: row.locality || undefined,
            status: row.status || 'unknown',
            feesTotal: total,
            assignedAt: row.assigned_at || undefined,
            completedAt: row.completed_at || undefined,
            rejectionReason: row.rejection_reason || undefined,
            verifiedBy: row.verified_by || undefined,
            verifiedAt: row.verified_at || undefined,
          };
          rows.push(siteRow);
          // Map by mmp_id and site_code for merging
          if (row.site_code) {
            siteVisitMap.set(`${row.mmp_id}-${row.site_code}`, siteRow);
          }
        }
        
        // Process mmp_site_entries - add verified sites that might not be in site_visits
        for (const entry of (mmpEntriesData || []) as any[]) {
          const key = `${entry.mmp_file_id}-${entry.site_code}`;
          // If we don't have this site in site_visits, add it from mmp_site_entries
          if (!siteVisitMap.has(key)) {
            const siteRow: SiteVisitRow = {
              id: entry.id || `${entry.mmp_file_id}-${entry.site_code}`,
              mmpId: entry.mmp_file_id,
              siteName: entry.site_name || entry.site_code || 'Site',
              siteCode: entry.site_code || undefined,
              state: entry.state || undefined,
              locality: entry.locality || undefined,
              status: 'Verified', // Status from mmp_site_entries
              feesTotal: 0,
              verifiedBy: undefined, // mmp_site_entries doesn't have verified_by, will need to get from site_visits if exists
              verifiedAt: undefined,
            };
            rows.push(siteRow);
            siteVisitMap.set(key, siteRow);
          } else {
            // Update existing row with verified status if it's verified in mmp_site_entries
            const existingRow = siteVisitMap.get(key);
            if (existingRow && entry.status === 'Verified' && existingRow.status?.toLowerCase() !== 'verified') {
              existingRow.status = 'Verified';
            }
          }
        }
        
        setSiteVisitStats(map);
        setSiteVisitRows(rows);
      } catch (e) {
        console.warn('Failed to load site visit stats', e);
        setSiteVisitStats({});
        setSiteVisitRows([]);
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-blue-600/90 to-blue-400/80 dark:from-blue-900 dark:to-blue-700 p-7 rounded-2xl shadow-xl border border-blue-100 dark:border-blue-900">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')} className="hover:bg-blue-100 dark:hover:bg-blue-900/40">
            <ChevronLeft className="h-5 w-5 text-white dark:text-blue-200" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-white to-blue-200 dark:from-blue-200 dark:to-blue-400 bg-clip-text text-transparent tracking-tight">MMP Management</h1>
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
          <Button className="bg-gradient-to-r from-blue-700 to-blue-500 hover:from-blue-800 hover:to-blue-600 text-white shadow-lg hover:shadow-xl transition-all duration-300 px-6 py-2 rounded-full font-semibold" onClick={() => navigate('/mmp/upload')}>
            <Upload className="h-5 w-5 mr-2" />
            Upload MMP
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">Loading MMP files...</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full mb-6 ${isCoordinator ? 'grid-cols-1' : 'grid-cols-3'}`}>
              {!isCoordinator && (
                <TabsTrigger value="new" className="flex items-center gap-2 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 data-[state=active]:shadow-none">
                  New MMPs
                  <Badge variant="secondary">{categorizedMMPs.new.length}</Badge>
                </TabsTrigger>
              )}
              {!isCoordinator && (
                <TabsTrigger value="forwarded" className="flex items-center gap-2 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 data-[state=active]:shadow-none">
                  {isFOM ? 'Forwarded Sites' : 'Forwarded MMPs'}
                  <Badge variant="secondary">{categorizedMMPs.forwarded.length}</Badge>
                </TabsTrigger>
              )}
              <TabsTrigger value="verified" className="flex items-center gap-2 data-[state=active]:bg-blue-200 data-[state=active]:text-blue-900 data-[state=active]:shadow-none">
                {isCoordinator ? 'MMPs to Review' : 'Verified Sites'}
                <Badge variant="secondary">{categorizedMMPs.verified.length}</Badge>
              </TabsTrigger>
            </TabsList>

            {!isCoordinator && (
              <TabsContent value="new">
                {isFOM && (
                  <div className="mb-4 flex flex-wrap gap-2 items-center">
                    <div className="text-sm font-medium text-muted-foreground mr-2">Subcategory:</div>
                    <Button variant={newFomSubTab === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setNewFomSubTab('pending')} className={newFomSubTab === 'pending' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                      MMPs Pending Verification
                      <Badge variant="secondary" className="ml-2">{newFomSubcategories.pending.length}</Badge>
                    </Button>
                    <Button variant={newFomSubTab === 'verified' ? 'default' : 'outline'} size="sm" onClick={() => setNewFomSubTab('verified')} className={newFomSubTab === 'verified' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                      Verified MMPs
                      <Badge variant="secondary" className="ml-2">{newFomSubcategories.verified.length}</Badge>
                    </Button>
                  </div>
                )}
                <MMPList mmpFiles={isFOM ? newFomSubcategories[newFomSubTab] : categorizedMMPs.new} />
              </TabsContent>
            )}

            {!isCoordinator && (
              <TabsContent value="forwarded">
                {(isAdmin || isICT || isFOM) && (
                  <div className="mb-4 flex flex-wrap gap-2 items-center">
                    <div className="text-sm font-medium text-muted-foreground mr-2">Subcategory:</div>
                    <Button variant={forwardedSubTab === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setForwardedSubTab('pending')} className={forwardedSubTab === 'pending' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                      {isFOM ? 'Sites Pending Verification' : 'MMPs Pending Verification'}
                      <Badge variant="secondary" className="ml-2">{forwardedSubcategories.pending.length}</Badge>
                    </Button>
                    <Button variant={forwardedSubTab === 'verified' ? 'default' : 'outline'} size="sm" onClick={() => setForwardedSubTab('verified')} className={forwardedSubTab === 'verified' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                      {isFOM ? 'Verified Sites' : 'Verified MMPs'}
                      <Badge variant="secondary" className="ml-2">{forwardedSubcategories.verified.length}</Badge>
                    </Button>
                  </div>
                )}
                <MMPList mmpFiles={(isAdmin || isICT || isFOM) ? forwardedSubcategories[forwardedSubTab] : categorizedMMPs.forwarded} />
                {isFOM && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold">Site Entries ({forwardedCategorySiteRows.length})</h3>
                      <span className="text-xs text-muted-foreground">Forwarded subcategory: {forwardedSubTab}</span>
                    </div>
                    <MMPCategorySitesTable
                      title="Forwarded Sites"
                      description="Sites contained in forwarded MMPs (from original entries or generated visit records)."
                      rows={forwardedCategorySiteRows}
                      maxHeightPx={520}
                      emptyMessage="No site entries in this forwarded subcategory." />
                  </div>
                )}
              </TabsContent>
            )}

            <TabsContent value="verified">
              {(isAdmin || isICT || isFOM || isCoordinator) && (
                <div className="mb-4 flex flex-wrap gap-2 items-center">
                  <div className="text-sm font-medium text-muted-foreground mr-2">Subcategory:</div>
                  <Button variant={verifiedSubTab === 'newSites' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('newSites')} className={verifiedSubTab === 'newSites' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                    New Sites Verified by Coordinators
                    <Badge variant="secondary" className="ml-2">
                      {verifiedSubTab === 'newSites' 
                        ? verifiedCategorySiteRows.length 
                        : verifiedSubcategories.newSites.length}
                    </Badge>
                  </Button>
                  <Button variant={verifiedSubTab === 'approvedCosted' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('approvedCosted')} className={verifiedSubTab === 'approvedCosted' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                    Approved & Costed
                    <Badge variant="secondary" className="ml-2">{verifiedSubcategories.approvedCosted.length}</Badge>
                  </Button>
                  <Button variant={verifiedSubTab === 'dispatched' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('dispatched')} className={verifiedSubTab === 'dispatched' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                    Dispatched
                    <Badge variant="secondary" className="ml-2">{verifiedSubcategories.dispatched.length}</Badge>
                  </Button>
                  <Button variant={verifiedSubTab === 'completed' ? 'default' : 'outline'} size="sm" onClick={() => setVerifiedSubTab('completed')} className={verifiedSubTab === 'completed' ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300' : ''}>
                    Completed
                    <Badge variant="secondary" className="ml-2">{verifiedSubcategories.completed.length}</Badge>
                  </Button>
                </div>
              )}
              <MMPList mmpFiles={verifiedVisibleMMPs} />
              {(isAdmin || isICT || isFOM || isCoordinator) && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold">Sites by MMP</h3>
                    <span className="text-xs text-muted-foreground">Verified subcategory: {verifiedSubTab}</span>
                  </div>
                  <Accordion type="multiple" className="w-full">
                    {verifiedGroupedRows.map(({ mmp, rows }) => (
                      <AccordionItem key={mmp.id} value={mmp.id}>
                        <AccordionTrigger>
                          <div className="flex items-center gap-3 text-left">
                            <span className="font-medium">{mmp.name}</span>
                            <Badge variant="secondary">{rows.length} sites</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <MMPCategorySitesTable
                            title={`Sites for ${mmp.name}`}
                            description={`MMP ID: ${mmp.mmpId || mmp.id}`}
                            rows={rows}
                            maxHeightPx={520}
                            emptyMessage="No sites for this MMP in the current subcategory." />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
      {(isAdmin || isICT) && (
        <BulkClearForwardedDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen} />
      )}
    </div>
  );
};

export default MMP;
