import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { CheckCircle, Clock, FileCheck, XCircle, ArrowLeft, Eye, Edit } from 'lucide-react';
import { format } from 'date-fns';

interface SiteVisit {
  id: string;
  site_name: string;
  site_code: string;
  status: string;
  state: string;
  locality: string;
  activity: string;
  main_activity: string;
  due_date: string;
  assigned_at: string;
  notes: string;
  mmp_id: string;
  hub_office: string;
  verified_at?: string;
  verified_by?: string;
  verification_notes?: string;
}

const CoordinatorSites: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteVisit[]>([]);
  const [activeTab, setActiveTab] = useState('new');

  useEffect(() => {
    loadSites();
  }, [currentUser]);

  const loadSites = async () => {
    if (!currentUser?.id) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('site_visits')
        .select('*')
        .eq('assigned_to', currentUser.id)
        .order('assigned_at', { ascending: false });

      if (error) throw error;
      setSites(data || []);
    } catch (error) {
      console.error('Error loading sites:', error);
      toast({
        title: 'Error',
        description: 'Failed to load sites. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySite = async (siteId: string) => {
    try {
      const { error } = await supabase
        .from('site_visits')
        .update({
          status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by: currentUser?.id || null,
        })
        .eq('id', siteId);

      if (error) throw error;

      toast({
        title: 'Site Verified',
        description: 'The site has been marked as verified.',
      });

      // Reload sites
      loadSites();
    } catch (error) {
      console.error('Error verifying site:', error);
      toast({
        title: 'Error',
        description: 'Failed to verify site. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleRejectSite = async (siteId: string) => {
    try {
      const { error } = await supabase
        .from('site_visits')
        .update({
          status: 'rejected',
          verified_at: new Date().toISOString(),
          verified_by: currentUser?.id || null,
        })
        .eq('id', siteId);

      if (error) throw error;

      toast({
        title: 'Site Rejected',
        description: 'The site has been marked as rejected.',
      });

      // Reload sites
      loadSites();
    } catch (error) {
      console.error('Error rejecting site:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject site. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Filter sites by status
  const newSites = sites.filter(s => s.status === 'assigned' || s.status === 'inProgress');
  const verifiedSites = sites.filter(s => s.status === 'verified');
  const approvedSites = sites.filter(s => s.status === 'approved');
  const completedSites = sites.filter(s => s.status === 'completed');
  const rejectedSites = sites.filter(s => s.status === 'rejected');

  const renderSiteCard = (site: SiteVisit, showActions: boolean = true) => (
    <Card key={site.id} className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-lg">{site.site_name}</h3>
            <p className="text-sm text-muted-foreground">Code: {site.site_code}</p>
          </div>
          <Badge variant={
            site.status === 'verified' ? 'default' :
            site.status === 'approved' ? 'success' :
            site.status === 'completed' ? 'success' :
            site.status === 'rejected' ? 'destructive' :
            'secondary'
          }>
            {site.status === 'assigned' ? 'New' : 
             site.status === 'inProgress' ? 'In Progress' : 
             site.status.charAt(0).toUpperCase() + site.status.slice(1)}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
          <div>
            <span className="text-muted-foreground">State:</span>
            <p className="font-medium">{site.state}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Locality:</span>
            <p className="font-medium">{site.locality}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Activity:</span>
            <p className="font-medium">{site.main_activity || site.activity}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Due Date:</span>
            <p className="font-medium">{site.due_date ? format(new Date(site.due_date), 'MMM d, yyyy') : 'N/A'}</p>
          </div>
        </div>

        {site.hub_office && (
          <div className="mb-3 text-sm">
            <span className="text-muted-foreground">Hub Office:</span>
            <span className="ml-2 font-medium">{site.hub_office}</span>
          </div>
        )}

        {site.notes && (
          <div className="mb-3 p-2 bg-muted rounded text-sm">
            <p className="text-muted-foreground">{site.notes}</p>
          </div>
        )}

        {site.verified_at && (
          <div className="mb-3 text-sm">
            <span className="text-muted-foreground">Verified:</span>
            <span className="ml-2">{format(new Date(site.verified_at), 'MMM d, yyyy h:mm a')}</span>
          </div>
        )}

        {showActions && (
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/site-visits/${site.id}`)}
              className="flex items-center gap-1"
            >
              <Eye className="h-4 w-4" />
              View Details
            </Button>
            
            {site.status === 'assigned' || site.status === 'inProgress' ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/site-visits/${site.id}/edit`)}
                  className="flex items-center gap-1"
                >
                  <Edit className="h-4 w-4" />
                  Review & Edit
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleVerifySite(site.id)}
                  className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  Verify
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleRejectSite(site.id)}
                  className="flex items-center gap-1"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
              </>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading sites...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Site Verification</h1>
          <p className="text-muted-foreground mt-1">Review and verify sites assigned to you</p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="new" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            New Sites
            <Badge variant="secondary">{newSites.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="verified" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Verified
            <Badge variant="secondary">{verifiedSites.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            Approved
            <Badge variant="secondary">{approvedSites.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Completed
            <Badge variant="secondary">{completedSites.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            Rejected
            <Badge variant="secondary">{rejectedSites.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>New Sites for Verification</CardTitle>
            </CardHeader>
            <CardContent>
              {newSites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No new sites assigned to you for verification.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {newSites.map(site => renderSiteCard(site, true))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verified" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Verified Sites</CardTitle>
            </CardHeader>
            <CardContent>
              {verifiedSites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No verified sites yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {verifiedSites.map(site => renderSiteCard(site, false))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Approved Sites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <FileCheck className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Approved sites will appear here.</p>
                <p className="text-sm mt-2">This feature is coming soon.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Completed Sites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Completed sites will appear here.</p>
                <p className="text-sm mt-2">This feature is coming soon.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rejected Sites</CardTitle>
            </CardHeader>
            <CardContent>
              {rejectedSites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <XCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No rejected sites.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {rejectedSites.map(site => renderSiteCard(site, false))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CoordinatorSites;
