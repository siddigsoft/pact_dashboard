import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { CheckCircle, Clock, FileCheck, XCircle, ArrowLeft, Eye, Edit, Search, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const { updateMMP } = useMMP();
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteVisit[]>([]);
  const [activeTab, setActiveTab] = useState('new');
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  
  // Badge counts - loaded separately for performance
  const [newSitesCount, setNewSitesCount] = useState(0);
  const [verifiedSitesCount, setVerifiedSitesCount] = useState(0);
  const [approvedSitesCount, setApprovedSitesCount] = useState(0);
  const [completedSitesCount, setCompletedSitesCount] = useState(0);
  const [rejectedSitesCount, setRejectedSitesCount] = useState(0);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load badge counts for all tabs (always loaded)
  useEffect(() => {
    if (!currentUser?.id) return;
    
    const loadBadgeCounts = async () => {
      try {
        const userId = currentUser.id;
        
        // Load all counts in parallel using database count queries
        const [newCount, verifiedCount, approvedCount, completedCount, rejectedCount] = await Promise.all([
          supabase
            .from('site_visits')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .or('status.eq.assigned,status.eq.inProgress'),
          supabase
            .from('site_visits')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .eq('status', 'verified'),
          supabase
            .from('site_visits')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .eq('status', 'approved'),
          supabase
            .from('site_visits')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .eq('status', 'completed'),
          supabase
            .from('site_visits')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .eq('status', 'rejected')
        ]);

        setNewSitesCount(newCount.count || 0);
        setVerifiedSitesCount(verifiedCount.count || 0);
        setApprovedSitesCount(approvedCount.count || 0);
        setCompletedSitesCount(completedCount.count || 0);
        setRejectedSitesCount(rejectedCount.count || 0);
      } catch (error) {
        console.error('Error loading badge counts:', error);
      }
    };

    loadBadgeCounts();
  }, [currentUser?.id]);

  // Load sites for active tab only
  useEffect(() => {
    loadSites();
    // Reset search and pagination when tab changes
    setSearchQuery('');
    setCurrentPage(1);
  }, [currentUser, activeTab]);

  const loadSites = async () => {
    if (!currentUser?.id) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('site_visits')
        .select('*')
        .eq('assigned_to', currentUser.id);

      // Filter by status based on active tab at database level
      switch (activeTab) {
        case 'new':
          query = query.or('status.eq.assigned,status.eq.inProgress');
          break;
        case 'verified':
          query = query.eq('status', 'verified');
          break;
        case 'approved':
          query = query.eq('status', 'approved');
          break;
        case 'completed':
          query = query.eq('status', 'completed');
          break;
        case 'rejected':
          query = query.eq('status', 'rejected');
          break;
      }

      const { data, error } = await query
        .order('assigned_at', { ascending: false })
        .limit(1000); // Limit for performance

      if (error) throw error;
      setSites(data || []);
      setCurrentPage(1); // Reset pagination when tab changes
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

  const handleVerifySite = async (siteId: string, notes?: string) => {
    try {
      const updateData: any = {
        status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
      };
      
      // Add verification notes if provided
      if (notes) {
        updateData.verification_notes = notes;
      }

      const { error } = await supabase
        .from('site_visits')
        .update(updateData)
        .eq('id', siteId);

      if (error) throw error;
      try {
        const site = sites.find(s => s.id === siteId);
        if (site?.mmp_id && site?.site_code) {
          // Get current site entry to check if cost exists
          const { data: currentEntry } = await supabase
            .from('mmp_site_entries')
            .select('cost, additional_data')
            .eq('mmp_file_id', site.mmp_id)
            .eq('site_code', site.site_code)
            .single();

          const verifiedAt = new Date().toISOString();
          const verifiedBy = currentUser?.username || currentUser?.fullName || currentUser?.email || 'System';
          
          const mmpUpdateData: any = { 
            status: 'Verified',
            verified_at: verifiedAt,
            verified_by: verifiedBy
          };
          if (notes) {
            mmpUpdateData.verification_notes = notes;
          }
          
          // Set default fees if cost is 0, null, or undefined
          // Default: Enumerator fees ($20) + Transport fees ($10 minimum) = $30
          const currentCost = currentEntry?.cost;
          const additionalData = currentEntry?.additional_data || {};
          const currentEnumFee = additionalData?.enumerator_fee;
          const currentTransFee = additionalData?.transport_fee;
          
          if (!currentCost || currentCost === 0 || currentCost === null) {
            // Set default fees in additional_data
            additionalData.enumerator_fee = 20; // $20 enumerator fee
            additionalData.transport_fee = 10; // $10 transport fee (minimum)
            mmpUpdateData.cost = 30; // Total: $30
            mmpUpdateData.additional_data = additionalData;
          } else if ((!currentEnumFee || currentEnumFee === 0) && (!currentTransFee || currentTransFee === 0)) {
            // If cost exists but fees don't, set fees based on cost
            // If cost is 30 (default), split it
            if (currentCost === 30) {
              additionalData.enumerator_fee = 20;
              additionalData.transport_fee = 10;
            } else {
              // Otherwise, try to infer or use defaults
              additionalData.enumerator_fee = currentCost - 10;
              additionalData.transport_fee = 10;
            }
            mmpUpdateData.additional_data = additionalData;
          }
          
          // Also store verification info in additional_data for backward compatibility
          additionalData.verified_at = verifiedAt;
          additionalData.verified_by = verifiedBy;
          mmpUpdateData.additional_data = additionalData;
          
          await supabase
            .from('mmp_site_entries')
            .update(mmpUpdateData)
            .eq('mmp_file_id', site.mmp_id)
            .eq('site_code', site.site_code);

          // Mark MMP as coordinator-verified when first site is verified
          // Get current MMP workflow
          const { data: mmpData, error: mmpError } = await supabase
            .from('mmp_files')
            .select('workflow, status')
            .eq('id', site.mmp_id)
            .single();

          if (!mmpError && mmpData) {
            const workflow = (mmpData.workflow as any) || {};
            const isAlreadyVerified = workflow.coordinatorVerified === true;
            
            // Only update if not already marked as coordinator-verified
            if (!isAlreadyVerified) {
              const updatedWorkflow = {
                ...workflow,
                coordinatorVerified: true,
                coordinatorVerifiedAt: new Date().toISOString(),
                coordinatorVerifiedBy: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
                currentStage: workflow.currentStage === 'awaitingCoordinatorVerification' ? 'verified' : (workflow.currentStage || 'verified'),
                lastUpdated: new Date().toISOString()
              };

              // Update MMP workflow - keep status as 'pending' so it shows in "New Sites Verified by Coordinators"
              await updateMMP(site.mmp_id, {
                workflow: updatedWorkflow,
                status: mmpData.status === 'pending' ? 'pending' : 'pending' // Ensure it's pending
              });
            }
          }
        }
      } catch (syncErr) {
        console.warn('Failed to sync mmp_site_entries on verify:', syncErr);
      }

      toast({
        title: 'Site Verified',
        description: 'The site has been marked as verified.',
      });

      // Reload sites and badge counts
      loadSites();
      // Reload badge counts
      if (currentUser?.id) {
        const userId = currentUser.id;
        const [newCount, verifiedCount] = await Promise.all([
          supabase
            .from('site_visits')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .or('status.eq.assigned,status.eq.inProgress'),
          supabase
            .from('site_visits')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .eq('status', 'verified')
        ]);
        setNewSitesCount(newCount.count || 0);
        setVerifiedSitesCount(verifiedCount.count || 0);
      }
      setActiveTab('verified');
      setVerifyDialogOpen(false);
      setVerificationNotes('');
      setSelectedSiteId(null);
    } catch (error) {
      console.error('Error verifying site:', error);
      toast({
        title: 'Error',
        description: 'Failed to verify site. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleRejectSite = async (siteId: string, notes?: string) => {
    try {
      const updateData: any = {
        status: 'rejected',
        verified_at: new Date().toISOString(),
        verified_by: currentUser?.username || currentUser?.fullName || currentUser?.email || 'System',
      };
      
      // Add verification notes if provided
      if (notes) {
        updateData.verification_notes = notes;
      }

      const { error } = await supabase
        .from('site_visits')
        .update(updateData)
        .eq('id', siteId);

      if (error) throw error;
      try {
        const site = sites.find(s => s.id === siteId);
        if (site?.mmp_id && site?.site_code) {
          const mmpUpdateData: any = { status: 'Rejected' };
          if (notes) {
            mmpUpdateData.verification_notes = notes;
          }
          await supabase
            .from('mmp_site_entries')
            .update(mmpUpdateData)
            .eq('mmp_file_id', site.mmp_id)
            .eq('site_code', site.site_code);
        }
      } catch (syncErr) {
        console.warn('Failed to sync mmp_site_entries on reject:', syncErr);
      }

      toast({
        title: 'Site Rejected',
        description: 'The site has been marked as rejected.',
      });

      // Reload sites and badge counts
      loadSites();
      // Reload badge counts
      if (currentUser?.id) {
        const userId = currentUser.id;
        const [newCount, rejectedCount] = await Promise.all([
          supabase
            .from('site_visits')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .or('status.eq.assigned,status.eq.inProgress'),
          supabase
            .from('site_visits')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_to', userId)
            .eq('status', 'rejected')
        ]);
        setNewSitesCount(newCount.count || 0);
        setRejectedSitesCount(rejectedCount.count || 0);
      }
      setRejectDialogOpen(false);
      setVerificationNotes('');
      setSelectedSiteId(null);
    } catch (error) {
      console.error('Error rejecting site:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject site. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Filter sites by search query (client-side filtering for search)
  const filteredSites = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return sites;
    }
    const q = debouncedSearchQuery.toLowerCase();
    return sites.filter(site => 
      site.site_name?.toLowerCase().includes(q) ||
      site.site_code?.toLowerCase().includes(q) ||
      site.state?.toLowerCase().includes(q) ||
      site.locality?.toLowerCase().includes(q) ||
      site.activity?.toLowerCase().includes(q) ||
      site.main_activity?.toLowerCase().includes(q) ||
      site.hub_office?.toLowerCase().includes(q)
    );
  }, [sites, debouncedSearchQuery]);

  // Paginate filtered results
  const paginatedSites = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredSites.slice(startIndex, endIndex);
  }, [filteredSites, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredSites.length / itemsPerPage);

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

        {site.verification_notes && (
          <div className="mb-3 p-2 bg-blue-50 rounded text-sm border border-blue-200">
            <p className="font-medium text-blue-900 mb-1">Verification Notes:</p>
            <p className="text-blue-800">{site.verification_notes}</p>
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
                  onClick={() => {
                    setSelectedSiteId(site.id);
                    setVerificationNotes('');
                    setVerifyDialogOpen(true);
                  }}
                  className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  Verify
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setSelectedSiteId(site.id);
                    setVerificationNotes('');
                    setRejectDialogOpen(true);
                  }}
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
      <div className="mb-6 flex items-center justify-between bg-blue-600 text-white p-5 rounded-2xl shadow">
        <div>
          <h1 className="text-3xl font-bold">Site Verification</h1>
          <p className="mt-1 text-blue-100/90">Review and verify sites assigned to you</p>
        </div>
        <Button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 bg-white text-blue-600 hover:bg-white/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 gap-2">
          <TabsTrigger value="new" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <span>New Sites</span>
            <Badge variant="secondary">{newSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="verified" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <span>Verified</span>
            <Badge variant="secondary">{verifiedSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <span>Approved</span>
            <Badge variant="secondary">{approvedSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <span>Completed</span>
            <Badge variant="secondary">{completedSitesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex items-center justify-center gap-2 rounded-md py-2 px-3 bg-gray-100 hover:bg-gray-200 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <span>Rejected</span>
            <Badge variant="secondary">{rejectedSitesCount}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>New Sites for Verification</CardTitle>
                <div className="relative w-full sm:w-auto max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search sites..."
                    className="pl-8 w-full sm:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredSites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>{searchQuery ? 'No sites match your search.' : 'No new sites assigned to you for verification.'}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedSites.map(site => renderSiteCard(site, true))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredSites.length)} of {filteredSites.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="text-sm">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verified" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Verified Sites</CardTitle>
                <div className="relative w-full sm:w-auto max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search sites..."
                    className="pl-8 w-full sm:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredSites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>{searchQuery ? 'No sites match your search.' : 'No verified sites yet.'}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedSites.map(site => renderSiteCard(site, false))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredSites.length)} of {filteredSites.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="text-sm">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Approved Sites</CardTitle>
                <div className="relative w-full sm:w-auto max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search sites..."
                    className="pl-8 w-full sm:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredSites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileCheck className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>{searchQuery ? 'No sites match your search.' : 'Approved sites will appear here.'}</p>
                  {!searchQuery && <p className="text-sm mt-2">This feature is coming soon.</p>}
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedSites.map(site => renderSiteCard(site, false))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredSites.length)} of {filteredSites.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="text-sm">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Completed Sites</CardTitle>
                <div className="relative w-full sm:w-auto max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search sites..."
                    className="pl-8 w-full sm:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredSites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>{searchQuery ? 'No sites match your search.' : 'Completed sites will appear here.'}</p>
                  {!searchQuery && <p className="text-sm mt-2">This feature is coming soon.</p>}
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedSites.map(site => renderSiteCard(site, false))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredSites.length)} of {filteredSites.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="text-sm">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Rejected Sites</CardTitle>
                <div className="relative w-full sm:w-auto max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search sites..."
                    className="pl-8 w-full sm:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredSites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <XCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>{searchQuery ? 'No sites match your search.' : 'No rejected sites.'}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedSites.map(site => renderSiteCard(site, false))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredSites.length)} of {filteredSites.length}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="text-sm">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Verify Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Site</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4">Are you sure you want to verify this site?</p>
            <div className="mt-4">
              <label htmlFor="verification-notes" className="text-sm font-medium mb-2 block">
                Verification Notes (Optional)
              </label>
              <Textarea
                id="verification-notes"
                placeholder="Add any notes about the verification..."
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                className="mt-1"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setVerifyDialogOpen(false);
              setVerificationNotes('');
              setSelectedSiteId(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedSiteId) {
                  handleVerifySite(selectedSiteId, verificationNotes);
                }
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Site</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4">Are you sure you want to reject this site?</p>
            <div className="mt-4">
              <label htmlFor="rejection-notes" className="text-sm font-medium mb-2 block">
                Rejection Notes (Optional)
              </label>
              <Textarea
                id="rejection-notes"
                placeholder="Add any notes about the rejection..."
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                className="mt-1"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setRejectDialogOpen(false);
              setVerificationNotes('');
              setSelectedSiteId(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedSiteId) {
                  handleRejectSite(selectedSiteId, verificationNotes);
                }
              }}
              variant="destructive"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CoordinatorSites;
