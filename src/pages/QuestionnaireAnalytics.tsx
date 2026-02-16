import { useState, useCallback, useMemo, Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Upload, FileSpreadsheet, BarChart3, Download, Search, Filter, X, ChevronDown, ChevronUp, Users, MapPin, Building2, Activity, Layers, FileDown } from 'lucide-react';
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
  const [filterHub, setFilterHub] = useState('all');
  const [filterState, setFilterState] = useState('all');
  const [filterActivity, setFilterActivity] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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
        setFilterHub('all');
        setFilterState('all');
        setFilterActivity('all');
        setSearchQuery('');
      } catch (err) {
        console.error('Error parsing Excel file:', err);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const filteredData = useMemo(() => {
    let result = data;
    if (filterHub !== 'all') result = result.filter(r => r.hub === filterHub);
    if (filterState !== 'all') result = result.filter(r => r.state === filterState);
    if (filterActivity !== 'all') result = result.filter(r => r.activity === filterActivity);
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
  }, [data, filterHub, filterState, filterActivity, searchQuery]);

  const uniqueHubs = useMemo(() => [...new Set(data.map(r => r.hub))].filter(Boolean).sort(), [data]);
  const uniqueStates = useMemo(() => [...new Set(data.map(r => r.state))].filter(Boolean).sort(), [data]);
  const uniqueActivities = useMemo(() => [...new Set(data.map(r => r.activity))].filter(Boolean).sort(), [data]);

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
          <p className="text-muted-foreground mt-1">Upload Excel data to analyze questionnaire submissions by Hub, State, Locality, Activity, and Data Collector</p>
        </div>
        {data.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" data-testid="button-export">
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
        )}
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
              <Select value={filterHub} onValueChange={setFilterHub}>
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-hub-filter">
                  <SelectValue placeholder="All Hubs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hubs</SelectItem>
                  {uniqueHubs.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterState} onValueChange={setFilterState}>
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-state-filter">
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {uniqueStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterActivity} onValueChange={setFilterActivity}>
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-activity-filter">
                  <SelectValue placeholder="All Activities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activities</SelectItem>
                  {uniqueActivities.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              {(filterHub !== 'all' || filterState !== 'all' || filterActivity !== 'all' || searchQuery) && (
                <Button variant="ghost" size="icon" onClick={() => { setFilterHub('all'); setFilterState('all'); setFilterActivity('all'); setSearchQuery(''); }} data-testid="button-clear-filters">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 sm:grid-cols-7 w-full">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="hub" data-testid="tab-hub">Hub</TabsTrigger>
              <TabsTrigger value="state" data-testid="tab-state">State</TabsTrigger>
              <TabsTrigger value="locality" data-testid="tab-locality">Locality</TabsTrigger>
              <TabsTrigger value="sites" data-testid="tab-sites">Sites</TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity">Activity (PDM)</TabsTrigger>
              <TabsTrigger value="collector" data-testid="tab-collector">Collector</TabsTrigger>
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
          </Tabs>
        </>
      )}
    </div>
  );
};

export default QuestionnaireAnalytics;
