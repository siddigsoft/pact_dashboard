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
  Eye
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { CostPredictionService, type HistoricalSiteCost, type ParsedHistoricalRecord, type AccuracyMetrics, type CostPrediction, type VarianceAlert } from '@/services/costPrediction.service';
import { CostSparkline } from '@/components/mmp/CostSparkline';
import { VarianceAlertBanner } from '@/components/mmp/VarianceAlertBanner';
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
  recordsWithCosts: number;
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
  const [accuracyMetrics, setAccuracyMetrics] = useState<AccuracyMetrics | null>(null);
  const [loadingAccuracy, setLoadingAccuracy] = useState(false);
  
  const [sitePredictions, setSitePredictions] = useState<CostPrediction[]>([]);
  const [loadingSitePredictions, setLoadingSitePredictions] = useState(false);
  const [varianceAlerts, setVarianceAlerts] = useState<VarianceAlert[]>([]);
  const [siteSearchQuery, setSiteSearchQuery] = useState('');
  const [historicalCostData, setHistoricalCostData] = useState<Map<string, Array<{date: string; cost: number}>>>(new Map());
  const [algorithmStats, setAlgorithmStats] = useState<{algorithm: string; count: number; avgConfidence: number}[]>([]);

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
      const { data, error } = await supabase
        .from('sites_registry')
        .select('*');
      
      if (data) {
        const siteMap = new Map();
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
        setRegistrySites(siteMap);
        console.log('[CostPredictions] Loaded', data.length, 'registry sites');
        return siteMap;
      }
      return new Map();
    } catch (err) {
      console.error('Error loading registry sites:', err);
      return new Map();
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
      // Ensure registry is loaded and use the returned map directly
      let siteMap = registrySites;
      if (registrySites.size === 0) {
        console.log('[CostPredictions] Registry not loaded, loading now...');
        siteMap = await loadRegistrySites();
      }
      
      console.log('[CostPredictions] Starting validation with', siteMap.size, 'registry sites');
      
      const data = await uploadFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      const allRecords: ParsedRecord[] = [];
      let rowCounter = 0;

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        console.log('[CostPredictions] Sheet', sheetName, 'has', jsonData.length, 'rows');
        
        for (const row of jsonData as any[]) {
          rowCounter++;
          const siteName = row['1.10 Select The activity site'] || row['Site Name'] || row['site_name'] || '';
          const state = row['1.8 State of the site/where the site is located'] || row['State'] || row['state'] || '';
          const locality = row['1.9 Locality of the site/where the site is located'] || row['Locality'] || row['locality'] || '';
          const hub = row['1.7 WFP HUB'] || row['Hub'] || row['hub'] || '';
          const visitDate = row['Visit Date'] || row['visit_date'] || row['2.1 Date of visit'] || '';
          const actualCost = parseFloat(
            row['Actual Cost'] || 
            row['actual_cost'] || 
            row['Total Cost'] || 
            row['total_cost'] || 
            row['Transportation Cost'] || 
            row['transportation_cost'] ||
            row['Cost'] ||
            row['cost'] ||
            row['3.1 Total transportation cost'] ||
            row['Amount'] ||
            row['amount'] ||
            '0'
          ) || 0;
          const transportMode = row['Transportation Means'] || row['Transport Mode'] || row['transport_mode'] || row['2.2 Transportation means'] || '';

          if (!siteName || !state || !locality) {
            continue;
          }

          const siteKey = `${siteName.toLowerCase()}-${state.toLowerCase()}-${locality.toLowerCase()}`;
          const matchedSite = siteMap.get(siteKey);
          
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
      const recordsWithCosts = allRecords.filter(r => r.actualCost && r.actualCost > 0);
      const uniqueStates = new Set(allRecords.map(r => r.state));
      const uniqueLocalities = new Set(allRecords.map(r => r.locality));

      const summary = {
        totalRecords: allRecords.length,
        matchedSites: matchedSites.length,
        matchedWithGps: matchedWithGps.length,
        matchedWithoutGps: matchedWithoutGps.length,
        newSites: newSites.length,
        recordsWithCosts: recordsWithCosts.length,
        validatedStates: uniqueStates.size,
        invalidStates: [],
        validatedLocalities: uniqueLocalities.size,
        invalidLocalities: [],
        errors: []
      };
      
      console.log('[CostPredictions] Validation complete:', summary);
      
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

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                  </div>
                  
                  {validationSummary.recordsWithCosts === 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>No Cost Data Found</AlertTitle>
                      <AlertDescription>
                        The uploaded file does not contain cost data in a recognized column format. 
                        Expected columns: "Actual Cost", "Total Cost", "Transportation Cost", "Amount", or similar.
                        This upload can register new sites but cannot add historical cost data for predictions.
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
