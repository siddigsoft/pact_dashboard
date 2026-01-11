import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
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
import { Input } from '@/components/ui/input';
import { 
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from '@/components/ui/tooltip';
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
  Database,
  Info,
  Navigation,
  Cpu,
  Search,
  Eye,
  Trash2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { CostPredictionService, type HistoricalSiteCost, type ParsedHistoricalRecord, type AccuracyMetrics, type CostPrediction, type VarianceAlert, type SiteEnrichmentData } from '@/services/costPrediction.service';
import { CostSparkline } from '@/components/mmp/CostSparkline';
import { VarianceAlertBanner } from '@/components/mmp/VarianceAlertBanner';
import { ExchangeRatePanel } from '@/components/mmp/ExchangeRatePanel';
import { normalizeStateId, normalizeLocalityId } from '@/utils/siteNormalization';
import { normalizeHubId, getNormalizedHubName, hubs } from '@/data/sudanStates';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
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
  recordsWithCosts: number;
  duplicateRecords?: number;
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
  // Additional fields from user's file
  siteId?: string;
  activityType?: string;
  implementingPartner?: string;
  monitoringType?: string;
  enumeratorName?: string;
  matchedSiteId?: string;
  hasGps: boolean;
  isNewSite: boolean;
  validationStatus: 'valid' | 'warning' | 'error';
  validationMessage?: string;
  enrichment?: SiteEnrichmentData;
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
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [detectedCostColumns, setDetectedCostColumns] = useState<string[]>([]);
  const [uploadStep, setUploadStep] = useState<'select' | 'validate' | 'import' | 'complete'>('select');
  const [importResult, setImportResult] = useState<{ success: boolean; inserted: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [registrySites, setRegistrySites] = useState<Map<string, any>>(new Map());
  const [accuracyMetrics, setAccuracyMetrics] = useState<AccuracyMetrics | null>(null);
  const [loadingAccuracy, setLoadingAccuracy] = useState(false);
  
  const [sitePredictions, setSitePredictions] = useState<CostPrediction[]>([]);
  const [loadingSitePredictions, setLoadingSitePredictions] = useState(false);
  const [varianceAlerts, setVarianceAlerts] = useState<VarianceAlert[]>([]);
  const [siteSearchQuery, setSiteSearchQuery] = useState('');
  const [historicalCostData, setHistoricalCostData] = useState<Map<string, Array<{date: string; cost: number}>>>(new Map());
  const [algorithmStats, setAlgorithmStats] = useState<{algorithm: string; count: number; avgConfidence: number}[]>([]);
  
  // Historical data viewer state
  const [uploadedHistoricalData, setUploadedHistoricalData] = useState<any[]>([]);
  const [historicalDataStats, setHistoricalDataStats] = useState({ total: 0, linked: 0, unlinked: 0 });
  const [loadingHistoricalData, setLoadingHistoricalData] = useState(false);
  const [historicalDataPage, setHistoricalDataPage] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const { isSuperAdmin } = useSuperAdmin();

  const fetchAccuracyMetrics = async () => {
    try {
      setLoadingAccuracy(true);
      const metrics = await CostPredictionService.calculateAccuracyMetrics();
      setAccuracyMetrics(metrics);
    } catch (err) {
      console.error('Error fetching accuracy metrics:', err);
    } finally {
      setLoadingAccuracy(false);
    }
  };

  const fetchUploadedHistoricalData = async (page: number = 0) => {
    try {
      setLoadingHistoricalData(true);
      const result = await CostPredictionService.getHistoricalCosts({ 
        limit: 50, 
        offset: page * 50 
      });
      setUploadedHistoricalData(result.data);
      setHistoricalDataStats({
        total: result.total,
        linked: result.linked_count,
        unlinked: result.unlinked_count
      });
      setHistoricalDataPage(page);
    } catch (err) {
      console.error('Error fetching historical data:', err);
    } finally {
      setLoadingHistoricalData(false);
    }
  };

  const fetchSitePredictions = async () => {
    try {
      setLoadingSitePredictions(true);
      
      const { data: sites, error } = await supabase
        .from('sites_registry')
        .select('id, site_code, site_name, state_name, locality_name, hub_id, gps_latitude, gps_longitude')
        .limit(100);
      
      if (error || !sites) {
        console.error('Error fetching sites:', error);
        return;
      }

      const sitesForPrediction = sites.map(s => ({
        id: s.id,
        site_id: s.site_code || s.id,
        state: s.state_name,
        state_name: s.state_name,
        locality: s.locality_name,
        locality_name: s.locality_name,
        hub_id: s.hub_id
      }));
      
      const predictionsMap = await CostPredictionService.batchPredictCosts(sitesForPrediction);
      
      const predictionsArray: CostPrediction[] = [];
      const algoCounts: Record<string, { count: number; totalConfidence: number }> = {};
      
      predictionsMap.forEach((pred, siteId) => {
        const site = sites.find(s => s.id === siteId);
        if (pred && site) {
          predictionsArray.push({
            ...pred,
            site_id: siteId,
            site_name: site.site_name
          } as CostPrediction & { site_name: string });
          
          const algo = pred.algorithm_used || 'unknown';
          if (!algoCounts[algo]) {
            algoCounts[algo] = { count: 0, totalConfidence: 0 };
          }
          algoCounts[algo].count++;
          algoCounts[algo].totalConfidence += pred.confidence || 0;
        }
      });
      
      setSitePredictions(predictionsArray);
      
      const statsArray = Object.entries(algoCounts).map(([algorithm, data]) => ({
        algorithm,
        count: data.count,
        avgConfidence: Math.round(data.totalConfidence / data.count)
      })).sort((a, b) => b.count - a.count);
      
      setAlgorithmStats(statsArray);
      
      const siteIdLookups = sites.map(s => s.site_code || s.id);
      const { data: historicalData } = await supabase
        .from('historical_site_costs')
        .select('site_id, actual_cost, visit_date')
        .in('site_id', siteIdLookups)
        .order('visit_date', { ascending: true });
      
      if (historicalData) {
        const costMap = new Map<string, Array<{date: string; cost: number}>>();
        historicalData.forEach(record => {
          const site = sites.find(s => (s.site_code || s.id) === record.site_id);
          if (site) {
            const existing = costMap.get(site.id) || [];
            existing.push({
              date: record.visit_date || new Date().toISOString(),
              cost: record.actual_cost
            });
            costMap.set(site.id, existing);
          }
        });
        setHistoricalCostData(costMap);
      }
      
    } catch (err) {
      console.error('Error fetching site predictions:', err);
    } finally {
      setLoadingSitePredictions(false);
    }
  };

  const fetchVarianceAlerts = async () => {
    try {
      const { data: recentCosts, error } = await supabase
        .from('cost_submissions')
        .select('site_visit_id, total_cost, transportation_cost, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error || !recentCosts) return;
      
      const alerts: VarianceAlert[] = [];
      
      for (const cost of recentCosts) {
        if (!cost.site_visit_id) continue;
        
        const { data: visit } = await supabase
          .from('site_visits')
          .select('site_name, site_id, state, locality, hub_id')
          .eq('id', cost.site_visit_id)
          .single();
        
        if (!visit) continue;
        
        const siteIdentifier = visit.site_id || visit.site_name;
        if (!siteIdentifier) continue;
        
        const prediction = await CostPredictionService.predictCostForSite(
          siteIdentifier,
          visit.state,
          visit.locality,
          visit.hub_id
        );
        if (!prediction) continue;
        
        const actualCost = cost.total_cost || cost.transportation_cost || 0;
        const alert = CostPredictionService.checkVariance(
          visit.site_name || 'Unknown Site',
          siteIdentifier,
          prediction.predicted_cost,
          actualCost
        );
        
        if (alert) {
          alerts.push(alert);
        }
      }
      
      setVarianceAlerts(alerts);
    } catch (err) {
      console.error('Error fetching variance alerts:', err);
    }
  };

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
    fetchAccuracyMetrics();
    fetchSitePredictions();
    fetchVarianceAlerts();
  }, [selectedPeriod, selectedHub]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCostData();
    fetchAccuracyMetrics();
    fetchSitePredictions();
    fetchVarianceAlerts();
  };

  const filteredPredictions = useMemo(() => {
    if (!siteSearchQuery.trim()) return sitePredictions;
    const query = siteSearchQuery.toLowerCase();
    return sitePredictions.filter(p => 
      (p as any).site_name?.toLowerCase().includes(query) ||
      p.site_id?.toLowerCase().includes(query)
    );
  }, [sitePredictions, siteSearchQuery]);

  const getAlgorithmLabel = (algo: string): string => {
    const labels: Record<string, string> = {
      'exponential_smoothing': 'Exponential Smoothing',
      'site_average': 'Site Average',
      'locality_median': 'Locality Median',
      'state_median': 'State Median',
      'hub_median': 'Hub Median',
      'unknown': 'Unknown'
    };
    return labels[algo] || algo;
  };

  const getAlgorithmColor = (algo: string): string => {
    const colors: Record<string, string> = {
      'exponential_smoothing': 'hsl(var(--chart-1))',
      'site_average': 'hsl(var(--chart-2))',
      'locality_median': 'hsl(var(--chart-3))',
      'state_median': 'hsl(var(--chart-4))',
      'hub_median': 'hsl(var(--chart-5))',
      'unknown': 'hsl(var(--muted))'
    };
    return colors[algo] || 'hsl(var(--muted))';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SDG',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const loadRegistrySites = async (): Promise<Map<string, any>> => {
    try {
      const siteMap = new Map();
      const BATCH_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      let totalLoaded = 0;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('sites_registry')
          .select('*')
          .range(offset, offset + BATCH_SIZE - 1);
        
        if (error) {
          console.error('[CostPredictions] Error fetching sites batch:', error);
          break;
        }
        
        if (data && data.length > 0) {
          data.forEach(site => {
            const key = `${site.site_name?.toLowerCase()}-${site.state_name?.toLowerCase()}-${site.locality_name?.toLowerCase()}`;
            siteMap.set(key, site);
            if (site.id) {
              siteMap.set(site.id, site);
            }
            if (site.site_code) {
              siteMap.set(site.site_code.toLowerCase(), site);
            }
          });
          totalLoaded += data.length;
          offset += BATCH_SIZE;
          hasMore = data.length === BATCH_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      setRegistrySites(siteMap);
      console.log('[CostPredictions] Loaded', totalLoaded, 'registry sites (paginated)');
      return siteMap;
    } catch (err) {
      console.error('Error loading registry sites:', err);
      return new Map();
    }
  };

  useEffect(() => {
    if (mainTab === 'upload') {
      loadRegistrySites();
      fetchUploadedHistoricalData(0); // Load stats for the manage section
    }
    if (mainTab === 'analytics' && historicalDataStats.total === 0) {
      // Auto-load historical data when viewing analytics
      fetchUploadedHistoricalData(0);
    }
  }, [mainTab]);

  // Download template for historical cost data upload
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Site Name': 'Example Site ABC',
        'State': 'Red Sea',
        'Locality': 'Port Sudan',
        'Hub': 'Port Sudan Hub',
        'Month': '2024-01-01',
        'Actual Cost': 50000,
        'Transportation Means': 'Vehicle'
      },
      {
        'Site Name': 'Another Site XYZ',
        'State': 'Kassala',
        'Locality': 'Kassala Town',
        'Hub': 'Kassala Hub',
        'Month': '2024-02-01',
        'Actual Cost': 35000,
        'Transportation Means': 'Motorcycle'
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 25 }, // Site Name
      { wch: 15 }, // State
      { wch: 20 }, // Locality
      { wch: 18 }, // Hub
      { wch: 12 }, // Month
      { wch: 12 }, // Actual Cost
      { wch: 20 }, // Transportation Means
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historical Costs');
    
    // Add instructions sheet
    const instructionsData = [
      { Field: 'Site Name', Required: 'Yes', Description: 'Name of the site (must match registry or MMP uploaded sites)' },
      { Field: 'State', Required: 'Yes', Description: 'State where the site is located' },
      { Field: 'Locality', Required: 'Yes', Description: 'Locality where the site is located' },
      { Field: 'Hub', Required: 'No', Description: 'WFP Hub managing this site' },
      { Field: 'Month', Required: 'Yes', Description: 'Month of the visit (YYYY-MM-DD format, use first day of month e.g. 2024-01-01)' },
      { Field: 'Actual Cost', Required: 'Yes', Description: 'Transportation cost in SDG (numbers only)' },
      { Field: 'Transportation Means', Required: 'No', Description: 'Mode of transportation (Vehicle, Motorcycle, etc.)' },
    ];
    const wsInstructions = XLSX.utils.json_to_sheet(instructionsData);
    wsInstructions['!cols'] = [
      { wch: 22 },
      { wch: 10 },
      { wch: 60 },
    ];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');
    
    XLSX.writeFile(wb, 'historical_cost_template.xlsx');
    toast.success('Template downloaded successfully');
  };

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
      // Ensure registry is loaded and use the returned map directly
      let siteMap = registrySites;
      if (registrySites.size === 0) {
        console.log('[CostPredictions] Registry not loaded, loading now...');
        siteMap = await loadRegistrySites();
      }
      
      console.log('[CostPredictions] Starting validation with', siteMap.size, 'registry sites');
      
      // Load existing historical costs to check for duplicates
      const { data: existingCosts } = await supabase
        .from('historical_site_costs')
        .select('site_id, site_name, state_id, locality_id, visit_date');
      
      // Build a set of existing site+month combinations for duplicate detection
      // Use site_id + month as primary key (more reliable than name matching)
      // Also build fallback keys using site_name + state_id for new sites
      const existingMonthKeys = new Set<string>();
      existingCosts?.forEach(cost => {
        if (cost.visit_date) {
          const monthKey = cost.visit_date.substring(0, 7); // YYYY-MM
          
          // Primary key: site_id + month (for matched sites)
          if (cost.site_id) {
            existingMonthKeys.add(`${cost.site_id}-${monthKey}`);
          }
          
          // Fallback key: site_name + state_id + month (for new sites comparison)
          if (cost.site_name && cost.state_id) {
            const fallbackKey = `${(cost.site_name || '').toLowerCase().trim()}-${(cost.state_id || '').toLowerCase().trim()}-${monthKey}`;
            existingMonthKeys.add(fallbackKey);
          }
        }
      });
      console.log('[CostPredictions] Found', existingCosts?.length || 0, 'existing records and', existingMonthKeys.size, 'unique site-month combinations');
      if (existingMonthKeys.size > 0) {
        console.log('[CostPredictions] Sample existing keys:', Array.from(existingMonthKeys).slice(0, 5));
      }
      
      const data = await uploadFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      const allRecords: ParsedRecord[] = [];
      let rowCounter = 0;
      
      // Track site+month combinations within THIS upload file to detect in-file duplicates
      const uploadFileMonthKeys = new Set<string>();

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        console.log('[CostPredictions] Sheet', sheetName, 'has', jsonData.length, 'rows');
        
        // Log first row columns for debugging
        if (jsonData.length > 0) {
          const firstRow = jsonData[0] as any;
          const columns = Object.keys(firstRow);
          console.log('[CostPredictions] Available columns (with index):', columns.map((c, i) => `${i+1}:${c}`));
          console.log('[CostPredictions] First row data:', firstRow);
          
          // Log date-related columns specifically
          const dateColumns = columns.filter(col => 
            col.toLowerCase().includes('date') || 
            col.toLowerCase().includes('month') || 
            col.toLowerCase().includes('period') ||
            col.toLowerCase().includes('visit')
          );
          console.log('[CostPredictions] Potential date columns found:', dateColumns);
          
          setDetectedColumns(columns);
          
          // Find any column that might contain cost data
          const costColumns = columns.filter(col => 
            col.toLowerCase().includes('cost') || 
            col.toLowerCase().includes('amount') || 
            col.toLowerCase().includes('price')
          );
          console.log('[CostPredictions] Potential cost columns found:', costColumns);
          setDetectedCostColumns(costColumns);
          costColumns.forEach(col => {
            console.log(`[CostPredictions] Column "${col}" has value:`, firstRow[col], 'type:', typeof firstRow[col]);
          });
        }
        
        for (const row of jsonData as any[]) {
          rowCounter++;
          
          // Helper to find column value case-insensitively with flexible matching
          const getColumnValue = (keys: string[], allowPartialMatch = false): string => {
            // First try exact matches (case-insensitive)
            for (const key of keys) {
              if (row[key] !== undefined && row[key] !== null && row[key] !== '') return String(row[key]);
              // Try case-insensitive match with trimming
              const rowKey = Object.keys(row).find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
              if (rowKey && row[rowKey] !== undefined && row[rowKey] !== null && row[rowKey] !== '') {
                return String(row[rowKey]);
              }
            }
            
            // If partial match allowed, try finding columns that contain the key
            if (allowPartialMatch) {
              for (const key of keys) {
                const lowerKey = key.toLowerCase().trim();
                const rowKey = Object.keys(row).find(k => 
                  k.toLowerCase().trim().includes(lowerKey) || 
                  lowerKey.includes(k.toLowerCase().trim())
                );
                if (rowKey && row[rowKey] !== undefined && row[rowKey] !== null && row[rowKey] !== '') {
                  return String(row[rowKey]);
                }
              }
            }
            
            return '';
          };
          
          // Find cost column with flexible matching
          const getCostValue = (): number => {
            const costKeys = [
              'Actual Cost', 'actual_cost', 'ActualCost',
              'Total Cost', 'total_cost', 'TotalCost',
              'Transportation Cost', 'transportation_cost', 'TransportationCost',
              'Cost', 'cost',
              '3.1 Total transportation cost',
              'Amount', 'amount'
            ];
            
            // Direct key match
            for (const key of costKeys) {
              if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                const val = parseFloat(String(row[key]).replace(/[^0-9.-]/g, ''));
                if (!isNaN(val) && val > 0) return val;
              }
            }
            
            // Case-insensitive partial match
            for (const rowKey of Object.keys(row)) {
              const lowerKey = rowKey.toLowerCase();
              if (lowerKey.includes('cost') || lowerKey.includes('amount') || lowerKey.includes('price')) {
                const val = parseFloat(String(row[rowKey]).replace(/[^0-9.-]/g, ''));
                if (!isNaN(val) && val > 0) {
                  if (rowCounter === 1) console.log('[CostPredictions] Found cost in column:', rowKey, 'value:', val);
                  return val;
                }
              }
            }
            
            return 0;
          };
          
          // Core required fields - exact column names from user's file
          const siteName = getColumnValue([
            '1.10 Select The activity site', 
            'Site Name', 'site_name', 'SiteName', 'Site',
            'Activity Site', 'activity_site'
          ]);
          const state = getColumnValue([
            '1.8 State of the site/where the site is located', 
            'State', 'state', 'State Name', 'state_name'
          ]);
          const locality = getColumnValue([
            '1.9 Locality of the site/where the site is located', 
            'Locality', 'locality', 'Locality Name', 'locality_name'
          ]);
          const rawHub = getColumnValue([
            '1.7 WFP HUB', 
            'Hub', 'hub', 'WFP HUB', 'Hub Office', 'hub_office'
          ]);
          // Normalize hub to match system hub IDs
          const normalizedHubId = normalizeHubId(rawHub);
          const hub = normalizedHubId 
            ? (hubs.find(h => h.id === normalizedHubId)?.name || rawHub)
            : rawHub;
          
          // Additional fields from user's file
          const siteId = getColumnValue(['siteID', 'site_id', 'SiteID', 'Site ID']);
          const activityConfirm = getColumnValue([
            '1.10a Confirm the activity of the site from the monthly monitoring plan',
            'Activity Confirm', 'activity_confirm'
          ]);
          const implementingPartner = getColumnValue([
            '1.10c Name of Implementing Partner',
            'Implementing Partner', 'IP', 'Partner', 'implementing_partner'
          ]);
          const otherIP = getColumnValue([
            '1.10d Other Implementing Partner',
            'Other IP', 'other_ip', 'Other Partner'
          ]);
          const monitoringType = getColumnValue([
            '1.11 What kind of process monitoring are you going to conduct?',
            'Monitoring Type', 'monitoring_type', 'Process Monitoring'
          ]);
          const activityType = getColumnValue([
            '1.12 What is the specific activity you are monitoring?',
            'Activity Type', 'activity_type', 'Specific Activity', 'Activity'
          ]);
          const enumeratorName = getColumnValue([
            'Name of Enumators', 'Name of Enumerators', 
            'Enumerator', 'enumerator', 'Enumerator Name', 'enumerator_name',
            'Data Collector', 'data_collector'
          ]);
          
          // Try exact match first, then partial match for date column
          let visitDate = getColumnValue([
            'Visit Date', 'visit_date', '2.1 Date of visit', 'Date', 'date',
            'Month', 'month', 'Visit Month', 'visit_month', 'Period', 'period',
            'Report Month', 'report_month', 'Data Collection Date', 'data_collection_date',
            '1.6 Date of visit', '1.5 Date of visit', 'VisitDate', 'visitDate',
            '2.5 Visit Date', 'Collection Date', 'Survey Date'
          ], false);
          
          // If no date found, try partial matching
          if (!visitDate) {
            visitDate = getColumnValue(['month', 'date', 'visit', 'period'], true);
          }
          
          // Log first few rows to debug
          if (rowCounter <= 3) {
            console.log(`[CostPredictions] Row ${rowCounter} visitDate:`, visitDate, '| Raw row keys:', Object.keys(row));
          }
          const actualCost = getCostValue();
          const transportMode = getColumnValue([
            'Transportation Type', 'Transport Type',
            'Transportation Means', 'Transport Mode', 'transport_mode', 
            '2.2 Transportation means', 'TransportMode'
          ]);

          if (!siteName || !state || !locality) {
            continue;
          }

          const siteKey = `${siteName.toLowerCase()}-${state.toLowerCase()}-${locality.toLowerCase()}`;
          const matchedSite = siteMap.get(siteKey);
          
          let validationStatus: 'valid' | 'warning' | 'error' = 'valid';
          let validationMessage = '';
          let isDuplicate = false;
          let parsedMonthKey: string | null = null;

          // Visit date/month - use current month as fallback if not provided
          let normalizedDateStr: string | null = null; // YYYY-MM-01 format
          
          if (!visitDate) {
            // Use current month as default when date is not provided
            const now = new Date();
            const currentMonth = now.toISOString().substring(0, 7); // YYYY-MM
            normalizedDateStr = `${currentMonth}-01`;
            validationStatus = 'warning';
            validationMessage = 'No date column found - using current month as default';
          } else {
            let parsedDate: Date | null = null;
            try {
              // Handle various date formats
              if (typeof visitDate === 'number') {
                // Excel serial date - convert properly
                parsedDate = new Date((visitDate - 25569) * 86400 * 1000);
              } else if (typeof visitDate === 'string') {
                // Try parsing string date
                parsedDate = new Date(visitDate);
              }
              
              if (!parsedDate || isNaN(parsedDate.getTime())) {
                validationStatus = 'error';
                validationMessage = `Invalid date format: "${visitDate}" - please use YYYY-MM-DD format`;
              } else {
                // Normalize to first day of month for consistent storage
                parsedMonthKey = parsedDate.toISOString().substring(0, 7); // YYYY-MM
                normalizedDateStr = `${parsedMonthKey}-01`; // YYYY-MM-01
                
                // Use site_id for duplicate detection (more reliable than site_name+state)
                // For matched sites, use their ID; for new sites, use normalized name+state
                const normalizedStateForKey = normalizeStateId(state) || state.toLowerCase().trim().replace(/\s+/g, '-');
                const dupCheckKey = matchedSite 
                  ? `${matchedSite.id}-${parsedMonthKey}` 
                  : `${siteName.toLowerCase().trim()}-${normalizedStateForKey}-${parsedMonthKey}`;
                
                if (existingMonthKeys.has(dupCheckKey)) {
                  validationStatus = 'error';
                  validationMessage = `Duplicate: Cost for this site already exists in database for ${parsedMonthKey}`;
                  isDuplicate = true;
                  if (rowCounter <= 5) {
                    console.log('[CostPredictions] Database duplicate found:', dupCheckKey);
                  }
                } else if (uploadFileMonthKeys.has(dupCheckKey)) {
                  // Duplicate within the same upload file
                  validationStatus = 'error';
                  validationMessage = `Duplicate: This site appears multiple times in your file for ${parsedMonthKey}`;
                  isDuplicate = true;
                  if (rowCounter <= 5) {
                    console.log('[CostPredictions] In-file duplicate found:', dupCheckKey);
                  }
                } else {
                  // Add to tracking set for in-file duplicate detection
                  uploadFileMonthKeys.add(dupCheckKey);
                }
              }
            } catch (e) {
              validationStatus = 'error';
              validationMessage = `Date parsing error: "${visitDate}"`;
            }
          }

          if (!isDuplicate && validationStatus !== 'error') {
            if (!matchedSite) {
              // BLOCKING: Sites must exist in registry or MMP uploads
              validationStatus = 'error';
              validationMessage = 'Site not found in registry - must be uploaded via MMP first';
            } else if (!matchedSite.gps_latitude || !matchedSite.gps_longitude) {
              validationStatus = 'warning';
              validationMessage = 'Site found but missing GPS coordinates';
            }
          }

          allRecords.push({
            rowNumber: rowCounter,
            siteName: siteName.trim(),
            state: state.trim(),
            locality: locality.trim(),
            hub: hub.trim(),
            visitDate: normalizedDateStr || (visitDate ? String(visitDate) : undefined), // Use normalized YYYY-MM-01 format
            actualCost: actualCost || undefined,
            transportMode: transportMode?.trim() || undefined,
            // Additional fields from user's file
            siteId: siteId?.trim() || undefined,
            activityType: activityType?.trim() || activityConfirm?.trim() || undefined,
            implementingPartner: implementingPartner?.trim() || otherIP?.trim() || undefined,
            monitoringType: monitoringType?.trim() || undefined,
            enumeratorName: enumeratorName?.trim() || undefined,
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
      const recordsWithCosts = allRecords.filter(r => r.actualCost && r.actualCost > 0);
      const duplicateRecords = allRecords.filter(r => r.validationStatus === 'error' && r.validationMessage?.includes('Duplicate'));
      const missingDateRecords = allRecords.filter(r => r.validationStatus === 'error' && (r.validationMessage?.includes('Missing visit date') || r.validationMessage?.includes('Invalid date')));
      const uniqueStates = new Set(allRecords.map(r => r.state));
      const uniqueLocalities = new Set(allRecords.map(r => r.locality));

      // Calculate importable records (non-duplicate, has cost, valid date)
      const importableRecords = allRecords.filter(r => r.actualCost && r.actualCost > 0 && r.validationStatus !== 'error');
      
      // Check 12 months limit per site
      const siteMonthCounts = new Map<string, Set<string>>();
      existingCosts?.forEach(cost => {
        if (cost.site_id && cost.visit_date) {
          if (!siteMonthCounts.has(cost.site_id)) {
            siteMonthCounts.set(cost.site_id, new Set());
          }
          siteMonthCounts.get(cost.site_id)!.add(cost.visit_date.substring(0, 7));
        }
      });
      
      // Check if any importable records would exceed 12 months limit
      const sitesExceeding12Months: string[] = [];
      importableRecords.forEach(r => {
        if (r.matchedSiteId && r.visitDate) {
          const existingMonths = siteMonthCounts.get(r.matchedSiteId) || new Set();
          // Count unique months if this record is added
          let parsedDate: Date | null = null;
          if (typeof r.visitDate === 'string') {
            parsedDate = new Date(r.visitDate);
          }
          if (parsedDate && !isNaN(parsedDate.getTime())) {
            const monthKey = parsedDate.toISOString().substring(0, 7);
            existingMonths.add(monthKey);
            if (existingMonths.size > 12 && !sitesExceeding12Months.includes(r.siteName)) {
              sitesExceeding12Months.push(r.siteName);
            }
          }
        }
      });
      
      // Count unmatched sites (sites not in registry)
      const unmatchedSiteRecords = allRecords.filter(r => r.validationStatus === 'error' && r.validationMessage?.includes('Site not found in registry'));
      
      // Build error messages
      const errors: string[] = [];
      if (unmatchedSiteRecords.length > 0) {
        errors.push(`${unmatchedSiteRecords.length} records have sites not found in the registry - these must be uploaded via MMP first`);
      }
      if (missingDateRecords.length > 0) {
        errors.push(`${missingDateRecords.length} records are missing or have invalid visit dates (month is required)`);
      }
      if (duplicateRecords.length > 0) {
        errors.push(`${duplicateRecords.length} duplicate records will be skipped`);
      }
      if (duplicateRecords.length === recordsWithCosts.length && recordsWithCosts.length > 0) {
        errors.push('ALL records in this file already exist in the database. This file appears to have been uploaded before.');
      }
      if (importableRecords.length === 0 && allRecords.length > 0) {
        errors.push('No new records to import - all records are either duplicates, missing dates, unmatched sites, or missing cost data');
      }
      if (sitesExceeding12Months.length > 0) {
        errors.push(`Warning: ${sitesExceeding12Months.length} site(s) will have more than 12 months of data: ${sitesExceeding12Months.slice(0, 3).join(', ')}${sitesExceeding12Months.length > 3 ? '...' : ''}`);
      }
      
      const summary = {
        totalRecords: allRecords.length,
        matchedSites: matchedSites.length,
        matchedWithGps: matchedWithGps.length,
        matchedWithoutGps: matchedWithoutGps.length,
        newSites: newSites.length, // Now counted as errors (sites not in registry)
        unmatchedSites: unmatchedSiteRecords.length, // Sites not found in registry
        recordsWithCosts: recordsWithCosts.length,
        duplicateRecords: duplicateRecords.length,
        validatedStates: uniqueStates.size,
        invalidStates: [],
        validatedLocalities: uniqueLocalities.size,
        invalidLocalities: [],
        errors
      };
      
      console.log('[CostPredictions] Validation complete:', summary);
      
      // Enrich matched sites with visit history and predictions
      const matchedSiteIds = [...new Set(matchedSites.map(r => r.matchedSiteId).filter(Boolean) as string[])];
      if (matchedSiteIds.length > 0) {
        console.log(`[CostPredictions] Enriching ${matchedSiteIds.length} matched sites with visit history...`);
        
        // Build metadata map for predictions
        const siteMetadata = new Map<string, { state: string; locality: string; hub?: string }>();
        matchedSites.forEach(r => {
          if (r.matchedSiteId) {
            siteMetadata.set(r.matchedSiteId, { state: r.state, locality: r.locality, hub: r.hub || undefined });
          }
        });
        
        const enrichmentData = await CostPredictionService.getSiteEnrichmentBatch(matchedSiteIds, siteMetadata);
        
        // Attach enrichment data to records
        allRecords.forEach(r => {
          if (r.matchedSiteId && enrichmentData.has(r.matchedSiteId)) {
            r.enrichment = enrichmentData.get(r.matchedSiteId);
          }
        });
        
        console.log(`[CostPredictions] Enrichment complete for ${enrichmentData.size} sites`);
      }
      
      setValidationSummary(summary);
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
        recordsWithCosts: 0,
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
      // Filter out duplicates and records without cost
      const validRecords = parsedRecords.filter(r => r.actualCost && r.actualCost > 0 && r.validationStatus !== 'error');
      
      // Step 1: Register new sites to the sites_registry first
      const newSiteRecords = validRecords.filter(r => r.isNewSite);
      const uniqueNewSites = new Map<string, typeof newSiteRecords[0]>();
      
      // Deduplicate new sites by name+state+locality
      newSiteRecords.forEach(r => {
        const key = `${r.siteName.toLowerCase()}-${r.state.toLowerCase()}-${r.locality.toLowerCase()}`;
        if (!uniqueNewSites.has(key)) {
          uniqueNewSites.set(key, r);
        }
      });
      
      let registeredSitesCount = 0;
      const newSiteIdMap = new Map<string, string>(); // Map old key to new site ID
      
      if (uniqueNewSites.size > 0) {
        console.log(`[CostPredictions] Registering ${uniqueNewSites.size} new sites to registry...`);
        
        const sitesToRegister = Array.from(uniqueNewSites.values()).map(r => {
          const normalizedStateId = normalizeStateId(r.state) || r.state.toLowerCase().trim().replace(/\s+/g, '-');
          const normalizedLocalityId = normalizeLocalityId(r.locality, normalizedStateId) || r.locality.toLowerCase().trim().replace(/\s+/g, '-');
          
          return {
            site_name: r.siteName.trim(),
            state_name: r.state.trim(),
            locality_name: r.locality.trim(),
            hub_id: r.hub?.toLowerCase().trim().replace(/\s+/g, '-') || null,
            created_at: new Date().toISOString(),
            source: 'historical_upload'
          };
        });
        
        const { data: insertedSites, error: registryError } = await supabase
          .from('sites_registry')
          .insert(sitesToRegister)
          .select('id, site_name, state_name, locality_name');
        
        if (registryError) {
          console.error('[CostPredictions] Failed to register sites:', registryError);
        } else if (insertedSites) {
          registeredSitesCount = insertedSites.length;
          console.log(`[CostPredictions] Registered ${registeredSitesCount} new sites`);
          
          // Build mapping from site key to new ID
          insertedSites.forEach(site => {
            const key = `${site.site_name?.toLowerCase()}-${site.state_name?.toLowerCase()}-${site.locality_name?.toLowerCase()}`;
            newSiteIdMap.set(key, site.id);
          });
        }
      }
      
      // Step 2: Now insert historical costs with proper site IDs
      const recordsToInsert: HistoricalSiteCost[] = validRecords.map(r => {
        const matchedSite = r.matchedSiteId ? registrySites.get(r.matchedSiteId) : null;
        const normalizedStateId = normalizeStateId(r.state) || r.state.toLowerCase().trim().replace(/\s+/g, '-');
        const normalizedLocalityId = normalizeLocalityId(r.locality, normalizedStateId) || r.locality.toLowerCase().trim().replace(/\s+/g, '-');
        
        // Check if this was a new site that we just registered
        const siteKey = `${r.siteName.toLowerCase()}-${r.state.toLowerCase()}-${r.locality.toLowerCase()}`;
        const newSiteId = newSiteIdMap.get(siteKey);
        
        return {
          site_id: r.matchedSiteId || newSiteId || `NEW-${r.siteName.replace(/\s+/g, '-').toUpperCase()}`,
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
      
      // Add info about registered sites to the result
      if (registeredSitesCount > 0) {
        result.errors = result.errors || [];
        result.errors.unshift(`Also registered ${registeredSitesCount} new sites to the registry`);
      }
      
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

  const handleDeleteAllHistoricalData = async () => {
    if (!isSuperAdmin) {
      toast.error('Only Super Admins can delete historical cost data');
      return;
    }
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('historical_site_costs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
      
      if (error) {
        console.error('[CostPredictions] Delete failed:', error);
        toast.error('Failed to delete historical data: ' + error.message);
      } else {
        toast.success('All historical cost data has been deleted');
        setShowDeleteConfirm(false);
        // Refresh the historical data stats
        setHistoricalDataStats({ total: 0, linked: 0, unlinked: 0 });
        setUploadedHistoricalData([]);
        // Reset upload state so user can re-upload
        resetUpload();
      }
    } catch (err: any) {
      console.error('[CostPredictions] Delete error:', err);
      toast.error('Failed to delete: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const [deletingDuplicates, setDeletingDuplicates] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [showDeleteDuplicatesConfirm, setShowDeleteDuplicatesConfirm] = useState(false);

  // Find and count duplicate records (same site_id + month)
  // Paginates through all records to handle large datasets
  const findDuplicates = async () => {
    const allCosts: Array<{ id: string; site_id: string | null; site_name: string | null; state_id: string | null; visit_date: string | null; created_at: string | null }> = [];
    let page = 0;
    const pageSize = 1000;
    
    // Paginate through all records
    while (true) {
      const { data: pageCosts, error } = await supabase
        .from('historical_site_costs')
        .select('id, site_id, site_name, state_id, visit_date, created_at')
        .order('created_at', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error('[CostPredictions] Error fetching costs for duplicate check:', error);
        break;
      }
      
      if (!pageCosts || pageCosts.length === 0) break;
      
      allCosts.push(...pageCosts);
      
      if (pageCosts.length < pageSize) break; // Last page
      page++;
    }

    if (allCosts.length === 0) {
      setDuplicateCount(0);
      return { duplicateIds: [], count: 0 };
    }

    console.log(`[CostPredictions] Checking ${allCosts.length} records for duplicates`);

    // Group by site_id + month
    const groups = new Map<string, typeof allCosts>();
    allCosts.forEach(cost => {
      if (cost.visit_date) {
        const monthKey = cost.visit_date.substring(0, 7); // YYYY-MM
        const siteKey = cost.site_id || `${cost.site_name}-${cost.state_id}`;
        const groupKey = `${siteKey}-${monthKey}`;
        
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(cost);
      }
    });

    // Find duplicates (all records after the first in each group)
    const duplicateIds: string[] = [];
    groups.forEach(records => {
      if (records.length > 1) {
        // Keep the first (oldest), mark rest as duplicates
        records.slice(1).forEach(r => duplicateIds.push(r.id));
      }
    });

    console.log(`[CostPredictions] Found ${duplicateIds.length} duplicate records`);
    setDuplicateCount(duplicateIds.length);
    return { duplicateIds, count: duplicateIds.length };
  };

  const handleDeleteDuplicatesOnly = async () => {
    if (!isSuperAdmin) {
      toast.error('Only Super Admins can delete historical cost data');
      return;
    }
    
    setDeletingDuplicates(true);
    try {
      const { duplicateIds, count } = await findDuplicates();
      
      if (count === 0) {
        toast.success('No duplicate records found');
        setShowDeleteDuplicatesConfirm(false);
        return;
      }

      // Delete duplicates in batches of 100
      let deletedCount = 0;
      for (let i = 0; i < duplicateIds.length; i += 100) {
        const batch = duplicateIds.slice(i, i + 100);
        const { error } = await supabase
          .from('historical_site_costs')
          .delete()
          .in('id', batch);
        
        if (error) {
          console.error('[CostPredictions] Batch delete failed:', error);
          throw error;
        }
        deletedCount += batch.length;
      }

      toast.success(`Deleted ${deletedCount} duplicate records`);
      setShowDeleteDuplicatesConfirm(false);
      setDuplicateCount(0);
      // Refresh stats
      fetchUploadedHistoricalData(0);
    } catch (err: any) {
      console.error('[CostPredictions] Delete duplicates error:', err);
      toast.error('Failed to delete duplicates: ' + err.message);
    } finally {
      setDeletingDuplicates(false);
    }
  };

  // Check for duplicates when tab opens
  useEffect(() => {
    if (mainTab === 'upload' && historicalDataStats.total > 0) {
      findDuplicates();
    }
  }, [mainTab, historicalDataStats.total]);

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
        <TabsList data-testid="main-tabs" className="flex-wrap">
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="site-predictions" data-testid="tab-site-predictions">
            <Cpu className="h-4 w-4 mr-2" />
            Site Predictions
          </TabsTrigger>
          <TabsTrigger value="variance-alerts" data-testid="tab-variance-alerts">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Variance Alerts
            {varianceAlerts.length > 0 && (
              <Badge variant="destructive" className="ml-2">{varianceAlerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upload" data-testid="tab-upload">
            <Upload className="h-4 w-4 mr-2" />
            Upload Data
          </TabsTrigger>
          <TabsTrigger value="exchange-rates" data-testid="tab-exchange-rates">
            <DollarSign className="h-4 w-4 mr-2" />
            Exchange Rates
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
                <span className="block mt-1 font-medium">Note: Sites must be registered via MMP upload first.</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Download Template */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
                <div>
                  <p className="font-medium">Download Template</p>
                  <p className="text-sm text-muted-foreground">
                    Get an Excel template with all required columns and instructions
                  </p>
                </div>
                <Button variant="outline" onClick={handleDownloadTemplate} data-testid="button-download-template">
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>
              
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

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
                    <Card>
                      <CardContent className="pt-4">
                        <div className={`text-2xl font-bold ${validationSummary.recordsWithCosts > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                          {validationSummary.recordsWithCosts}
                        </div>
                        <p className="text-sm text-muted-foreground">With Cost Data</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <div className={`text-2xl font-bold ${(validationSummary.duplicateRecords || 0) > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {validationSummary.duplicateRecords || 0}
                        </div>
                        <p className="text-sm text-muted-foreground">Duplicates (Skipped)</p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {(validationSummary.duplicateRecords || 0) > 0 && (
                    <Alert className="border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <AlertTitle className="text-red-800 dark:text-red-400">Duplicate Records Detected</AlertTitle>
                      <AlertDescription className="text-red-700 dark:text-red-300">
                        {validationSummary.duplicateRecords} records already exist in the database for the same site and month. 
                        These will be skipped during import to prevent duplicate cost entries.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {validationSummary.recordsWithCosts === 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>No Cost Data Found</AlertTitle>
                      <AlertDescription className="space-y-2">
                        <p>
                          The uploaded file does not contain valid cost data. 
                          {detectedCostColumns.length > 0 ? (
                            <span> Found cost column(s): <strong>{detectedCostColumns.join(', ')}</strong>, but all values appear to be empty or zero.</span>
                          ) : (
                            <span> No cost-related columns detected.</span>
                          )}
                        </p>
                        {detectedColumns.length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-sm">View all {detectedColumns.length} detected columns</summary>
                            <div className="mt-1 text-xs bg-muted p-2 rounded max-h-32 overflow-y-auto">
                              {detectedColumns.map((col, i) => (
                                <span key={i} className="inline-block mr-2 mb-1 px-1 bg-background rounded">
                                  {col}
                                </span>
                              ))}
                            </div>
                          </details>
                        )}
                        <p className="text-sm">
                          Expected columns: "Actual Cost", "Total Cost", "Transportation Cost", "Amount", or any column containing "cost".
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}

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
                              <TableHead>Month</TableHead>
                              <TableHead>Cost</TableHead>
                              <TableHead>Visits (12M)</TableHead>
                              <TableHead>Recent Costs</TableHead>
                              <TableHead>Predicted</TableHead>
                              <TableHead>Notes</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parsedRecords.slice(0, 50).map((record, idx) => {
                              // Parse the visit date to extract month
                              let monthDisplay = '-';
                              if (record.visitDate) {
                                try {
                                  let parsedDate: Date | null = null;
                                  const dateVal = record.visitDate;
                                  if (!isNaN(Number(dateVal))) {
                                    // Excel serial date
                                    parsedDate = new Date((Number(dateVal) - 25569) * 86400 * 1000);
                                  } else {
                                    parsedDate = new Date(dateVal);
                                  }
                                  if (parsedDate && !isNaN(parsedDate.getTime())) {
                                    monthDisplay = format(parsedDate, 'MMM yyyy');
                                  }
                                } catch (e) {
                                  monthDisplay = record.visitDate;
                                }
                              }
                              
                              return (
                                <TableRow key={idx} className={record.validationStatus === 'error' ? 'bg-red-50 dark:bg-red-900/10' : ''}>
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
                                  <TableCell>
                                    <Badge variant="outline" className="font-mono text-xs">
                                      <Calendar className="h-3 w-3 mr-1" />
                                      {monthDisplay}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{record.actualCost ? formatCurrency(record.actualCost) : '-'}</TableCell>
                                  <TableCell>
                                    {record.enrichment ? (
                                      <Badge variant={record.enrichment.completed_visits_last_12m > 0 ? "secondary" : "outline"} className="text-xs">
                                        {record.enrichment.completed_visits_last_12m}
                                      </Badge>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {record.enrichment && record.enrichment.last_three_costs.length > 0 ? (
                                      <UITooltip>
                                        <TooltipTrigger asChild>
                                          <div className="flex items-center gap-1 cursor-help">
                                            <span className="text-xs font-mono">
                                              {record.enrichment.last_three_costs.slice(0, 3).map(c => formatCurrency(c.actual_cost).replace('SDG', '')).join(', ')}
                                            </span>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="text-xs space-y-1">
                                            <p className="font-medium">Last {record.enrichment.last_three_costs.length} visits:</p>
                                            {record.enrichment.last_three_costs.map((c, i) => (
                                              <p key={i}>{format(new Date(c.visit_date), 'MMM yyyy')}: {formatCurrency(c.actual_cost)}</p>
                                            ))}
                                          </div>
                                        </TooltipContent>
                                      </UITooltip>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {record.enrichment?.predicted_cost ? (
                                      <UITooltip>
                                        <TooltipTrigger asChild>
                                          <Badge variant="outline" className="text-xs cursor-help">
                                            <TrendingUp className="h-3 w-3 mr-1" />
                                            {formatCurrency(record.enrichment.predicted_cost)}
                                          </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="text-xs space-y-1">
                                            <p><span className="font-medium">Algorithm:</span> {record.enrichment.prediction_algorithm?.replace(/_/g, ' ')}</p>
                                            <p><span className="font-medium">Confidence:</span> {record.enrichment.prediction_confidence}%</p>
                                          </div>
                                        </TooltipContent>
                                      </UITooltip>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {record.validationMessage ? (
                                      <span className={`text-xs ${record.validationStatus === 'error' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                                        {record.validationMessage}
                                      </span>
                                    ) : record.hasGps ? (
                                      <Badge variant="secondary" className="text-xs">
                                        <MapPin className="h-3 w-3 mr-1" />
                                        GPS
                                      </Badge>
                                    ) : null}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
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

                  {/* Show warning/error message based on duplicate status */}
                  {validationSummary && validationSummary.errors.length > 0 && (
                    <>
                      {parsedRecords.filter(r => r.actualCost && r.actualCost > 0 && r.validationStatus !== 'error').length === 0 ? (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Cannot Import - All Records Are Duplicates</AlertTitle>
                          <AlertDescription>
                            This file appears to have been imported already. All {validationSummary.duplicateRecords} records match existing data in the database.
                            <ul className="list-disc list-inside mt-2">
                              {validationSummary.errors.map((err, i) => (
                                <li key={i} className="text-sm">{err}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <AlertTitle className="text-amber-800 dark:text-amber-200">Some Records Will Be Skipped</AlertTitle>
                          <AlertDescription className="text-amber-700 dark:text-amber-300">
                            <ul className="list-disc list-inside mt-2">
                              {validationSummary.errors.map((err, i) => (
                                <li key={i} className="text-sm">{err}</li>
                              ))}
                            </ul>
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}

                  <div className="flex items-center justify-between">
                    <Button variant="outline" onClick={resetUpload} data-testid="button-cancel-import">
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleImportData} 
                      disabled={importing || parsedRecords.filter(r => r.actualCost && r.actualCost > 0 && r.validationStatus !== 'error').length === 0} 
                      data-testid="button-import"
                    >
                      {importing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Database className="h-4 w-4 mr-2" />
                      )}
                      Import {parsedRecords.filter(r => r.actualCost && r.actualCost > 0 && r.validationStatus !== 'error').length} Records
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

          {/* Manage Historical Data Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Manage Historical Data
              </CardTitle>
              <CardDescription>
                View statistics and manage your uploaded historical cost data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Total Records</p>
                  <p className="text-2xl font-bold">{historicalDataStats.total}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Linked to Registry</p>
                  <p className="text-2xl font-bold text-green-600">{historicalDataStats.linked}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Unlinked Sites</p>
                  <p className="text-2xl font-bold text-amber-600">{historicalDataStats.unlinked}</p>
                </div>
              </div>

              {historicalDataStats.total > 0 && (
                <div className="space-y-4 pt-4 border-t">
                  {/* Duplicate info (visible to all) */}
                  {duplicateCount > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          {duplicateCount} duplicate records found
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          These are records with the same site and month that were uploaded multiple times
                        </p>
                      </div>
                      {isSuperAdmin && (
                        <>
                          {!showDeleteDuplicatesConfirm ? (
                            <Button 
                              variant="outline"
                              className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                              onClick={() => setShowDeleteDuplicatesConfirm(true)}
                              data-testid="button-show-delete-duplicates"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Duplicates Only
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setShowDeleteDuplicatesConfirm(false)}
                                data-testid="button-cancel-delete-duplicates"
                              >
                                Cancel
                              </Button>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={handleDeleteDuplicatesOnly}
                                disabled={deletingDuplicates}
                                data-testid="button-confirm-delete-duplicates"
                              >
                                {deletingDuplicates ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 mr-2" />
                                )}
                                Yes, Delete {duplicateCount}
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Delete All Data - Super Admin Only */}
                  {isSuperAdmin && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Delete all historical data to start fresh or re-upload corrected data
                      </p>
                      {!showDeleteConfirm ? (
                        <Button 
                          variant="destructive" 
                          onClick={() => setShowDeleteConfirm(true)}
                          data-testid="button-show-delete-confirm"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete All Data
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-destructive font-medium">Are you sure?</span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setShowDeleteConfirm(false)}
                            data-testid="button-cancel-delete"
                          >
                            Cancel
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={handleDeleteAllHistoricalData}
                            disabled={deleting}
                            data-testid="button-confirm-delete"
                          >
                            {deleting ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 mr-2" />
                            )}
                            Yes, Delete All
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {historicalDataStats.total === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No historical data uploaded yet</p>
                  <p className="text-sm">Upload a file above to get started</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Site Predictions Tab Content */}
        <TabsContent value="site-predictions" className="space-y-6">
          {/* Algorithm Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  Prediction Algorithm Distribution
                </CardTitle>
                <CardDescription>
                  How predictions are generated across different methods
                </CardDescription>
              </CardHeader>
              <CardContent>
                {algorithmStats.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={algorithmStats} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" />
                        <YAxis 
                          type="category" 
                          dataKey="algorithm" 
                          width={150} 
                          tickFormatter={(v) => getAlgorithmLabel(v)}
                          className="text-xs"
                        />
                        <Tooltip 
                          formatter={(value: number, name: string) => [
                            name === 'count' ? `${value} sites` : `${value}%`,
                            name === 'count' ? 'Sites' : 'Avg Confidence'
                          ]}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="count" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground">
                    <div className="text-center">
                      <Cpu className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No prediction data available</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Algorithm Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {algorithmStats.map((stat, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: getAlgorithmColor(stat.algorithm) }}
                      />
                      <span className="text-sm font-medium">{getAlgorithmLabel(stat.algorithm)}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{stat.count} sites</div>
                      <div className="text-xs text-muted-foreground">{stat.avgConfidence}% confidence</div>
                    </div>
                  </div>
                ))}
                {algorithmStats.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No algorithm statistics available
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Site Predictions Table */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Site-Level Predictions
                  </CardTitle>
                  <CardDescription>
                    Individual predictions with provenance details showing how each was calculated
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search sites..."
                    value={siteSearchQuery}
                    onChange={(e) => setSiteSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-site-search"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingSitePredictions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredPredictions.length > 0 ? (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site</TableHead>
                        <TableHead>Predicted Cost</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Algorithm</TableHead>
                        <TableHead>History</TableHead>
                        <TableHead>Provenance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPredictions.slice(0, 50).map((pred, idx) => {
                        const siteName = (pred as any).site_name || pred.site_id;
                        const historyCosts = historicalCostData.get(pred.site_id) || [];
                        
                        return (
                          <TableRow key={pred.site_id || idx} data-testid={`row-prediction-${idx}`}>
                            <TableCell className="font-medium max-w-[200px] truncate">
                              {siteName}
                            </TableCell>
                            <TableCell className="font-bold">
                              {formatCurrency(pred.predicted_cost)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={pred.confidence} className="h-2 w-16" />
                                <span className="text-xs text-muted-foreground">{pred.confidence}%</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {getAlgorithmLabel(pred.algorithm_used)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {historyCosts.length > 0 ? (
                                <CostSparkline 
                                  history={historyCosts} 
                                  width={80} 
                                  height={24}
                                  showTrend
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">No history</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {pred.provenance ? (
                                <TooltipProvider>
                                  <UITooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost">
                                        <Info className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-[300px]">
                                      <div className="space-y-2">
                                        <p className="font-medium">{pred.provenance.method}</p>
                                        <p className="text-xs">{pred.provenance.description}</p>
                                        {pred.provenance.data_points && (
                                          <p className="text-xs">Data points: {pred.provenance.data_points}</p>
                                        )}
                                        {pred.provenance.min_cost !== undefined && (
                                          <p className="text-xs">
                                            Range: {formatCurrency(pred.provenance.min_cost)} - {formatCurrency(pred.provenance.max_cost || 0)}
                                          </p>
                                        )}
                                        {pred.provenance.avg_cost !== undefined && (
                                          <p className="text-xs">Average: {formatCurrency(pred.provenance.avg_cost)}</p>
                                        )}
                                        {pred.provenance.trend && (
                                          <p className="text-xs">Trend: {pred.provenance.trend}</p>
                                        )}
                                        {pred.provenance.source_area && (
                                          <p className="text-xs">Source: {pred.provenance.source_area}</p>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </UITooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <div className="text-center">
                    <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No site predictions available</p>
                    <p className="text-xs mt-1">Upload historical data to enable predictions</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Variance Alerts Tab Content */}
        <TabsContent value="variance-alerts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Cost Variance Alerts
              </CardTitle>
              <CardDescription>
                Sites where actual costs deviated significantly from predictions (warning: 20%+, critical: 50%+)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {varianceAlerts.length > 0 ? (
                <VarianceAlertBanner alerts={varianceAlerts} />
              ) : (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <div className="text-center">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
                    <p className="font-medium">No Variance Alerts</p>
                    <p className="text-xs mt-1">All recent costs are within acceptable prediction ranges</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Variance Summary Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Critical Alerts</CardTitle>
                <XCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600 dark:text-red-500">
                  {varianceAlerts.filter(a => a.severity === 'critical').length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Variance 50%+ above predicted
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Warning Alerts</CardTitle>
                <AlertCircle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-500">
                  {varianceAlerts.filter(a => a.severity === 'warning').length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Variance 20-50% above predicted
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Variance</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(varianceAlerts.reduce((sum, a) => sum + a.variance_amount, 0))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total over-prediction amount
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Distance-Based Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Navigation className="h-5 w-5" />
                Distance-Based Adjustments
              </CardTitle>
              <CardDescription>
                How distance affects cost predictions (long distances add up to 15%, short distances reduce by 10%)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm font-medium">Long Distance (&gt;50km)</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-500">+15%</p>
                  <p className="text-xs text-muted-foreground mt-1">Maximum distance adjustment</p>
                </div>
                
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-sm font-medium">Medium Distance</span>
                  </div>
                  <p className="text-2xl font-bold">0%</p>
                  <p className="text-xs text-muted-foreground mt-1">Base distance (50km reference)</p>
                </div>
                
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-sm font-medium">Short Distance (&lt;10km)</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-500">-10%</p>
                  <p className="text-xs text-muted-foreground mt-1">Minimum distance adjustment</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exchange Rates Tab Content */}
        <TabsContent value="exchange-rates" className="space-y-6">
          <ExchangeRatePanel variant="full" showRefresh={true} />
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                About Exchange Rates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">How Exchange Rates Are Used</h4>
                <p className="text-sm text-muted-foreground">
                  Exchange rates from Sudan's top banks are used to calculate transportation costs 
                  when historical data is unavailable. This helps estimate costs for new sites 
                  based on Uganda baseline costs converted to SDG.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Bank of Sudan</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Official central bank rate. Used as primary reference.
                  </p>
                </div>
                
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Bank of Khartoum</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Largest commercial bank. Provides buy/sell spreads.
                  </p>
                </div>
                
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Faisal Islamic Bank</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Major Islamic bank. Provides alternative rate reference.
                  </p>
                </div>
              </div>
              
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
                <div className="flex gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      Fallback Options When No Historical Data
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      When dispatching sites without cost history, you'll see three options:
                    </p>
                    <ul className="text-sm text-amber-700 dark:text-amber-300 mt-2 space-y-1 list-disc list-inside">
                      <li><strong>Algorithm + Rate:</strong> Uses Uganda baseline converted at current rate</li>
                      <li><strong>Locality/State Median:</strong> Uses median from similar sites in the area</li>
                      <li><strong>Manual Entry:</strong> Enter custom amount with justification (for audit)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab Content */}
        <TabsContent value="analytics" className="space-y-6">
          
          {/* Empty State - No Historical Data */}
          {!loading && historicalDataStats.total === 0 && sitePredictions.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <Database className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Historical Cost Data</h3>
                <p className="text-muted-foreground max-w-md mb-6">
                  Cost predictions require historical cost data from site visits. You can add cost data in two ways:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                  <Card className="p-4 text-left">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <Upload className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium mb-1">Upload Historical Data</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Import existing cost data from Excel files with site visits and transportation costs.
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setMainTab('upload')}
                          data-testid="button-go-upload"
                        >
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Upload Data
                        </Button>
                      </div>
                    </div>
                  </Card>
                  <Card className="p-4 text-left">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-green-500/10 p-2">
                        <Navigation className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <h4 className="font-medium mb-1">Add Costs from MMP</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Submit cost data through the MMP workflow when dispatching and completing site visits.
                        </p>
                        <Link to="/mmp">
                          <Button 
                            variant="outline" 
                            size="sm"
                            data-testid="button-go-mmp"
                          >
                            <Building2 className="h-4 w-4 mr-2" />
                            Go to MMP Management
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                </div>
                <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900 max-w-2xl">
                  <div className="flex gap-2 text-left">
                    <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        How Cost Predictions Work
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        Once you have cost data from at least 3 site visits, the system will analyze spending patterns 
                        to predict future transportation costs, helping you plan budgets more accurately.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Show analytics content when data exists */}
          {(historicalDataStats.total > 0 || sitePredictions.length > 0) && (
            <>
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

      {/* Prediction Accuracy Section */}
      <Card data-testid="card-prediction-accuracy">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Prediction Accuracy
          </CardTitle>
          <CardDescription>
            Historical accuracy of cost predictions compared to actual expenses
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAccuracy ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : accuracyMetrics && accuracyMetrics.total_predictions > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border bg-card" data-testid="accuracy-total">
                <div className="text-sm font-medium text-muted-foreground mb-1">Total Predictions</div>
                <div className="text-2xl font-bold">{accuracyMetrics.total_predictions}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on live feedback data
                </p>
              </div>
              
              <div className="p-4 rounded-lg border bg-card" data-testid="accuracy-within-10">
                <div className="text-sm font-medium text-muted-foreground mb-1">Within 10%</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-500">
                  {accuracyMetrics.total_predictions > 0 ? Math.round((accuracyMetrics.within_10_pct / accuracyMetrics.total_predictions) * 100) : 0}%
                </div>
                <Progress 
                  value={accuracyMetrics.total_predictions > 0 ? (accuracyMetrics.within_10_pct / accuracyMetrics.total_predictions) * 100 : 0} 
                  className="h-2 mt-2 [&>div]:bg-green-500"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {accuracyMetrics.within_10_pct} highly accurate
                </p>
              </div>
              
              <div className="p-4 rounded-lg border bg-card" data-testid="accuracy-within-20">
                <div className="text-sm font-medium text-muted-foreground mb-1">Within 20%</div>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-500">
                  {accuracyMetrics.total_predictions > 0 ? Math.round(((accuracyMetrics.within_10_pct + accuracyMetrics.within_20_pct) / accuracyMetrics.total_predictions) * 100) : 0}%
                </div>
                <Progress 
                  value={accuracyMetrics.total_predictions > 0 ? ((accuracyMetrics.within_10_pct + accuracyMetrics.within_20_pct) / accuracyMetrics.total_predictions) * 100 : 0} 
                  className="h-2 mt-2 [&>div]:bg-amber-500"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {accuracyMetrics.within_10_pct + accuracyMetrics.within_20_pct} acceptable range
                </p>
              </div>
              
              <div className="p-4 rounded-lg border bg-card" data-testid="accuracy-error">
                <div className="text-sm font-medium text-muted-foreground mb-1">Mean Absolute Error</div>
                <div className="text-2xl font-bold">{formatCurrency(accuracyMetrics.mean_absolute_error || 0)}</div>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <span className={accuracyMetrics.over_predicted > accuracyMetrics.under_predicted ? 'text-blue-600' : 'text-red-600'}>
                    {accuracyMetrics.over_predicted > accuracyMetrics.under_predicted 
                      ? `${accuracyMetrics.over_predicted} over-predicted` 
                      : `${accuracyMetrics.under_predicted} under-predicted`}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No prediction feedback data available yet.</p>
              <p className="text-xs mt-1">Accuracy metrics will appear as live cost data is recorded.</p>
            </div>
          )}
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
          </>
          )}
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

      {/* Uploaded Historical Data Viewer */}
      <Card data-testid="card-historical-data">
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Uploaded Historical Cost Data
              </CardTitle>
              <CardDescription>
                View imported cost records and their registry linkage status
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchUploadedHistoricalData(0)}
              disabled={loadingHistoricalData}
              data-testid="button-refresh-historical"
            >
              {loadingHistoricalData ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Load Data
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {historicalDataStats.total > 0 ? (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="text-sm text-muted-foreground mb-1">Total Records</div>
                  <div className="text-2xl font-bold">{historicalDataStats.total}</div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Linked to Registry
                  </div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-500">
                    {historicalDataStats.linked}
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({historicalDataStats.total > 0 ? Math.round((historicalDataStats.linked / historicalDataStats.total) * 100) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    New Sites (Not in Registry)
                  </div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-500">
                    {historicalDataStats.unlinked}
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({historicalDataStats.total > 0 ? Math.round((historicalDataStats.unlinked / historicalDataStats.total) * 100) : 0}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <ScrollArea className="h-[400px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky top-0 bg-background">Site Name</TableHead>
                      <TableHead className="sticky top-0 bg-background">State</TableHead>
                      <TableHead className="sticky top-0 bg-background">Locality</TableHead>
                      <TableHead className="sticky top-0 bg-background text-right">Cost</TableHead>
                      <TableHead className="sticky top-0 bg-background">Visit Date</TableHead>
                      <TableHead className="sticky top-0 bg-background">Registry Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadedHistoricalData.map((record, idx) => (
                      <TableRow key={record.id || idx}>
                        <TableCell className="font-medium">{record.site_name || '-'}</TableCell>
                        <TableCell>{record.state_id || '-'}</TableCell>
                        <TableCell>{record.locality_id || '-'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(record.actual_cost || 0)}
                        </TableCell>
                        <TableCell>
                          {record.visit_date ? format(new Date(record.visit_date), 'dd MMM yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          {record.registry_site ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Linked
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              New Site
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* Pagination */}
              {historicalDataStats.total > 50 && (
                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className="text-sm text-muted-foreground">
                    Showing {historicalDataPage * 50 + 1} to {Math.min((historicalDataPage + 1) * 50, historicalDataStats.total)} of {historicalDataStats.total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchUploadedHistoricalData(historicalDataPage - 1)}
                      disabled={historicalDataPage === 0 || loadingHistoricalData}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchUploadedHistoricalData(historicalDataPage + 1)}
                      disabled={(historicalDataPage + 1) * 50 >= historicalDataStats.total || loadingHistoricalData}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : loadingHistoricalData ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No historical data loaded</p>
              <p className="text-sm mt-1">Click "Load Data" to view uploaded cost records and their registry linkage status.</p>
            </div>
          )}
        </CardContent>
      </Card>

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
