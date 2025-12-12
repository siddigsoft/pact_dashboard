import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/toast';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useMMP } from '@/context/mmp/MMPContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useProjectContext } from '@/context/project/ProjectContext';
import { fetchHubs } from '@/services/mmpActions';
import { supabase } from '@/integrations/supabase/client';
import { sudanStates } from '@/data/sudanStates';
import { format, parseISO } from 'date-fns';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  TrackerLineItem,
  TrackerSummary,
  TrackerFilters,
  TrackerPlanConfig,
  EnumeratorBreakdown,
  StateBreakdown,
  HubBreakdown
} from '@/types/tracker';
import {
  FileSpreadsheet,
  FileText,
  Download,
  Save,
  RefreshCw,
  Filter,
  BarChart3,
  Users,
  MapPin,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Building2,
  ClipboardList,
  Receipt,
  Printer,
  Search,
  ChevronDown,
  ChevronUp,
  Eye,
  X
} from 'lucide-react';

const months = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

export default function TrackerPreparationPlan() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const { hasAnyRole } = useAuthorization();
  const { mmpFiles, loading: mmpLoading } = useMMP();
  const { siteVisits, loading: siteVisitsLoading } = useSiteVisitContext();
  const { projects, loading: projectsLoading } = useProjectContext();
  
  const hasAccess = hasAnyRole(['admin', 'Admin', 'ict', 'ICT']);
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [lineItems, setLineItems] = useState<TrackerLineItem[]>([]);
  const [hubs, setHubs] = useState<any[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<TrackerPlanConfig[]>([]);
  
  const [filters, setFilters] = useState<TrackerFilters>({
    month: new Date().getMonth() + 1,
    year: currentYear,
    states: [],
    localities: [],
    activityTypes: []
  });
  
  const filtersRef = useRef(filters);
  
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [configName, setConfigName] = useState('');
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (hasAccess) {
      loadInitialData();
    }
  }, [hasAccess]);

  useEffect(() => {
    if (hasAccess && filters.month && filters.year && !mmpLoading && !siteVisitsLoading) {
      loadTrackerData();
    }
  }, [filters, hasAccess, mmpFiles, siteVisits, mmpLoading, siteVisitsLoading]);
  
  if (!hasAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground text-center">
              You do not have permission to access the Tracker Preparation Plan.
              This page is only available to Admin and ICT users.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const loadInitialData = async () => {
    try {
      const [hubsData, configsRes] = await Promise.all([
        fetchHubs(),
        supabase.from('tracker_plan_configs').select('*').order('created_at', { ascending: false })
      ]);

      setHubs(hubsData);
      if (configsRes.data) setSavedConfigs(configsRes.data as TrackerPlanConfig[]);
    } catch (err) {
      console.error('Error loading initial data:', err);
    }
  };

  const loadTrackerData = useCallback(async () => {
    const currentFilters = filtersRef.current;
    setLoading(true);
    try {
      // Filter MMP files from context by month, year, and project
      const filteredMmpFiles = (mmpFiles || []).filter((f: any) => {
        const matchesMonth = f.month === currentFilters.month;
        const matchesYear = f.year === currentFilters.year;
        const matchesProject = !currentFilters.projectId || f.project_id === currentFilters.projectId;
        return matchesMonth && matchesYear && matchesProject;
      });
      
      const fileIds = filteredMmpFiles.map((f: any) => f.id);
      
      if (fileIds.length === 0) {
        setLineItems([]);
        setLoading(false);
        return;
      }
      
      // Get site entries from MMP context (they're already loaded with MMP files)
      let mmpEntries: any[] = [];
      filteredMmpFiles.forEach((mmp: any) => {
        if (Array.isArray(mmp.siteEntries)) {
          mmpEntries.push(...mmp.siteEntries);
        }
      });
      
      // Filter by verified_at (must not be null)
      mmpEntries = mmpEntries.filter((e: any) => e.verified_at != null);
      
      // Apply additional filters
      if (currentFilters.hubId) {
        mmpEntries = mmpEntries.filter((e: any) => e.hub_office === currentFilters.hubId || e.hubOffice === currentFilters.hubId);
      }
      if (currentFilters.states.length > 0) {
        mmpEntries = mmpEntries.filter((e: any) => 
          currentFilters.states.includes(e.state)
        );
      }

      const mmpIds = mmpEntries.map((e: any) => e.id).filter(Boolean);
      const registryIds = mmpEntries.map((e: any) => e.registry_site_id).filter(Boolean);

      // Filter site visits from context
      let filteredSiteVisits: any[] = (siteVisits || []).filter((sv: any) => {
        return (mmpIds.length > 0 && sv.mmp_site_entry_id && mmpIds.includes(sv.mmp_site_entry_id)) ||
               (registryIds.length > 0 && sv.registry_site_id && registryIds.includes(sv.registry_site_id));
      });
      
      // Remove duplicates
      const seenIds = new Set<string>();
      filteredSiteVisits = filteredSiteVisits.filter(sv => {
        if (seenIds.has(sv.id)) return false;
        seenIds.add(sv.id);
        return true;
      });

      const siteVisitsByMmpEntry = new Map<string, any[]>();
      const siteVisitsByRegistry = new Map<string, any[]>();
      
      filteredSiteVisits.forEach(sv => {
        if (sv.mmp_site_entry_id) {
          const existing = siteVisitsByMmpEntry.get(sv.mmp_site_entry_id) || [];
          existing.push(sv);
          siteVisitsByMmpEntry.set(sv.mmp_site_entry_id, existing);
        }
        if (sv.registry_site_id) {
          const existing = siteVisitsByRegistry.get(sv.registry_site_id) || [];
          existing.push(sv);
          siteVisitsByRegistry.set(sv.registry_site_id, existing);
        }
      });

      const findBestVisit = (visits: any[]): any | null => {
        if (!visits || visits.length === 0) return null;
        const completed = visits.find(v => v.status === 'Completed');
        if (completed) return completed;
        const inProgress = visits.find(v => v.status === 'In Progress');
        if (inProgress) return inProgress;
        return visits[0];
      };

      const items: TrackerLineItem[] = (mmpEntries || []).map((entry: any) => {
        const mmpVisits = siteVisitsByMmpEntry.get(entry.id) || [];
        const registryVisits = siteVisitsByRegistry.get(entry.registry_site_id) || [];
        const allVisits = [...mmpVisits, ...registryVisits];
        const uniqueVisits = Array.from(new Map(allVisits.map(v => [v.id, v])).values());
        const siteVisit = findBestVisit(uniqueVisits);
        
        const plannedBudget = (entry.transportation || 0) + (entry.accommodation || 0) + 
                             (entry.meal_per_diem || 0) + (entry.logistics || 0);
        const actualCost = siteVisit ? 
          ((siteVisit.transportation || entry.transportation || 0) + 
           (siteVisit.accommodation || entry.accommodation || 0) +
           (siteVisit.meal_per_diem || entry.meal_per_diem || 0) +
           (siteVisit.logistics || entry.logistics || 0) +
           (siteVisit.enumerator_fee || entry.enumerator_fee || 0)) : 0;
        
        const actualStatus = siteVisit ? 
          (siteVisit.status === 'Completed' ? 'completed' : 
           siteVisit.status === 'In Progress' ? 'in_progress' : 
           siteVisit.status === 'Cancelled' ? 'cancelled' : 'not_started') : 'not_started';

        return {
          id: entry.id,
          mmp_site_entry_id: entry.id,
          registry_site_id: entry.registry_site_id,
          site_visit_id: siteVisit?.id,
          site_code: entry.site_code || '',
          site_name: entry.site_name || '',
          state: entry.state || '',
          locality: entry.locality || '',
          hub_office: entry.hub_office || '',
          cp_name: entry.cp_name || '',
          activity_at_site: entry.activity_at_site || '',
          survey_tool: entry.survey_tool || '',
          planned_date: entry.visit_date,
          actual_date: siteVisit?.completed_at || siteVisit?.visit_date,
          planned_status: entry.status || 'pending',
          actual_status: actualStatus as any,
          enumerator_id: siteVisit?.assigned_to || entry.assigned_to,
          enumerator_name: siteVisit?.enumerator_name || entry.enumerator_name || '',
          enumerator_classification: entry.enumerator_classification || '',
          planned_budget: plannedBudget,
          actual_cost: actualCost,
          enumerator_fee: siteVisit?.enumerator_fee || entry.enumerator_fee || 0,
          transport_cost: siteVisit?.transportation || entry.transportation || 0,
          accommodation_cost: siteVisit?.accommodation || entry.accommodation || 0,
          meal_per_diem: siteVisit?.meal_per_diem || entry.meal_per_diem || 0,
          logistics_cost: siteVisit?.logistics || entry.logistics || 0,
          invoice_amount: actualCost,
          invoice_status: 'pending',
          notes: entry.comments || '',
          is_variance: actualStatus !== 'completed'
        };
      });

      setLineItems(items);
    } catch (err) {
      console.error('Error loading tracker data:', err);
      toast({
        title: 'Error',
        description: 'Failed to load tracker data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const summary: TrackerSummary = useMemo(() => {
    const totalPlanned = lineItems.length;
    const completedItems = lineItems.filter(i => i.actual_status === 'completed');
    const totalActual = completedItems.length;
    const coveragePercentage = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

    const stateMap = new Map<string, StateBreakdown>();
    const hubMap = new Map<string, HubBreakdown>();
    const enumeratorMap = new Map<string, EnumeratorBreakdown>();

    lineItems.forEach(item => {
      if (!stateMap.has(item.state)) {
        stateMap.set(item.state, {
          state: item.state,
          planned: 0,
          actual: 0,
          coverage: 0,
          budget: 0,
          cost: 0
        });
      }
      const stateData = stateMap.get(item.state)!;
      stateData.planned++;
      stateData.budget += item.planned_budget;
      if (item.actual_status === 'completed') {
        stateData.actual++;
        stateData.cost += item.actual_cost;
      }
      stateData.coverage = stateData.planned > 0 ? (stateData.actual / stateData.planned) * 100 : 0;

      const hubName = item.hub_office || 'Unassigned';
      if (!hubMap.has(hubName)) {
        hubMap.set(hubName, {
          hub: hubName,
          planned: 0,
          actual: 0,
          coverage: 0,
          budget: 0,
          cost: 0
        });
      }
      const hubData = hubMap.get(hubName)!;
      hubData.planned++;
      hubData.budget += item.planned_budget;
      if (item.actual_status === 'completed') {
        hubData.actual++;
        hubData.cost += item.actual_cost;
      }
      hubData.coverage = hubData.planned > 0 ? (hubData.actual / hubData.planned) * 100 : 0;

      if (item.enumerator_id && item.actual_status === 'completed') {
        if (!enumeratorMap.has(item.enumerator_id)) {
          enumeratorMap.set(item.enumerator_id, {
            enumeratorId: item.enumerator_id,
            enumeratorName: item.enumerator_name,
            classification: item.enumerator_classification || 'N/A',
            sitesCompleted: 0,
            totalFees: 0,
            totalTransport: 0,
            totalAmount: 0
          });
        }
        const enumData = enumeratorMap.get(item.enumerator_id)!;
        enumData.sitesCompleted++;
        enumData.totalFees += item.enumerator_fee;
        enumData.totalTransport += item.transport_cost;
        enumData.totalAmount += item.actual_cost;
      }
    });

    return {
      totalPlanned,
      totalActual,
      coveragePercentage,
      pendingCount: lineItems.filter(i => i.actual_status === 'not_started').length,
      inProgressCount: lineItems.filter(i => i.actual_status === 'in_progress').length,
      completedCount: totalActual,
      cancelledCount: lineItems.filter(i => i.actual_status === 'cancelled').length,
      totalPlannedBudget: lineItems.reduce((sum, i) => sum + i.planned_budget, 0),
      totalActualCost: completedItems.reduce((sum, i) => sum + i.actual_cost, 0),
      totalVariance: lineItems.reduce((sum, i) => sum + i.planned_budget, 0) - 
                     completedItems.reduce((sum, i) => sum + i.actual_cost, 0),
      totalEnumeratorFees: completedItems.reduce((sum, i) => sum + i.enumerator_fee, 0),
      totalTransportCost: completedItems.reduce((sum, i) => sum + i.transport_cost, 0),
      stateBreakdown: Array.from(stateMap.values()),
      hubBreakdown: Array.from(hubMap.values()),
      enumeratorBreakdown: Array.from(enumeratorMap.values())
    };
  }, [lineItems]);

  const filteredItems = useMemo(() => {
    return lineItems.filter(item => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!item.site_name.toLowerCase().includes(search) &&
            !item.site_code.toLowerCase().includes(search) &&
            !item.enumerator_name.toLowerCase().includes(search) &&
            !item.state.toLowerCase().includes(search) &&
            !item.locality.toLowerCase().includes(search)) {
          return false;
        }
      }
      return true;
    });
  }, [lineItems, searchTerm]);

  const handleSaveConfig = async () => {
    if (!configName.trim()) {
      toast({ title: 'Error', description: 'Please enter a configuration name', variant: 'destructive' });
      return;
    }

    try {
      const config: any = {
        id: `config-${Date.now()}`,
        name: configName,
        project_id: filters.projectId,
        hub_id: filters.hubId,
        month: filters.month,
        year: filters.year,
        states: filters.states,
        localities: filters.localities,
        activity_types: filters.activityTypes,
        created_by: currentUser?.id || 'unknown',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('tracker_plan_configs').insert(config);
      if (error) throw error;

      setSavedConfigs(prev => [config, ...prev]);
      setSaveDialogOpen(false);
      setConfigName('');
      toast({ title: 'Success', description: 'Configuration saved successfully' });
    } catch (err) {
      console.error('Error saving config:', err);
      toast({ title: 'Error', description: 'Failed to save configuration', variant: 'destructive' });
    }
  };

  const handleLoadConfig = (config: TrackerPlanConfig) => {
    setFilters({
      projectId: config.project_id,
      hubId: config.hub_id,
      month: config.month,
      year: config.year,
      states: config.states || [],
      localities: config.localities || [],
      activityTypes: config.activity_types || []
    });
    toast({ title: 'Configuration Loaded', description: `Loaded: ${config.name}` });
  };

  const exportToExcel = () => {
    const summaryData = [
      ['TRACKER PREPARATION PLAN - PLANNED VS ACTUAL COVERAGE REPORT'],
      [''],
      ['Report Period', `${months.find(m => m.value === filters.month)?.label} ${filters.year}`],
      ['Generated On', format(new Date(), 'yyyy-MM-dd HH:mm')],
      ['Generated By', currentUser?.fullName || currentUser?.email || 'System'],
      [''],
      ['SUMMARY STATISTICS'],
      ['Total Planned Sites', summary.totalPlanned],
      ['Total Completed Sites', summary.totalActual],
      ['Coverage Percentage', `${summary.coveragePercentage.toFixed(1)}%`],
      ['Pending Sites', summary.pendingCount],
      ['In Progress Sites', summary.inProgressCount],
      ['Cancelled Sites', summary.cancelledCount],
      [''],
      ['FINANCIAL SUMMARY'],
      ['Total Planned Budget (SDG)', summary.totalPlannedBudget.toLocaleString()],
      ['Total Actual Cost (SDG)', summary.totalActualCost.toLocaleString()],
      ['Variance (SDG)', summary.totalVariance.toLocaleString()],
      ['Total Enumerator Fees (SDG)', summary.totalEnumeratorFees.toLocaleString()],
      ['Total Transport Costs (SDG)', summary.totalTransportCost.toLocaleString()],
      ['']
    ];

    const detailHeaders = [
      'Site Code', 'Site Name', 'State', 'Locality', 'Hub Office', 'CP Name',
      'Activity', 'Survey Tool', 'Planned Date', 'Actual Date',
      'Planned Status', 'Actual Status', 'Enumerator', 'Classification',
      'Planned Budget (SDG)', 'Actual Cost (SDG)', 'Enumerator Fee (SDG)',
      'Transport (SDG)', 'Accommodation (SDG)', 'Meals (SDG)', 'Logistics (SDG)',
      'Invoice Amount (SDG)', 'Invoice Status', 'Notes'
    ];

    const detailData = filteredItems.map(item => [
      item.site_code,
      item.site_name,
      item.state,
      item.locality,
      item.hub_office || '',
      item.cp_name || '',
      item.activity_at_site || '',
      item.survey_tool || '',
      item.planned_date || '',
      item.actual_date || '',
      item.planned_status,
      item.actual_status,
      item.enumerator_name || '',
      item.enumerator_classification || '',
      item.planned_budget,
      item.actual_cost,
      item.enumerator_fee,
      item.transport_cost,
      item.accommodation_cost,
      item.meal_per_diem,
      item.logistics_cost,
      item.invoice_amount,
      item.invoice_status,
      item.notes || ''
    ]);

    const totalsRow = [
      'TOTALS', '', '', '', '', '', '', '', '', '', '', '',
      `${summary.enumeratorBreakdown.length} Enumerators`, '',
      summary.totalPlannedBudget,
      summary.totalActualCost,
      summary.totalEnumeratorFees,
      summary.totalTransportCost,
      filteredItems.reduce((sum, i) => sum + i.accommodation_cost, 0),
      filteredItems.reduce((sum, i) => sum + i.meal_per_diem, 0),
      filteredItems.reduce((sum, i) => sum + i.logistics_cost, 0),
      summary.totalActualCost,
      '', ''
    ];

    const stateBreakdownHeaders = ['State', 'Planned', 'Actual', 'Coverage %', 'Budget (SDG)', 'Cost (SDG)'];
    const stateBreakdownData = summary.stateBreakdown.map(s => [
      s.state, s.planned, s.actual, `${s.coverage.toFixed(1)}%`, s.budget, s.cost
    ]);

    const hubBreakdownHeaders = ['Hub Office', 'Planned', 'Actual', 'Coverage %', 'Budget (SDG)', 'Cost (SDG)'];
    const hubBreakdownData = summary.hubBreakdown.map(h => [
      h.hub, h.planned, h.actual, `${h.coverage.toFixed(1)}%`, h.budget, h.cost
    ]);

    const enumeratorHeaders = ['Enumerator Name', 'Classification', 'Sites Completed', 'Total Fees (SDG)', 'Total Transport (SDG)', 'Total Amount (SDG)'];
    const enumeratorData = summary.enumeratorBreakdown.map(e => [
      e.enumeratorName, e.classification, e.sitesCompleted, e.totalFees, e.totalTransport, e.totalAmount
    ]);

    const wb = XLSX.utils.book_new();
    
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    
    const detailWs = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailData, [], totalsRow]);
    XLSX.utils.book_append_sheet(wb, detailWs, 'Site Details');
    
    const stateWs = XLSX.utils.aoa_to_sheet([stateBreakdownHeaders, ...stateBreakdownData]);
    XLSX.utils.book_append_sheet(wb, stateWs, 'By State');
    
    const hubWs = XLSX.utils.aoa_to_sheet([hubBreakdownHeaders, ...hubBreakdownData]);
    XLSX.utils.book_append_sheet(wb, hubWs, 'By Hub');
    
    const enumWs = XLSX.utils.aoa_to_sheet([enumeratorHeaders, ...enumeratorData]);
    XLSX.utils.book_append_sheet(wb, enumWs, 'Enumerator Summary');

    const fileName = `Tracker_Plan_${filters.year}_${String(filters.month).padStart(2, '0')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    toast({ title: 'Export Complete', description: `Downloaded: ${fileName}` });
  };

  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(18);
    doc.text('Tracker Preparation Plan', 14, 20);
    doc.setFontSize(12);
    doc.text(`Planned vs Actual Coverage Report`, 14, 28);
    doc.setFontSize(10);
    doc.text(`Period: ${months.find(m => m.value === filters.month)?.label} ${filters.year}`, 14, 36);
    doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 42);

    doc.setFontSize(11);
    doc.text('Summary Statistics', 14, 55);
    
    const summaryTableData = [
      ['Total Planned', summary.totalPlanned.toString()],
      ['Total Completed', summary.totalActual.toString()],
      ['Coverage', `${summary.coveragePercentage.toFixed(1)}%`],
      ['Pending', summary.pendingCount.toString()],
      ['In Progress', summary.inProgressCount.toString()],
      ['Cancelled', summary.cancelledCount.toString()]
    ];

    const financialData = [
      ['Planned Budget', `SDG ${summary.totalPlannedBudget.toLocaleString()}`],
      ['Actual Cost', `SDG ${summary.totalActualCost.toLocaleString()}`],
      ['Variance', `SDG ${summary.totalVariance.toLocaleString()}`],
      ['Enumerator Fees', `SDG ${summary.totalEnumeratorFees.toLocaleString()}`],
      ['Transport Costs', `SDG ${summary.totalTransportCost.toLocaleString()}`]
    ];

    (doc as any).autoTable({
      startY: 60,
      head: [['Metric', 'Value']],
      body: summaryTableData,
      theme: 'grid',
      headStyles: { fillColor: [66, 139, 202] },
      margin: { left: 14 },
      tableWidth: 80
    });

    (doc as any).autoTable({
      startY: 60,
      head: [['Financial Metric', 'Amount']],
      body: financialData,
      theme: 'grid',
      headStyles: { fillColor: [92, 184, 92] },
      margin: { left: 110 },
      tableWidth: 90
    });

    const tableColumn = ['Site Code', 'Site Name', 'State', 'Locality', 'Status', 'Enumerator', 'Budget', 'Cost'];
    const tableRows = filteredItems.slice(0, 50).map(item => [
      item.site_code,
      item.site_name.substring(0, 20),
      item.state.substring(0, 15),
      item.locality.substring(0, 15),
      item.actual_status,
      (item.enumerator_name || 'N/A').substring(0, 15),
      `${item.planned_budget.toLocaleString()}`,
      `${item.actual_cost.toLocaleString()}`
    ]);

    (doc as any).autoTable({
      startY: 130,
      head: [tableColumn],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 8 },
      margin: { left: 14, right: 14 }
    });

    if (filteredItems.length > 50) {
      const finalY = (doc as any).lastAutoTable.finalY || 200;
      doc.setFontSize(9);
      doc.text(`Showing 50 of ${filteredItems.length} sites. Export to Excel for complete data.`, 14, finalY + 10);
    }

    const fileName = `Tracker_Plan_${filters.year}_${String(filters.month).padStart(2, '0')}_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;
    doc.save(fileName);
    
    toast({ title: 'Export Complete', description: `Downloaded: ${fileName}` });
  };

  const toggleRowExpand = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Completed</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">In Progress</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">Not Started</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6" data-testid="tracker-preparation-plan-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="page-title">
            <ClipboardList className="h-7 w-7" />
            Tracker Preparation Plan
          </h1>
          <p className="text-muted-foreground">
            Compare planned vs actual site coverage and prepare invoices
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => loadTrackerData()} disabled={loading} data-testid="button-refresh">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setSaveDialogOpen(true)} data-testid="button-save-config">
            <Save className="h-4 w-4 mr-2" />
            Save Config
          </Button>
          <Button variant="outline" onClick={exportToExcel} data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <Button variant="outline" onClick={exportToPDF} data-testid="button-export-pdf">
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button onClick={() => setInvoiceDialogOpen(true)} data-testid="button-prepare-invoice">
            <Receipt className="h-4 w-4 mr-2" />
            Prepare Invoice
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <Label>Month</Label>
              <Select
                value={String(filters.month)}
                onValueChange={(v) => setFilters(prev => ({ ...prev, month: parseInt(v) }))}
              >
                <SelectTrigger data-testid="select-month">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Select
                value={String(filters.year)}
                onValueChange={(v) => setFilters(prev => ({ ...prev, year: parseInt(v) }))}
              >
                <SelectTrigger data-testid="select-year">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Project</Label>
              <Select
                value={filters.projectId || 'all'}
                onValueChange={(v) => setFilters(prev => ({ ...prev, projectId: v === 'all' ? undefined : v }))}
              >
                <SelectTrigger data-testid="select-project">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Hub</Label>
              <Select
                value={filters.hubId || 'all'}
                onValueChange={(v) => setFilters(prev => ({ ...prev, hubId: v === 'all' ? undefined : v }))}
              >
                <SelectTrigger data-testid="select-hub">
                  <SelectValue placeholder="All Hubs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hubs</SelectItem>
                  {hubs.map(h => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>State</Label>
              <Select
                value={filters.states[0] || 'all'}
                onValueChange={(v) => setFilters(prev => ({ ...prev, states: v === 'all' ? [] : [v] }))}
              >
                <SelectTrigger data-testid="select-state">
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {sudanStates.map(s => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sites..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                  data-testid="input-search"
                />
              </div>
            </div>
          </div>
          
          {savedConfigs.length > 0 && (
            <div className="mt-4">
              <Label className="text-sm text-muted-foreground">Saved Configurations:</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {savedConfigs.slice(0, 5).map(config => (
                  <Badge
                    key={config.id}
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => handleLoadConfig(config)}
                  >
                    {config.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card data-testid="card-total-planned">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.totalPlanned}</p>
                <p className="text-xs text-muted-foreground">Total Planned</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-total-actual">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.totalActual}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-coverage">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.coveragePercentage.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">Coverage</p>
              </div>
            </div>
            <Progress value={summary.coveragePercentage} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        <Card data-testid="card-pending">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-budget">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-bold">{summary.totalPlannedBudget.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Budget (SDG)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-actual-cost">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${summary.totalVariance >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                {summary.totalVariance >= 0 ? (
                  <TrendingDown className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <TrendingUp className="h-5 w-5 text-red-600 dark:text-red-400" />
                )}
              </div>
              <div>
                <p className="text-lg font-bold">{summary.totalActualCost.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Actual (SDG)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="details" data-testid="tab-details">
            <ClipboardList className="h-4 w-4 mr-2" />
            Site Details
          </TabsTrigger>
          <TabsTrigger value="by-state" data-testid="tab-by-state">
            <MapPin className="h-4 w-4 mr-2" />
            By State
          </TabsTrigger>
          <TabsTrigger value="by-hub" data-testid="tab-by-hub">
            <Building2 className="h-4 w-4 mr-2" />
            By Hub
          </TabsTrigger>
          <TabsTrigger value="enumerators" data-testid="tab-enumerators">
            <Users className="h-4 w-4 mr-2" />
            Enumerators
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Coverage by State</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {summary.stateBreakdown.slice(0, 6).map(state => (
                    <div key={state.state}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{state.state}</span>
                        <span>{state.actual}/{state.planned} ({state.coverage.toFixed(0)}%)</span>
                      </div>
                      <Progress value={state.coverage} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Coverage by Hub</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {summary.hubBreakdown.slice(0, 6).map(hub => (
                    <div key={hub.hub}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{hub.hub}</span>
                        <span>{hub.actual}/{hub.planned} ({hub.coverage.toFixed(0)}%)</span>
                      </div>
                      <Progress value={hub.coverage} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Enumerators by Sites Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Enumerator</th>
                      <th className="text-left p-2">Classification</th>
                      <th className="text-right p-2">Sites</th>
                      <th className="text-right p-2">Fees (SDG)</th>
                      <th className="text-right p-2">Transport (SDG)</th>
                      <th className="text-right p-2">Total (SDG)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.enumeratorBreakdown.slice(0, 10).map(e => (
                      <tr key={e.enumeratorId} className="border-b hover:bg-muted/30">
                        <td className="p-2">{e.enumeratorName}</td>
                        <td className="p-2">
                          <Badge variant="outline">{e.classification}</Badge>
                        </td>
                        <td className="p-2 text-right">{e.sitesCompleted}</td>
                        <td className="p-2 text-right">{e.totalFees.toLocaleString()}</td>
                        <td className="p-2 text-right">{e.totalTransport.toLocaleString()}</td>
                        <td className="p-2 text-right font-medium">{e.totalAmount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50 font-medium">
                      <td className="p-2" colSpan={2}>TOTAL</td>
                      <td className="p-2 text-right">{summary.enumeratorBreakdown.reduce((s, e) => s + e.sitesCompleted, 0)}</td>
                      <td className="p-2 text-right">{summary.totalEnumeratorFees.toLocaleString()}</td>
                      <td className="p-2 text-right">{summary.totalTransportCost.toLocaleString()}</td>
                      <td className="p-2 text-right">{summary.totalActualCost.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Site Details ({filteredItems.length} sites)</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="border-b">
                      <th className="text-left p-2 w-8"></th>
                      <th className="text-left p-2">Site Code</th>
                      <th className="text-left p-2">Site Name</th>
                      <th className="text-left p-2">State</th>
                      <th className="text-left p-2">Locality</th>
                      <th className="text-left p-2">Hub</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Enumerator</th>
                      <th className="text-right p-2">Budget</th>
                      <th className="text-right p-2">Actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => (
                      <>
                        <tr 
                          key={item.id} 
                          className="border-b hover:bg-muted/30 cursor-pointer"
                          onClick={() => toggleRowExpand(item.id)}
                          data-testid={`row-site-${item.id}`}
                        >
                          <td className="p-2">
                            {expandedRows.has(item.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </td>
                          <td className="p-2 font-mono text-xs">{item.site_code}</td>
                          <td className="p-2">{item.site_name}</td>
                          <td className="p-2">{item.state}</td>
                          <td className="p-2">{item.locality}</td>
                          <td className="p-2">{item.hub_office || '-'}</td>
                          <td className="p-2">{getStatusBadge(item.actual_status)}</td>
                          <td className="p-2">{item.enumerator_name || '-'}</td>
                          <td className="p-2 text-right">{item.planned_budget.toLocaleString()}</td>
                          <td className="p-2 text-right">{item.actual_cost.toLocaleString()}</td>
                        </tr>
                        {expandedRows.has(item.id) && (
                          <tr className="bg-muted/20">
                            <td colSpan={10} className="p-4">
                              <div className="grid md:grid-cols-3 gap-4 text-sm">
                                <div>
                                  <p className="font-medium mb-2">Site Information</p>
                                  <div className="space-y-1 text-muted-foreground">
                                    <p>CP Name: {item.cp_name || 'N/A'}</p>
                                    <p>Activity: {item.activity_at_site || 'N/A'}</p>
                                    <p>Survey Tool: {item.survey_tool || 'N/A'}</p>
                                  </div>
                                </div>
                                <div>
                                  <p className="font-medium mb-2">Schedule</p>
                                  <div className="space-y-1 text-muted-foreground">
                                    <p>Planned: {item.planned_date || 'Not set'}</p>
                                    <p>Actual: {item.actual_date || 'Not completed'}</p>
                                    <p>Classification: {item.enumerator_classification || 'N/A'}</p>
                                  </div>
                                </div>
                                <div>
                                  <p className="font-medium mb-2">Cost Breakdown (SDG)</p>
                                  <div className="space-y-1 text-muted-foreground">
                                    <p>Enumerator Fee: {item.enumerator_fee.toLocaleString()}</p>
                                    <p>Transport: {item.transport_cost.toLocaleString()}</p>
                                    <p>Accommodation: {item.accommodation_cost.toLocaleString()}</p>
                                    <p>Meals: {item.meal_per_diem.toLocaleString()}</p>
                                    <p>Logistics: {item.logistics_cost.toLocaleString()}</p>
                                    <Separator className="my-1" />
                                    <p className="font-medium text-foreground">Total: {item.actual_cost.toLocaleString()}</p>
                                  </div>
                                </div>
                              </div>
                              {item.notes && (
                                <div className="mt-3 pt-3 border-t">
                                  <p className="text-sm text-muted-foreground">Notes: {item.notes}</p>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50 font-medium sticky bottom-0">
                      <td className="p-2" colSpan={8}>TOTALS ({filteredItems.length} sites)</td>
                      <td className="p-2 text-right">{summary.totalPlannedBudget.toLocaleString()}</td>
                      <td className="p-2 text-right">{summary.totalActualCost.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-state">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coverage by State</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">State</th>
                    <th className="text-right p-3">Planned</th>
                    <th className="text-right p-3">Actual</th>
                    <th className="text-right p-3">Coverage</th>
                    <th className="text-right p-3">Budget (SDG)</th>
                    <th className="text-right p-3">Cost (SDG)</th>
                    <th className="text-right p-3">Variance (SDG)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.stateBreakdown.map(state => (
                    <tr key={state.state} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{state.state}</td>
                      <td className="p-3 text-right">{state.planned}</td>
                      <td className="p-3 text-right">{state.actual}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Progress value={state.coverage} className="w-16 h-2" />
                          <span className="w-12 text-right">{state.coverage.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-right">{state.budget.toLocaleString()}</td>
                      <td className="p-3 text-right">{state.cost.toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <span className={state.budget - state.cost >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {(state.budget - state.cost).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-medium">
                    <td className="p-3">TOTAL</td>
                    <td className="p-3 text-right">{summary.totalPlanned}</td>
                    <td className="p-3 text-right">{summary.totalActual}</td>
                    <td className="p-3 text-right">{summary.coveragePercentage.toFixed(0)}%</td>
                    <td className="p-3 text-right">{summary.totalPlannedBudget.toLocaleString()}</td>
                    <td className="p-3 text-right">{summary.totalActualCost.toLocaleString()}</td>
                    <td className="p-3 text-right">{summary.totalVariance.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-hub">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coverage by Hub Office</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">Hub Office</th>
                    <th className="text-right p-3">Planned</th>
                    <th className="text-right p-3">Actual</th>
                    <th className="text-right p-3">Coverage</th>
                    <th className="text-right p-3">Budget (SDG)</th>
                    <th className="text-right p-3">Cost (SDG)</th>
                    <th className="text-right p-3">Variance (SDG)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.hubBreakdown.map(hub => (
                    <tr key={hub.hub} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{hub.hub}</td>
                      <td className="p-3 text-right">{hub.planned}</td>
                      <td className="p-3 text-right">{hub.actual}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Progress value={hub.coverage} className="w-16 h-2" />
                          <span className="w-12 text-right">{hub.coverage.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-right">{hub.budget.toLocaleString()}</td>
                      <td className="p-3 text-right">{hub.cost.toLocaleString()}</td>
                      <td className="p-3 text-right">
                        <span className={hub.budget - hub.cost >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {(hub.budget - hub.cost).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-medium">
                    <td className="p-3">TOTAL</td>
                    <td className="p-3 text-right">{summary.totalPlanned}</td>
                    <td className="p-3 text-right">{summary.totalActual}</td>
                    <td className="p-3 text-right">{summary.coveragePercentage.toFixed(0)}%</td>
                    <td className="p-3 text-right">{summary.totalPlannedBudget.toLocaleString()}</td>
                    <td className="p-3 text-right">{summary.totalActualCost.toLocaleString()}</td>
                    <td className="p-3 text-right">{summary.totalVariance.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enumerators">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enumerator Summary (For Invoice Preparation)</CardTitle>
              <CardDescription>
                Complete breakdown of enumerator fees and expenses for invoice generation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">Enumerator Name</th>
                    <th className="text-left p-3">Classification</th>
                    <th className="text-right p-3">Sites Completed</th>
                    <th className="text-right p-3">Enumerator Fees (SDG)</th>
                    <th className="text-right p-3">Transport (SDG)</th>
                    <th className="text-right p-3">Total Amount (SDG)</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.enumeratorBreakdown.map(e => (
                    <tr key={e.enumeratorId} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{e.enumeratorName}</td>
                      <td className="p-3">
                        <Badge variant="outline">{e.classification}</Badge>
                      </td>
                      <td className="p-3 text-right">{e.sitesCompleted}</td>
                      <td className="p-3 text-right">{e.totalFees.toLocaleString()}</td>
                      <td className="p-3 text-right">{e.totalTransport.toLocaleString()}</td>
                      <td className="p-3 text-right font-medium">{e.totalAmount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-medium">
                    <td className="p-3">TOTAL ({summary.enumeratorBreakdown.length} Enumerators)</td>
                    <td className="p-3"></td>
                    <td className="p-3 text-right">{summary.enumeratorBreakdown.reduce((s, e) => s + e.sitesCompleted, 0)}</td>
                    <td className="p-3 text-right">{summary.totalEnumeratorFees.toLocaleString()}</td>
                    <td className="p-3 text-right">{summary.totalTransportCost.toLocaleString()}</td>
                    <td className="p-3 text-right">{summary.totalActualCost.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Configuration</DialogTitle>
            <DialogDescription>
              Save the current filter settings for quick access later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Configuration Name</Label>
              <Input
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                placeholder="e.g., November 2024 - All Hubs"
                data-testid="input-config-name"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Current filters:</p>
              <ul className="list-disc list-inside mt-1">
                <li>Period: {months.find(m => m.value === filters.month)?.label} {filters.year}</li>
                {filters.projectId && <li>Project: {projects.find(p => p.id === filters.projectId)?.name}</li>}
                {filters.hubId && <li>Hub: {hubs.find(h => h.id === filters.hubId)?.name}</li>}
                {filters.states.length > 0 && <li>States: {filters.states.join(', ')}</li>}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveConfig} data-testid="button-confirm-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Prepare Invoice</DialogTitle>
            <DialogDescription>
              Generate invoice based on completed site visits
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Invoice Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Period</p>
                    <p className="font-medium">{months.find(m => m.value === filters.month)?.label} {filters.year}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Sites Completed</p>
                    <p className="font-medium">{summary.totalActual}</p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Enumerator Fees</span>
                    <span>SDG {summary.totalEnumeratorFees.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transport Costs</span>
                    <span>SDG {summary.totalTransportCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Accommodation</span>
                    <span>SDG {lineItems.filter(i => i.actual_status === 'completed').reduce((s, i) => s + i.accommodation_cost, 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Meals/Per Diem</span>
                    <span>SDG {lineItems.filter(i => i.actual_status === 'completed').reduce((s, i) => s + i.meal_per_diem, 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Logistics</span>
                    <span>SDG {lineItems.filter(i => i.actual_status === 'completed').reduce((s, i) => s + i.logistics_cost, 0).toLocaleString()}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total Amount</span>
                    <span>SDG {summary.totalActualCost.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <div className="text-sm text-muted-foreground">
              <p>This invoice includes {summary.enumeratorBreakdown.length} enumerators across {summary.stateBreakdown.length} states.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)}>Cancel</Button>
            <Button variant="outline" onClick={exportToExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Details
            </Button>
            <Button onClick={() => {
              exportToPDF();
              setInvoiceDialogOpen(false);
            }}>
              <Printer className="h-4 w-4 mr-2" />
              Generate Invoice PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
