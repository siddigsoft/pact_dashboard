import { useState, useCallback, useMemo, Fragment, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, BarChart3, Download, Search, Filter, X, ChevronDown, ChevronUp, Users, MapPin, Building2, Activity, Layers, FileDown, Save, FolderOpen, Trash2, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

interface QuestionnaireRow {
  hub: string;
  state: string;
  locality: string;
  activitySite: string;
  activity: string;
  subActivity: string;
  dataCollector: string;
  deviceId: string;
  supervisor: string;
  date: string;
  siteId: string;
  partner: string;
}

interface SummaryItem {
  name: string;
  count: number;
  percentage: number;
  children?: SummaryItem[];
}

interface ActivitySiteItem {
  name: string;
  siteCount: number;
  questionnaireCount: number;
  percentage: number;
  sites: { name: string; count: number; percentage: number }[];
  children?: SummaryItem[];
}

interface SavedSession {
  id: string;
  name: string;
  fileName: string;
  savedAt: string;
  rowCount: number;
  data: QuestionnaireRow[];
}

const STORAGE_KEY = 'pact_questionnaire_sessions';
const SESSION_VERSION = 1;

const DEFAULT_COLUMN_MAP = {
  hub: 16,
  state: 17,
  locality: 18,
  activitySite: 19,
  activity: 24,
  subActivity: 25,
  dataCollector: 11,
  deviceId: 8,
  supervisor: 12,
  date: 10,
  siteId: 21,
  partner: 22,
};

const HEADER_KEYWORDS: Record<string, string[]> = {
  deviceId: ['deviceid', 'device_id', 'معرف الجهاز', 'device id', 'device identifier', 'imei'],
  dataCollector: ['data collector', 'datacollector', 'enumerator', 'collector name', 'اسم الجامع', 'data_collector'],
};

const QuestionnaireAnalytics = () => {
  const [data, setData] = useState<QuestionnaireRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterHubs, setFilterHubs] = useState<string[]>([]);
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [filterActivities, setFilterActivities] = useState<string[]>([]);
  const [filterLocalities, setFilterLocalities] = useState<string[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [currentSessionName, setCurrentSessionName] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const sessions: SavedSession[] = (Array.isArray(parsed) ? parsed : [])
          .filter((s: any) => s && s.id && s.name && Array.isArray(s.data))
          .map((s: any) => ({ ...s, data: s.data || [] }));
        setSavedSessions(sessions);
      }
    } catch {}
  }, []);

  const saveSession = useCallback(() => {
    if (!saveName.trim() || data.length === 0) return;
    const session: SavedSession = {
      id: Date.now().toString(),
      name: saveName.trim(),
      fileName,
      savedAt: new Date().toISOString(),
      rowCount: data.length,
      data,
    };
    const updated = [...savedSessions, session];
    setSavedSessions(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setCurrentSessionName(saveName.trim());
    setShowSaveDialog(false);
    setSaveName('');
  }, [saveName, data, fileName, savedSessions]);

  const loadSession = useCallback((session: SavedSession) => {
    setData(session.data);
    setFileName(session.fileName);
    setCurrentSessionName(session.name);
    setFilterHubs([]);
    setFilterStates([]);
    setFilterActivities([]);
    setFilterLocalities([]);
    setSearchQuery('');
    setShowLoadDialog(false);
  }, []);

  const deleteSession = useCallback((id: string) => {
    const updated = savedSessions.filter(s => s.id !== id);
    setSavedSessions(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, [savedSessions]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result;
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        const colMap = { ...DEFAULT_COLUMN_MAP };
        if (rawData.length > 0) {
          const headerRow = rawData[0].map((h: any) => (h || '').toString().toLowerCase().trim());
          Object.entries(HEADER_KEYWORDS).forEach(([field, keywords]) => {
            const idx = headerRow.findIndex((h: string) => keywords.some(kw => h.includes(kw)));
            if (idx >= 0) (colMap as any)[field] = idx;
          });
        }

        const rows: QuestionnaireRow[] = rawData.slice(1).map((row) => ({
          hub: (row[colMap.hub] || '').toString().trim(),
          state: (row[colMap.state] || '').toString().trim(),
          locality: (row[colMap.locality] || '').toString().trim(),
          activitySite: (row[colMap.activitySite] || '').toString().trim(),
          activity: (row[colMap.activity] || '').toString().trim(),
          subActivity: (row[colMap.subActivity] || '').toString().trim(),
          dataCollector: (row[colMap.dataCollector] || '').toString().trim(),
          deviceId: (row[colMap.deviceId] || '').toString().trim(),
          supervisor: (row[colMap.supervisor] || '').toString().trim(),
          date: (row[colMap.date] || '').toString().trim(),
          siteId: (row[colMap.siteId] || '').toString().trim(),
          partner: (row[colMap.partner] || '').toString().trim(),
        })).filter(row => row.hub || row.state || row.dataCollector);

        setData(rows);
        setCurrentSessionName('');
        setFilterHubs([]);
        setFilterStates([]);
        setFilterActivities([]);
        setFilterLocalities([]);
        setSearchQuery('');
      } catch (err) {
        console.error('Error parsing Excel file:', err);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const filteredData = useMemo(() => {
    let result = data;
    if (filterHubs.length > 0) result = result.filter(r => filterHubs.includes(r.hub));
    if (filterStates.length > 0) result = result.filter(r => filterStates.includes(r.state));
    if (filterActivities.length > 0) result = result.filter(r => filterActivities.includes(r.activity));
    if (filterLocalities.length > 0) result = result.filter(r => filterLocalities.includes(r.locality));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.dataCollector.toLowerCase().includes(q) ||
        r.hub.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q) ||
        r.locality.toLowerCase().includes(q) ||
        r.activitySite.toLowerCase().includes(q) ||
        r.activity.toLowerCase().includes(q) ||
        r.subActivity.toLowerCase().includes(q)
      );
    }
    return result;
  }, [data, filterHubs, filterStates, filterActivities, filterLocalities, searchQuery]);

  const uniqueHubs = useMemo(() => [...new Set(data.map(r => r.hub))].filter(Boolean).sort(), [data]);
  const uniqueStates = useMemo(() => [...new Set(data.map(r => r.state))].filter(Boolean).sort(), [data]);
  const uniqueActivities = useMemo(() => [...new Set(data.map(r => r.activity))].filter(Boolean).sort(), [data]);
  const uniqueLocalities = useMemo(() => [...new Set(data.map(r => r.locality))].filter(Boolean).sort(), [data]);

  const activeFilterCount = filterHubs.length + filterStates.length + filterActivities.length + filterLocalities.length;

  const toggleFilter = (arr: string[], setArr: (v: string[]) => void, val: string) => {
    setArr(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);
  };

  const clearAllFilters = () => {
    setFilterHubs([]);
    setFilterStates([]);
    setFilterActivities([]);
    setFilterLocalities([]);
    setSearchQuery('');
  };

  const buildSummary = useCallback((items: QuestionnaireRow[], key: keyof QuestionnaireRow): SummaryItem[] => {
    const counts = new Map<string, number>();
    items.forEach(row => {
      const val = row[key] || '(Empty)';
      counts.set(val, (counts.get(val) || 0) + 1);
    });
    const total = items.length;
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count, percentage: total > 0 ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);
  }, []);

  const buildNestedSummary = useCallback((items: QuestionnaireRow[], parentKey: keyof QuestionnaireRow, childKey: keyof QuestionnaireRow): SummaryItem[] => {
    const parentMap = new Map<string, Map<string, number>>();
    items.forEach(row => {
      const parent = row[parentKey] || '(Empty)';
      const child = row[childKey] || '(Empty)';
      if (!parentMap.has(parent)) parentMap.set(parent, new Map());
      const childMap = parentMap.get(parent)!;
      childMap.set(child, (childMap.get(child) || 0) + 1);
    });
    const total = items.length;
    return [...parentMap.entries()]
      .map(([name, childMap]) => {
        const count = [...childMap.values()].reduce((a, b) => a + b, 0);
        const children = [...childMap.entries()]
          .map(([childName, childCount]) => ({ name: childName, count: childCount, percentage: count > 0 ? (childCount / count) * 100 : 0 }))
          .sort((a, b) => b.count - a.count);
        return { name, count, percentage: total > 0 ? (count / total) * 100 : 0, children };
      })
      .sort((a, b) => b.count - a.count);
  }, []);

  const hubSummary = useMemo(() => buildSummary(filteredData, 'hub'), [filteredData, buildSummary]);
  const stateSummary = useMemo(() => buildSummary(filteredData, 'state'), [filteredData, buildSummary]);
  const localitySummary = useMemo(() => buildSummary(filteredData, 'locality'), [filteredData, buildSummary]);
  const siteSummary = useMemo(() => buildSummary(filteredData, 'activitySite'), [filteredData, buildSummary]);
  const activitySubSummary = useMemo(() => buildNestedSummary(filteredData, 'activity', 'subActivity'), [filteredData, buildNestedSummary]);

  const activitySummary = useMemo((): ActivitySiteItem[] => {
    const actMap = new Map<string, Map<string, number>>();
    filteredData.forEach(row => {
      const act = row.activity || '(Empty)';
      const site = row.activitySite || '(Empty)';
      if (!actMap.has(act)) actMap.set(act, new Map());
      const siteMap = actMap.get(act)!;
      siteMap.set(site, (siteMap.get(site) || 0) + 1);
    });
    const totalQ = filteredData.length;
    return [...actMap.entries()]
      .map(([name, siteMap]) => {
        const questionnaireCount = [...siteMap.values()].reduce((a, b) => a + b, 0);
        const sites = [...siteMap.entries()]
          .map(([siteName, count]) => ({ name: siteName, count, percentage: questionnaireCount > 0 ? (count / questionnaireCount) * 100 : 0 }))
          .sort((a, b) => b.count - a.count);
        return {
          name,
          siteCount: siteMap.size,
          questionnaireCount,
          percentage: totalQ > 0 ? (questionnaireCount / totalQ) * 100 : 0,
          sites,
        };
      })
      .sort((a, b) => b.siteCount - a.siteCount);
  }, [filteredData]);
  const collectorSummary = useMemo(() => {
    const collMap = new Map<string, { count: number; deviceId: string }>();
    filteredData.forEach(row => {
      const name = row.dataCollector || '(Empty)';
      const existing = collMap.get(name);
      if (existing) {
        existing.count++;
        if (!existing.deviceId && row.deviceId) existing.deviceId = row.deviceId;
      } else {
        collMap.set(name, { count: 1, deviceId: row.deviceId || '' });
      }
    });
    const total = filteredData.length;
    return [...collMap.entries()]
      .map(([name, { count, deviceId }]) => ({ name, count, deviceId, percentage: total > 0 ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);
  }, [filteredData]);

  const collectorByHub = useMemo(() => {
    const hubMap = new Map<string, Map<string, { count: number; deviceId: string }>>();
    filteredData.forEach(row => {
      const hub = row.hub || '(Empty)';
      const collector = row.dataCollector || '(Empty)';
      if (!hubMap.has(hub)) hubMap.set(hub, new Map());
      const cMap = hubMap.get(hub)!;
      const existing = cMap.get(collector);
      if (existing) {
        existing.count++;
        if (!existing.deviceId && row.deviceId) existing.deviceId = row.deviceId;
      } else {
        cMap.set(collector, { count: 1, deviceId: row.deviceId || '' });
      }
    });
    return [...hubMap.entries()]
      .map(([hub, collectors]) => ({
        hub,
        total: [...collectors.values()].reduce((a, b) => a + b.count, 0),
        collectors: [...collectors.entries()]
          .map(([name, { count, deviceId }]) => ({ name, count, deviceId }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredData]);

  const toggleExpand = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportToExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();

    const hubData = hubSummary.map(h => ({ Hub: h.name, 'Total Questionnaires': h.count, 'Percentage': h.percentage.toFixed(1) + '%' }));
    const hubWs = XLSX.utils.json_to_sheet(hubData);
    XLSX.utils.book_append_sheet(wb, hubWs, 'By Hub');

    const stateData = stateSummary.map(s => ({ State: s.name, 'Total Questionnaires': s.count, 'Percentage': s.percentage.toFixed(1) + '%' }));
    const stateWs = XLSX.utils.json_to_sheet(stateData);
    XLSX.utils.book_append_sheet(wb, stateWs, 'By State');

    const localityData = localitySummary.map(l => ({ Locality: l.name, 'Total Questionnaires': l.count, 'Percentage': l.percentage.toFixed(1) + '%' }));
    const localityWs = XLSX.utils.json_to_sheet(localityData);
    XLSX.utils.book_append_sheet(wb, localityWs, 'By Locality');

    const siteData = siteSummary.map(s => ({ 'Site Name': s.name, 'Total Questionnaires': s.count, 'Percentage': s.percentage.toFixed(1) + '%' }));
    const siteWs = XLSX.utils.json_to_sheet(siteData);
    XLSX.utils.book_append_sheet(wb, siteWs, 'By Site');

    const actRows: any[] = [];
    activitySummary.forEach(a => {
      actRows.push({ 'Activity (PDM)': a.name, 'Site Name': '', 'Sites Count': a.siteCount, 'Questionnaires': a.questionnaireCount, '%': a.percentage.toFixed(1) + '%' });
      a.sites.forEach(s => {
        actRows.push({ 'Activity (PDM)': '', 'Site Name': s.name, 'Sites Count': '', 'Questionnaires': s.count, '%': s.percentage.toFixed(1) + '%' });
      });
    });
    const actWs = XLSX.utils.json_to_sheet(actRows);
    XLSX.utils.book_append_sheet(wb, actWs, 'By Activity (PDM)');

    const collData = collectorSummary.map(c => ({ 'معرف الجهاز (Device ID)': c.deviceId, 'Data Collector': c.name, 'Total Questionnaires': c.count, 'Percentage': c.percentage.toFixed(1) + '%' }));
    const collWs = XLSX.utils.json_to_sheet(collData);
    XLSX.utils.book_append_sheet(wb, collWs, 'By Data Collector');

    const collHubRows: any[] = [];
    collectorByHub.forEach(h => {
      h.collectors.forEach(c => {
        collHubRows.push({ Hub: h.hub, 'معرف الجهاز (Device ID)': c.deviceId, 'Data Collector': c.name, 'Total Questionnaires': c.count });
      });
    });
    const collHubWs = XLSX.utils.json_to_sheet(collHubRows);
    XLSX.utils.book_append_sheet(wb, collHubWs, 'Collectors by Hub');

    XLSX.writeFile(wb, 'questionnaire_analytics.xlsx');
  }, [hubSummary, stateSummary, localitySummary, siteSummary, activitySummary, collectorSummary, collectorByHub]);

  const exportToPdf = useCallback(() => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;
    let y = 15;

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('PACT Command Center', margin, y);
    doc.text(`Generated: ${format(new Date(), 'PPP')}`, pageWidth - margin - 55, y);
    y += 10;

    doc.setFontSize(18);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text('Questionnaire Analytics Report', margin, y);
    y += 8;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text(`Total Questionnaires: ${filteredData.length}`, margin, y);
    y += 12;

    const addSection = (title: string, headers: string[], rows: string[][]) => {
      if (y > doc.internal.pageSize.height - 40) {
        doc.addPage();
        y = 15;
      }
      doc.setFontSize(13);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.text(title, margin, y);
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [headers],
        body: rows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [41, 98, 255], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        didDrawPage: () => { y = 15; },
      });
      y = (doc as any).lastAutoTable.finalY + 12;
    };

    addSection(
      'Summary by Hub',
      ['Hub', 'Total', '%'],
      hubSummary.map(h => [h.name, String(h.count), h.percentage.toFixed(1) + '%'])
    );

    addSection(
      'Summary by State',
      ['State', 'Total', '%'],
      stateSummary.map(s => [s.name, String(s.count), s.percentage.toFixed(1) + '%'])
    );

    addSection(
      'Summary by Locality',
      ['Locality', 'Total', '%'],
      localitySummary.map(l => [l.name, String(l.count), l.percentage.toFixed(1) + '%'])
    );

    addSection(
      'Summary by Site',
      ['Site Name', 'Questionnaires', '%'],
      siteSummary.map(s => [s.name, String(s.count), s.percentage.toFixed(1) + '%'])
    );

    const actRows: string[][] = [];
    activitySummary.forEach(a => {
      actRows.push([a.name, '', String(a.siteCount), String(a.questionnaireCount)]);
      a.sites.forEach(s => {
        actRows.push(['', '  ' + s.name, '', String(s.count)]);
      });
    });
    addSection(
      'Summary by Activity (PDM) - Sites & Questionnaires',
      ['Activity (PDM)', 'Site Name', 'Sites', 'Questionnaires'],
      actRows
    );

    addSection(
      'Summary by Data Collector',
      ['Device ID', 'Data Collector', 'Total', '%'],
      collectorSummary.map(c => [c.deviceId || '-', c.name, String(c.count), c.percentage.toFixed(1) + '%'])
    );

    const collHubRows: string[][] = [];
    collectorByHub.forEach(h => {
      h.collectors.forEach(c => {
        collHubRows.push([h.hub, c.deviceId || '-', c.name, String(c.count)]);
      });
    });
    addSection(
      'Data Collectors by Hub',
      ['Hub', 'Device ID', 'Data Collector', 'Total'],
      collHubRows
    );

    doc.save('questionnaire_analytics.pdf');
  }, [filteredData, hubSummary, stateSummary, localitySummary, siteSummary, activitySummary, collectorSummary, collectorByHub]);

  const SummaryTable = ({ items, label, icon: Icon }: { items: SummaryItem[]; label: string; icon: React.ElementType }) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-primary" />
          By {label}
        </CardTitle>
        <CardDescription>{items.length} unique {label.toLowerCase()}s found</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid={`table-${label.toLowerCase()}`}>
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2 px-3 font-medium">#</th>
                <th className="text-left py-2 px-3 font-medium">{label}</th>
                <th className="text-right py-2 px-3 font-medium">Total</th>
                <th className="text-right py-2 px-3 font-medium">%</th>
                <th className="py-2 px-3 font-medium w-32">Distribution</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.name} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 px-3 font-medium">{item.name}</td>
                  <td className="py-2 px-3 text-right">
                    <Badge variant="secondary" className="font-mono">{item.count}</Badge>
                  </td>
                  <td className="py-2 px-3 text-right text-muted-foreground">{item.percentage.toFixed(1)}%</td>
                  <td className="py-2 px-3">
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${Math.min(item.percentage, 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/50 font-semibold">
                <td className="py-2 px-3" colSpan={2}>Total</td>
                <td className="py-2 px-3 text-right">
                  <Badge className="font-mono">{items.reduce((a, b) => a + b.count, 0)}</Badge>
                </td>
                <td className="py-2 px-3 text-right">100%</td>
                <td className="py-2 px-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Questionnaire Analytics</h1>
          <p className="text-muted-foreground mt-1">
            {currentSessionName ? (
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1"><FolderOpen className="h-3 w-3" />{currentSessionName}</Badge>
                <span className="text-xs">({fileName})</span>
              </span>
            ) : 'Upload Excel data to analyze questionnaire submissions'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {savedSessions.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowLoadDialog(true)} data-testid="button-load">
              <FolderOpen className="h-4 w-4" />
              Saved ({savedSessions.length})
            </Button>
          )}
          {data.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setSaveName(currentSessionName || fileName.replace(/\.[^.]+$/, '')); setShowSaveDialog(true); }} data-testid="button-save">
                <Save className="h-4 w-4" />
                Save
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-export">
                    <Download className="h-4 w-4" />
                    Export
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportToExcel} data-testid="button-export-excel">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToPdf} data-testid="button-export-pdf">
                    <FileDown className="h-4 w-4 mr-2" />
                    Export to PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="py-6">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-lg">Upload Excel File</h3>
              <p className="text-sm text-muted-foreground mt-1">Upload the questionnaire data Excel file (.xlsx, .xls)</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer">
                <Input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-file-upload"
                />
                <Button asChild>
                  <span className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Choose File
                  </span>
                </Button>
              </label>
              {fileName && (
                <Badge variant="outline" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {fileName}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {data.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-primary">{filteredData.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Questionnaires</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-teal-600">{new Set(filteredData.map(r => r.activitySite).filter(Boolean)).size}</div>
              <div className="text-xs text-muted-foreground mt-1">Unique Sites</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{new Set(filteredData.map(r => r.hub)).size}</div>
              <div className="text-xs text-muted-foreground mt-1">Hubs</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{new Set(filteredData.map(r => r.state)).size}</div>
              <div className="text-xs text-muted-foreground mt-1">States</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-orange-600">{new Set(filteredData.map(r => r.activity)).size}</div>
              <div className="text-xs text-muted-foreground mt-1">Activities</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">{new Set(filteredData.map(r => r.dataCollector)).size}</div>
              <div className="text-xs text-muted-foreground mt-1">Data Collectors</div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, hub, state, activity..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
                <Button variant={showFilterPanel ? 'default' : 'outline'} className="gap-2" onClick={() => setShowFilterPanel(!showFilterPanel)} data-testid="button-toggle-filters">
                  <Filter className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5">{activeFilterCount}</Badge>}
                </Button>
                {(activeFilterCount > 0 || searchQuery) && (
                  <Button variant="ghost" size="sm" className="gap-1" onClick={clearAllFilters} data-testid="button-clear-filters">
                    <X className="h-4 w-4" />
                    Clear All
                  </Button>
                )}
              </div>

              {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {filterHubs.map(h => (
                    <Badge key={`fh-${h}`} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter(filterHubs, setFilterHubs, h)}>
                      Hub: {h} <X className="h-3 w-3" />
                    </Badge>
                  ))}
                  {filterStates.map(s => (
                    <Badge key={`fs-${s}`} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter(filterStates, setFilterStates, s)}>
                      State: {s} <X className="h-3 w-3" />
                    </Badge>
                  ))}
                  {filterLocalities.map(l => (
                    <Badge key={`fl-${l}`} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter(filterLocalities, setFilterLocalities, l)}>
                      Locality: {l} <X className="h-3 w-3" />
                    </Badge>
                  ))}
                  {filterActivities.map(a => (
                    <Badge key={`fa-${a}`} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter(filterActivities, setFilterActivities, a)}>
                      Activity: {a} <X className="h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              )}

              {showFilterPanel && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t">
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground mb-2 block">HUBS</Label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {uniqueHubs.map(h => (
                        <div key={h} className="flex items-center gap-2">
                          <Checkbox checked={filterHubs.includes(h)} onCheckedChange={() => toggleFilter(filterHubs, setFilterHubs, h)} id={`hub-${h}`} data-testid={`checkbox-hub-${h}`} />
                          <label htmlFor={`hub-${h}`} className="text-sm cursor-pointer flex-1 truncate">{h}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground mb-2 block">STATES</Label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {uniqueStates.map(s => (
                        <div key={s} className="flex items-center gap-2">
                          <Checkbox checked={filterStates.includes(s)} onCheckedChange={() => toggleFilter(filterStates, setFilterStates, s)} id={`state-${s}`} data-testid={`checkbox-state-${s}`} />
                          <label htmlFor={`state-${s}`} className="text-sm cursor-pointer flex-1 truncate">{s}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground mb-2 block">LOCALITIES</Label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {uniqueLocalities.map(l => (
                        <div key={l} className="flex items-center gap-2">
                          <Checkbox checked={filterLocalities.includes(l)} onCheckedChange={() => toggleFilter(filterLocalities, setFilterLocalities, l)} id={`loc-${l}`} data-testid={`checkbox-locality-${l}`} />
                          <label htmlFor={`loc-${l}`} className="text-sm cursor-pointer flex-1 truncate">{l}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground mb-2 block">ACTIVITIES</Label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {uniqueActivities.map(a => (
                        <div key={a} className="flex items-center gap-2">
                          <Checkbox checked={filterActivities.includes(a)} onCheckedChange={() => toggleFilter(filterActivities, setFilterActivities, a)} id={`act-${a}`} data-testid={`checkbox-activity-${a}`} />
                          <label htmlFor={`act-${a}`} className="text-sm cursor-pointer flex-1 truncate">{a}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 sm:grid-cols-8 w-full">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="hub" data-testid="tab-hub">Hub</TabsTrigger>
              <TabsTrigger value="state" data-testid="tab-state">State</TabsTrigger>
              <TabsTrigger value="locality" data-testid="tab-locality">Locality</TabsTrigger>
              <TabsTrigger value="sites" data-testid="tab-sites">Sites</TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity">Activity (PDM)</TabsTrigger>
              <TabsTrigger value="collector" data-testid="tab-collector">Collector</TabsTrigger>
              <TabsTrigger value="tracker" data-testid="tab-tracker">Tracker</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SummaryTable items={hubSummary} label="Hub" icon={Building2} />
                <SummaryTable items={stateSummary} label="State" icon={MapPin} />
              </div>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-5 w-5 text-primary" />
                    By Activity (PDM)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-activity-overview">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium w-8"></th>
                          <th className="text-left py-2 px-3 font-medium">Activity (PDM)</th>
                          <th className="text-right py-2 px-3 font-medium">Sites</th>
                          <th className="text-right py-2 px-3 font-medium">Questionnaires</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activitySummary.map((item) => (
                          <Fragment key={item.name}>
                            <tr
                              className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                              onClick={() => toggleExpand(item.name)}
                              data-testid={`row-activity-${item.name}`}
                            >
                              <td className="py-2 px-3">
                                {item.sites.length > 0 && (
                                  expandedRows.has(item.name) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                                )}
                              </td>
                              <td className="py-2 px-3 font-medium">{item.name}</td>
                              <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono">{item.siteCount}</Badge></td>
                              <td className="py-2 px-3 text-right text-muted-foreground">{item.questionnaireCount}</td>
                            </tr>
                            {expandedRows.has(item.name) && item.sites.map(site => (
                              <tr key={`${item.name}-${site.name}`} className="border-b bg-muted/20">
                                <td className="py-1.5 px-3" />
                                <td className="py-1.5 px-3 pl-8 text-muted-foreground flex items-center gap-2">
                                  <MapPin className="h-3 w-3" />
                                  {site.name}
                                </td>
                                <td className="py-1.5 px-3" />
                                <td className="py-1.5 px-3 text-right"><Badge variant="outline" className="font-mono text-xs">{site.count}</Badge></td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 px-3" />
                          <td className="py-2 px-3">Total</td>
                          <td className="py-2 px-3 text-right"><Badge className="font-mono">{activitySummary.reduce((a, b) => a + b.siteCount, 0)}</Badge></td>
                          <td className="py-2 px-3 text-right">{activitySummary.reduce((a, b) => a + b.questionnaireCount, 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hub" className="mt-4">
              <SummaryTable items={hubSummary} label="Hub" icon={Building2} />
            </TabsContent>

            <TabsContent value="state" className="mt-4">
              <SummaryTable items={stateSummary} label="State" icon={MapPin} />
            </TabsContent>

            <TabsContent value="locality" className="mt-4">
              <SummaryTable items={localitySummary} label="Locality" icon={MapPin} />
            </TabsContent>

            <TabsContent value="sites" className="mt-4">
              <SummaryTable items={siteSummary} label="Site" icon={MapPin} />
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-5 w-5 text-primary" />
                    By Activity (PDM) &mdash; Sites & Questionnaires
                  </CardTitle>
                  <CardDescription>{activitySummary.length} activities, {activitySummary.reduce((a, b) => a + b.siteCount, 0)} total sites</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-activity">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium w-8"></th>
                          <th className="text-left py-2 px-3 font-medium">Activity (PDM)</th>
                          <th className="text-right py-2 px-3 font-medium">Sites</th>
                          <th className="text-right py-2 px-3 font-medium">Questionnaires</th>
                          <th className="py-2 px-3 font-medium w-32">Distribution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activitySummary.map((item) => (
                          <Fragment key={item.name}>
                            <tr
                              className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                              onClick={() => toggleExpand(`act-${item.name}`)}
                            >
                              <td className="py-2 px-3">
                                {item.sites.length > 0 && (
                                  expandedRows.has(`act-${item.name}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                                )}
                              </td>
                              <td className="py-2 px-3 font-medium">{item.name}</td>
                              <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono">{item.siteCount}</Badge></td>
                              <td className="py-2 px-3 text-right text-muted-foreground">{item.questionnaireCount}</td>
                              <td className="py-2 px-3">
                                <div className="w-full bg-muted rounded-full h-2">
                                  <div className="bg-primary rounded-full h-2" style={{ width: `${Math.min(item.percentage, 100)}%` }} />
                                </div>
                              </td>
                            </tr>
                            {expandedRows.has(`act-${item.name}`) && item.sites.map(site => (
                              <tr key={`${item.name}-${site.name}`} className="border-b bg-blue-50/50 dark:bg-blue-900/10">
                                <td className="py-1.5 px-3" />
                                <td className="py-1.5 px-3 pl-8 flex items-center gap-2">
                                  <MapPin className="h-3 w-3 text-blue-500" />
                                  <span className="text-blue-700 dark:text-blue-300">{site.name}</span>
                                </td>
                                <td className="py-1.5 px-3" />
                                <td className="py-1.5 px-3 text-right"><Badge variant="outline" className="font-mono text-xs">{site.count}</Badge></td>
                                <td className="py-1.5 px-3">
                                  <div className="w-full bg-muted rounded-full h-1.5">
                                    <div className="bg-blue-400 rounded-full h-1.5" style={{ width: `${Math.min(site.percentage, 100)}%` }} />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 px-3" />
                          <td className="py-2 px-3">Total</td>
                          <td className="py-2 px-3 text-right"><Badge className="font-mono">{activitySummary.reduce((a, b) => a + b.siteCount, 0)}</Badge></td>
                          <td className="py-2 px-3 text-right">{activitySummary.reduce((a, b) => a + b.questionnaireCount, 0)}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="collector" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-primary" />
                    By Data Collector
                  </CardTitle>
                  <CardDescription>{collectorSummary.length} unique data collectors found</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-data-collector">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium">#</th>
                          <th className="text-left py-2 px-3 font-medium">معرف الجهاز (Device ID)</th>
                          <th className="text-left py-2 px-3 font-medium">Data Collector</th>
                          <th className="text-right py-2 px-3 font-medium">Total</th>
                          <th className="text-right py-2 px-3 font-medium">%</th>
                          <th className="py-2 px-3 font-medium w-32">Distribution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collectorSummary.map((item, i) => (
                          <tr key={item.name} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                            <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{item.deviceId || '-'}</td>
                            <td className="py-2 px-3 font-medium">{item.name}</td>
                            <td className="py-2 px-3 text-right">
                              <Badge variant="secondary" className="font-mono">{item.count}</Badge>
                            </td>
                            <td className="py-2 px-3 text-right text-muted-foreground">{item.percentage.toFixed(1)}%</td>
                            <td className="py-2 px-3">
                              <div className="w-full bg-muted rounded-full h-2">
                                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${Math.min(item.percentage, 100)}%` }} />
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 px-3" colSpan={3}>Total</td>
                          <td className="py-2 px-3 text-right">
                            <Badge className="font-mono">{collectorSummary.reduce((a, b) => a + b.count, 0)}</Badge>
                          </td>
                          <td className="py-2 px-3 text-right">100%</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-primary" />
                    Data Collectors by Hub
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {collectorByHub.map(hubGroup => (
                      <div key={hubGroup.hub} className="border rounded-lg">
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => toggleExpand(`hub-col-${hubGroup.hub}`)}
                          data-testid={`row-hub-collector-${hubGroup.hub}`}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span className="font-medium">{hubGroup.hub}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{hubGroup.total} questionnaires</Badge>
                            <Badge variant="outline">{hubGroup.collectors.length} collectors</Badge>
                            {expandedRows.has(`hub-col-${hubGroup.hub}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                        {expandedRows.has(`hub-col-${hubGroup.hub}`) && (
                          <div className="border-t px-3 pb-3">
                            <table className="w-full text-sm mt-2">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-1.5 px-2 font-medium text-xs">#</th>
                                  <th className="text-left py-1.5 px-2 font-medium text-xs">معرف الجهاز</th>
                                  <th className="text-left py-1.5 px-2 font-medium text-xs">Data Collector</th>
                                  <th className="text-right py-1.5 px-2 font-medium text-xs">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {hubGroup.collectors.map((c, i) => (
                                  <tr key={c.name} className="border-b last:border-0">
                                    <td className="py-1.5 px-2 text-muted-foreground text-xs">{i + 1}</td>
                                    <td className="py-1.5 px-2 font-mono text-xs text-muted-foreground">{c.deviceId || '-'}</td>
                                    <td className="py-1.5 px-2">{c.name}</td>
                                    <td className="py-1.5 px-2 text-right"><Badge variant="outline" className="font-mono text-xs">{c.count}</Badge></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tracker" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Layers className="h-5 w-5 text-primary" />
                    Tracker - Cross-Tab Summary
                  </CardTitle>
                  <CardDescription>Activity (PDM) breakdown by Hub with questionnaire counts (Actual) and site counts</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    {(() => {
                      const hubs = [...new Set(filteredData.map(r => r.hub))].filter(Boolean).sort();
                      const activities = [...new Set(filteredData.map(r => r.activity))].filter(Boolean).sort();

                      type CellData = { questionnaires: number; siteNames: string[] };
                      const matrix: Record<string, Record<string, CellData>> = {};
                      const siteSetMatrix: Record<string, Record<string, Set<string>>> = {};

                      filteredData.forEach(row => {
                        if (!row.activity || !row.hub) return;
                        if (!siteSetMatrix[row.activity]) siteSetMatrix[row.activity] = {};
                        if (!siteSetMatrix[row.activity][row.hub]) siteSetMatrix[row.activity][row.hub] = new Set();
                        if (!matrix[row.activity]) matrix[row.activity] = {};
                        if (!matrix[row.activity][row.hub]) matrix[row.activity][row.hub] = { questionnaires: 0, siteNames: [] };
                        matrix[row.activity][row.hub].questionnaires++;
                        if (row.activitySite) siteSetMatrix[row.activity][row.hub].add(row.activitySite);
                      });

                      activities.forEach(act => {
                        hubs.forEach(hub => {
                          if (!matrix[act]) matrix[act] = {};
                          if (!matrix[act][hub]) matrix[act][hub] = { questionnaires: 0, siteNames: [] };
                          matrix[act][hub].siteNames = [...(siteSetMatrix[act]?.[hub] || [])];
                        });
                      });

                      const hubTotals: Record<string, { questionnaires: number; sites: number }> = {};
                      const rowTotals: Record<string, { questionnaires: number; sites: number }> = {};
                      let grandQ = 0;
                      const grandSiteSet = new Set<string>();

                      hubs.forEach(hub => { hubTotals[hub] = { questionnaires: 0, sites: 0 }; });
                      activities.forEach(act => {
                        let rq = 0;
                        const rSites = new Set<string>();
                        hubs.forEach(hub => {
                          const cell = matrix[act][hub];
                          rq += cell.questionnaires;
                          cell.siteNames.forEach(s => { rSites.add(s); grandSiteSet.add(s); });
                          hubTotals[hub].questionnaires += cell.questionnaires;
                        });
                        rowTotals[act] = { questionnaires: rq, sites: rSites.size };
                        grandQ += rq;
                      });

                      hubs.forEach(hub => {
                        const hubSiteSet = new Set<string>();
                        activities.forEach(act => {
                          matrix[act][hub].siteNames.forEach(s => hubSiteSet.add(s));
                        });
                        hubTotals[hub].sites = hubSiteSet.size;
                      });

                      return (
                        <table className="w-full text-sm border-collapse" data-testid="table-tracker">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="text-left py-2 px-3 font-medium border min-w-[200px] sticky left-0 bg-muted/50 z-10">Activity (PDM)</th>
                              {hubs.map(hub => (
                                <th key={hub} className="text-center py-2 px-3 font-medium border min-w-[120px]" colSpan={2}>{hub}</th>
                              ))}
                              <th className="text-center py-2 px-3 font-medium border min-w-[120px] bg-primary/10" colSpan={2}>Grand Total</th>
                            </tr>
                            <tr className="bg-muted/30">
                              <th className="text-left py-1 px-3 text-xs font-medium border sticky left-0 bg-muted/30 z-10"></th>
                              {hubs.map(hub => (
                                <Fragment key={hub}>
                                  <th className="text-center py-1 px-2 text-xs font-medium border text-blue-600">Sites</th>
                                  <th className="text-center py-1 px-2 text-xs font-medium border text-green-600">Actual</th>
                                </Fragment>
                              ))}
                              <th className="text-center py-1 px-2 text-xs font-medium border text-blue-600 bg-primary/5">Sites</th>
                              <th className="text-center py-1 px-2 text-xs font-medium border text-green-600 bg-primary/5">Actual</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activities.map((act, i) => (
                              <tr key={act} className={i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}>
                                <td className={`py-2 px-3 font-medium border sticky left-0 z-10 ${i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}`}>{act}</td>
                                {hubs.map(hub => {
                                  const cell = matrix[act][hub];
                                  return (
                                    <Fragment key={hub}>
                                      <td className="text-center py-2 px-2 border text-blue-600 font-mono text-xs">{cell.siteNames.length || '-'}</td>
                                      <td className="text-center py-2 px-2 border text-green-600 font-mono text-xs">{cell.questionnaires || '-'}</td>
                                    </Fragment>
                                  );
                                })}
                                <td className="text-center py-2 px-2 border font-mono text-xs text-blue-700 font-semibold bg-primary/5">{rowTotals[act].sites}</td>
                                <td className="text-center py-2 px-2 border font-mono text-xs text-green-700 font-semibold bg-primary/5">{rowTotals[act].questionnaires}</td>
                              </tr>
                            ))}
                            <tr className="bg-muted/50 font-semibold">
                              <td className="py-2 px-3 border sticky left-0 bg-muted/50 z-10">Grand Total</td>
                              {hubs.map(hub => (
                                <Fragment key={hub}>
                                  <td className="text-center py-2 px-2 border text-blue-700 font-mono text-xs">{hubTotals[hub].sites}</td>
                                  <td className="text-center py-2 px-2 border text-green-700 font-mono text-xs">{hubTotals[hub].questionnaires}</td>
                                </Fragment>
                              ))}
                              <td className="text-center py-2 px-2 border text-blue-700 font-mono text-xs bg-primary/10">{grandSiteSet.size}</td>
                              <td className="text-center py-2 px-2 border text-green-700 font-mono text-xs bg-primary/10">{grandQ}</td>
                            </tr>
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Save className="h-5 w-5" /> Save Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="session-name">Session Name</Label>
              <Input
                id="session-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g., November 2025 Tracker"
                className="mt-1"
                data-testid="input-session-name"
                onKeyDown={(e) => { if (e.key === 'Enter') saveSession(); }}
              />
            </div>
            <p className="text-xs text-muted-foreground">File: {fileName} | {data.length} rows</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button onClick={saveSession} disabled={!saveName.trim()} data-testid="button-confirm-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLoadDialog} onOpenChange={setShowLoadDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FolderOpen className="h-5 w-5" /> Saved Sessions</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {savedSessions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No saved sessions yet</p>
            ) : (
              savedSessions.map(session => (
                <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors" data-testid={`session-${session.id}`}>
                  <button type="button" className="flex-1 min-w-0 cursor-pointer text-left" onClick={() => loadSession(session)} data-testid={`button-session-select-${session.id}`}>
                    <div className="font-medium truncate">{session.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(session.savedAt), 'MMM d, yyyy h:mm a')}
                      <span className="text-muted-foreground/60">|</span>
                      <span>{session.rowCount} rows</span>
                      <span className="text-muted-foreground/60">|</span>
                      <span className="truncate">{session.fileName}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 ml-2">
                    <Button size="sm" variant="outline" onClick={() => loadSession(session)} data-testid={`button-load-${session.id}`}>Load</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteSession(session.id)} data-testid={`button-delete-${session.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuestionnaireAnalytics;
