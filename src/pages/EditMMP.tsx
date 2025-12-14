
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAuthorization } from '@/hooks/use-authorization';
import MMPOverallInformation from '@/components/MMPOverallInformation';
import MMPVersionHistory from '@/components/MMPVersionHistory';
import MMPSiteInformation from '@/components/MMPSiteInformation';
import MMPSiteEntriesTable from '@/components/mmp/MMPSiteEntriesTable';
import { ActivityManager } from '@/components/project/activity/ActivityManager';
import { useToast } from '@/hooks/use-toast';
import FieldTeamMapPermissions from '@/components/map/FieldTeamMapPermissions';
import { supabase } from '@/integrations/supabase/client';

const EditMMP: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getMmpById, updateMMP, refreshMMPFiles } = useMMP();
  const { checkPermission, hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [mmpFile, setMmpFile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>('details');

  const isAdmin = hasAnyRole(['admin']);
  const isFOM = hasAnyRole(['fom', 'Field Operation Manager (FOM)']);
  const isCoordinator = hasAnyRole(['coordinator']);
  const canEdit = checkPermission('mmp', 'update') || isAdmin || isCoordinator || isFOM;

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
    if (initialTab) setActiveTab(initialTab);
  }, [searchParams]);

  useEffect(() => {
    if (id) {
      console.log("Looking for MMP with ID:", id);
      const mmp = getMmpById(id);
      if (mmp) {
        console.log("Retrieved MMP for editing:", mmp);
        setMmpFile(mmp);
        setLoading(false);
      } else {
        toast({
          title: "MMP Not Found",
          description: "The MMP you're trying to edit does not exist.",
          variant: "destructive"
        });
        navigate("/mmp");
      }
    }
  }, [id, getMmpById, navigate, toast]);

  const handleUpdate = (updatedMMP: any) => {
    console.log("Updating MMP with:", updatedMMP);
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
      // Persist each edited site directly to mmp_site_entries
      for (const site of sites) {
        // Migrate data from additional_data to columns if needed
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

        // Remove undefined to avoid overwriting with nulls
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

      // Refresh context to ensure real-time updates propagate
      await refreshMMPFiles();

      // Update local state with edited sites (optimistic) and notify
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

  if (loading) {
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
          <div>
            <h1 className="text-2xl font-bold">{mmpFile?.name}</h1>
            <p className="text-muted-foreground">{mmpFile?.mmpId}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Edit MMP</CardTitle>
            <CardDescription>Update details for MMP: {mmpFile?.mmpId}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList>
                <TabsTrigger value="details">MMP Details</TabsTrigger>
                <TabsTrigger value="sites">Sites</TabsTrigger>
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
    </FieldTeamMapPermissions>
  );
};

export default EditMMP;
