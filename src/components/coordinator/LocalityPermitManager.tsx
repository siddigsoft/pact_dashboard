import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  MapPin, 
  Search, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  FileCheck,
  ArrowRight,
  Building2,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { LocalityPermitUpload } from '@/components/LocalityPermitUpload';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface LocalityData {
  state: string;
  locality: string;
  siteCount: number;
  sites: any[];
  hasPermit: boolean;
  mmpFileId: string;
}

interface LocalityPermitManagerProps {
  localities: LocalityData[];
  onPermitUploaded: () => void;
  onSitesAdvanced: (count: number) => void;
  isLoading?: boolean;
}

type PermitRequirement = 'required' | 'not_required' | 'pending';

export const LocalityPermitManager: React.FC<LocalityPermitManagerProps> = ({
  localities,
  onPermitUploaded,
  onSitesAdvanced,
  isLoading = false,
}) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [requirements, setRequirements] = useState<Record<string, PermitRequirement>>({});
  const [uploadingLocality, setUploadingLocality] = useState<LocalityData | null>(null);
  const [processingLocalities, setProcessingLocalities] = useState<Set<string>>(new Set());

  const getLocalityKey = (locality: LocalityData) => `${locality.state}|${locality.locality}`;

  const filteredLocalities = useMemo(() => {
    if (!searchQuery.trim()) return localities;
    const query = searchQuery.toLowerCase();
    return localities.filter(loc => 
      loc.locality.toLowerCase().includes(query) ||
      loc.state.toLowerCase().includes(query)
    );
  }, [localities, searchQuery]);

  const stats = useMemo(() => {
    const withPermits = localities.filter(l => l.hasPermit).length;
    const pendingLocalities = localities.filter(l => !l.hasPermit);
    const required = pendingLocalities.filter(l => requirements[getLocalityKey(l)] === 'required').length;
    const notRequired = pendingLocalities.filter(l => requirements[getLocalityKey(l)] === 'not_required').length;
    const pending = pendingLocalities.length - required - notRequired;
    return { required, notRequired, pending, withPermits, total: localities.length };
  }, [requirements, localities]);

  const handleRequirementChange = (locality: LocalityData, value: PermitRequirement) => {
    const key = getLocalityKey(locality);
    setRequirements(prev => ({ ...prev, [key]: value }));
  };

  const handleProceedWithoutPermit = async (locality: LocalityData) => {
    const key = getLocalityKey(locality);
    setProcessingLocalities(prev => new Set(prev).add(key));

    try {
      const siteIds = locality.sites.map(s => s.id);
      let successCount = 0;
      let failCount = 0;
      
      for (const siteId of siteIds) {
        // Query mmp_site_entries table (not site_visits) - these are MMP site entry IDs
        const { data: currentSite, error: fetchError } = await supabase
          .from('mmp_site_entries')
          .select('additional_data')
          .eq('id', siteId)
          .single();

        if (fetchError) {
          console.error('Error fetching site entry:', fetchError, 'siteId:', siteId);
          failCount++;
          continue;
        }

        const existingData = (currentSite?.additional_data as Record<string, unknown>) || {};
        
        // Update mmp_site_entries table with locality permit status
        const { error: updateError } = await supabase
          .from('mmp_site_entries')
          .update({
            status: 'cp_verification',
            additional_data: {
              ...existingData,
              locality_permit_not_required: true,
              locality_permit_triage_date: new Date().toISOString(),
              locality_permit_note: 'No locality permit required'
            }
          })
          .eq('id', siteId);

        if (updateError) {
          console.error('Error updating site entry:', updateError, 'siteId:', siteId);
          failCount++;
        } else {
          successCount++;
        }
      }

      if (failCount > 0 && successCount === 0) {
        toast({
          title: "Error",
          description: `Failed to advance all ${failCount} sites. Please try again.`,
          variant: "destructive"
        });
        return;
      }

      if (failCount > 0) {
        toast({
          title: "Partial Success",
          description: `${successCount} site(s) advanced. ${failCount} site(s) failed.`,
          variant: "default"
        });
      } else {
        toast({
          title: "Sites Advanced",
          description: `${successCount} site(s) in ${locality.locality} moved to CP Verification.`,
        });
      }

      onSitesAdvanced(successCount);
    } catch (error) {
      console.error('Error advancing sites:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setProcessingLocalities(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handlePermitUploaded = () => {
    if (uploadingLocality) {
      const key = getLocalityKey(uploadingLocality);
      setRequirements(prev => ({ ...prev, [key]: 'required' }));
    }
    setUploadingLocality(null);
    onPermitUploaded();
  };

  const getRequirement = (locality: LocalityData): PermitRequirement => {
    if (locality.hasPermit) return 'required';
    return requirements[getLocalityKey(locality)] || 'pending';
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading localities...</p>
      </div>
    );
  }

  if (localities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
        <p>No localities pending permit processing.</p>
        <p className="text-sm mt-2">All localities have been processed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-slate-50 border-slate-200">
            <Building2 className="h-3 w-3 mr-1" />
            {stats.total} Localities
          </Badge>
          {stats.pending > 0 && (
            <Badge variant="outline" className="bg-gray-50 border-gray-200 text-gray-600">
              {stats.pending} Pending
            </Badge>
          )}
          {stats.required > 0 && (
            <Badge variant="outline" className="bg-orange-50 border-orange-200 text-orange-700">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {stats.required} Require Permit
            </Badge>
          )}
          {stats.notRequired > 0 && (
            <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {stats.notRequired} Skipped
            </Badge>
          )}
          {stats.withPermits > 0 && (
            <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">
              <FileCheck className="h-3 w-3 mr-1" />
              {stats.withPermits} Uploaded
            </Badge>
          )}
        </div>
        
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search localities..."
            className="pl-8 w-full sm:w-[250px]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-localities"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-purple-600" />
            Locality Permit Requirements
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select whether each locality requires a permit, then upload or skip as needed.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[500px]">
            <div className="divide-y">
              {filteredLocalities.map((locality, index) => {
                const key = getLocalityKey(locality);
                const requirement = getRequirement(locality);
                const isProcessing = processingLocalities.has(key);
                
                return (
                  <div 
                    key={key}
                    className={`p-4 transition-colors ${
                      locality.hasPermit 
                        ? 'bg-blue-50/50' 
                        : requirement === 'required'
                          ? 'bg-orange-50/30'
                          : requirement === 'not_required'
                            ? 'bg-green-50/30'
                            : ''
                    }`}
                    data-testid={`locality-row-${index}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <MapPin className={`h-4 w-4 flex-shrink-0 ${
                            locality.hasPermit 
                              ? 'text-blue-600' 
                              : requirement === 'required'
                                ? 'text-orange-600'
                                : requirement === 'not_required'
                                  ? 'text-green-600'
                                  : 'text-gray-400'
                          }`} />
                          <span className="font-medium truncate">{locality.locality}</span>
                          {locality.hasPermit && (
                            <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">
                              <FileCheck className="h-3 w-3 mr-1" />
                              Permit Uploaded
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground ml-6">
                          <span>{locality.state}</span>
                          <span>•</span>
                          <span>{locality.siteCount} site{locality.siteCount !== 1 ? 's' : ''}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-6 sm:ml-0">
                        {locality.hasPermit ? (
                          <Badge className="bg-blue-600 text-white">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Complete
                          </Badge>
                        ) : isProcessing ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                            Processing...
                          </div>
                        ) : (
                          <>
                            <Select
                              value={requirement}
                              onValueChange={(value) => handleRequirementChange(locality, value as PermitRequirement)}
                            >
                              <SelectTrigger className="w-[160px]" data-testid={`select-requirement-${index}`}>
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">
                                  <span className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-gray-400"></span>
                                    Pending
                                  </span>
                                </SelectItem>
                                <SelectItem value="required">
                                  <span className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-orange-500"></span>
                                    Requires Permit
                                  </span>
                                </SelectItem>
                                <SelectItem value="not_required">
                                  <span className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-green-500"></span>
                                    No Permit Needed
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>

                            {requirement === 'required' && (
                              <Button
                                size="sm"
                                onClick={() => setUploadingLocality(locality)}
                                className="bg-orange-600 hover:bg-orange-700"
                                data-testid={`button-upload-${index}`}
                              >
                                <Upload className="h-4 w-4 mr-1" />
                                Upload
                              </Button>
                            )}

                            {requirement === 'not_required' && (
                              <Button
                                size="sm"
                                onClick={() => handleProceedWithoutPermit(locality)}
                                className="bg-green-600 hover:bg-green-700"
                                data-testid={`button-skip-${index}`}
                              >
                                <ArrowRight className="h-4 w-4 mr-1" />
                                Advance Sites
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={!!uploadingLocality} onOpenChange={(open) => !open && setUploadingLocality(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-orange-600" />
              Upload Locality Permit
            </DialogTitle>
          </DialogHeader>
          {uploadingLocality && (
            <div>
              <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                <p className="font-medium">{uploadingLocality.locality}</p>
                <p className="text-sm text-muted-foreground">{uploadingLocality.state} • {uploadingLocality.siteCount} sites</p>
              </div>
              <LocalityPermitUpload
                state={uploadingLocality.state}
                locality={uploadingLocality.locality}
                mmpFileId={uploadingLocality.mmpFileId}
                onPermitUploaded={handlePermitUploaded}
                onCancel={() => setUploadingLocality(null)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
