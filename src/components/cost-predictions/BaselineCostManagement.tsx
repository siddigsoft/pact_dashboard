import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CostPredictionService } from '@/services/costPrediction.service';
import { useAppContext } from '@/context/AppContext';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Loader2, 
  Search, 
  DollarSign, 
  MapPin, 
  CheckCircle2, 
  AlertCircle,
  Upload,
  Pencil,
  Trash2,
  Save,
  X,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  Target
} from 'lucide-react';
import { toast } from 'sonner';

interface SiteRegistryEntry {
  id: string;
  site_code?: string;
  site_name: string;
  state_name?: string;
  state_id?: string;
  locality_name?: string;
  locality_id?: string;
  hub_id?: string;
  gps_latitude?: number;
  gps_longitude?: number;
}

interface SiteWithCostStatus extends SiteRegistryEntry {
  hasHistoricalData: boolean;
  hasBaselineCost: boolean;
  baselineCost?: number;
  historicalVisitCount: number;
  lastVisitCost?: number;
}

interface BaselineCostManagementProps {
  onBaselineUpdated?: () => void;
}

export function BaselineCostManagement({ onBaselineUpdated }: BaselineCostManagementProps) {
  const { currentUser } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState<SiteWithCostStatus[]>([]);
  const [filteredSites, setFilteredSites] = useState<SiteWithCostStatus[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'no_data' | 'baseline_only' | 'has_history'>('no_data');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [states, setStates] = useState<string[]>([]);
  
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editingCost, setEditingCost] = useState<string>('');
  const [editingNotes, setEditingNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [bulkUploading, setBulkUploading] = useState(false);
  
  const [stats, setStats] = useState({
    totalSites: 0,
    withHistory: 0,
    withBaseline: 0,
    noData: 0
  });

  const fetchSitesWithCostStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data: registrySites, error: registryError } = await supabase
        .from('sites_registry')
        .select('id, site_code, site_name, state_name, state_id, locality_name, locality_id, hub_id, gps_latitude, gps_longitude')
        .order('state_name', { ascending: true })
        .order('locality_name', { ascending: true })
        .order('site_name', { ascending: true });

      if (registryError) {
        console.error('Error fetching sites:', registryError);
        toast.error('Failed to load sites registry');
        return;
      }

      if (!registrySites || registrySites.length === 0) {
        setSites([]);
        setFilteredSites([]);
        return;
      }

      const siteIds = registrySites.map(s => s.id);
      
      const { data: historicalCosts, error: histError } = await supabase
        .from('historical_site_costs')
        .select('site_id, source, actual_cost, visit_date')
        .in('site_id', siteIds);

      if (histError) {
        console.error('Error fetching historical costs:', histError);
      }

      const costMap = new Map<string, { 
        realVisits: number; 
        hasBaseline: boolean; 
        baselineCost?: number;
        lastVisitCost?: number;
      }>();

      (historicalCosts || []).forEach(cost => {
        const existing = costMap.get(cost.site_id) || { 
          realVisits: 0, 
          hasBaseline: false 
        };
        
        if (cost.source === 'baseline') {
          existing.hasBaseline = true;
          existing.baselineCost = cost.actual_cost;
        } else {
          existing.realVisits++;
          if (!existing.lastVisitCost || cost.visit_date > (existing as any).lastVisitDate) {
            existing.lastVisitCost = cost.actual_cost;
            (existing as any).lastVisitDate = cost.visit_date;
          }
        }
        
        costMap.set(cost.site_id, existing);
      });

      const sitesWithStatus: SiteWithCostStatus[] = registrySites.map(site => {
        const costInfo = costMap.get(site.id);
        return {
          ...site,
          hasHistoricalData: (costInfo?.realVisits || 0) > 0,
          hasBaselineCost: costInfo?.hasBaseline || false,
          baselineCost: costInfo?.baselineCost,
          historicalVisitCount: costInfo?.realVisits || 0,
          lastVisitCost: costInfo?.lastVisitCost
        };
      });

      const uniqueStates = [...new Set(sitesWithStatus.map(s => s.state_name).filter(Boolean))] as string[];
      setStates(uniqueStates.sort());

      const withHistory = sitesWithStatus.filter(s => s.hasHistoricalData).length;
      const withBaseline = sitesWithStatus.filter(s => s.hasBaselineCost && !s.hasHistoricalData).length;
      const noData = sitesWithStatus.filter(s => !s.hasHistoricalData && !s.hasBaselineCost).length;

      setStats({
        totalSites: sitesWithStatus.length,
        withHistory,
        withBaseline,
        noData
      });

      setSites(sitesWithStatus);
    } catch (err) {
      console.error('Error in fetchSitesWithCostStatus:', err);
      toast.error('Failed to load site data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSitesWithCostStatus();
  }, [fetchSitesWithCostStatus]);

  useEffect(() => {
    let filtered = [...sites];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(s => 
        s.site_name?.toLowerCase().includes(term) ||
        s.site_code?.toLowerCase().includes(term) ||
        s.state_name?.toLowerCase().includes(term) ||
        s.locality_name?.toLowerCase().includes(term)
      );
    }

    if (stateFilter !== 'all') {
      filtered = filtered.filter(s => s.state_name === stateFilter);
    }

    if (filterStatus === 'no_data') {
      filtered = filtered.filter(s => !s.hasHistoricalData && !s.hasBaselineCost);
    } else if (filterStatus === 'baseline_only') {
      filtered = filtered.filter(s => s.hasBaselineCost && !s.hasHistoricalData);
    } else if (filterStatus === 'has_history') {
      filtered = filtered.filter(s => s.hasHistoricalData);
    }

    setFilteredSites(filtered);
  }, [sites, searchTerm, filterStatus, stateFilter]);

  const handleEditBaseline = (site: SiteWithCostStatus) => {
    setEditingSiteId(site.id);
    setEditingCost(site.baselineCost?.toString() || '');
    setEditingNotes('');
  };

  const handleSaveBaseline = async (site: SiteWithCostStatus) => {
    const cost = parseFloat(editingCost);
    if (isNaN(cost) || cost <= 0) {
      toast.error('Please enter a valid cost amount');
      return;
    }

    setSaving(true);
    try {
      const result = await CostPredictionService.setBaselineCost(
        site.id,
        site.site_name,
        site.state_id || site.state_name || '',
        site.locality_id || site.locality_name || '',
        cost,
        site.hub_id,
        editingNotes || undefined,
        currentUser?.id
      );

      if (result.success) {
        toast.success(`Baseline cost set for ${site.site_name}`);
        setEditingSiteId(null);
        setEditingCost('');
        setEditingNotes('');
        fetchSitesWithCostStatus();
        onBaselineUpdated?.();
      } else {
        toast.error(result.error || 'Failed to save baseline cost');
      }
    } catch (err) {
      console.error('Error saving baseline:', err);
      toast.error('Failed to save baseline cost');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBaseline = async (site: SiteWithCostStatus) => {
    if (!confirm(`Remove baseline cost for ${site.site_name}?`)) return;

    setSaving(true);
    try {
      const result = await CostPredictionService.deleteBaselineCost(site.id);
      if (result.success) {
        toast.success('Baseline cost removed');
        fetchSitesWithCostStatus();
        onBaselineUpdated?.();
      } else {
        toast.error(result.error || 'Failed to remove baseline');
      }
    } catch (err) {
      console.error('Error deleting baseline:', err);
      toast.error('Failed to remove baseline cost');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkCsvText.trim()) {
      toast.error('Please paste CSV data');
      return;
    }

    setBulkUploading(true);
    try {
      const lines = bulkCsvText.trim().split('\n');
      if (lines.length < 2) {
        toast.error('CSV must have a header row and at least one data row');
        return;
      }

      const header = lines[0].toLowerCase().split(',').map(h => h.trim());
      const siteNameIdx = header.findIndex(h => h.includes('site') && h.includes('name'));
      const costIdx = header.findIndex(h => h.includes('cost') || h.includes('baseline'));
      
      if (siteNameIdx === -1 || costIdx === -1) {
        toast.error('CSV must have "site_name" and "cost" or "baseline" columns');
        return;
      }

      const sitesToUpdate: Array<{
        siteId: string;
        siteName: string;
        stateId: string;
        localityId: string;
        hubId?: string;
        baselineCost: number;
      }> = [];

      const siteNameMap = new Map(sites.map(s => [s.site_name.toLowerCase().trim(), s]));

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const siteName = cols[siteNameIdx];
        const cost = parseFloat(cols[costIdx]);

        if (!siteName || isNaN(cost) || cost <= 0) continue;

        const matchedSite = siteNameMap.get(siteName.toLowerCase().trim());
        if (matchedSite) {
          sitesToUpdate.push({
            siteId: matchedSite.id,
            siteName: matchedSite.site_name,
            stateId: matchedSite.state_id || matchedSite.state_name || '',
            localityId: matchedSite.locality_id || matchedSite.locality_name || '',
            hubId: matchedSite.hub_id,
            baselineCost: cost
          });
        }
      }

      if (sitesToUpdate.length === 0) {
        toast.error('No matching sites found in CSV');
        return;
      }

      const result = await CostPredictionService.setBulkBaselineCosts(sitesToUpdate, currentUser?.id);
      
      toast.success(`Updated ${result.success} sites. ${result.failed} failed.`);
      if (result.errors.length > 0) {
        console.warn('Bulk upload errors:', result.errors);
      }

      setBulkUploadOpen(false);
      setBulkCsvText('');
      fetchSitesWithCostStatus();
      onBaselineUpdated?.();
    } catch (err) {
      console.error('Bulk upload error:', err);
      toast.error('Failed to process bulk upload');
    } finally {
      setBulkUploading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SDG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <Card data-testid="card-baseline-cost-management">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Baseline Cost Management
            </CardTitle>
            <CardDescription>
              Set estimated costs for sites without historical visit data
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSitesWithCostStatus()}
              disabled={loading}
              data-testid="button-refresh-baselines"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkUploadOpen(true)}
              data-testid="button-bulk-upload-baselines"
            >
              <Upload className="h-4 w-4 mr-2" />
              Bulk Upload
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg border bg-card">
            <div className="text-2xl font-bold">{stats.totalSites}</div>
            <div className="text-sm text-muted-foreground">Total Sites</div>
          </div>
          <div className="p-4 rounded-lg border bg-green-50 dark:bg-green-900/20">
            <div className="text-2xl font-bold text-green-600">{stats.withHistory}</div>
            <div className="text-sm text-muted-foreground">With Visit History</div>
          </div>
          <div className="p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20">
            <div className="text-2xl font-bold text-blue-600">{stats.withBaseline}</div>
            <div className="text-sm text-muted-foreground">Baseline Only</div>
          </div>
          <div className="p-4 rounded-lg border bg-amber-50 dark:bg-amber-900/20">
            <div className="text-2xl font-bold text-amber-600">{stats.noData}</div>
            <div className="text-sm text-muted-foreground">No Cost Data</div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sites by name, code, state, or locality..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-sites"
            />
          </div>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-full md:w-48" data-testid="select-state-filter">
              <SelectValue placeholder="Filter by state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {states.map(state => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all" data-testid="tab-all-sites">
              All ({sites.length})
            </TabsTrigger>
            <TabsTrigger value="no_data" data-testid="tab-no-data">
              <AlertCircle className="h-3 w-3 mr-1" />
              No Data ({stats.noData})
            </TabsTrigger>
            <TabsTrigger value="baseline_only" data-testid="tab-baseline-only">
              <Target className="h-3 w-3 mr-1" />
              Baseline ({stats.withBaseline})
            </TabsTrigger>
            <TabsTrigger value="has_history" data-testid="tab-has-history">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              History ({stats.withHistory})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredSites.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No sites found</p>
            <p className="text-sm">
              {filterStatus === 'no_data' 
                ? 'All sites have cost data - great job!' 
                : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cost Data</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSites.slice(0, 50).map((site) => (
                  <TableRow key={site.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{site.site_name}</div>
                        {site.site_code && (
                          <div className="text-xs text-muted-foreground">{site.site_code}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{site.locality_name || '-'}</div>
                        <div className="text-muted-foreground">{site.state_name || '-'}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {site.hasHistoricalData ? (
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {site.historicalVisitCount} visits
                        </Badge>
                      ) : site.hasBaselineCost ? (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          <Target className="h-3 w-3 mr-1" />
                          Baseline
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          No data
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingSiteId === site.id ? (
                        <div className="flex items-center gap-2 justify-end">
                          <Input
                            type="number"
                            value={editingCost}
                            onChange={(e) => setEditingCost(e.target.value)}
                            placeholder="Cost (SDG)"
                            className="w-28 text-right"
                            data-testid={`input-baseline-cost-${site.id}`}
                          />
                        </div>
                      ) : (
                        <div className="text-sm">
                          {site.hasHistoricalData && site.lastVisitCost && (
                            <div className="font-medium">{formatCurrency(site.lastVisitCost)}</div>
                          )}
                          {site.hasBaselineCost && site.baselineCost && (
                            <div className={site.hasHistoricalData ? 'text-muted-foreground text-xs' : 'font-medium'}>
                              {site.hasHistoricalData ? 'Baseline: ' : ''}{formatCurrency(site.baselineCost)}
                            </div>
                          )}
                          {!site.hasHistoricalData && !site.hasBaselineCost && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingSiteId === site.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleSaveBaseline(site)}
                            disabled={saving}
                            data-testid={`button-save-baseline-${site.id}`}
                          >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingSiteId(null)}
                            data-testid={`button-cancel-edit-${site.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditBaseline(site)}
                            title={site.hasBaselineCost ? 'Edit baseline' : 'Set baseline cost'}
                            data-testid={`button-edit-baseline-${site.id}`}
                          >
                            {site.hasBaselineCost ? <Pencil className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
                          </Button>
                          {site.hasBaselineCost && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteBaseline(site)}
                              className="text-destructive hover:text-destructive"
                              data-testid={`button-delete-baseline-${site.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredSites.length > 50 && (
              <div className="p-4 text-center text-sm text-muted-foreground border-t">
                Showing 50 of {filteredSites.length} sites. Use search to find specific sites.
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={bulkUploadOpen} onOpenChange={setBulkUploadOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Bulk Upload Baseline Costs
            </DialogTitle>
            <DialogDescription>
              Paste CSV data with site names and baseline costs. The system will match sites by name.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-medium mb-2">Required CSV format:</p>
              <code className="text-xs block bg-background p-2 rounded">
                site_name,baseline_cost<br/>
                Site A,15000<br/>
                Site B,18500<br/>
                Site C,12000
              </code>
            </div>
            
            <div>
              <Label htmlFor="csv-data">Paste CSV Data</Label>
              <Textarea
                id="csv-data"
                value={bulkCsvText}
                onChange={(e) => setBulkCsvText(e.target.value)}
                placeholder="site_name,baseline_cost&#10;My Site,15000"
                className="min-h-[200px] font-mono text-sm"
                data-testid="textarea-bulk-csv"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkUploadOpen(false)}
              data-testid="button-cancel-bulk-upload"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkUpload}
              disabled={bulkUploading || !bulkCsvText.trim()}
              data-testid="button-confirm-bulk-upload"
            >
              {bulkUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Baselines
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
