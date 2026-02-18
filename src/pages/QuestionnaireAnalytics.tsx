import { useState, useCallback, useMemo, Fragment, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, BarChart3, Download, Search, Filter, X, ChevronDown, ChevronUp, Users, MapPin, Building2, Activity, Layers, FileDown, Save, FolderOpen, Trash2, Clock, Globe, PieChart, Lock, Sparkles, CheckCircle2, AlertCircle, ArrowRight, FileSearch, Mail, FileText, Send, ClipboardList } from 'lucide-react';
import { useAuthorization } from '@/hooks/use-authorization';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parse, isValid } from 'date-fns';
import { drawPdfHeader, styledAutoTable, addAllFooters, addPageHeader, loadArabicFont, arText, C } from '@/utils/analyticsPdfUtils';
import { exportFormattedExcel, exportFormattedTrackerExcel, exportCoverageTrackerExcel } from '@/utils/analyticsExcelUtils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Legend } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { EmailNotificationService } from '@/services/email-notification.service';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

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

interface SummaryWithSites {
  name: string;
  questionnaires: number;
  sites: number;
  percentage: number;
}

interface ActivityBreakdown {
  name: string;
  siteCount: number;
  questionnaireCount: number;
  percentage: number;
  siteList: { name: string; count: number; percentage: number }[];
  byHub: { name: string; count: number; sites: number }[];
  byState: { name: string; count: number; sites: number }[];
  byLocality: { name: string; count: number; sites: number }[];
  byCollector: { name: string; count: number; deviceId: string }[];
}

interface CollectorDetail {
  name: string;
  deviceId: string;
  count: number;
  percentage: number;
  activities: { name: string; count: number }[];
  localities: { name: string; count: number }[];
  hubs: string[];
  states: string[];
  nameVariants: { name: string; count: number }[];
}

interface SavedSession {
  id: string;
  name: string;
  fileName: string;
  savedAt: string;
  rowCount: number;
  data: QuestionnaireRow[];
}

const CHART_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#dc2626', '#ca8a04', '#4f46e5', '#0d9488', '#e11d48', '#7c3aed', '#059669'];

const STORAGE_KEY = 'pact_questionnaire_sessions';

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

const isPdmActivity = (activity: string) => /pdm/i.test(activity);

const DATE_FORMATS = ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy/MM/dd', 'M/d/yyyy', 'd/M/yyyy'];

function computeSummaryFromData(rows: QuestionnaireRow[], allRows: QuestionnaireRow[], fName: string, cleanRes: any) {
  const dates: Date[] = [];
  rows.forEach(r => {
    if (!r.date) return;
    for (const fmt of DATE_FORMATS) {
      const d = parse(r.date, fmt, new Date());
      if (isValid(d)) { dates.push(d); break; }
    }
  });
  let monthCoverage = 'N/A';
  if (dates.length > 0) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const first = format(dates[0], 'MMMM yyyy');
    const last = format(dates[dates.length - 1], 'MMMM yyyy');
    monthCoverage = first === last ? first : `${first} - ${last}`;
  }

  const supervisorMap = new Map<string, { collectors: { name: string; deviceId: string; count: number }[]; totalQ: number }>();
  const collectorBySup = new Map<string, Map<string, { deviceId: string; count: number }>>();
  rows.forEach(r => {
    const sup = r.supervisor || '(Unassigned)';
    if (!collectorBySup.has(sup)) collectorBySup.set(sup, new Map());
    const cm = collectorBySup.get(sup)!;
    const dc = r.dataCollector || '(Unknown)';
    if (!cm.has(dc)) cm.set(dc, { deviceId: r.deviceId || '', count: 0 });
    cm.get(dc)!.count++;
  });
  collectorBySup.forEach((dcMap, sup) => {
    const collectors = [...dcMap.entries()].map(([name, d]) => ({ name, deviceId: d.deviceId, count: d.count })).sort((a, b) => b.count - a.count);
    supervisorMap.set(sup, { collectors, totalQ: collectors.reduce((s, c) => s + c.count, 0) });
  });
  const teamOverview = [...supervisorMap.entries()].map(([supervisor, d]) => ({
    supervisor, collectors: d.collectors, teamSize: d.collectors.length, totalQ: d.totalQ,
  })).sort((a, b) => b.totalQ - a.totalQ);

  const uniqueSites = new Set(rows.map(r => r.activitySite).filter(Boolean)).size;
  const uniqueHubsSet = new Set(rows.map(r => r.hub).filter(Boolean));
  const uniqueStatesSet = new Set(rows.map(r => r.state).filter(Boolean));
  const uniqueLocalitiesSet = new Set(rows.map(r => r.locality).filter(Boolean));

  const hubBreakdown = Array.from(uniqueHubsSet).map(hub => {
    const hubRows = rows.filter(r => r.hub === hub);
    return { hub, sites: new Set(hubRows.map(r => r.activitySite).filter(Boolean)).size, questionnaires: hubRows.length };
  });

  const activityBreakdown = Array.from(new Set(rows.map(r => r.activity).filter(Boolean))).map(act => {
    return { activity: act, count: rows.filter(r => r.activity === act).length };
  });

  let qualityReport = null;
  if (cleanRes) {
    const qScore = cleanRes.originalCount > 0 ? ((cleanRes.cleanedCount / cleanRes.originalCount) * 100).toFixed(1) : '100.0';
    qualityReport = {
      originalRows: cleanRes.originalCount, cleanRows: cleanRes.cleanedCount,
      duplicatesRemoved: cleanRes.duplicatesRemoved, emptyRowsRemoved: cleanRes.emptyRowsRemoved,
      trimmedFields: cleanRes.trimmedDetails?.length || cleanRes.trimmedFields || 0,
      namesStandardized: cleanRes.nameChanges?.length || cleanRes.namesStandardized || 0,
      qualityScore: qScore,
      duplicateGroups: cleanRes.duplicateGroups || [],
      nameChanges: cleanRes.nameChanges || [],
    };
  }

  return {
    monthCoverage,
    generatedDate: format(new Date(), 'MMMM d, yyyy h:mm a'),
    fileName: fName,
    teamOverview,
    totalQuestionnaires: rows.length,
    originalRows: allRows.length,
    uniqueSites,
    uniqueHubs: uniqueHubsSet.size,
    uniqueStates: uniqueStatesSet.size,
    uniqueLocalities: uniqueLocalitiesSet.size,
    hubBreakdown,
    activityBreakdown,
    qualityReport,
    totalCollectors: new Set(rows.map(r => r.dataCollector).filter(Boolean)).size,
    totalSupervisors: supervisorMap.size,
  };
}

const AccessDenied = () => (
  <div className="flex items-center justify-center h-[60vh]">
    <Card className="max-w-md w-full">
      <CardContent className="pt-6 text-center">
        <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
        <p className="text-sm text-muted-foreground">Only Super Admins can access the Questionnaire Analytics page.</p>
      </CardContent>
    </Card>
  </div>
);

const QuestionnaireAnalytics = () => {
  const { isSuperAdmin } = useAuthorization();
  const { toast } = useToast();
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
  const [drillExpandedHubs, setDrillExpandedHubs] = useState<Set<string>>(new Set());
  const [drillExpandedStates, setDrillExpandedStates] = useState<Set<string>>(new Set());
  const [drillExpandedActivities, setDrillExpandedActivities] = useState<Set<string>>(new Set());
  const [drillExpandedLocalities, setDrillExpandedLocalities] = useState<Set<string>>(new Set());
  const [showCleanDialog, setShowCleanDialog] = useState(false);
  const [cleanExpandedSection, setCleanExpandedSection] = useState<string | null>(null);
  const [duplicateKeepMap, setDuplicateKeepMap] = useState<Map<number, Set<number>>>(new Map());
  const [cleanResults, setCleanResults] = useState<{
    originalCount: number;
    cleanedCount: number;
    duplicatesRemoved: number;
    emptyRowsRemoved: number;
    trimmedFields: number;
    namesStandardized: number;
    cleanedData: QuestionnaireRow[];
    duplicateGroups: { key: string; rows: { index: number; row: QuestionnaireRow; isKept: boolean }[] }[];
    emptyRows: { index: number; row: QuestionnaireRow }[];
    trimmedDetails: { index: number; field: string; before: string; after: string }[];
    nameChanges: { index: number; deviceId: string; oldName: string; newName: string }[];
  } | null>(null);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailCcRoles, setEmailCcRoles] = useState<string[]>([]);
  const [emailAttachReview, setEmailAttachReview] = useState(true);
  const [emailAttachCleaned, setEmailAttachCleaned] = useState(true);
  const [emailSending, setEmailSending] = useState(false);
  const [emailUsers, setEmailUsers] = useState<{id: string; name: string; email: string; role: string}[]>([]);
  const [reportIssuesExpanded, setReportIssuesExpanded] = useState(false);

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

  const cleanExcelData = useCallback(() => {
    if (data.length === 0) return;

    let trimmedFields = 0;
    let namesStandardized = 0;
    let emptyRowsRemoved = 0;
    let duplicatesRemoved = 0;
    const trimmedDetails: { index: number; field: string; before: string; after: string }[] = [];
    const emptyRows: { index: number; row: QuestionnaireRow }[] = [];
    const nameChanges: { index: number; deviceId: string; oldName: string; newName: string }[] = [];

    const trimmed = data.map((row, idx) => {
      const cleaned: QuestionnaireRow = { ...row };
      (Object.keys(cleaned) as (keyof QuestionnaireRow)[]).forEach(key => {
        const val = cleaned[key];
        if (typeof val === 'string') {
          const trimmedVal = val.replace(/\s+/g, ' ').trim();
          if (trimmedVal !== val) {
            trimmedDetails.push({ index: idx, field: key, before: val, after: trimmedVal });
            (cleaned as any)[key] = trimmedVal;
            trimmedFields++;
          }
        }
      });
      return cleaned;
    });

    const indexed = trimmed.map((row, idx) => ({ row, origIdx: idx }));

    const nonEmpty = indexed.filter(({ row, origIdx }) => {
      const hasContent = row.hub || row.state || row.locality || row.activitySite ||
        row.activity || row.dataCollector || row.date;
      if (!hasContent) {
        emptyRowsRemoved++;
        emptyRows.push({ index: origIdx, row: data[origIdx] });
      }
      return hasContent;
    });

    const safe = (v: string | undefined | null) => (v || '').trim();

    const deviceNameCounts = new Map<string, Map<string, number>>();
    nonEmpty.forEach(({ row }) => {
      const devId = safe(row.deviceId);
      if (!devId) return;
      if (!deviceNameCounts.has(devId)) deviceNameCounts.set(devId, new Map());
      const names = deviceNameCounts.get(devId)!;
      const name = safe(row.dataCollector);
      if (!name) return;
      names.set(name, (names.get(name) || 0) + 1);
    });
    const deviceNameMap = new Map<string, string>();
    deviceNameCounts.forEach((names, devId) => {
      if (names.size <= 1) {
        const firstName = names.keys().next().value;
        if (firstName) deviceNameMap.set(devId, firstName);
        return;
      }
      let maxCount = 0;
      let primaryName = '';
      names.forEach((count, name) => {
        if (count > maxCount) { maxCount = count; primaryName = name; }
      });
      deviceNameMap.set(devId, primaryName);
    });

    const standardized = nonEmpty.map(({ row, origIdx }) => {
      const devId = safe(row.deviceId);
      if (!devId) return { row, origIdx };
      const primary = deviceNameMap.get(devId);
      if (primary && safe(row.dataCollector) !== primary) {
        namesStandardized++;
        nameChanges.push({ index: origIdx, deviceId: devId, oldName: safe(row.dataCollector), newName: primary });
        return { row: { ...row, dataCollector: primary }, origIdx };
      }
      return { row, origIdx };
    });

    const keyGroups = new Map<string, { index: number; row: QuestionnaireRow }[]>();
    standardized.forEach(({ row, origIdx }) => {
      const actLower = safe(row.activity).toLowerCase();
      const isPDM = actLower === 'pdm' || actLower.includes('post distribution monitoring');
      if (isPDM) return;
      const key = [safe(row.deviceId), safe(row.dataCollector), safe(row.activitySite), safe(row.activity), safe(row.subActivity), safe(row.date), safe(row.hub), safe(row.state), safe(row.locality)].join('|||');
      if (!keyGroups.has(key)) keyGroups.set(key, []);
      keyGroups.get(key)!.push({ index: origIdx, row });
    });

    const duplicateGroups: { key: string; rows: { index: number; row: QuestionnaireRow; isKept: boolean }[] }[] = [];
    const deduped: QuestionnaireRow[] = [];
    const seen = new Set<string>();

    standardized.forEach(({ row }) => {
      const actLower2 = safe(row.activity).toLowerCase();
      const isPDM = actLower2 === 'pdm' || actLower2.includes('post distribution monitoring');
      if (isPDM) {
        deduped.push(row);
        return;
      }
      const key = [safe(row.deviceId), safe(row.dataCollector), safe(row.activitySite), safe(row.activity), safe(row.subActivity), safe(row.date), safe(row.hub), safe(row.state), safe(row.locality)].join('|||');
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(row);
        const group = keyGroups.get(key);
        if (group && group.length > 1) {
          duplicatesRemoved += group.length - 1;
          duplicateGroups.push({
            key,
            rows: group.map((g, gi) => ({ ...g, isKept: gi === 0 })),
          });
        }
      }
    });

    const defaultKeepMap = new Map<number, Set<number>>();
    duplicateGroups.forEach((group, gi) => {
      defaultKeepMap.set(gi, new Set([0]));
    });
    setDuplicateKeepMap(defaultKeepMap);
    setCleanExpandedSection(null);
    setCleanResults({
      originalCount: data.length,
      cleanedCount: deduped.length,
      duplicatesRemoved,
      emptyRowsRemoved,
      trimmedFields,
      namesStandardized,
      cleanedData: deduped,
      duplicateGroups,
      emptyRows,
      trimmedDetails,
      nameChanges,
    });
    setShowCleanDialog(true);
  }, [data]);

  const getCustomCleanedData = useCallback(() => {
    if (!cleanResults) return [];
    const safe = (v: string | undefined | null) => (v || '').trim();
    const result: QuestionnaireRow[] = [];
    const dupKeyToGroupIdx = new Map<string, number>();
    cleanResults.duplicateGroups.forEach((group, gi) => {
      dupKeyToGroupIdx.set(group.key, gi);
    });
    const processedDupKeys = new Set<string>();
    cleanResults.cleanedData.forEach(row => {
      const key = [safe(row.deviceId), safe(row.dataCollector), safe(row.activitySite), safe(row.activity), safe(row.subActivity), safe(row.date), safe(row.hub), safe(row.state), safe(row.locality)].join('|||');
      const groupIdx = dupKeyToGroupIdx.get(key);
      if (groupIdx !== undefined) {
        if (!processedDupKeys.has(key)) {
          processedDupKeys.add(key);
          const group = cleanResults.duplicateGroups[groupIdx];
          const kept = duplicateKeepMap.get(groupIdx) || new Set([0]);
          group.rows.forEach((r, ri) => {
            if (kept.has(ri)) result.push(r.row);
          });
        }
      } else {
        result.push(row);
      }
    });
    return result;
  }, [cleanResults, duplicateKeepMap]);

  const customDupsRemoved = useMemo(() => {
    if (!cleanResults) return 0;
    let removed = 0;
    cleanResults.duplicateGroups.forEach((group, gi) => {
      const kept = duplicateKeepMap.get(gi) || new Set([0]);
      removed += group.rows.length - kept.size;
    });
    return removed;
  }, [cleanResults, duplicateKeepMap]);

  const customCleanedCount = useMemo(() => {
    if (!cleanResults) return 0;
    return cleanResults.originalCount - cleanResults.emptyRowsRemoved - customDupsRemoved;
  }, [cleanResults, customDupsRemoved]);

  const applyCleanedData = useCallback(() => {
    if (!cleanResults) return;
    const finalData = getCustomCleanedData();
    setData(finalData);
    setShowCleanDialog(false);
    setFilterHubs([]);
    setFilterStates([]);
    setFilterActivities([]);
    setFilterLocalities([]);
    setSearchQuery('');
  }, [cleanResults, getCustomCleanedData]);

  const downloadCleanedExcel = useCallback(() => {
    if (!cleanResults) return;
    const finalData = getCustomCleanedData();
    const rows = finalData.map(r => ({
      Hub: r.hub,
      State: r.state,
      Locality: r.locality,
      'Activity Site': r.activitySite,
      Activity: r.activity,
      'Sub Activity': r.subActivity,
      'Data Collector': r.dataCollector,
      'Device ID': r.deviceId,
      Supervisor: r.supervisor,
      Date: r.date,
      'Site ID': r.siteId,
      Partner: r.partner,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Cleaned Data');

    const reportSummary = computeSummaryFromData(finalData, data, fileName, cleanResults);
    const summaryRows: { Metric: string; Value: string | number }[] = [
      { Metric: 'REPORT INFORMATION', Value: '' },
      { Metric: 'Report Title', Value: 'Data Quality & Coverage Report' },
      { Metric: 'Generated Date', Value: format(new Date(), 'MMMM d, yyyy h:mm a') },
      { Metric: 'File Name', Value: fileName },
      { Metric: 'Month Coverage', Value: reportSummary?.monthCoverage || 'N/A' },
      { Metric: '', Value: '' },
      { Metric: 'CLEANING METRICS', Value: '' },
      { Metric: 'Original Rows', Value: cleanResults.originalCount },
      { Metric: 'Cleaned Rows', Value: finalData.length },
      { Metric: 'Duplicates Removed', Value: customDupsRemoved },
      { Metric: 'Empty Rows Removed', Value: cleanResults.emptyRowsRemoved },
      { Metric: 'Fields Trimmed', Value: cleanResults.trimmedFields },
      { Metric: 'Names Standardized', Value: cleanResults.namesStandardized },
      { Metric: 'Data Quality Score', Value: cleanResults.originalCount > 0 ? ((finalData.length / cleanResults.originalCount) * 100).toFixed(1) + '%' : '100%' },
      { Metric: '', Value: '' },
      { Metric: 'COVERAGE TOTALS', Value: '' },
      { Metric: 'Total Questionnaires', Value: reportSummary?.totalQuestionnaires || finalData.length },
      { Metric: 'Unique Sites', Value: reportSummary?.uniqueSites || 0 },
      { Metric: 'Hubs', Value: reportSummary?.uniqueHubs || 0 },
      { Metric: 'States', Value: reportSummary?.uniqueStates || 0 },
      { Metric: 'Localities', Value: reportSummary?.uniqueLocalities || 0 },
      { Metric: 'Data Collectors', Value: reportSummary?.totalCollectors || 0 },
      { Metric: 'Supervisors', Value: reportSummary?.totalSupervisors || 0 },
    ];
    if (reportSummary) {
      summaryRows.push({ Metric: '', Value: '' });
      summaryRows.push({ Metric: 'TEAM ROSTER', Value: '' });
      reportSummary.teamOverview.forEach(team => {
        summaryRows.push({ Metric: `Supervisor: ${team.supervisor}`, Value: `${team.teamSize} DCs, ${team.totalQ} Q` });
        team.collectors.forEach(dc => {
          summaryRows.push({ Metric: `  ${dc.name}`, Value: `Device: ${dc.deviceId} | ${dc.count} Q` });
        });
      });
      summaryRows.push({ Metric: '', Value: '' });
      summaryRows.push({ Metric: 'HUB COVERAGE', Value: '' });
      reportSummary.hubBreakdown.forEach(h => {
        summaryRows.push({ Metric: h.hub, Value: `${h.questionnaires} Q, ${h.sites} sites` });
      });
    }
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    summaryWs['!cols'] = [{ wch: 35 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Cleaning Summary');

    const baseName = fileName.replace(/\.[^.]+$/, '') || 'questionnaire_data';
    XLSX.writeFile(wb, `${baseName}_cleaned.xlsx`);
  }, [cleanResults, fileName, getCustomCleanedData, customDupsRemoved, data]);

  const downloadReviewExcel = useCallback(async () => {
    if (!cleanResults) return;
    const safe = (v: string | undefined | null) => (v || '').trim();

    const dupRowIndices = new Set<number>();
    const dupGroupMap = new Map<number, number>();
    cleanResults.duplicateGroups.forEach((group, gi) => {
      group.rows.forEach(r => {
        dupRowIndices.add(r.index);
        dupGroupMap.set(r.index, gi + 1);
      });
    });
    const emptyRowIndices = new Set(cleanResults.emptyRows.map(r => r.index));
    const trimMap = new Map<string, { before: string; after: string }>();
    cleanResults.trimmedDetails.forEach(td => {
      trimMap.set(`${td.index}|${td.field}`, { before: td.before, after: td.after });
    });
    const nameMap = new Map<number, { oldName: string; newName: string }>();
    cleanResults.nameChanges.forEach(nc => {
      nameMap.set(nc.index, { oldName: nc.oldName, newName: nc.newName });
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data Review');

    const headers = ['Row #', 'Issue', 'Hub', 'State', 'Locality', 'Activity Site', 'Activity', 'Sub Activity', 'Data Collector', 'Device ID', 'Supervisor', 'Date', 'Site ID', 'Partner'];
    const fieldKeys: (keyof QuestionnaireRow)[] = ['hub', 'state', 'locality', 'activitySite', 'activity', 'subActivity', 'dataCollector', 'deviceId', 'supervisor', 'date', 'siteId', 'partner'];
    const headerRow = ws.addRow(headers);
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF374151' } } };
    });

    const redFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    const orangeFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
    const blueFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    const purpleFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
    const greenFill: ExcelJS.FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };

    const redFont: Partial<ExcelJS.Font> = { color: { argb: 'FFDC2626' } };
    const orangeFont: Partial<ExcelJS.Font> = { color: { argb: 'FFEA580C' } };
    const blueFont: Partial<ExcelJS.Font> = { color: { argb: 'FF2563EB' } };
    const purpleFont: Partial<ExcelJS.Font> = { color: { argb: 'FF9333EA' } };

    data.forEach((row, idx) => {
      const issues: string[] = [];
      let rowFill: ExcelJS.FillPattern | null = null;
      let issueFont: Partial<ExcelJS.Font> = {};

      const isDuplicate = dupRowIndices.has(idx);
      const isEmpty = emptyRowIndices.has(idx);
      const hasNameChange = nameMap.has(idx);
      const hasTrim = fieldKeys.some(k => trimMap.has(`${idx}|${k}`));

      if (isDuplicate) {
        const groupNum = dupGroupMap.get(idx);
        issues.push(`DUPLICATE (Group ${groupNum})`);
        rowFill = redFill;
        issueFont = redFont;
      }
      if (isEmpty) {
        issues.push('EMPTY ROW');
        rowFill = orangeFill;
        issueFont = orangeFont;
      }
      if (hasNameChange) {
        const nc = nameMap.get(idx)!;
        issues.push(`NAME: "${nc.oldName}" → "${nc.newName}"`);
        if (!rowFill) { rowFill = purpleFill; issueFont = purpleFont; }
      }
      if (hasTrim) {
        const trimmedFields = fieldKeys.filter(k => trimMap.has(`${idx}|${k}`)).map(k => k);
        issues.push(`TRIMMED: ${trimmedFields.join(', ')}`);
        if (!rowFill) { rowFill = blueFill; issueFont = blueFont; }
      }

      const values = [idx + 1, issues.join(' | ') || '', ...fieldKeys.map(k => row[k] || '')];
      const excelRow = ws.addRow(values);

      if (rowFill) {
        excelRow.eachCell((cell, colNum) => {
          cell.fill = rowFill!;
        });
      }
      if (issues.length > 0) {
        const issueCell = excelRow.getCell(2);
        issueCell.font = { ...issueFont, bold: true, size: 10 };
      }
      if (!issues.length) {
        excelRow.eachCell((cell, colNum) => {
          if (colNum > 2) cell.fill = greenFill;
        });
        const issueCell = excelRow.getCell(2);
        issueCell.value = 'OK';
        issueCell.font = { color: { argb: 'FF16A34A' }, italic: true, size: 10 };
      }

      fieldKeys.forEach((key, ki) => {
        const trimKey = `${idx}|${key}`;
        if (trimMap.has(trimKey)) {
          const td = trimMap.get(trimKey)!;
          const cell = excelRow.getCell(ki + 3);
          cell.note = `Whitespace trimmed:\nBefore: "${td.before}"\nAfter: "${td.after}"`;
          cell.font = { color: { argb: 'FF2563EB' }, italic: true };
        }
      });

      if (hasNameChange) {
        const nc = nameMap.get(idx)!;
        const dcCell = excelRow.getCell(fieldKeys.indexOf('dataCollector') + 3);
        dcCell.note = `Name standardized:\nOriginal: "${nc.oldName}"\nStandard: "${nc.newName}"`;
        dcCell.font = { color: { argb: 'FF9333EA' }, bold: true };
      }

      if (isDuplicate) {
        const groupNum = dupGroupMap.get(idx);
        const firstCell = excelRow.getCell(1);
        firstCell.note = `This row is part of duplicate group ${groupNum}.\nRows with identical key fields are highlighted.`;
      }
    });

    ws.columns = [
      { width: 8 }, { width: 35 }, { width: 18 }, { width: 16 }, { width: 18 },
      { width: 30 }, { width: 16 }, { width: 20 }, { width: 25 }, { width: 20 },
      { width: 20 }, { width: 14 }, { width: 14 }, { width: 20 },
    ];

    ws.autoFilter = { from: 'A1', to: `N${data.length + 1}` };

    const legendWs = wb.addWorksheet('Legend');
    const legendHeaders = legendWs.addRow(['Color', 'Meaning', 'Details']);
    legendHeaders.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    });
    const legends = [
      { color: 'FFFEE2E2', label: 'Red', meaning: 'Duplicate Row', details: 'Row has identical key fields to another row. Check Group number in Issue column.' },
      { color: 'FFFFF7ED', label: 'Orange', meaning: 'Empty Row', details: 'Row has no meaningful data in any key field.' },
      { color: 'FFEFF6FF', label: 'Blue', meaning: 'Trimmed Fields', details: 'One or more fields had extra whitespace removed. Hover cells for before/after details.' },
      { color: 'FFF5F3FF', label: 'Purple', meaning: 'Name Standardized', details: 'Data collector name was unified to the most common name for this device ID.' },
      { color: 'FFF0FDF4', label: 'Green', meaning: 'No Issues', details: 'Row passed all quality checks.' },
    ];
    legends.forEach(l => {
      const row = legendWs.addRow([l.label, l.meaning, l.details]);
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: l.color } };
      row.getCell(1).font = { bold: true };
    });
    legendWs.columns = [{ width: 12 }, { width: 25 }, { width: 80 }];

    const summaryWs = wb.addWorksheet('Summary');
    const rptSummary = computeSummaryFromData(data, data, fileName, cleanResults);
    const addSectionHeader = (text: string) => {
      const r = summaryWs.addRow([text, '']);
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      r.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
      r.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    };
    const addRow = (label: string, value: string | number) => summaryWs.addRow([label, value]);

    addSectionHeader('Report Information');
    addRow('Report Title', 'Data Quality & Coverage Report');
    addRow('Generated Date', format(new Date(), 'MMMM d, yyyy h:mm a'));
    addRow('File Name', fileName);
    addRow('Month Coverage', rptSummary?.monthCoverage || 'N/A');
    summaryWs.addRow([]);

    addSectionHeader('Data Quality Metrics');
    addRow('Total Rows', data.length);
    addRow('Duplicate Rows', cleanResults.duplicateGroups.reduce((sum, g) => sum + g.rows.length, 0));
    addRow('Duplicate Groups', cleanResults.duplicateGroups.length);
    addRow('Empty Rows', cleanResults.emptyRowsRemoved);
    addRow('Fields Trimmed', cleanResults.trimmedFields);
    addRow('Names Standardized', cleanResults.namesStandardized);
    const cleanRowCount = data.length - cleanResults.emptyRowsRemoved - cleanResults.duplicateGroups.reduce((sum, g) => sum + g.rows.length, 0);
    addRow('Clean Rows', cleanRowCount);
    addRow('Data Quality Score', data.length > 0 ? ((cleanRowCount / data.length) * 100).toFixed(1) + '%' : '100%');
    summaryWs.addRow([]);

    addSectionHeader('Coverage Totals');
    addRow('Total Questionnaires', rptSummary?.totalQuestionnaires || data.length);
    addRow('Unique Sites', rptSummary?.uniqueSites || 0);
    addRow('Hubs', rptSummary?.uniqueHubs || 0);
    addRow('States', rptSummary?.uniqueStates || 0);
    addRow('Localities', rptSummary?.uniqueLocalities || 0);
    addRow('Data Collectors', rptSummary?.totalCollectors || 0);
    addRow('Supervisors', rptSummary?.totalSupervisors || 0);

    if (rptSummary) {
      summaryWs.addRow([]);
      addSectionHeader('Team Roster');
      rptSummary.teamOverview.forEach(team => {
        const supRow = summaryWs.addRow([`Supervisor: ${team.supervisor}`, `${team.teamSize} DCs, ${team.totalQ} Q`]);
        supRow.getCell(1).font = { bold: true };
        team.collectors.forEach(dc => {
          addRow(`  ${dc.name}`, `Device: ${dc.deviceId} | ${dc.count} Q`);
        });
      });
      summaryWs.addRow([]);
      addSectionHeader('Hub Coverage');
      rptSummary.hubBreakdown.forEach(h => {
        addRow(h.hub, `${h.questionnaires} Q, ${h.sites} sites`);
      });
    }
    summaryWs.columns = [{ width: 35 }, { width: 40 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = fileName.replace(/\.[^.]+$/, '') || 'questionnaire_data';
    a.download = `${baseName}_review.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [cleanResults, data, fileName]);

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

  const buildSummaryWithSites = useCallback((items: QuestionnaireRow[], key: keyof QuestionnaireRow): SummaryWithSites[] => {
    const map = new Map<string, { questionnaires: number; sites: Set<string> }>();
    items.forEach(row => {
      const val = row[key] || '(Empty)';
      if (!map.has(val)) map.set(val, { questionnaires: 0, sites: new Set() });
      const entry = map.get(val)!;
      entry.questionnaires++;
      if (row.activitySite) entry.sites.add(row.activitySite);
    });
    const total = items.length;
    return [...map.entries()]
      .map(([name, { questionnaires, sites }]) => ({
        name,
        questionnaires,
        sites: sites.size,
        percentage: total > 0 ? (questionnaires / total) * 100 : 0,
      }))
      .sort((a, b) => b.questionnaires - a.questionnaires);
  }, []);

  const hubSummary = useMemo(() => buildSummaryWithSites(filteredData, 'hub'), [filteredData, buildSummaryWithSites]);
  const stateSummary = useMemo(() => buildSummaryWithSites(filteredData, 'state'), [filteredData, buildSummaryWithSites]);
  const localitySummary = useMemo(() => buildSummaryWithSites(filteredData, 'locality'), [filteredData, buildSummaryWithSites]);
  const siteSummary = useMemo(() => buildSummaryWithSites(filteredData, 'activitySite'), [filteredData, buildSummaryWithSites]);

  const hubDrilldown = useMemo(() => {
    const hubMap = new Map<string, {
      q: number; sites: Set<string>;
      states: Map<string, {
        q: number; sites: Set<string>;
        activities: Map<string, {
          q: number; sites: Set<string>;
          localities: Map<string, { q: number; sites: Set<string> }>;
        }>;
      }>;
    }>();

    filteredData.forEach(row => {
      const hub = row.hub || '(Empty)';
      const state = row.state || '(Empty)';
      const activity = row.activity || '(Empty)';
      const locality = row.locality || '(Empty)';

      if (!hubMap.has(hub)) hubMap.set(hub, { q: 0, sites: new Set(), states: new Map() });
      const hEntry = hubMap.get(hub)!;
      hEntry.q++;
      if (row.activitySite) hEntry.sites.add(row.activitySite);

      if (!hEntry.states.has(state)) hEntry.states.set(state, { q: 0, sites: new Set(), activities: new Map() });
      const sEntry = hEntry.states.get(state)!;
      sEntry.q++;
      if (row.activitySite) sEntry.sites.add(row.activitySite);

      if (!sEntry.activities.has(activity)) sEntry.activities.set(activity, { q: 0, sites: new Set(), localities: new Map() });
      const aEntry = sEntry.activities.get(activity)!;
      aEntry.q++;
      if (row.activitySite) aEntry.sites.add(row.activitySite);

      if (!aEntry.localities.has(locality)) aEntry.localities.set(locality, { q: 0, sites: new Set() });
      const lEntry = aEntry.localities.get(locality)!;
      lEntry.q++;
      if (row.activitySite) lEntry.sites.add(row.activitySite);
    });

    const totalQ = filteredData.length;
    return [...hubMap.entries()].map(([hub, hd]) => ({
      name: hub,
      questionnaires: hd.q,
      sites: hd.sites.size,
      percentage: totalQ > 0 ? (hd.q / totalQ) * 100 : 0,
      states: [...hd.states.entries()].map(([st, sd]) => ({
        name: st,
        questionnaires: sd.q,
        sites: sd.sites.size,
        percentage: hd.q > 0 ? (sd.q / hd.q) * 100 : 0,
        activities: [...sd.activities.entries()].map(([act, ad]) => ({
          name: act,
          questionnaires: ad.q,
          sites: ad.sites.size,
          percentage: sd.q > 0 ? (ad.q / sd.q) * 100 : 0,
          localities: [...ad.localities.entries()].map(([loc, ld]) => ({
            name: loc,
            questionnaires: ld.q,
            sites: ld.sites.size,
            siteNames: [...ld.sites].sort(),
            percentage: ad.q > 0 ? (ld.q / ad.q) * 100 : 0,
          })).sort((a, b) => b.questionnaires - a.questionnaires),
        })).sort((a, b) => b.questionnaires - a.questionnaires),
      })).sort((a, b) => b.questionnaires - a.questionnaires),
    })).sort((a, b) => b.questionnaires - a.questionnaires);
  }, [filteredData]);

  const activityBreakdown = useMemo((): ActivityBreakdown[] => {
    const actMap = new Map<string, QuestionnaireRow[]>();
    filteredData.forEach(row => {
      const act = row.activity || '(Empty)';
      if (!actMap.has(act)) actMap.set(act, []);
      actMap.get(act)!.push(row);
    });
    const totalQ = filteredData.length;
    return [...actMap.entries()]
      .map(([name, rows]) => {
        const siteSet = new Set(rows.map(r => r.activitySite).filter(Boolean));
        const siteMap = new Map<string, number>();
        rows.forEach(r => {
          const s = r.activitySite || '(Empty)';
          siteMap.set(s, (siteMap.get(s) || 0) + 1);
        });
        const siteList = [...siteMap.entries()]
          .map(([sn, sc]) => ({ name: sn, count: sc, percentage: rows.length > 0 ? (sc / rows.length) * 100 : 0 }))
          .sort((a, b) => b.count - a.count);

        const hubMap = new Map<string, { count: number; sites: Set<string> }>();
        const stateMap = new Map<string, { count: number; sites: Set<string> }>();
        const locMap = new Map<string, { count: number; sites: Set<string> }>();
        const collMap = new Map<string, { count: number; deviceId: string }>();

        rows.forEach(r => {
          const h = r.hub || '(Empty)';
          if (!hubMap.has(h)) hubMap.set(h, { count: 0, sites: new Set() });
          hubMap.get(h)!.count++;
          if (r.activitySite) hubMap.get(h)!.sites.add(r.activitySite);

          const st = r.state || '(Empty)';
          if (!stateMap.has(st)) stateMap.set(st, { count: 0, sites: new Set() });
          stateMap.get(st)!.count++;
          if (r.activitySite) stateMap.get(st)!.sites.add(r.activitySite);

          const lo = r.locality || '(Empty)';
          if (!locMap.has(lo)) locMap.set(lo, { count: 0, sites: new Set() });
          locMap.get(lo)!.count++;
          if (r.activitySite) locMap.get(lo)!.sites.add(r.activitySite);

          const dc = r.dataCollector || '(Empty)';
          if (!collMap.has(dc)) collMap.set(dc, { count: 0, deviceId: '' });
          collMap.get(dc)!.count++;
          if (!collMap.get(dc)!.deviceId && r.deviceId) collMap.get(dc)!.deviceId = r.deviceId;
        });

        return {
          name,
          siteCount: siteSet.size,
          questionnaireCount: rows.length,
          percentage: totalQ > 0 ? (rows.length / totalQ) * 100 : 0,
          siteList,
          byHub: [...hubMap.entries()].map(([n, d]) => ({ name: n, count: d.count, sites: d.sites.size })).sort((a, b) => b.count - a.count),
          byState: [...stateMap.entries()].map(([n, d]) => ({ name: n, count: d.count, sites: d.sites.size })).sort((a, b) => b.count - a.count),
          byLocality: [...locMap.entries()].map(([n, d]) => ({ name: n, count: d.count, sites: d.sites.size })).sort((a, b) => b.count - a.count),
          byCollector: [...collMap.entries()].map(([n, d]) => ({ name: n, count: d.count, deviceId: d.deviceId })).sort((a, b) => b.count - a.count),
        };
      })
      .sort((a, b) => b.siteCount - a.siteCount);
  }, [filteredData]);

  const collectorDetails = useMemo((): CollectorDetail[] => {
    const deviceMap = new Map<string, { names: Map<string, number>; activities: Map<string, number>; localities: Map<string, number>; hubs: Set<string>; states: Set<string>; count: number }>();
    const noDeviceMap = new Map<string, { activities: Map<string, number>; localities: Map<string, number>; hubs: Set<string>; states: Set<string>; count: number }>();

    filteredData.forEach(row => {
      const name = row.dataCollector || '(Empty)';
      const devId = row.deviceId?.trim() || '';

      if (devId) {
        if (!deviceMap.has(devId)) deviceMap.set(devId, { names: new Map(), activities: new Map(), localities: new Map(), hubs: new Set(), states: new Set(), count: 0 });
        const entry = deviceMap.get(devId)!;
        entry.count++;
        entry.names.set(name, (entry.names.get(name) || 0) + 1);
        if (row.activity) entry.activities.set(row.activity, (entry.activities.get(row.activity) || 0) + 1);
        if (row.locality) entry.localities.set(row.locality, (entry.localities.get(row.locality) || 0) + 1);
        if (row.hub) entry.hubs.add(row.hub);
        if (row.state) entry.states.add(row.state);
      } else {
        if (!noDeviceMap.has(name)) noDeviceMap.set(name, { activities: new Map(), localities: new Map(), hubs: new Set(), states: new Set(), count: 0 });
        const entry = noDeviceMap.get(name)!;
        entry.count++;
        if (row.activity) entry.activities.set(row.activity, (entry.activities.get(row.activity) || 0) + 1);
        if (row.locality) entry.localities.set(row.locality, (entry.localities.get(row.locality) || 0) + 1);
        if (row.hub) entry.hubs.add(row.hub);
        if (row.state) entry.states.add(row.state);
      }
    });

    const total = filteredData.length;
    const results: CollectorDetail[] = [];

    deviceMap.forEach((d, devId) => {
      const nameVariants = [...d.names.entries()].map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count);
      const primaryName = nameVariants[0]?.name || '(Empty)';
      results.push({
        name: primaryName,
        deviceId: devId,
        count: d.count,
        percentage: total > 0 ? (d.count / total) * 100 : 0,
        activities: [...d.activities.entries()].map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count),
        localities: [...d.localities.entries()].map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count),
        hubs: [...d.hubs],
        states: [...d.states],
        nameVariants: nameVariants.length > 1 ? nameVariants : [],
      });
    });

    noDeviceMap.forEach((d, name) => {
      results.push({
        name,
        deviceId: '',
        count: d.count,
        percentage: total > 0 ? (d.count / total) * 100 : 0,
        activities: [...d.activities.entries()].map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count),
        localities: [...d.localities.entries()].map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count),
        hubs: [...d.hubs],
        states: [...d.states],
        nameVariants: [],
      });
    });

    return results.sort((a, b) => b.count - a.count);
  }, [filteredData]);

  const toggleExpand = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const trackerData = useMemo(() => {
    const hubs = [...new Set(filteredData.map(r => r.hub))].filter(Boolean).sort();
    const activities = [...new Set(filteredData.map(r => r.activity))].filter(Boolean).sort();
    const states = [...new Set(filteredData.map(r => r.state))].filter(Boolean).sort();

    const siteSetMatrix: Record<string, Record<string, Set<string>>> = {};
    const qMatrix: Record<string, Record<string, number>> = {};
    const collMatrix: Record<string, Record<string, Set<string>>> = {};
    const stateActMatrix: Record<string, Record<string, { q: number; sites: Set<string> }>> = {};

    filteredData.forEach(row => {
      if (!row.activity || !row.hub) return;
      if (!siteSetMatrix[row.activity]) siteSetMatrix[row.activity] = {};
      if (!siteSetMatrix[row.activity][row.hub]) siteSetMatrix[row.activity][row.hub] = new Set();
      if (!qMatrix[row.activity]) qMatrix[row.activity] = {};
      if (!qMatrix[row.activity][row.hub]) qMatrix[row.activity][row.hub] = 0;
      if (!collMatrix[row.activity]) collMatrix[row.activity] = {};
      if (!collMatrix[row.activity][row.hub]) collMatrix[row.activity][row.hub] = new Set();

      qMatrix[row.activity][row.hub]++;
      if (row.activitySite) siteSetMatrix[row.activity][row.hub].add(row.activitySite);
      if (row.dataCollector) collMatrix[row.activity][row.hub].add(row.dataCollector);

      if (row.state) {
        if (!stateActMatrix[row.state]) stateActMatrix[row.state] = {};
        if (!stateActMatrix[row.state][row.activity]) stateActMatrix[row.state][row.activity] = { q: 0, sites: new Set() };
        stateActMatrix[row.state][row.activity].q++;
        if (row.activitySite) stateActMatrix[row.state][row.activity].sites.add(row.activitySite);
      }
    });

    const hubStateActMatrix: Record<string, Record<string, Record<string, { q: number; sites: Set<string>; collectors: Set<string> }>>> = {};
    const stateLocalActMatrix: Record<string, Record<string, Record<string, { q: number; sites: Set<string>; collectors: Set<string> }>>> = {};
    filteredData.forEach(row => {
      if (!row.activity || !row.hub || !row.state) return;
      if (!hubStateActMatrix[row.hub]) hubStateActMatrix[row.hub] = {};
      if (!hubStateActMatrix[row.hub][row.activity]) hubStateActMatrix[row.hub][row.activity] = {};
      if (!hubStateActMatrix[row.hub][row.activity][row.state]) hubStateActMatrix[row.hub][row.activity][row.state] = { q: 0, sites: new Set(), collectors: new Set() };
      hubStateActMatrix[row.hub][row.activity][row.state].q++;
      if (row.activitySite) hubStateActMatrix[row.hub][row.activity][row.state].sites.add(row.activitySite);
      if (row.dataCollector) hubStateActMatrix[row.hub][row.activity][row.state].collectors.add(row.dataCollector);

      if (!row.locality) return;
      if (!stateLocalActMatrix[row.state]) stateLocalActMatrix[row.state] = {};
      if (!stateLocalActMatrix[row.state][row.activity]) stateLocalActMatrix[row.state][row.activity] = {};
      if (!stateLocalActMatrix[row.state][row.activity][row.locality]) stateLocalActMatrix[row.state][row.activity][row.locality] = { q: 0, sites: new Set(), collectors: new Set() };
      stateLocalActMatrix[row.state][row.activity][row.locality].q++;
      if (row.activitySite) stateLocalActMatrix[row.state][row.activity][row.locality].sites.add(row.activitySite);
      if (row.dataCollector) stateLocalActMatrix[row.state][row.activity][row.locality].collectors.add(row.dataCollector);
    });

    const hubTrackers = hubs.map(hub => {
      const hubStates = [...new Set(filteredData.filter(r => r.hub === hub).map(r => r.state))].filter(Boolean).sort();
      const hubActivities = [...new Set(filteredData.filter(r => r.hub === hub).map(r => r.activity))].filter(Boolean).sort();
      const mRows = hubActivities.map(act => {
        const cells = hubStates.map(st => ({
          questionnaires: hubStateActMatrix[hub]?.[act]?.[st]?.q || 0,
          sites: hubStateActMatrix[hub]?.[act]?.[st]?.sites?.size || 0,
          collectors: hubStateActMatrix[hub]?.[act]?.[st]?.collectors?.size || 0,
        }));
        const totalQ = cells.reduce((a, c) => a + c.questionnaires, 0);
        const allSites = new Set<string>();
        const allColl = new Set<string>();
        hubStates.forEach(st => {
          (hubStateActMatrix[hub]?.[act]?.[st]?.sites || new Set<string>()).forEach(s => allSites.add(s));
          (hubStateActMatrix[hub]?.[act]?.[st]?.collectors || new Set<string>()).forEach(c => allColl.add(c));
        });
        return { activity: act, cells, totalQ, totalSites: allSites.size, totalCollectors: allColl.size };
      });
      const colTotals = hubStates.map((st, si) => ({
        questionnaires: mRows.reduce((a, r) => a + r.cells[si].questionnaires, 0),
        sites: new Set(filteredData.filter(r => r.hub === hub && r.state === st && r.activitySite).map(r => r.activitySite)).size,
        collectors: new Set(filteredData.filter(r => r.hub === hub && r.state === st && r.dataCollector).map(r => r.dataCollector)).size,
      }));
      const gQ = mRows.reduce((a, r) => a + r.totalQ, 0);
      const gS = new Set(filteredData.filter(r => r.hub === hub && r.activitySite).map(r => r.activitySite)).size;
      const gC = new Set(filteredData.filter(r => r.hub === hub && r.dataCollector).map(r => r.dataCollector)).size;
      return { hub, states: hubStates, activities: hubActivities, matrix: mRows, colTotals, grandQ: gQ, grandSites: gS, grandCollectors: gC };
    }).filter(h => h.grandQ > 0);

    const stateTrackers = states.map(state => {
      const stLocalities = [...new Set(filteredData.filter(r => r.state === state).map(r => r.locality))].filter(Boolean).sort();
      const stActivities = [...new Set(filteredData.filter(r => r.state === state).map(r => r.activity))].filter(Boolean).sort();
      const mRows = stActivities.map(act => {
        const cells = stLocalities.map(loc => ({
          questionnaires: stateLocalActMatrix[state]?.[act]?.[loc]?.q || 0,
          sites: stateLocalActMatrix[state]?.[act]?.[loc]?.sites?.size || 0,
          collectors: stateLocalActMatrix[state]?.[act]?.[loc]?.collectors?.size || 0,
        }));
        const totalQ = cells.reduce((a, c) => a + c.questionnaires, 0);
        const allSites = new Set<string>();
        const allColl = new Set<string>();
        stLocalities.forEach(loc => {
          (stateLocalActMatrix[state]?.[act]?.[loc]?.sites || new Set<string>()).forEach(s => allSites.add(s));
          (stateLocalActMatrix[state]?.[act]?.[loc]?.collectors || new Set<string>()).forEach(c => allColl.add(c));
        });
        return { activity: act, cells, totalQ, totalSites: allSites.size, totalCollectors: allColl.size };
      });
      const colTotals = stLocalities.map((loc, li) => ({
        questionnaires: mRows.reduce((a, r) => a + r.cells[li].questionnaires, 0),
        sites: new Set(filteredData.filter(r => r.state === state && r.locality === loc && r.activitySite).map(r => r.activitySite)).size,
        collectors: new Set(filteredData.filter(r => r.state === state && r.locality === loc && r.dataCollector).map(r => r.dataCollector)).size,
      }));
      const gQ = mRows.reduce((a, r) => a + r.totalQ, 0);
      const gS = new Set(filteredData.filter(r => r.state === state && r.activitySite).map(r => r.activitySite)).size;
      const gC = new Set(filteredData.filter(r => r.state === state && r.dataCollector).map(r => r.dataCollector)).size;
      return { state, localities: stLocalities, activities: stActivities, matrix: mRows, colTotals, grandQ: gQ, grandSites: gS, grandCollectors: gC };
    }).filter(s => s.grandQ > 0);

    const matrix = activities.map(act => {
      const cells = hubs.map(hub => ({
        questionnaires: qMatrix[act]?.[hub] || 0,
        sites: siteSetMatrix[act]?.[hub]?.size || 0,
        collectors: collMatrix[act]?.[hub]?.size || 0,
      }));
      const totalQ = cells.reduce((a, c) => a + c.questionnaires, 0);
      const totalSites = new Set<string>();
      hubs.forEach(hub => {
        (siteSetMatrix[act]?.[hub] || new Set()).forEach(s => totalSites.add(s));
      });
      const totalColl = new Set<string>();
      hubs.forEach(hub => {
        (collMatrix[act]?.[hub] || new Set()).forEach(c => totalColl.add(c));
      });
      return { activity: act, cells, totalQ, totalSites: totalSites.size, totalCollectors: totalColl.size };
    });

    const hubTotals = hubs.map((hub, hi) => {
      const q = matrix.reduce((a, r) => a + r.cells[hi].questionnaires, 0);
      const siteSet = new Set<string>();
      activities.forEach(act => {
        (siteSetMatrix[act]?.[hub] || new Set()).forEach(s => siteSet.add(s));
      });
      const collSet = new Set<string>();
      activities.forEach(act => {
        (collMatrix[act]?.[hub] || new Set()).forEach(c => collSet.add(c));
      });
      return { questionnaires: q, sites: siteSet.size, collectors: collSet.size };
    });

    const grandQ = matrix.reduce((a, r) => a + r.totalQ, 0);
    const grandSites = new Set<string>();
    const grandColl = new Set<string>();
    activities.forEach(act => {
      hubs.forEach(hub => {
        (siteSetMatrix[act]?.[hub] || new Set()).forEach(s => grandSites.add(s));
        (collMatrix[act]?.[hub] || new Set()).forEach(c => grandColl.add(c));
      });
    });

    const stateBreakdown = states.map(state => {
      const actData = activities.map(act => ({
        activity: act,
        questionnaires: stateActMatrix[state]?.[act]?.q || 0,
        sites: stateActMatrix[state]?.[act]?.sites?.size || 0,
      }));
      return { state, activities: actData, totalQ: actData.reduce((a, d) => a + d.questionnaires, 0) };
    }).filter(s => s.totalQ > 0);

    return { hubs, activities, matrix, hubTotals, grandQ, grandSites: grandSites.size, grandCollectors: grandColl.size, stateBreakdown, hubTrackers, stateTrackers };
  }, [filteredData]);

  const computeReportSummary = useMemo(() => {
    if (filteredData.length === 0) return null;
    return computeSummaryFromData(filteredData, data, fileName, cleanResults);
  }, [filteredData, data, cleanResults, fileName]);

  const openEmailDialog = useCallback(async () => {
    const month = computeReportSummary?.monthCoverage || format(new Date(), 'MMMM yyyy');
    setEmailSubject(`Questionnaire Data Report - ${month}`);
    setShowEmailDialog(true);
    try {
      const { data: profiles } = await supabase.from('profiles').select('id, name, email, role').eq('status', 'approved');
      if (profiles) setEmailUsers(profiles as any);
    } catch (e) {
      console.error('Failed to fetch profiles:', e);
    }
  }, [computeReportSummary]);

  const getEmailCcList = useMemo(() => {
    if (emailCcRoles.length === 0) return [];
    return emailUsers.filter(u => emailCcRoles.includes(u.role));
  }, [emailCcRoles, emailUsers]);

  const getEmailBody = useMemo(() => {
    const s = computeReportSummary;
    if (!s) return '';
    const qScore = s.qualityReport ? `Data Quality Score: ${s.qualityReport.qualityScore}%` : '';
    const en = [
      `Questionnaire Data Report - ${s.monthCoverage}`,
      '',
      `Total Questionnaires: ${s.totalQuestionnaires}`,
      `Unique Sites: ${s.uniqueSites}`,
      `Hubs: ${s.uniqueHubs} | States: ${s.uniqueStates} | Localities: ${s.uniqueLocalities}`,
      `Data Collectors: ${s.totalCollectors} | Supervisors: ${s.totalSupervisors}`,
      qScore,
      '',
      'Hub Coverage:',
      ...s.hubBreakdown.map(h => `  ${h.hub}: ${h.questionnaires} questionnaires, ${h.sites} sites`),
    ].filter(Boolean).join('\n');

    const ar = [
      `تقرير بيانات الاستبيانات - ${s.monthCoverage}`,
      '',
      `إجمالي الاستبيانات: ${s.totalQuestionnaires}`,
      `المواقع الفريدة: ${s.uniqueSites}`,
      `المحاور: ${s.uniqueHubs} | الولايات: ${s.uniqueStates} | المحليات: ${s.uniqueLocalities}`,
      `جامعي البيانات: ${s.totalCollectors} | المشرفين: ${s.totalSupervisors}`,
      s.qualityReport ? `درجة جودة البيانات: ${s.qualityReport.qualityScore}%` : '',
    ].filter(Boolean).join('\n');

    return `${en}\n\n---\n\n${ar}`;
  }, [computeReportSummary]);

  const generateExcelBase64 = useCallback(async (type: 'cleaned' | 'review'): Promise<string | null> => {
    if (!cleanResults) return null;
    try {
      if (type === 'cleaned') {
        const finalData = getCustomCleanedData();
        const rows = finalData.map(r => ({
          Hub: r.hub, State: r.state, Locality: r.locality, 'Activity Site': r.activitySite,
          Activity: r.activity, 'Sub Activity': r.subActivity, 'Data Collector': r.dataCollector,
          'Device ID': r.deviceId, Supervisor: r.supervisor, Date: r.date, 'Site ID': r.siteId, Partner: r.partner,
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Cleaned Data');
        const buf = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        return buf;
      } else {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Summary');
        const headerRow = ws.addRow(['Metric', 'Value']);
        headerRow.eachCell(c => { c.font = { bold: true }; });
        ws.addRow(['Total Rows', data.length]);
        ws.addRow(['Duplicates Removed', cleanResults.duplicatesRemoved]);
        ws.addRow(['Empty Rows Removed', cleanResults.emptyRowsRemoved]);
        ws.addRow(['Clean Rows', cleanResults.cleanedCount]);
        ws.columns = [{ width: 25 }, { width: 15 }];
        const buf = await wb.xlsx.writeBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
        return base64;
      }
    } catch { return null; }
  }, [cleanResults, data, getCustomCleanedData]);

  const sendEmailReport = useCallback(async () => {
    if (!emailTo.trim()) {
      toast({ title: 'Error', description: 'Please enter a recipient email', variant: 'destructive' });
      return;
    }
    setEmailSending(true);
    try {
      const ccEmails = getEmailCcList.map(u => u.email).filter(Boolean);
      const s = computeReportSummary;
      const arBody = s ? `تقرير بيانات الاستبيانات - ${s.monthCoverage}\nإجمالي الاستبيانات: ${s.totalQuestionnaires}\nالمواقع الفريدة: ${s.uniqueSites}` : '';
      const attachments: { filename: string; content: string; type: string }[] = [];
      const baseName = fileName.replace(/\.[^.]+$/, '') || 'report';
      if (emailAttachCleaned && cleanResults) {
        const b64 = await generateExcelBase64('cleaned');
        if (b64) attachments.push({ filename: `${baseName}_cleaned.xlsx`, content: b64, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }
      if (emailAttachReview && cleanResults) {
        const b64 = await generateExcelBase64('review');
        if (b64) attachments.push({ filename: `${baseName}_review.xlsx`, content: b64, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }
      await EmailNotificationService.sendNotification(
        emailTo.trim(),
        'Recipient',
        {
          title: emailSubject,
          message: getEmailBody,
          titleAr: s ? `تقرير بيانات الاستبيانات - ${s.monthCoverage}` : emailSubject,
          messageAr: arBody,
          type: 'info',
          cc: ccEmails.length > 0 ? ccEmails : undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        }
      );
      toast({ title: 'Email Sent', description: 'Report email sent successfully' });
      setShowEmailDialog(false);
      setEmailTo('');
      setEmailCcRoles([]);
    } catch (e: any) {
      toast({ title: 'Email Failed', description: e.message || 'Failed to send email', variant: 'destructive' });
    } finally {
      setEmailSending(false);
    }
  }, [emailTo, emailSubject, getEmailBody, getEmailCcList, toast, emailAttachCleaned, emailAttachReview, cleanResults, fileName, generateExcelBase64, computeReportSummary]);

  const exportToExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();

    const hubData = hubSummary.map((h, i) => ({ '#': i + 1, Hub: h.name, Sites: h.sites, Questionnaires: h.questionnaires, '%': h.percentage.toFixed(1) + '%' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hubData), 'By Hub');

    const stateData = stateSummary.map((s, i) => ({ '#': i + 1, State: s.name, Sites: s.sites, Questionnaires: s.questionnaires, '%': s.percentage.toFixed(1) + '%' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stateData), 'By State');

    const localityData = localitySummary.map((l, i) => ({ '#': i + 1, Locality: l.name, Sites: l.sites, Questionnaires: l.questionnaires, '%': l.percentage.toFixed(1) + '%' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(localityData), 'By Locality');

    const siteData = siteSummary.map((s, i) => ({ '#': i + 1, 'Site Name': s.name, Questionnaires: s.questionnaires, '%': s.percentage.toFixed(1) + '%' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(siteData), 'By Site');

    const actRows: any[] = [];
    activityBreakdown.forEach(a => {
      actRows.push({ Activity: a.name, Level: 'Activity', Detail: '', Sites: a.siteCount, Questionnaires: a.questionnaireCount, '%': a.percentage.toFixed(1) + '%' });
      a.byHub.forEach(h => actRows.push({ Activity: a.name, Level: 'Hub', Detail: h.name, Sites: h.sites, Questionnaires: h.count, '%': '' }));
      a.byState.forEach(s => actRows.push({ Activity: a.name, Level: 'State', Detail: s.name, Sites: s.sites, Questionnaires: s.count, '%': '' }));
      a.byLocality.forEach(l => actRows.push({ Activity: a.name, Level: 'Locality', Detail: l.name, Sites: l.sites, Questionnaires: l.count, '%': '' }));
      a.byCollector.forEach(c => actRows.push({ Activity: a.name, Level: 'Collector', Detail: c.name, Sites: '', Questionnaires: c.count, '%': '' }));
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(actRows), 'By Activity');

    const collRows = collectorDetails.map((c, i) => ({
      '#': i + 1,
      'Device ID': c.deviceId || '-',
      'Data Collector': c.name,
      'Name Variants': c.nameVariants.length > 0 ? c.nameVariants.map(v => `${v.name} (${v.count})`).join(', ') : '',
      Hub: c.hubs.join(', '),
      State: c.states.join(', '),
      'Total Activities': c.activities.reduce((s, a) => s + a.count, 0),
      Activities: c.activities.map(a => `${a.name} (${a.count})`).join(', '),
      Localities: c.localities.map(l => `${l.name} (${l.count})`).join(', '),
      Questionnaires: c.count,
      '%': c.percentage.toFixed(1) + '%',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(collRows), 'By Collector');

    const usedSheetNames = new Set<string>();
    collectorDetails.forEach((c, ci) => {
      const detailRows: any[] = [];
      detailRows.push({ Section: 'COLLECTOR INFO', Field: 'Name (Primary)', Value: c.name });
      detailRows.push({ Section: '', Field: 'Device ID', Value: c.deviceId || '-' });
      if (c.nameVariants.length > 0) {
        detailRows.push({ Section: '', Field: 'Name Variants', Value: '' });
        c.nameVariants.forEach(v => detailRows.push({ Section: '', Field: `  ${v.name}`, Value: v.count }));
      }
      detailRows.push({ Section: '', Field: 'Hub(s)', Value: c.hubs.join(', ') });
      detailRows.push({ Section: '', Field: 'State(s)', Value: c.states.join(', ') });
      detailRows.push({ Section: '', Field: 'Total Questionnaires', Value: c.count });
      detailRows.push({ Section: '', Field: 'Percentage', Value: c.percentage.toFixed(1) + '%' });
      detailRows.push({ Section: '' });
      detailRows.push({ Section: 'ACTIVITIES', Field: 'Activity', Value: 'Count' });
      c.activities.forEach(a => detailRows.push({ Section: '', Field: a.name, Value: a.count }));
      detailRows.push({ Section: '', Field: 'Total', Value: c.activities.reduce((s, a) => s + a.count, 0) });
      detailRows.push({ Section: '' });
      detailRows.push({ Section: 'LOCALITIES', Field: 'Locality', Value: 'Count' });
      c.localities.forEach(l => detailRows.push({ Section: '', Field: l.name, Value: l.count }));
      let sheetName = `DC-${c.name}`.replace(/[\\/*?[\]:]/g, '').slice(0, 28);
      if (usedSheetNames.has(sheetName)) sheetName = `${sheetName.slice(0, 25)}-${ci + 1}`;
      usedSheetNames.add(sheetName);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), sheetName.slice(0, 31));
    });

    const { hubs, activities, matrix, hubTotals, grandQ, grandSites, grandCollectors, hubTrackers, stateTrackers } = trackerData;
    const trackerRows: any[] = [];
    matrix.forEach(row => {
      const r: any = { Activity: row.activity };
      hubs.forEach((hub, hi) => {
        r[`${hub} Sites`] = row.cells[hi].sites;
        r[`${hub} Actual`] = row.cells[hi].questionnaires;
        r[`${hub} PDM Sites`] = isPdmActivity(row.activity) ? Math.ceil(row.cells[hi].questionnaires / 7) : 0;
        r[`${hub} Collectors`] = row.cells[hi].collectors;
      });
      r['Total Sites'] = row.totalSites;
      r['Total Actual'] = row.totalQ;
      r['Total PDM Sites'] = isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : 0;
      r['Total Collectors'] = row.totalCollectors;
      trackerRows.push(r);
    });
    const totalRow: any = { Activity: 'Grand Total' };
    hubs.forEach((hub, hi) => {
      totalRow[`${hub} Sites`] = hubTotals[hi].sites;
      totalRow[`${hub} Actual`] = hubTotals[hi].questionnaires;
      const pdmSitesCol = matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? (r.cells[hi].questionnaires ? Math.ceil(r.cells[hi].questionnaires / 7) : 0) : r.cells[hi].questionnaires), 0);
      totalRow[`${hub} PDM Sites`] = pdmSitesCol || 0;
      totalRow[`${hub} Collectors`] = hubTotals[hi].collectors;
    });
    totalRow['Total Sites'] = grandSites;
    totalRow['Total Actual'] = grandQ;
    const pdmSitesGrand = matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
    totalRow['Total PDM Sites'] = pdmSitesGrand || 0;
    totalRow['Total Collectors'] = grandCollectors;
    trackerRows.push(totalRow);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trackerRows), 'Tracker');

    hubTrackers.forEach(ht => {
      const htRows: any[] = [];
      ht.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        ht.states.forEach((st, si) => {
          r[`${st} Sites`] = row.cells[si].sites;
          r[`${st} Actual`] = row.cells[si].questionnaires;
          r[`${st} PDM Sites`] = isPdmActivity(row.activity) ? Math.ceil(row.cells[si].questionnaires / 7) : 0;
          r[`${st} DC`] = row.cells[si].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : 0; r['Total DC'] = row.totalCollectors;
        htRows.push(r);
      });
      const htTotal: any = { Activity: 'Total' };
      ht.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = ht.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? (r.cells[ci].questionnaires ? Math.ceil(r.cells[ci].questionnaires / 7) : 0) : r.cells[ci].questionnaires), 0);
        htTotal[`${ht.states[ci]} Sites`] = ct.sites; htTotal[`${ht.states[ci]} Actual`] = ct.questionnaires; htTotal[`${ht.states[ci]} PDM Sites`] = pdmSitesCol || 0; htTotal[`${ht.states[ci]} DC`] = ct.collectors;
      });
      const htPdmSitesGrand = ht.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
      htTotal['Total Sites'] = ht.grandSites; htTotal['Total Actual'] = ht.grandQ; htTotal['Total PDM Sites'] = htPdmSitesGrand || 0; htTotal['Total DC'] = ht.grandCollectors;
      htRows.push(htTotal);
      const sheetName = `Hub-${ht.hub}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(htRows), sheetName);
    });

    stateTrackers.forEach(st => {
      const stRows: any[] = [];
      st.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        st.localities.forEach((loc, li) => {
          r[`${loc} Sites`] = row.cells[li].sites;
          r[`${loc} Actual`] = row.cells[li].questionnaires;
          r[`${loc} PDM Sites`] = isPdmActivity(row.activity) ? Math.ceil(row.cells[li].questionnaires / 7) : 0;
          r[`${loc} DC`] = row.cells[li].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : 0; r['Total DC'] = row.totalCollectors;
        stRows.push(r);
      });
      const stTotal: any = { Activity: 'Total' };
      st.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = st.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? (r.cells[ci].questionnaires ? Math.ceil(r.cells[ci].questionnaires / 7) : 0) : r.cells[ci].questionnaires), 0);
        stTotal[`${st.localities[ci]} Sites`] = ct.sites; stTotal[`${st.localities[ci]} Actual`] = ct.questionnaires; stTotal[`${st.localities[ci]} PDM Sites`] = pdmSitesCol || 0; stTotal[`${st.localities[ci]} DC`] = ct.collectors;
      });
      const stPdmSitesGrand = st.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
      stTotal['Total Sites'] = st.grandSites; stTotal['Total Actual'] = st.grandQ; stTotal['Total PDM Sites'] = stPdmSitesGrand || 0; stTotal['Total DC'] = st.grandCollectors;
      stRows.push(stTotal);
      const sheetName = `State-${st.state}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stRows), sheetName);
    });

    XLSX.writeFile(wb, 'questionnaire_analytics.xlsx');
  }, [hubSummary, stateSummary, localitySummary, siteSummary, activityBreakdown, collectorDetails, trackerData]);

  const exportToPdf = useCallback(async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Questionnaire Analytics Report', 'تقرير تحليل الاستبيانات',
      `Total: ${filteredData.length} Questionnaires  |  ${new Set(filteredData.map(r => r.activitySite).filter(Boolean)).size} Sites`);
    const hasArabic = await loadArabicFont(doc);

    const totalQ = filteredData.length;
    const totalSites = new Set(filteredData.map(r => r.activitySite).filter(Boolean)).size;

    const hubRows = hubSummary.map((h, i) => [String(i + 1), h.name, String(h.sites), String(h.questionnaires), h.percentage.toFixed(1) + '%']);
    hubRows.push(['', 'Total', String(totalSites), String(totalQ), '100%']);
    y = styledAutoTable(doc, [['#', 'Hub', 'Sites', 'Questionnaires', '%']], hubRows, y - 2, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
    y += 4;

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'By State'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('By State', 14, y); y += 3;
    const stateRows = stateSummary.map((s, i) => [String(i + 1), s.name, String(s.sites), String(s.questionnaires), s.percentage.toFixed(1) + '%']);
    stateRows.push(['', 'Total', String(totalSites), String(totalQ), '100%']);
    y = styledAutoTable(doc, [['#', 'State', 'Sites', 'Questionnaires', '%']], stateRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
    y += 4;

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'By Locality'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('By Locality', 14, y); y += 3;
    const locRows = localitySummary.map((l, i) => [String(i + 1), l.name, String(l.sites), String(l.questionnaires), l.percentage.toFixed(1) + '%']);
    locRows.push(['', 'Total', String(totalSites), String(totalQ), '100%']);
    y = styledAutoTable(doc, [['#', 'Locality', 'Sites', 'Questionnaires', '%']], locRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
    y += 4;

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'By Activity'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('By Activity', 14, y); y += 3;
    const pdmSitesTotal = activityBreakdown.reduce((s, a) => s + (isPdmActivity(a.name) ? Math.ceil(a.questionnaireCount / 7) : 0), 0);
    const actRows = activityBreakdown.map(a => [a.name, String(a.siteCount), String(a.questionnaireCount), isPdmActivity(a.name) ? String(Math.ceil(a.questionnaireCount / 7)) : '-', a.percentage.toFixed(1) + '%']);
    actRows.push(['Total', String(totalSites), String(totalQ), pdmSitesTotal > 0 ? String(pdmSitesTotal) : '-', '100%']);
    y = styledAutoTable(doc, [['Activity', 'Sites', 'Questionnaires', 'PDM Sites', '%']], actRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } }, useArabicFont: hasArabic });
    y += 4;

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'By Data Collector'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('By Data Collector', 14, y); y += 3;
    const dcRows = collectorDetails.map((c, i) => [String(i + 1), c.deviceId || '-', c.name, c.hubs.join(', '), c.states.join(', '), c.activities.map((a: any) => a.name).join(', '), String(c.count), c.percentage.toFixed(1) + '%']);
    dcRows.push(['', '', 'Total', '', '', '', String(totalQ), '100%']);
    y = styledAutoTable(doc, [['#', 'Device ID', 'Collector', 'Hub', 'State', 'Activities', 'Q', '%']], dcRows, y, { fontSize: 7, boldLastRow: true, useArabicFont: hasArabic });
    y += 4;

    collectorDetails.forEach(c => {
      doc.addPage();
      addPageHeader(doc, 'Data Collector Report');
      y = 18;
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Collector:', 14, y);
      if (hasArabic) { doc.setFont('Amiri', 'normal'); }
      doc.text(c.name, 42, y);
      doc.setFont('helvetica', 'normal');
      y += 5;
      doc.setFontSize(9); doc.setTextColor(90, 95, 110);
      doc.text(`Device ID: ${c.deviceId || '-'}  |  Hub: ${c.hubs.join(', ')}  |  State: ${c.states.join(', ')}  |  ${c.count} Q (${c.percentage.toFixed(1)}%)`, 14, y);
      y += 6;
      if (c.nameVariants.length > 0) {
        doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
        doc.text(`Name Variants (${c.nameVariants.length + 1})`, 14, y); y += 3;
        const vRows = c.nameVariants.map((v: any, i: number) => [String(i + 1), v.name, String(v.count)]);
        vRows.unshift(['Primary', c.name, String(c.count - c.nameVariants.reduce((s: number, v: any) => s + v.count, 0))]);
        y = styledAutoTable(doc, [['#', 'Name', 'Count']], vRows, y, { fontSize: 8, useArabicFont: hasArabic });
        y += 4;
      }
      doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Activities', 14, y); y += 3;
      const caRows = c.activities.map((a: any, i: number) => [String(i + 1), a.name, String(a.count)]);
      caRows.push(['', 'Total', String(c.count)]);
      y = styledAutoTable(doc, [['#', 'Activity', 'Count']], caRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
      y += 4;
      if (y > 240) { doc.addPage(); addPageHeader(doc, 'Data Collector Report'); y = 18; }
      doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Localities', 14, y); y += 3;
      const clRows = c.localities.map((l: any, i: number) => [String(i + 1), l.name, String(l.count)]);
      clRows.push(['', 'Total', String(c.count)]);
      y = styledAutoTable(doc, [['#', 'Locality', 'Count']], clRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
    });

    const { hubs: tHubs, matrix: tMatrix, hubTotals: tHubTotals, grandQ: tGrandQ, grandSites: tGrandSites, grandCollectors: tGrandCollectors, hubTrackers: tHubTrackers, stateTrackers: tStateTrackers } = trackerData;

    if (tHubs.length > 0 && tMatrix.length > 0) {
      doc.addPage(); addPageHeader(doc, 'Tracker - Activity by Hub'); y = 18;
      doc.setFontSize(13); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Tracker — Activity by Hub', 14, y); y += 6;

      tHubs.forEach((hub: string, hi: number) => {
        if (y > 220) { doc.addPage(); addPageHeader(doc, 'Activity by Hub'); y = 18; }
        doc.setFontSize(11); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
        doc.text(hub, 14, y); y += 3;
        const aRows = tMatrix.filter(row => row.cells[hi].questionnaires > 0 || row.cells[hi].sites > 0).map(row => [
          row.activity, String(row.cells[hi].sites || '-'), String(row.cells[hi].questionnaires || '-'),
          isPdmActivity(row.activity) && row.cells[hi].questionnaires ? String(Math.ceil(row.cells[hi].questionnaires / 7)) : '-',
          String(row.cells[hi].collectors || '-'),
        ]);
        const hubPdm = tMatrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? (r.cells[hi].questionnaires ? Math.ceil(r.cells[hi].questionnaires / 7) : 0) : 0), 0);
        aRows.push(['Total', String(tHubTotals[hi].sites), String(tHubTotals[hi].questionnaires), hubPdm ? String(hubPdm) : '-', String(tHubTotals[hi].collectors)]);
        y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], aRows, y, { fontSize: 8, boldLastRow: true, columnStyles: { 0: { cellWidth: 55 } }, useArabicFont: hasArabic });
        y += 6;
      });
    }

    tHubTrackers.forEach(ht => {
      doc.addPage(); addPageHeader(doc, `Hub: ${ht.hub}`); y = 18;
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text(`${ht.hub} — by State`, 14, y); y += 5;
      ht.states.forEach((st: string, si: number) => {
        if (y > 240) { doc.addPage(); addPageHeader(doc, `Hub: ${ht.hub}`); y = 18; }
        doc.setFontSize(10); doc.setTextColor(41, 98, 255); doc.setFont('helvetica', 'bold');
        doc.text(`State: ${st}`, 18, y); y += 3;
        const sRows = ht.matrix.filter(row => row.cells[si].questionnaires > 0 || row.cells[si].sites > 0).map(row => [
          row.activity, String(row.cells[si].sites || '-'), String(row.cells[si].questionnaires || '-'),
          isPdmActivity(row.activity) && row.cells[si].questionnaires ? String(Math.ceil(row.cells[si].questionnaires / 7)) : '-',
          String(row.cells[si].collectors || '-'),
        ]);
        const colPdm = ht.matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? (r.cells[si].questionnaires ? Math.ceil(r.cells[si].questionnaires / 7) : 0) : 0), 0);
        sRows.push(['Total', String(ht.colTotals[si].sites), String(ht.colTotals[si].questionnaires), colPdm ? String(colPdm) : '-', String(ht.colTotals[si].collectors)]);
        y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], sRows, y, { fontSize: 8, boldLastRow: true, columnStyles: { 0: { cellWidth: 55 } }, useArabicFont: hasArabic });
        y += 5;
      });
    });

    tStateTrackers.forEach(st => {
      doc.addPage(); addPageHeader(doc, `State: ${st.state}`); y = 18;
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text(`${st.state} — by Locality`, 14, y); y += 5;
      st.localities.forEach((loc: string, li: number) => {
        if (y > 240) { doc.addPage(); addPageHeader(doc, `State: ${st.state}`); y = 18; }
        doc.setFontSize(10); doc.setTextColor(41, 98, 255); doc.setFont('helvetica', 'bold');
        doc.text(`Locality: ${loc}`, 18, y); y += 3;
        const lRows = st.matrix.filter(row => row.cells[li].questionnaires > 0 || row.cells[li].sites > 0).map(row => [
          row.activity, String(row.cells[li].sites || '-'), String(row.cells[li].questionnaires || '-'),
          isPdmActivity(row.activity) && row.cells[li].questionnaires ? String(Math.ceil(row.cells[li].questionnaires / 7)) : '-',
          String(row.cells[li].collectors || '-'),
        ]);
        const locPdm = st.matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? (r.cells[li].questionnaires ? Math.ceil(r.cells[li].questionnaires / 7) : 0) : 0), 0);
        lRows.push(['Total', String(st.colTotals[li].sites), String(st.colTotals[li].questionnaires), locPdm ? String(locPdm) : '-', String(st.colTotals[li].collectors)]);
        y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], lRows, y, { fontSize: 8, boldLastRow: true, columnStyles: { 0: { cellWidth: 55 } }, useArabicFont: hasArabic });
        y += 5;
      });
    });

    addAllFooters(doc);
    doc.save('questionnaire_analytics.pdf');
  }, [filteredData, hubSummary, stateSummary, localitySummary, activityBreakdown, collectorDetails, trackerData]);

  const exportTrackerToExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const { hubs, activities, matrix, hubTotals, grandQ, grandSites, grandCollectors, stateBreakdown, hubTrackers, stateTrackers } = trackerData;

    const rows: any[] = [];
    matrix.forEach(row => {
      const r: any = { Activity: row.activity };
      hubs.forEach((hub, hi) => {
        r[`${hub} Sites`] = row.cells[hi].sites;
        r[`${hub} Actual`] = row.cells[hi].questionnaires;
        r[`${hub} PDM Sites`] = isPdmActivity(row.activity) ? Math.ceil(row.cells[hi].questionnaires / 7) : 0;
        r[`${hub} DC`] = row.cells[hi].collectors;
      });
      r['Total Sites'] = row.totalSites;
      r['Total Actual'] = row.totalQ;
      r['Total PDM Sites'] = isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : 0;
      r['Total DC'] = row.totalCollectors;
      rows.push(r);
    });
    const totalRow: any = { Activity: 'Grand Total' };
    hubs.forEach((hub, hi) => {
      totalRow[`${hub} Sites`] = hubTotals[hi].sites;
      totalRow[`${hub} Actual`] = hubTotals[hi].questionnaires;
      const pdmSitesCol = matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? (r.cells[hi].questionnaires ? Math.ceil(r.cells[hi].questionnaires / 7) : 0) : r.cells[hi].questionnaires), 0);
      totalRow[`${hub} PDM Sites`] = pdmSitesCol || 0;
      totalRow[`${hub} DC`] = hubTotals[hi].collectors;
    });
    totalRow['Total Sites'] = grandSites;
    totalRow['Total Actual'] = grandQ;
    const pdmSitesGrand2 = matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
    totalRow['Total PDM Sites'] = pdmSitesGrand2 || 0;
    totalRow['Total DC'] = grandCollectors;
    rows.push(totalRow);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Activity x Hub');

    const stateRows: any[] = [];
    stateBreakdown.forEach(sb => {
      sb.activities.forEach(a => {
        if (a.questionnaires > 0) {
          stateRows.push({ State: sb.state, Activity: a.activity, Sites: a.sites, Questionnaires: a.questionnaires, 'PDM Sites': isPdmActivity(a.activity) ? Math.ceil(a.questionnaires / 7) : 0 });
        }
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stateRows), 'Activity x State');

    hubTrackers.forEach(ht => {
      const htRows: any[] = [];
      ht.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        ht.states.forEach((st, si) => {
          r[`${st} Sites`] = row.cells[si].sites;
          r[`${st} Actual`] = row.cells[si].questionnaires;
          r[`${st} PDM Sites`] = isPdmActivity(row.activity) ? Math.ceil(row.cells[si].questionnaires / 7) : 0;
          r[`${st} DC`] = row.cells[si].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : 0; r['Total DC'] = row.totalCollectors;
        htRows.push(r);
      });
      const htTotal: any = { Activity: 'Total' };
      ht.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = ht.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? (r.cells[ci].questionnaires ? Math.ceil(r.cells[ci].questionnaires / 7) : 0) : r.cells[ci].questionnaires), 0);
        htTotal[`${ht.states[ci]} Sites`] = ct.sites; htTotal[`${ht.states[ci]} Actual`] = ct.questionnaires; htTotal[`${ht.states[ci]} PDM Sites`] = pdmSitesCol || 0; htTotal[`${ht.states[ci]} DC`] = ct.collectors;
      });
      const htPdmSitesGrand = ht.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
      htTotal['Total Sites'] = ht.grandSites; htTotal['Total Actual'] = ht.grandQ; htTotal['Total PDM Sites'] = htPdmSitesGrand || 0; htTotal['Total DC'] = ht.grandCollectors;
      htRows.push(htTotal);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(htRows), `Hub-${ht.hub}`.slice(0, 31));
    });

    stateTrackers.forEach(st => {
      const stRows: any[] = [];
      st.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        st.localities.forEach((loc, li) => {
          r[`${loc} Sites`] = row.cells[li].sites;
          r[`${loc} Actual`] = row.cells[li].questionnaires;
          r[`${loc} PDM Sites`] = isPdmActivity(row.activity) ? Math.ceil(row.cells[li].questionnaires / 7) : 0;
          r[`${loc} DC`] = row.cells[li].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : 0; r['Total DC'] = row.totalCollectors;
        stRows.push(r);
      });
      const stTotal: any = { Activity: 'Total' };
      st.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = st.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? (r.cells[ci].questionnaires ? Math.ceil(r.cells[ci].questionnaires / 7) : 0) : r.cells[ci].questionnaires), 0);
        stTotal[`${st.localities[ci]} Sites`] = ct.sites; stTotal[`${st.localities[ci]} Actual`] = ct.questionnaires; stTotal[`${st.localities[ci]} PDM Sites`] = pdmSitesCol || 0; stTotal[`${st.localities[ci]} DC`] = ct.collectors;
      });
      const stPdmSitesGrand = st.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
      stTotal['Total Sites'] = st.grandSites; stTotal['Total Actual'] = st.grandQ; stTotal['Total PDM Sites'] = stPdmSitesGrand || 0; stTotal['Total DC'] = st.grandCollectors;
      stRows.push(stTotal);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stRows), `State-${st.state}`.slice(0, 31));
    });

    XLSX.writeFile(wb, 'tracker_report.xlsx');
  }, [trackerData]);

  const exportActivityByStateExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const rows: any[] = [];
    trackerData.stateBreakdown.forEach(sb => {
      sb.activities.filter(a => a.questionnaires > 0).forEach(a => {
        rows.push({ State: sb.state, Activity: a.activity, Sites: a.sites, Questionnaires: a.questionnaires, 'PDM Sites': isPdmActivity(a.activity) ? Math.ceil(a.questionnaires / 7) : '-' });
      });
      const pdmSitesTotal = sb.activities.filter(a => a.questionnaires > 0).reduce((s, a) => s + (isPdmActivity(a.activity) ? Math.ceil(a.questionnaires / 7) : a.questionnaires), 0);
      rows.push({ State: sb.state, Activity: 'Total', Sites: sb.activities.filter(a => a.questionnaires > 0).reduce((s, a) => s + a.sites, 0), Questionnaires: sb.totalQ, 'PDM Sites': pdmSitesTotal || '-' });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Activity by State');
    XLSX.writeFile(wb, 'tracker_activity_by_state.xlsx');
  }, [trackerData]);

  const exportActivityByStatePdf = useCallback(async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Tracker - Activity by State', 'المتتبع - النشاط حسب الولاية');
    
    trackerData.stateBreakdown.forEach((sb: any) => {
      if (y > 240) { doc.addPage(); addPageHeader(doc, 'Activity by State'); y = 18; }
      doc.setFontSize(11);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(`${sb.state} (${sb.totalQ} Q)`, 14, y);
      y += 2;
      const actRows = sb.activities.filter((a: any) => a.questionnaires > 0).map((a: any) => [a.activity, String(a.sites), String(a.questionnaires), isPdmActivity(a.activity) ? String(Math.ceil(a.questionnaires / 7)) : '-']);
      const pdmSitesTotal = sb.activities.filter((a: any) => a.questionnaires > 0).reduce((s: number, a: any) => s + (isPdmActivity(a.activity) ? Math.ceil(a.questionnaires / 7) : a.questionnaires), 0);
      actRows.push(['Total', String(sb.activities.filter((a: any) => a.questionnaires > 0).reduce((s: number, a: any) => s + a.sites, 0)), String(sb.totalQ), pdmSitesTotal ? String(pdmSitesTotal) : '-']);
      y = styledAutoTable(doc, [['Activity', 'Sites', 'Questionnaires', 'PDM Sites']], actRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
      y += 8;
    });
    addAllFooters(doc);
    doc.save('tracker_activity_by_state.pdf');
  }, [trackerData]);

  const exportTrackerPerHubExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    trackerData.hubTrackers.forEach(ht => {
      const htRows: any[] = [];
      ht.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        ht.states.forEach((st, si) => {
          r[`${st} Sites`] = row.cells[si].sites;
          r[`${st} Actual`] = row.cells[si].questionnaires;
          r[`${st} PDM Sites`] = isPdmActivity(row.activity) ? Math.ceil(row.cells[si].questionnaires / 7) : 0;
          r[`${st} DC`] = row.cells[si].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : 0; r['Total DC'] = row.totalCollectors;
        htRows.push(r);
      });
      const htTotal: any = { Activity: 'Total' };
      ht.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = ht.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? (r.cells[ci].questionnaires ? Math.ceil(r.cells[ci].questionnaires / 7) : 0) : r.cells[ci].questionnaires), 0);
        htTotal[`${ht.states[ci]} Sites`] = ct.sites; htTotal[`${ht.states[ci]} Actual`] = ct.questionnaires; htTotal[`${ht.states[ci]} PDM Sites`] = pdmSitesCol || 0; htTotal[`${ht.states[ci]} DC`] = ct.collectors;
      });
      const htPdmSitesGrand = ht.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
      htTotal['Total Sites'] = ht.grandSites; htTotal['Total Actual'] = ht.grandQ; htTotal['Total PDM Sites'] = htPdmSitesGrand || 0; htTotal['Total DC'] = ht.grandCollectors;
      htRows.push(htTotal);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(htRows), `${ht.hub}`.slice(0, 31));
    });
    XLSX.writeFile(wb, 'tracker_per_hub.xlsx');
  }, [trackerData]);

  const exportTrackerPerHubPdf = useCallback(async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Tracker per Hub', 'المتتبع لكل محور');
    
    trackerData.hubTrackers.forEach((ht: any) => {
      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Tracker per Hub'); y = 18; }
      doc.setFontSize(13);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(ht.hub, 14, y);
      doc.setFontSize(9);
      doc.setTextColor(90, 95, 110);
      doc.setFont('helvetica', 'normal');
      doc.text(`${ht.grandQ} Questionnaires  |  ${ht.grandSites} Sites  |  ${ht.grandCollectors} Collectors`, 14, y + 5);
      y += 10;

      ht.states.forEach((st: string, si: number) => {
        if (y > 240) { doc.addPage(); addPageHeader(doc, 'Tracker per Hub'); y = 18; }
        doc.setFontSize(10);
        doc.setTextColor(41, 98, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(`State: ${st}`, 18, y);
        y += 3;
        const stRows = ht.matrix.filter((row: any) => row.cells[si].questionnaires > 0 || row.cells[si].sites > 0).map((row: any) => [
          row.activity,
          String(row.cells[si].sites || '-'),
          String(row.cells[si].questionnaires || '-'),
          isPdmActivity(row.activity) && row.cells[si].questionnaires ? String(Math.ceil(row.cells[si].questionnaires / 7)) : '-',
          String(row.cells[si].collectors || '-'),
        ]);
        const colPdmSites = ht.matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? (r.cells[si].questionnaires ? Math.ceil(r.cells[si].questionnaires / 7) : 0) : r.cells[si].questionnaires), 0);
        stRows.push(['Total', String(ht.colTotals[si].sites), String(ht.colTotals[si].questionnaires), colPdmSites ? String(colPdmSites) : '-', String(ht.colTotals[si].collectors)]);
        y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], stRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
        y += 6;
      });

      if (y > 240) { doc.addPage(); addPageHeader(doc, 'Tracker per Hub'); y = 18; }
      doc.setFontSize(10);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(`${ht.hub} — Hub Total`, 14, y);
      y += 3;
      const hubTotRows = ht.matrix.map((row: any) => [
        row.activity, String(row.totalSites), String(row.totalQ),
        isPdmActivity(row.activity) ? String(Math.ceil(row.totalQ / 7)) : '-', String(row.totalCollectors),
      ]);
      const htPdmSitesGrand = ht.matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
      hubTotRows.push(['Grand Total', String(ht.grandSites), String(ht.grandQ), htPdmSitesGrand ? String(htPdmSitesGrand) : '-', String(ht.grandCollectors)]);
      y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], hubTotRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
      y += 12;
    });
    addAllFooters(doc);
    doc.save('tracker_per_hub.pdf');
  }, [trackerData]);

  const exportTrackerPerStateExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    trackerData.stateTrackers.forEach(st => {
      const stRows: any[] = [];
      st.matrix.forEach(row => {
        const r: any = { Activity: row.activity };
        st.localities.forEach((loc, li) => {
          r[`${loc} Sites`] = row.cells[li].sites;
          r[`${loc} Actual`] = row.cells[li].questionnaires;
          r[`${loc} PDM Sites`] = isPdmActivity(row.activity) ? Math.ceil(row.cells[li].questionnaires / 7) : 0;
          r[`${loc} DC`] = row.cells[li].collectors;
        });
        r['Total Sites'] = row.totalSites; r['Total Actual'] = row.totalQ; r['Total PDM Sites'] = isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : 0; r['Total DC'] = row.totalCollectors;
        stRows.push(r);
      });
      const stTotal: any = { Activity: 'Total' };
      st.colTotals.forEach((ct, ci) => {
        const pdmSitesCol = st.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? (r.cells[ci].questionnaires ? Math.ceil(r.cells[ci].questionnaires / 7) : 0) : r.cells[ci].questionnaires), 0);
        stTotal[`${st.localities[ci]} Sites`] = ct.sites; stTotal[`${st.localities[ci]} Actual`] = ct.questionnaires; stTotal[`${st.localities[ci]} PDM Sites`] = pdmSitesCol || 0; stTotal[`${st.localities[ci]} DC`] = ct.collectors;
      });
      const stPdmSitesGrand = st.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
      stTotal['Total Sites'] = st.grandSites; stTotal['Total Actual'] = st.grandQ; stTotal['Total PDM Sites'] = stPdmSitesGrand || 0; stTotal['Total DC'] = st.grandCollectors;
      stRows.push(stTotal);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stRows), `${st.state}`.slice(0, 31));
    });
    XLSX.writeFile(wb, 'tracker_per_state.xlsx');
  }, [trackerData]);

  const exportTrackerPerStatePdf = useCallback(async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Tracker per State', 'المتتبع لكل ولاية');
    
    trackerData.stateTrackers.forEach((st: any) => {
      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Tracker per State'); y = 18; }
      doc.setFontSize(13);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(st.state, 14, y);
      doc.setFontSize(9);
      doc.setTextColor(90, 95, 110);
      doc.setFont('helvetica', 'normal');
      doc.text(`${st.grandQ} Questionnaires  |  ${st.grandSites} Sites  |  ${st.grandCollectors} Collectors`, 14, y + 5);
      y += 10;

      st.localities.forEach((loc: string, li: number) => {
        if (y > 240) { doc.addPage(); addPageHeader(doc, 'Tracker per State'); y = 18; }
        doc.setFontSize(10);
        doc.setTextColor(41, 98, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(`Locality: ${loc}`, 18, y);
        y += 3;
        const locRows = st.matrix.filter((row: any) => row.cells[li].questionnaires > 0 || row.cells[li].sites > 0).map((row: any) => [
          row.activity,
          String(row.cells[li].sites || '-'),
          String(row.cells[li].questionnaires || '-'),
          isPdmActivity(row.activity) && row.cells[li].questionnaires ? String(Math.ceil(row.cells[li].questionnaires / 7)) : '-',
          String(row.cells[li].collectors || '-'),
        ]);
        const colPdmSites = st.matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? (r.cells[li].questionnaires ? Math.ceil(r.cells[li].questionnaires / 7) : 0) : r.cells[li].questionnaires), 0);
        locRows.push(['Total', String(st.colTotals[li].sites), String(st.colTotals[li].questionnaires), colPdmSites ? String(colPdmSites) : '-', String(st.colTotals[li].collectors)]);
        y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], locRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
        y += 6;
      });

      if (y > 240) { doc.addPage(); addPageHeader(doc, 'Tracker per State'); y = 18; }
      doc.setFontSize(10);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(`${st.state} — State Total`, 14, y);
      y += 3;
      const stateTotRows = st.matrix.map((row: any) => [
        row.activity, String(row.totalSites), String(row.totalQ),
        isPdmActivity(row.activity) ? String(Math.ceil(row.totalQ / 7)) : '-', String(row.totalCollectors),
      ]);
      const stPdmSitesGrand = st.matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
      stateTotRows.push(['Grand Total', String(st.grandSites), String(st.grandQ), stPdmSitesGrand ? String(stPdmSitesGrand) : '-', String(st.grandCollectors)]);
      y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], stateTotRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
      y += 12;
    });
    addAllFooters(doc);
    doc.save('tracker_per_state.pdf');
  }, [trackerData]);

  const exportCollectorPdf = useCallback(async (collector: CollectorDetail) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.width;
    const ml = 14;
    const mr = 14;

    let y = await drawPdfHeader(doc, `Data Collector Report`, 'تقرير جامع البيانات', `${collector.name} — ${collector.count} questionnaires (${collector.percentage.toFixed(1)}%)`);
    const hasArabic = await loadArabicFont(doc);

    doc.setFillColor(245, 247, 252);
    doc.setDrawColor(200, 205, 215);
    doc.roundedRect(ml, y, pw - ml - mr, 24, 2, 2, 'FD');
    y += 6;
    doc.setFontSize(10);
    doc.setTextColor(45, 45, 60);
    doc.setFont('helvetica', 'bold');
    doc.text('Collector Name:', ml + 4, y);
    if (hasArabic) {
      doc.setFont('Amiri', 'normal');
    } else {
      doc.setFont('helvetica', 'normal');
    }
    doc.text(collector.name, ml + 40, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Device ID:', ml + 4, y);
    doc.setFont('helvetica', 'normal');
    doc.text(collector.deviceId || '-', ml + 40, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Hub(s):', ml + 4, y);
    doc.setFont('helvetica', 'normal');
    doc.text(collector.hubs.join(', '), ml + 40, y);
    doc.setFont('helvetica', 'bold');
    doc.text('State(s):', pw / 2, y);
    doc.setFont('helvetica', 'normal');
    doc.text(collector.states.join(', '), pw / 2 + 20, y);
    y += 10;

    if (collector.nameVariants.length > 0) {
      doc.setFontSize(11);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(`Name Variants (${collector.nameVariants.length + 1})`, ml, y);
      y += 2;
      const variantRows = collector.nameVariants.map((v: any, i: number) => [String(i + 1), v.name, String(v.count)]);
      variantRows.unshift(['★', collector.name, String(collector.count - collector.nameVariants.reduce((s: number, v: any) => s + v.count, 0))]);
      y = styledAutoTable(doc, [['#', 'Name', 'Count']], variantRows, y, { fontSize: 8, useArabicFont: hasArabic });
      y += 6;
    }

    if (y > 240) { doc.addPage(); addPageHeader(doc, 'Data Collector Report'); y = 18; }
    doc.setFontSize(11);
    doc.setTextColor(15, 32, 65);
    doc.setFont('helvetica', 'bold');
    doc.text('Activities Breakdown', ml, y);
    y += 2;
    const actRows = collector.activities.map((a: any, i: number) => [String(i + 1), a.name, String(a.count)]);
    const actTotal = collector.activities.reduce((s: number, a: any) => s + a.count, 0);
    actRows.push(['', 'Total', String(actTotal)]);
    y = styledAutoTable(doc, [['#', 'Activity', 'Count']], actRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
    y += 6;

    if (y > 240) { doc.addPage(); addPageHeader(doc, 'Data Collector Report'); y = 18; }
    doc.setFontSize(11);
    doc.setTextColor(15, 32, 65);
    doc.setFont('helvetica', 'bold');
    doc.text('Localities Breakdown', ml, y);
    y += 2;
    const locRows = collector.localities.map((l: any, i: number) => [String(i + 1), l.name, String(l.count)]);
    y = styledAutoTable(doc, [['#', 'Locality', 'Count']], locRows, y, { fontSize: 9, useArabicFont: hasArabic });

    addAllFooters(doc);

    const safeName = collector.name.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_').slice(0, 30);
    doc.save(`collector_${safeName}.pdf`);
  }, []);

  const toggleDrillHub = useCallback((hub: string) => {
    setDrillExpandedHubs(prev => {
      const n = new Set(prev);
      if (n.has(hub)) {
        n.delete(hub);
        setDrillExpandedStates(sp => { const ns = new Set<string>(); sp.forEach(k => { if (!k.startsWith(`${hub}::`)) ns.add(k); }); return ns; });
        setDrillExpandedActivities(ap => { const na = new Set<string>(); ap.forEach(k => { if (!k.startsWith(`${hub}::`)) na.add(k); }); return na; });
      } else {
        n.add(hub);
      }
      return n;
    });
  }, []);
  const toggleDrillState = useCallback((key: string) => {
    setDrillExpandedStates(prev => {
      const n = new Set(prev);
      if (n.has(key)) {
        n.delete(key);
        setDrillExpandedActivities(ap => { const na = new Set<string>(); ap.forEach(k => { if (!k.startsWith(`${key}::`)) na.add(k); }); return na; });
      } else {
        n.add(key);
      }
      return n;
    });
  }, []);
  const toggleDrillActivity = useCallback((key: string) => {
    setDrillExpandedActivities(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);
  const toggleDrillLocality = useCallback((key: string) => {
    setDrillExpandedLocalities(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  const exportHubDrilldownExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const rows: any[] = [];
    hubDrilldown.forEach(hub => {
      rows.push({ Level: 'Hub', Hub: hub.name, State: '', Activity: '', Locality: '', 'Site Name': '', Sites: hub.sites, Questionnaires: hub.questionnaires, '%': hub.percentage.toFixed(1) + '%' });
      hub.states.forEach(st => {
        rows.push({ Level: 'State', Hub: hub.name, State: st.name, Activity: '', Locality: '', 'Site Name': '', Sites: st.sites, Questionnaires: st.questionnaires, '%': st.percentage.toFixed(1) + '%' });
        st.activities.forEach(act => {
          rows.push({ Level: 'Activity', Hub: hub.name, State: st.name, Activity: act.name, Locality: '', 'Site Name': '', Sites: act.sites, Questionnaires: act.questionnaires, '%': act.percentage.toFixed(1) + '%' });
          act.localities.forEach(loc => {
            rows.push({ Level: 'Locality', Hub: hub.name, State: st.name, Activity: act.name, Locality: loc.name, 'Site Name': '', Sites: loc.sites, Questionnaires: loc.questionnaires, '%': loc.percentage.toFixed(1) + '%' });
            loc.siteNames.forEach(sn => {
              rows.push({ Level: 'Site', Hub: hub.name, State: st.name, Activity: act.name, Locality: loc.name, 'Site Name': sn, Sites: '', Questionnaires: '', '%': '' });
            });
          });
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Hub Drilldown');
    XLSX.writeFile(wb, 'hub_drilldown.xlsx');
  }, [hubDrilldown]);

  const exportHubDrilldownPdf = useCallback(async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Hub Distribution - Drilldown Report', 'التوزيع حسب المحور');
    
    hubDrilldown.forEach((hub: any) => {
      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Hub Drilldown'); y = 18; }
      doc.setFontSize(13);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(hub.name, 14, y);
      doc.setFontSize(9);
      doc.setTextColor(90, 95, 110);
      doc.setFont('helvetica', 'normal');
      doc.text(`${hub.questionnaires} Questionnaires  |  ${hub.sites} Sites  |  ${hub.percentage.toFixed(1)}%`, 14, y + 5);
      y += 10;

      hub.states.forEach((st: any) => {
        if (y > 240) { doc.addPage(); addPageHeader(doc, 'Hub Drilldown'); y = 18; }
        doc.setFontSize(10);
        doc.setTextColor(41, 98, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(`State: ${st.name} — ${st.questionnaires} Q, ${st.sites} sites`, 18, y);
        y += 4;

        st.activities.forEach((act: any) => {
          if (y > 250) { doc.addPage(); addPageHeader(doc, 'Hub Drilldown'); y = 18; }
          doc.setFontSize(9);
          doc.setTextColor(16, 185, 129);
          doc.setFont('helvetica', 'bold');
          doc.text(`${act.name} — ${act.questionnaires} Q, ${act.sites} sites`, 22, y);
          y += 3;

          act.localities.forEach((loc: any) => {
            if (y > 255) { doc.addPage(); addPageHeader(doc, 'Hub Drilldown'); y = 18; }
            doc.setFontSize(8);
            doc.setTextColor(217, 119, 6);
            doc.setFont('helvetica', 'bold');
            doc.text(`${loc.name} — ${loc.questionnaires} Q, ${loc.sites} sites`, 26, y);
            y += 3;
            if (loc.siteNames && loc.siteNames.length > 0) {
              const siteRows = loc.siteNames.map((sn: string, idx: number) => [String(idx + 1), sn]);
              y = styledAutoTable(doc, [['#', 'Site Name']], siteRows, y, {
                fontSize: 8,
                margin: { left: 30, right: 14 },
                columnStyles: { 0: { cellWidth: 10, halign: 'center', fontStyle: 'normal' }, 1: { cellWidth: 120 } },
              });
              y += 3;
            }
          });
          y += 2;
        });
        y += 4;
      });
      y += 6;
    });
    addAllFooters(doc);
    doc.save('hub_drilldown.pdf');
  }, [hubDrilldown]);

  const exportMainTrackerPdf = useCallback(async () => {
    const { hubs, matrix, hubTotals, grandQ, grandSites, grandCollectors } = trackerData;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Tracker - Activity by Hub', 'المتتبع - النشاط حسب المحور');

    hubs.forEach((hub: string, hi: number) => {
      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Activity by Hub'); y = 18; }
      doc.setFontSize(12);
      doc.setTextColor(15, 32, 65);
      doc.setFont('helvetica', 'bold');
      doc.text(hub, 14, y);
      doc.setFontSize(9);
      doc.setTextColor(90, 95, 110);
      doc.setFont('helvetica', 'normal');
      doc.text(`${hubTotals[hi].questionnaires} Questionnaires  |  ${hubTotals[hi].sites} Sites  |  ${hubTotals[hi].collectors} Collectors`, 14, y + 5);
      y += 9;
      const actRows = matrix.filter((row: any) => row.cells[hi].questionnaires > 0 || row.cells[hi].sites > 0).map((row: any) => [
        row.activity,
        String(row.cells[hi].sites || '-'),
        String(row.cells[hi].questionnaires || '-'),
        isPdmActivity(row.activity) && row.cells[hi].questionnaires ? String(Math.ceil(row.cells[hi].questionnaires / 7)) : '-',
        String(row.cells[hi].collectors || '-'),
      ]);
      const hubPdmSites = matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? (r.cells[hi].questionnaires ? Math.ceil(r.cells[hi].questionnaires / 7) : 0) : r.cells[hi].questionnaires), 0);
      actRows.push(['Total', String(hubTotals[hi].sites), String(hubTotals[hi].questionnaires), hubPdmSites ? String(hubPdmSites) : '-', String(hubTotals[hi].collectors)]);
      y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], actRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });
      y += 10;
    });

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'Activity by Hub'); y = 18; }
    doc.setFontSize(13);
    doc.setTextColor(15, 32, 65);
    doc.setFont('helvetica', 'bold');
    doc.text('Grand Total — All Hubs', 14, y);
    y += 5;
    const grandRows = matrix.map((row: any) => [
      row.activity,
      String(row.totalSites),
      String(row.totalQ),
      isPdmActivity(row.activity) ? String(Math.ceil(row.totalQ / 7)) : '-',
      String(row.totalCollectors),
    ]);
    const pdmSitesGrandPdf = matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
    grandRows.push(['Grand Total', String(grandSites), String(grandQ), pdmSitesGrandPdf ? String(pdmSitesGrandPdf) : '-', String(grandCollectors)]);
    y = styledAutoTable(doc, [['Activity', 'Sites', 'Actual', 'PDM Sites', 'DC']], grandRows, y, { fontSize: 9, boldLastRow: true, columnStyles: { 0: { cellWidth: 65 } } });

    addAllFooters(doc);
    doc.save('tracker_activity_by_hub.pdf');
  }, [trackerData]);

  const exportMainTrackerFormattedExcel = useCallback(async () => {
    await exportFormattedTrackerExcel(trackerData, isPdmActivity, 'tracker_activity_by_hub.xlsx', filteredData);
  }, [trackerData, filteredData]);

  const exportActivityByStateFormattedExcel = useCallback(async () => {
    const sheets = trackerData.stateBreakdown.map(sb => {
      const acts = sb.activities.filter((a: any) => a.questionnaires > 0);
      const pdmSitesTotal = acts.reduce((s: number, a: any) => s + (isPdmActivity(a.activity) ? Math.ceil(a.questionnaires / 7) : a.questionnaires), 0);
      return {
        title: sb.state,
        headers: ['Activity', 'Sites', 'Questionnaires', 'PDM Sites'],
        rows: acts.map((a: any) => [a.activity, a.sites, a.questionnaires, isPdmActivity(a.activity) ? Math.ceil(a.questionnaires / 7) : '-']),
        totalRow: ['Total', acts.reduce((s: number, a: any) => s + a.sites, 0), sb.totalQ, pdmSitesTotal || '-'],
      };
    });
    await exportFormattedExcel(sheets, 'tracker_activity_by_state.xlsx');
  }, [trackerData]);

  const exportTrackerPerHubFormattedExcel = useCallback(async () => {
    const sheets = trackerData.hubTrackers.map((ht: any) => {
      const headers = ['Activity'];
      ht.states.forEach((st: string) => { headers.push(`${st} Sites`, `${st} Actual`, `${st} PDM`, `${st} DC`); });
      headers.push('Total Sites', 'Total Actual', 'Total PDM', 'Total DC');
      const rows = ht.matrix.map((row: any) => {
        const r: (string|number)[] = [row.activity];
        row.cells.forEach((c: any) => { r.push(c.sites || '-', c.questionnaires || '-', isPdmActivity(row.activity) && c.questionnaires ? Math.ceil(c.questionnaires / 7) : '-', c.collectors || '-'); });
        r.push(row.totalSites, row.totalQ, isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : '-', row.totalCollectors);
        return r;
      });
      const totR: (string|number)[] = ['Total'];
      ht.colTotals.forEach((ct: any, ci: number) => {
        const pdmSitesCol = ht.matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? (r.cells[ci].questionnaires ? Math.ceil(r.cells[ci].questionnaires / 7) : 0) : r.cells[ci].questionnaires), 0);
        totR.push(ct.sites, ct.questionnaires, pdmSitesCol || '-', ct.collectors);
      });
      const htPdmSitesGrand = ht.matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
      totR.push(ht.grandSites, ht.grandQ, htPdmSitesGrand || '-', ht.grandCollectors);
      return { title: ht.hub, headers, rows, totalRow: totR };
    });
    await exportFormattedExcel(sheets, 'tracker_per_hub.xlsx');
  }, [trackerData]);

  const exportTrackerPerStateFormattedExcel = useCallback(async () => {
    const sheets = trackerData.stateTrackers.map((st: any) => {
      const headers = ['Activity'];
      st.localities.forEach((loc: string) => { headers.push(`${loc} Sites`, `${loc} Actual`, `${loc} PDM`, `${loc} DC`); });
      headers.push('Total Sites', 'Total Actual', 'Total PDM', 'Total DC');
      const rows = st.matrix.map((row: any) => {
        const r: (string|number)[] = [row.activity];
        row.cells.forEach((c: any) => { r.push(c.sites || '-', c.questionnaires || '-', isPdmActivity(row.activity) && c.questionnaires ? Math.ceil(c.questionnaires / 7) : '-', c.collectors || '-'); });
        r.push(row.totalSites, row.totalQ, isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : '-', row.totalCollectors);
        return r;
      });
      const totR: (string|number)[] = ['Total'];
      st.colTotals.forEach((ct: any, ci: number) => {
        const pdmSitesCol = st.matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? (r.cells[ci].questionnaires ? Math.ceil(r.cells[ci].questionnaires / 7) : 0) : r.cells[ci].questionnaires), 0);
        totR.push(ct.sites, ct.questionnaires, pdmSitesCol || '-', ct.collectors);
      });
      const stPdmSitesGrand = st.matrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0);
      totR.push(st.grandSites, st.grandQ, stPdmSitesGrand || '-', st.grandCollectors);
      return { title: st.state, headers, rows, totalRow: totR };
    });
    await exportFormattedExcel(sheets, 'tracker_per_state.xlsx');
  }, [trackerData]);

  const exportHubDrilldownFormattedExcel = useCallback(async () => {
    const sheets = [{
      title: 'Hub Drilldown',
      headers: ['Level', 'Hub', 'State', 'Activity', 'Locality', 'Site Name', 'Sites', 'Questionnaires', '%'],
      rows: [] as (string|number)[][],
    }];
    hubDrilldown.forEach((hub: any) => {
      sheets[0].rows.push(['Hub', hub.name, '', '', '', '', hub.sites, hub.questionnaires, hub.percentage.toFixed(1) + '%']);
      hub.states.forEach((st: any) => {
        sheets[0].rows.push(['State', hub.name, st.name, '', '', '', st.sites, st.questionnaires, st.percentage.toFixed(1) + '%']);
        st.activities.forEach((act: any) => {
          sheets[0].rows.push(['Activity', hub.name, st.name, act.name, '', '', act.sites, act.questionnaires, act.percentage.toFixed(1) + '%']);
          act.localities.forEach((loc: any) => {
            sheets[0].rows.push(['Locality', hub.name, st.name, act.name, loc.name, '', loc.sites, loc.questionnaires, loc.percentage.toFixed(1) + '%']);
            loc.siteNames.forEach((sn: string) => {
              sheets[0].rows.push(['Site', hub.name, st.name, act.name, loc.name, sn, '', '', '']);
            });
          });
        });
      });
    });
    await exportFormattedExcel(sheets, 'hub_drilldown.xlsx');
  }, [hubDrilldown]);

  const exportReportExcel = useCallback(async () => {
    if (!computeReportSummary) return;
    const rpt = computeReportSummary;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PACT Command Center';
    wb.created = new Date();

    const addSection = (ws: any, text: string) => {
      const r = ws.addRow([text, '']);
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2041' } };
      r.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2041' } };
      r.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      r.height = 22;
    };
    const bFont = (sz = 10, color = 'FF14141E'): Partial<ExcelJS.Font> => ({ size: sz, name: 'Calibri', color: { argb: color } });
    const tBorder = (): Partial<ExcelJS.Borders> => {
      const s: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFC8CDD7' } };
      return { top: s, bottom: s, left: s, right: s };
    };
    const addPair = (ws: any, label: string, value: string | number) => {
      const r = ws.addRow([label, value]);
      r.getCell(1).font = bFont(10);
      r.getCell(2).font = bFont(10);
      r.getCell(1).border = tBorder();
      r.getCell(2).border = tBorder();
    };

    const ws1 = wb.addWorksheet('Report Summary');
    const titleRow = ws1.addRow(['Data Quality & Coverage Report']);
    titleRow.font = { bold: true, size: 14, name: 'Calibri', color: { argb: 'FF0F2041' } };
    titleRow.height = 26;
    ws1.addRow([]);

    addSection(ws1, 'Report Information');
    addPair(ws1, 'Generated Date', rpt.generatedDate);
    addPair(ws1, 'File Name', rpt.fileName);
    addPair(ws1, 'Month Coverage', rpt.monthCoverage);
    ws1.addRow([]);

    addSection(ws1, 'Coverage Summary');
    addPair(ws1, 'Total Questionnaires', rpt.totalQuestionnaires);
    addPair(ws1, 'Original Rows', rpt.originalRows);
    addPair(ws1, 'Unique Sites', rpt.uniqueSites);
    addPair(ws1, 'Hubs', rpt.uniqueHubs);
    addPair(ws1, 'States', rpt.uniqueStates);
    addPair(ws1, 'Localities', rpt.uniqueLocalities);
    addPair(ws1, 'Data Collectors', rpt.totalCollectors);
    addPair(ws1, 'Supervisors', rpt.totalSupervisors);
    ws1.addRow([]);

    if (trackerData && trackerData.matrix && trackerData.matrix.length > 0) {
      const { hubs: tH, matrix: tM, hubTotals: tHT, grandQ: tGQ, grandSites: tGS, grandCollectors: tGC } = trackerData;
      const pdmGrand = tM.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : 0), 0);
      const actualSitesGrand = tM.reduce((a: number, r: any) => {
        let np = 0; r.cells.forEach((c: any) => { if (!isPdmActivity(r.activity)) np += (c.questionnaires || 0); });
        return a + np;
      }, 0) + pdmGrand;

      addSection(ws1, 'Tracker Grand Totals');
      const tHdr = ws1.addRow(['Hub', 'Sites', 'Actual', 'PDM Sites', 'DC']);
      tHdr.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
        cell.border = tBorder();
        cell.alignment = { horizontal: 'center' };
      });
      tHdr.getCell(1).alignment = { horizontal: 'left' };
      tH.forEach((hub: string, hi: number) => {
        const ht = tHT[hi];
        const hubPdm = tM.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) && r.cells[hi].questionnaires ? Math.ceil(r.cells[hi].questionnaires / 7) : 0), 0);
        const r = ws1.addRow([hub, ht.sites, ht.questionnaires, hubPdm || '-', ht.collectors]);
        r.eachCell((cell, ci) => {
          cell.font = bFont(10);
          cell.border = tBorder();
          cell.alignment = { horizontal: ci > 1 ? 'center' : 'left' };
        });
      });
      const gtRow = ws1.addRow(['Grand Total', tGS, tGQ, pdmGrand || '-', tGC]);
      gtRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
        cell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF14141E' } };
        cell.border = tBorder();
        cell.alignment = { horizontal: 'center' };
      });
      gtRow.getCell(1).alignment = { horizontal: 'left' };
      const tsRow = ws1.addRow(['Total Sites (PDM/7)', actualSitesGrand, '', '', '']);
      tsRow.getCell(1).font = { bold: true, size: 11, name: 'Calibri', color: { argb: 'FF107838' } };
      tsRow.getCell(2).font = { bold: true, size: 14, name: 'Calibri', color: { argb: 'FF107838' } };
      tsRow.getCell(1).border = tBorder();
      tsRow.getCell(2).border = tBorder();
      ws1.addRow([]);
    }

    addSection(ws1, 'Hub Coverage');
    rpt.hubBreakdown.forEach(h => addPair(ws1, h.hub, `${h.questionnaires} Q, ${h.sites} sites`));
    ws1.addRow([]);

    addSection(ws1, 'Activity Coverage');
    rpt.activityBreakdown.forEach(a => addPair(ws1, a.activity, `${a.count} Q`));
    ws1.addRow([]);

    if (rpt.qualityReport) {
      addSection(ws1, 'Data Quality');
      addPair(ws1, 'Quality Score', rpt.qualityReport.qualityScore + '%');
      addPair(ws1, 'Original Rows', rpt.qualityReport.originalRows);
      addPair(ws1, 'Clean Rows', rpt.qualityReport.cleanRows);
      addPair(ws1, 'Duplicates Removed', rpt.qualityReport.duplicatesRemoved);
      addPair(ws1, 'Empty Rows Removed', rpt.qualityReport.emptyRowsRemoved);
      addPair(ws1, 'Fields Trimmed', rpt.qualityReport.trimmedFields);
      addPair(ws1, 'Names Standardized', rpt.qualityReport.namesStandardized);
      ws1.addRow([]);
    }

    addSection(ws1, 'Team Roster');
    rpt.teamOverview.forEach(team => {
      const supRow = ws1.addRow([`Supervisor: ${team.supervisor}`, `${team.teamSize} DCs, ${team.totalQ} Q`]);
      supRow.getCell(1).font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF14141E' } };
      supRow.getCell(2).font = bFont(10);
      supRow.getCell(1).border = tBorder();
      supRow.getCell(2).border = tBorder();
      team.collectors.forEach(dc => addPair(ws1, `  ${dc.name}`, `Device: ${dc.deviceId} | ${dc.count} Q`));
    });

    ws1.columns = [{ width: 40 }, { width: 45 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report_summary.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }, [computeReportSummary, trackerData]);

  const exportReportPdf = useCallback(async () => {
    if (!computeReportSummary) return;
    const rpt = computeReportSummary;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = await drawPdfHeader(doc, 'Data Quality & Coverage Report', 'تقرير جودة البيانات والتغطية',
      `${rpt.totalQuestionnaires} Questionnaires  |  ${rpt.uniqueSites} Sites  |  ${rpt.uniqueHubs} Hubs`);
    const hasArabic = await loadArabicFont(doc);

    doc.setFontSize(10); doc.setTextColor(90, 95, 110);
    doc.text(`File: ${rpt.fileName}  |  Month: ${rpt.monthCoverage}  |  Generated: ${rpt.generatedDate}`, 14, y);
    y += 6;

    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('Coverage Summary', 14, y); y += 3;
    const covRows = [
      ['Questionnaires', String(rpt.totalQuestionnaires)],
      ['Unique Sites', String(rpt.uniqueSites)],
      ['Hubs', String(rpt.uniqueHubs)],
      ['States', String(rpt.uniqueStates)],
      ['Localities', String(rpt.uniqueLocalities)],
      ['Data Collectors', String(rpt.totalCollectors)],
      ['Supervisors', String(rpt.totalSupervisors)],
    ];
    y = styledAutoTable(doc, [['Metric', 'Value']], covRows, y, { fontSize: 9, useArabicFont: hasArabic });
    y += 5;

    if (trackerData && trackerData.matrix && trackerData.matrix.length > 0) {
      const { hubs: tH, matrix: tM, hubTotals: tHT, grandQ: tGQ, grandSites: tGS, grandCollectors: tGC } = trackerData;
      const pdmGrand = tM.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : 0), 0);
      const actualSitesGrand = tM.reduce((a: number, r: any) => {
        let np = 0; r.cells.forEach((c: any) => { if (!isPdmActivity(r.activity)) np += (c.questionnaires || 0); });
        return a + np;
      }, 0) + pdmGrand;

      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Tracker Grand Totals'); y = 18; }
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Tracker Grand Totals', 14, y); y += 3;
      const tRows = tH.map((hub: string, hi: number) => {
        const ht = tHT[hi];
        const hubPdm = tM.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) && r.cells[hi].questionnaires ? Math.ceil(r.cells[hi].questionnaires / 7) : 0), 0);
        return [hub, String(ht.sites), String(ht.questionnaires), String(hubPdm || '-'), String(ht.collectors)];
      });
      tRows.push(['Grand Total', String(tGS), String(tGQ), String(pdmGrand || '-'), String(tGC)]);
      tRows.push(['Total Sites (PDM/7)', String(actualSitesGrand), '', '', '']);
      y = styledAutoTable(doc, [['Hub', 'Sites', 'Actual', 'PDM Sites', 'DC']], tRows, y, { fontSize: 9, boldLastRow: true, useArabicFont: hasArabic });
      y += 5;
    }

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'Hub Coverage'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('Hub Coverage', 14, y); y += 3;
    const hubRows = rpt.hubBreakdown.map(h => [h.hub, String(h.sites), String(h.questionnaires)]);
    y = styledAutoTable(doc, [['Hub', 'Sites', 'Questionnaires']], hubRows, y, { fontSize: 9, useArabicFont: hasArabic });
    y += 5;

    if (y > 220) { doc.addPage(); addPageHeader(doc, 'Activity Coverage'); y = 18; }
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('Activity Coverage', 14, y); y += 3;
    const actRows = rpt.activityBreakdown.map(a => [a.activity, String(a.count)]);
    y = styledAutoTable(doc, [['Activity', 'Questionnaires']], actRows, y, { fontSize: 9, useArabicFont: hasArabic });
    y += 5;

    if (rpt.qualityReport) {
      if (y > 220) { doc.addPage(); addPageHeader(doc, 'Data Quality'); y = 18; }
      doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text('Data Quality Report', 14, y); y += 3;
      const qRows = [
        ['Quality Score', rpt.qualityReport.qualityScore + '%'],
        ['Original Rows', String(rpt.qualityReport.originalRows)],
        ['Clean Rows', String(rpt.qualityReport.cleanRows)],
        ['Duplicates Removed', String(rpt.qualityReport.duplicatesRemoved)],
        ['Empty Rows Removed', String(rpt.qualityReport.emptyRowsRemoved)],
        ['Fields Trimmed', String(rpt.qualityReport.trimmedFields)],
        ['Names Standardized', String(rpt.qualityReport.namesStandardized)],
      ];
      y = styledAutoTable(doc, [['Metric', 'Value']], qRows, y, { fontSize: 9, useArabicFont: hasArabic });
      y += 5;
    }

    doc.addPage(); addPageHeader(doc, 'Team Roster'); y = 18;
    doc.setFontSize(12); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
    doc.text('Team Roster', 14, y); y += 3;
    rpt.teamOverview.forEach(team => {
      if (y > 250) { doc.addPage(); addPageHeader(doc, 'Team Roster'); y = 18; }
      doc.setFontSize(10); doc.setTextColor(15, 32, 65); doc.setFont('helvetica', 'bold');
      doc.text(`${team.supervisor} (${team.teamSize} DCs, ${team.totalQ} Q)`, 14, y); y += 3;
      const dcRows = team.collectors.map(dc => [dc.name, dc.deviceId || '-', String(dc.count)]);
      y = styledAutoTable(doc, [['Data Collector', 'Device ID', 'Questionnaires']], dcRows, y, { fontSize: 8, useArabicFont: hasArabic });
      y += 4;
    });

    addAllFooters(doc);
    doc.save('report_summary.pdf');
  }, [computeReportSummary, trackerData]);

  const hubDrilldownTable = (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" />
                By Hub
                <Badge variant="outline" className="text-xs ml-1">Click to drill down</Badge>
              </CardTitle>
              <CardDescription>{hubDrilldown.length} unique hubs found — click a hub to see states, then activities, then localities</CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-hub-drilldown">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportHubDrilldownPdf}>
                  <FileDown className="h-4 w-4 mr-2" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportHubDrilldownExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportHubDrilldownFormattedExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Formatted Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-hub-drilldown">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-3 font-medium w-8">#</th>
                  <th className="text-left py-2 px-3 font-medium">Hub</th>
                  <th className="text-right py-2 px-3 font-medium">Sites</th>
                  <th className="text-right py-2 px-3 font-medium">Questionnaires</th>
                  <th className="text-right py-2 px-3 font-medium">%</th>
                  <th className="py-2 px-3 font-medium w-32">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {hubDrilldown.map((hub, hi) => {
                  const hubExpanded = drillExpandedHubs.has(hub.name);
                  return (
                    <Fragment key={hub.name}>
                      <tr
                        className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => toggleDrillHub(hub.name)}
                        data-testid={`row-hub-drill-${hi}`}
                      >
                        <td className="py-2 px-3 text-muted-foreground">{hi + 1}</td>
                        <td className="py-2 px-3 font-medium">
                          <div className="flex items-center gap-2">
                            {hubExpanded ? <ChevronUp className="h-4 w-4 text-primary flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            {hub.name}
                            <Badge variant="outline" className="text-[10px] px-1 py-0">{hub.states.length} states</Badge>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-600">{hub.sites}</Badge></td>
                        <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono">{hub.questionnaires}</Badge></td>
                        <td className="py-2 px-3 text-right text-muted-foreground">{hub.percentage.toFixed(1)}%</td>
                        <td className="py-2 px-3">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${Math.min(hub.percentage, 100)}%` }} />
                          </div>
                        </td>
                      </tr>
                      {hubExpanded && hub.states.map((state, si) => {
                        const stateKey = `${hub.name}::${state.name}`;
                        const stateExpanded = drillExpandedStates.has(stateKey);
                        return (
                          <Fragment key={stateKey}>
                            <tr
                              className="border-b hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors cursor-pointer bg-blue-50/30 dark:bg-blue-950/10"
                              onClick={() => toggleDrillState(stateKey)}
                              data-testid={`row-state-drill-${hi}-${si}`}
                            >
                              <td className="py-2 px-3" />
                              <td className="py-2 px-3 font-medium pl-10">
                                <div className="flex items-center gap-2">
                                  {stateExpanded ? <ChevronUp className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                                  <Globe className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                                  {state.name}
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">{state.activities.length} activities</Badge>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-600 text-xs">{state.sites}</Badge></td>
                              <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono text-xs">{state.questionnaires}</Badge></td>
                              <td className="py-2 px-3 text-right text-muted-foreground text-xs">{state.percentage.toFixed(1)}%</td>
                              <td className="py-2 px-3">
                                <div className="w-full bg-muted rounded-full h-1.5">
                                  <div className="bg-blue-500 rounded-full h-1.5 transition-all" style={{ width: `${Math.min(state.percentage, 100)}%` }} />
                                </div>
                              </td>
                            </tr>
                            {stateExpanded && state.activities.map((act, ai) => {
                              const actKey = `${stateKey}::${act.name}`;
                              const actExpanded = drillExpandedActivities.has(actKey);
                              return (
                                <Fragment key={actKey}>
                                  <tr
                                    className="border-b hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors cursor-pointer bg-emerald-50/30 dark:bg-emerald-950/10"
                                    onClick={() => toggleDrillActivity(actKey)}
                                    data-testid={`row-activity-drill-${hi}-${si}-${ai}`}
                                  >
                                    <td className="py-2 px-3" />
                                    <td className="py-2 px-3 font-medium pl-16">
                                      <div className="flex items-center gap-2">
                                        {actExpanded ? <ChevronUp className="h-3 w-3 text-emerald-600 flex-shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                                        <Activity className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                                        <span className="text-xs">{act.name}</span>
                                        <Badge variant="outline" className="text-[10px] px-1 py-0">{act.localities.length} loc.</Badge>
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-xs">{act.sites}</Badge></td>
                                    <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono text-xs">{act.questionnaires}</Badge></td>
                                    <td className="py-2 px-3 text-right text-muted-foreground text-xs">{act.percentage.toFixed(1)}%</td>
                                    <td className="py-2 px-3">
                                      <div className="w-full bg-muted rounded-full h-1">
                                        <div className="bg-emerald-500 rounded-full h-1 transition-all" style={{ width: `${Math.min(act.percentage, 100)}%` }} />
                                      </div>
                                    </td>
                                  </tr>
                                  {actExpanded && act.localities.map((loc, li) => {
                                    const locKey = `${actKey}::${loc.name}`;
                                    const locExpanded = drillExpandedLocalities.has(locKey);
                                    return (
                                      <Fragment key={locKey}>
                                        <tr
                                          className="border-b bg-amber-50/30 dark:bg-amber-950/10 cursor-pointer hover:bg-amber-100/40 dark:hover:bg-amber-950/20 transition-colors"
                                          onClick={() => toggleDrillLocality(locKey)}
                                          data-testid={`row-locality-drill-${hi}-${si}-${ai}-${li}`}
                                        >
                                          <td className="py-1.5 px-3" />
                                          <td className="py-1.5 px-3 pl-24">
                                            <div className="flex items-center gap-2 text-xs">
                                              {locExpanded ? <ChevronUp className="h-3 w-3 text-amber-600 flex-shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                                              <MapPin className="h-3 w-3 text-amber-600 flex-shrink-0" />
                                              {loc.name}
                                              {loc.siteNames.length > 0 && <Badge variant="outline" className="text-[10px] px-1 py-0">{loc.siteNames.length} sites</Badge>}
                                            </div>
                                          </td>
                                          <td className="py-1.5 px-3 text-right"><span className="font-mono text-xs text-muted-foreground">{loc.sites}</span></td>
                                          <td className="py-1.5 px-3 text-right"><span className="font-mono text-xs">{loc.questionnaires}</span></td>
                                          <td className="py-1.5 px-3 text-right text-muted-foreground text-xs">{loc.percentage.toFixed(1)}%</td>
                                          <td className="py-1.5 px-3">
                                            <div className="w-full bg-muted rounded-full h-1">
                                              <div className="bg-amber-500 rounded-full h-1 transition-all" style={{ width: `${Math.min(loc.percentage, 100)}%` }} />
                                            </div>
                                          </td>
                                        </tr>
                                        {locExpanded && loc.siteNames.map((siteName, sni) => (
                                          <tr
                                            key={`${locKey}::site-${sni}`}
                                            className="border-b bg-purple-50/30 dark:bg-purple-950/10"
                                            data-testid={`row-site-drill-${hi}-${si}-${ai}-${li}-${sni}`}
                                          >
                                            <td className="py-1 px-3" />
                                            <td className="py-1 px-3 pl-32" colSpan={5}>
                                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span className="w-4 text-center text-[10px] text-purple-500">{sni + 1}.</span>
                                                {siteName}
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </Fragment>
                                    );
                                  })}
                                </Fragment>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
                <tr className="bg-muted/50 font-semibold">
                  <td className="py-2 px-3" colSpan={2}>Total</td>
                  <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-700">{hubDrilldown.reduce((a, b) => a + b.sites, 0)}</Badge></td>
                  <td className="py-2 px-3 text-right"><Badge className="font-mono">{hubDrilldown.reduce((a, b) => a + b.questionnaires, 0)}</Badge></td>
                  <td className="py-2 px-3 text-right">100%</td>
                  <td className="py-2 px-3" />
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
  );

  const SummaryTableWithSites = ({ items, label, icon: Icon }: { items: SummaryWithSites[]; label: string; icon: React.ElementType }) => (
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
                <th className="text-right py-2 px-3 font-medium">Sites</th>
                <th className="text-right py-2 px-3 font-medium">Questionnaires</th>
                <th className="text-right py-2 px-3 font-medium">%</th>
                <th className="py-2 px-3 font-medium w-32">Distribution</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.name} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-${label.toLowerCase()}-${i}`}>
                  <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 px-3 font-medium">{item.name}</td>
                  <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-600">{item.sites}</Badge></td>
                  <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono">{item.questionnaires}</Badge></td>
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
                <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-700">{items.reduce((a, b) => a + b.sites, 0)}</Badge></td>
                <td className="py-2 px-3 text-right"><Badge className="font-mono">{items.reduce((a, b) => a + b.questionnaires, 0)}</Badge></td>
                <td className="py-2 px-3 text-right">100%</td>
                <td className="py-2 px-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  if (!isSuperAdmin()) {
    return <AccessDenied />;
  }

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
              <Button variant="outline" size="sm" className="gap-1.5" onClick={cleanExcelData} data-testid="button-clean">
                <Sparkles className="h-4 w-4" />
                Clean
              </Button>
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
                    Export All to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToPdf} data-testid="button-export-pdf">
                    <FileDown className="h-4 w-4 mr-2" />
                    Export Full PDF (with Collector Details)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportTrackerToExcel} data-testid="button-export-tracker-menu">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Export Tracker to Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportCoverageTrackerExcel(filteredData, 'coverage_tracker.xlsx', currentSessionName)} data-testid="button-export-coverage-tracker">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Coverage Tracker (Hub/State/Collector)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openEmailDialog} data-testid="button-send-report">
                <Mail className="h-4 w-4" />
                Send Report
              </Button>
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

      {savedSessions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-5 w-5 text-primary" />
              Saved Data Files ({savedSessions.length})
            </CardTitle>
            <CardDescription>Previously uploaded and saved questionnaire data files</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left py-2.5 px-4 font-medium">#</th>
                    <th className="text-left py-2.5 px-4 font-medium">Session Name</th>
                    <th className="text-left py-2.5 px-4 font-medium">File Name</th>
                    <th className="text-left py-2.5 px-4 font-medium">Month / Date Saved</th>
                    <th className="text-center py-2.5 px-4 font-medium">Rows</th>
                    <th className="text-center py-2.5 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...savedSessions].sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()).map((session, idx) => {
                    const savedDate = new Date(session.savedAt);
                    const isActive = currentSessionName === session.name;
                    return (
                      <tr
                        key={session.id}
                        className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors ${isActive ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                        data-testid={`saved-session-row-${session.id}`}
                      >
                        <td className="py-2.5 px-4 text-muted-foreground">{idx + 1}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{session.name}</span>
                            {isActive && <Badge variant="default" className="text-[10px] px-1.5 py-0">Active</Badge>}
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]">{session.fileName}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-medium">{format(savedDate, 'MMMM yyyy')}</span>
                            <span className="text-xs text-muted-foreground">{format(savedDate, 'MMM d, yyyy - h:mm a')}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <Badge variant="outline">{session.rowCount.toLocaleString()}</Badge>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button size="sm" variant={isActive ? "secondary" : "outline"} className="gap-1 h-7 text-xs" onClick={() => loadSession(session)} data-testid={`button-load-inline-${session.id}`}>
                              <FolderOpen className="h-3 w-3" />
                              {isActive ? 'Loaded' : 'Load'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteSession(session.id)} data-testid={`button-delete-inline-${session.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

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
            <TabsList className="grid grid-cols-4 sm:grid-cols-9 w-full">
              <TabsTrigger value="overview" data-testid="tab-overview" className="gap-1">
                <BarChart3 className="h-3 w-3 hidden sm:inline" />Overview
              </TabsTrigger>
              <TabsTrigger value="hub" data-testid="tab-hub" className="gap-1">
                Hub <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{hubSummary.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="state" data-testid="tab-state" className="gap-1">
                State <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{stateSummary.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="locality" data-testid="tab-locality" className="gap-1">
                Locality <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{localitySummary.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="sites" data-testid="tab-sites" className="gap-1">
                Sites <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{siteSummary.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity" className="gap-1">
                Activity <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{activityBreakdown.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="collector" data-testid="tab-collector" className="gap-1">
                Collector <Badge variant="secondary" className="h-4 px-1 text-[10px] font-mono">{collectorDetails.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="tracker" data-testid="tab-tracker" className="gap-1">
                <Layers className="h-3 w-3 hidden sm:inline" />Tracker
              </TabsTrigger>
              <TabsTrigger value="reports" data-testid="tab-reports" className="gap-1">
                <ClipboardList className="h-3 w-3 hidden sm:inline" />Reports
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-primary" /> Questionnaires by Hub</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={hubSummary.slice(0, 10).map(h => ({ name: h.name.length > 12 ? h.name.slice(0, 12) + '...' : h.name, Sites: h.sites, Questionnaires: h.questionnaires }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Bar dataKey="Sites" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Questionnaires" fill="#16a34a" radius={[4, 4, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><PieChart className="h-4 w-4 text-primary" /> Distribution by Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <RechartsPie>
                        <Pie
                          data={activityBreakdown.map(a => ({ name: a.name, value: a.questionnaireCount }))}
                          cx="50%" cy="50%" outerRadius={90} innerRadius={40}
                          dataKey="value" nameKey="name" paddingAngle={2}
                          label={({ name, percent }) => `${name.length > 10 ? name.slice(0, 10) + '..' : name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={{ strokeWidth: 1 }}
                        >
                          {activityBreakdown.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><MapPin className="h-4 w-4 text-primary" /> Sites & Questionnaires by State</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stateSummary.slice(0, 10).map(s => ({ name: s.name.length > 12 ? s.name.slice(0, 12) + '...' : s.name, Sites: s.sites, Questionnaires: s.questionnaires }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Bar dataKey="Sites" fill="#0891b2" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Questionnaires" fill="#ea580c" radius={[4, 4, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" /> Top 10 Data Collectors</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={collectorDetails.slice(0, 10).map(c => ({ name: c.name.length > 12 ? c.name.slice(0, 12) + '...' : c.name, Questionnaires: c.count }))} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Bar dataKey="Questionnaires" fill="#9333ea" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-5 w-5 text-primary" />
                    By Activity
                  </CardTitle>
                  <CardDescription>{activityBreakdown.length} activities, {activityBreakdown.reduce((a, b) => a + b.questionnaireCount, 0)} total questionnaires</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="table-activity-overview">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium w-8"></th>
                          <th className="text-left py-2 px-3 font-medium">Activity</th>
                          <th className="text-right py-2 px-3 font-medium">Sites</th>
                          <th className="text-right py-2 px-3 font-medium">Questionnaires</th>
                          <th className="text-right py-2 px-3 font-medium">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activityBreakdown.map((item) => (
                          <Fragment key={item.name}>
                            <tr
                              className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                              onClick={() => toggleExpand(item.name)}
                              data-testid={`row-activity-${item.name}`}
                            >
                              <td className="py-2 px-3">
                                {expandedRows.has(item.name) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </td>
                              <td className="py-2 px-3 font-medium">{item.name}</td>
                              <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-600">{item.siteCount}</Badge></td>
                              <td className="py-2 px-3 text-right"><Badge variant="secondary" className="font-mono">{item.questionnaireCount}</Badge></td>
                              <td className="py-2 px-3 text-right text-muted-foreground">{item.percentage.toFixed(1)}%</td>
                            </tr>
                            {expandedRows.has(item.name) && item.siteList.map(site => (
                              <tr key={`${item.name}-${site.name}`} className="border-b bg-muted/20">
                                <td className="py-1.5 px-3" />
                                <td className="py-1.5 px-3 pl-8 text-muted-foreground flex items-center gap-2">
                                  <MapPin className="h-3 w-3" />
                                  {site.name}
                                </td>
                                <td className="py-1.5 px-3" />
                                <td className="py-1.5 px-3 text-right"><Badge variant="outline" className="font-mono text-xs">{site.count}</Badge></td>
                                <td className="py-1.5 px-3 text-right text-xs text-muted-foreground">{site.percentage.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 px-3" />
                          <td className="py-2 px-3">Total</td>
                          <td className="py-2 px-3 text-right"><Badge variant="outline" className="font-mono text-blue-700">{activityBreakdown.reduce((a, b) => a + b.siteCount, 0)}</Badge></td>
                          <td className="py-2 px-3 text-right"><Badge className="font-mono">{activityBreakdown.reduce((a, b) => a + b.questionnaireCount, 0)}</Badge></td>
                          <td className="py-2 px-3 text-right">100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hub" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Hub Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={hubSummary.map(h => ({ name: h.name.length > 14 ? h.name.slice(0, 14) + '..' : h.name, Sites: h.sites, Questionnaires: h.questionnaires }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={65} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Bar dataKey="Sites" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Questionnaires" fill="#16a34a" radius={[4, 4, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                    <ResponsiveContainer width="100%" height={260}>
                      <RechartsPie>
                        <Pie data={hubSummary.map(h => ({ name: h.name, value: h.questionnaires }))} cx="50%" cy="50%" outerRadius={90} innerRadius={35} dataKey="value" paddingAngle={2}>
                          {hubSummary.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11 }} />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              {hubDrilldownTable}
            </TabsContent>

            <TabsContent value="state" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> State Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ResponsiveContainer width="100%" height={Math.max(200, stateSummary.length * 28)}>
                      <BarChart data={stateSummary.map(s => ({ name: s.name.length > 14 ? s.name.slice(0, 14) + '..' : s.name, Sites: s.sites, Questionnaires: s.questionnaires }))} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Bar dataKey="Sites" fill="#0891b2" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="Questionnaires" fill="#ea580c" radius={[0, 4, 4, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                    <ResponsiveContainer width="100%" height={260}>
                      <RechartsPie>
                        <Pie data={stateSummary.map(s => ({ name: s.name, value: s.questionnaires }))} cx="50%" cy="50%" outerRadius={90} innerRadius={35} dataKey="value" paddingAngle={2}>
                          {stateSummary.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11 }} />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <SummaryTableWithSites items={stateSummary} label="State" icon={MapPin} />
            </TabsContent>

            <TabsContent value="locality" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Top 15 Localities</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={localitySummary.slice(0, 15).map(l => ({ name: l.name.length > 14 ? l.name.slice(0, 14) + '..' : l.name, Sites: l.sites, Questionnaires: l.questionnaires }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Bar dataKey="Sites" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Questionnaires" fill="#0d9488" radius={[4, 4, 0, 0]} />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <SummaryTableWithSites items={localitySummary} label="Locality" icon={MapPin} />
            </TabsContent>

            <TabsContent value="sites" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Top 15 Sites by Questionnaires</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={siteSummary.slice(0, 15).map(s => ({ name: s.name.length > 14 ? s.name.slice(0, 14) + '..' : s.name, Questionnaires: s.questionnaires }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Bar dataKey="Questionnaires" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <SummaryTableWithSites items={siteSummary} label="Site" icon={MapPin} />
            </TabsContent>

            <TabsContent value="activity" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Activity Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={activityBreakdown.map(a => ({ name: a.name.length > 14 ? a.name.slice(0, 14) + '..' : a.name, Sites: a.siteCount, Questionnaires: a.questionnaireCount, Collectors: a.byCollector.length }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={65} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Bar dataKey="Sites" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Questionnaires" fill="#16a34a" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Collectors" fill="#9333ea" radius={[4, 4, 0, 0]} />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="h-5 w-5 text-primary" />
                    By Activity &mdash; Full Breakdown
                  </CardTitle>
                  <CardDescription>{activityBreakdown.length} activities, {activityBreakdown.reduce((a, b) => a + b.siteCount, 0)} total sites, {activityBreakdown.reduce((a, b) => a + b.questionnaireCount, 0)} questionnaires</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {activityBreakdown.map((item) => (
                      <div key={item.name} className="border rounded-lg">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                          onClick={() => toggleExpand(`act-detail-${item.name}`)}
                          data-testid={`button-activity-expand-${item.name}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Activity className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="font-medium truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-blue-600 font-mono">{item.siteCount} sites</Badge>
                            <Badge variant="secondary" className="font-mono">{item.questionnaireCount} Q</Badge>
                            <span className="text-xs text-muted-foreground">{item.percentage.toFixed(1)}%</span>
                            {expandedRows.has(`act-detail-${item.name}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>
                        {expandedRows.has(`act-detail-${item.name}`) && (
                          <div className="border-t px-3 pb-3 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Building2 className="h-3 w-3" /> BY HUB</h4>
                                <table className="w-full text-sm">
                                  <thead><tr className="border-b"><th className="text-left py-1 px-2 text-xs font-medium">Hub</th><th className="text-right py-1 px-2 text-xs font-medium">Sites</th><th className="text-right py-1 px-2 text-xs font-medium">Q</th></tr></thead>
                                  <tbody>
                                    {item.byHub.map(h => (
                                      <tr key={h.name} className="border-b last:border-0">
                                        <td className="py-1 px-2 text-sm">{h.name}</td>
                                        <td className="py-1 px-2 text-right text-xs text-blue-600">{h.sites}</td>
                                        <td className="py-1 px-2 text-right"><Badge variant="outline" className="font-mono text-xs">{h.count}</Badge></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Globe className="h-3 w-3" /> BY STATE</h4>
                                <table className="w-full text-sm">
                                  <thead><tr className="border-b"><th className="text-left py-1 px-2 text-xs font-medium">State</th><th className="text-right py-1 px-2 text-xs font-medium">Sites</th><th className="text-right py-1 px-2 text-xs font-medium">Q</th></tr></thead>
                                  <tbody>
                                    {item.byState.map(s => (
                                      <tr key={s.name} className="border-b last:border-0">
                                        <td className="py-1 px-2 text-sm">{s.name}</td>
                                        <td className="py-1 px-2 text-right text-xs text-blue-600">{s.sites}</td>
                                        <td className="py-1 px-2 text-right"><Badge variant="outline" className="font-mono text-xs">{s.count}</Badge></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><MapPin className="h-3 w-3" /> BY LOCALITY</h4>
                                <table className="w-full text-sm">
                                  <thead><tr className="border-b"><th className="text-left py-1 px-2 text-xs font-medium">Locality</th><th className="text-right py-1 px-2 text-xs font-medium">Sites</th><th className="text-right py-1 px-2 text-xs font-medium">Q</th></tr></thead>
                                  <tbody>
                                    {item.byLocality.map(l => (
                                      <tr key={l.name} className="border-b last:border-0">
                                        <td className="py-1 px-2 text-sm">{l.name}</td>
                                        <td className="py-1 px-2 text-right text-xs text-blue-600">{l.sites}</td>
                                        <td className="py-1 px-2 text-right"><Badge variant="outline" className="font-mono text-xs">{l.count}</Badge></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Users className="h-3 w-3" /> BY DATA COLLECTOR</h4>
                                <table className="w-full text-sm">
                                  <thead><tr className="border-b"><th className="text-left py-1 px-2 text-xs font-medium">Collector</th><th className="text-right py-1 px-2 text-xs font-medium">Q</th></tr></thead>
                                  <tbody>
                                    {item.byCollector.map(c => (
                                      <tr key={c.name} className="border-b last:border-0">
                                        <td className="py-1 px-2 text-sm">
                                          <span>{c.name}</span>
                                          {c.deviceId && <span className="ml-1 text-xs text-muted-foreground font-mono">({c.deviceId})</span>}
                                        </td>
                                        <td className="py-1 px-2 text-right"><Badge variant="outline" className="font-mono text-xs">{c.count}</Badge></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><MapPin className="h-3 w-3" /> SITES ({item.siteList.length})</h4>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
                                {item.siteList.map(site => (
                                  <div key={site.name} className="flex items-center justify-between text-xs px-2 py-1 bg-muted/30 rounded">
                                    <span className="truncate">{site.name}</span>
                                    <Badge variant="outline" className="ml-1 font-mono text-xs flex-shrink-0">{site.count}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="collector" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-4 w-4 text-primary" /> Top 15 Data Collectors</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.min(400, Math.max(200, Math.min(collectorDetails.length, 15) * 26))}>
                    <BarChart data={collectorDetails.slice(0, 15).map(c => ({ name: c.name.length > 16 ? c.name.slice(0, 16) + '..' : c.name, Questionnaires: c.count }))} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
                      <RechartsTooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                      <Bar dataKey="Questionnaires" fill="#9333ea" radius={[0, 4, 4, 0]}>
                        {collectorDetails.slice(0, 15).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-primary" />
                    By Data Collector
                  </CardTitle>
                  <CardDescription>{collectorDetails.length} unique data collectors, {collectorDetails.reduce((a, b) => a + b.count, 0)} total questionnaires</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {collectorDetails.map((item, i) => {
                      const expandKey = `coll-${item.deviceId || item.name}`;
                      return (
                      <div key={item.deviceId || item.name} className="border rounded-lg">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                          onClick={() => toggleExpand(expandKey)}
                          data-testid={`button-collector-expand-${i}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs text-muted-foreground w-5 text-right flex-shrink-0">{i + 1}</span>
                            <div className="min-w-0">
                              <span className="font-medium block truncate">{item.name}</span>
                              <div className="flex items-center gap-2 flex-wrap">
                                {item.deviceId && <span className="text-xs text-muted-foreground font-mono">{item.deviceId}</span>}
                                {item.nameVariants.length > 0 && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-300">{item.nameVariants.length} name variants</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                            <Badge variant="outline" className="text-xs">{item.activities.length} activities</Badge>
                            <Badge variant="outline" className="text-xs">{item.localities.length} localities</Badge>
                            <Badge variant="secondary" className="font-mono">{item.count}</Badge>
                            <span className="text-xs text-muted-foreground">{item.percentage.toFixed(1)}%</span>
                            {expandedRows.has(expandKey) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>
                        {expandedRows.has(expandKey) && (
                          <div className="border-t px-3 pb-3 space-y-3 mt-0">
                            {item.nameVariants.length > 0 && (
                              <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
                                <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5 flex items-center gap-1">
                                  <Users className="h-3 w-3" /> NAME VARIANTS (same device)
                                </h4>
                                <div className="space-y-0.5">
                                  {item.nameVariants.map((v, vi) => (
                                    <div key={vi} className="flex items-center justify-between text-sm px-2 py-0.5">
                                      <span className={`truncate ${vi === 0 ? 'font-medium text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}>
                                        {vi === 0 ? '★ ' : ''}{v.name}
                                      </span>
                                      <Badge variant="outline" className="font-mono text-xs ml-1">{v.count}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                                  <Activity className="h-3 w-3" /> ACTIVITIES
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">{item.activities.reduce((s, a) => s + a.count, 0)} total</Badge>
                                </h4>
                                <div className="space-y-1">
                                  {item.activities.map(a => (
                                    <div key={a.name} className="flex items-center justify-between text-sm px-2 py-1 bg-muted/30 rounded">
                                      <span className="truncate">{a.name}</span>
                                      <Badge variant="outline" className="font-mono text-xs ml-1">{a.count}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><MapPin className="h-3 w-3" /> LOCALITIES</h4>
                                <div className="space-y-1">
                                  {item.localities.map(l => (
                                    <div key={l.name} className="flex items-center justify-between text-sm px-2 py-1 bg-muted/30 rounded">
                                      <span className="truncate">{l.name}</span>
                                      <Badge variant="outline" className="font-mono text-xs ml-1">{l.count}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {item.hubs.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Building2 className="h-3 w-3" /> HUBS</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {item.hubs.map(h => <Badge key={h} variant="outline" className="text-xs">{h}</Badge>)}
                                  </div>
                                </div>
                              )}
                              {item.states.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Globe className="h-3 w-3" /> STATES</h4>
                                  <div className="flex flex-wrap gap-1">
                                    {item.states.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex justify-end pt-1">
                              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => exportCollectorPdf(item)} data-testid={`button-export-collector-pdf-${i}`}>
                                <FileDown className="h-3 w-3" />
                                Export PDF
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tracker" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Layers className="h-5 w-5 text-primary" />
                        Tracker - Activity by Hub
                      </CardTitle>
                      <CardDescription>Cross-tab: Activities (rows) x Hubs (columns) with Sites, Questionnaires & Collectors</CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-tracker">
                          <Download className="h-4 w-4" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={exportMainTrackerPdf}>
                          <FileDown className="h-4 w-4 mr-2" />
                          PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={exportTrackerToExcel}>
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Excel
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={exportMainTrackerFormattedExcel}>
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Formatted Excel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse" data-testid="table-tracker">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left py-2 px-3 font-medium border min-w-[200px] sticky left-0 bg-muted/50 z-10">Activity</th>
                          {trackerData.hubs.map(hub => (
                            <th key={hub} className="text-center py-2 px-3 font-medium border min-w-[180px]" colSpan={4}>{hub}</th>
                          ))}
                          <th className="text-center py-2 px-3 font-medium border min-w-[180px] bg-primary/10" colSpan={4}>Grand Total</th>
                        </tr>
                        <tr className="bg-muted/30">
                          <th className="text-left py-1 px-3 text-xs font-medium border sticky left-0 bg-muted/30 z-10"></th>
                          {trackerData.hubs.map(hub => (
                            <Fragment key={hub}>
                              <th className="text-center py-1 px-2 text-xs font-medium border text-blue-600">Sites</th>
                              <th className="text-center py-1 px-2 text-xs font-medium border text-green-600">Actual</th>
                              <th className="text-center py-1 px-2 text-xs font-medium border text-amber-600">PDM Sites</th>
                              <th className="text-center py-1 px-2 text-xs font-medium border text-purple-600">DC</th>
                            </Fragment>
                          ))}
                          <th className="text-center py-1 px-2 text-xs font-medium border text-blue-600 bg-primary/5">Sites</th>
                          <th className="text-center py-1 px-2 text-xs font-medium border text-green-600 bg-primary/5">Actual</th>
                          <th className="text-center py-1 px-2 text-xs font-medium border text-amber-600 bg-primary/5">PDM Sites</th>
                          <th className="text-center py-1 px-2 text-xs font-medium border text-purple-600 bg-primary/5">DC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trackerData.matrix.map((row, i) => (
                          <tr key={row.activity} className={i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}>
                            <td className={`py-2 px-3 font-medium border sticky left-0 z-10 ${i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}`}>{row.activity}</td>
                            {row.cells.map((cell, ci) => (
                              <Fragment key={trackerData.hubs[ci]}>
                                <td className="text-center py-2 px-2 border text-blue-600 font-mono text-xs">{cell.sites || '-'}</td>
                                <td className="text-center py-2 px-2 border text-green-600 font-mono text-xs">{cell.questionnaires || '-'}</td>
                                <td className="text-center py-2 px-2 border text-amber-600 font-mono text-xs">{isPdmActivity(row.activity) && cell.questionnaires ? Math.ceil(cell.questionnaires / 7) : '-'}</td>
                                <td className="text-center py-2 px-2 border text-purple-600 font-mono text-xs">{cell.collectors || '-'}</td>
                              </Fragment>
                            ))}
                            <td className="text-center py-2 px-2 border font-mono text-xs text-blue-700 font-semibold bg-primary/5">{row.totalSites}</td>
                            <td className="text-center py-2 px-2 border font-mono text-xs text-green-700 font-semibold bg-primary/5">{row.totalQ}</td>
                            <td className="text-center py-2 px-2 border font-mono text-xs text-amber-700 font-semibold bg-primary/5">{isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : '-'}</td>
                            <td className="text-center py-2 px-2 border font-mono text-xs text-purple-700 font-semibold bg-primary/5">{row.totalCollectors}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 px-3 border sticky left-0 bg-muted/50 z-10">Grand Total</td>
                          {trackerData.hubTotals.map((ht, hi) => (
                            <Fragment key={trackerData.hubs[hi]}>
                              <td className="text-center py-2 px-2 border text-blue-700 font-mono text-xs">{ht.sites}</td>
                              <td className="text-center py-2 px-2 border text-green-700 font-mono text-xs">{ht.questionnaires}</td>
                              <td className="text-center py-2 px-2 border text-amber-700 font-mono text-xs">{trackerData.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? (r.cells[hi].questionnaires ? Math.ceil(r.cells[hi].questionnaires / 7) : 0) : r.cells[hi].questionnaires), 0) || '-'}</td>
                              <td className="text-center py-2 px-2 border text-purple-700 font-mono text-xs">{ht.collectors}</td>
                            </Fragment>
                          ))}
                          <td className="text-center py-2 px-2 border text-blue-700 font-mono text-xs bg-primary/10">{trackerData.grandSites}</td>
                          <td className="text-center py-2 px-2 border text-green-700 font-mono text-xs bg-primary/10">{trackerData.grandQ}</td>
                          <td className="text-center py-2 px-2 border text-amber-700 font-mono text-xs bg-primary/10">{trackerData.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0) || '-'}</td>
                          <td className="text-center py-2 px-2 border text-purple-700 font-mono text-xs bg-primary/10">{trackerData.grandCollectors}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {trackerData.stateBreakdown.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Globe className="h-5 w-5 text-primary" />
                          Tracker - Activity by State
                        </CardTitle>
                        <CardDescription>Activity breakdown per state</CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-act-state">
                            <Download className="h-4 w-4" />
                            Export
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={exportActivityByStatePdf}>
                            <FileDown className="h-4 w-4 mr-2" />
                            PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={exportActivityByStateExcel}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={exportActivityByStateFormattedExcel}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Formatted Excel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {trackerData.stateBreakdown.map(sb => (
                        <div key={sb.state} className="border rounded-lg">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                            onClick={() => toggleExpand(`tracker-state-${sb.state}`)}
                            data-testid={`button-tracker-state-${sb.state}`}
                          >
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primary" />
                              <span className="font-medium">{sb.state}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="font-mono">{sb.totalQ} Q</Badge>
                              {expandedRows.has(`tracker-state-${sb.state}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </div>
                          </button>
                          {expandedRows.has(`tracker-state-${sb.state}`) && (
                            <div className="border-t px-3 pb-3">
                              <table className="w-full text-sm mt-2">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left py-1.5 px-2 font-medium text-xs">Activity</th>
                                    <th className="text-right py-1.5 px-2 font-medium text-xs">Sites</th>
                                    <th className="text-right py-1.5 px-2 font-medium text-xs">Questionnaires</th>
                                    <th className="text-right py-1.5 px-2 font-medium text-xs text-amber-600">PDM Sites</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sb.activities.filter(a => a.questionnaires > 0).map(a => (
                                    <tr key={a.activity} className="border-b">
                                      <td className="py-1.5 px-2">{a.activity}</td>
                                      <td className="py-1.5 px-2 text-right text-blue-600 text-xs">{a.sites}</td>
                                      <td className="py-1.5 px-2 text-right"><Badge variant="outline" className="font-mono text-xs">{a.questionnaires}</Badge></td>
                                      <td className="py-1.5 px-2 text-right text-amber-600 font-mono text-xs">{isPdmActivity(a.activity) ? Math.ceil(a.questionnaires / 7) : '-'}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-muted/50 font-semibold">
                                    <td className="py-1.5 px-2">Total</td>
                                    <td className="py-1.5 px-2 text-right text-blue-700 text-xs">{sb.activities.filter(a => a.questionnaires > 0).reduce((s, a) => s + a.sites, 0)}</td>
                                    <td className="py-1.5 px-2 text-right"><Badge className="font-mono text-xs">{sb.totalQ}</Badge></td>
                                    <td className="py-1.5 px-2 text-right text-amber-700 font-mono text-xs">{(() => { const total = sb.activities.filter(a => a.questionnaires > 0).reduce((s, a) => s + (isPdmActivity(a.activity) ? Math.ceil(a.questionnaires / 7) : a.questionnaires), 0); return total || '-'; })()}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {trackerData.hubTrackers.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Building2 className="h-5 w-5 text-primary" />
                          Tracker per Hub
                        </CardTitle>
                        <CardDescription>Each hub: Activity (rows) x State (columns) with Sites, Questionnaires & Collectors</CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-hub-tracker">
                            <Download className="h-4 w-4" />
                            Export
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={exportTrackerPerHubPdf}>
                            <FileDown className="h-4 w-4 mr-2" />
                            PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={exportTrackerPerHubExcel}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={exportTrackerPerHubFormattedExcel}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Formatted Excel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {trackerData.hubTrackers.map(ht => (
                      <div key={ht.hub} className="border rounded-lg">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                          onClick={() => toggleExpand(`hub-tracker-${ht.hub}`)}
                          data-testid={`button-hub-tracker-${ht.hub}`}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-blue-600" />
                            <span className="font-semibold">{ht.hub}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono text-blue-600">{ht.grandSites} Sites</Badge>
                            <Badge variant="secondary" className="font-mono">{ht.grandQ} Q</Badge>
                            <Badge variant="outline" className="font-mono text-purple-600">{ht.grandCollectors} DC</Badge>
                            {expandedRows.has(`hub-tracker-${ht.hub}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>
                        {expandedRows.has(`hub-tracker-${ht.hub}`) && (
                          <div className="border-t overflow-x-auto">
                            <table className="w-full text-sm border-collapse" data-testid={`table-hub-tracker-${ht.hub}`}>
                              <thead>
                                <tr className="bg-muted/50">
                                  <th className="text-left py-2 px-3 font-medium border min-w-[180px] sticky left-0 bg-muted/50 z-10">Activity</th>
                                  {ht.states.map(st => (
                                    <th key={st} className="text-center py-2 px-3 font-medium border min-w-[160px]" colSpan={4}>{st}</th>
                                  ))}
                                  <th className="text-center py-2 px-3 font-medium border min-w-[160px] bg-primary/10" colSpan={4}>Total</th>
                                </tr>
                                <tr className="bg-muted/30">
                                  <th className="border sticky left-0 bg-muted/30 z-10"></th>
                                  {ht.states.map(st => (
                                    <Fragment key={st}>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-blue-600">Sites</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-green-600">Actual</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-amber-600">PDM</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-purple-600">DC</th>
                                    </Fragment>
                                  ))}
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-blue-600 bg-primary/5">Sites</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-green-600 bg-primary/5">Actual</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-amber-600 bg-primary/5">PDM</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-purple-600 bg-primary/5">DC</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ht.matrix.map((row, i) => (
                                  <tr key={row.activity} className={i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}>
                                    <td className={`py-1.5 px-3 font-medium border sticky left-0 z-10 text-sm ${i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}`}>{row.activity}</td>
                                    {row.cells.map((cell, ci) => (
                                      <Fragment key={ht.states[ci]}>
                                        <td className="text-center py-1.5 px-1.5 border text-blue-600 font-mono text-xs">{cell.sites || '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-green-600 font-mono text-xs">{cell.questionnaires || '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-amber-600 font-mono text-xs">{isPdmActivity(row.activity) && cell.questionnaires ? Math.ceil(cell.questionnaires / 7) : '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-purple-600 font-mono text-xs">{cell.collectors || '-'}</td>
                                      </Fragment>
                                    ))}
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-blue-700 font-semibold bg-primary/5">{row.totalSites}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-green-700 font-semibold bg-primary/5">{row.totalQ}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-amber-700 font-semibold bg-primary/5">{isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : '-'}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-purple-700 font-semibold bg-primary/5">{row.totalCollectors}</td>
                                  </tr>
                                ))}
                                <tr className="bg-muted/50 font-semibold">
                                  <td className="py-2 px-3 border sticky left-0 bg-muted/50 z-10">Total</td>
                                  {ht.colTotals.map((ct, ci) => (
                                    <Fragment key={ht.states[ci]}>
                                      <td className="text-center py-2 px-1.5 border text-blue-700 font-mono text-xs">{ct.sites}</td>
                                      <td className="text-center py-2 px-1.5 border text-green-700 font-mono text-xs">{ct.questionnaires}</td>
                                      <td className="text-center py-2 px-1.5 border text-amber-700 font-mono text-xs">{(() => { const total = ht.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? (r.cells[ci].questionnaires ? Math.ceil(r.cells[ci].questionnaires / 7) : 0) : r.cells[ci].questionnaires), 0); return total || '-'; })()}</td>
                                      <td className="text-center py-2 px-1.5 border text-purple-700 font-mono text-xs">{ct.collectors}</td>
                                    </Fragment>
                                  ))}
                                  <td className="text-center py-2 px-1.5 border text-blue-700 font-mono text-xs bg-primary/10">{ht.grandSites}</td>
                                  <td className="text-center py-2 px-1.5 border text-green-700 font-mono text-xs bg-primary/10">{ht.grandQ}</td>
                                  <td className="text-center py-2 px-1.5 border text-amber-700 font-mono text-xs bg-primary/10">{(() => { const total = ht.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0); return total || '-'; })()}</td>
                                  <td className="text-center py-2 px-1.5 border text-purple-700 font-mono text-xs bg-primary/10">{ht.grandCollectors}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {trackerData.stateTrackers.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <MapPin className="h-5 w-5 text-primary" />
                          Tracker per State
                        </CardTitle>
                        <CardDescription>Each state: Activity (rows) x Locality (columns) with Sites, Questionnaires & Collectors</CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-state-tracker">
                            <Download className="h-4 w-4" />
                            Export
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={exportTrackerPerStatePdf}>
                            <FileDown className="h-4 w-4 mr-2" />
                            PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={exportTrackerPerStateExcel}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={exportTrackerPerStateFormattedExcel}>
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Formatted Excel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {trackerData.stateTrackers.map(st => (
                      <div key={st.state} className="border rounded-lg">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                          onClick={() => toggleExpand(`state-tracker-${st.state}`)}
                          data-testid={`button-state-tracker-${st.state}`}
                        >
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-orange-600" />
                            <span className="font-semibold">{st.state}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono text-blue-600">{st.grandSites} Sites</Badge>
                            <Badge variant="secondary" className="font-mono">{st.grandQ} Q</Badge>
                            <Badge variant="outline" className="font-mono text-purple-600">{st.grandCollectors} DC</Badge>
                            {expandedRows.has(`state-tracker-${st.state}`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>
                        {expandedRows.has(`state-tracker-${st.state}`) && (
                          <div className="border-t overflow-x-auto">
                            <table className="w-full text-sm border-collapse" data-testid={`table-state-tracker-${st.state}`}>
                              <thead>
                                <tr className="bg-muted/50">
                                  <th className="text-left py-2 px-3 font-medium border min-w-[180px] sticky left-0 bg-muted/50 z-10">Activity</th>
                                  {st.localities.map(loc => (
                                    <th key={loc} className="text-center py-2 px-3 font-medium border min-w-[160px]" colSpan={4}>{loc}</th>
                                  ))}
                                  <th className="text-center py-2 px-3 font-medium border min-w-[160px] bg-primary/10" colSpan={4}>Total</th>
                                </tr>
                                <tr className="bg-muted/30">
                                  <th className="border sticky left-0 bg-muted/30 z-10"></th>
                                  {st.localities.map(loc => (
                                    <Fragment key={loc}>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-blue-600">Sites</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-green-600">Actual</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-amber-600">PDM</th>
                                      <th className="text-center py-1 px-1.5 text-xs font-medium border text-purple-600">DC</th>
                                    </Fragment>
                                  ))}
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-blue-600 bg-primary/5">Sites</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-green-600 bg-primary/5">Actual</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-amber-600 bg-primary/5">PDM</th>
                                  <th className="text-center py-1 px-1.5 text-xs font-medium border text-purple-600 bg-primary/5">DC</th>
                                </tr>
                              </thead>
                              <tbody>
                                {st.matrix.map((row, i) => (
                                  <tr key={row.activity} className={i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}>
                                    <td className={`py-1.5 px-3 font-medium border sticky left-0 z-10 text-sm ${i % 2 === 0 ? 'bg-white dark:bg-background' : 'bg-muted/20'}`}>{row.activity}</td>
                                    {row.cells.map((cell, ci) => (
                                      <Fragment key={st.localities[ci]}>
                                        <td className="text-center py-1.5 px-1.5 border text-blue-600 font-mono text-xs">{cell.sites || '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-green-600 font-mono text-xs">{cell.questionnaires || '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-amber-600 font-mono text-xs">{isPdmActivity(row.activity) && cell.questionnaires ? Math.ceil(cell.questionnaires / 7) : '-'}</td>
                                        <td className="text-center py-1.5 px-1.5 border text-purple-600 font-mono text-xs">{cell.collectors || '-'}</td>
                                      </Fragment>
                                    ))}
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-blue-700 font-semibold bg-primary/5">{row.totalSites}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-green-700 font-semibold bg-primary/5">{row.totalQ}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-amber-700 font-semibold bg-primary/5">{isPdmActivity(row.activity) ? Math.ceil(row.totalQ / 7) : '-'}</td>
                                    <td className="text-center py-1.5 px-1.5 border font-mono text-xs text-purple-700 font-semibold bg-primary/5">{row.totalCollectors}</td>
                                  </tr>
                                ))}
                                <tr className="bg-muted/50 font-semibold">
                                  <td className="py-2 px-3 border sticky left-0 bg-muted/50 z-10">Total</td>
                                  {st.colTotals.map((ct, ci) => (
                                    <Fragment key={st.localities[ci]}>
                                      <td className="text-center py-2 px-1.5 border text-blue-700 font-mono text-xs">{ct.sites}</td>
                                      <td className="text-center py-2 px-1.5 border text-green-700 font-mono text-xs">{ct.questionnaires}</td>
                                      <td className="text-center py-2 px-1.5 border text-amber-700 font-mono text-xs">{(() => { const total = st.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? (r.cells[ci].questionnaires ? Math.ceil(r.cells[ci].questionnaires / 7) : 0) : r.cells[ci].questionnaires), 0); return total || '-'; })()}</td>
                                      <td className="text-center py-2 px-1.5 border text-purple-700 font-mono text-xs">{ct.collectors}</td>
                                    </Fragment>
                                  ))}
                                  <td className="text-center py-2 px-1.5 border text-blue-700 font-mono text-xs bg-primary/10">{st.grandSites}</td>
                                  <td className="text-center py-2 px-1.5 border text-green-700 font-mono text-xs bg-primary/10">{st.grandQ}</td>
                                  <td className="text-center py-2 px-1.5 border text-amber-700 font-mono text-xs bg-primary/10">{(() => { const total = st.matrix.reduce((a, r) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : r.totalQ), 0); return total || '-'; })()}</td>
                                  <td className="text-center py-2 px-1.5 border text-purple-700 font-mono text-xs bg-primary/10">{st.grandCollectors}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="reports" className="mt-4 space-y-4" data-testid="reports-tab-content">
              {computeReportSummary && (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <CardTitle className="flex items-center gap-2 text-lg" data-testid="text-report-title">
                            <FileText className="h-5 w-5 text-primary" />
                            Data Quality & Coverage Report
                          </CardTitle>
                          <CardDescription>
                            <span className="flex flex-wrap items-center gap-2 mt-1">
                              <Badge variant="outline" className="gap-1" data-testid="text-report-month">
                                <Clock className="h-3 w-3" />
                                {computeReportSummary.monthCoverage}
                              </Badge>
                              <Badge variant="secondary" className="gap-1" data-testid="text-report-file">
                                <FileSpreadsheet className="h-3 w-3" />
                                {computeReportSummary.fileName}
                              </Badge>
                              <span className="text-xs text-muted-foreground">Generated: {computeReportSummary.generatedDate}</span>
                            </span>
                          </CardDescription>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1.5" data-testid="button-export-report">
                              <Download className="h-4 w-4" />
                              Export
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={exportReportExcel} data-testid="button-export-report-excel">
                              <FileSpreadsheet className="h-4 w-4 mr-2" />
                              Excel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={exportReportPdf} data-testid="button-export-report-pdf">
                              <FileDown className="h-4 w-4 mr-2" />
                              PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Globe className="h-4 w-4 text-primary" />
                        Coverage Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-xl font-bold text-primary" data-testid="text-report-total-q">{computeReportSummary.totalQuestionnaires}</div>
                          <div className="text-xs text-muted-foreground">Questionnaires{cleanResults ? ' (Cleaned)' : ''}</div>
                          {cleanResults && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">Original: {computeReportSummary.originalRows}</div>
                          )}
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-xl font-bold text-teal-600" data-testid="text-report-sites">{computeReportSummary.uniqueSites}</div>
                          <div className="text-xs text-muted-foreground">Unique Sites</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-xl font-bold text-blue-600">{computeReportSummary.uniqueHubs}</div>
                          <div className="text-xs text-muted-foreground">Hubs</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-xl font-bold text-green-600">{computeReportSummary.uniqueStates}</div>
                          <div className="text-xs text-muted-foreground">States</div>
                        </div>
                        <div className="text-center p-3 bg-muted/30 rounded-lg">
                          <div className="text-xl font-bold text-orange-600">{computeReportSummary.uniqueLocalities}</div>
                          <div className="text-xs text-muted-foreground">Localities</div>
                        </div>
                      </div>

                      {trackerData && trackerData.matrix && trackerData.matrix.length > 0 && (() => {
                        const { hubs: tHubs, matrix: tMatrix, hubTotals: tHubTotals, grandQ: tGrandQ, grandSites: tGrandSites, grandCollectors: tGrandCollectors } = trackerData;
                        const pdmSitesGrand = tMatrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) ? Math.ceil(r.totalQ / 7) : 0), 0);
                        const actualSitesGrand = tMatrix.reduce((a: number, r: any) => {
                          let nonPdm = 0;
                          r.cells.forEach((c: any) => { if (!isPdmActivity(r.activity)) nonPdm += (c.questionnaires || 0); });
                          return a + nonPdm;
                        }, 0) + pdmSitesGrand;
                        return (
                          <div>
                            <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                              <BarChart3 className="h-3.5 w-3.5" /> Tracker Grand Totals
                            </h4>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm" data-testid="table-report-tracker-totals">
                                <thead>
                                  <tr className="bg-muted/40 border-b">
                                    <th className="text-left py-2 px-3 font-medium text-xs">Hub</th>
                                    <th className="text-center py-2 px-3 font-medium text-xs">Sites</th>
                                    <th className="text-center py-2 px-3 font-medium text-xs">Actual</th>
                                    <th className="text-center py-2 px-3 font-medium text-xs">PDM Sites</th>
                                    <th className="text-center py-2 px-3 font-medium text-xs">DC</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {tHubs.map((hub: string, hi: number) => {
                                    const ht = tHubTotals[hi];
                                    const hubPdmSites = tMatrix.reduce((a: number, r: any) => a + (isPdmActivity(r.activity) && r.cells[hi].questionnaires ? Math.ceil(r.cells[hi].questionnaires / 7) : 0), 0);
                                    return (
                                      <tr key={hub} className="border-b last:border-b-0 hover:bg-muted/20">
                                        <td className="py-1.5 px-3 font-medium">{hub}</td>
                                        <td className="py-1.5 px-3 text-center font-mono text-blue-600">{ht.sites}</td>
                                        <td className="py-1.5 px-3 text-center font-mono text-green-600">{ht.questionnaires}</td>
                                        <td className="py-1.5 px-3 text-center font-mono text-amber-600">{hubPdmSites || '-'}</td>
                                        <td className="py-1.5 px-3 text-center font-mono text-purple-600">{ht.collectors}</td>
                                      </tr>
                                    );
                                  })}
                                  <tr className="bg-primary/10 dark:bg-primary/20 font-bold border-t-2 border-primary/30">
                                    <td className="py-2 px-3 font-bold text-primary">Grand Total</td>
                                    <td className="py-2 px-3 text-center font-mono font-bold text-blue-600" data-testid="text-tracker-grand-sites">{tGrandSites}</td>
                                    <td className="py-2 px-3 text-center font-mono font-bold text-green-600" data-testid="text-tracker-grand-actual">{tGrandQ}</td>
                                    <td className="py-2 px-3 text-center font-mono font-bold text-amber-600" data-testid="text-tracker-grand-pdm-sites">{pdmSitesGrand || '-'}</td>
                                    <td className="py-2 px-3 text-center font-mono font-bold text-purple-600" data-testid="text-tracker-grand-dc">{tGrandCollectors}</td>
                                  </tr>
                                  <tr className="bg-emerald-100 dark:bg-emerald-950/40 border-t-2 border-emerald-400">
                                    <td className="py-2.5 px-3 font-bold text-emerald-800 dark:text-emerald-300">Total Sites (PDM/7)</td>
                                    <td colSpan={4} className="py-2.5 px-3 text-center">
                                      <span className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300" data-testid="text-tracker-total-sites-pdm7">{actualSitesGrand}</span>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" /> Coverage by Hub
                          </h4>
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm" data-testid="table-report-hub-coverage">
                              <thead>
                                <tr className="bg-muted/40 border-b">
                                  <th className="text-left py-2 px-3 font-medium text-xs">Hub</th>
                                  <th className="text-center py-2 px-3 font-medium text-xs">Sites</th>
                                  <th className="text-center py-2 px-3 font-medium text-xs">Questionnaires</th>
                                </tr>
                              </thead>
                              <tbody>
                                {computeReportSummary.hubBreakdown.map(h => (
                                  <tr key={h.hub} className="border-b last:border-b-0 hover:bg-muted/20">
                                    <td className="py-1.5 px-3 font-medium">{h.hub}</td>
                                    <td className="py-1.5 px-3 text-center font-mono text-blue-600">{h.sites}</td>
                                    <td className="py-1.5 px-3 text-center font-mono">{h.questionnaires}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                            <Activity className="h-3.5 w-3.5" /> Coverage by Activity
                          </h4>
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm" data-testid="table-report-activity-coverage">
                              <thead>
                                <tr className="bg-muted/40 border-b">
                                  <th className="text-left py-2 px-3 font-medium text-xs">Activity</th>
                                  <th className="text-center py-2 px-3 font-medium text-xs">Questionnaires</th>
                                </tr>
                              </thead>
                              <tbody>
                                {computeReportSummary.activityBreakdown.map(a => (
                                  <tr key={a.activity} className="border-b last:border-b-0 hover:bg-muted/20">
                                    <td className="py-1.5 px-3 font-medium">{a.activity}</td>
                                    <td className="py-1.5 px-3 text-center font-mono">{a.count}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4 text-primary" />
                        Team Overview
                      </CardTitle>
                      <CardDescription>
                        {computeReportSummary.totalCollectors} Data Collectors across {computeReportSummary.totalSupervisors} Supervisors
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {computeReportSummary.teamOverview.map(team => (
                          <div key={team.supervisor} className="border rounded-lg">
                            <div className="flex items-center justify-between gap-2 p-3 bg-muted/30">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                <span className="font-semibold text-sm">{team.supervisor}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-xs">{team.teamSize} DCs</Badge>
                                <Badge variant="secondary" className="font-mono text-xs">{team.totalQ} Q</Badge>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm" data-testid={`table-team-${team.supervisor}`}>
                                <thead>
                                  <tr className="border-b bg-muted/10">
                                    <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground">Data Collector</th>
                                    <th className="text-left py-2 px-3 font-medium text-xs text-muted-foreground">Device ID</th>
                                    <th className="text-center py-2 px-3 font-medium text-xs text-muted-foreground">Questionnaires</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {team.collectors.map(dc => (
                                    <tr key={dc.name} className="border-b last:border-b-0 hover:bg-muted/20">
                                      <td className="py-1.5 px-3">{dc.name}</td>
                                      <td className="py-1.5 px-3 font-mono text-xs text-muted-foreground">{dc.deviceId}</td>
                                      <td className="py-1.5 px-3 text-center font-mono">{dc.count}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {computeReportSummary.qualityReport && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          Data Quality Report
                        </CardTitle>
                        <CardDescription>
                          Quality Score: <span className="font-bold text-primary" data-testid="text-quality-score">{computeReportSummary.qualityReport.qualityScore}%</span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="text-center p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                            <div className="text-xl font-bold text-red-600">{computeReportSummary.qualityReport.duplicatesRemoved}</div>
                            <div className="text-xs text-muted-foreground">Duplicates Removed</div>
                          </div>
                          <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                            <div className="text-xl font-bold text-orange-600">{computeReportSummary.qualityReport.emptyRowsRemoved}</div>
                            <div className="text-xs text-muted-foreground">Empty Rows Removed</div>
                          </div>
                          <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                            <div className="text-xl font-bold text-blue-600">{computeReportSummary.qualityReport.trimmedFields}</div>
                            <div className="text-xs text-muted-foreground">Fields Trimmed</div>
                          </div>
                          <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                            <div className="text-xl font-bold text-purple-600">{computeReportSummary.qualityReport.namesStandardized}</div>
                            <div className="text-xs text-muted-foreground">Names Standardized</div>
                          </div>
                        </div>

                        <div className="p-3 bg-muted/30 rounded-lg border-l-4 border-l-amber-500">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-muted-foreground">
                              Data collectors should ensure consistent naming, avoid duplicate entries, and fill all required fields.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {computeReportSummary.qualityReport && (
                    <Card>
                      <CardHeader className="pb-3">
                        <button
                          type="button"
                          className="w-full flex items-center justify-between text-left"
                          onClick={() => setReportIssuesExpanded(!reportIssuesExpanded)}
                          data-testid="button-toggle-report-issues"
                        >
                          <CardTitle className="flex items-center gap-2 text-base">
                            <FileSearch className="h-4 w-4 text-primary" />
                            Detailed Issues
                          </CardTitle>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="font-mono text-xs">
                              {computeReportSummary.qualityReport.duplicateGroups.length} dup groups
                            </Badge>
                            <Badge variant="outline" className="font-mono text-xs">
                              {computeReportSummary.qualityReport.nameChanges.length} name changes
                            </Badge>
                            {reportIssuesExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </button>
                      </CardHeader>
                      {reportIssuesExpanded && (
                        <CardContent className="space-y-4">
                          {computeReportSummary.qualityReport.duplicateGroups.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Duplicate Groups</h4>
                              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {computeReportSummary.qualityReport.duplicateGroups.map((group, gi) => (
                                  <div key={gi} className="border rounded-lg p-2.5 text-sm">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge variant="destructive" className="text-[10px] px-1.5">Group {gi + 1}</Badge>
                                      <span className="text-xs text-muted-foreground">{group.rows.length} rows</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Rows: {group.rows.map(r => r.index + 1).join(', ')}
                                    </div>
                                    <div className="text-xs mt-1">
                                      Key: <span className="font-mono text-muted-foreground">{group.key}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {computeReportSummary.qualityReport.nameChanges.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Name Standardization Changes</h4>
                              <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                                <table className="w-full text-sm" data-testid="table-report-name-changes">
                                  <thead>
                                    <tr className="bg-muted/40 border-b sticky top-0">
                                      <th className="text-left py-2 px-3 font-medium text-xs">Row</th>
                                      <th className="text-left py-2 px-3 font-medium text-xs">Device ID</th>
                                      <th className="text-left py-2 px-3 font-medium text-xs">Old Name</th>
                                      <th className="text-left py-2 px-3 font-medium text-xs">New Name</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {computeReportSummary.qualityReport.nameChanges.slice(0, 100).map((nc, i) => (
                                      <tr key={i} className="border-b last:border-b-0">
                                        <td className="py-1.5 px-3 font-mono text-xs">{nc.index + 1}</td>
                                        <td className="py-1.5 px-3 font-mono text-xs text-muted-foreground">{nc.deviceId}</td>
                                        <td className="py-1.5 px-3 text-red-600 line-through">{nc.oldName}</td>
                                        <td className="py-1.5 px-3 text-green-600">{nc.newName}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {computeReportSummary.qualityReport.nameChanges.length > 100 && (
                                <p className="text-xs text-muted-foreground mt-1">Showing first 100 of {computeReportSummary.qualityReport.nameChanges.length} changes</p>
                              )}
                            </div>
                          )}

                          <div className="p-3 bg-muted/30 rounded-lg">
                            <h4 className="text-sm font-semibold mb-2">Recommendations</h4>
                            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                              <li>Use standardized naming conventions for data collectors across all devices</li>
                              <li>Verify entries before submission to reduce duplicate records</li>
                              <li>Ensure all required fields are completed before saving questionnaires</li>
                              <li>Coordinate with supervisors to maintain consistent site naming</li>
                            </ul>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  )}
                </>
              )}
              {!computeReportSummary && (
                <Card className="p-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Upload data to generate the report</p>
                </Card>
              )}
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
              [...savedSessions].sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()).map(session => (
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

      <Dialog open={showCleanDialog} onOpenChange={setShowCleanDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10">
                <Sparkles className="h-4.5 w-4.5 text-primary" />
              </div>
              Data Cleaning Results
            </DialogTitle>
          </DialogHeader>
          {cleanResults && (() => {
            const totalIssues = customDupsRemoved + cleanResults.emptyRowsRemoved + cleanResults.trimmedFields + cleanResults.namesStandardized;
            const rowsRemoved = cleanResults.originalCount - customCleanedCount;
            const reductionPct = cleanResults.originalCount > 0 ? Math.round((rowsRemoved / cleanResults.originalCount) * 100) : 0;
            const hasChanges = totalIssues > 0;

            const sections = [
              { id: 'duplicates', icon: Trash2, iconColor: 'text-red-500 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-950/30', borderColor: 'border-red-200 dark:border-red-900/50', label: 'Duplicate rows removed', sublabel: 'Rows with identical key fields', count: customDupsRemoved, badgeVariant: 'destructive' as const },
              { id: 'empty', icon: X, iconColor: 'text-orange-500 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-950/30', borderColor: 'border-orange-200 dark:border-orange-900/50', label: 'Empty rows removed', sublabel: 'Rows with no meaningful data', count: cleanResults.emptyRowsRemoved, badgeVariant: 'default' as const },
              { id: 'trimmed', icon: CheckCircle2, iconColor: 'text-blue-500 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-950/30', borderColor: 'border-blue-200 dark:border-blue-900/50', label: 'Fields trimmed', sublabel: 'Extra whitespace cleaned up', count: cleanResults.trimmedFields, badgeVariant: 'default' as const },
              { id: 'names', icon: Users, iconColor: 'text-purple-500 dark:text-purple-400', bgColor: 'bg-purple-50 dark:bg-purple-950/30', borderColor: 'border-purple-200 dark:border-purple-900/50', label: 'Collector names standardized', sublabel: 'Unified by device ID', count: cleanResults.namesStandardized, badgeVariant: 'default' as const },
            ];

            return (
              <div className="space-y-4 py-1 flex-1 overflow-y-auto pr-1 min-h-0">
                <div className="relative rounded-xl border bg-gradient-to-br from-muted/30 to-muted/60 p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-3xl font-bold tracking-tight">{cleanResults.originalCount.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Original Rows</p>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      {hasChanges && <Badge variant="secondary" className="mt-1 text-[10px]">-{reductionPct}%</Badge>}
                    </div>
                    <div>
                      <p className="text-3xl font-bold tracking-tight text-green-600 dark:text-green-400">{customCleanedCount.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Cleaned Rows</p>
                    </div>
                  </div>
                  {hasChanges && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Data reduction</span>
                        <span className="font-medium">{rowsRemoved.toLocaleString()} rows removed</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-700" style={{ width: `${100 - reductionPct}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Cleaning Operations</h4>
                  <div className="space-y-1.5">
                    {sections.map((item) => {
                      const ItemIcon = item.icon;
                      const isActive = item.count > 0;
                      const isExpanded = cleanExpandedSection === item.id;
                      return (
                        <div key={item.id}>
                          <button
                            type="button"
                            onClick={() => isActive && setCleanExpandedSection(isExpanded ? null : item.id)}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left ${
                              isActive ? `${item.bgColor} ${item.borderColor} cursor-pointer` : 'border-transparent bg-muted/30 cursor-default'
                            }`}
                            data-testid={`button-expand-${item.id}`}
                          >
                            <div className={`flex items-center justify-center h-8 w-8 rounded-md shrink-0 ${isActive ? item.bgColor : 'bg-muted'}`}>
                              <ItemIcon className={`h-4 w-4 ${isActive ? item.iconColor : 'text-muted-foreground/50'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${!isActive ? 'text-muted-foreground' : ''}`}>{item.label}</p>
                              <p className="text-[11px] text-muted-foreground">{item.sublabel}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {isActive ? (
                                <Badge variant={item.badgeVariant}>{item.count.toLocaleString()}</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground/50 font-medium px-2">0</span>
                              )}
                              {isActive && (
                                isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                          </button>

                          {isExpanded && item.id === 'duplicates' && cleanResults.duplicateGroups.length > 0 && (
                            <div className="mt-1.5 ml-2 border-l-2 border-red-200 dark:border-red-900/50 pl-3 space-y-2 py-2 max-h-64 overflow-y-auto">
                              <p className="text-[11px] text-muted-foreground px-1">Select which rows to keep from each duplicate group. Unchecked rows will be removed.</p>
                              {cleanResults.duplicateGroups.slice(0, 50).map((group, gi) => {
                                const keptSet = duplicateKeepMap.get(gi) || new Set([0]);
                                return (
                                  <div key={gi} className="bg-muted/40 rounded-md p-2 space-y-1">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <Badge variant="outline" className="text-[10px]">Group {gi + 1}</Badge>
                                      <span className="text-[11px] text-muted-foreground">{group.rows.length} identical rows</span>
                                      <span className="text-[10px] text-muted-foreground ml-auto">Keeping {keptSet.size} of {group.rows.length}</span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground mb-1.5 px-1">
                                      <span className="font-medium">{group.rows[0]?.row.dataCollector || 'N/A'}</span>
                                      {group.rows[0]?.row.activitySite && <> | {group.rows[0].row.activitySite}</>}
                                      {group.rows[0]?.row.date && <> | {group.rows[0].row.date}</>}
                                    </div>
                                    {group.rows.map((r, ri) => {
                                      const isKept = keptSet.has(ri);
                                      return (
                                        <label
                                          key={ri}
                                          className={`flex items-center gap-2 text-[11px] px-1 py-1 rounded cursor-pointer transition-colors ${isKept ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50/50 dark:bg-red-950/20'}`}
                                          data-testid={`label-dup-${gi}-${ri}`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isKept}
                                            onChange={() => {
                                              setDuplicateKeepMap(prev => {
                                                const next = new Map(prev);
                                                const currentSet = new Set(next.get(gi) || [0]);
                                                if (currentSet.has(ri)) {
                                                  if (currentSet.size > 1) currentSet.delete(ri);
                                                } else {
                                                  currentSet.add(ri);
                                                }
                                                next.set(gi, currentSet);
                                                return next;
                                              });
                                            }}
                                            className="h-3 w-3 rounded border-muted-foreground/40 shrink-0"
                                            data-testid={`checkbox-dup-${gi}-${ri}`}
                                          />
                                          <span className={isKept ? 'font-medium' : 'text-muted-foreground'}>
                                            Row {r.index + 1}
                                          </span>
                                          <span className="text-muted-foreground truncate">
                                            {r.row.hub && `${r.row.hub}`}{r.row.state && ` / ${r.row.state}`}{r.row.locality && ` / ${r.row.locality}`}
                                          </span>
                                          <span className="ml-auto text-[10px] shrink-0">
                                            {isKept ? <Badge variant="outline" className="text-[9px] h-4">Kept</Badge> : <Badge variant="secondary" className="text-[9px] h-4">Removed</Badge>}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                              {cleanResults.duplicateGroups.length > 50 && (
                                <p className="text-[11px] text-muted-foreground text-center py-1">
                                  Showing 50 of {cleanResults.duplicateGroups.length} duplicate groups
                                </p>
                              )}
                            </div>
                          )}

                          {isExpanded && item.id === 'empty' && cleanResults.emptyRows.length > 0 && (
                            <div className="mt-1.5 ml-2 border-l-2 border-orange-200 dark:border-orange-900/50 pl-3 space-y-1 py-2 max-h-48 overflow-y-auto">
                              {cleanResults.emptyRows.slice(0, 30).map((er, ei) => (
                                <div key={ei} className="flex items-center gap-2 text-[11px] bg-muted/40 rounded px-2 py-1">
                                  <X className="h-3 w-3 text-orange-400 shrink-0" />
                                  <span>Row {er.index + 1}</span>
                                  <span className="text-muted-foreground">- All key fields are empty</span>
                                </div>
                              ))}
                              {cleanResults.emptyRows.length > 30 && (
                                <p className="text-[11px] text-muted-foreground text-center py-1">
                                  Showing 30 of {cleanResults.emptyRows.length} empty rows
                                </p>
                              )}
                            </div>
                          )}

                          {isExpanded && item.id === 'trimmed' && cleanResults.trimmedDetails.length > 0 && (
                            <div className="mt-1.5 ml-2 border-l-2 border-blue-200 dark:border-blue-900/50 pl-3 space-y-1 py-2 max-h-48 overflow-y-auto">
                              {cleanResults.trimmedDetails.slice(0, 30).map((td, ti) => (
                                <div key={ti} className="text-[11px] bg-muted/40 rounded px-2 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3 w-3 text-blue-400 shrink-0" />
                                    <span>Row {td.index + 1}</span>
                                    <Badge variant="outline" className="text-[9px] h-4">{td.field}</Badge>
                                  </div>
                                  <div className="mt-1 flex gap-2 items-start pl-5">
                                    <span className="text-red-500 dark:text-red-400 line-through truncate max-w-[45%]">&ldquo;{td.before}&rdquo;</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                                    <span className="text-green-600 dark:text-green-400 truncate max-w-[45%]">&ldquo;{td.after}&rdquo;</span>
                                  </div>
                                </div>
                              ))}
                              {cleanResults.trimmedDetails.length > 30 && (
                                <p className="text-[11px] text-muted-foreground text-center py-1">
                                  Showing 30 of {cleanResults.trimmedDetails.length} trimmed fields
                                </p>
                              )}
                            </div>
                          )}

                          {isExpanded && item.id === 'names' && cleanResults.nameChanges.length > 0 && (
                            <div className="mt-1.5 ml-2 border-l-2 border-purple-200 dark:border-purple-900/50 pl-3 space-y-1 py-2 max-h-48 overflow-y-auto">
                              {cleanResults.nameChanges.slice(0, 30).map((nc, ni) => (
                                <div key={ni} className="text-[11px] bg-muted/40 rounded px-2 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <Users className="h-3 w-3 text-purple-400 shrink-0" />
                                    <span>Row {nc.index + 1}</span>
                                    <Badge variant="outline" className="text-[9px] h-4 truncate max-w-[120px]">{nc.deviceId}</Badge>
                                  </div>
                                  <div className="mt-1 flex gap-2 items-center pl-5">
                                    <span className="text-red-500 dark:text-red-400 line-through truncate max-w-[40%]">{nc.oldName}</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <span className="text-green-600 dark:text-green-400 truncate max-w-[40%]">{nc.newName}</span>
                                  </div>
                                </div>
                              ))}
                              {cleanResults.nameChanges.length > 30 && (
                                <p className="text-[11px] text-muted-foreground text-center py-1">
                                  Showing 30 of {cleanResults.nameChanges.length} name changes
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {!hasChanges && (
                  <div className="flex items-center gap-3 p-4 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
                    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/50 shrink-0">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-800 dark:text-green-300">Your data is already clean</p>
                      <p className="text-xs text-green-700/70 dark:text-green-400/60 mt-0.5">No duplicates, empty rows, or inconsistencies were found.</p>
                    </div>
                  </div>
                )}

                {hasChanges && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Found <strong>{totalIssues.toLocaleString()}</strong> issues across {cleanResults.originalCount.toLocaleString()} rows. Click any category above to inspect details.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter className="shrink-0 flex flex-row items-center gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setShowCleanDialog(false)} data-testid="button-clean-cancel">Close</Button>
            {cleanResults && (cleanResults.duplicatesRemoved > 0 || cleanResults.emptyRowsRemoved > 0 || cleanResults.trimmedFields > 0 || cleanResults.namesStandardized > 0) && (
              <div className="flex gap-2 flex-1 justify-end">
                <Button variant="outline" className="gap-1.5" onClick={downloadReviewExcel} data-testid="button-download-review">
                  <FileSearch className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span> Review
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={downloadCleanedExcel} data-testid="button-download-cleaned">
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span> Cleaned
                </Button>
                <Button className="gap-1.5" onClick={applyCleanedData} data-testid="button-apply-cleaned">
                  <CheckCircle2 className="h-4 w-4" />
                  Apply
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Send Report Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="email-to">To</Label>
              <Input
                id="email-to"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="recipient@example.com"
                className="mt-1"
                data-testid="input-email-to"
              />
            </div>

            <div>
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="mt-1"
                data-testid="input-email-subject"
              />
            </div>

            <div>
              <Label className="mb-2 block">CC by Role</Label>
              <div className="flex flex-wrap gap-3">
                {['Super Admin', 'Admin', 'FOM', 'Supervisor', 'Data Team', 'Finance'].map(role => (
                  <label key={role} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={emailCcRoles.includes(role)}
                      onCheckedChange={(checked) => {
                        setEmailCcRoles(prev => checked ? [...prev, role] : prev.filter(r => r !== role));
                      }}
                      data-testid={`checkbox-cc-role-${role.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                    {role}
                  </label>
                ))}
              </div>
              {getEmailCcList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {getEmailCcList.map(u => (
                    <Badge key={u.id} variant="secondary" className="text-xs gap-1" data-testid={`badge-cc-user-${u.id}`}>
                      {u.name} ({u.email})
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2 block">Attachments</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={emailAttachReview}
                    onCheckedChange={(checked) => setEmailAttachReview(!!checked)}
                    data-testid="checkbox-attach-review"
                  />
                  Review File
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={emailAttachCleaned}
                    onCheckedChange={(checked) => setEmailAttachCleaned(!!checked)}
                    data-testid="checkbox-attach-cleaned"
                  />
                  Cleaned File
                </label>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Email Preview</Label>
              <Card className="p-4">
                <div className="space-y-2">
                  <div className="text-sm font-semibold" data-testid="text-email-preview-subject">{emailSubject}</div>
                  <div className="border-t pt-2">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-[200px] overflow-y-auto" data-testid="text-email-preview-body">
                      {getEmailBody}
                    </pre>
                  </div>
                </div>
              </Card>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)} data-testid="button-email-cancel">
              Cancel
            </Button>
            <Button onClick={sendEmailReport} disabled={emailSending || !emailTo.trim()} className="gap-1.5" data-testid="button-email-send">
              {emailSending ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full inline-block" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuestionnaireAnalytics;
