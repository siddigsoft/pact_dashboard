
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAuthorization } from '@/hooks/use-authorization';
import MMPOverallInformation from '@/components/MMPOverallInformation';
import MMPVersionHistory from '@/components/MMPVersionHistory';
import MMPSiteInformation from '@/components/MMPSiteInformation';
import MMPSiteEntriesTable from '@/components/mmp/MMPSiteEntriesTable';
import MMPPartialUpdate from '@/components/mmp/MMPPartialUpdate';
import MMPFileUpload from '@/components/mmp/MMPFileUpload';
import { ActivityManager } from '@/components/project/activity/ActivityManager';
import { useToast } from '@/hooks/use-toast';
import FieldTeamMapPermissions from '@/components/map/FieldTeamMapPermissions';
import { supabase } from '@/integrations/supabase/client';
import { ensureValidSession } from '@/lib/session-health';

const EditMMP: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getMmpById, updateMMP, refreshMMPFiles, loading: mmpContextLoading, deleteMMP, fetchSiteEntriesForMMP } = useMMP();
  const { checkPermission, hasAnyRole, isSuperAdmin } = useAuthorization();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [mmpFile, setMmpFile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('upload');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [siteEntriesLoaded, setSiteEntriesLoaded] = useState(false);
  const notFoundRef = useRef(false);

  const isAdmin = hasAnyRole(['admin']);
  const isFOM = hasAnyRole(['fom', 'Field Operation Manager (FOM)']);
  const isCoordinator = hasAnyRole(['coordinator']);
  const isSupervisor = hasAnyRole(['supervisor', 'hubsupervisor']);
  const canDelete = isSuperAdmin() || isAdmin;
  const canEdit = checkPermission('mmp', 'update') || isAdmin || isCoordinator || isSupervisor || isFOM || isSuperAdmin();

  if (!canEdit) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to edit MMP files.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/mmp')} className="w-full">
              Back to MMP List
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleGoBack = () => {
    navigate('/mmp');
  };

  useEffect(() => {
    const initialTab = searchParams.get('tab');
    if (initialTab === 'upload') setActiveTab('upload');
  }, [searchParams]);

  // Wait for context to finish loading before declaring "not found"
  useEffect(() => {
    if (!id) return;
    if (mmpContextLoading) return; // still loading — do not navigate away yet

    const mmp = getMmpById(id);
    if (mmp) {
      setMmpFile(mmp);
      setLoading(false);
      notFoundRef.current = false;
    } else if (!notFoundRef.current) {
      notFoundRef.current = true;
      toast({
        title: "MMP Not Found",
        description: "The MMP you're trying to edit does not exist.",
        variant: "destructive"
      });
      navigate("/mmp");
    }
  }, [id, getMmpById, mmpContextLoading, navigate, toast]);

  // Load site entries from Supabase when the Sites tab is opened (lazy)
  const loadSiteEntries = useCallback(async () => {
    if (!id || siteEntriesLoaded) return;
    setSiteEntriesLoaded(true);
    try {
      const entries = await fetchSiteEntriesForMMP(id);
      setMmpFile((prev: any) => prev ? { ...prev, siteEntries: entries } : prev);
    } catch (e) {
      console.warn('EditMMP: could not load site entries', e);
    }
  }, [id, siteEntriesLoaded, fetchSiteEntriesForMMP]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'sites') loadSiteEntries();
  };

  const handleUpdate = (updatedMMP: any) => {
    if (updateMMP && id) {
      updateMMP(id, updatedMMP);
      setMmpFile(updatedMMP);
      toast({
        title: "MMP Updated",
        description: "The MMP has been successfully updated.",
      });
    }
  };

  const handleActivitiesChange = (activities: any[]) => {
    if (mmpFile && updateMMP) {
      const updatedMMP = {
        ...mmpFile,
        activities: activities
      };
      updateMMP(id!, updatedMMP);
      setMmpFile(updatedMMP);
      toast({
        title: "Activities Updated",
        description: "The activities have been successfully updated.",
      });
    }
  };

  const handleUpdateSites = async (sites: any[]): Promise<boolean> => {
    if (!mmpFile || !id) return false;
    try {
      const session = await ensureValidSession();
      if (!session.success) return false;

      for (const site of sites) {
        const ad = site.additionalData || site.additional_data || {};
        const updateData: any = {
          site_name: site.site_name || site.siteName || ad['Site Name'] || ad['Site Name:'] || null,
          site_code: site.site_code || site.siteCode || ad['Site Code'] || null,
          hub_office: site.hub_office || site.hubOffice || ad['Hub Office'] || ad['Hub Office:'] || null,
          state: site.state || ad['State'] || ad['State:'] || null,
          locality: site.locality || ad['Locality'] || ad['Locality:'] || null,
          cp_name: site.cp_name || site.cpName || ad['CP Name'] || ad['CP name'] || ad['CP Name:'] || null,
          activity_at_site: site.activity_at_site || site.siteActivity || ad['Activity at Site'] || ad['Activity at the site'] || null,
          monitoring_by: site.monitoring_by || site.monitoringBy || ad['Monitoring By'] || ad['monitoring by'] || null,
          survey_tool: site.survey_tool || site.surveyTool || ad['Survey Tool'] || ad['Survey under Master tool'] || null,
          use_market_diversion: site.use_market_diversion !== undefined ? site.use_market_diversion : (site.useMarketDiversion !== undefined ? site.useMarketDiversion : (ad['Use Market Diversion Monitoring'] === 'Yes' || ad['Use Market Diversion Monitoring'] === 'true' || null)),
          use_warehouse_monitoring: site.use_warehouse_monitoring !== undefined ? site.use_warehouse_monitoring : (site.useWarehouseMonitoring !== undefined ? site.useWarehouseMonitoring : (ad['Use Warehouse Monitoring'] === 'Yes' || ad['Use Warehouse Monitoring'] === 'true' || null)),
          visit_date: site.visit_date || site.visitDate || ad['Visit Date'] || null,
          comments: site.comments || ad['Comments'] || null,
          cost: site.cost !== undefined ? site.cost : (ad['Cost'] ? Number(ad['Cost']) : null),
          enumerator_fee: site.enumerator_fee !== undefined ? site.enumerator_fee : (ad['Enumerator Fee'] ? Number(ad['Enumerator Fee']) : null),
          transport_fee: site.transport_fee !== undefined ? site.transport_fee : (ad['Transport Fee'] ? Number(ad['Transport Fee']) : null),
          status: site.status || ad['Status'] || ad['Status:'] || 'Pending',
          verification_notes: site.verification_notes || site.verificationNotes || ad['Verification Notes'] || ad['Verification Notes:'] || null,
          verified_by: site.verified_by || site.verifiedBy || ad['Verified By'] || ad['Verified By:'] || null,
          verified_at: site.verified_at || site.verifiedAt || (ad['Verified At'] ? new Date(ad['Verified At']).toISOString() : null),
          dispatched_by: site.dispatched_by || site.dispatchedBy || ad['Dispatched By'] || null,
          dispatched_at: site.dispatched_at || site.dispatchedAt || (ad['Dispatched At'] ? new Date(ad['Dispatched At']).toISOString() : null),
          additional_data: site.additionalData || site.additional_data || {},
        };

        Object.keys(updateData).forEach((k) => {
          if (typeof updateData[k] === 'undefined') delete updateData[k];
        });

        if (site.id) {
          await supabase.from('mmp_site_entries').update(updateData).eq('id', site.id);
        } else {
          await supabase
            .from('mmp_site_entries')
            .insert([{ ...updateData, mmp_file_id: id }]);
        }
      }

      await refreshMMPFiles();

      const updatedMMP = { ...mmpFile, siteEntries: sites };
      setMmpFile(updatedMMP);
      toast({
        title: 'Site Entries Updated',
        description: 'Your changes have been saved.',
      });
      return true;
    } catch (e) {
      console.error('Failed to save site entries directly to mmp_site_entries:', e);
      toast({
        title: 'Save Failed',
        description: 'We could not persist your changes. Please check your permissions or try again.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const handleDeleteMMP = async () => {
    if (!id || !canDelete) return;
    setIsDeleting(true);
    try {
      await deleteMMP(id);
      toast({
        title: 'MMP Deleted',
        description: `${mmpFile?.name || 'This MMP'} has been permanently deleted.`,
      });
      navigate('/mmp');
    } catch (e: any) {
      toast({
        title: 'Delete Failed',
        description: e?.message || 'Could not delete this MMP. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (loading || mmpContextLoading) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center">
              Loading MMP information...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const actualSiteCount = mmpFile?.siteEntries?.length ?? 0;
  const declaredSiteCount = mmpFile?.entries ?? mmpFile?.totalSites ?? 0;

  return (
    <FieldTeamMapPermissions resource="mmp" action="update">
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleGoBack}
            className="mr-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{mmpFile?.name}</h1>
            <p className="text-muted-foreground">{mmpFile?.mmpId}</p>
          </div>
          {canDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete MMP
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Edit MMP</CardTitle>
            <CardDescription>Update details for MMP: {mmpFile?.mmpId}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
              <TabsList>
                <TabsTrigger value="upload">Upload Update</TabsTrigger>
                <TabsTrigger value="details">MMP Details</TabsTrigger>
                <TabsTrigger value="sites">
                  Sites
                  {actualSiteCount > 0 && (
                    <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                      {actualSiteCount}
                    </span>
                  )}
                  {actualSiteCount === 0 && declaredSiteCount > 0 && (
                    <span className="ml-1.5 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                      {declaredSiteCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="partial-update">Partial Update</TabsTrigger>
                <TabsTrigger value="activities">Activities</TabsTrigger>
                <TabsTrigger value="history">Version History</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <MMPOverallInformation
                  mmpFile={mmpFile}
                  onUpdate={handleUpdate}
                  editable={true}
                />
              </TabsContent>

              <TabsContent value="sites" className="space-y-4">
                <MMPSiteInformation
                  mmpFile={mmpFile}
                  showVerificationButton={false}
                  onUpdateMMP={handleUpdate}
                />
                <MMPSiteEntriesTable
                  siteEntries={mmpFile?.siteEntries || []}
                  editable={true}
                  onUpdateSites={handleUpdateSites}
                />
              </TabsContent>

              <TabsContent value="partial-update" className="space-y-4">
                <MMPPartialUpdate
                  mmpFile={mmpFile}
                  onComplete={async () => {
                    await refreshMMPFiles();
                    const updated = getMmpById(id!);
                    if (updated) setMmpFile(updated);
                    setSiteEntriesLoaded(false);
                    setTimeout(() => loadSiteEntries(), 500);
                  }}
                />
              </TabsContent>

              <TabsContent value="upload" className="space-y-4">
                <MMPFileUpload existingMmp={mmpFile} />
              </TabsContent>

              <TabsContent value="activities" className="space-y-4">
                <ActivityManager
                  activities={mmpFile.activities || []}
                  onActivitiesChange={handleActivitiesChange}
                  projectType={mmpFile.type}
                />
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <MMPVersionHistory mmpFile={mmpFile} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete MMP
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You are about to permanently delete <strong>{mmpFile?.name}</strong> ({mmpFile?.mmpId}).
              </p>
              <p className="text-destructive font-medium">
                This will also reverse any wallet transactions linked to accepted sites in this MMP. This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMMP}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Yes, Delete MMP'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FieldTeamMapPermissions>
  );
};

export default EditMMP;
