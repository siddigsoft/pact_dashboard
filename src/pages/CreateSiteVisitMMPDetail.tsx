import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppContext';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Check, ChevronLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SiteEntryCard } from '@/components/site-visit/SiteEntryCard';
import { MMPInfoCard } from '@/components/site-visit/MMPInfoCard';
import { Separator } from '@/components/ui/separator';
import { useMMP } from '@/context/mmp/MMPContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';

const CreateSiteVisitMMPDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser, calculateDistanceFee } = useAppContext();
  const { getMmpById } = useMMP();
  const { createSiteVisit } = useSiteVisitContext();
  
  const [loading, setLoading] = useState(true);
  const [mmpData, setMmpData] = useState<any>(null);
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [creating, setCreating] = useState(false);
  const [feeCurrency, setFeeCurrency] = useState<string>('SDG');
  const [distanceFeeAmount, setDistanceFeeAmount] = useState<string>('');
  const [complexityFeeAmount, setComplexityFeeAmount] = useState<string>('0');
  const [urgencyFeeAmount, setUrgencyFeeAmount] = useState<string>('0');

  const toAmount = (val: any) => {
    const n = typeof val === 'string' ? parseFloat(val) : Number(val || 0);
    return isNaN(n) ? 0 : n;
  };
  
  useEffect(() => {
    if (!id) {
      setLoading(false);
      toast({
        title: "Invalid URL",
        description: "Missing MMP id in the URL.",
        variant: "destructive",
      });
      navigate("/site-visits/create/mmp");
      return;
    }

    const mmp = getMmpById(id);
    if (mmp) {
      setMmpData(mmp);
      console.log("MMP data loaded:", mmp);
      const locAny = (mmp as any)?.location || {};
      const df = calculateDistanceFee(Number(locAny.latitude) || 0, Number(locAny.longitude) || 0) || 0;
      setDistanceFeeAmount(String(df));
    } else {
      toast({
        title: "MMP not found",
        description: "The requested MMP could not be found.",
        variant: "destructive",
      });
      navigate("/site-visits/create/mmp");
    }
    setLoading(false);
  }, [id]);

  if (!currentUser || !['admin', 'ict'].includes(currentUser.role)) {
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
            <Button
              variant="outline"
              onClick={() => navigate('/site-visits')}
              className="w-full"
            >
              Return to Site Visits
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading MMP data...</span>
      </div>
    );
  }

  const handleSiteToggle = (siteId: string) => {
    setSelectedSites(prev =>
      prev.includes(siteId)
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId]
    );
  };

  const handleSelectAll = () => {
    if (mmpData?.siteEntries?.length === selectedSites.length) {
      setSelectedSites([]);
    } else {
      setSelectedSites(mmpData?.siteEntries?.map((site: any) => site.id) || []);
    }
  };

  const handleCreateSiteVisits = async () => {
    if (selectedSites.length === 0) {
      toast({
        title: "No sites selected",
        description: "Please select at least one site to create visits.",
        variant: "destructive",
      });
      return;
    }

    try {
      setCreating(true);

      const selectedSiteObjects = (mmpData?.siteEntries || []).filter((s: any) =>
        selectedSites.includes(s.id)
      );

      const results = await Promise.all(
        selectedSiteObjects.map(async (site: any) => {
          const location = mmpData?.location || { address: '', latitude: 0, longitude: 0, region: mmpData?.region || '' };
          const computedDistanceFee = calculateDistanceFee(Number(location.latitude) || 0, Number(location.longitude) || 0) || 0;

          const hub = site.hubOffice || site.siteCode || site.site_code || '';
          const cpName = site.cpName || '';
          const siteActivity = site.siteActivity || site.activity || '';
          const visitType = site.visitType || 'regular';
          const comments = site.comments || '';

          const distanceFeeVal = toAmount(distanceFeeAmount) || computedDistanceFee;
          const complexityFeeVal = toAmount(complexityFeeAmount);
          const urgencyFeeVal = toAmount(urgencyFeeAmount);
          const totalFee = distanceFeeVal + complexityFeeVal + urgencyFeeVal;

          const payload: any = {
            // DB columns
            siteName: site.siteName || site.site_name || site.name || site.site || 'Unknown Site', // site_visits.site_name
            siteCode: hub || site.siteCode || site.site_code || site.id, // site_visits.site_code (compat)
            status: 'pending',
            locality: site.locality || location?.locality || '',
            state: site.state || location?.region || '',
            activity: siteActivity, // Activity at Site -> site_visits.activity
            priority,
            dueDate: (() => {
              const visitDate = site.visitDate;
              if (visitDate) {
                const date = new Date(visitDate);
                return isNaN(date.getTime()) ? dueDate : visitDate;
              }
              return dueDate;
            })(), // Visit Date -> site_visits.due_date
            notes: comments, // Comments -> site_visits.notes
            mainActivity: site.mainActivity || '', // Main Activity -> site_visits.main_activity

            // JSON fields in visit_data
            hub, // Hub Office
            cpName, // CP Name
            visitType, // Visit Type
            projectActivities: [],
            permitDetails: { federal: false, state: false, locality: false },
            complexity: 'medium',

            // Context
            location,
            fees: {
              total: totalFee,
              currency: feeCurrency,
              distanceFee: distanceFeeVal,
              complexityFee: complexityFeeVal,
              urgencyFee: urgencyFeeVal,
            },
            mmpDetails: {
              mmpId: mmpData?.id,
              projectName: mmpData?.projectName || '',
              uploadedBy: mmpData?.uploadedBy || '',
              uploadedAt: mmpData?.uploadedAt || '',
              region: mmpData?.region || ''
            },
            mmpId: mmpData?.id,
          };

          return createSiteVisit(payload);
        })
      );

      const createdCount = results.filter(Boolean).length;

      toast({
        title: 'Site visits created',
        description: `Successfully created ${createdCount} site visit${createdCount !== 1 ? 's' : ''}.`,
      });
      navigate('/site-visits');
    } catch (error) {
      console.error('Error creating site visits:', error);
      toast({
        title: 'Creation failed',
        description: 'There was a problem creating the site visits.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/site-visits/create/mmp")}
          className="mr-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{mmpData?.name}</h1>
          <p className="text-muted-foreground">
            {mmpData?.mmpId || "MMP"} • {mmpData?.siteEntries?.length || 0} sites
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Site Selection</CardTitle>
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {mmpData?.siteEntries?.length === selectedSites.length 
                  ? "Deselect All" 
                  : "Select All"}
              </Button>
            </div>
            <CardDescription>
              Choose which sites to include in the site visits
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mmpData?.siteEntries?.length > 0 ? (
              <div className="space-y-4">
                {mmpData.siteEntries.map((site: any) => (
                  <SiteEntryCard
                    key={site.id}
                    site={site}
                    isSelected={selectedSites.includes(site.id)}
                    onToggle={handleSiteToggle}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No sites found in this MMP</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-6">
            <div className="text-sm text-muted-foreground">
              {selectedSites.length} of {mmpData?.siteEntries?.length || 0} sites selected
            </div>
          </CardFooter>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Visit Details</CardTitle>
              <CardDescription>Configure site visit parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="priority">Priority</Label>
                <RadioGroup 
                  value={priority} 
                  onValueChange={(value) => setPriority(value as 'low' | 'medium' | 'high')}
                  className="flex space-x-2"
                >
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="low" id="low" />
                    <Label htmlFor="low" className="text-green-600">Low</Label>
                  </div>
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="medium" id="medium" />
                    <Label htmlFor="medium" className="text-amber-600">Medium</Label>
                  </div>
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="high" id="high" />
                    <Label htmlFor="high" className="text-red-600">High</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Fees</Label>
                
                  <div>
                    <Label htmlFor="feeCurrency" className="text-xs">Currency</Label>
                    <Input
                      id="feeCurrency"
                      value={feeCurrency}
                      onChange={(e) => setFeeCurrency(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="distanceFee" className="text-xs">Distance Fee</Label>
                    <Input
                      id="distanceFee"
                      type="number"
                      value={distanceFeeAmount}
                      onChange={(e) => setDistanceFeeAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="complexityFee" className="text-xs">Complexity Fee</Label>
                    <Input
                      id="complexityFee"
                      type="number"
                      value={complexityFeeAmount}
                      onChange={(e) => setComplexityFeeAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="urgencyFee" className="text-xs">Urgency Fee</Label>
                    <Input
                      id="urgencyFee"
                      type="number"
                      value={urgencyFeeAmount}
                      onChange={(e) => setUrgencyFeeAmount(e.target.value)}
                    />
                  </div>
                
                <div className="text-sm text-muted-foreground mt-2">
                  Total: {(toAmount(distanceFeeAmount) + toAmount(complexityFeeAmount) + toAmount(urgencyFeeAmount)).toLocaleString()} {feeCurrency}
                </div>
              </div>

              <Separator />

              <div className="pt-2">
                <Button 
                  className="w-full" 
                  disabled={selectedSites.length === 0 || creating}
                  onClick={handleCreateSiteVisits}
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Create {selectedSites.length} Site Visit{selectedSites.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <MMPInfoCard mmpData={mmpData} />
        </div>
      </div>
    </div>
  );
};

export default CreateSiteVisitMMPDetail;
