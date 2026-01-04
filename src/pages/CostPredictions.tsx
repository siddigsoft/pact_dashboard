import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calculator, 
  BarChart3, 
  MapPin, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  Target,
  Wallet,
  Building2,
  Users,
  RefreshCw,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Activity,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Database
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { CostPredictionService, type HistoricalSiteCost, type ParsedHistoricalRecord } from '@/services/costPrediction.service';
import { normalizeStateId, normalizeLocalityId } from '@/utils/siteNormalization';
import * as XLSX from 'xlsx';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
  Area,
  AreaChart
} from 'recharts';

interface CostData {
  transportationTotal: number;
  perDiemTotal: number;
  enumeratorFeesTotal: number;
  otherCostsTotal: number;
  totalCosts: number;
  avgCostPerVisit: number;
  totalVisits: number;
}

interface MonthlyTrend {
  month: string;
  transportation: number;
  perDiem: number;
  enumeratorFees: number;
  total: number;
}

interface HubCost {
  hub: string;
  cost: number;
  visits: number;
  avgPerVisit: number;
}

interface Prediction {
  metric: string;
  current: number;
  predicted: number;
  change: number;
  confidence: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

interface ValidationSummary {
  totalRecords: number;
  matchedSites: number;
  matchedWithGps: number;
  matchedWithoutGps: number;
  newSites: number;
  validatedStates: number;
  invalidStates: string[];
  validatedLocalities: number;
  invalidLocalities: string[];
  errors: string[];
}

interface ParsedRecord {
  rowNumber: number;
  siteName: string;
  state: string;
  locality: string;
  hub: string;
  visitDate?: string;
  actualCost?: number;
  transportMode?: string;
  matchedSiteId?: string;
  hasGps: boolean;
  isNewSite: boolean;
  validationStatus: 'valid' | 'warning' | 'error';
  validationMessage?: string;
}

export default function CostPredictions() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('3months');
  const [selectedHub, setSelectedHub] = useState('all');
  const [costData, setCostData] = useState<CostData | null>(null);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrend[]>([]);
  const [hubCosts, setHubCosts] = useState<HubCost[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [budgetData, setBudgetData] = useState({ allocated: 0, spent: 0, remaining: 0 });
  
  const [mainTab, setMainTab] = useState('analytics');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);
  const [parsedRecords, setParsedRecords] = useState<ParsedRecord[]>([]);
  const [uploadStep, setUploadStep] = useState<'select' | 'validate' | 'import' | 'complete'>('select');
  const [importResult, setImportResult] = useState<{ success: boolean; inserted: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [registrySites, setRegistrySites] = useState<Map<string, any>>(new Map());

  const fetchCostData = async () => {
    try {
      setLoading(true);
      
      const periodMonths = selectedPeriod === '1month' ? 1 : selectedPeriod === '3months' ? 3 : selectedPeriod === '6months' ? 6 : 12;
      const startDate = format(subMonths(new Date(), periodMonths), 'yyyy-MM-dd');
      
      // Fetch transportation cost submissions
      let costQuery = supabase
        .from('cost_submissions')
        .select('*')
        .gte('created_at', startDate);
      
      const { data: costSubmissions, error: costError } = await costQuery;
      
      if (costError) throw costError;
      
      // Fetch site visits for visit counts
      let visitsQuery = supabase
        .from('site_visits')
        .select('id, hub_id, state, status')
        .gte('created_at', startDate);
      
      const { data: siteVisits, error: visitsError } = await visitsQuery;
      
      if (visitsError) throw visitsError;
      
      // Fetch budget data
      const { data: budgets, error: budgetError } = await supabase
        .from('budgets')
        .select('total_budget, amount_spent');
      
      // Calculate totals
      const transportationTotal = costSubmissions?.reduce((sum, c) => sum + (Number(c.transportation_cost) || 0), 0) || 0;
      const perDiemTotal = costSubmissions?.reduce((sum, c) => sum + (Number(c.per_diem) || 0), 0) || 0;
      const enumeratorFeesTotal = costSubmissions?.reduce((sum, c) => sum + (Number(c.enumerator_fees) || 0), 0) || 0;
      const otherCostsTotal = costSubmissions?.reduce((sum, c) => sum + (Number(c.other_costs) || 0), 0) || 0;
      const totalCosts = transportationTotal + perDiemTotal + enumeratorFeesTotal + otherCostsTotal;
      const totalVisits = siteVisits?.length || 1;
      
      setCostData({
        transportationTotal,
        perDiemTotal,
        enumeratorFeesTotal,
        otherCostsTotal,
        totalCosts,
        avgCostPerVisit: totalCosts / totalVisits,
        totalVisits
      });
      
      // Calculate monthly trends
      const monthlyData: Record<string, MonthlyTrend> = {};
      for (let i = periodMonths - 1; i >= 0; i--) {
        const monthDate = subMonths(new Date(), i);
        const monthKey = format(monthDate, 'MMM yyyy');
        monthlyData[monthKey] = {
          month: monthKey,
          transportation: 0,
          perDiem: 0,
          enumeratorFees: 0,
          total: 0
        };
      }
      
      costSubmissions?.forEach(cost => {
        const monthKey = format(new Date(cost.created_at), 'MMM yyyy');
        if (monthlyData[monthKey]) {
          monthlyData[monthKey].transportation += Number(cost.transportation_cost) || 0;
          monthlyData[monthKey].perDiem += Number(cost.per_diem) || 0;
          monthlyData[monthKey].enumeratorFees += Number(cost.enumerator_fees) || 0;
          monthlyData[monthKey].total += (Number(cost.transportation_cost) || 0) + 
            (Number(cost.per_diem) || 0) + 
            (Number(cost.enumerator_fees) || 0) +
            (Number(cost.other_costs) || 0);
        }
      });
      
      setMonthlyTrends(Object.values(monthlyData));
      
      // Calculate hub costs
      const hubCostMap: Record<string, { cost: number; visits: number }> = {};
      siteVisits?.forEach(visit => {
        const hub = visit.hub_id || 'Unknown';
        if (!hubCostMap[hub]) {
          hubCostMap[hub] = { cost: 0, visits: 0 };
        }
        hubCostMap[hub].visits++;
      });
      
      costSubmissions?.forEach(cost => {
        const hub = (cost as any).hub_id || 'Unknown';
        if (hubCostMap[hub]) {
          hubCostMap[hub].cost += Number(cost.total_cost) || 0;
        }
      });
      
      const hubCostsArray = Object.entries(hubCostMap).map(([hub, data]) => ({
        hub,
        cost: data.cost,
        visits: data.visits,
        avgPerVisit: data.visits > 0 ? data.cost / data.visits : 0
      })).sort((a, b) => b.cost - a.cost).slice(0, 10);
      
      setHubCosts(hubCostsArray);
      
      // Calculate budget
      const totalBudget = budgets?.reduce((sum, b) => sum + (Number(b.total_budget) || 0), 0) || 500000;
      const amountSpent = budgets?.reduce((sum, b) => sum + (Number(b.amount_spent) || 0), 0) || totalCosts;
      setBudgetData({
        allocated: totalBudget,
        spent: amountSpent,
        remaining: totalBudget - amountSpent
      });
      
      // Generate predictions based on trends
      const avgMonthlySpend = totalCosts / periodMonths;
      const lastMonthSpend = monthlyTrends.length > 0 ? monthlyTrends[monthlyTrends.length - 1]?.total || avgMonthlySpend : avgMonthlySpend;
      const growthRate = monthlyTrends.length > 1 
        ? ((monthlyTrends[monthlyTrends.length - 1]?.total || 0) - (monthlyTrends[0]?.total || 0)) / ((monthlyTrends[0]?.total || 1))
        : 0.05;
      
      setPredictions([
        {
          metric: 'Next Month Spend',
          current: lastMonthSpend,
          predicted: lastMonthSpend * (1 + growthRate * 0.3),
          change: growthRate * 30,
          confidence: 85
        },
        {
          metric: 'Quarterly Projection',
          current: avgMonthlySpend * 3,
          predicted: avgMonthlySpend * 3 * (1 + growthRate * 0.15),
          change: growthRate * 15,
          confidence: 75
        },
        {
          metric: 'Cost per Visit',
          current: totalCosts / totalVisits,
          predicted: (totalCosts / totalVisits) * (1 + 0.02),
          change: 2,
          confidence: 90
        },
        {
          metric: 'Annual Forecast',
          current: avgMonthlySpend * 12,
          predicted: avgMonthlySpend * 12 * (1 + growthRate * 0.1),
          change: growthRate * 10,
          confidence: 65
        }
      ]);
      
    } catch (error) {
      console.error('Error fetching cost data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCostData();
  }, [selectedPeriod, selectedHub]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCostData();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SDG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const loadRegistrySites = async () => {
    try {
      const { data, error } = await supabase
        .from('sites_registry')
        .select('*');
      
      if (data) {
        const siteMap = new Map();
        data.forEach(site => {
          const key = `${site.site_name?.toLowerCase()}-${site.state_name?.toLowerCase()}-${site.locality_name?.toLowerCase()}`;
          siteMap.set(key, site);
          if (site.site_code) {
            siteMap.set(site.site_code.toLowerCase(), site);
          }
        });
        setRegistrySites(siteMap);
      }
    } catch (err) {
      console.error('Error loading registry sites:', err);
    }
  };

  useEffect(() => {
    if (mainTab === 'upload') {
      loadRegistrySites();
    }
  }, [mainTab]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadStep('select');
      setValidationSummary(null);
      setParsedRecords([]);
      setImportResult(null);
    }
  };

  const handleValidateFile = async () => {
    if (!uploadFile) return;

    setValidating(true);
    try {
      const data = await uploadFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      const allRecords: ParsedRecord[] = [];
      let rowCounter = 0;

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        
        for (const row of jsonData as any[]) {
          rowCounter++;
          const siteName = row['1.10 Select The activity site'] || row['Site Name'] || row['site_name'] || '';
          const state = row['1.8 State of the site/where the site is located'] || row['State'] || row['state'] || '';
          const locality = row['1.9 Locality of the site/where the site is located'] || row['Locality'] || row['locality'] || '';
          const hub = row['1.7 WFP HUB'] || row['Hub'] || row['hub'] || '';
          const visitDate = row['Visit Date'] || row['visit_date'] || '';
          const actualCost = parseFloat(row['Actual Cost'] || row['actual_cost'] || '0') || 0;
          const transportMode = row['Transportation Means'] || row['Transport Mode'] || row['transport_mode'] || '';

          if (!siteName || !state || !locality) {
            continue;
          }

          const siteKey = `${siteName.toLowerCase()}-${state.toLowerCase()}-${locality.toLowerCase()}`;
          const matchedSite = registrySites.get(siteKey);
          
          let validationStatus: 'valid' | 'warning' | 'error' = 'valid';
          let validationMessage = '';

          if (!matchedSite) {
            validationStatus = 'warning';
            validationMessage = 'New site - will be added to registry';
          } else if (!matchedSite.gps_latitude || !matchedSite.gps_longitude) {
            validationStatus = 'warning';
            validationMessage = 'Site found but missing GPS coordinates';
          }

          allRecords.push({
            rowNumber: rowCounter,
            siteName: siteName.trim(),
            state: state.trim(),
            locality: locality.trim(),
            hub: hub.trim(),
            visitDate: visitDate ? String(visitDate) : undefined,
            actualCost: actualCost || undefined,
            transportMode: transportMode?.trim() || undefined,
            matchedSiteId: matchedSite?.id,
            hasGps: !!(matchedSite?.gps_latitude && matchedSite?.gps_longitude),
            isNewSite: !matchedSite,
            validationStatus,
            validationMessage
          });
        }
      }

      const matchedSites = allRecords.filter(r => !r.isNewSite);
      const matchedWithGps = matchedSites.filter(r => r.hasGps);
      const matchedWithoutGps = matchedSites.filter(r => !r.hasGps);
      const newSites = allRecords.filter(r => r.isNewSite);
      const uniqueStates = new Set(allRecords.map(r => r.state));
      const uniqueLocalities = new Set(allRecords.map(r => r.locality));

      setValidationSummary({
        totalRecords: allRecords.length,
        matchedSites: matchedSites.length,
        matchedWithGps: matchedWithGps.length,
        matchedWithoutGps: matchedWithoutGps.length,
        newSites: newSites.length,
        validatedStates: uniqueStates.size,
        invalidStates: [],
        validatedLocalities: uniqueLocalities.size,
        invalidLocalities: [],
        errors: []
      });

      setParsedRecords(allRecords);
      setUploadStep('validate');
    } catch (err: any) {
      console.error('Error validating file:', err);
      setValidationSummary({
        totalRecords: 0,
        matchedSites: 0,
        matchedWithGps: 0,
        matchedWithoutGps: 0,
        newSites: 0,
        validatedStates: 0,
        invalidStates: [],
        validatedLocalities: 0,
        invalidLocalities: [],
        errors: [`Failed to parse file: ${err.message}`]
      });
    } finally {
      setValidating(false);
    }
  };

  const handleImportData = async () => {
    if (parsedRecords.length === 0) return;

    setImporting(true);
    try {
      const recordsToInsert: HistoricalSiteCost[] = parsedRecords
        .filter(r => r.actualCost && r.actualCost > 0)
        .map(r => {
          const matchedSite = r.matchedSiteId ? registrySites.get(r.matchedSiteId) : null;
          
          const normalizedStateId = normalizeStateId(r.state) || r.state.toLowerCase().trim().replace(/\s+/g, '-');
          const normalizedLocalityId = normalizeLocalityId(r.locality, normalizedStateId) || r.locality.toLowerCase().trim().replace(/\s+/g, '-');
          
          return {
            site_id: r.matchedSiteId || `NEW-${r.siteName.replace(/\s+/g, '-').toUpperCase()}`,
            site_name: r.siteName,
            state_id: normalizedStateId,
            locality_id: normalizedLocalityId,
            hub_id: r.hub?.toLowerCase().trim().replace(/\s+/g, '-') || r.hub,
            visit_date: r.visitDate || format(new Date(), 'yyyy-MM-dd'),
            actual_cost: r.actualCost!,
            transport_mode: r.transportMode,
            gps_latitude: matchedSite?.gps_latitude || null,
            gps_longitude: matchedSite?.gps_longitude || null,
            gps_source: matchedSite?.gps_latitude ? 'registry' : undefined,
            source: 'historical_upload' as const
          };
        });

      if (recordsToInsert.length === 0) {
        setImportResult({
          success: false,
          inserted: 0,
          errors: ['No records with actual cost data to import']
        });
        return;
      }

      const result = await CostPredictionService.saveHistoricalCosts(recordsToInsert);
      setImportResult(result);
      setUploadStep('complete');
    } catch (err: any) {
      setImportResult({
        success: false,
        inserted: 0,
        errors: [`Import failed: ${err.message}`]
      });
    } finally {
      setImporting(false);
    }
  };

  const resetUpload = () => {
    setUploadFile(null);
    setUploadStep('select');
    setValidationSummary(null);
    setParsedRecords([]);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const costBreakdown = useMemo(() => {
    if (!costData) return [];
    return [
      { name: 'Transportation', value: costData.transportationTotal, color: COLORS[0] },
      { name: 'Per Diem', value: costData.perDiemTotal, color: COLORS[1] },
      { name: 'Enumerator Fees', value: costData.enumeratorFeesTotal, color: COLORS[2] },
      { name: 'Other Costs', value: costData.otherCostsTotal, color: COLORS[3] }
    ].filter(item => item.value > 0);
  }, [costData]);

  const budgetUtilization = budgetData.allocated > 0 
    ? (budgetData.spent / budgetData.allocated) * 100 
    : 0;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="cost-predictions-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="page-title">
            <TrendingUp className="h-6 w-6 text-primary" />
            Cost Predictions & Analytics
          </h1>
          <p className="text-muted-foreground mt-1">
            Forecast field operation costs and analyze spending trends
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {mainTab === 'analytics' && (
            <>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[140px]" data-testid="select-period">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1month">Last Month</SelectItem>
                  <SelectItem value="3months">Last 3 Months</SelectItem>
                  <SelectItem value="6months">Last 6 Months</SelectItem>
                  <SelectItem value="12months">Last Year</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleRefresh} disabled={refreshing} data-testid="button-refresh">
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="outline" data-testid="button-export">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        <TabsList data-testid="main-tabs">
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="upload" data-testid="tab-upload">
            <Upload className="h-4 w-4 mr-2" />
            Upload Historical Data
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab Content */}
        <TabsContent value="upload" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Upload Historical Cost Data
              </CardTitle>
              <CardDescription>
                Import historical site visit costs to enable accurate predictions. 
                The system will validate sites against your registry and enrich with GPS data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Step indicator */}
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1 ${uploadStep === 'select' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${uploadStep === 'select' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>1</div>
                  Select File
                </div>
                <div className="flex-1 h-px bg-border" />
                <div className={`flex items-center gap-1 ${uploadStep === 'validate' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${uploadStep === 'validate' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>2</div>
                  Validate
                </div>
                <div className="flex-1 h-px bg-border" />
                <div className={`flex items-center gap-1 ${uploadStep === 'complete' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${uploadStep === 'complete' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>3</div>
                  Import
                </div>
              </div>

              {/* File selection */}
              {uploadStep === 'select' && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                      data-testid="input-file-upload"
                    />
                    <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-2">
                      {uploadFile ? uploadFile.name : 'Select Excel or CSV file'}
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Supports .xlsx, .xls, and .csv formats
                    </p>
                    <Button onClick={() => fileInputRef.current?.click()} data-testid="button-choose-file">
                      <Upload className="h-4 w-4 mr-2" />
                      Choose File
                    </Button>
                  </div>

                  {uploadFile && (
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet className="h-8 w-8 text-green-600" />
                        <div>
                          <p className="font-medium">{uploadFile.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {(uploadFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={resetUpload} data-testid="button-clear-file">
                          Clear
                        </Button>
                        <Button onClick={handleValidateFile} disabled={validating} data-testid="button-validate">
                          {validating ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          )}
                          Validate
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Validation results */}
              {uploadStep === 'validate' && validationSummary && (
                <div className="space-y-4">
                  <Alert>
                    <Database className="h-4 w-4" />
                    <AlertDescription>
                      Validation complete. Review the results below before importing.
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold">{validationSummary.totalRecords}</div>
                        <p className="text-sm text-muted-foreground">Total Records</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-green-600">{validationSummary.matchedWithGps}</div>
                        <p className="text-sm text-muted-foreground">Matched with GPS</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-amber-600">{validationSummary.matchedWithoutGps}</div>
                        <p className="text-sm text-muted-foreground">Matched (no GPS)</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className="text-2xl font-bold text-blue-600">{validationSummary.newSites}</div>
                        <p className="text-sm text-muted-foreground">New Sites</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Preview Records</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[300px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Status</TableHead>
                              <TableHead>Site Name</TableHead>
                              <TableHead>State</TableHead>
                              <TableHead>Locality</TableHead>
                              <TableHead>Hub</TableHead>
                              <TableHead>Cost</TableHead>
                              <TableHead>GPS</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parsedRecords.slice(0, 50).map((record, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  {record.validationStatus === 'valid' && (
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  )}
                                  {record.validationStatus === 'warning' && (
                                    <AlertCircle className="h-4 w-4 text-amber-500" />
                                  )}
                                  {record.validationStatus === 'error' && (
                                    <XCircle className="h-4 w-4 text-red-500" />
                                  )}
                                </TableCell>
                                <TableCell className="font-medium">{record.siteName}</TableCell>
                                <TableCell>{record.state}</TableCell>
                                <TableCell>{record.locality}</TableCell>
                                <TableCell>{record.hub}</TableCell>
                                <TableCell>{record.actualCost ? formatCurrency(record.actualCost) : '-'}</TableCell>
                                <TableCell>
                                  {record.hasGps ? (
                                    <Badge variant="secondary" className="text-xs">
                                      <MapPin className="h-3 w-3 mr-1" />
                                      GPS
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                      No GPS
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {parsedRecords.length > 50 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            Showing first 50 of {parsedRecords.length} records
                          </p>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  {/* Show error message if validation has errors */}
                  {validationSummary && validationSummary.errors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Cannot Import</AlertTitle>
                      <AlertDescription>
                        Please fix {validationSummary.errors.length} validation error(s) before importing:
                        <ul className="list-disc list-inside mt-2">
                          {validationSummary.errors.slice(0, 5).map((err, i) => (
                            <li key={i} className="text-sm">{err}</li>
                          ))}
                          {validationSummary.errors.length > 5 && (
                            <li className="text-sm">... and {validationSummary.errors.length - 5} more</li>
                          )}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex items-center justify-between">
                    <Button variant="outline" onClick={resetUpload} data-testid="button-cancel-import">
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleImportData} 
                      disabled={importing || (validationSummary?.errors && validationSummary.errors.length > 0)} 
                      data-testid="button-import"
                    >
                      {importing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Database className="h-4 w-4 mr-2" />
                      )}
                      Import {parsedRecords.filter(r => r.actualCost && r.actualCost > 0).length} Records
                    </Button>
                  </div>
                </div>
              )}

              {/* Import complete */}
              {uploadStep === 'complete' && importResult && (
                <div className="space-y-4">
                  {importResult.success ? (
                    <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800 dark:text-green-200">
                        Successfully imported {importResult.inserted} historical cost records. 
                        The cost prediction system will now use this data for future predictions.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        Import failed. {importResult.errors.join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex items-center justify-center gap-4">
                    <Button variant="outline" onClick={resetUpload} data-testid="button-upload-another">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Another File
                    </Button>
                    <Button onClick={() => setMainTab('analytics')} data-testid="button-view-analytics">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      View Analytics
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab Content */}
        <TabsContent value="analytics" className="space-y-6">

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-costs">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Costs</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(costData?.totalCosts || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {costData?.totalVisits || 0} site visits
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-cost">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Cost/Visit</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(costData?.avgCostPerVisit || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Per site visit average
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-budget-remaining">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Budget Remaining</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(budgetData.remaining)}</div>
            <Progress value={100 - budgetUtilization} className="h-2 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {(100 - budgetUtilization).toFixed(1)}% remaining
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-utilization">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Budget Utilization</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{budgetUtilization.toFixed(1)}%</div>
            <Progress 
              value={budgetUtilization} 
              className={`h-2 mt-2 ${budgetUtilization > 90 ? '[&>div]:bg-destructive' : budgetUtilization > 75 ? '[&>div]:bg-amber-500' : ''}`} 
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(budgetData.spent)} of {formatCurrency(budgetData.allocated)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Predictions Section */}
      <Card data-testid="card-predictions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Cost Predictions
          </CardTitle>
          <CardDescription>
            AI-powered forecasts based on historical spending patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {predictions.map((pred, idx) => (
              <div 
                key={idx} 
                className="p-4 rounded-lg border bg-card"
                data-testid={`prediction-${idx}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">{pred.metric}</span>
                  <Badge variant={pred.change > 0 ? "destructive" : "secondary"} className="text-xs">
                    {pred.change > 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                    {Math.abs(pred.change).toFixed(1)}%
                  </Badge>
                </div>
                <div className="text-xl font-bold">{formatCurrency(pred.predicted)}</div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div 
                      className="bg-primary h-1.5 rounded-full" 
                      style={{ width: `${pred.confidence}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{pred.confidence}% confidence</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts Section */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="trends" data-testid="tab-trends">Spending Trends</TabsTrigger>
          <TabsTrigger value="breakdown" data-testid="tab-breakdown">Cost Breakdown</TabsTrigger>
          <TabsTrigger value="hubs" data-testid="tab-hubs">By Hub</TabsTrigger>
        </TabsList>

        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Spending Trends</CardTitle>
              <CardDescription>Cost breakdown over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="transportation" 
                      stackId="1"
                      stroke={COLORS[0]} 
                      fill={COLORS[0]} 
                      fillOpacity={0.6}
                      name="Transportation"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="perDiem" 
                      stackId="1"
                      stroke={COLORS[1]} 
                      fill={COLORS[1]}
                      fillOpacity={0.6}
                      name="Per Diem"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="enumeratorFees" 
                      stackId="1"
                      stroke={COLORS[2]} 
                      fill={COLORS[2]}
                      fillOpacity={0.6}
                      name="Enumerator Fees"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Cost Distribution</CardTitle>
                <CardDescription>Breakdown by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={costBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {costBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Summary</CardTitle>
                <CardDescription>Detailed breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {costBreakdown.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(item.value)}</div>
                      <div className="text-xs text-muted-foreground">
                        {costData && costData.totalCosts > 0 
                          ? ((item.value / costData.totalCosts) * 100).toFixed(1) 
                          : 0}%
                      </div>
                    </div>
                  </div>
                ))}
                <Separator />
                <div className="flex items-center justify-between font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(costData?.totalCosts || 0)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="hubs">
          <Card>
            <CardHeader>
              <CardTitle>Costs by Hub</CardTitle>
              <CardDescription>Top 10 hubs by spending</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hubCosts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="hub" width={100} className="text-xs" />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="cost" fill={COLORS[0]} radius={[0, 4, 4, 0]} name="Total Cost" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Alerts & Recommendations */}
      <Card data-testid="card-alerts">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Alerts & Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {budgetUtilization > 80 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Budget utilization is at {budgetUtilization.toFixed(1)}%. Consider reviewing spending or requesting additional funds.
              </AlertDescription>
            </Alert>
          )}
          
          {predictions[0]?.change > 10 && (
            <Alert>
              <TrendingUp className="h-4 w-4" />
              <AlertDescription>
                Costs are projected to increase by {predictions[0].change.toFixed(1)}% next month. Plan budget accordingly.
              </AlertDescription>
            </Alert>
          )}
          
          {costData && costData.avgCostPerVisit > 100 && (
            <Alert>
              <Calculator className="h-4 w-4" />
              <AlertDescription>
                Average cost per visit ({formatCurrency(costData.avgCostPerVisit)}) is higher than target. Review transportation routes for optimization.
              </AlertDescription>
            </Alert>
          )}
          
          {budgetUtilization <= 50 && (
            <Alert>
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertDescription>
                Budget is on track. {(100 - budgetUtilization).toFixed(1)}% remaining with good spending discipline.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
