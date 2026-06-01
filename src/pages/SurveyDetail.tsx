import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { usePageManageOverride } from '@/hooks/usePageManageOverride';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// Fix Leaflet default icon paths broken by Vite bundling
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});
import {
  ArrowLeft, Plus, Trash2, Loader2, ChevronUp, ChevronDown, ExternalLink,
  BarChart2, Edit3, Save, Copy,
  AlignLeft, AlignJustify, List, CheckSquare, Star, Sliders,
  Calendar, ChevronDown as ChevronDownIcon, Minus, Hash, Type,
  Users, FileText, Clock, MapPin, Image as ImageIcon, Paperclip,
  Phone, Mail, ScanLine, CalendarClock, GitBranch, Link2, Download,
  Folder, FolderOpen, ChevronRight,
  TrendingUp, CheckCircle2, MessageSquare, Award, Target,
  Eye, Search, Table2, Map as MapIcon, X, FileSpreadsheet,
  Settings, Shield, ToggleLeft, Globe, Lock,
  Sparkles, Share2, QrCode, Code2, MessageCircleMore, Filter, Timer,
  CheckCheck, CircleDot, CircleX, ClipboardList,
  RefreshCw, FunctionSquare, PenLine, ArrowRightLeft, Activity, AlertCircle,
  Upload, LayoutList, BookOpen, GripVertical, CheckSquare2,
  BellRing, MessageSquareMore,
  UserCheck, BarChart3, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid,
} from 'recharts';

type SurveyStatus = 'draft' | 'active' | 'closed';

type QuestionType =
  | 'text' | 'textarea' | 'radio' | 'checkbox' | 'yesno'
  | 'rating' | 'scale' | 'date' | 'dropdown' | 'section_header'
  | 'number' | 'integer' | 'phone' | 'email' | 'time' | 'datetime'
  | 'gps' | 'image' | 'file' | 'barcode' | 'begin_group'
  | 'calculate' | 'begin_repeat' | 'grid_table'
  | 'likert' | 'signature' | 'note' | 'acknowledge';

interface SkipCondition {
  question_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'answered' | 'not_answered' | 'greater_than' | 'less_than';
  value?: string;
}

interface SkipLogic {
  condition_question_id?: string;
  operator?: 'equals' | 'not_equals' | 'contains' | 'answered' | 'not_answered' | 'greater_than' | 'less_than';
  value?: string;
  logic?: 'AND' | 'OR';
  conditions?: SkipCondition[];
}

interface Survey {
  id: string;
  short_code: string | null;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  status: SurveyStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  settings: Record<string, unknown>;
  form_version: number;
}

interface Question {
  id: string;
  survey_id: string;
  type: QuestionType;
  label: string;
  label_ar: string | null;
  description: string | null;
  description_ar: string | null;
  options: string[] | null;
  options_ar: string[] | null;
  order_index: number;
  settings: Record<string, unknown>;
  group_id: string | null;
}

interface AiQuestion {
  type: QuestionType;
  label: string;
  label_ar: string | null;
  required: boolean;
  options: string[] | null;
  options_ar: string[] | null;
  variable_name: string;
  settings?: Record<string, unknown> | null;
}

async function extractFileContext(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    let text = `ODK XLSForm: "${file.name}"\n\n`;
    const surveyWs = wb.Sheets['survey'] || wb.Sheets[wb.SheetNames[0]];
    if (surveyWs) {
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(surveyWs, { defval: '' });
      text += `Survey questions (${rows.length}):\n`;
      rows.slice(0, 500).forEach((r, i) => {
        const type = r['type'] || r['Type'] || '';
        const name = r['name'] || r['Name'] || '';
        const label = r['label'] || r['label::English'] || r['label::English (en)'] || r['Label'] || '';
        const required = r['required'] || r['Required'] || '';
        const hint = r['hint'] || r['Hint'] || '';
        if (type || label) {
          text += `${i + 1}. [${type}] ${name}: "${label}"${required === 'yes' || required === 'true' ? ' *required' : ''}${hint ? ` (hint: ${hint})` : ''}\n`;
        }
      });
    }
    const choicesWs = wb.Sheets['choices'];
    if (choicesWs) {
      const choices = XLSX.utils.sheet_to_json<Record<string, string>>(choicesWs, { defval: '' });
      const listMap: Record<string, string[]> = {};
      choices.forEach(r => {
        const list = r['list_name'] || r['list name'] || '';
        const lbl = r['label'] || r['label::English'] || r['label::English (en)'] || r['Label'] || '';
        if (list && lbl) { if (!listMap[list]) listMap[list] = []; listMap[list].push(String(lbl)); }
      });
      if (Object.keys(listMap).length > 0) {
        text += `\nChoice lists:\n`;
        Object.entries(listMap).slice(0, 30).forEach(([list, opts]) => { text += `- ${list}: ${opts.join(', ')}\n`; });
      }
    }
    return text.slice(0, 80000);
  }
  if (ext === 'docx' || ext === 'doc') {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const xmlFile = zip.file('word/document.xml');
    if (!xmlFile) return `Word Document: "${file.name}"\n(Could not extract content)`;
    const xml = await xmlFile.async('string');
    const plain = xml
      .replace(/<w:p[ >]/g, '\n<')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n').trim();
    return `Word Document: "${file.name}"\n\n${plain.slice(0, 80000)}`;
  }
  return '';
}

interface Response {
  id: string;
  respondent_id: string | null;
  respondent_name: string | null;
  respondent_email: string | null;
  submitted_at: string;
  review_status?: 'pending' | 'under_review' | 'approved' | 'rejected' | null;
  duration_seconds?: number | null;
}

interface Answer {
  id: string;
  response_id: string;
  question_id: string;
  answer_text: string | null;
  answer_json: unknown;
}

interface QTreeNode {
  q: Question;
  children: QTreeNode[];
}

function buildQTree(questions: Question[], parentId: string | null = null): QTreeNode[] {
  return [...questions]
    .filter(q => (q.group_id ?? null) === parentId)
    .sort((a, b) => a.order_index - b.order_index)
    .map(q => ({
      q,
      children: q.type === 'begin_group' ? buildQTree(questions, q.id) : [],
    }));
}

interface SectionBlock { header: Question | null; items: Question[] }
function buildSectionBlocks(questions: Question[]): SectionBlock[] {
  const topLevel = [...questions]
    .filter(q => (q.group_id ?? null) === null)
    .sort((a, b) => a.order_index - b.order_index);
  const blocks: SectionBlock[] = [];
  let cur: SectionBlock = { header: null, items: [] };
  for (const q of topLevel) {
    if (q.type === 'section_header') {
      if (cur.header !== null || cur.items.length > 0) blocks.push(cur);
      cur = { header: q, items: [] };
    } else {
      cur.items.push(q);
    }
  }
  if (cur.header !== null || cur.items.length > 0) blocks.push(cur);
  return blocks;
}

const STATUS_CFG: Record<SurveyStatus, { label: string; color: string }> = {
  draft:  { label: 'Draft',  color: 'bg-slate-100 text-slate-600 border-slate-200'   },
  active: { label: 'Active', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closed: { label: 'Closed', color: 'bg-orange-50 text-orange-700 border-orange-200'  },
};

type QTypeEntry = { type: QuestionType; label: string; icon: React.ComponentType<{ className?: string }> };

const Q_TYPE_GROUPS: { label: string; types: QTypeEntry[] }[] = [
  {
    label: 'Text & Numbers',
    types: [
      { type: 'text',    label: 'Short Text',  icon: Type },
      { type: 'textarea',label: 'Long Text',   icon: AlignJustify },
      { type: 'number',  label: 'Number',      icon: Hash },
      { type: 'integer', label: 'Integer',     icon: Hash },
      { type: 'phone',   label: 'Phone',       icon: Phone },
      { type: 'email',   label: 'Email',       icon: Mail },
    ],
  },
  {
    label: 'Choice',
    types: [
      { type: 'yesno',    label: 'Yes / No',        icon: ToggleLeft },
      { type: 'radio',    label: 'Multiple Choice', icon: List },
      { type: 'checkbox', label: 'Checkboxes',      icon: CheckSquare },
      { type: 'dropdown', label: 'Dropdown',        icon: ChevronDownIcon },
    ],
  },
  {
    label: 'Date & Time',
    types: [
      { type: 'date',     label: 'Date',        icon: Calendar },
      { type: 'time',     label: 'Time',        icon: Clock },
      { type: 'datetime', label: 'Date & Time', icon: CalendarClock },
    ],
  },
  {
    label: 'Scale & Rating',
    types: [
      { type: 'rating', label: 'Star Rating (1–5)', icon: Star },
      { type: 'scale',  label: 'Scale (1–10)',      icon: Sliders },
    ],
  },
  {
    label: 'Location & Media',
    types: [
      { type: 'gps',     label: 'GPS Location',  icon: MapPin },
      { type: 'image',   label: 'Photo',         icon: ImageIcon },
      { type: 'file',    label: 'File Upload',   icon: Paperclip },
      { type: 'barcode', label: 'Barcode / QR',  icon: ScanLine },
    ],
  },
  {
    label: 'Specialized',
    types: [
      { type: 'likert',      label: 'Likert Scale',        icon: LayoutList },
      { type: 'signature',   label: 'Signature',           icon: PenLine },
      { type: 'note',        label: 'Note / Text Block',   icon: MessageSquare },
      { type: 'acknowledge', label: 'Acknowledgement',     icon: CheckSquare2 },
    ],
  },
  {
    label: 'Layout & Structure',
    types: [
      { type: 'section_header', label: 'Section Header',   icon: Minus },
      { type: 'begin_group',    label: 'Group',             icon: Folder },
      { type: 'begin_repeat',   label: 'Repeat Group',      icon: RefreshCw },
      { type: 'calculate',      label: 'Calculated Field',  icon: FunctionSquare },
      { type: 'grid_table',     label: 'Grid / Table',      icon: Table2 },
    ],
  },
];

const ALL_Q_TYPES: QTypeEntry[] = Q_TYPE_GROUPS.flatMap(g => g.types);

const CHART_COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#14b8a6','#8b5cf6','#f97316','#0ea5e9'];

export default function SurveyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser, hasRole } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  const { toast } = useToast();

  const isAdmin = isSuperAdmin || hasRole('admin') || hasRole('super_admin');
  const roleCanManage = isAdmin || hasRole('hub_manager') || hasRole('fom') || hasRole('sr_program_officer');

  const overrideCanManage = usePageManageOverride('surveys', roleCanManage);
  const canManage = roleCanManage || overrideCanManage;

  // Non-managers have no business on the detail page — redirect straight to the fill form
  useEffect(() => {
    if (!canManage && id) navigate(`/s/${id}`, { replace: true });
  }, [canManage, id, navigate]);

  const [tab, setTab] = useState<'builder' | 'responses' | 'analytics' | 'map' | 'settings'>('builder');
  const [editTitle, setEditTitle]     = useState('');
  const [editTitleAr, setEditTitleAr] = useState('');
  const [editDesc, setEditDesc]       = useState('');
  const [editDescAr, setEditDescAr]   = useState('');
  const [savingMeta, setSavingMeta]   = useState(false);
  const [addTypeOpen, setAddTypeOpen] = useState(false);
  const [addToGroupId, setAddToGroupId] = useState<string | null>(null);
  const [editQId, setEditQId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Responses tab extras
  const [responsesView, setResponsesView] = useState<'list' | 'table'>('list');
  const [responseSearch, setResponseSearch] = useState('');
  const [responseDateFrom, setResponseDateFrom] = useState('');
  const [responseDateTo, setResponseDateTo] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<Response | null>(null);
  const [deleteResponseTarget, setDeleteResponseTarget] = useState<Response | null>(null);

  // Builder extras — bulk select + drag-and-drop + library
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [draggedQId, setDraggedQId] = useState<string | null>(null);
  const [dragOverQId, setDragOverQId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySaveTarget, setLibrarySaveTarget] = useState<Question | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Cross-tabulation state
  const [crossTabRow, setCrossTabRow] = useState<string>('');
  const [crossTabCol, setCrossTabCol] = useState<string>('');

  // Submission edit state
  const [editTarget, setEditTarget]       = useState<Response | null>(null);
  const [editAnswers, setEditAnswers]     = useState<Record<string, string>>({});
  const [editNote, setEditNote]           = useState('');
  const [editSaving, setEditSaving]       = useState(false);

  // Share / AI Generate / Review state
  const [shareOpen, setShareOpen]           = useState(false);
  const [aiOpen, setAiOpen]                 = useState(false);
  const [aiTopic, setAiTopic]               = useState('');
  const [aiCount, setAiCount]               = useState(10);
  const [aiGenerating, setAiGenerating]     = useState(false);
  const [aiSuggestions, setAiSuggestions]   = useState<AiQuestion[]>([]);
  const [aiSelected, setAiSelected]         = useState<Set<number>>(new Set());
  const [aiChunkStatus, setAiChunkStatus]   = useState<{ current: number; total: number; done: boolean } | null>(null);
  const [aiLang, setAiLang]                 = useState<'en' | 'ar' | 'both'>('en');
  const [aiFile, setAiFile]                 = useState<File | null>(null);
  const [aiFileAr, setAiFileAr]             = useState<File | null>(null);
  const [aiSkipExisting, setAiSkipExisting] = useState(true);
  const [aiSkippedCount, setAiSkippedCount] = useState(0);
  const [reviewTarget, setReviewTarget]     = useState<Response | null>(null);
  const [reviewStatus, setReviewStatus]     = useState<string>('approved');
  const [reviewComment, setReviewComment]   = useState('');
  const [reviewFilter, setReviewFilter]     = useState<string>('all');
  const [reviewSaving, setReviewSaving]     = useState(false);

  // Builder extras
  const [builderSearch, setBuilderSearch]   = useState('');
  const [importXlsOpen, setImportXlsOpen]   = useState(false);
  const [importXlsFile, setImportXlsFile]   = useState<File | null>(null);
  const [importXlsParsed, setImportXlsParsed] = useState<AiQuestion[]>([]);
  const [importXlsSelected, setImportXlsSelected] = useState<Set<number>>(new Set());
  const [importXlsLoading, setImportXlsLoading] = useState(false);

  // Bulk response selection
  const [bulkResponses, setBulkResponses]   = useState<Set<string>>(new Set());
  const [bulkResponseSaving, setBulkResponseSaving] = useState(false);

  // Analytics extras
  const [wordCloudQId, setWordCloudQId]     = useState('');

  // Map extras
  const [mapDateFrom, setMapDateFrom]       = useState('');
  const [mapDateTo, setMapDateTo]           = useState('');
  const [mapView, setMapView]               = useState<'pins' | 'heat'>('pins');

  // Settings tab state
  const [settingsForm, setSettingsForm] = useState({
    response_limit: '',
    expires_at: '',
    allow_multiple: false,
    multi_page: false,
    show_progress: true,
    thank_you_message: '',
    thank_you_message_ar: '',
    activate_at: '',
    fill_password: '',
    notify_emails: '',
    is_template: false,
    reminder_enabled: false,
    reminder_emails: '',
    reminder_phones: '',
    reminder_days_before: '1,3,7',
    reminder_roles: [] as string[],
    reminder_user_ids: [] as string[],
    target_user_ids: [] as string[],
    reminder_message_en: '',
    reminder_message_ar: '',
    thankyou_notify_message_en: '',
    thankyou_notify_message_ar: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [waUserSearch, setWaUserSearch] = useState('');
  const [waUserDropOpen, setWaUserDropOpen] = useState(false);
  const [showMsgPreview, setShowMsgPreview] = useState(false);
  const [testingReminder, setTestingReminder] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [testReminderResult, setTestReminderResult] = useState<{
    emails_sent: number; emails_total: number;
    wa_sent: number; wa_total: number;
    wa_errors?: string[]; phones: string[]; emails: string[];
  } | null>(null);
  const [sendReminderResult, setSendReminderResult] = useState<{
    emails_sent: number; emails_total: number;
    wa_sent: number; wa_total: number; wa_errors?: string[];
    phones: string[]; emails: string[];
  } | null>(null);
  const [targetUserSearch, setTargetUserSearch] = useState('');
  const [targetUserDropOpen, setTargetUserDropOpen] = useState(false);
  const [targetTab, setTargetTab] = useState<'select' | 'status'>('select');
  const [sendingManualNotif, setSendingManualNotif] = useState<'reminder' | 'thankyou' | 'all' | null>(null);
  const [notifChannels, setNotifChannels] = useState({ email: true, whatsapp: true });
  const [manualNotifResult, setManualNotifResult] = useState<{
    type: string; wa_sent: number; wa_total: number; email_sent: number; email_total: number;
  } | null>(null);

  const REMINDER_ROLES = [
    { id: 'superAdmin',            label: 'Super Admin' },
    { id: 'admin',                 label: 'Admin' },
    { id: 'countryDirector',       label: 'Country Director' },
    { id: 'ict',                   label: 'ICT' },
    { id: 'fom',                   label: 'Field Ops Manager' },
    { id: 'financialAdmin',        label: 'Finance Admin' },
    { id: 'projectManager',        label: 'Project Manager' },
    { id: 'seniorOperationsLead',  label: 'Senior Operations Lead' },
    { id: 'supervisor',            label: 'Supervisor' },
    { id: 'coordinator',           label: 'Coordinator' },
    { id: 'dataTeam',              label: 'Data Team' },
    { id: 'dataCollector',         label: 'Data Collector' },
    { id: 'reviewer',              label: 'Reviewer' },
    { id: 'hr',                    label: 'HR' },
    { id: 'hrManager',             label: 'HR Manager' },
    { id: 'employee',              label: 'Employee' },
    { id: 'auditor',               label: 'Auditor' },
  ];

  const { data: survey, isLoading: surveyLoading } = useQuery<Survey>({
    queryKey: ['survey', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('surveys').select('*').eq('id', id!).single();
      if (error) throw error;
      setEditTitle(data.title);
      setEditTitleAr(data.title_ar ?? '');
      setEditDesc(data.description ?? '');
      setEditDescAr(data.description_ar ?? '');
      const s = (data.settings ?? {}) as Record<string, unknown>;
      setSettingsForm({
        response_limit: s.response_limit != null ? String(s.response_limit) : '',
        expires_at: s.expires_at ? String(s.expires_at).slice(0, 16) : '',
        allow_multiple: Boolean(s.allow_multiple),
        multi_page: Boolean(s.multi_page),
        show_progress: s.show_progress !== false,
        thank_you_message: String(s.thank_you_message ?? ''),
        thank_you_message_ar: String(s.thank_you_message_ar ?? ''),
        activate_at: s.activate_at ? String(s.activate_at).slice(0, 16) : '',
        fill_password: String(s.fill_password ?? ''),
        notify_emails: String(s.notify_emails ?? ''),
        is_template: Boolean(s.is_template),
        reminder_enabled: Boolean(s.reminder_enabled),
        reminder_emails: String(s.reminder_emails ?? ''),
        reminder_phones: String(s.reminder_phones ?? ''),
        reminder_days_before: String(s.reminder_days_before ?? '1,3,7'),
        reminder_roles: Array.isArray(s.reminder_roles) ? (s.reminder_roles as string[]) : [],
        reminder_user_ids: Array.isArray(s.reminder_user_ids) ? (s.reminder_user_ids as string[]) : [],
        target_user_ids: Array.isArray(s.target_user_ids) ? (s.target_user_ids as string[]) : [],
        reminder_message_en: String(s.reminder_message_en ?? ''),
        reminder_message_ar: String(s.reminder_message_ar ?? ''),
        thankyou_notify_message_en: String(s.thankyou_notify_message_en ?? ''),
        thankyou_notify_message_ar: String(s.thankyou_notify_message_ar ?? ''),
      });
      return data as Survey;
    },
  });

  const { data: waUsers = [] } = useQuery<{ id: string; full_name: string | null; role: string | null; phone: string | null }[]>({
    queryKey: ['wa-reminder-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, phone')
        .order('full_name');
      if (error) throw error;
      return (data ?? []).filter(u => u.phone?.trim());
    },
  });

  const { data: allUsers = [] } = useQuery<{ id: string; full_name: string | null; role: string | null; phone: string | null; email: string | null }[]>({
    queryKey: ['survey-all-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, phone, email')
        .order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: questions = [], isLoading: qLoading } = useQuery<Question[]>({
    queryKey: ['survey-questions', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('survey_questions').select('*').eq('survey_id', id!).order('order_index');
      if (error) throw error;
      return (data ?? []) as Question[];
    },
  });

  const { data: responses = [], isLoading: rLoading } = useQuery<Response[]>({
    queryKey: ['survey-responses', id],
    enabled: !!id && tab !== 'builder',
    queryFn: async () => {
      const { data, error } = await supabase.from('survey_responses').select('*').eq('survey_id', id!).order('submitted_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Response[];
    },
  });

  const { data: allAnswers = [], isLoading: allAnswersLoading } = useQuery<Answer[]>({
    queryKey: ['survey-answers', id, responses.map(r => r.id)],
    enabled: !!id && tab !== 'builder' && responses.length > 0,
    queryFn: async () => {
      const rIds = responses.map(r => r.id);
      if (!rIds.length) return [];
      const { data, error } = await supabase.from('survey_answers').select('*').in('response_id', rIds);
      if (error) throw error;
      return (data ?? []) as Answer[];
    },
  });

  // ── Target respondent computed values ──────────────────────────────────────
  const submittedUserIds = new Set(
    responses.map(r => r.respondent_id).filter(Boolean) as string[]
  );
  const targetUserProfiles = allUsers.filter(u => settingsForm.target_user_ids.includes(u.id));
  const pendingTargetUsers = targetUserProfiles.filter(u => !submittedUserIds.has(u.id));
  const submittedTargetUsers = targetUserProfiles.filter(u => submittedUserIds.has(u.id));

  const saveMeta = async () => {
    if (!id || !editTitle.trim()) return;
    setSavingMeta(true);
    try {
      const { error } = await supabase.from('surveys').update({
        title: editTitle.trim(),
        title_ar: editTitleAr.trim() || null,
        description: editDesc.trim() || null,
        description_ar: editDescAr.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['survey', id] });
      qc.invalidateQueries({ queryKey: ['surveys'] });
      toast({ title: 'Survey saved' });
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally { setSavingMeta(false); }
  };

  const saveSettings = async () => {
    if (!id) return;
    setSavingSettings(true);
    try {
      const updatedSettings: Record<string, unknown> = {
        ...(survey?.settings ?? {}),
        response_limit: settingsForm.response_limit ? parseInt(settingsForm.response_limit, 10) : null,
        expires_at: settingsForm.expires_at || null,
        allow_multiple: settingsForm.allow_multiple,
        multi_page: settingsForm.multi_page,
        show_progress: settingsForm.show_progress,
        thank_you_message: settingsForm.thank_you_message || null,
        thank_you_message_ar: settingsForm.thank_you_message_ar || null,
        activate_at: settingsForm.activate_at || null,
        fill_password: settingsForm.fill_password.trim() || null,
        notify_emails: settingsForm.notify_emails.trim() || null,
        is_template: settingsForm.is_template,
        reminder_enabled: settingsForm.reminder_enabled,
        reminder_emails: settingsForm.reminder_emails.trim() || null,
        reminder_roles: settingsForm.reminder_roles.length ? settingsForm.reminder_roles : null,
        reminder_user_ids: settingsForm.reminder_user_ids.length ? settingsForm.reminder_user_ids : null,
        reminder_phones: settingsForm.reminder_phones.trim() || null,
        reminder_days_before: settingsForm.reminder_days_before.trim() || '1,3,7',
        target_user_ids: settingsForm.target_user_ids.length ? settingsForm.target_user_ids : null,
        reminder_message_en: settingsForm.reminder_message_en.trim() || null,
        reminder_message_ar: settingsForm.reminder_message_ar.trim() || null,
        thankyou_notify_message_en: settingsForm.thankyou_notify_message_en.trim() || null,
        thankyou_notify_message_ar: settingsForm.thankyou_notify_message_ar.trim() || null,
      };
      const { error } = await supabase.from('surveys').update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['survey', id] });
      qc.invalidateQueries({ queryKey: ['surveys'] });
      toast({ title: 'Settings saved' });
    } catch (e: unknown) {
      toast({ title: 'Error', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  const invokeReminder = async (testMode: boolean) => {
    const { data, error } = await supabase.functions.invoke('survey-reminder-test', {
      body: { survey_id: id, test_mode: testMode },
    });
    if (error) {
      // Supabase wraps non-2xx as FunctionsHttpError — context is a Response whose body
      // may already be consumed; use text() then parse manually to extract the real message.
      let msg = error.message ?? 'Edge function error';
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = await (error as any).context?.text?.();
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.error) msg = parsed.error;
            else if (parsed?.message) msg = parsed.message;
          } catch { msg = raw; }
        }
      } catch { /* keep error.message */ }
      throw new Error(msg);
    }
    if (!data?.ok) throw new Error(data?.error ?? (testMode ? 'Test failed' : 'Send failed'));
    return data;
  };

  const sendTestReminder = async () => {
    if (!id) return;
    setTestingReminder(true);
    setTestReminderResult(null);
    try {
      const data = await invokeReminder(true);
      setTestReminderResult(data);
      const waNote = data.wa_sent === 0 && data.wa_errors?.length
        ? ` (WA error: ${data.wa_errors[0]})`
        : '';
      toast({
        title: 'Test reminder sent',
        description: `${data.wa_sent}/${data.wa_total} WhatsApp · ${data.emails_sent}/${data.emails_total} email${waNote}`,
        variant: data.wa_sent === 0 && data.wa_total > 0 ? 'destructive' : 'default',
      });
    } catch (e: unknown) {
      toast({ title: 'Test failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setTestingReminder(false);
    }
  };

  const sendRealReminder = async () => {
    if (!id) return;
    setSendingReminder(true);
    setSendReminderResult(null);
    try {
      const data = await invokeReminder(false);
      setSendReminderResult(data);
      const waNote = data.wa_sent === 0 && data.wa_errors?.length
        ? ` (WA error: ${data.wa_errors[0]})`
        : '';
      toast({
        title: 'Reminder sent',
        description: `${data.wa_sent}/${data.wa_total} WhatsApp · ${data.emails_sent}/${data.emails_total} email${waNote}`,
        variant: data.wa_sent === 0 && data.wa_total > 0 ? 'destructive' : 'default',
      });
    } catch (e: unknown) {
      toast({ title: 'Send failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSendingReminder(false);
    }
  };

  const sendManualNotif = async (type: 'reminder' | 'thankyou' | 'all') => {
    if (!id) return;
    const recipients = type === 'reminder' ? pendingTargetUsers
      : type === 'thankyou' ? submittedTargetUsers
      : targetUserProfiles;
    if (!recipients.length) {
      toast({ title: 'No recipients', description: 'No users match this notification type.', variant: 'destructive' });
      return;
    }
    if (!notifChannels.email && !notifChannels.whatsapp) {
      toast({ title: 'Select a channel', description: 'Enable at least one channel (WhatsApp or Email).', variant: 'destructive' });
      return;
    }
    setSendingManualNotif(type);
    setManualNotifResult(null);
    let waSent = 0; let waTotal = 0; let emailSent = 0; let emailTotal = 0;
    try {
      const surveyUrl = `${window.location.origin}/s/${survey?.short_code ?? id}`;
      const isThankYou = type === 'thankyou';
      const messageEn = isThankYou
        ? (settingsForm.thankyou_notify_message_en.trim() || `Thank you for completing "${survey?.title ?? ''}"! Your response has been recorded.`)
        : (settingsForm.reminder_message_en.trim() || `Reminder: Please complete the survey "${survey?.title ?? ''}" — ${surveyUrl}`);
      const messageAr = isThankYou
        ? (settingsForm.thankyou_notify_message_ar.trim() || `شكراً لإتمامك "${(survey as any)?.title_ar ?? survey?.title ?? ''}"! تم تسجيل إجابتك.`)
        : (settingsForm.reminder_message_ar.trim() || `تذكير: يرجى إكمال الاستبيان "${(survey as any)?.title_ar ?? survey?.title ?? ''}" — ${surveyUrl}`);

      if (notifChannels.whatsapp) {
        const waUserIds = recipients.filter(u => u.phone?.trim()).map(u => u.id);
        waTotal = waUserIds.length;
        if (waUserIds.length > 0) {
          const { data: waData } = await supabase.functions.invoke('send-whatsapp', {
            body: {
              user_ids: waUserIds,
              event_type: 'broadcast',
              data: { message: messageEn, message_ar: messageAr },
            },
          });
          waSent = (waData as any)?.sent ?? 0;
        }
      }

      if (notifChannels.email) {
        const emailRecips = recipients.filter(u => (u.email as string | null)?.trim());
        emailTotal = emailRecips.length;
        for (const u of emailRecips) {
          try {
            await supabase.functions.invoke('send-email', {
              body: {
                to: u.email as string,
                subject: isThankYou ? `Thank you: ${survey?.title ?? 'Survey'}` : `Reminder: ${survey?.title ?? 'Survey'}`,
                html: `<p>Dear ${u.full_name ?? 'Respondent'},</p><p>${messageEn}</p>${!isThankYou ? `<p><a href="${surveyUrl}" style="background:#4f46e5;color:#fff;padding:8px 18px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px">Open Survey</a></p>` : ''}`,
              },
            });
            emailSent++;
          } catch { /* non-fatal per-email error */ }
        }
      }

      setManualNotifResult({ type, wa_sent: waSent, wa_total: waTotal, email_sent: emailSent, email_total: emailTotal });
      const desc = [
        notifChannels.whatsapp ? `${waSent}/${waTotal} WhatsApp` : '',
        notifChannels.email ? `${emailSent}/${emailTotal} email` : '',
      ].filter(Boolean).join(' · ');
      toast({ title: isThankYou ? 'Thank-you sent' : 'Reminder sent', description: desc });
    } catch (e: unknown) {
      toast({ title: 'Send failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSendingManualNotif(null);
    }
  };

  const changeStatus = useMutation({
    mutationFn: async (status: SurveyStatus) => {
      const { error } = await supabase.from('surveys').update({ status, updated_at: new Date().toISOString() }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['survey', id] });
      qc.invalidateQueries({ queryKey: ['surveys'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const addQuestion = useMutation({
    mutationFn: async ({ type, groupId, overrides }: {
      type: QuestionType;
      groupId?: string | null;
      overrides?: Partial<{ label: string; label_ar: string | null; required: boolean; options: string[] | null; settings: Record<string, unknown> }>;
    }) => {
      const resolvedGroupId = groupId ?? null;
      const siblings = questions.filter(q => (q.group_id ?? null) === resolvedGroupId);
      const nextIndex = siblings.length > 0 ? Math.max(...siblings.map(q => q.order_index)) + 1 : questions.length;
      const defaultLabel =
        type === 'section_header' ? 'Section Title' :
        type === 'begin_group'    ? 'Group Name'    : 'Untitled question';
      const defaultSettings: Record<string, unknown> =
        type === 'scale' ? { min: 1, max: 10 } :
        type === 'grid_table' ? {
          grid_columns: [
            { id: 'col_1', label: 'Column 1', type: 'text' },
            { id: 'col_2', label: 'Column 2', type: 'text' },
            { id: 'col_3', label: 'Column 3', type: 'text' },
          ],
          min_rows: 1,
          max_rows: 10,
        } :
        type === 'likert' ? {
          likert_rows: ['Row 1', 'Row 2', 'Row 3'],
          likert_cols: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'],
        } : {};
      const { error } = await supabase.from('survey_questions').insert({
        survey_id: id,
        type,
        label: overrides?.label ?? defaultLabel,
        label_ar: overrides?.label_ar ?? null,
        required: overrides?.required ?? false,
        order_index: nextIndex,
        options: overrides?.options ?? (type === 'yesno' ? ['Yes', 'No'] : ['radio','checkbox','dropdown'].includes(type) ? ['Option 1', 'Option 2'] : null),
        settings: { ...defaultSettings, ...(overrides?.settings ?? {}) },
        group_id: resolvedGroupId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['survey-questions', id] });
      setAddTypeOpen(false);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateQuestion = useMutation({
    mutationFn: async (q: Partial<Question> & { id: string }) => {
      const { id: qid, ...rest } = q;
      const { error } = await supabase.from('survey_questions').update(rest).eq('id', qid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['survey-questions', id] }),
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteQuestion = useMutation({
    mutationFn: async (qid: string) => {
      // First ungroup any children of this group
      await supabase.from('survey_questions').update({ group_id: null }).eq('group_id', qid);
      const { error } = await supabase.from('survey_questions').delete().eq('id', qid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['survey-questions', id] }),
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const reorderQuestion = async (qid: string, direction: 'up' | 'down') => {
    const q = questions.find(x => x.id === qid);
    if (!q) return;
    const siblings = [...questions]
      .filter(x => (x.group_id ?? null) === (q.group_id ?? null))
      .sort((a, b) => a.order_index - b.order_index);
    const idx = siblings.findIndex(x => x.id === qid);
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === siblings.length - 1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    const a = siblings[idx], b = siblings[swapIdx];
    await Promise.all([
      supabase.from('survey_questions').update({ order_index: b.order_index }).eq('id', a.id),
      supabase.from('survey_questions').update({ order_index: a.order_index }).eq('id', b.id),
    ]);
    qc.invalidateQueries({ queryKey: ['survey-questions', id] });
  };

  // ── Section-block move: swaps entire section (header + its questions) ────────
  const applySectionBlockOrder = async (newBlocks: SectionBlock[]) => {
    const flatNew = newBlocks.flatMap(b => [...(b.header ? [b.header] : []), ...b.items]);
    const updates = flatNew
      .map((q, i) => ({ id: q.id, newIndex: i }))
      .filter(({ id, newIndex }) => (questions.find(q => q.id === id)?.order_index ?? newIndex) !== newIndex);
    if (updates.length === 0) return;
    await Promise.all(updates.map(({ id, newIndex }) =>
      supabase.from('survey_questions').update({ order_index: newIndex }).eq('id', id)
    ));
    qc.invalidateQueries({ queryKey: ['survey-questions', id] });
  };

  const moveSectionBlock = async (sectionId: string, direction: 'up' | 'down') => {
    const blocks = buildSectionBlocks(questions);
    const sectionBlocks = blocks.filter(b => b.header !== null);
    const sectionPos = sectionBlocks.findIndex(b => b.header!.id === sectionId);
    if (sectionPos === -1) return;
    if (direction === 'up' && sectionPos === 0) return;
    if (direction === 'down' && sectionPos === sectionBlocks.length - 1) return;
    const swapPos = direction === 'up' ? sectionPos - 1 : sectionPos + 1;
    const newSectionBlocks = [...sectionBlocks];
    [newSectionBlocks[sectionPos], newSectionBlocks[swapPos]] = [newSectionBlocks[swapPos], newSectionBlocks[sectionPos]];
    // Rebuild full blocks array preserving any unsectioned block at the front
    const unsectioned = blocks.find(b => b.header === null);
    const newBlocks: SectionBlock[] = [
      ...(unsectioned ? [unsectioned] : []),
      ...newSectionBlocks,
    ];
    await applySectionBlockOrder(newBlocks);
  };

  const dropSectionOnSection = async (targetSectionId: string) => {
    if (!draggedQId || draggedQId === targetSectionId) { setDraggedQId(null); return; }
    const dragged = questions.find(x => x.id === draggedQId);
    if (!dragged || dragged.type !== 'section_header') { setDraggedQId(null); return; }
    const blocks = buildSectionBlocks(questions);
    const fromIdx = blocks.findIndex(b => b.header?.id === draggedQId);
    const toIdx = blocks.findIndex(b => b.header?.id === targetSectionId);
    if (fromIdx === -1 || toIdx === -1) { setDraggedQId(null); return; }
    const newBlocks = [...blocks];
    const [removed] = newBlocks.splice(fromIdx, 1);
    newBlocks.splice(toIdx, 0, removed);
    await applySectionBlockOrder(newBlocks);
    setDraggedQId(null);
  };

  // ── Move a single question to a target section (append at end of that block) ─
  const moveQuestionToSection = async (questionId: string, targetSectionId: string | 'top') => {
    const allTopLevel = [...questions]
      .filter(x => (x.group_id ?? null) === null)
      .sort((a, b) => a.order_index - b.order_index);
    const movedQ = allTopLevel.find(x => x.id === questionId);
    if (!movedQ) return;
    const withoutQ = allTopLevel.filter(x => x.id !== questionId);
    const blocks = buildSectionBlocks(questions);
    let insertIdx: number;
    if (targetSectionId === 'top') {
      // Insert before the first section header (or at position 0)
      const firstSectionIdx = withoutQ.findIndex(x => x.type === 'section_header');
      insertIdx = firstSectionIdx === -1 ? 0 : firstSectionIdx;
    } else {
      const block = blocks.find(b => b.header?.id === targetSectionId);
      if (!block) return;
      const lastItem = block.items.at(-1) ?? block.header;
      insertIdx = lastItem ? withoutQ.findIndex(x => x.id === lastItem!.id) + 1 : withoutQ.length;
    }
    withoutQ.splice(insertIdx, 0, movedQ);
    const updates = withoutQ
      .map((q, i) => ({ id: q.id, newIndex: i }))
      .filter(({ id, newIndex }) => (questions.find(q => q.id === id)?.order_index ?? newIndex) !== newIndex);
    if (updates.length > 0) {
      await Promise.all(updates.map(({ id, newIndex }) =>
        supabase.from('survey_questions').update({ order_index: newIndex }).eq('id', id)
      ));
      qc.invalidateQueries({ queryKey: ['survey-questions', id] });
    }
  };

  // ── Duplicate an entire section (header + all its questions) ─────────────────
  const duplicateSectionBlock = async (sectionId: string) => {
    const blocks = buildSectionBlocks(questions);
    const block = blocks.find(b => b.header?.id === sectionId);
    if (!block?.header) return;
    const maxOrder = questions.length > 0 ? Math.max(...questions.map(q => q.order_index)) : -1;
    const { data: newHdr, error: hdrErr } = await supabase.from('survey_questions').insert({
      survey_id: id, type: 'section_header',
      label: `${block.header.label} (Copy)`, label_ar: block.header.label_ar,
      description: block.header.description, description_ar: block.header.description_ar,
      required: false, order_index: maxOrder + 1, settings: {},
    }).select().single();
    if (hdrErr || !newHdr) { toast({ title: 'Error duplicating section', variant: 'destructive' }); return; }
    for (let i = 0; i < block.items.length; i++) {
      const q = block.items[i];
      await supabase.from('survey_questions').insert({
        survey_id: id, type: q.type,
        label: q.label, label_ar: q.label_ar,
        description: q.description, description_ar: q.description_ar,
        required: q.required, options: q.options, options_ar: q.options_ar,
        order_index: maxOrder + 2 + i,
        settings: { ...q.settings, skip_logic: undefined },
        group_id: null,
      });
    }
    qc.invalidateQueries({ queryKey: ['survey-questions', id] });
    toast({ title: `Section duplicated`, description: `Copied "${block.header.label}" with ${block.items.length} question${block.items.length !== 1 ? 's' : ''}` });
  };

  const duplicateQuestion = useMutation({
    mutationFn: async (q: Question) => {
      const siblings = questions.filter(x => (x.group_id ?? null) === (q.group_id ?? null));
      const { error } = await supabase.from('survey_questions').insert({
        survey_id: id,
        type: q.type,
        label: `${q.label} (Copy)`,
        description: q.description,
        required: q.required,
        options: q.options,
        order_index: siblings.length > 0 ? Math.max(...siblings.map(x => x.order_index)) + 1 : questions.length,
        settings: { ...q.settings, skip_logic: undefined },
        group_id: q.group_id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['survey-questions', id] }),
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteResponse = useMutation({
    mutationFn: async (rid: string) => {
      await supabase.from('survey_answers').delete().eq('response_id', rid);
      const { error } = await supabase.from('survey_responses').delete().eq('id', rid);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['survey-responses', id] });
      qc.invalidateQueries({ queryKey: ['survey-answers', id] });
      setSelectedSubmission(null);
      setDeleteResponseTarget(null);
      toast({ title: 'Submission deleted' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const copyFillLink = () => {
    const slug = survey?.short_code ?? survey?.id ?? id;
    const url = `${window.location.origin}/s/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: 'Link copied!', description: 'Share this link with your respondents.' });
    }).catch(() => {
      toast({ title: 'Link', description: url });
    });
  };

  const exportCSV = async () => {
    if (!responses.length) return;
    const rIds = responses.map(r => r.id);
    const { data: ans } = await supabase.from('survey_answers').select('*').in('response_id', rIds);
    const cols = questions.filter(q => !['section_header','begin_group'].includes(q.type));
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ['Respondent Name','Respondent Email','Submitted At',...cols.map(q => esc(q.label))].join(',');
    const rows = responses.map(r => {
      const ra = (ans ?? []).filter(a => a.response_id === r.id);
      const cells = cols.map(q => {
        const a = ra.find(x => x.question_id === q.id);
        if (!a) return '""';
        if (q.type === 'grid_table') {
          const gridRows = (() => { try { const p = typeof a.answer_json === 'string' ? JSON.parse(a.answer_json) : a.answer_json; return Array.isArray(p) ? p as Array<Record<string, string>> : null; } catch { return null; } })();
          if (!gridRows) return '""';
          return esc(gridRows.map((row, i) => `R${i + 1}: ${Object.values(row).join(' | ')}`).join('; '));
        }
        if (q.type === 'likert') {
          const val = (() => { try { return typeof a.answer_json === 'object' && !Array.isArray(a.answer_json) ? a.answer_json as Record<string, string> : JSON.parse(String(a.answer_json)); } catch { return null; } })();
          if (!val) return '""';
          return esc(Object.entries(val).map(([row, col]) => `${row}: ${col}`).join(' | '));
        }
        if (Array.isArray(a.answer_json)) return esc((a.answer_json as string[]).join('; '));
        if (a.answer_text) return esc(a.answer_text);
        if (a.answer_json !== null && a.answer_json !== undefined) return esc(String(a.answer_json));
        return '""';
      });
      return [esc(r.respondent_name ?? ''), esc(r.respondent_email ?? ''), esc(format(new Date(r.submitted_at), 'yyyy-MM-dd HH:mm:ss')), ...cells].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${survey?.title ?? 'survey'}_responses.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = async () => {
    if (!responses.length) return;
    const rIds = responses.map(r => r.id);
    const { data: ans } = await supabase.from('survey_answers').select('*').in('response_id', rIds);
    const cols = questions.filter(q => !['section_header','begin_group'].includes(q.type));
    const header = ['Respondent Name','Respondent Email','Submitted At',...cols.map(q => q.label)];
    const rows = responses.map(r => {
      const ra = (ans ?? []).filter(a => a.response_id === r.id);
      const cells = cols.map(q => {
        const a = ra.find(x => x.question_id === q.id);
        if (!a) return '';
        if (q.type === 'grid_table') {
          const gridRows = (() => { try { const p = typeof a.answer_json === 'string' ? JSON.parse(a.answer_json) : a.answer_json; return Array.isArray(p) ? p as Array<Record<string, string>> : null; } catch { return null; } })();
          return gridRows ? gridRows.map((row, i) => `R${i + 1}: ${Object.values(row).join(' | ')}`).join('; ') : '';
        }
        if (q.type === 'likert') {
          const val = (() => { try { return typeof a.answer_json === 'object' && !Array.isArray(a.answer_json) ? a.answer_json as Record<string, string> : JSON.parse(String(a.answer_json)); } catch { return null; } })();
          return val ? Object.entries(val).map(([row, col]) => `${row}: ${col}`).join(' | ') : '';
        }
        if (Array.isArray(a.answer_json)) return (a.answer_json as string[]).join('; ');
        if (a.answer_text) return a.answer_text;
        if (a.answer_json !== null && a.answer_json !== undefined) return String(a.answer_json);
        return '';
      });
      return [r.respondent_name ?? '', r.respondent_email ?? '', format(new Date(r.submitted_at), 'yyyy-MM-dd HH:mm:ss'), ...cells];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Responses');
    XLSX.writeFile(wb, `${survey?.title ?? 'survey'}_responses.xlsx`);
  };

  const getAnswerDisplay = (q: Question, ans?: Answer): string => {
    if (!ans) return '';
    if (q.type === 'grid_table') {
      if (Array.isArray(ans.answer_json)) return `${(ans.answer_json as unknown[]).length} row(s)`;
      return '';
    }
    if (q.type === 'likert') {
      if (ans.answer_json && typeof ans.answer_json === 'object' && !Array.isArray(ans.answer_json)) {
        const entries = Object.entries(ans.answer_json as Record<string, string>);
        return entries.map(([r, c]) => `${r}: ${c}`).join(' | ');
      }
      return '';
    }
    if (q.type === 'signature') return ans.answer_json ? '[signature]' : '';
    if (Array.isArray(ans.answer_json)) return (ans.answer_json as string[]).join(', ');
    if (ans.answer_text) return ans.answer_text;
    if (ans.answer_json !== null && ans.answer_json !== undefined) return String(ans.answer_json);
    return '';
  };

  // Question library helpers
  const LIBRARY_KEY = 'pact_survey_library';
  const getLibrary = (): (Partial<Question> & { _libId: string; _libName: string })[] => {
    try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]'); } catch { return []; }
  };
  const saveToLibrary = (q: Question) => {
    const lib = getLibrary();
    const entry = {
      _libId: crypto.randomUUID(),
      _libName: q.label,
      type: q.type, label: q.label, label_ar: q.label_ar,
      description: q.description, description_ar: q.description_ar,
      options: q.options, options_ar: q.options_ar,
      settings: { ...q.settings, skip_logic: undefined },
      required: q.required,
    };
    localStorage.setItem(LIBRARY_KEY, JSON.stringify([...lib, entry]));
    toast({ title: 'Saved to library' });
    setLibrarySaveTarget(null);
  };
  const removeFromLibrary = (libId: string) => {
    const lib = getLibrary().filter(e => e._libId !== libId);
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
    toast({ title: 'Removed from library' });
  };

  const getChartData = (q: Question) => {
    const qAnswers = allAnswers.filter(a => a.question_id === q.id);
    if (['radio', 'dropdown'].includes(q.type)) {
      const counts: Record<string, number> = {};
      for (const a of qAnswers) if (a.answer_text) counts[a.answer_text] = (counts[a.answer_text] ?? 0) + 1;
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }
    if (q.type === 'checkbox') {
      const counts: Record<string, number> = {};
      for (const a of qAnswers) {
        const arr = Array.isArray(a.answer_json) ? a.answer_json as string[] : [];
        for (const v of arr) counts[v] = (counts[v] ?? 0) + 1;
      }
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }
    if (q.type === 'rating') {
      const counts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
      for (const a of qAnswers) {
        const v = String(a.answer_json ?? a.answer_text ?? '');
        if (v in counts) counts[v]++;
      }
      return Object.entries(counts).map(([name, value]) => ({ name: `★${name}`, value }));
    }
    if (q.type === 'scale') {
      const counts: Record<string, number> = {};
      for (const a of qAnswers) {
        const v = String(a.answer_json ?? a.answer_text ?? '');
        if (v) counts[v] = (counts[v] ?? 0) + 1;
      }
      return Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0])).map(([name, value]) => ({ name, value }));
    }
    return [];
  };

  const getTextAnswers = (q: Question) =>
    allAnswers.filter(a => a.question_id === q.id && (a.answer_text ?? '').trim()).map(a => a.answer_text!);

  const getAvgRating = (q: Question) => {
    const qAnswers = allAnswers.filter(a => a.question_id === q.id);
    const nums = qAnswers.map(a => Number(a.answer_json ?? a.answer_text)).filter(n => !isNaN(n) && n > 0);
    return nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(1) : null;
  };

  // ── Analytics helpers ──────────────────────────────────────────────────────
  const getDurationStats = () => {
    const durations = responses.map(r => r.duration_seconds).filter((d): d is number => d != null && d > 0);
    if (durations.length === 0) return null;
    const sorted = [...durations].sort((a, b) => a - b);
    const avg = Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
    const median = sorted.length % 2 === 0
      ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
      : sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    // Build histogram buckets
    const buckets = [
      { label: '<30s', from: 0, to: 30 },
      { label: '30–60s', from: 30, to: 60 },
      { label: '1–2m', from: 60, to: 120 },
      { label: '2–5m', from: 120, to: 300 },
      { label: '5–10m', from: 300, to: 600 },
      { label: '10–15m', from: 600, to: 900 },
      { label: '15m+', from: 900, to: Infinity },
    ].map(b => ({ ...b, count: durations.filter(d => d >= b.from && d < b.to).length }))
      .filter(b => b.count > 0);
    return { avg, median, min, max, count: durations.length, buckets };
  };

  const getCrossTabData = (rowQId: string, colQId: string) => {
    const rowQ = nonStructural.find(q => q.id === rowQId);
    const colQ = nonStructural.find(q => q.id === colQId);
    if (!rowQ || !colQ) return null;
    const rowOpts = rowQ.options ?? [...new Set(allAnswers.filter(a => a.question_id === rowQId && a.answer_text).map(a => a.answer_text!))];
    const colOpts = colQ.options ?? [...new Set(allAnswers.filter(a => a.question_id === colQId && a.answer_text).map(a => a.answer_text!))];
    const table: Record<string, Record<string, number>> = {};
    for (const r of rowOpts) { table[r] = {}; for (const c of colOpts) table[r][c] = 0; }
    for (const resp of responses) {
      const rowAns = allAnswers.find(a => a.response_id === resp.id && a.question_id === rowQId);
      const colAns = allAnswers.find(a => a.response_id === resp.id && a.question_id === colQId);
      const rv = rowAns?.answer_text;
      const cv = colAns?.answer_text;
      if (rv && cv && table[rv] && cv in table[rv]) table[rv][cv]++;
    }
    return { rowQ, colQ, rowOpts, colOpts, table };
  };

  const getTimelineData = () => {
    if (responses.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const r of [...responses].sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())) {
      const day = format(new Date(r.submitted_at), 'MMM d');
      counts[day] = (counts[day] ?? 0) + 1;
    }
    return Object.entries(counts).map(([date, count]) => ({ date, count }));
  };

  const getResponseRate = (q: Question) => {
    const answered = new Set(allAnswers.filter(a => a.question_id === q.id).map(a => a.response_id)).size;
    const total = responses.length;
    return { answered, total, pct: total > 0 ? Math.round((answered / total) * 100) : 0 };
  };

  const getChoiceDistribution = (q: Question) => {
    const qAnswers = allAnswers.filter(a => a.question_id === q.id);
    const respondentCount = new Set(qAnswers.map(a => a.response_id)).size;
    const counts: Record<string, number> = {};
    if (['radio', 'dropdown'].includes(q.type)) {
      for (const a of qAnswers) if (a.answer_text) counts[a.answer_text] = (counts[a.answer_text] ?? 0) + 1;
    } else if (q.type === 'checkbox') {
      for (const a of qAnswers) {
        const arr = Array.isArray(a.answer_json) ? a.answer_json as string[] : [];
        for (const v of arr) counts[v] = (counts[v] ?? 0) + 1;
      }
    }
    const allOpts = (q.options ?? []).length > 0 ? q.options! : Object.keys(counts);
    return allOpts.map(opt => ({
      label: opt,
      count: counts[opt] ?? 0,
      pct: respondentCount > 0 ? Math.round(((counts[opt] ?? 0) / respondentCount) * 100) : 0,
    }));
  };

  const getRatingDistribution = (q: Question) => {
    const qAnswers = allAnswers.filter(a => a.question_id === q.id);
    const maxVal = q.type === 'rating' ? 5 : Number(q.settings?.max ?? 10);
    const minVal = q.type === 'rating' ? 1 : Number(q.settings?.min ?? 1);
    const counts: Record<number, number> = {};
    for (let i = minVal; i <= maxVal; i++) counts[i] = 0;
    for (const a of qAnswers) {
      const v = Number(a.answer_json ?? a.answer_text);
      if (!isNaN(v) && v >= minVal && v <= maxVal) counts[v] = (counts[v] ?? 0) + 1;
    }
    const maxCount = Math.max(...Object.values(counts), 1);
    return Object.entries(counts).map(([val, count]) => ({
      val: Number(val),
      count,
      barPct: Math.round((count / maxCount) * 100),
    }));
  };

  const toggleCollapsed = (gid: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  // ── Tree renderer (defined here to close over component state) ──────────────
  const renderQTree = (nodes: QTreeNode[], depth = 0): React.ReactNode => {
    return nodes.map(node => {
      if (node.q.type === 'begin_group') {
        const collapsed = collapsedGroups.has(node.q.id);
        const groupLabel = ALL_Q_TYPES.find(t => t.type === 'begin_group')?.label ?? 'Group';
        const childCount = node.children.length;
        return (
          <GroupPanel
            key={node.q.id}
            group={node.q}
            depth={depth}
            collapsed={collapsed}
            onToggleCollapse={() => toggleCollapsed(node.q.id)}
            allQuestions={questions}
            canManage={canManage}
            isEditing={editQId === node.q.id}
            onEdit={() => setEditQId(editQId === node.q.id ? null : node.q.id)}
            onUpdate={(patch) => updateQuestion.mutate({ id: node.q.id, ...patch })}
            onDelete={() => deleteQuestion.mutate(node.q.id)}
            onMoveUp={() => reorderQuestion(node.q.id, 'up')}
            onMoveDown={() => reorderQuestion(node.q.id, 'down')}
            saving={updateQuestion.isPending}
            deleting={deleteQuestion.isPending}
            onAddToGroup={() => { setAddToGroupId(node.q.id); setAddTypeOpen(true); }}
          >
            {!collapsed && (
              <div className="space-y-2">
                {node.children.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-slate-400 gap-1 bg-white/60 rounded-lg border border-dashed border-slate-300">
                    <Folder className="w-5 h-5 opacity-30" />
                    <p className="text-xs">Empty group — add questions below</p>
                  </div>
                ) : (
                  renderQTree(node.children, depth + 1)
                )}
                {canManage && (
                  <button
                    onClick={() => { setAddToGroupId(node.q.id); setAddTypeOpen(true); }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-indigo-200 text-indigo-500 text-xs font-medium hover:bg-indigo-50 hover:border-indigo-400 transition-colors"
                    data-testid={`btn-add-to-group-${node.q.id}`}
                  >
                    <Plus className="w-3 h-3" />Add question to this group
                  </button>
                )}
              </div>
            )}
          </GroupPanel>
        );
      }

      const siblings = questions
        .filter(x => (x.group_id ?? null) === (node.q.group_id ?? null))
        .sort((a, b) => a.order_index - b.order_index);
      const sibIdx = siblings.findIndex(x => x.id === node.q.id);

      return (
        <QuestionCard
          key={node.q.id}
          q={node.q}
          idx={sibIdx}
          total={siblings.length}
          allQuestions={questions}
          canManage={canManage}
          isEditing={editQId === node.q.id}
          onEdit={() => setEditQId(editQId === node.q.id ? null : node.q.id)}
          onUpdate={(patch) => updateQuestion.mutate({ id: node.q.id, ...patch })}
          onDelete={() => deleteQuestion.mutate(node.q.id)}
          onDuplicate={() => duplicateQuestion.mutate(node.q)}
          onMoveUp={() => reorderQuestion(node.q.id, 'up')}
          onMoveDown={() => reorderQuestion(node.q.id, 'down')}
          saving={updateQuestion.isPending}
          deleting={deleteQuestion.isPending}
          isDraggedOver={dragOverQId === node.q.id}
          onDragStart={() => setDraggedQId(node.q.id)}
          onDragOver={() => setDragOverQId(node.q.id)}
          onDragLeave={() => setDragOverQId(null)}
          onDrop={async () => {
            setDragOverQId(null);
            if (!draggedQId || draggedQId === node.q.id) { setDraggedQId(null); return; }
            const dragged = questions.find(x => x.id === draggedQId);
            if (!dragged) { setDraggedQId(null); return; }
            // Insert-before: move dragged item to just before the target item
            const sameLevel = [...questions]
              .filter(x => (x.group_id ?? null) === (node.q.group_id ?? null))
              .sort((a, b) => a.order_index - b.order_index);
            const withoutDragged = sameLevel.filter(x => x.id !== draggedQId);
            const targetIdx = withoutDragged.findIndex(x => x.id === node.q.id);
            if (targetIdx === -1) { setDraggedQId(null); return; }
            withoutDragged.splice(targetIdx, 0, dragged);
            const updates = withoutDragged
              .map((q, i) => ({ id: q.id, newIndex: i }))
              .filter(({ id, newIndex }) => (questions.find(q => q.id === id)?.order_index ?? newIndex) !== newIndex);
            if (updates.length > 0) {
              await Promise.all(updates.map(({ id, newIndex }) =>
                supabase.from('survey_questions').update({ order_index: newIndex }).eq('id', id)
              ));
              qc.invalidateQueries({ queryKey: ['survey-questions', id] });
            }
            setDraggedQId(null);
          }}
          isBulkSelected={bulkSelected.has(node.q.id)}
          onBulkToggle={(v) => {
            const next = new Set(bulkSelected);
            if (v) next.add(node.q.id); else next.delete(node.q.id);
            setBulkSelected(next);
          }}
          onSaveToLibrary={() => saveToLibrary(node.q)}
          sectionHeaders={questions.filter(q => q.type === 'section_header')}
          onMoveToSection={async (sid) => moveQuestionToSection(node.q.id, sid)}
        />
      );
    });
  };

  // ── Section-block renderer ────────────────────────────────────────────────
  const renderSectionBlocks = (): React.ReactNode => {
    const blocks = buildSectionBlocks(questions);
    const hasSections = blocks.some(b => b.header !== null);
    if (!hasSections) return renderQTree(buildQTree(questions));

    const sectionBlocks = blocks.filter(b => b.header !== null);
    const allTopLevelNodes = buildQTree(questions, null);

    return blocks.map((block) => {
      if (block.header === null) {
        if (block.items.length === 0) return null;
        const blockIds = new Set(block.items.map(q => q.id));
        return (
          <div key="__unsectioned" className="space-y-2">
            {renderQTree(allTopLevelNodes.filter(n => blockIds.has(n.q.id)))}
          </div>
        );
      }

      const hdr = block.header;
      const sectionIdx = sectionBlocks.findIndex(b => b.header!.id === hdr.id);
      const isCollapsed = collapsedSections.has(hdr.id);
      const blockIds = new Set(block.items.map(q => q.id));
      const blockNodes = allTopLevelNodes.filter(n => blockIds.has(n.q.id));

      return (
        <div key={hdr.id} className="rounded-xl border border-slate-200 overflow-hidden">
          {/* Section header — draggable, moves the entire block */}
          <QuestionCard
            q={hdr}
            idx={sectionIdx}
            total={sectionBlocks.length}
            allQuestions={questions}
            canManage={canManage}
            isEditing={editQId === hdr.id}
            onEdit={() => setEditQId(editQId === hdr.id ? null : hdr.id)}
            onUpdate={(patch) => updateQuestion.mutate({ id: hdr.id, ...patch })}
            onDelete={() => deleteQuestion.mutate(hdr.id)}
            onDuplicate={() => duplicateSectionBlock(hdr.id)}
            onMoveUp={() => moveSectionBlock(hdr.id, 'up')}
            onMoveDown={() => moveSectionBlock(hdr.id, 'down')}
            saving={updateQuestion.isPending}
            deleting={deleteQuestion.isPending}
            isDraggedOver={dragOverQId === hdr.id}
            onDragStart={() => setDraggedQId(hdr.id)}
            onDragOver={() => setDragOverQId(hdr.id)}
            onDragLeave={() => setDragOverQId(null)}
            onDrop={async () => { setDragOverQId(null); await dropSectionOnSection(hdr.id); }}
            isBulkSelected={bulkSelected.has(hdr.id)}
            onBulkToggle={(v) => { const n = new Set(bulkSelected); v ? n.add(hdr.id) : n.delete(hdr.id); setBulkSelected(n); }}
            onSaveToLibrary={() => saveToLibrary(hdr)}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => setCollapsedSections(prev => { const n = new Set(prev); n.has(hdr.id) ? n.delete(hdr.id) : n.add(hdr.id); return n; })}
            questionCount={block.items.length}
          />
          {/* Questions inside this section */}
          {!isCollapsed && (
            <div className="bg-white border-t border-slate-100">
              {block.items.length === 0 ? (
                <div className="flex items-center justify-center py-4 m-3 rounded-lg border border-dashed border-slate-200 text-slate-400 text-xs gap-1.5">
                  <Plus className="w-3 h-3" />No questions in this section yet — add one below
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {renderQTree(blockNodes)}
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  if (surveyLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading survey…
    </div>
  );
  if (!survey) return (
    <div className="max-w-2xl mx-auto p-8 text-center">
      <p className="text-slate-500">Survey not found.</p>
      <Link to="/surveys" className="text-indigo-600 underline mt-2 block">Back to Surveys</Link>
    </div>
  );

  const scfg = STATUS_CFG[survey.status];
  const nonStructural = questions.filter(q => !['section_header','begin_group','begin_repeat','note'].includes(q.type));

  const addGroupLabel = addToGroupId
    ? questions.find(q => q.id === addToGroupId)?.label ?? 'group'
    : null;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/surveys')} className="p-2 rounded-lg hover:bg-slate-100 mt-0.5" data-testid="btn-back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4 border', scfg.color)}>{scfg.label}</Badge>
            {survey.status === 'active' && (
              <>
                <a href={`/s/${survey.short_code ?? survey.id}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline">
                  <ExternalLink className="w-3 h-3" />Fill Link
                </a>
                <button
                  onClick={copyFillLink}
                  className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                  title="Copy fill link to clipboard"
                >
                  <Link2 className="w-3 h-3" />Copy Link
                </button>
                <button
                  onClick={() => setShareOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline font-medium"
                  title="Share — QR code, embed, WhatsApp"
                  data-testid="btn-share-survey"
                >
                  <Share2 className="w-3 h-3" />Share
                </button>
              </>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-800 mt-1">{survey.title}</h1>
          {survey.description && <p className="text-sm text-slate-500 mt-0.5">{survey.description}</p>}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Select value={survey.status} onValueChange={v => changeStatus.mutate(v as SurveyStatus)}>
              <SelectTrigger className="h-8 text-xs w-[110px]" data-testid="select-survey-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-0 overflow-x-auto">
        {([
          { id: 'builder',   label: 'Builder',   icon: Edit3,     badge: nonStructural.length },
          { id: 'responses', label: 'Responses', icon: Users,     badge: responses.length },
          { id: 'analytics', label: 'Analytics', icon: BarChart2, badge: 0 },
          { id: 'map',       label: 'Map',        icon: MapIcon,   badge: 0 },
          ...(canManage ? [{ id: 'settings' as const, label: 'Settings', icon: Settings, badge: 0 }] : []),
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === t.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            <t.icon className="w-3.5 h-3.5" />{t.label}
            {t.badge > 0 && (
              <span className="ml-0.5 px-1.5 py-0 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── BUILDER TAB ─────────────────────────────────────────────────────── */}
      {tab === 'builder' && (
        <div className="space-y-4">
          {/* Form version banner */}
          {survey && (
            <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-semibold text-indigo-700">Form Version {survey.form_version ?? 1}</span>
              </div>
              <span className="text-[11px] text-indigo-400 flex-1">Version is stored with each response for tracking changes over time.</span>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-100"
                  onClick={async () => {
                    const newVer = (survey.form_version ?? 1) + 1;
                    const { error } = await supabase.from('surveys').update({ form_version: newVer, updated_at: new Date().toISOString() }).eq('id', id!);
                    if (error) { toast({ title: 'Error bumping version', description: error.message, variant: 'destructive' }); return; }
                    qc.invalidateQueries({ queryKey: ['survey', id] });
                    toast({ title: `Bumped to Version ${newVer}`, description: 'New responses will be tagged with this version.' });
                  }}
                >
                  <Plus className="w-3 h-3" />Bump Version
                </Button>
              )}
            </div>
          )}
          {canManage && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Survey Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-title">Title <span className="text-slate-400 font-normal text-[10px]">(English)</span></Label>
                  <Input id="edit-title" value={editTitle} onChange={e => setEditTitle(e.target.value)} data-testid="input-survey-title" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-title-ar" className="flex items-center gap-1">
                    العنوان <span className="text-slate-400 font-normal text-[10px]">(Arabic)</span>
                  </Label>
                  <Input id="edit-title-ar" dir="rtl" lang="ar" value={editTitleAr} onChange={e => setEditTitleAr(e.target.value)} placeholder="العنوان بالعربية…" data-testid="input-survey-title-ar" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-desc">Description <span className="text-slate-400 font-normal text-[10px]">(English)</span></Label>
                  <Textarea id="edit-desc" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} data-testid="input-survey-desc" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-desc-ar">الوصف <span className="text-slate-400 font-normal text-[10px]">(Arabic)</span></Label>
                  <Textarea id="edit-desc-ar" dir="rtl" lang="ar" value={editDescAr} onChange={e => setEditDescAr(e.target.value)} rows={2} placeholder="الوصف بالعربية…" data-testid="input-survey-desc-ar" />
                </div>
              </div>
              <Button size="sm" onClick={saveMeta} disabled={savingMeta || !editTitle.trim()} data-testid="btn-save-meta">
                {savingMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                Save Details
              </Button>
            </div>
          )}

          {/* AI Generate Questions */}
          {canManage && (
            <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl border border-violet-100">
              <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-violet-800">AI Question Generator</p>
                <p className="text-[10px] text-violet-500 mt-0.5">Describe your topic and let AI generate survey questions in seconds</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setAiOpen(true)}
                  className="gap-1.5 text-xs border-violet-200 text-violet-700 hover:bg-violet-100"
                  data-testid="btn-ai-generate">
                  <Sparkles className="w-3.5 h-3.5" />Generate
                </Button>
                <Button size="sm" variant="outline" onClick={() => setImportXlsOpen(true)}
                  className="gap-1.5 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  data-testid="btn-import-xlsform" title="Import questions from XLSForm spreadsheet">
                  <Upload className="w-3.5 h-3.5" />Import XLS
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.print()}
                  className="gap-1.5 text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
                  title="Print form structure">
                  <FileText className="w-3.5 h-3.5" />Print
                </Button>
              </div>
            </div>
          )}

          {/* Builder search */}
          {questions.length > 2 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                value={builderSearch}
                onChange={e => setBuilderSearch(e.target.value)}
                placeholder="Search questions…"
                className="pl-9 h-8 text-sm"
                data-testid="input-builder-search"
              />
              {builderSearch && (
                <button onClick={() => setBuilderSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {nonStructural.length > 0 && !qLoading && (() => {
            const reqCount = nonStructural.filter(q => q.required).length;
            const condCount = nonStructural.filter(q => {
              const sl = q.settings?.skip_logic as SkipLogic | undefined;
              return !!(sl?.condition_question_id || (sl?.conditions && sl.conditions.length > 0));
            }).length;
            const groupCount = questions.filter(q => q.type === 'begin_group').length;
            return (
              <div className="flex items-center gap-3 text-[11px] text-slate-400 px-1 flex-wrap">
                <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{nonStructural.length} question{nonStructural.length !== 1 ? 's' : ''}</span>
                {groupCount > 0 && <span className="flex items-center gap-1 text-indigo-400"><Folder className="w-3 h-3" />{groupCount} group{groupCount !== 1 ? 's' : ''}</span>}
                {reqCount > 0 && <span className="flex items-center gap-1 text-red-400"><span className="font-bold">*</span>{reqCount} required</span>}
                {condCount > 0 && <span className="flex items-center gap-1 text-amber-500"><GitBranch className="w-3 h-3" />{condCount} conditional</span>}
              </div>
            );
          })()}

          <div className="space-y-2">
            {qLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading questions…
              </div>
            ) : questions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2 bg-white rounded-xl border border-dashed border-slate-300">
                <FileText className="w-8 h-8 opacity-30" />
                <p className="text-sm">No questions yet. Add your first question below.</p>
              </div>
            ) : builderSearch.trim() ? (
              (() => {
                const term = builderSearch.toLowerCase();
                const matches = questions.filter(q =>
                  q.label.toLowerCase().includes(term) ||
                  (q.label_ar ?? '').toLowerCase().includes(term) ||
                  (q.description ?? '').toLowerCase().includes(term) ||
                  q.type.includes(term)
                );
                if (matches.length === 0) return (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2 bg-white rounded-xl border border-dashed border-slate-200">
                    <Search className="w-6 h-6 opacity-30" />
                    <p className="text-sm">No questions match "{builderSearch}"</p>
                  </div>
                );
                return (
                  <div className="space-y-2">
                    <p className="text-[11px] text-indigo-600 flex items-center gap-1 px-1">
                      <Search className="w-3 h-3" />{matches.length} match{matches.length !== 1 ? 'es' : ''} for "{builderSearch}"
                    </p>
                    {matches.map((q, mi) => (
                      <QuestionCard
                        key={q.id}
                        q={q}
                        idx={mi}
                        total={matches.length}
                        questions={questions}
                        isEditing={editQId === q.id}
                        onEdit={() => setEditQId(editQId === q.id ? null : q.id)}
                        onUpdate={patch => updateQuestion.mutate({ id: q.id, patch })}
                        onDelete={() => deleteQuestion.mutate(q.id)}
                        onDuplicate={() => duplicateQuestion.mutate(q.id)}
                        onMoveUp={() => {}}
                        onMoveDown={() => {}}
                        deleting={deleteQuestion.isPending && deleteQuestion.variables === q.id}
                        saving={updateQuestion.isPending && updateQuestion.variables?.id === q.id}
                        canManage={canManage}
                        isDraggedOver={false}
                        onDragStart={() => {}}
                        onDragOver={() => {}}
                        onDragLeave={() => {}}
                        onDrop={() => {}}
                        isBulkSelected={bulkSelected.has(q.id)}
                        onBulkToggle={v => setBulkSelected(prev => { const n = new Set(prev); v ? n.add(q.id) : n.delete(q.id); return n; })}
                        onSaveToLibrary={() => { saveToLibrary(q); toast({ title: 'Saved to library' }); }}
                      />
                    ))}
                  </div>
                );
              })()
            ) : (
              renderSectionBlocks()
            )}
          </div>

          {/* Bulk select toolbar */}
          {canManage && bulkSelected.size > 0 && (
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
              <CheckSquare2 className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="text-xs font-semibold text-indigo-700">{bulkSelected.size} selected</span>
              <div className="flex items-center gap-1 ml-auto">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-violet-700 hover:bg-violet-100" onClick={() => {
                  const nonStructural = questions.filter(q => !['section_header','begin_group'].includes(q.type));
                  setBulkSelected(new Set(nonStructural.map(q => q.id)));
                }}>Select all</Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-6 px-2 text-xs text-emerald-700 hover:bg-emerald-100"
                  onClick={() => {
                    const lib = getLibrary();
                    const toSave = questions.filter(q => bulkSelected.has(q.id));
                    toSave.forEach(q => saveToLibrary(q));
                    toast({ title: `Saved ${toSave.length} question${toSave.length !== 1 ? 's' : ''} to library` });
                  }}
                ><BookOpen className="w-3 h-3 mr-1" />Save to library</Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-6 px-2 text-xs text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    if (!confirm(`Delete ${bulkSelected.size} selected question(s)?`)) return;
                    await Promise.all([...bulkSelected].map(qid => supabase.from('survey_questions').delete().eq('id', qid)));
                    qc.invalidateQueries({ queryKey: ['survey-questions', id] });
                    setBulkSelected(new Set());
                  }}
                ><Trash2 className="w-3 h-3 mr-1" />Delete</Button>
                <button onClick={() => setBulkSelected(new Set())} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X className="w-3 h-3" /></button>
              </div>
            </div>
          )}

          {canManage && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => { setAddToGroupId(null); setAddTypeOpen(true); }} className="flex-1 gap-1.5" data-testid="btn-add-question">
                <Plus className="w-4 h-4" />Add Question
              </Button>
              <Button variant="outline" onClick={() => setLibraryOpen(true)} className="gap-1.5 shrink-0 text-violet-600 border-violet-200 hover:bg-violet-50" data-testid="btn-library">
                <BookOpen className="w-4 h-4" />Library
              </Button>
            </div>
          )}

          {/* Question Library Dialog */}
          {libraryOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setLibraryOpen(false)}>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                  <BookOpen className="w-5 h-5 text-violet-500" />
                  <h3 className="text-sm font-bold text-slate-800 flex-1">Question Library</h3>
                  <button onClick={() => setLibraryOpen(false)} className="p-1 rounded hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
                </div>
                <div className="overflow-y-auto flex-1 p-4 space-y-2">
                  {getLibrary().length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <BookOpen className="w-8 h-8 opacity-20 mx-auto mb-2" />
                      <p className="text-sm">No saved questions yet.</p>
                      <p className="text-xs mt-1">Use the bookmark icon on any question to save it here.</p>
                    </div>
                  ) : (
                    getLibrary().map((item: Question) => (
                      <div key={item.id} className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-violet-300 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{item.label}</p>
                          <p className="text-[10px] text-slate-400 capitalize">{item.type.replace(/_/g, ' ')}</p>
                        </div>
                        <Button
                          size="sm"
                          className="h-6 px-2 text-xs bg-violet-600 hover:bg-violet-700 shrink-0"
                          onClick={async () => {
                            const maxOrder = questions.length > 0 ? Math.max(...questions.map(q => q.order_index)) : -1;
                            const { error } = await supabase.from('survey_questions').insert({
                              survey_id: id,
                              type: item.type,
                              label: item.label,
                              label_ar: item.label_ar,
                              description: item.description,
                              description_ar: item.description_ar,
                              options: item.options,
                              options_ar: item.options_ar,
                              required: item.required,
                              order_index: maxOrder + 1,
                              settings: { ...item.settings, skip_logic: undefined },
                            });
                            if (!error) {
                              qc.invalidateQueries({ queryKey: ['survey-questions', id] });
                              toast({ title: 'Question added from library' });
                            }
                          }}
                        >Add</Button>
                        <button onClick={() => { removeFromLibrary(item.id); }} className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-400" title="Remove from library">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── RESPONSES TAB ───────────────────────────────────────────────────── */}
      {tab === 'responses' && (
        <div className="space-y-3">
          {/* Toolbar */}
          {responses.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Review status filter chips */}
              <div className="flex items-center gap-1 flex-wrap w-full">
                {canManage && (
                  <label className="flex items-center gap-1.5 cursor-pointer mr-1" title="Select all">
                    <input type="checkbox"
                      checked={bulkResponses.size > 0 && bulkResponses.size === responses.length}
                      ref={el => { if (el) el.indeterminate = bulkResponses.size > 0 && bulkResponses.size < responses.length; }}
                      onChange={e => setBulkResponses(e.target.checked ? new Set(responses.map(r => r.id)) : new Set())}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-400 select-none">All</span>
                  </label>
                )}
                {[
                  { val: 'all', label: 'All', icon: ClipboardList },
                  { val: 'pending', label: 'Pending', icon: CircleDot },
                  { val: 'under_review', label: 'Under Review', icon: Eye },
                  { val: 'approved', label: 'Approved', icon: CheckCheck },
                  { val: 'rejected', label: 'Rejected', icon: CircleX },
                ].map(({ val, label, icon: Icon }) => {
                  const count = val === 'all' ? responses.length : responses.filter(r => (r.review_status ?? 'pending') === val).length;
                  return (
                    <button key={val} onClick={() => setReviewFilter(val)}
                      className={cn('flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                        reviewFilter === val
                          ? val === 'approved' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                            val === 'rejected' ? 'bg-red-50 border-red-200 text-red-700' :
                            val === 'under_review' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                            val === 'pending' ? 'bg-slate-100 border-slate-300 text-slate-700' :
                            'bg-indigo-50 border-indigo-200 text-indigo-700'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      )}
                    >
                      <Icon className="w-3 h-3" />{label}
                      <span className="ml-0.5 text-[10px] opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
              {/* Search */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search respondents…"
                  value={responseSearch}
                  onChange={e => setResponseSearch(e.target.value)}
                  className="w-full pl-8 pr-3 h-8 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  data-testid="input-response-search"
                />
                {responseSearch && (
                  <button onClick={() => setResponseSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {/* View toggle */}
              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shrink-0">
                <button
                  onClick={() => setResponsesView('list')}
                  className={cn('px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors', responsesView === 'list' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50')}
                  data-testid="btn-view-list"
                >
                  <List className="w-3.5 h-3.5" />List
                </button>
                <button
                  onClick={() => setResponsesView('table')}
                  className={cn('px-2.5 py-1.5 text-xs flex items-center gap-1 transition-colors border-l border-slate-200', responsesView === 'table' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50')}
                  data-testid="btn-view-table"
                >
                  <Table2 className="w-3.5 h-3.5" />Table
                </button>
              </div>
              {/* Export */}
              <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5 text-xs h-8 shrink-0" data-testid="btn-export-csv">
                <Download className="w-3.5 h-3.5" />CSV
              </Button>
              <Button size="sm" variant="outline" onClick={exportExcel} className="gap-1.5 text-xs h-8 shrink-0" data-testid="btn-export-excel">
                <FileSpreadsheet className="w-3.5 h-3.5" />Excel
              </Button>
                  {/* Date range filter */}
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={responseDateFrom}
                  onChange={e => setResponseDateFrom(e.target.value)}
                  className="h-8 text-xs rounded-lg border border-slate-200 px-2 bg-white"
                  title="From date"
                />
                <span className="text-slate-300 text-xs">–</span>
                <input
                  type="date"
                  value={responseDateTo}
                  onChange={e => setResponseDateTo(e.target.value)}
                  className="h-8 text-xs rounded-lg border border-slate-200 px-2 bg-white"
                  title="To date"
                />
                {(responseDateFrom || responseDateTo) && (
                  <button onClick={() => { setResponseDateFrom(''); setResponseDateTo(''); }} className="p-1 text-slate-400 hover:text-red-500" title="Clear date filter">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {/* Count */}
              <span className="text-[11px] text-slate-400 ml-auto shrink-0">
                {(() => {
                  const filtered = responses.filter(r => {
                    const q = responseSearch.toLowerCase();
                    const ms = !q || (r.respondent_name ?? '').toLowerCase().includes(q) || (r.respondent_email ?? '').toLowerCase().includes(q);
                    const mr = reviewFilter === 'all' || (r.review_status ?? 'pending') === reviewFilter;
                    const df = !responseDateFrom || new Date(r.submitted_at) >= new Date(responseDateFrom);
                    const dt = !responseDateTo   || new Date(r.submitted_at) <= new Date(responseDateTo + 'T23:59:59');
                    return ms && mr && df && dt;
                  });
                  return `${filtered.length} of ${responses.length}`;
                })()}
              </span>
            </div>
          )}

          {/* Bulk action bar */}
          {bulkResponses.size > 0 && canManage && (
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5">
              <span className="text-xs font-semibold text-indigo-700">{bulkResponses.size} selected</span>
              <div className="flex items-center gap-1.5 ml-auto">
                <Button size="sm" variant="outline" disabled={bulkResponseSaving}
                  onClick={async () => {
                    setBulkResponseSaving(true);
                    const ids = [...bulkResponses];
                    await Promise.all(ids.map(rid => supabase.from('survey_responses').update({ review_status: 'approved' }).eq('id', rid)));
                    qc.invalidateQueries({ queryKey: ['survey-responses', id] });
                    setBulkResponses(new Set()); setBulkResponseSaving(false);
                    toast({ title: `${ids.length} response${ids.length !== 1 ? 's' : ''} approved` });
                  }}
                  className="gap-1 text-xs h-7 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                  {bulkResponseSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}Approve
                </Button>
                <Button size="sm" variant="outline" disabled={bulkResponseSaving}
                  onClick={async () => {
                    setBulkResponseSaving(true);
                    const ids = [...bulkResponses];
                    await Promise.all(ids.map(rid => supabase.from('survey_responses').update({ review_status: 'rejected' }).eq('id', rid)));
                    qc.invalidateQueries({ queryKey: ['survey-responses', id] });
                    setBulkResponses(new Set()); setBulkResponseSaving(false);
                    toast({ title: `${ids.length} response${ids.length !== 1 ? 's' : ''} rejected` });
                  }}
                  className="gap-1 text-xs h-7 text-red-700 border-red-200 hover:bg-red-50">
                  {bulkResponseSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CircleX className="w-3 h-3" />}Reject
                </Button>
                <button onClick={() => setBulkResponses(new Set())} className="ml-1 p-1 rounded hover:bg-indigo-100 text-indigo-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {rLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading…</div>
          ) : responses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <Users className="w-10 h-10 opacity-20" />
              <p className="text-sm">No responses yet</p>
            </div>
          ) : (() => {
            const filtered = responses.filter(r => {
              const q = responseSearch.toLowerCase();
              const ms = !q || (r.respondent_name ?? '').toLowerCase().includes(q) || (r.respondent_email ?? '').toLowerCase().includes(q);
              const mr = reviewFilter === 'all' || (r.review_status ?? 'pending') === reviewFilter;
              const df = !responseDateFrom || new Date(r.submitted_at) >= new Date(responseDateFrom);
              const dt = !responseDateTo   || new Date(r.submitted_at) <= new Date(responseDateTo + 'T23:59:59');
              return ms && mr && df && dt;
            });

            if (responsesView === 'table') {
              const cols = nonStructural.slice(0, 8);
              const hiddenCount = nonStructural.length - cols.length;
              return (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {allAnswersLoading && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-600">
                      <Loader2 className="w-3 h-3 animate-spin" />Loading answer data…
                    </div>
                  )}
                  {hiddenCount > 0 && (
                    <div className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700">
                      <Eye className="w-3 h-3" />Showing first 8 of {nonStructural.length} columns — click any row to see all answers
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap sticky left-0 bg-slate-50 z-10 min-w-[140px]">Respondent</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap min-w-[130px]">Submitted</th>
                          {cols.map(q => (
                            <th key={q.id} className="text-left px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap min-w-[140px] max-w-[200px]">
                              <span className="truncate block max-w-[180px]" title={q.label}>{q.label}</span>
                            </th>
                          ))}
                          <th className="px-3 py-2.5 w-16"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r, ri) => (
                          <tr key={r.id} className={cn('border-b border-slate-100 hover:bg-indigo-50/30 cursor-pointer transition-colors', ri % 2 === 1 && 'bg-slate-50/50')}
                            onClick={() => setSelectedSubmission(r)}
                            data-testid={`row-response-${r.id}`}
                          >
                            <td className="px-3 py-2.5 sticky left-0 bg-inherit z-10">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                  <span className="text-[10px] font-bold text-indigo-700">
                                    {(r.respondent_name ?? r.respondent_email ?? 'A').charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <span className="truncate max-w-[100px] text-slate-700 font-medium" title={r.respondent_name ?? r.respondent_email ?? 'Anonymous'}>
                                  {r.respondent_name ?? r.respondent_email ?? 'Anonymous'}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{format(new Date(r.submitted_at), 'dd MMM yy, HH:mm')}</td>
                            {cols.map(q => {
                              const ans = allAnswers.find(a => a.response_id === r.id && a.question_id === q.id);
                              const val = getAnswerDisplay(q, ans);
                              return (
                                <td key={q.id} className="px-3 py-2.5 text-slate-600 max-w-[200px]">
                                  <span className="truncate block max-w-[180px]" title={val}>{val || <span className="text-slate-300 italic">—</span>}</span>
                                </td>
                              );
                            })}
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center gap-1 justify-end">
                                <button
                                  onClick={e => { e.stopPropagation(); setSelectedSubmission(r); }}
                                  className="p-1 rounded hover:bg-indigo-100 text-slate-400 hover:text-indigo-600"
                                  title="View submission"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                {canManage && (
                                  <button
                                    onClick={e => { e.stopPropagation(); setDeleteResponseTarget(r); }}
                                    className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                                    title="Delete submission"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filtered.length === 0 && (
                      <div className="py-12 text-center text-slate-400 text-sm">No results for "{responseSearch}"</div>
                    )}
                  </div>
                </div>
              );
            }

            // List view
            return (
              <div className="space-y-2">
                {filtered.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">No results for "{responseSearch}"</div>
                ) : filtered.map(r => {
                  const displayName = r.respondent_name ?? r.respondent_email ?? 'Anonymous';
                  return (
                    <div key={r.id} className={cn('bg-white rounded-xl border overflow-hidden transition-colors', bulkResponses.has(r.id) ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200')}>
                      <div className="flex items-center gap-3 p-4">
                        {canManage && (
                          <input type="checkbox" checked={bulkResponses.has(r.id)}
                            onChange={e => setBulkResponses(prev => { const n = new Set(prev); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })}
                            onClick={ev => ev.stopPropagation()}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 shrink-0 cursor-pointer"
                          />
                        )}
                        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', r.respondent_name ? 'bg-indigo-100' : 'bg-slate-100')}>
                          <span className={cn('text-xs font-bold', r.respondent_name ? 'text-indigo-700' : 'text-slate-400')}>
                            {displayName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
                            {!r.respondent_name && !r.respondent_email && (
                              <span className="text-[10px] bg-slate-100 text-slate-400 rounded-full px-2 py-0.5 shrink-0">anonymous</span>
                            )}
                            {r.respondent_id && (
                              <span className="text-[10px] bg-indigo-50 text-indigo-500 rounded-full px-2 py-0.5 shrink-0">verified</span>
                            )}
                            {/* Review status badge */}
                            {r.review_status && r.review_status !== 'pending' && (() => {
                              const rCfg = {
                                approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                rejected: 'bg-red-50 text-red-700 border-red-200',
                                under_review: 'bg-amber-50 text-amber-700 border-amber-200',
                              }[r.review_status] ?? '';
                              return <span className={`text-[10px] rounded-full px-2 py-0.5 border shrink-0 capitalize ${rCfg}`}>{r.review_status.replace('_', ' ')}</span>;
                            })()}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[11px] text-slate-400">{format(new Date(r.submitted_at), 'dd MMM yyyy, HH:mm')}</p>
                            {r.respondent_email && (
                              <span className="text-[11px] text-slate-400 truncate">· {r.respondent_email}</span>
                            )}
                            {r.duration_seconds != null && (
                              <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                                <Timer className="w-3 h-3" />
                                {r.duration_seconds < 60 ? `${r.duration_seconds}s` : `${Math.round(r.duration_seconds / 60)}m`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {canManage && (
                            <button
                              onClick={() => { setReviewTarget(r); setReviewStatus(r.review_status ?? 'approved'); setReviewComment(''); }}
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                              title="Review submission"
                              data-testid={`btn-review-response-${r.id}`}
                            >
                              <ClipboardList className="w-4 h-4" />
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => {
                                const init: Record<string, string> = {};
                                allAnswers.filter(a => a.response_id === r.id).forEach(a => {
                                  init[a.question_id] = a.answer_text ?? (Array.isArray(a.answer_json) ? (a.answer_json as string[]).join(', ') : a.answer_json != null ? String(a.answer_json) : '');
                                });
                                setEditTarget(r);
                                setEditAnswers(init);
                                setEditNote('');
                              }}
                              className="p-1.5 rounded-lg hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-colors"
                              title="Edit submission"
                              data-testid={`btn-edit-response-${r.id}`}
                            >
                              <PenLine className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedSubmission(r)}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
                            title="View submission"
                            data-testid={`btn-view-response-${r.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canManage && (
                            <button
                              onClick={() => setDeleteResponseTarget(r)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                              title="Delete submission"
                              data-testid={`btn-delete-response-${r.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── Review Dialog ───────────────────────────────────────────────── */}
          {reviewTarget && (
            <Dialog open onOpenChange={() => setReviewTarget(null)}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-amber-500" />Review Submission
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-1">
                  <p className="text-sm text-slate-500">
                    Reviewing response from <strong>{reviewTarget.respondent_name ?? reviewTarget.respondent_email ?? 'Anonymous'}</strong>
                  </p>
                  <div className="space-y-2">
                    <Label className="text-xs">Decision</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { val: 'approved', label: 'Approve', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
                        { val: 'rejected', label: 'Reject', cls: 'border-red-300 bg-red-50 text-red-700' },
                        { val: 'under_review', label: 'Under Review', cls: 'border-amber-300 bg-amber-50 text-amber-700' },
                        { val: 'pending', label: 'Reset to Pending', cls: 'border-slate-300 bg-slate-50 text-slate-700' },
                      ].map(({ val, label, cls }) => (
                        <button key={val} onClick={() => setReviewStatus(val)}
                          className={cn('px-3 py-2 rounded-xl border text-xs font-medium transition-all', reviewStatus === val ? `${cls} ring-2 ring-offset-1 ring-current` : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300')}
                        >{label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Comment (optional)</Label>
                    <Textarea
                      value={reviewComment}
                      onChange={e => setReviewComment(e.target.value)}
                      placeholder="Add a review note…"
                      rows={3}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      disabled={reviewSaving}
                      onClick={async () => {
                        setReviewSaving(true);
                        try {
                          const { error } = await supabase.from('survey_responses').update({
                            review_status: reviewStatus,
                            review_comment: reviewComment || null,
                            reviewed_by: currentUser?.id ?? null,
                            reviewed_at: new Date().toISOString(),
                          }).eq('id', reviewTarget.id);
                          if (error) throw error;
                          qc.invalidateQueries({ queryKey: ['survey-responses', id] });
                          toast({ title: 'Review saved' });
                          setReviewTarget(null);
                        } catch (e: any) {
                          toast({ title: 'Failed to save review', description: e.message, variant: 'destructive' });
                        } finally {
                          setReviewSaving(false);
                        }
                      }}
                      className="gap-1.5"
                    >
                      {reviewSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}Save Review
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setReviewTarget(null)}>Cancel</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Submission detail dialog */}
          {selectedSubmission && (
            <SubmissionDialog
              response={selectedSubmission}
              questions={nonStructural}
              answers={allAnswers.filter(a => a.response_id === selectedSubmission.id)}
              canManage={canManage}
              onDelete={() => setDeleteResponseTarget(selectedSubmission)}
              onClose={() => setSelectedSubmission(null)}
            />
          )}

          {/* Delete confirm dialog */}
          {deleteResponseTarget && (
            <Dialog open onOpenChange={() => setDeleteResponseTarget(null)}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Delete submission?</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-slate-500">
                  This will permanently delete the submission from <strong>{deleteResponseTarget.respondent_name ?? deleteResponseTarget.respondent_email ?? 'Anonymous'}</strong> and all its answers. This cannot be undone.
                </p>
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="destructive" size="sm" disabled={deleteResponse.isPending}
                    onClick={() => deleteResponse.mutate(deleteResponseTarget.id)}
                  >
                    {deleteResponse.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                    Delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteResponseTarget(null)}>Cancel</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* ── ANALYTICS TAB ───────────────────────────────────────────────────── */}
      {tab === 'analytics' && (
        <div className="space-y-5">

          {/* Analytics export */}
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />Export Analytics
            </Button>
          </div>

          {/* ── KPI Cards ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Total responses */}
            <div className="bg-gradient-to-br from-indigo-50 via-white to-white rounded-xl border border-indigo-100 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Responses</span>
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                </div>
              </div>
              <p className="text-3xl font-black text-slate-800 leading-none">{responses.length}</p>
              <p className="text-[11px] text-slate-400">total submissions</p>
            </div>

            {/* Questions */}
            <div className="bg-gradient-to-br from-violet-50 via-white to-white rounded-xl border border-violet-100 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Questions</span>
                <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 text-violet-600" />
                </div>
              </div>
              <p className="text-3xl font-black text-slate-800 leading-none">{nonStructural.length}</p>
              <p className="text-[11px] text-slate-400">{nonStructural.filter(q => q.required).length} required</p>
            </div>

            {/* Completion rate */}
            <div className="bg-gradient-to-br from-emerald-50 via-white to-white rounded-xl border border-emerald-100 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Completion</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                </div>
              </div>
              <p className="text-3xl font-black text-slate-800 leading-none">
                {responses.length > 0 && nonStructural.length > 0
                  ? Math.round((allAnswers.length / responses.length / nonStructural.length) * 100) + '%'
                  : '—'}
              </p>
              <p className="text-[11px] text-slate-400">avg answered rate</p>
            </div>

            {/* Last response */}
            <div className="bg-gradient-to-br from-amber-50 via-white to-white rounded-xl border border-amber-100 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Last Response</span>
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                </div>
              </div>
              <p className="text-xl font-black text-slate-800 leading-none">
                {responses.length > 0 ? format(new Date(responses[0].submitted_at), 'MMM d') : '—'}
              </p>
              <p className="text-[11px] text-slate-400">
                {responses.length > 0 ? format(new Date(responses[0].submitted_at), 'HH:mm') : 'no responses yet'}
              </p>
            </div>

            {/* Avg completion time */}
            <div className="bg-gradient-to-br from-sky-50 via-white to-white rounded-xl border border-sky-100 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-sky-500 uppercase tracking-widest">Avg Time</span>
                <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center">
                  <Timer className="w-3.5 h-3.5 text-sky-600" />
                </div>
              </div>
              {(() => {
                const timed = responses.filter(r => r.duration_seconds != null && r.duration_seconds > 0);
                if (timed.length === 0) return (
                  <>
                    <p className="text-xl font-black text-slate-800 leading-none">—</p>
                    <p className="text-[11px] text-slate-400">no timed responses</p>
                  </>
                );
                const avg = Math.round(timed.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / timed.length);
                const fmt = avg < 60 ? `${avg}s` : avg < 3600 ? `${Math.floor(avg / 60)}m ${avg % 60 ? avg % 60 + 's' : ''}`.trim() : `${Math.floor(avg / 3600)}h ${Math.floor((avg % 3600) / 60)}m`;
                return (
                  <>
                    <p className="text-xl font-black text-slate-800 leading-none">{fmt}</p>
                    <p className="text-[11px] text-slate-400">{timed.length} timed response{timed.length !== 1 ? 's' : ''}</p>
                  </>
                );
              })()}
            </div>
          </div>

          {/* ── Response Timeline ──────────────────────────────────────────── */}
          {responses.length > 0 && (() => {
            const timelineData = getTimelineData();
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Response Timeline</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Submissions over time</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                    <TrendingUp className="w-3 h-3" />{responses.length} total
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={timelineData} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="responseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip
                      contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '8px 12px', fontSize: '12px' }}
                      formatter={(v: number) => [`${v} response${v !== 1 ? 's' : ''}`, 'Submissions']}
                      cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Area dataKey="count" stroke="#6366f1" strokeWidth={2.5} fill="url(#responseGrad)" dot={{ fill: '#6366f1', r: 3.5, strokeWidth: 0 }} activeDot={{ r: 5.5, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* ── Per-Section Completion Rate ─────────────────────────────────── */}
          {responses.length > 0 && (() => {
            const sectionBlocks = buildSectionBlocks(questions);
            const sectioned = sectionBlocks.filter(b =>
              b.header !== null &&
              b.items.filter(q => !['begin_group','begin_repeat','grid_table'].includes(q.type)).length > 0
            );
            if (sectioned.length === 0) return null;
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <LayoutList className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Section Completion</h3>
                  <span className="text-[11px] text-slate-400 ml-auto">{sectioned.length} section{sectioned.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="space-y-3.5">
                  {sectioned.map(block => {
                    const sectionQIds = block.items
                      .filter(q => !['begin_group','begin_repeat','grid_table'].includes(q.type))
                      .map(q => q.id);
                    const answered = responses.filter(resp => {
                      const ids = new Set(allAnswers.filter(a => a.response_id === resp.id).map(a => a.question_id));
                      return sectionQIds.some(qid => ids.has(qid));
                    }).length;
                    const fullyAnswered = responses.filter(resp => {
                      const ids = new Set(allAnswers.filter(a => a.response_id === resp.id).map(a => a.question_id));
                      return sectionQIds.every(qid => ids.has(qid));
                    }).length;
                    const pct = responses.length > 0 ? Math.round((fullyAnswered / responses.length) * 100) : 0;
                    const pctPartial = responses.length > 0 ? Math.round((answered / responses.length) * 100) : 0;
                    return (
                      <div key={block.header!.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700 truncate">{block.header!.label}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[11px] text-slate-400">{sectionQIds.length}Q</span>
                            <span className="text-xs font-bold text-emerald-600 tabular-nums w-10 text-right">{pct}%</span>
                          </div>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full flex">
                            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} />
                            <div className="h-full bg-emerald-200 transition-all duration-300" style={{ width: `${Math.max(0, pctPartial - pct)}%` }} />
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {fullyAnswered} fully · {answered - fullyAnswered} partially · {responses.length - answered} skipped
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" /><span className="text-[10px] text-slate-500">Fully answered</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-200 shrink-0" /><span className="text-[10px] text-slate-500">Partially answered</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-slate-100 border border-slate-200 shrink-0" /><span className="text-[10px] text-slate-500">Skipped</span></div>
                </div>
              </div>
            );
          })()}

          {/* ── Per-Question Response Rate ──────────────────────────────────── */}
          {responses.length > 0 && nonStructural.length > 0 && (() => {
            const answerable = nonStructural.filter(q =>
              !['section_header','begin_group','begin_repeat','note','grid_table'].includes(q.type)
            );
            if (answerable.length === 0) return null;
            const stats = answerable.map(q => {
              const count = new Set(allAnswers.filter(a => a.question_id === q.id).map(a => a.response_id)).size;
              const pct = Math.round((count / responses.length) * 100);
              return { q, count, pct };
            }).sort((a, b) => a.pct - b.pct);
            const worstPct = stats[0]?.pct ?? 100;
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-rose-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Per-Question Response Rate</h3>
                  <span className="text-[11px] text-slate-400 ml-auto">{answerable.length} question{answerable.length !== 1 ? 's' : ''}</span>
                </div>
                {worstPct < 100 && (
                  <div className="flex items-center gap-2 text-[11px] text-rose-600 bg-rose-50 rounded-lg px-2.5 py-1.5 border border-rose-100">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Highest drop-off: <span className="font-semibold ml-1 truncate">&ldquo;{stats[0]?.q.label}&rdquo;</span>
                    <span className="shrink-0 ml-auto">skipped by {100 - worstPct}%</span>
                  </div>
                )}
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {stats.map(({ q, count, pct }) => (
                    <div key={q.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-700 truncate">{q.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-slate-400 tabular-nums">{count}/{responses.length}</span>
                          <span className={cn(
                            'text-xs font-bold tabular-nums w-9 text-right',
                            pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600'
                          )}>{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-300',
                            pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-rose-400'
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" /><span className="text-[10px] text-slate-500">≥80%</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" /><span className="text-[10px] text-slate-500">50–79%</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-400 shrink-0" /><span className="text-[10px] text-slate-500">&lt;50% high drop-off</span></div>
                </div>
              </div>
            );
          })()}

          {/* ── Response Time Analytics ────────────────────────────────────── */}
          {responses.length > 0 && (() => {
            const stats = getDurationStats();
            if (!stats) return null;
            const fmtSec = (s: number) => s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s/60)}m ${s%60 ? s%60+'s' : ''}`.trim() : `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
            const maxBucket = Math.max(...stats.buckets.map(b => b.count), 1);
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sky-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Response Time</h3>
                  <span className="text-[11px] text-slate-400 ml-auto">{stats.count} timed response{stats.count !== 1 ? 's' : ''}</span>
                </div>
                {/* KPI mini-cards */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Average', val: fmtSec(stats.avg), color: 'text-sky-600' },
                    { label: 'Median', val: fmtSec(stats.median), color: 'text-indigo-600' },
                    { label: 'Fastest', val: fmtSec(stats.min), color: 'text-emerald-600' },
                    { label: 'Slowest', val: fmtSec(stats.max), color: 'text-amber-600' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="text-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <p className={`text-base font-black ${color}`}>{val}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                {/* Histogram */}
                {stats.buckets.length > 0 && (
                  <div className="space-y-1.5">
                    {stats.buckets.map(b => (
                      <div key={b.label} className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400 w-14 shrink-0 text-right">{b.label}</span>
                        <div className="flex-1 h-6 bg-slate-50 rounded-lg overflow-hidden">
                          <div
                            className="h-full bg-sky-400 rounded-lg flex items-center px-2 transition-all duration-700"
                            style={{ width: `${Math.max(4, Math.round((b.count / maxBucket) * 100))}%` }}
                          >
                            <span className="text-[10px] font-semibold text-white">{b.count}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Word Cloud — text question frequency ───────────────────────── */}
          {responses.length > 0 && (() => {
            const textQs = nonStructural.filter(q => ['text','textarea'].includes(q.type));
            if (textQs.length === 0) return null;
            const activeQId = wordCloudQId || textQs[0].id;
            const q = textQs.find(tq => tq.id === activeQId) ?? textQs[0];
            const words: Record<string, number> = {};
            allAnswers
              .filter(a => a.question_id === q.id && a.answer_text)
              .forEach(a => {
                (a.answer_text ?? '').split(/\s+/).forEach(w => {
                  const clean = w.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
                  if (clean.length > 2) words[clean] = (words[clean] ?? 0) + 1;
                });
              });
            const entries = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 40);
            if (entries.length < 3 && textQs.length <= 1) return null;
            const maxCount = entries[0]?.[1] ?? 1;
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-slate-800">Word Cloud</h3>
                  {textQs.length > 1 && (
                    <select
                      value={activeQId}
                      onChange={e => setWordCloudQId(e.target.value)}
                      className="ml-auto text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white max-w-[200px] truncate"
                    >
                      {textQs.map(tq => (
                        <option key={tq.id} value={tq.id}>{tq.label.slice(0, 40)}</option>
                      ))}
                    </select>
                  )}
                  {textQs.length <= 1 && <span className="text-[11px] text-slate-400 ml-auto">"{q.label}"</span>}
                </div>
                {entries.length < 3 ? (
                  <p className="text-xs text-slate-400 italic text-center py-4">Not enough text answers yet for a word cloud.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 leading-relaxed">
                    {entries.map(([word, count]) => {
                      const size = 0.7 + (count / maxCount) * 1.1;
                      const opacity = 0.4 + (count / maxCount) * 0.6;
                      const colors = ['text-indigo-600','text-violet-600','text-sky-600','text-emerald-600','text-amber-600','text-rose-500'];
                      const color = colors[word.charCodeAt(0) % colors.length];
                      return (
                        <span key={word} className={`font-medium ${color}`} style={{ fontSize: `${size}rem`, opacity }}>
                          {word}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Drop-off Analysis ───────────────────────────────────────────── */}
          {responses.length > 0 && nonStructural.length > 1 && (() => {
            // For multi-page surveys, show how many respondents answered each question
            // Drop-off = how many stopped after this question vs prior
            const qsWithCount = nonStructural.map((q, qi) => {
              const answered = allAnswers.filter(a => a.question_id === q.id).length;
              return { q, qi, answered };
            });
            const maxAnswered = Math.max(...qsWithCount.map(x => x.answered), 1);
            if (maxAnswered === 0) return null;
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-rose-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Drop-off Analysis</h3>
                  <span className="text-[11px] text-slate-400 ml-1">— how many respondents answered each question</span>
                </div>
                <div className="space-y-2">
                  {qsWithCount.map(({ q, qi, answered }, i) => {
                    const prev = i === 0 ? maxAnswered : qsWithCount[i - 1].answered;
                    const dropPct = prev > 0 ? Math.round(((prev - answered) / prev) * 100) : 0;
                    const barPct  = Math.round((answered / maxAnswered) * 100);
                    return (
                      <div key={q.id} className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 w-6 shrink-0">Q{qi + 1}</span>
                          <span className="text-xs text-slate-600 flex-1 truncate">{q.label}</span>
                          <span className="text-xs font-semibold text-slate-700 shrink-0">{answered}</span>
                          {i > 0 && dropPct > 0 && (
                            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                              dropPct >= 30 ? 'bg-red-100 text-red-600' : dropPct >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                            )}>−{dropPct}%</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-6 shrink-0" />
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all duration-700',
                                barPct >= 80 ? 'bg-indigo-500' : barPct >= 50 ? 'bg-amber-400' : 'bg-rose-400'
                              )}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 w-8 text-right shrink-0">{barPct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ── Cross-Tabulation ────────────────────────────────────────────── */}
          {responses.length > 0 && (() => {
            const choiceQs = nonStructural.filter(q => ['radio','checkbox','dropdown','yesno'].includes(q.type));
            if (choiceQs.length < 2) return null;
            const ctData = crossTabRow && crossTabCol && crossTabRow !== crossTabCol
              ? getCrossTabData(crossTabRow, crossTabCol)
              : null;
            return (
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-violet-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Cross-Tabulation</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-slate-500">Row Question</p>
                    <Select value={crossTabRow} onValueChange={setCrossTabRow}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select question…" /></SelectTrigger>
                      <SelectContent>
                        {choiceQs.map(q => <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-slate-500">Column Question</p>
                    <Select value={crossTabCol} onValueChange={setCrossTabCol}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select question…" /></SelectTrigger>
                      <SelectContent>
                        {choiceQs.filter(q => q.id !== crossTabRow).map(q => <SelectItem key={q.id} value={q.id}>{q.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {ctData ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-400 uppercase bg-slate-50 rounded-tl-lg border border-slate-100">
                            {ctData.rowQ.label} / {ctData.colQ.label}
                          </th>
                          {ctData.colOpts.map(c => (
                            <th key={c} className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-600 bg-slate-50 border border-slate-100">{c}</th>
                          ))}
                          <th className="px-2 py-1.5 text-center text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-100">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ctData.rowOpts.map(r => {
                          const rowTotal = ctData.colOpts.reduce((s, c) => s + ctData.table[r][c], 0);
                          return (
                            <tr key={r}>
                              <td className="px-2 py-1.5 text-[11px] font-semibold text-slate-700 bg-white border border-slate-100">{r}</td>
                              {ctData.colOpts.map(c => {
                                const count = ctData.table[r][c];
                                const pct = rowTotal > 0 ? Math.round((count / rowTotal) * 100) : 0;
                                return (
                                  <td key={c} className="px-2 py-1.5 text-center border border-slate-100 bg-white">
                                    <span className={cn('font-semibold', count > 0 ? 'text-violet-700' : 'text-slate-300')}>{count}</span>
                                    {count > 0 && <span className="text-[9px] text-slate-400 ml-0.5">({pct}%)</span>}
                                  </td>
                                );
                              })}
                              <td className="px-2 py-1.5 text-center font-bold text-slate-600 border border-slate-100 bg-slate-50">{rowTotal}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 text-center py-4">Select two different questions above to see the cross-tab.</p>
                )}
              </div>
            );
          })()}

          {/* ── Question Breakdown ─────────────────────────────────────────── */}
          {nonStructural.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                <FileText className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">No questions yet</p>
              <p className="text-xs text-slate-400">Add questions in the Builder tab to see analytics here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Question Breakdown</h3>
                <span className="text-[11px] text-slate-400">{nonStructural.length} question{nonStructural.length !== 1 ? 's' : ''}</span>
              </div>

              {nonStructural.map((q, qi) => {
                const QIcon = ALL_Q_TYPES.find(t => t.type === q.type)?.icon ?? FileText;
                const parentGroup = q.group_id ? questions.find(g => g.id === q.group_id) : null;
                const { answered, total, pct: ratePct } = getResponseRate(q);
                const isChoice = ['radio', 'checkbox', 'dropdown', 'yesno'].includes(q.type);
                const isRating = ['rating', 'scale'].includes(q.type);
                const isText   = ['text','textarea','phone','email','number','integer','barcode','gps','date','time','datetime'].includes(q.type);
                const isLikert = q.type === 'likert';
                const isGrid   = q.type === 'grid_table';
                const textAnswers  = getTextAnswers(q);
                const choiceDist   = isChoice ? getChoiceDistribution(q) : [];
                const ratingDist   = isRating ? getRatingDistribution(q) : [];
                const avgScore     = isRating ? getAvgRating(q) : null;
                const maxRating    = q.type === 'rating' ? 5 : Number(q.settings?.max ?? 10);

                const rateColor =
                  ratePct >= 80 ? 'bg-emerald-500' :
                  ratePct >= 50 ? 'bg-amber-400'   : 'bg-slate-300';
                const rateBadge =
                  ratePct >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' :
                  ratePct >= 50 ? 'text-amber-700 bg-amber-50 border-amber-100'       :
                  'text-slate-500 bg-slate-50 border-slate-200';

                const TYPE_ACCENT: Record<string, string> = {
                  radio: 'bg-indigo-100 text-indigo-600',
                  checkbox: 'bg-violet-100 text-violet-600',
                  dropdown: 'bg-sky-100 text-sky-600',
                  rating: 'bg-amber-100 text-amber-600',
                  scale: 'bg-orange-100 text-orange-600',
                };
                const accent = TYPE_ACCENT[q.type] ?? 'bg-slate-100 text-slate-500';

                return (
                  <div key={q.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">

                    {/* Card header */}
                    <div className="px-5 pt-4 pb-3 border-b border-slate-100">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', accent)}>
                          <QIcon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Q{qi + 1}</span>
                            <span className="text-[10px] text-slate-400 capitalize">{q.type.replace(/_/g, ' ')}</span>
                            {q.required && <span className="text-[10px] text-red-500 font-semibold">Required</span>}
                            {parentGroup && (
                              <span className="text-[10px] text-indigo-500 flex items-center gap-0.5">
                                <Folder className="w-2.5 h-2.5" />{parentGroup.label}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-slate-800 leading-snug">{q.label}</p>
                        </div>
                        {isRating && avgScore && (
                          <div className="shrink-0 text-right">
                            <p className="text-2xl font-black text-amber-500">{avgScore}</p>
                            <p className="text-[10px] text-slate-400 font-medium">avg / {maxRating}</p>
                          </div>
                        )}
                      </div>

                      {/* Response rate */}
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-700">{answered}</span> of <span className="font-semibold text-slate-700">{total}</span> responded
                          </span>
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', rateBadge)}>
                            {total > 0 ? `${ratePct}%` : '—'}
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all duration-700', rateColor)} style={{ width: `${ratePct}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="p-5">
                      {answered === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 text-slate-400 gap-2">
                          <MessageSquare className="w-6 h-6 opacity-25" />
                          <span className="text-sm italic">No answers yet</span>
                        </div>

                      ) : isChoice ? (
                        /* ── Choice: custom percentage bars ── */
                        <div className="space-y-3">
                          {choiceDist.map((item, ci) => (
                            <div key={item.label} className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm text-slate-700 leading-snug flex-1 min-w-0">{item.label}</span>
                                <div className="flex items-center gap-2.5 shrink-0">
                                  <span className="text-[11px] text-slate-400">{item.count} resp.</span>
                                  <span className="text-xs font-bold text-slate-700 tabular-nums w-8 text-right">{item.pct}%</span>
                                </div>
                              </div>
                              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{ width: `${item.pct}%`, backgroundColor: CHART_COLORS[ci % CHART_COLORS.length] }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                      ) : isRating ? (
                        /* ── Rating / Scale: distribution bars ── */
                        <div className="space-y-2">
                          {ratingDist.map(item => (
                            <div key={item.val} className="flex items-center gap-3">
                              <span className="text-[11px] font-semibold text-slate-500 shrink-0 w-14 text-right">
                                {q.type === 'rating'
                                  ? <span title={`${item.val} stars`}>{'★'.repeat(item.val)}<span className="text-slate-200">{'★'.repeat(maxRating - item.val)}</span></span>
                                  : item.val}
                              </span>
                              <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-700" style={{ width: `${item.barPct}%` }} />
                              </div>
                              <span className="text-[11px] text-slate-500 w-6 shrink-0 tabular-nums">{item.count}</span>
                            </div>
                          ))}
                        </div>

                      ) : isText ? (
                        /* ── Text: scrollable response list ── */
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {textAnswers.length > 0 ? textAnswers.map((t, ti) => (
                            <div key={ti} className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100 leading-relaxed">
                              <span className="text-slate-400 mr-1 select-none">"</span>{t}<span className="text-slate-400 ml-0.5 select-none">"</span>
                            </div>
                          )) : (
                            <p className="text-sm text-slate-400 italic">No text responses recorded.</p>
                          )}
                        </div>

                      ) : isLikert ? (
                        /* ── Likert: aggregated row × column distribution ── */
                        (() => {
                          const likertRows = (q.settings?.likert_rows as string[] | undefined) ?? [];
                          const likertCols = (q.settings?.likert_cols as string[] | undefined) ?? [];
                          if (!likertRows.length || !likertCols.length) return (
                            <div className="flex items-center justify-center py-4 text-slate-400 text-sm italic">{answered} response{answered !== 1 ? 's' : ''} recorded</div>
                          );
                          const rowColCounts: Record<string, Record<string, number>> = {};
                          likertRows.forEach(r => { rowColCounts[r] = {}; likertCols.forEach(c => { rowColCounts[r][c] = 0; }); });
                          allAnswers.filter(a => a.question_id === q.id && a.answer_json).forEach(a => {
                            const val = (() => { try { return typeof a.answer_json === 'object' && !Array.isArray(a.answer_json) ? a.answer_json as Record<string, string> : JSON.parse(String(a.answer_json)); } catch { return null; } })();
                            if (!val) return;
                            Object.entries(val).forEach(([row, col]) => {
                              if (rowColCounts[row] && rowColCounts[row][col as string] !== undefined) rowColCounts[row][col as string]++;
                            });
                          });
                          return (
                            <div className="space-y-4">
                              {likertRows.map(row => {
                                const rowTotal = likertCols.reduce((s, c) => s + (rowColCounts[row]?.[c] ?? 0), 0);
                                const maxCount = Math.max(...likertCols.map(c => rowColCounts[row]?.[c] ?? 0), 1);
                                return (
                                  <div key={row}>
                                    <p className="text-xs font-semibold text-slate-700 mb-1.5 leading-snug truncate" title={row}>{row}</p>
                                    <div className="space-y-1">
                                      {likertCols.map((col, ci) => {
                                        const count = rowColCounts[row]?.[col] ?? 0;
                                        const pct = rowTotal > 0 ? Math.round((count / rowTotal) * 100) : 0;
                                        return (
                                          <div key={col} className="flex items-center gap-2">
                                            <span className="text-[10px] text-slate-500 w-24 shrink-0 truncate" title={col}>{col}</span>
                                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round((count / maxCount) * 100)}%`, backgroundColor: CHART_COLORS[ci % CHART_COLORS.length] }} />
                                            </div>
                                            <span className="text-[11px] font-semibold text-slate-700 w-5 text-right shrink-0 tabular-nums">{count}</span>
                                            <span className="text-[10px] text-slate-400 w-8 shrink-0 tabular-nums">{pct}%</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()

                      ) : isGrid ? (
                        /* ── Grid table: top values per column ── */
                        (() => {
                          type GridCol = { id: string; label: string; type: string };
                          const gridCols = (q.settings?.grid_columns as GridCol[] | undefined) ?? [];
                          if (!gridCols.length) return (
                            <div className="flex items-center justify-center py-4 text-slate-400 text-sm italic">{answered} response{answered !== 1 ? 's' : ''} recorded</div>
                          );
                          const colValues: Record<string, string[]> = {};
                          gridCols.forEach(gc => { colValues[gc.id] = []; });
                          allAnswers.filter(a => a.question_id === q.id && a.answer_json).forEach(a => {
                            const rows = (() => { try { const p = typeof a.answer_json === 'string' ? JSON.parse(a.answer_json) : a.answer_json; return Array.isArray(p) ? p as Array<Record<string, string>> : null; } catch { return null; } })();
                            if (!rows) return;
                            rows.forEach(row => { gridCols.forEach(gc => { const v = row[gc.id]; if (v != null && String(v).trim()) colValues[gc.id].push(String(v)); }); });
                          });
                          return (
                            <div className="space-y-4">
                              {gridCols.map((gc, gci) => {
                                const vals = colValues[gc.id] ?? [];
                                const counts: Record<string, number> = {};
                                vals.forEach(v => { counts[v] = (counts[v] ?? 0) + 1; });
                                const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
                                const maxCount = sorted.length > 0 ? sorted[0][1] : 1;
                                return (
                                  <div key={gc.id}>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{gc.label}</p>
                                    {sorted.length === 0 ? (
                                      <p className="text-xs text-slate-400 italic">No entries</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {sorted.map(([val, count]) => (
                                          <div key={val} className="flex items-center gap-2">
                                            <span className="text-xs text-slate-600 w-28 shrink-0 truncate" title={val}>{val}</span>
                                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round((count / maxCount) * 100)}%`, backgroundColor: CHART_COLORS[gci % CHART_COLORS.length] }} />
                                            </div>
                                            <span className="text-[11px] font-semibold text-slate-700 w-5 text-right shrink-0 tabular-nums">{count}</span>
                                          </div>
                                        ))}
                                        {vals.length > sorted.reduce((s, [, c]) => s + c, 0) && (
                                          <p className="text-[10px] text-slate-400 italic mt-0.5">{vals.length} total entries, top 6 shown</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()

                      ) : (
                        <div className="flex items-center justify-center py-4 text-slate-400 text-sm italic">
                          {answered} response{answered !== 1 ? 's' : ''} recorded
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Empty state (no responses) ─────────────────────────────────── */}
          {responses.length === 0 && (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 flex flex-col items-center text-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <BarChart2 className="w-7 h-7 text-indigo-300" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center">
                  <Award className="w-2.5 h-2.5 text-amber-500" />
                </div>
              </div>
              <div className="max-w-xs">
                <p className="text-sm font-semibold text-slate-600">No responses yet</p>
                <p className="text-xs text-slate-400 mt-1">Analytics will appear here once respondents start submitting. Share your survey to get started.</p>
              </div>
              {survey.status === 'active' && (
                <div className="flex items-center gap-2">
                  <a
                    href={`/s/${survey.short_code ?? survey.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-100 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />Preview fill link
                  </a>
                  <button
                    onClick={copyFillLink}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors"
                  >
                    <Link2 className="w-3 h-3" />Copy link
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ── MAP TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'map' && (() => {
        const gpsQuestions = nonStructural.filter(q => q.type === 'gps');
        const gpsAnswers = allAnswers.filter(a => {
          const q = nonStructural.find(q => q.id === a.question_id);
          return q?.type === 'gps' && a.answer_text;
        });
        const allPins = gpsAnswers.flatMap(a => {
          const parts = (a.answer_text ?? '').split(',');
          if (parts.length < 2) return [];
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          const accuracy = parts[2] ? parseFloat(parts[2]) : null;
          if (isNaN(lat) || isNaN(lng)) return [];
          const response = responses.find(r => r.id === a.response_id);
          const question = nonStructural.find(q => q.id === a.question_id);
          return [{ lat, lng, accuracy, response, question, answerId: a.id }];
        });
        // Apply date filter
        const pins = allPins.filter(p => {
          if (!p.response) return true;
          const d = new Date(p.response.submitted_at);
          if (mapDateFrom && d < new Date(mapDateFrom)) return false;
          if (mapDateTo && d > new Date(mapDateTo + 'T23:59:59')) return false;
          return true;
        });
        const center: [number, number] = pins.length > 0
          ? [pins.reduce((s, p) => s + p.lat, 0) / pins.length, pins.reduce((s, p) => s + p.lng, 0) / pins.length]
          : [15.5, 32.5]; // default: Sudan

        // Heatmap clusters
        const cellSize = 0.05;
        const heatCells = new Map<string, { lat: number; lng: number; count: number }>();
        pins.forEach(p => {
          const ck = `${Math.floor(p.lat / cellSize)},${Math.floor(p.lng / cellSize)}`;
          if (!heatCells.has(ck)) heatCells.set(ck, { lat: Math.floor(p.lat / cellSize) * cellSize + cellSize / 2, lng: Math.floor(p.lng / cellSize) * cellSize + cellSize / 2, count: 0 });
          heatCells.get(ck)!.count++;
        });
        const heatMax = Math.max(...[...heatCells.values()].map(c => c.count), 1);

        const exportCSV = () => {
          const rows = [['Latitude', 'Longitude', 'Accuracy (m)', 'Respondent', 'Submitted', 'Question']];
          pins.forEach(p => {
            rows.push([
              String(p.lat), String(p.lng),
              p.accuracy != null ? String(p.accuracy.toFixed(1)) : '',
              p.response?.respondent_name ?? p.response?.respondent_email ?? 'Anonymous',
              p.response ? format(new Date(p.response.submitted_at), 'yyyy-MM-dd HH:mm') : '',
              p.question?.label ?? '',
            ]);
          });
          const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `gps-export-${id}.csv`; a.click();
          URL.revokeObjectURL(url);
        };

        return (
          <div className="space-y-4">
            {/* Map toolbar */}
            {gpsQuestions.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap bg-white rounded-xl border border-slate-200 p-3">
                {/* Date range filter */}
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <Input type="date" value={mapDateFrom} onChange={e => setMapDateFrom(e.target.value)}
                  className="h-8 text-xs w-36 shrink-0" placeholder="From date" title="Filter from date" />
                <span className="text-xs text-slate-400">–</span>
                <Input type="date" value={mapDateTo} onChange={e => setMapDateTo(e.target.value)}
                  className="h-8 text-xs w-36 shrink-0" placeholder="To date" title="Filter to date" />
                {(mapDateFrom || mapDateTo) && (
                  <button onClick={() => { setMapDateFrom(''); setMapDateTo(''); }}
                    className="text-[11px] text-indigo-600 hover:underline shrink-0">Clear</button>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  {/* View toggle */}
                  <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                    <button onClick={() => setMapView('pins')}
                      className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-colors', mapView === 'pins' ? 'bg-white shadow text-indigo-700' : 'text-slate-500')}>
                      Pins
                    </button>
                    <button onClick={() => setMapView('heat')}
                      className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-colors', mapView === 'heat' ? 'bg-white shadow text-orange-700' : 'text-slate-500')}>
                      Heat
                    </button>
                  </div>
                  {pins.length > 0 && (
                    <Button size="sm" variant="outline" onClick={exportCSV} className="h-7 gap-1 text-xs">
                      <Download className="w-3 h-3" />CSV
                    </Button>
                  )}
                </div>
              </div>
            )}
            {/* Stats bar — only show when there are GPS questions */}
            {gpsQuestions.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                  <MapPin className="w-3 h-3" />{pins.length} GPS point{pins.length !== 1 ? 's' : ''}{pins.length !== allPins.length ? ` (${allPins.length} total)` : ''}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap">
                  from {gpsQuestions.length} GPS question{gpsQuestions.length !== 1 ? 's' : ''}:&nbsp;
                  {gpsQuestions.map(q => (
                    <span key={q.id} className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{q.label}</span>
                  ))}
                </div>
                {allAnswersLoading && (
                  <div className="flex items-center gap-1.5 text-[11px] text-indigo-500">
                    <Loader2 className="w-3 h-3 animate-spin" />Loading GPS data…
                  </div>
                )}
              </div>
            )}

            {/* Coverage tracking stats */}
            {gpsQuestions.length > 0 && pins.length > 0 && (() => {
              // Cluster pins into approximate areas (0.1 degree ≈ 11km cells)
              const cellSize = 0.1;
              const cells = new Set<string>();
              pins.forEach(p => {
                const cellLat = Math.floor(p.lat / cellSize);
                const cellLng = Math.floor(p.lng / cellSize);
                cells.add(`${cellLat},${cellLng}`);
              });
              const uniqueRespondents = new Set(pins.map(p => p.response?.id).filter(Boolean)).size;
              const recentPins = pins.filter(p => p.response && (Date.now() - new Date(p.response.submitted_at).getTime()) < 7 * 24 * 3600_000).length;
              return (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl border border-indigo-100 p-3 text-center">
                    <p className="text-xl font-black text-indigo-600">{uniqueRespondents}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Respondents with GPS</p>
                  </div>
                  <div className="bg-white rounded-xl border border-emerald-100 p-3 text-center">
                    <p className="text-xl font-black text-emerald-600">{cells.size}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Geographic cells (~11km)</p>
                  </div>
                  <div className="bg-white rounded-xl border border-amber-100 p-3 text-center">
                    <p className="text-xl font-black text-amber-600">{recentPins}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">GPS points this week</p>
                  </div>
                </div>
              );
            })()}

            {gpsQuestions.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                  <MapIcon className="w-6 h-6 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No GPS questions</p>
                <p className="text-xs text-slate-400">Add a GPS question in the Builder tab to see responses plotted on a map.</p>
              </div>
            ) : pins.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 flex flex-col items-center text-center gap-3">
                <MapPin className="w-8 h-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-500">No GPS data yet</p>
                <p className="text-xs text-slate-400">GPS coordinates will appear here once respondents submit their location.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ height: '500px' }}>
                <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%' }} className="z-0">
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                  {mapView === 'heat' ? (
                    [...heatCells.values()].map((cell, ci) => {
                      const ratio = cell.count / heatMax;
                      const r = Math.round(255 * ratio);
                      const g = Math.round(165 * (1 - ratio));
                      const color = `rgb(${r},${g},0)`;
                      const size = 12 + Math.round(ratio * 24);
                      const icon = L.divIcon({
                        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:0.75;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:white;">${cell.count}</div>`,
                        className: '',
                        iconSize: [size, size],
                        iconAnchor: [size / 2, size / 2],
                      });
                      return (
                        <Marker key={`heat-${ci}`} position={[cell.lat, cell.lng]} icon={icon}>
                          <Popup><p className="text-sm font-semibold">{cell.count} GPS point{cell.count !== 1 ? 's' : ''}</p><p className="text-xs text-slate-400">{cell.lat.toFixed(3)}, {cell.lng.toFixed(3)}</p></Popup>
                        </Marker>
                      );
                    })
                  ) : (
                  pins.map((pin, pi) => {
                    const displayName = pin.response?.respondent_name ?? pin.response?.respondent_email ?? 'Anonymous';
                    return (
                      <Marker key={`${pin.answerId}-${pi}`} position={[pin.lat, pin.lng]}>
                        <Popup maxWidth={240}>
                          <div className="space-y-1.5 py-1">
                            <p className="font-semibold text-sm text-slate-800">{displayName}</p>
                            {pin.question && <p className="text-xs text-indigo-600">{pin.question.label}</p>}
                            <p className="text-xs text-slate-500">
                              {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                              {pin.accuracy !== null && ` ±${pin.accuracy.toFixed(0)}m`}
                            </p>
                            {pin.response && (
                              <p className="text-xs text-slate-400">
                                {format(new Date(pin.response.submitted_at), 'dd MMM yyyy, HH:mm')}
                              </p>
                            )}
                            {pin.response && (
                              <button
                                onClick={() => setSelectedSubmission(pin.response!)}
                                className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-1"
                              >
                                <Eye className="w-3 h-3" />View full submission
                              </button>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })
                  )}
                </MapContainer>
              </div>
            )}

            {/* Submission dialog from map popup click */}
            {selectedSubmission && (
              <SubmissionDialog
                response={selectedSubmission}
                questions={nonStructural}
                answers={allAnswers.filter(a => a.response_id === selectedSubmission.id)}
                canManage={canManage}
                onDelete={() => setDeleteResponseTarget(selectedSubmission)}
                onClose={() => setSelectedSubmission(null)}
              />
            )}
            {deleteResponseTarget && (
              <Dialog open onOpenChange={() => setDeleteResponseTarget(null)}>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Delete submission?</DialogTitle></DialogHeader>
                  <p className="text-sm text-slate-500">Permanently delete this submission and all its answers.</p>
                  <div className="flex items-center gap-2 pt-2">
                    <Button variant="destructive" size="sm" disabled={deleteResponse.isPending}
                      onClick={() => deleteResponse.mutate(deleteResponseTarget.id)}>
                      {deleteResponse.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}Delete
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteResponseTarget(null)}>Cancel</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        );
      })()}

      {/* ── SETTINGS TAB ────────────────────────────────────────────────────── */}
      {tab === 'settings' && canManage && (
        <div className="space-y-5 max-w-2xl">

          {/* Collection Settings */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <Shield className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-800">Collection Settings</h3>
            </div>
            <div className="p-5 space-y-5">
              {/* Response limit */}
              <div className="space-y-1.5">
                <Label htmlFor="setting-limit" className="text-sm font-medium">
                  Response Limit
                  <span className="ml-2 text-[11px] text-slate-400 font-normal">Leave blank for unlimited</span>
                </Label>
                <div className="relative max-w-[200px]">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    id="setting-limit"
                    type="number"
                    min="1"
                    className="pl-9"
                    placeholder="e.g. 500"
                    value={settingsForm.response_limit}
                    onChange={e => setSettingsForm(s => ({ ...s, response_limit: e.target.value }))}
                    data-testid="input-response-limit"
                  />
                </div>
                <p className="text-[11px] text-slate-400">Survey will automatically stop accepting responses when this limit is reached.</p>
              </div>

              {/* Deadline (auto-close) */}
              <div className="space-y-2">
                <Label htmlFor="setting-expiry" className="text-sm font-medium flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  Deadline (Auto-Close)
                  <span className="text-[11px] text-slate-400 font-normal">Leave blank for no deadline</span>
                </Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    <Input
                      id="setting-expiry"
                      type="datetime-local"
                      className="pl-9 w-[230px]"
                      value={settingsForm.expires_at}
                      onChange={e => setSettingsForm(s => ({ ...s, expires_at: e.target.value }))}
                      data-testid="input-expires-at"
                    />
                  </div>
                  {settingsForm.expires_at && (
                    <button
                      type="button"
                      onClick={() => setSettingsForm(s => ({ ...s, expires_at: '' }))}
                      className="text-[11px] text-slate-400 hover:text-red-500 underline underline-offset-2 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">Pick a date <strong>and time</strong> — the survey stops accepting responses at that exact moment.</p>

                {/* Countdown indicator card */}
                {settingsForm.expires_at && (() => {
                  const dl = new Date(settingsForm.expires_at);
                  const diffMs = dl.getTime() - Date.now();
                  if (diffMs < 0) return (
                    <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-red-700">Deadline has already passed</p>
                        <p className="text-[11px] text-red-500 mt-0.5">Survey will auto-close immediately when you save.</p>
                      </div>
                    </div>
                  );
                  const diffH = Math.floor(diffMs / 3_600_000);
                  const diffM = Math.floor((diffMs % 3_600_000) / 60_000);
                  const diffD = Math.floor(diffMs / 86_400_000);
                  const remH = diffH % 24;
                  const isUrgent = diffH < 24;
                  const isWarning = !isUrgent && diffD <= 3;
                  const bg = isUrgent ? 'bg-red-50 border-red-200' : isWarning ? 'bg-orange-50 border-orange-200' : 'bg-emerald-50 border-emerald-200';
                  const iconColor = isUrgent ? 'text-red-500' : isWarning ? 'text-orange-500' : 'text-emerald-600';
                  const titleColor = isUrgent ? 'text-red-700' : isWarning ? 'text-orange-700' : 'text-emerald-700';
                  const subColor = isUrgent ? 'text-red-500' : isWarning ? 'text-orange-500' : 'text-emerald-600';
                  return (
                    <div className={`flex items-start gap-2.5 border rounded-lg px-3 py-2.5 ${bg}`}>
                      <Clock className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${titleColor}`}>
                          {isUrgent
                            ? `${diffH}h ${diffM}m remaining`
                            : `${diffD} day${diffD !== 1 ? 's' : ''} ${remH}h remaining`}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${subColor}`}>
                          Closes {dl.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at {dl.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                        isUrgent ? 'bg-red-100 text-red-700' : isWarning ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isUrgent ? 'URGENT' : isWarning ? 'SOON' : 'OK'}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Allow multiple submissions */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={settingsForm.allow_multiple}
                    onChange={e => setSettingsForm(s => ({ ...s, allow_multiple: e.target.checked }))}
                    data-testid="toggle-allow-multiple"
                  />
                  <div className={cn(
                    'w-10 h-6 rounded-full transition-colors',
                    settingsForm.allow_multiple ? 'bg-indigo-600' : 'bg-slate-200',
                  )}>
                    <div className={cn(
                      'w-4 h-4 bg-white rounded-full shadow transition-transform m-1',
                      settingsForm.allow_multiple ? 'translate-x-4' : 'translate-x-0',
                    )} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Allow multiple submissions</p>
                  <p className="text-[11px] text-slate-400">Same user can submit more than once</p>
                </div>
              </label>
            </div>
          </div>

          {/* Target Respondents */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <Users className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-800">Target Respondents</h3>
              {settingsForm.target_user_ids.length > 0 && (
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                  {settingsForm.target_user_ids.length} assigned
                </span>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100">
              <button
                type="button"
                data-testid="tab-target-select"
                onClick={() => setTargetTab('select')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors',
                  targetTab === 'select'
                    ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/40'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                )}
              >
                <UserCheck className="w-3.5 h-3.5" />Select Users
              </button>
              <button
                type="button"
                data-testid="tab-target-status"
                onClick={() => setTargetTab('status')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors',
                  targetTab === 'status'
                    ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/40'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                )}
              >
                <BarChart3 className="w-3.5 h-3.5" />Submission Status
                {settingsForm.target_user_ids.length > 0 && (
                  <span className="ml-1 bg-slate-200 text-slate-600 rounded-full text-[10px] px-1.5 py-0.5 font-bold">
                    {settingsForm.target_user_ids.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab: Select Users */}
            {targetTab === 'select' && (
              <div className="p-4 space-y-3">
                <p className="text-[11px] text-slate-400">
                  Check the staff members expected to complete this survey. Checked users will receive targeted notifications.
                </p>

                {/* Search */}
                <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus-within:ring-2 focus-within:ring-indigo-200 focus-within:border-indigo-400">
                  <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Filter by name or role…"
                    value={targetUserSearch}
                    onChange={e => setTargetUserSearch(e.target.value)}
                    className="flex-1 text-sm bg-transparent outline-none placeholder-slate-400"
                    data-testid="input-target-user-search"
                  />
                  {targetUserSearch && (
                    <button type="button" onClick={() => setTargetUserSearch('')} className="text-slate-300 hover:text-slate-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Select / deselect all row */}
                {allUsers.length > 0 && (
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] text-slate-400">
                      {settingsForm.target_user_ids.length} of {allUsers.length} selected
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSettingsForm(s => ({ ...s, target_user_ids: allUsers.map(u => u.id) }))}
                        className="text-[11px] text-indigo-600 hover:underline font-medium"
                        data-testid="btn-target-select-all"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettingsForm(s => ({ ...s, target_user_ids: [] }))}
                        className="text-[11px] text-slate-400 hover:text-red-500 hover:underline font-medium"
                        data-testid="btn-target-clear-all"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>
                )}

                {/* Full user list */}
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr>
                        <th className="w-8 px-3 py-2"></th>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">Name</th>
                        <th className="text-left px-3 py-2 text-slate-500 font-medium">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allUsers
                        .filter(u =>
                          !targetUserSearch ||
                          (u.full_name ?? '').toLowerCase().includes(targetUserSearch.toLowerCase()) ||
                          (u.role ?? '').toLowerCase().includes(targetUserSearch.toLowerCase()),
                        )
                        .map(u => {
                          const checked = settingsForm.target_user_ids.includes(u.id);
                          return (
                            <tr
                              key={u.id}
                              onClick={() => setSettingsForm(s => ({
                                ...s,
                                target_user_ids: checked
                                  ? s.target_user_ids.filter(x => x !== u.id)
                                  : [...s.target_user_ids, u.id],
                              }))}
                              className={cn(
                                'cursor-pointer transition-colors',
                                checked ? 'bg-indigo-50/60 hover:bg-indigo-50' : 'hover:bg-slate-50',
                              )}
                              data-testid={`row-target-user-${u.id}`}
                            >
                              <td className="px-3 py-2.5 text-center">
                                <div className={cn(
                                  'w-4 h-4 rounded border-2 flex items-center justify-center mx-auto transition-colors',
                                  checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white',
                                )}>
                                  {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 font-medium text-slate-800">{u.full_name ?? '—'}</td>
                              <td className="px-3 py-2.5 text-slate-500">{u.role ?? '—'}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {allUsers.filter(u =>
                    !targetUserSearch ||
                    (u.full_name ?? '').toLowerCase().includes(targetUserSearch.toLowerCase()) ||
                    (u.role ?? '').toLowerCase().includes(targetUserSearch.toLowerCase()),
                  ).length === 0 && (
                    <div className="py-8 text-center text-slate-400 text-xs">No users match your search</div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Submission Status */}
            {targetTab === 'status' && (
              <div className="p-4 space-y-3">
                {targetUserProfiles.length === 0 ? (
                  <div className="py-10 flex flex-col items-center gap-2 text-slate-400">
                    <Users className="w-7 h-7 opacity-30" />
                    <p className="text-xs">No users assigned yet — select users in the first tab.</p>
                  </div>
                ) : (
                  <>
                    {/* Summary pills */}
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="flex items-center gap-1 text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />{submittedTargetUsers.length} submitted
                      </span>
                      <span className="flex items-center gap-1 text-amber-600 font-semibold bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
                        <Clock className="w-3 h-3" />{pendingTargetUsers.length} pending
                      </span>
                      <span className="ml-auto text-slate-400">{targetUserProfiles.length} total</span>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((submittedTargetUsers.length / (targetUserProfiles.length || 1)) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 text-right">
                        {Math.round((submittedTargetUsers.length / (targetUserProfiles.length || 1)) * 100)}% completion rate
                      </p>
                    </div>

                    {/* Status table */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                          <tr>
                            <th className="text-left px-3 py-2 text-slate-500 font-medium">Name</th>
                            <th className="text-left px-3 py-2 text-slate-500 font-medium">Role</th>
                            <th className="text-center px-3 py-2 text-slate-500 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {targetUserProfiles.map(u => {
                            const submitted = submittedUserIds.has(u.id);
                            const responseEntry = responses.find(r => r.respondent_id === u.id);
                            return (
                              <tr key={u.id} className="hover:bg-slate-50/50">
                                <td className="px-3 py-2.5 font-medium text-slate-800">{u.full_name ?? '—'}</td>
                                <td className="px-3 py-2.5 text-slate-500">{u.role ?? '—'}</td>
                                <td className="px-3 py-2.5 text-center">
                                  {submitted ? (
                                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                      <CheckCircle2 className="w-2.5 h-2.5" />Submitted
                                      {responseEntry?.submitted_at && (
                                        <span className="text-emerald-500 font-normal ml-0.5">
                                          · {new Date(responseEntry.submitted_at as string).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                      <Clock className="w-2.5 h-2.5" />Pending
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Display Settings */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <Globe className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-800">Display Settings</h3>
            </div>
            <div className="p-5 space-y-5">
              {/* Multi-page mode */}
              <label className="flex items-start gap-3 cursor-pointer">
                <div className="relative shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={settingsForm.multi_page}
                    onChange={e => setSettingsForm(s => ({ ...s, multi_page: e.target.checked }))}
                    data-testid="toggle-multi-page"
                  />
                  <div className={cn(
                    'w-10 h-6 rounded-full transition-colors',
                    settingsForm.multi_page ? 'bg-indigo-600' : 'bg-slate-200',
                  )}>
                    <div className={cn(
                      'w-4 h-4 bg-white rounded-full shadow transition-transform m-1',
                      settingsForm.multi_page ? 'translate-x-4' : 'translate-x-0',
                    )} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Multi-page mode</p>
                  <p className="text-[11px] text-slate-400">
                    Each Section Header becomes a separate page with Next/Back navigation.
                    Respondents see one section at a time.
                  </p>
                </div>
              </label>

              {/* Show progress bar */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={settingsForm.show_progress}
                    onChange={e => setSettingsForm(s => ({ ...s, show_progress: e.target.checked }))}
                    data-testid="toggle-show-progress"
                  />
                  <div className={cn(
                    'w-10 h-6 rounded-full transition-colors',
                    settingsForm.show_progress ? 'bg-indigo-600' : 'bg-slate-200',
                  )}>
                    <div className={cn(
                      'w-4 h-4 bg-white rounded-full shadow transition-transform m-1',
                      settingsForm.show_progress ? 'translate-x-4' : 'translate-x-0',
                    )} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Show progress bar</p>
                  <p className="text-[11px] text-slate-400">Displays completion % in the top bar of the fill form</p>
                </div>
              </label>
            </div>
          </div>

          {/* Completion Message */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-800">Completion Message</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[11px] text-slate-400">
                Shown to respondents after they submit. First line = heading, remaining lines = body text.
                Leave blank to use the default "Thank you!" message.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="setting-ty-msg" className="text-sm font-medium">
                  Message <span className="text-slate-400 font-normal text-[10px]">(English)</span>
                </Label>
                <Textarea
                  id="setting-ty-msg"
                  rows={3}
                  placeholder={"Thank you!\nYour response has been recorded successfully."}
                  value={settingsForm.thank_you_message}
                  onChange={e => setSettingsForm(s => ({ ...s, thank_you_message: e.target.value }))}
                  data-testid="input-thank-you-message"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setting-ty-msg-ar" className="text-sm font-medium flex items-center gap-1">
                  الرسالة <span className="text-slate-400 font-normal text-[10px]">(Arabic)</span>
                </Label>
                <Textarea
                  id="setting-ty-msg-ar"
                  dir="rtl"
                  lang="ar"
                  rows={3}
                  placeholder={"شكراً لك!\nتم تسجيل ردك بنجاح."}
                  value={settingsForm.thank_you_message_ar}
                  onChange={e => setSettingsForm(s => ({ ...s, thank_you_message_ar: e.target.value }))}
                  data-testid="input-thank-you-message-ar"
                />
              </div>
            </div>
          </div>

          {/* Scheduled Activation */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <CalendarClock className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-800">Scheduled Activation</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[11px] text-slate-400">
                Set a future date/time to automatically activate this survey. Leave blank to activate manually.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="setting-activate-at" className="text-sm font-medium">
                  Activate at <span className="text-slate-400 font-normal text-[10px]">(leave blank to skip)</span>
                </Label>
                <div className="relative max-w-[260px]">
                  <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    id="setting-activate-at"
                    type="datetime-local"
                    className="pl-9"
                    value={settingsForm.activate_at}
                    onChange={e => setSettingsForm(s => ({ ...s, activate_at: e.target.value }))}
                    data-testid="input-activate-at"
                  />
                </div>
                {settingsForm.activate_at && (() => {
                  const at = new Date(settingsForm.activate_at);
                  const diffMs = at.getTime() - Date.now();
                  const isPast = diffMs < 0;
                  const diffH = Math.floor(diffMs / 3_600_000);
                  const diffD = Math.floor(diffMs / 86_400_000);
                  const timeStr = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                  const dateStr = at.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <div className={`flex items-start gap-2.5 border rounded-lg px-3 py-2.5 ${isPast ? 'bg-amber-50 border-amber-200' : 'bg-indigo-50 border-indigo-200'}`}>
                      <CalendarClock className={`w-4 h-4 shrink-0 mt-0.5 ${isPast ? 'text-amber-500' : 'text-indigo-500'}`} />
                      <div className="flex-1">
                        <p className={`text-xs font-semibold ${isPast ? 'text-amber-700' : 'text-indigo-700'}`}>
                          {isPast ? 'Activation time has passed — activates on save' : `Activates in ${diffD > 0 ? `${diffD}d ` : ''}${diffH % 24}h`}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${isPast ? 'text-amber-500' : 'text-indigo-500'}`}>
                          Goes live {dateStr} at {timeStr}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative shrink-0">
                  <input type="checkbox" className="sr-only"
                    checked={settingsForm.is_template}
                    onChange={e => setSettingsForm(s => ({ ...s, is_template: e.target.checked }))}
                    data-testid="toggle-is-template"
                  />
                  <div className={cn('w-10 h-6 rounded-full transition-colors', settingsForm.is_template ? 'bg-violet-600' : 'bg-slate-200')}>
                    <div className={cn('w-4 h-4 bg-white rounded-full shadow transition-transform m-1', settingsForm.is_template ? 'translate-x-4' : 'translate-x-0')} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Mark as template</p>
                  <p className="text-[11px] text-slate-400">Template surveys appear in the template library for quick reuse</p>
                </div>
              </label>
            </div>
          </div>

          {/* Password Protection */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <Lock className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-800">Password Protection</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[11px] text-slate-400">
                Require respondents to enter a password or PIN before accessing the fill form. Leave blank for no protection.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="setting-fill-password" className="text-sm font-medium">
                  Access Password / PIN
                </Label>
                <div className="relative max-w-[260px]">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    id="setting-fill-password"
                    type="text"
                    className="pl-9 font-mono"
                    placeholder="e.g. survey2024 or 1234"
                    value={settingsForm.fill_password}
                    onChange={e => setSettingsForm(s => ({ ...s, fill_password: e.target.value }))}
                    data-testid="input-fill-password"
                  />
                </div>
                {settingsForm.fill_password.trim() && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1">
                    <Shield className="w-3 h-3" />Respondents will be asked for this password before filling
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Email Notifications */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <Mail className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-800">Email Notifications</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-[11px] text-slate-400">
                Send an email notification whenever a new response is submitted. Enter one or more email addresses separated by commas.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="setting-notify-emails" className="text-sm font-medium">
                  Notify email(s) on submission
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    id="setting-notify-emails"
                    type="text"
                    className="pl-9"
                    placeholder="e.g. manager@org.org, team@org.org"
                    value={settingsForm.notify_emails}
                    onChange={e => setSettingsForm(s => ({ ...s, notify_emails: e.target.value }))}
                    data-testid="input-notify-emails"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Deadline Reminders */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
              <BellRing className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-800">Deadline Reminders</h3>
              {settingsForm.reminder_enabled && (
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Active</span>
              )}
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[11px] text-slate-400">
                Automatically send email and WhatsApp reminders every day as the deadline approaches. Only works when a deadline (expires at) is set and the survey is active.
                تذكيرات تلقائية يومية عبر البريد الإلكتروني و واتساب عندما يقترب الموعد النهائي للاستبيان.
              </p>

              {/* Enable toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative shrink-0">
                  <input type="checkbox" className="sr-only"
                    checked={settingsForm.reminder_enabled}
                    onChange={e => setSettingsForm(s => ({ ...s, reminder_enabled: e.target.checked }))}
                    data-testid="toggle-reminder-enabled"
                  />
                  <div className={cn('w-10 h-6 rounded-full transition-colors', settingsForm.reminder_enabled ? 'bg-indigo-600' : 'bg-slate-200')}>
                    <div className={cn('w-4 h-4 bg-white rounded-full shadow transition-transform m-1', settingsForm.reminder_enabled ? 'translate-x-4' : 'translate-x-0')} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Enable automatic daily reminders</p>
                  <p className="text-[11px] text-slate-400">Sends reminders on the days you select below</p>
                </div>
              </label>

              {settingsForm.reminder_enabled && (
                <div className="space-y-4 pt-1 border-t border-slate-100">
                  {/* Days before */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Send reminders on these days before deadline</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: '7 days before', value: '7' },
                        { label: '3 days before', value: '3' },
                        { label: '1 day before', value: '1' },
                        { label: 'Day of deadline', value: '0' },
                      ].map(opt => {
                        const selected = settingsForm.reminder_days_before.split(',').map(d => d.trim()).includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            data-testid={`toggle-reminder-day-${opt.value}`}
                            onClick={() => {
                              const current = settingsForm.reminder_days_before.split(',').map(d => d.trim()).filter(Boolean);
                              const next = selected
                                ? current.filter(d => d !== opt.value)
                                : [...current, opt.value].sort((a, b) => Number(b) - Number(a));
                              setSettingsForm(s => ({ ...s, reminder_days_before: next.join(',') || '1' }));
                            }}
                            className={cn(
                              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors',
                              selected
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300',
                            )}
                          >
                            {selected && <CheckCircle2 className="w-3 h-3" />}
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400">Selected: {settingsForm.reminder_days_before || 'none'}</p>
                  </div>

                  {/* Reminder emails */}
                  <div className="space-y-1.5">
                    <Label htmlFor="reminder-emails" className="text-sm font-medium flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />Email addresses to remind
                    </Label>
                    <Input
                      id="reminder-emails"
                      type="text"
                      placeholder="e.g. team@org.org, manager@org.org"
                      value={settingsForm.reminder_emails}
                      onChange={e => setSettingsForm(s => ({ ...s, reminder_emails: e.target.value }))}
                      data-testid="input-reminder-emails"
                    />
                    <p className="text-[11px] text-slate-400">Comma-separated email addresses. Leave blank to use the submission notification emails above.</p>
                  </div>

                  {/* Reminder WhatsApp phones — smart picker */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-1.5">
                      <MessageSquareMore className="w-3.5 h-3.5 text-slate-400" />WhatsApp recipients
                    </Label>

                    {/* Role chips */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">By role — all users with that role</p>
                      <div className="flex flex-wrap gap-1.5">
                        {REMINDER_ROLES.map(r => {
                          const count = waUsers.filter(u => u.role === r.id).length;
                          const active = settingsForm.reminder_roles.includes(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              data-testid={`toggle-wa-role-${r.id}`}
                              onClick={() => setSettingsForm(s => ({
                                ...s,
                                reminder_roles: active
                                  ? s.reminder_roles.filter(x => x !== r.id)
                                  : [...s.reminder_roles, r.id],
                              }))}
                              className={cn(
                                'flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors',
                                active
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-400',
                              )}
                            >
                              {active && <CheckCircle2 className="w-3 h-3" />}
                              {r.label}
                              {count > 0 && (
                                <span className={cn('ml-0.5 text-[10px] rounded-full px-1', active ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500')}>
                                  {count}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Individual user picker */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Specific users</p>
                      <div className="relative">
                        <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus-within:ring-2 focus-within:ring-indigo-200 focus-within:border-indigo-400">
                          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <input
                            type="text"
                            placeholder="Search by name…"
                            value={waUserSearch}
                            onChange={e => { setWaUserSearch(e.target.value); setWaUserDropOpen(true); }}
                            onFocus={() => setWaUserDropOpen(true)}
                            onBlur={() => setTimeout(() => setWaUserDropOpen(false), 150)}
                            className="flex-1 text-sm bg-transparent outline-none placeholder-slate-400"
                            data-testid="input-wa-user-search"
                          />
                        </div>
                        {waUserDropOpen && (() => {
                          const filtered = waUsers.filter(u =>
                            !settingsForm.reminder_user_ids.includes(u.id) &&
                            (u.full_name ?? '').toLowerCase().includes(waUserSearch.toLowerCase()),
                          ).slice(0, 8);
                          return filtered.length > 0 ? (
                            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                              {filtered.map(u => (
                                <button
                                  key={u.id}
                                  type="button"
                                  data-testid={`add-wa-user-${u.id}`}
                                  onMouseDown={() => {
                                    setSettingsForm(s => ({ ...s, reminder_user_ids: [...s.reminder_user_ids, u.id] }));
                                    setWaUserSearch('');
                                    setWaUserDropOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 text-left"
                                >
                                  <span className="font-medium text-slate-800">{u.full_name ?? '—'}</span>
                                  <span className="text-[11px] text-slate-400">{u.phone}</span>
                                </button>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                      {/* Selected individual users */}
                      {settingsForm.reminder_user_ids.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {settingsForm.reminder_user_ids.map(uid => {
                            const u = waUsers.find(x => x.id === uid);
                            return (
                              <span
                                key={uid}
                                className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs rounded-full pl-2.5 pr-1.5 py-1"
                              >
                                <Users className="w-3 h-3" />
                                {u?.full_name ?? uid}
                                {u?.phone && <span className="text-indigo-400 text-[10px]">· {u.phone}</span>}
                                <button
                                  type="button"
                                  data-testid={`remove-wa-user-${uid}`}
                                  onClick={() => setSettingsForm(s => ({ ...s, reminder_user_ids: s.reminder_user_ids.filter(x => x !== uid) }))}
                                  className="ml-0.5 text-indigo-400 hover:text-indigo-700"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Manual phone numbers */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Additional numbers not in the system</p>
                      <Input
                        id="reminder-phones"
                        type="text"
                        placeholder="e.g. +249912345678, +249923456789"
                        value={settingsForm.reminder_phones}
                        onChange={e => setSettingsForm(s => ({ ...s, reminder_phones: e.target.value }))}
                        data-testid="input-reminder-phones"
                      />
                      <p className="text-[11px] text-slate-400">Comma-separated international numbers. Only needed for people not in the system.</p>
                    </div>

                    {/* Resolved summary */}
                    {(() => {
                      const norm = (p: string) => {
                        const s = p.trim().replace(/[\s\-\(\)\.]/g, '');
                        if (!s) return '';
                        if (s.startsWith('+')) return s;
                        if (s.startsWith('09') || s.startsWith('01')) return '+249' + s.slice(1);
                        if (s.startsWith('07')) return '+256' + s.slice(1);
                        return s;
                      };
                      const rolePhones = waUsers
                        .filter(u => settingsForm.reminder_roles.includes(u.role ?? ''))
                        .map(u => norm(u.phone!)).filter(Boolean);
                      const userPhones = settingsForm.reminder_user_ids
                        .map(uid => waUsers.find(u => u.id === uid)?.phone ?? '')
                        .map(norm).filter(Boolean);
                      const manualPhones = settingsForm.reminder_phones
                        .split(',').map(norm).filter(Boolean);
                      const allPhones = [...new Set([...rolePhones, ...userPhones, ...manualPhones])];
                      if (!allPhones.length && !settingsForm.reminder_roles.length && !settingsForm.reminder_user_ids.length) return null;
                      return (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 space-y-1">
                          <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5">
                            <MessageSquareMore className="w-3.5 h-3.5" />
                            Will notify {allPhones.length} number{allPhones.length !== 1 ? 's' : ''}
                            {settingsForm.reminder_roles.length > 0 && ` — ${settingsForm.reminder_roles.length} role${settingsForm.reminder_roles.length > 1 ? 's' : ''}`}
                            {settingsForm.reminder_user_ids.length > 0 && ` + ${settingsForm.reminder_user_ids.length} individual${settingsForm.reminder_user_ids.length > 1 ? 's' : ''}`}
                            {manualPhones.length > 0 && ` + ${manualPhones.length} manual`}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {allPhones.map(ph => (
                              <span key={ph} className="text-[10px] bg-emerald-100 text-emerald-700 rounded px-1.5 py-0.5 font-mono">{ph}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Message content previews */}
                  {(() => {
                    const surveyTitle = survey?.title ?? 'Survey Title';
                    const surveyTitleAr = (survey as unknown as Record<string,unknown>)?.title_ar as string | undefined;
                    const shortCode = (survey as unknown as Record<string,unknown>)?.short_code as string | undefined;
                    const surveyUrl = `https://app.pactorg.com/s/${shortCode ?? survey?.id ?? 'xxxxx'}`;

                    let daysLabel = 'in N days';
                    let deadlineDateStr = '—';
                    if (settingsForm.expires_at) {
                      const deadline = new Date(settingsForm.expires_at);
                      const msRemaining = deadline.getTime() - Date.now();
                      const daysRemaining = Math.round(msRemaining / 86_400_000);
                      daysLabel = daysRemaining === 0 ? 'today' : daysRemaining === 1 ? 'tomorrow' : `in ${daysRemaining} days`;
                      deadlineDateStr = deadline.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    }

                    const waText = `Survey "${surveyTitle}" deadline is ${daysLabel} (${deadlineDateStr}). Fill it here: ${surveyUrl}`;

                    return (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          data-testid="toggle-msg-preview"
                          onClick={() => setShowMsgPreview(v => !v)}
                          className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                        >
                          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                            <Eye className="w-3.5 h-3.5" />
                            Preview reminder messages
                          </span>
                          <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', showMsgPreview && 'rotate-180')} />
                        </button>

                        {showMsgPreview && (
                          <div className="divide-y divide-slate-100">

                            {/* WhatsApp preview */}
                            <div className="p-3 space-y-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                <MessageSquareMore className="w-3 h-3 text-emerald-500" />WhatsApp message
                              </p>
                              <div className="bg-[#dcf8c6] rounded-xl rounded-tl-sm px-3 py-2 max-w-xs text-[12px] text-slate-800 leading-relaxed shadow-sm">
                                {waText}
                              </div>
                              <p className="text-[10px] text-slate-400">Sent as a plain-text WhatsApp message. The link opens the survey directly.</p>
                            </div>

                            {/* Email preview */}
                            <div className="p-3 space-y-2">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                                <Mail className="w-3 h-3 text-indigo-500" />Email message
                              </p>
                              <div className="border border-slate-200 rounded-lg overflow-hidden text-[12px] shadow-sm">
                                {/* Email header */}
                                <div className="bg-indigo-600 px-4 py-3">
                                  <p className="text-indigo-200 text-[10px] mb-0.5">PACT Platform — Survey Reminder</p>
                                  <p className="text-white font-bold">⏰ Survey Deadline Approaching</p>
                                </div>
                                {/* Email body */}
                                <div className="px-4 py-3 bg-white space-y-3">
                                  <p className="text-slate-600">
                                    The following survey deadline is <strong>{daysLabel}</strong>:
                                  </p>
                                  <div className="bg-indigo-50 rounded-lg px-3 py-2.5">
                                    <p className="text-indigo-700 font-bold">{surveyTitle}</p>
                                    {surveyTitleAr && surveyTitleAr !== surveyTitle && (
                                      <p className="text-slate-500 text-[11px] text-right mt-0.5" dir="rtl">{surveyTitleAr}</p>
                                    )}
                                    <p className="text-slate-500 text-[11px] mt-1">Deadline: <strong>{deadlineDateStr}</strong> ({daysLabel})</p>
                                  </div>
                                  <p className="text-slate-500 text-[11px]">Please make sure to submit your response before the deadline. After it closes, the survey will no longer accept responses.</p>
                                  <div className="inline-block bg-indigo-600 text-white text-[11px] font-semibold px-4 py-1.5 rounded-lg">
                                    Fill Out Survey →
                                  </div>
                                </div>
                                {/* Email footer */}
                                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100">
                                  <p className="text-slate-400 text-[10px] text-center">This is an automatic reminder from PACT Command Center.</p>
                                  <p className="text-slate-400 text-[10px] text-center mt-0.5" dir="rtl">تذكير تلقائي من منصة PACT — الموعد النهائي للاستبيان يقترب</p>
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-400">Subject: ⏰ Reminder: "{surveyTitle}" closes {daysLabel} — PACT Surveys</p>
                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Schedule preview */}
                  {settingsForm.expires_at && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                        <BellRing className="w-3.5 h-3.5" />Reminder schedule preview
                      </p>
                      {settingsForm.reminder_days_before.split(',').map(d => d.trim()).filter(Boolean).sort((a, b) => Number(b) - Number(a)).map(days => {
                        const deadline = new Date(settingsForm.expires_at);
                        const reminderDate = new Date(deadline.getTime() - Number(days) * 86_400_000);
                        const isPast = reminderDate < new Date();
                        return (
                          <div key={days} className={`flex items-center gap-2 text-[11px] ${isPast ? 'text-slate-400 line-through' : 'text-indigo-600'}`}>
                            <Clock className="w-3 h-3 shrink-0" />
                            {Number(days) === 0 ? 'Day of deadline' : `${days} day${Number(days) > 1 ? 's' : ''} before`}
                            {' — '}
                            {reminderDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                            {isPast && ' (past)'}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!settingsForm.expires_at && (
                    <div className="flex items-center gap-2 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      No deadline set — save a deadline in Collection Settings above before sending. Without it the reminder message will say "No deadline set".
                    </div>
                  )}

                  {/* Send / Test buttons */}
                  <div className="border-t border-slate-100 pt-3 space-y-3">
                    <p className="text-xs font-semibold text-slate-700">Send reminders manually</p>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Test send */}
                      <div className={cn('border rounded-lg p-3 space-y-2', settingsForm.expires_at ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50 opacity-60')}>
                        <div>
                          <p className={cn('text-[11px] font-semibold', settingsForm.expires_at ? 'text-amber-700' : 'text-slate-500')}>Send test</p>
                          <p className={cn('text-[10px] mt-0.5', settingsForm.expires_at ? 'text-amber-600' : 'text-slate-400')}>Adds a [TEST] label. Use to verify delivery without confusing recipients.</p>
                        </div>
                        <button
                          type="button"
                          data-testid="btn-test-reminder"
                          onClick={sendTestReminder}
                          disabled={testingReminder || sendingReminder || !settingsForm.expires_at}
                          className={cn(
                            'w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors',
                            !settingsForm.expires_at
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                              : testingReminder
                              ? 'bg-amber-100 border-amber-200 text-amber-400 cursor-not-allowed'
                              : 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600',
                          )}
                        >
                          {testingReminder
                            ? <><Loader2 className="w-3 h-3 animate-spin" />Sending…</>
                            : <><BellRing className="w-3 h-3" />Send test now</>}
                        </button>
                      </div>

                      {/* Real send */}
                      <div className={cn('border rounded-lg p-3 space-y-2', settingsForm.expires_at ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-slate-50 opacity-60')}>
                        <div>
                          <p className={cn('text-[11px] font-semibold', settingsForm.expires_at ? 'text-indigo-700' : 'text-slate-500')}>Send reminder now</p>
                          <p className={cn('text-[10px] mt-0.5', settingsForm.expires_at ? 'text-indigo-600' : 'text-slate-400')}>Sends the real reminder immediately — no label. Use any time you need.</p>
                        </div>
                        <button
                          type="button"
                          data-testid="btn-send-reminder"
                          onClick={sendRealReminder}
                          disabled={sendingReminder || testingReminder || !settingsForm.expires_at}
                          className={cn(
                            'w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors',
                            !settingsForm.expires_at
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                              : sendingReminder
                              ? 'bg-indigo-100 border-indigo-200 text-indigo-400 cursor-not-allowed'
                              : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700',
                          )}
                        >
                          {sendingReminder
                            ? <><Loader2 className="w-3 h-3 animate-spin" />Sending…</>
                            : <><BellRing className="w-3 h-3" />Send now</>}
                        </button>
                      </div>
                    </div>

                    {/* Test result */}
                    {testReminderResult && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-2">
                        <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />Test sent — {testReminderResult.wa_sent}/{testReminderResult.wa_total} WhatsApp · {testReminderResult.emails_sent}/{testReminderResult.emails_total} email
                        </p>
                        {testReminderResult.phones.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {testReminderResult.phones.map(ph => (
                              <span key={ph} className="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-mono">{ph}</span>
                            ))}
                          </div>
                        )}
                        {testReminderResult.emails.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {testReminderResult.emails.map(em => (
                              <span key={em} className="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">{em}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Real send result */}
                    {sendReminderResult && (
                      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 space-y-2">
                        <p className="text-[11px] font-semibold text-green-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />Reminder sent — {sendReminderResult.wa_sent}/{sendReminderResult.wa_total} WhatsApp · {sendReminderResult.emails_sent}/{sendReminderResult.emails_total} email
                        </p>
                        {sendReminderResult.phones.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {sendReminderResult.phones.map(ph => (
                              <span key={ph} className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-mono">{ph}</span>
                            ))}
                          </div>
                        )}
                        {sendReminderResult.emails.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {sendReminderResult.emails.map(em => (
                              <span key={em} className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5">{em}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>

          {/* Send Notifications Now */}
          {settingsForm.target_user_ids.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
                <BellRing className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-semibold text-slate-800">Send Notifications Now</h3>
                <span className="ml-auto text-[10px] text-slate-400">Manual — sent immediately</span>
              </div>
              <div className="p-5 space-y-5">

                {/* Channel selector */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Channels</p>
                  <div className="flex items-center gap-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifChannels.whatsapp}
                        onChange={e => setNotifChannels(s => ({ ...s, whatsapp: e.target.checked }))}
                        className="rounded border-slate-300 text-indigo-600"
                        data-testid="toggle-notif-channel-whatsapp"
                      />
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-sm font-medium text-slate-700">WhatsApp</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifChannels.email}
                        onChange={e => setNotifChannels(s => ({ ...s, email: e.target.checked }))}
                        className="rounded border-slate-300 text-indigo-600"
                        data-testid="toggle-notif-channel-email"
                      />
                      <Mail className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-sm font-medium text-slate-700">Email</span>
                    </label>
                  </div>
                </div>

                {/* Message templates */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                      <BellRing className="w-3.5 h-3.5 text-amber-500" />Reminder message
                      <span className="text-[10px] text-slate-400 font-normal">(leave blank to use default)</span>
                    </label>
                    <Textarea
                      placeholder="e.g. Please complete the survey before the deadline…"
                      value={settingsForm.reminder_message_en}
                      onChange={e => setSettingsForm(s => ({ ...s, reminder_message_en: e.target.value }))}
                      className="text-sm resize-none"
                      rows={2}
                      data-testid="input-reminder-message-en"
                    />
                    <Textarea
                      placeholder="رسالة التذكير بالعربية (اختياري)"
                      value={settingsForm.reminder_message_ar}
                      onChange={e => setSettingsForm(s => ({ ...s, reminder_message_ar: e.target.value }))}
                      className="text-sm resize-none"
                      rows={2}
                      dir="rtl"
                      data-testid="input-reminder-message-ar"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />Thank-you message
                      <span className="text-[10px] text-slate-400 font-normal">(leave blank to use default)</span>
                    </label>
                    <Textarea
                      placeholder="e.g. Thank you for completing the survey! Your response has been recorded."
                      value={settingsForm.thankyou_notify_message_en}
                      onChange={e => setSettingsForm(s => ({ ...s, thankyou_notify_message_en: e.target.value }))}
                      className="text-sm resize-none"
                      rows={2}
                      data-testid="input-thankyou-message-en"
                    />
                    <Textarea
                      placeholder="رسالة الشكر بالعربية (اختياري)"
                      value={settingsForm.thankyou_notify_message_ar}
                      onChange={e => setSettingsForm(s => ({ ...s, thankyou_notify_message_ar: e.target.value }))}
                      className="text-sm resize-none"
                      rows={2}
                      dir="rtl"
                      data-testid="input-thankyou-message-ar"
                    />
                  </div>
                </div>

                {/* Send buttons */}
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Send to</p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      data-testid="btn-notif-reminder"
                      onClick={() => sendManualNotif('reminder')}
                      disabled={!!sendingManualNotif || pendingTargetUsers.length === 0}
                      className={cn(
                        'flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border font-medium text-xs transition-all',
                        sendingManualNotif === 'reminder'
                          ? 'bg-amber-100 border-amber-200 text-amber-500 cursor-not-allowed'
                          : pendingTargetUsers.length === 0
                          ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
                      )}
                    >
                      {sendingManualNotif === 'reminder'
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <BellRing className="w-4 h-4" />}
                      <span className="font-semibold">Remind pending</span>
                      <span className="text-[10px] opacity-70">{pendingTargetUsers.length} user{pendingTargetUsers.length !== 1 ? 's' : ''}</span>
                    </button>

                    <button
                      type="button"
                      data-testid="btn-notif-thankyou"
                      onClick={() => sendManualNotif('thankyou')}
                      disabled={!!sendingManualNotif || submittedTargetUsers.length === 0}
                      className={cn(
                        'flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border font-medium text-xs transition-all',
                        sendingManualNotif === 'thankyou'
                          ? 'bg-emerald-100 border-emerald-200 text-emerald-500 cursor-not-allowed'
                          : submittedTargetUsers.length === 0
                          ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
                      )}
                    >
                      {sendingManualNotif === 'thankyou'
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <CheckCircle2 className="w-4 h-4" />}
                      <span className="font-semibold">Thank submitters</span>
                      <span className="text-[10px] opacity-70">{submittedTargetUsers.length} user{submittedTargetUsers.length !== 1 ? 's' : ''}</span>
                    </button>

                    <button
                      type="button"
                      data-testid="btn-notif-all"
                      onClick={() => sendManualNotif('all')}
                      disabled={!!sendingManualNotif || targetUserProfiles.length === 0}
                      className={cn(
                        'flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border font-medium text-xs transition-all',
                        sendingManualNotif === 'all'
                          ? 'bg-indigo-100 border-indigo-200 text-indigo-400 cursor-not-allowed'
                          : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100',
                      )}
                    >
                      {sendingManualNotif === 'all'
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Users className="w-4 h-4" />}
                      <span className="font-semibold">Notify all</span>
                      <span className="text-[10px] opacity-70">{targetUserProfiles.length} user{targetUserProfiles.length !== 1 ? 's' : ''}</span>
                    </button>
                  </div>
                </div>

                {/* Result banner */}
                {manualNotifResult && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <p className="text-[11px] font-semibold text-indigo-700">
                      {manualNotifResult.type === 'reminder' ? 'Reminder' : manualNotifResult.type === 'thankyou' ? 'Thank-you' : 'Notification'} sent —{' '}
                      {notifChannels.whatsapp && `${manualNotifResult.wa_sent}/${manualNotifResult.wa_total} WhatsApp`}
                      {notifChannels.whatsapp && notifChannels.email && ' · '}
                      {notifChannels.email && `${manualNotifResult.email_sent}/${manualNotifResult.email_total} email`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Save */}
          <div className="flex items-center gap-3">
            <Button
              onClick={saveSettings}
              disabled={savingSettings}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
              data-testid="btn-save-settings"
            >
              {savingSettings
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                : <><Settings className="w-3.5 h-3.5" />Save Settings</>}
            </Button>
            {survey.status === 'active' && (
              <a
                href={`/s/${survey.short_code ?? survey.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />Preview fill form
              </a>
            )}
          </div>

          {/* Current settings summary */}
          {survey.settings && Object.keys(survey.settings).some(k => survey.settings[k] != null && survey.settings[k] !== '' && survey.settings[k] !== true) && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Active restrictions</p>
              <div className="flex flex-wrap gap-2">
                {survey.settings.response_limit != null && (
                  <span className="flex items-center gap-1 text-xs bg-white border border-indigo-200 text-indigo-700 px-2 py-1 rounded-lg">
                    <Users className="w-3 h-3" />Limit: {String(survey.settings.response_limit)} responses
                  </span>
                )}
                {survey.settings.expires_at && (() => {
                  const exp = new Date(String(survey.settings.expires_at));
                  const diffMs = exp.getTime() - Date.now();
                  const isPast = diffMs < 0;
                  const diffD = Math.floor(diffMs / 86_400_000);
                  const diffH = Math.floor(diffMs / 3_600_000);
                  const countdown = isPast ? 'Expired' : diffH < 24 ? `${diffH}h left` : `${diffD}d left`;
                  const borderCls = isPast ? 'border-red-200 text-red-700' : diffH < 24 ? 'border-red-200 text-red-700' : diffD <= 3 ? 'border-orange-200 text-orange-700' : 'border-orange-200 text-orange-700';
                  return (
                    <span className={`flex items-center gap-1.5 text-xs bg-white border px-2 py-1 rounded-lg ${borderCls}`}>
                      <Clock className="w-3 h-3" />
                      Deadline: {exp.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} {exp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      <span className={`font-semibold ml-0.5 ${isPast || diffH < 24 ? 'text-red-600' : diffD <= 3 ? 'text-orange-600' : 'text-orange-600'}`}>· {countdown}</span>
                    </span>
                  );
                })()}
                {survey.settings.multi_page && (
                  <span className="flex items-center gap-1 text-xs bg-white border border-violet-200 text-violet-700 px-2 py-1 rounded-lg">
                    <FileText className="w-3 h-3" />Multi-page
                  </span>
                )}
                {survey.settings.allow_multiple && (
                  <span className="flex items-center gap-1 text-xs bg-white border border-emerald-200 text-emerald-700 px-2 py-1 rounded-lg">
                    <Users className="w-3 h-3" />Multiple submissions allowed
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Submission Edit Dialog ──────────────────────────────────────── */}
      {editTarget && (
        <Dialog open onOpenChange={() => setEditTarget(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PenLine className="w-4 h-4 text-violet-500" />Edit Submission
                <span className="text-[11px] text-slate-400 font-normal ml-1">
                  — {editTarget.respondent_name ?? editTarget.respondent_email ?? 'Anonymous'}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-700">Changes are logged to the audit trail. All edits are attributed to you with a timestamp.</p>
              </div>
              {nonStructural.map(q => {
                const cur = editAnswers[q.id] ?? '';
                const isChoice = ['radio','dropdown'].includes(q.type);
                return (
                  <div key={q.id} className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      {q.label}
                      {q.required && <span className="text-red-400">*</span>}
                    </Label>
                    {isChoice ? (
                      <Select value={cur} onValueChange={v => setEditAnswers(p => ({ ...p, [q.id]: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(q.options ?? []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : q.type === 'textarea' ? (
                      <Textarea rows={2} value={cur} onChange={e => setEditAnswers(p => ({ ...p, [q.id]: e.target.value }))} className="text-xs" />
                    ) : (
                      <Input
                        type={['number','integer'].includes(q.type) ? 'number' : q.type === 'date' ? 'date' : q.type === 'time' ? 'time' : 'text'}
                        value={cur}
                        onChange={e => setEditAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    )}
                  </div>
                );
              })}
              <div className="space-y-1.5">
                <Label className="text-xs">Edit note (optional)</Label>
                <Textarea rows={2} value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Reason for editing this submission…" className="text-xs" />
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <Button
                  disabled={editSaving}
                  onClick={async () => {
                    setEditSaving(true);
                    try {
                      const responseId = editTarget.id;
                      const jsonTypes = ['checkbox', 'rating', 'scale', 'image', 'file'];
                      const editOps: Promise<unknown>[] = [];
                      for (const q of nonStructural) {
                        const newVal = editAnswers[q.id] ?? '';
                        const existing = allAnswers.find(a => a.response_id === responseId && a.question_id === q.id);
                        const isJson = jsonTypes.includes(q.type);
                        // Log the change
                        editOps.push(
                          supabase.from('survey_answer_edits').insert({
                            response_id: responseId,
                            question_id: q.id,
                            old_answer_text: existing?.answer_text ?? null,
                            old_answer_json: existing?.answer_json ?? null,
                            new_answer_text: isJson ? null : (newVal || null),
                            new_answer_json: isJson ? (newVal || null) : null,
                            edited_by: currentUser?.id ?? null,
                            edit_note: editNote || null,
                          })
                        );
                        if (existing) {
                          editOps.push(
                            supabase.from('survey_answers').update({
                              answer_text: isJson ? null : (newVal || null),
                              answer_json: isJson ? (newVal || null) : null,
                            }).eq('id', existing.id)
                          );
                        } else if (newVal) {
                          editOps.push(
                            supabase.from('survey_answers').insert({
                              response_id: responseId,
                              question_id: q.id,
                              answer_text: isJson ? null : newVal,
                              answer_json: isJson ? newVal : null,
                            })
                          );
                        }
                      }
                      await Promise.all(editOps);
                      qc.invalidateQueries({ queryKey: ['survey-answers', id] });
                      toast({ title: 'Submission updated', description: 'Changes saved and logged to audit trail.' });
                      setEditTarget(null);
                    } catch (e: any) {
                      toast({ title: 'Failed to save edits', description: e.message, variant: 'destructive' });
                    } finally {
                      setEditSaving(false);
                    }
                  }}
                  className="gap-1.5 bg-violet-600 hover:bg-violet-700"
                >
                  {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save Changes
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditTarget(null)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── XLSForm Import Dialog ────────────────────────────────────────── */}
      {importXlsOpen && (
        <Dialog open onOpenChange={v => { if (!v) { setImportXlsOpen(false); setImportXlsFile(null); setImportXlsParsed([]); setImportXlsSelected(new Set()); } }}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-500" />Import Questions from XLSForm
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              {!importXlsFile ? (
                <div
                  className="flex flex-col items-center gap-3 border-2 border-dashed border-slate-200 rounded-xl p-8 bg-slate-50 cursor-pointer hover:border-indigo-300 transition-colors"
                  onClick={() => document.getElementById('xls-upload-input')?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={async e => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (!file) return;
                    setImportXlsFile(file);
                    try {
                      const ab = await file.arrayBuffer();
                      const wb = XLSX.read(ab, { type: 'array' });
                      const ws = wb.Sheets[wb.SheetNames[0]];
                      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
                      const parsed = rows
                        .filter(r => r.type && r.name && r.label)
                        .map((r, ri) => ({
                          id: `xls-${ri}`,
                          type: r.type.replace('select_one ', 'radio').replace('select_multiple ', 'checkbox').replace('select one ', 'radio').replace('select multiple ', 'checkbox') as string,
                          label: r.label ?? r['label::English'] ?? '',
                          label_ar: r['label::Arabic'] ?? '',
                          name: r.name ?? '',
                          required: (r.required ?? '').toLowerCase() === 'yes',
                          hint: r.hint ?? '',
                          choices: (r.choices ?? '').split('|').map((c: string) => c.trim()).filter(Boolean),
                        }));
                      setImportXlsParsed(parsed);
                      setImportXlsSelected(new Set(parsed.map(p => p.id)));
                    } catch { toast({ title: 'Parse error', description: 'Could not read the spreadsheet. Please use a valid XLSForm .xlsx file.', variant: 'destructive' }); }
                  }}
                >
                  <input id="xls-upload-input" type="file" accept=".xlsx,.xls,.ods,.csv" className="hidden"
                    onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      setImportXlsFile(file);
                      try {
                        const ab = await file.arrayBuffer();
                        const wb = XLSX.read(ab, { type: 'array' });
                        const ws = wb.Sheets[wb.SheetNames[0]];
                        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
                        const parsed = rows
                          .filter(r => r.type && r.name && r.label)
                          .map((r, ri) => ({
                            id: `xls-${ri}`,
                            type: r.type.replace('select_one ', 'radio').replace('select_multiple ', 'checkbox') as string,
                            label: r.label ?? r['label::English'] ?? '',
                            label_ar: r['label::Arabic'] ?? '',
                            name: r.name ?? '',
                            required: (r.required ?? '').toLowerCase() === 'yes',
                            hint: r.hint ?? '',
                            choices: (r.choices ?? '').split('|').map((c: string) => c.trim()).filter(Boolean),
                          }));
                        setImportXlsParsed(parsed);
                        setImportXlsSelected(new Set(parsed.map(p => p.id)));
                      } catch { toast({ title: 'Parse error', description: 'Could not read the spreadsheet.', variant: 'destructive' }); }
                    }}
                  />
                  <Upload className="w-8 h-8 text-indigo-300" />
                  <p className="text-sm font-semibold text-slate-600">Drop an XLSForm file here</p>
                  <p className="text-xs text-slate-400">Supports .xlsx / .xls. Must have columns: type, name, label, required.</p>
                  <Button size="sm" variant="outline" className="mt-1" onClick={e => { e.stopPropagation(); document.getElementById('xls-upload-input')?.click(); }}>Browse files</Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{importXlsFile.name}</p>
                      <p className="text-xs text-slate-400">{importXlsParsed.length} question{importXlsParsed.length !== 1 ? 's' : ''} found</p>
                    </div>
                    <button onClick={() => { setImportXlsFile(null); setImportXlsParsed([]); setImportXlsSelected(new Set()); }}
                      className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                      <X className="w-3.5 h-3.5" />Change file
                    </button>
                  </div>
                  {importXlsParsed.length === 0 ? (
                    <p className="text-sm text-amber-600 bg-amber-50 rounded-lg p-3 text-center">No valid questions found. Check that the sheet has "type", "name", and "label" columns.</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <input type="checkbox"
                          checked={importXlsSelected.size === importXlsParsed.length}
                          onChange={e => setImportXlsSelected(e.target.checked ? new Set(importXlsParsed.map(p => p.id)) : new Set())}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600"
                        />
                        <span className="text-xs text-slate-500">{importXlsSelected.size} of {importXlsParsed.length} selected</span>
                      </div>
                      <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                        {importXlsParsed.map(q => (
                          <div key={q.id} className={cn('flex items-start gap-2 p-2.5 rounded-lg border transition-colors cursor-pointer', importXlsSelected.has(q.id) ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100 bg-white')}
                            onClick={() => setImportXlsSelected(prev => { const n = new Set(prev); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; })}>
                            <input type="checkbox" checked={importXlsSelected.has(q.id)} readOnly className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{q.type}</span>
                                {q.required && <span className="text-[10px] text-red-500">required</span>}
                              </div>
                              <p className="text-xs font-medium text-slate-700 mt-0.5 truncate">{q.label || q.name}</p>
                              {q.label_ar && <p className="text-[11px] text-slate-400 truncate" dir="rtl">{q.label_ar}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => { setImportXlsOpen(false); setImportXlsFile(null); setImportXlsParsed([]); setImportXlsSelected(new Set()); }}>Cancel</Button>
                    <Button size="sm" disabled={importXlsLoading || importXlsSelected.size === 0}
                      onClick={async () => {
                        if (importXlsSelected.size === 0) return;
                        setImportXlsLoading(true);
                        const toImport = importXlsParsed.filter(q => importXlsSelected.has(q.id));
                        const maxOrder = questions.reduce((m, q) => Math.max(m, q.order_index), 0);
                        let ok = 0;
                        for (let i = 0; i < toImport.length; i++) {
                          const q = toImport[i];
                          const validTypes = ['text','textarea','radio','checkbox','rating','scale','date','dropdown','section_header','number','integer','phone','email','time','datetime','gps','image','file','barcode','note'];
                          const qType = validTypes.includes(q.type) ? q.type : 'text';
                          const { error } = await supabase.from('survey_questions').insert({
                            survey_id: id,
                            type: qType,
                            label: q.label || q.name,
                            label_ar: q.label_ar || null,
                            required: q.required,
                            order_index: maxOrder + i + 1,
                            settings: {},
                          });
                          if (!error) ok++;
                        }
                        qc.invalidateQueries({ queryKey: ['survey-questions', id] });
                        setImportXlsLoading(false);
                        setImportXlsOpen(false); setImportXlsFile(null); setImportXlsParsed([]); setImportXlsSelected(new Set());
                        toast({ title: `${ok} question${ok !== 1 ? 's' : ''} imported` });
                      }}
                      className="gap-1.5">
                      {importXlsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Import {importXlsSelected.size > 0 ? importXlsSelected.size : ''} Question{importXlsSelected.size !== 1 ? 's' : ''}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Share Dialog ─────────────────────────────────────────────────── */}
      {shareOpen && (
        <Dialog open onOpenChange={() => setShareOpen(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-emerald-500" />Share Survey
              </DialogTitle>
            </DialogHeader>
            {(() => {
              const fillUrl = `${window.location.origin}/s/${survey.short_code ?? survey.id}`;
              const embedCode = `<iframe src="${fillUrl}" width="100%" height="600" frameborder="0" style="border-radius:12px;border:1px solid #e2e8f0;"></iframe>`;
              const waMsg = encodeURIComponent(`Please fill out this survey: ${survey.title}\n${fillUrl}`);
              const waUrl = `https://wa.me/?text=${waMsg}`;
              return (
                <div className="space-y-5 py-1">
                  {/* QR Code */}
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">QR Code</p>
                    <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-sm">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(fillUrl)}&format=png&margin=4`}
                        alt="Survey QR Code"
                        width={200}
                        height={200}
                        className="rounded-lg"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">Scan to open the fill form</p>
                    <a
                      href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(fillUrl)}&format=png&margin=6`}
                      download={`qr-${survey.id}.png`}
                      className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />Download QR PNG
                    </a>
                  </div>

                  {/* Direct link */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Direct Link</p>
                    <div className="flex items-center gap-2">
                      <input readOnly value={fillUrl} className="flex-1 h-8 text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono" />
                      <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(fillUrl); toast({ title: 'Link copied!' }); }} className="gap-1.5 text-xs shrink-0">
                        <Copy className="w-3 h-3" />Copy
                      </Button>
                    </div>
                  </div>

                  {/* URL prefill example */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">URL Prefill</p>
                    <p className="text-[11px] text-slate-400">Pre-populate respondent name and email in the URL:</p>
                    <input readOnly value={`${fillUrl}?name=Ahmed&email=ahmed@example.com`} className="w-full h-8 text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono" />
                  </div>

                  {/* Embed widget */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5"><Code2 className="w-3 h-3" />Embed on Website</p>
                    <textarea readOnly value={embedCode} rows={3} className="w-full text-[11px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono resize-none" />
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(embedCode); toast({ title: 'Embed code copied!' }); }} className="gap-1.5 text-xs w-full">
                      <Copy className="w-3 h-3" />Copy Embed Code
                    </Button>
                  </div>

                  {/* WhatsApp */}
                  <a href={waUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors">
                    <MessageCircleMore className="w-4 h-4" />Share on WhatsApp
                  </a>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      )}

      {/* ── AI Generate Questions Dialog ─────────────────────────────────── */}
      {aiOpen && (
        <Dialog open onOpenChange={() => { setAiOpen(false); setAiSuggestions([]); setAiFile(null); setAiFileAr(null); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />AI Question Generator
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              {aiSuggestions.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">Describe your topic below, or upload an ODK XLSForm / Word document for context — then let AI generate questions.</p>
                  {/* Mode banner */}
                  {(aiFile || aiFileAr) ? (
                    <div className="flex items-start gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2.5">
                      <FileSpreadsheet className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-indigo-800">File mode — all questions will be extracted</p>
                        <p className="text-[11px] text-indigo-500 mt-0.5">Every question found in the uploaded file(s) will be converted. The "Number of questions" field is ignored.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                      <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-slate-500">Topic mode — describe your survey topic and choose how many questions to generate. Or upload a file above to extract questions from it instead.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-xs">Topic / Purpose <span className="text-slate-400 font-normal">{(aiFile || aiFileAr) ? '(optional extra context for the AI)' : '(required — describe your survey)'}</span></Label>
                    <Textarea
                      value={aiTopic}
                      onChange={e => setAiTopic(e.target.value)}
                      placeholder="e.g. Water & sanitation assessment for households in rural areas"
                      rows={3}
                      data-testid="input-ai-topic"
                    />
                  </div>
                  {/* Reference files — English + Arabic */}
                  <div className="space-y-2">
                    <Label className="text-xs">Reference Files <span className="text-slate-400 font-normal">(optional — ODK XLSForm .xlsx or Word .docx)</span></Label>

                    {/* English file */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">English File</p>
                      {aiFile ? (
                        <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                          <FileSpreadsheet className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span className="text-xs text-indigo-700 truncate flex-1">{aiFile.name}</span>
                          <button onClick={() => setAiFile(null)} className="text-slate-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 hover:border-violet-400 bg-white hover:bg-violet-50 px-3 py-2.5 text-xs text-slate-500 hover:text-violet-600 cursor-pointer transition-all" data-testid="label-ai-file-upload">
                          <Upload className="w-3.5 h-3.5 shrink-0" />
                          <span>Upload English XLSForm / Word doc…</span>
                          <input type="file" accept=".xlsx,.xls,.docx,.doc" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setAiFile(f); e.target.value = ''; }} data-testid="input-ai-file" />
                        </label>
                      )}
                    </div>

                    {/* Arabic file */}
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Arabic File <span className="font-normal normal-case">(عربي)</span></p>
                      {aiFileAr ? (
                        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                          <FileSpreadsheet className="w-4 h-4 text-amber-500 shrink-0" />
                          <span className="text-xs text-amber-700 truncate flex-1">{aiFileAr.name}</span>
                          <button onClick={() => setAiFileAr(null)} className="text-slate-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 hover:border-amber-400 bg-white hover:bg-amber-50 px-3 py-2.5 text-xs text-slate-500 hover:text-amber-600 cursor-pointer transition-all" data-testid="label-ai-file-ar-upload">
                          <Upload className="w-3.5 h-3.5 shrink-0" />
                          <span>Upload Arabic XLSForm / Word doc…</span>
                          <input type="file" accept=".xlsx,.xls,.docx,.doc" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setAiFileAr(f); e.target.value = ''; }} data-testid="input-ai-file-ar" />
                        </label>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">Files are read client-side and sent to the AI as context. Upload separate files for each language for best results.</p>
                  </div>

                  <div className={cn('grid gap-3', (aiFile || aiFileAr) ? 'grid-cols-1' : 'grid-cols-2')}>
                    {/* Number of questions — only shown in topic mode (no file) */}
                    {!(aiFile || aiFileAr) && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Number of questions</Label>
                        <Input
                          type="number"
                          min={1}
                          value={aiCount}
                          onChange={e => setAiCount(Math.max(1, parseInt(e.target.value) || 1))}
                          className="h-8 text-xs"
                          data-testid="input-ai-count"
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Language</Label>
                      <Select value={aiLang} onValueChange={v => setAiLang(v as 'en' | 'ar' | 'both')}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="ar">Arabic (عربي)</SelectItem>
                          <SelectItem value="both">Both (EN + AR)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Skip-existing toggle — only shown when the survey already has questions */}
                  {questions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAiSkipExisting(v => !v)}
                      className={cn(
                        'flex items-center gap-2.5 w-full px-3 py-2 rounded-xl border text-xs font-medium transition-colors text-left',
                        aiSkipExisting
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                      )}
                    >
                      <span className={cn('relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0', aiSkipExisting ? 'bg-emerald-500' : 'bg-slate-300')}>
                        <span className={cn('inline-block h-3 w-3 rounded-full bg-white shadow transition-transform', aiSkipExisting ? 'translate-x-3.5' : 'translate-x-0.5')} />
                      </span>
                      {aiSkipExisting
                        ? `Skip ${questions.length} questions already in this survey — only show new ones`
                        : `Show all questions (including ${questions.length} already in this survey)`}
                    </button>
                  )}

                  <Button
                    disabled={(!aiTopic.trim() && !aiFile && !aiFileAr) || aiGenerating}
                    onClick={async () => {
                      setAiGenerating(true);
                      setAiSuggestions([]);
                      setAiSelected(new Set());
                      setAiChunkStatus(null);
                      setAiSkippedCount(0);
                      try {
                        let fileContext = '';
                        let fileContextAr = '';
                        if (aiFile)   { try { fileContext   = await extractFileContext(aiFile);   } catch { /* ignore */ } }
                        if (aiFileAr) { try { fileContextAr = await extractFileContext(aiFileAr); } catch { /* ignore */ } }
                        const hasFile = !!(fileContext || fileContextAr);

                        // Pre-seed seen with existing survey questions when skip-existing is on
                        const seen = new Set<string>();
                        if (aiSkipExisting && questions.length > 0) {
                          for (const q of questions) {
                            const vn = String((q.settings as Record<string,unknown>)?.variable_name ?? '').toLowerCase().trim();
                            const lb = String(q.label ?? '').toLowerCase().trim();
                            if (vn) seen.add(vn);
                            if (lb) seen.add(lb);
                          }
                        }
                        let skippedTotal = 0;

                        if (hasFile) {
                          // Progressive chunked mode — one API call per chunk, results appear live
                          // Use large chunks (20k chars) so most Word docs fit in a single call,
                          // and compute totalChunks from whichever file is longer.
                          const CHUNK_EN = 20000;
                          const CHUNK_AR = 20000;
                          const chunksForEn = fileContext   ? Math.ceil(fileContext.length   / CHUNK_EN) : 0;
                          const chunksForAr = fileContextAr ? Math.ceil(fileContextAr.length / CHUNK_AR) : 0;
                          const totalChunks = Math.min(Math.max(1, chunksForEn, chunksForAr), 25);
                          const accumulated: AiQuestion[] = [];

                          for (let i = 0; i < totalChunks; i++) {
                            setAiChunkStatus({ current: i + 1, total: totalChunks, done: false });
                            const chunkEn = fileContext   ? fileContext.slice(i * CHUNK_EN, (i + 1) * CHUNK_EN)     : '';
                            const chunkAr = fileContextAr ? fileContextAr.slice(i * CHUNK_AR, (i + 1) * CHUNK_AR) : '';
                            if (!chunkEn && !chunkAr) break;
                            // Small pause between chunks to stay within Groq TPM limits
                            if (i > 0) await new Promise(r => setTimeout(r, 800));
                            try {
                              const res = await fetch('/api/generate-survey-questions', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ topic: aiTopic, count: aiCount, lang: aiLang, fileContext: chunkEn, fileContextAr: chunkAr }),
                              });
                              const data = await res.json();
                              if (!res.ok) { if (i === 0) throw new Error(data.error ?? 'AI generation failed'); break; }
                              const newQs: AiQuestion[] = [];
                              for (const q of (data.questions ?? [])) {
                                const key = String(q.variable_name || q.label || '').toLowerCase().trim();
                                if (key && !seen.has(key)) { seen.add(key); newQs.push(q); }
                                else if (key) skippedTotal++;
                              }
                              if (newQs.length > 0) {
                                accumulated.push(...newQs);
                                setAiSuggestions([...accumulated]);
                                setAiSkippedCount(skippedTotal);
                                setAiSelected(prev => {
                                  const n = new Set(prev);
                                  for (let j = accumulated.length - newQs.length; j < accumulated.length; j++) n.add(j);
                                  return n;
                                });
                              }
                            } catch (chunkErr: any) {
                              if (i === 0) throw chunkErr;
                              break;
                            }
                          }
                          setAiChunkStatus(prev => prev ? { ...prev, done: true } : null);
                          setAiSkippedCount(skippedTotal);
                          if (accumulated.length === 0) throw new Error('No questions could be extracted from the file');
                        } else {
                          // Topic mode — single call
                          const res = await fetch('/api/generate-survey-questions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ topic: aiTopic, count: aiCount, lang: aiLang, fileContext: '', fileContextAr: '' }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error ?? 'AI generation failed');
                          const allTopicQs: AiQuestion[] = data.questions ?? [];
                          const filteredTopicQs = allTopicQs.filter((q: AiQuestion) => {
                            const key = String(q.variable_name || q.label || '').toLowerCase().trim();
                            if (!key || seen.has(key)) { skippedTotal++; return false; }
                            seen.add(key); return true;
                          });
                          setAiSkippedCount(skippedTotal);
                          setAiSuggestions(filteredTopicQs);
                          setAiSelected(new Set(filteredTopicQs.map((_: AiQuestion, i: number) => i)));
                        }
                      } catch (e: any) {
                        toast({ title: 'AI generation failed', description: e.message, variant: 'destructive' });
                      } finally {
                        setAiGenerating(false);
                      }
                    }}
                    className="w-full gap-2 bg-violet-600 hover:bg-violet-700"
                    data-testid="btn-ai-generate-submit"
                  >
                    {aiGenerating ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4" />Generate Questions</>}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-700">{aiSuggestions.length} questions generated — select which to add:</p>
                      {aiSkippedCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                          <span>✓</span>{aiSkippedCount} already in survey, skipped
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setAiSelected(new Set(aiSuggestions.map((_, i) => i)))} className="text-[11px] text-indigo-600 hover:underline">All</button>
                      <button onClick={() => setAiSelected(new Set())} className="text-[11px] text-slate-400 hover:underline">None</button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {aiSuggestions.map((q, i) => {
                      const QIcon = ALL_Q_TYPES.find(t => t.type === q.type)?.icon ?? FileText;
                      const selected = aiSelected.has(i);
                      return (
                        <button key={i} onClick={() => setAiSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
                          className={cn('w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all', selected ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-300')}>
                          <div className={cn('w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5', selected ? 'border-violet-500 bg-violet-500' : 'border-slate-300')}>
                            {selected && <span className="text-white text-[10px] font-bold">✓</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <QIcon className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                              <span className="text-[10px] font-semibold text-violet-600 capitalize">{q.type.replace(/_/g,' ')}</span>
                              {q.variable_name && <code className="text-[10px] font-mono bg-slate-100 text-indigo-600 px-1.5 rounded-full">${q.variable_name}</code>}
                              {q.required && <span className="text-[10px] text-red-500 font-semibold">Required</span>}
                            </div>
                            <p className="text-sm text-slate-700 font-medium">{q.label}</p>
                            {q.label_ar && <p className="text-[11px] text-slate-400 mt-0.5" dir="rtl">{q.label_ar}</p>}
                            {q.options && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {q.options.slice(0, 4).map(o => <span key={o} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{o}</span>)}
                                {q.options.length > 4 && <span className="text-[10px] text-slate-400">+{q.options.length - 4} more</span>}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <Button
                      disabled={aiSelected.size === 0 || addQuestion.isPending}
                      onClick={async () => {
                        const toAdd = [...aiSelected].sort().map(i => aiSuggestions[i]);
                        for (const q of toAdd) {
                          await addQuestion.mutateAsync({
                            type: q.type as QuestionType,
                            groupId: null,
                            overrides: {
                              label: q.label,
                              label_ar: q.label_ar ?? null,
                              required: q.required,
                              options: q.options,
                              options_ar: q.options_ar ?? null,
                              settings: {
                                ...(q.settings ?? {}),
                                ...(q.variable_name ? { variable_name: q.variable_name } : {}),
                              },
                            },
                          });
                        }
                        setAiOpen(false);
                        setAiSuggestions([]);
                        setAiTopic('');
                        toast({ title: `Added ${toAdd.length} questions from AI` });
                      }}
                      className="gap-1.5 bg-violet-600 hover:bg-violet-700"
                    >
                      <Plus className="w-3.5 h-3.5" />Add {aiSelected.size} Question{aiSelected.size !== 1 ? 's' : ''}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setAiSuggestions([])}>← Back</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setAiOpen(false); setAiSuggestions([]); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add question type picker */}
      <Dialog open={addTypeOpen} onOpenChange={setAddTypeOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {addGroupLabel ? `Add to "${addGroupLabel}"` : 'Choose Question Type'}
            </DialogTitle>
          </DialogHeader>
          {addGroupLabel && (
            <p className="text-xs text-indigo-600 flex items-center gap-1 -mt-1">
              <Folder className="w-3 h-3" />Questions will be added inside this group
            </p>
          )}
          <div className="space-y-4 py-2">
            {Q_TYPE_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{group.label}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.types.map(qt => (
                    <button
                      key={qt.type}
                      onClick={() => addQuestion.mutate({ type: qt.type, groupId: addToGroupId })}
                      disabled={addQuestion.isPending}
                      data-testid={`btn-add-type-${qt.type}`}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm font-medium text-slate-700 transition-colors text-left"
                    >
                      <qt.icon className="w-4 h-4 text-indigo-500 shrink-0" />
                      {qt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── GroupPanel ────────────────────────────────────────────────────────────────
function GroupPanel({
  group, depth, collapsed, onToggleCollapse,
  allQuestions, canManage,
  isEditing, onEdit, onUpdate, onDelete, onMoveUp, onMoveDown,
  saving, deleting, onAddToGroup, children,
}: {
  group: Question; depth: number; collapsed: boolean; onToggleCollapse: () => void;
  allQuestions: Question[]; canManage: boolean;
  isEditing: boolean; onEdit: () => void;
  onUpdate: (p: Partial<Question>) => void;
  onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
  saving: boolean; deleting: boolean; onAddToGroup: () => void;
  children?: React.ReactNode;
}) {
  const [labelDraft, setLabelDraft]     = useState(group.label);
  const [labelArDraft, setLabelArDraft] = useState(group.label_ar ?? '');
  const [descDraft, setDescDraft]       = useState(group.description ?? '');
  const [descArDraft, setDescArDraft]   = useState(group.description_ar ?? '');
  const existingSkip = group.settings?.skip_logic as SkipLogic | undefined;
  const [skipEnabled, setSkipEnabled] = useState(!!existingSkip?.condition_question_id);
  const [skipQId, setSkipQId] = useState(existingSkip?.condition_question_id ?? '');
  const [skipOp, setSkipOp] = useState<SkipLogic['operator']>(existingSkip?.operator ?? 'equals');
  const [skipVal, setSkipVal] = useState(existingSkip?.value ?? '');

  const prevQuestions = allQuestions.filter(pq =>
    pq.order_index < group.order_index && !['section_header','begin_group'].includes(pq.type)
  );
  const grpSectionMap = new Map<string, string>();
  { let _s = ''; for (const aq of [...allQuestions].sort((a,b)=>a.order_index-b.order_index)) { if (aq.type==='section_header') _s=aq.label; else grpSectionMap.set(aq.id,_s); } }
  const grpQNumMap = new Map([...allQuestions].filter(aq=>!['section_header','begin_group','begin_repeat','grid_table','note'].includes(aq.type)).sort((a,b)=>a.order_index-b.order_index).map((aq,i)=>[aq.id,i+1]));
  const valueNeeded = !['answered','not_answered'].includes(skipOp);
  const hasSkip = !!existingSkip?.condition_question_id;

  const siblings = allQuestions
    .filter(x => (x.group_id ?? null) === (group.group_id ?? null) && x.type === 'begin_group')
    .sort((a, b) => a.order_index - b.order_index);
  const sibIdx = siblings.findIndex(x => x.id === group.id);

  const indentColors = [
    'border-indigo-200 bg-indigo-50/20',
    'border-violet-200 bg-violet-50/20',
    'border-sky-200 bg-sky-50/20',
  ];
  const headerColors = [
    'bg-indigo-50 border-b border-indigo-100',
    'bg-violet-50 border-b border-violet-100',
    'bg-sky-50 border-b border-sky-100',
  ];
  const textColors = ['text-indigo-700', 'text-violet-700', 'text-sky-700'];
  const colorIdx = depth % 3;

  const save = () => {
    const skipLogic: SkipLogic | undefined = skipEnabled && skipQId
      ? { condition_question_id: skipQId, operator: skipOp, value: valueNeeded ? skipVal : undefined }
      : undefined;
    onUpdate({
      label: labelDraft.trim() || group.label,
      label_ar: labelArDraft.trim() || null,
      description: descDraft.trim() || null,
      description_ar: descArDraft.trim() || null,
      settings: { ...group.settings, skip_logic: skipLogic },
    });
    onEdit();
  };

  return (
    <div className={cn('rounded-xl border-2 overflow-hidden', indentColors[colorIdx])}>
      {/* Group header bar */}
      <div className={cn('flex items-center gap-2 px-3 py-2', headerColors[colorIdx])}>
        <button
          onClick={onToggleCollapse}
          className={cn('p-0.5 rounded text-slate-500 hover:bg-white/60 transition-colors shrink-0')}
          title={collapsed ? 'Expand group' : 'Collapse group'}
        >
          <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', !collapsed && 'rotate-90')} />
        </button>
        {collapsed ? (
          <Folder className={cn('w-4 h-4 shrink-0', textColors[colorIdx])} />
        ) : (
          <FolderOpen className={cn('w-4 h-4 shrink-0', textColors[colorIdx])} />
        )}
        <div className="flex-1 min-w-0">
          <span className={cn('text-sm font-semibold truncate', textColors[colorIdx])}>{group.label}</span>
          {group.description && <span className="text-xs text-slate-400 ml-2 truncate">{group.description}</span>}
          {hasSkip && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1 rounded border border-amber-200">
              <GitBranch className="w-2 h-2" />conditional
            </span>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={onMoveUp} disabled={sibIdx === 0} className="p-1 rounded hover:bg-white/60 text-slate-400 disabled:opacity-30" title="Move up"><ChevronUp className="w-3 h-3" /></button>
            <button onClick={onMoveDown} disabled={sibIdx === siblings.length - 1} className="p-1 rounded hover:bg-white/60 text-slate-400 disabled:opacity-30" title="Move down"><ChevronDown className="w-3 h-3" /></button>
            <button onClick={onEdit} className={cn('p-1 rounded text-slate-400', isEditing ? 'bg-white/80 text-indigo-600' : 'hover:bg-white/60')} title="Edit group"><Edit3 className="w-3 h-3" /></button>
            <button onClick={onDelete} disabled={deleting} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500" title="Delete group"><Trash2 className="w-3 h-3" /></button>
          </div>
        )}
      </div>

      {/* Edit panel */}
      {isEditing && (
        <div className="border-b border-indigo-100 p-4 space-y-3 bg-white/80">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Group name <span className="text-slate-400 font-normal">(English)</span></Label>
              <Input value={labelDraft} onChange={e => setLabelDraft(e.target.value)} placeholder="Group label…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">اسم المجموعة <span className="text-slate-400 font-normal">(Arabic)</span></Label>
              <Input dir="rtl" lang="ar" value={labelArDraft} onChange={e => setLabelArDraft(e.target.value)} placeholder="اسم المجموعة بالعربية…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description <span className="text-slate-400 font-normal">(English, optional)</span></Label>
              <Input value={descDraft} onChange={e => setDescDraft(e.target.value)} placeholder="Shown to respondents above the group…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الوصف <span className="text-slate-400 font-normal">(Arabic, optional)</span></Label>
              <Input dir="rtl" lang="ar" value={descArDraft} onChange={e => setDescArDraft(e.target.value)} placeholder="الوصف بالعربية…" />
            </div>
          </div>
          {/* Skip logic for the group */}
          <div className="border border-amber-200 rounded-xl p-3 space-y-3 bg-amber-50/40">
            <div className="flex items-center gap-2">
              <input type="checkbox" id={`gskip-${group.id}`} checked={skipEnabled} onChange={e => setSkipEnabled(e.target.checked)} className="rounded" />
              <Label htmlFor={`gskip-${group.id}`} className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                <GitBranch className="w-3 h-3" />Show this group only if…
              </Label>
            </div>
            {skipEnabled && (
              <div className="space-y-2 pl-5">
                {prevQuestions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No previous questions available for conditions.</p>
                ) : (
                  <>
                    <Select value={skipQId} onValueChange={setSkipQId}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select a question…" /></SelectTrigger>
                      <SelectContent>
                        {prevQuestions.map(pq => (
                          <SelectItem key={pq.id} value={pq.id} className="text-xs py-1.5">
                            <div className="flex flex-col gap-0.5 leading-tight">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] font-bold text-indigo-400 shrink-0">#{grpQNumMap.get(pq.id) ?? '?'}</span>
                                <span className="text-slate-700">{pq.label}</span>
                              </div>
                              {grpSectionMap.get(pq.id) && (
                                <span className="text-[10px] text-slate-400 pl-5">{grpSectionMap.get(pq.id)}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={skipOp} onValueChange={v => setSkipOp(v as SkipLogic['operator'])}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SKIP_OPERATORS.map(op => <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {valueNeeded && (
                      <Input value={skipVal} onChange={e => setSkipVal(e.target.value)} placeholder="Expected answer…" className="h-7 text-xs" />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Children slot */}
      {!collapsed && (
        <div className="p-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ── QuestionCard ─────────────────────────────────────────────────────────────
const SKIP_OPERATORS: { value: SkipLogic['operator']; label: string }[] = [
  { value: 'equals',       label: 'equals' },
  { value: 'not_equals',   label: 'does not equal' },
  { value: 'contains',     label: 'contains' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_than',    label: 'is less than' },
  { value: 'answered',     label: 'has any answer' },
  { value: 'not_answered', label: 'has no answer' },
];

function QuestionCard({
  q, idx, total, allQuestions, canManage, isEditing, onEdit, onUpdate, onDelete, onDuplicate, onMoveUp, onMoveDown, saving, deleting,
  isDraggedOver, onDragStart, onDragOver, onDragLeave, onDrop, isBulkSelected, onBulkToggle, onSaveToLibrary,
  isCollapsed, onToggleCollapse, questionCount, sectionHeaders, onMoveToSection,
}: {
  q: Question; idx: number; total: number; allQuestions: Question[]; canManage: boolean;
  isEditing: boolean; onEdit: () => void;
  onUpdate: (p: Partial<Question>) => void;
  onDelete: () => void; onDuplicate: () => void; onMoveUp: () => void; onMoveDown: () => void;
  saving: boolean; deleting: boolean;
  isDraggedOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  isBulkSelected?: boolean;
  onBulkToggle?: (v: boolean) => void;
  onSaveToLibrary?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  questionCount?: number;
  sectionHeaders?: Question[];
  onMoveToSection?: (sectionId: string) => Promise<void>;
}) {
  const [typeDraft, setTypeDraft]       = useState<QuestionType>(q.type);
  const [labelDraft, setLabelDraft]     = useState(q.label);
  const [labelArDraft, setLabelArDraft] = useState(q.label_ar ?? '');
  const [descDraft, setDescDraft]       = useState(q.description ?? '');
  const [descArDraft, setDescArDraft]   = useState(q.description_ar ?? '');
  const [reqDraft, setReqDraft]         = useState(q.required);
  const [optsDraft, setOptsDraft]       = useState<string[]>(q.options ?? []);
  const [optsArDraft, setOptsArDraft]   = useState<string[]>(q.options_ar ?? []);
  const [newOpt, setNewOpt]             = useState('');
  const [scaleMin, setScaleMin] = useState(Number(q.settings?.min ?? 1));
  const [scaleMax, setScaleMax] = useState(Number(q.settings?.max ?? 10));
  const [gpsAccThreshold, setGpsAccThreshold] = useState(Number(q.settings?.accuracy_threshold ?? 10));
  const [gpsCaptureAlt, setGpsCaptureAlt]     = useState(q.settings?.capture_altitude !== false);
  const [gpsAllowManual, setGpsAllowManual]   = useState(q.settings?.allow_manual !== false);

  type GridCol = { id: string; label: string; label_ar?: string; type: 'text' | 'number' | 'date' | 'dropdown'; options?: string[] };
  const [gridCols, setGridCols] = useState<GridCol[]>(
    (q.settings?.grid_columns as GridCol[] | undefined) ??
    [{ id: 'col_1', label: 'Column 1', type: 'text' }]
  );
  const [gridMinRows, setGridMinRows] = useState(Number(q.settings?.min_rows ?? 1));
  const [gridMaxRows, setGridMaxRows] = useState(Number(q.settings?.max_rows ?? 10));
  const [newColLabel, setNewColLabel] = useState('');
  const [newColLabelAr, setNewColLabelAr] = useState('');

  const existingSkip = q.settings?.skip_logic as SkipLogic | undefined;
  const [varNameDraft, setVarNameDraft] = useState<string>(String(q.settings?.variable_name ?? ''));
  const [formulaDraft, setFormulaDraft] = useState<string>(String(q.settings?.formula ?? ''));

  // Multi-condition skip logic
  const initSkipConds: SkipCondition[] = (() => {
    if (existingSkip?.conditions) return existingSkip.conditions;
    if (existingSkip?.condition_question_id) return [{ question_id: existingSkip.condition_question_id, operator: existingSkip.operator ?? 'equals', value: existingSkip.value }];
    return [];
  })();
  const [skipEnabled, setSkipEnabled] = useState(initSkipConds.length > 0);
  const [skipLogicMode, setSkipLogicMode] = useState<'AND' | 'OR'>(existingSkip?.logic ?? 'AND');
  const [skipConditions, setSkipConditions] = useState<SkipCondition[]>(initSkipConds.length > 0 ? initSkipConds : [{ question_id: '', operator: 'equals', value: '' }]);

  // Validation settings (text / textarea / number / integer)
  const [minLength, setMinLength] = useState<string>(String(q.settings?.min_length ?? ''));
  const [maxLength, setMaxLength] = useState<string>(String(q.settings?.max_length ?? ''));
  const [pattern, setPattern]     = useState<string>(String(q.settings?.pattern ?? ''));

  // Likert settings
  const [likertRows, setLikertRows] = useState<string[]>((q.settings?.likert_rows as string[] | undefined) ?? ['Row 1', 'Row 2', 'Row 3']);
  const [likertCols, setLikertCols] = useState<string[]>((q.settings?.likert_cols as string[] | undefined) ?? ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree']);
  const [newLikertRow, setNewLikertRow] = useState('');
  const [newLikertCol, setNewLikertCol] = useState('');

  // Conditional options — option visible only when a prior question equals a value
  type CondOptRule = { option: string; depends_on: string; depends_value: string };
  const [condOptRules, setCondOptRules] = useState<CondOptRule[]>((q.settings?.conditional_options as CondOptRule[] | undefined) ?? []);

  const QIcon = ALL_Q_TYPES.find(t => t.type === typeDraft)?.icon ?? FileText;
  const hasOptions = ['radio','checkbox','dropdown'].includes(typeDraft);
  const isYesNo = typeDraft === 'yesno';
  const isSection = typeDraft === 'section_header';
  const isNote = typeDraft === 'note';
  const hasValidation = ['text','textarea','number','integer','phone','email','barcode'].includes(typeDraft);

  const prevQuestions = allQuestions.filter((pq) => pq.order_index < q.order_index && !['section_header','begin_group'].includes(pq.type));
  const skipSectionMap = new Map<string, string>();
  { let _s = ''; for (const aq of [...allQuestions].sort((a,b)=>a.order_index-b.order_index)) { if (aq.type==='section_header') _s=aq.label; else skipSectionMap.set(aq.id,_s); } }
  const skipQNumMap = new Map([...allQuestions].filter(aq=>!['section_header','begin_group','begin_repeat','grid_table','note'].includes(aq.type)).sort((a,b)=>a.order_index-b.order_index).map((aq,i)=>[aq.id,i+1]));

  const addSkipCond = () => setSkipConditions(prev => [...prev, { question_id: '', operator: 'equals', value: '' }]);
  const removeSkipCond = (i: number) => setSkipConditions(prev => prev.filter((_, j) => j !== i));
  const updateSkipCond = (i: number, patch: Partial<SkipCondition>) => setSkipConditions(prev => prev.map((c, j) => j === i ? { ...c, ...patch } : c));

  const save = () => {
    const validConds = skipConditions.filter(c => c.question_id);
    const skipLogic: SkipLogic | undefined = skipEnabled && validConds.length > 0
      ? { logic: skipLogicMode, conditions: validConds }
      : undefined;
    const scaleSettings = q.type === 'scale'      ? { min: scaleMin, max: scaleMax } : {};
    const gpsSettings   = q.type === 'gps'        ? { accuracy_threshold: gpsAccThreshold, capture_altitude: gpsCaptureAlt, allow_manual: gpsAllowManual } : {};
    const calcSettings  = q.type === 'calculate'  ? { formula: formulaDraft.trim() } : {};
    const gridSettings  = q.type === 'grid_table' ? { grid_columns: gridCols, min_rows: gridMinRows, max_rows: gridMaxRows } : {};
    const likertSettings = q.type === 'likert'    ? { likert_rows: likertRows, likert_cols: likertCols } : {};
    const validationSettings = hasValidation ? {
      ...(minLength.trim() ? { min_length: Number(minLength) } : {}),
      ...(maxLength.trim() ? { max_length: Number(maxLength) } : {}),
      ...(pattern.trim()   ? { pattern } : {}),
    } : {};
    const condOptSettings = hasOptions && condOptRules.length > 0 ? { conditional_options: condOptRules } : {};
    const paddedOptsAr = hasOptions
      ? optsDraft.map((_, i) => optsArDraft[i] ?? '')
      : null;
    onUpdate({
      type: typeDraft,
      options: isYesNo ? ['Yes', 'No'] : (hasOptions ? optsDraft.filter(Boolean) : null),
      label: labelDraft.trim() || q.label,
      label_ar: labelArDraft.trim() || null,
      description: descDraft.trim() || null,
      description_ar: descArDraft.trim() || null,
      required: reqDraft,
      options_ar: isYesNo ? null : paddedOptsAr,
      settings: {
        ...q.settings, ...scaleSettings, ...gpsSettings, ...calcSettings, ...gridSettings, ...likertSettings, ...validationSettings, ...condOptSettings,
        skip_logic: skipLogic,
        ...(varNameDraft.trim() ? { variable_name: varNameDraft.trim() } : {}),
      },
    });
    onEdit();
  };

  if (isSection) {
    return (
      <div
        className={cn('bg-slate-100 transition-colors', isDraggedOver ? 'ring-2 ring-inset ring-indigo-400 bg-indigo-50/20' : '')}
        draggable
        onDragStart={onDragStart}
        onDragOver={e => { e.preventDefault(); onDragOver?.(); }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="flex items-center gap-2 py-2.5 px-3">
          <GripVertical className="w-4 h-4 text-slate-400 shrink-0 cursor-grab" />
          <input
            type="checkbox"
            checked={!!isBulkSelected}
            onChange={e => onBulkToggle?.(e.target.checked)}
            className="rounded shrink-0 accent-indigo-600"
            title="Select for bulk actions"
          />
          {/* Collapse toggle */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-0.5 rounded hover:bg-slate-200 text-slate-500 shrink-0"
              title={isCollapsed ? 'Expand section' : 'Collapse section'}
            >
              {isCollapsed
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-700 uppercase tracking-wide truncate">{q.label}</p>
              {typeof questionCount === 'number' && (
                <span className="text-[10px] font-medium text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full shrink-0">
                  {questionCount} Q
                </span>
              )}
            </div>
            {q.label_ar && <p className="text-[11px] text-slate-500 truncate" dir="rtl">{q.label_ar}</p>}
          </div>
          {canManage && (
            <div className="flex items-center gap-0.5 ml-auto">
              <button onClick={() => onMoveUp()} className="p-1 rounded hover:bg-slate-200 text-slate-400" title="Move section up"><ChevronUp className="w-3 h-3" /></button>
              <button onClick={() => onMoveDown()} className="p-1 rounded hover:bg-slate-200 text-slate-400" title="Move section down"><ChevronDown className="w-3 h-3" /></button>
              <button onClick={onDuplicate} className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-indigo-600" title="Duplicate entire section"><Copy className="w-3 h-3" /></button>
              <button onClick={onEdit} className="p-1 rounded hover:bg-slate-200 text-slate-400" title="Edit section"><Edit3 className="w-3 h-3" /></button>
              <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500" title="Delete section"><Trash2 className="w-3 h-3" /></button>
            </div>
          )}
        </div>
        {isEditing && canManage && (
          <div className="border-t border-slate-200 p-4 bg-white space-y-3 rounded-b-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Section Title (English)</Label>
                <Input value={labelDraft} onChange={e => setLabelDraft(e.target.value)} placeholder="Section heading…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">عنوان القسم (Arabic)</Label>
                <Input dir="rtl" lang="ar" value={labelArDraft} onChange={e => setLabelArDraft(e.target.value)} placeholder="عنوان القسم بالعربية…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description (English, optional)</Label>
                <Textarea value={descDraft} onChange={e => setDescDraft(e.target.value)} rows={2} placeholder="Optional subtitle or instructions…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الوصف (Arabic — اختياري)</Label>
                <Textarea dir="rtl" lang="ar" value={descArDraft} onChange={e => setDescArDraft(e.target.value)} rows={2} placeholder="وصف القسم بالعربية…" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 px-3 text-xs">Cancel</Button>
              <Button size="sm" onClick={save} className="h-7 px-3 text-xs">Save</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Note / Text Block card ───────────────────────────────────────────────────
  if (isNote) {
    return (
      <div
        className={cn('bg-sky-50 rounded-xl border border-sky-200 transition-colors', isDraggedOver && 'border-indigo-400 bg-indigo-50/10')}
        draggable
        onDragStart={onDragStart}
        onDragOver={e => { e.preventDefault(); onDragOver?.(); }}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="flex items-center gap-2 px-4 py-2.5">
          <GripVertical className="w-3.5 h-3.5 text-sky-300 shrink-0 cursor-grab" />
          <input
            type="checkbox"
            checked={!!isBulkSelected}
            onChange={e => onBulkToggle?.(e.target.checked)}
            className="rounded shrink-0 accent-indigo-600"
            title="Select for bulk actions"
          />
          <div className="w-6 h-6 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
            <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sky-800 truncate">{q.label}</p>
            {q.description && <p className="text-[10px] text-sky-500 italic truncate">{q.description}</p>}
          </div>
          <span className="text-[10px] text-sky-500 bg-sky-100 px-1.5 py-0.5 rounded-full shrink-0 font-medium">Note</span>
          {canManage && (
            <div className="flex items-center gap-0.5 ml-1">
              {isEditing
                ? <Button size="sm" onClick={save} className="h-6 px-2 text-xs">Save</Button>
                : <button onClick={onEdit} className="p-1 rounded hover:bg-sky-100 text-sky-400 hover:text-sky-600"><Edit3 className="w-3 h-3" /></button>
              }
              <button onClick={onDuplicate} className="p-1 rounded hover:bg-sky-100 text-sky-400 hover:text-sky-600" title="Duplicate"><Copy className="w-3 h-3" /></button>
              <button onClick={onDelete} disabled={deleting} className="p-1 rounded hover:bg-red-50 text-sky-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
            </div>
          )}
        </div>
        {isEditing && (
          <div className="border-t border-sky-200 p-4 bg-white space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Heading (English)</Label>
                <Input value={labelDraft} onChange={e => setLabelDraft(e.target.value)} placeholder="Note heading…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">العنوان (Arabic)</Label>
                <Input dir="rtl" lang="ar" value={labelArDraft} onChange={e => setLabelArDraft(e.target.value)} placeholder="العنوان بالعربية…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Body text (English, optional)</Label>
                <Textarea value={descDraft} onChange={e => setDescDraft(e.target.value)} rows={3} placeholder="Explanatory text shown below the heading…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">النص التفصيلي (Arabic — اختياري)</Label>
                <Textarea dir="rtl" lang="ar" value={descArDraft} onChange={e => setDescArDraft(e.target.value)} rows={3} placeholder="النص بالعربية…" />
              </div>
            </div>
            <p className="text-[10px] text-slate-400">Notes are display-only — respondents read them but do not answer them.</p>
          </div>
        )}
      </div>
    );
  }

  const existingSl = q.settings?.skip_logic as SkipLogic | undefined;
  const hasSkip = !!(existingSl?.condition_question_id || (existingSl?.conditions && existingSl.conditions.length > 0));

  return (
    <div
      className={cn('bg-white rounded-xl border transition-colors', isEditing ? 'border-indigo-300' : 'border-slate-200', isDraggedOver && 'border-indigo-400 bg-indigo-50/10')}
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver?.(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Question header */}
      <div className="flex items-center gap-3 p-3">
        <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0 cursor-grab" />
        <input
          type="checkbox"
          checked={!!isBulkSelected}
          onChange={e => onBulkToggle?.(e.target.checked)}
          className="rounded shrink-0 accent-indigo-600"
          title="Select for bulk actions"
        />
        <span className="text-[11px] font-mono text-slate-400 w-5 text-center shrink-0">{idx + 1}</span>
        <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
          <QIcon className="w-3.5 h-3.5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 leading-snug">{q.label}</p>
          {q.label_ar && (
            <p className="text-[12px] text-slate-500 leading-snug mt-0.5" dir="rtl">{q.label_ar}</p>
          )}
          {(q.description || q.description_ar) && (
            <p className="text-[10px] text-slate-400 italic truncate mt-0.5 leading-relaxed">
              {q.description}{q.description && q.description_ar ? '  ·  ' : ''}{q.description_ar ?? ''}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[10px] text-slate-400 capitalize">{q.type.replace(/_/g, ' ')}</p>
            {q.settings?.variable_name && (
              <code className="text-[10px] font-mono bg-slate-100 text-indigo-600 px-1.5 py-0.5 rounded-full">${String(q.settings.variable_name)}</code>
            )}
            {hasSkip && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
                <GitBranch className="w-2.5 h-2.5" />Conditional
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-1">
            {/* Required / Optional quick-toggle pill */}
            <button
              onClick={() => { setReqDraft(!reqDraft); onUpdate({ required: !q.required }); }}
              title={q.required ? 'Click to make optional' : 'Click to make required'}
              data-testid={`btn-required-toggle-${q.id}`}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors shrink-0',
                q.required
                  ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                  : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600'
              )}
            >
              <span className="text-[11px] leading-none">{q.required ? '✱' : '○'}</span>
              {q.required ? 'Required' : 'Optional'}
            </button>
            <div className="flex items-center gap-0.5">
              <button onClick={onMoveUp} disabled={idx === 0} className="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-30" title="Move up"><ChevronUp className="w-3.5 h-3.5" /></button>
              <button onClick={onMoveDown} disabled={idx === total - 1} className="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-30" title="Move down"><ChevronDown className="w-3.5 h-3.5" /></button>
              <button onClick={onDuplicate} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600" title="Duplicate question"><Copy className="w-3.5 h-3.5" /></button>
              {sectionHeaders && sectionHeaders.length > 0 && (
                <select
                  onChange={async e => {
                    const val = e.currentTarget.value;
                    if (!val) return;
                    e.currentTarget.value = '';
                    await onMoveToSection?.(val);
                  }}
                  className="text-[9px] border border-slate-200 rounded text-slate-400 hover:border-indigo-300 hover:text-indigo-600 cursor-pointer bg-white h-[20px] w-[20px] px-0 appearance-none text-center"
                  title="Move to section"
                  defaultValue=""
                  style={{ backgroundImage: 'none' }}
                >
                  <option value="" disabled>⇒</option>
                  <option value="top">No section (top)</option>
                  {sectionHeaders.map(s => (
                    <option key={s.id} value={s.id}>{s.label.length > 22 ? s.label.slice(0, 20) + '…' : s.label}</option>
                  ))}
                </select>
              )}
              <button onClick={() => onSaveToLibrary?.()} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-violet-600" title="Save to library"><BookOpen className="w-3.5 h-3.5" /></button>
              <button onClick={onEdit} className={cn('p-1 rounded text-slate-400', isEditing ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-100')} title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
              <button onClick={onDelete} disabled={deleting} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
        {/* Read-only required indicator for non-managers */}
        {!canManage && q.required && (
          <span className="text-[10px] font-semibold text-red-500 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 shrink-0">Required</span>
        )}
      </div>

      {/* Edit panel */}
      {isEditing && (
        <div className="border-t border-indigo-100 p-4 space-y-4 bg-indigo-50/30">
          <div className="space-y-3">
            {/* Question type selector */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1.5">
                <QIcon className="w-3 h-3 text-slate-400" />
                Question Type
              </Label>
              <Select value={typeDraft} onValueChange={v => setTypeDraft(v as QuestionType)}>
                <SelectTrigger className="h-8 text-xs w-full sm:w-64" data-testid={`select-qtype-${q.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Q_TYPE_GROUPS.filter(g => g.label !== 'Layout & Structure').map(g => (
                    <div key={g.label}>
                      <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{g.label}</div>
                      {g.types.map(t => {
                        const TIcon = t.icon;
                        return (
                          <SelectItem key={t.type} value={t.type} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              <TIcon className="w-3 h-3 text-slate-500" />
                              {t.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Question text <span className="text-slate-400 font-normal">(English)</span></Label>
                <Input value={labelDraft} onChange={e => setLabelDraft(e.target.value)} data-testid={`input-label-${q.id}`} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نص السؤال <span className="text-slate-400 font-normal">(Arabic)</span></Label>
                <Input dir="rtl" lang="ar" value={labelArDraft} onChange={e => setLabelArDraft(e.target.value)} placeholder="نص السؤال بالعربية…" data-testid={`input-label-ar-${q.id}`} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hint <span className="text-slate-400 font-normal">(English, optional)</span></Label>
                <Input value={descDraft} onChange={e => setDescDraft(e.target.value)} placeholder="Guidance shown in italic below the question…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">تلميح <span className="text-slate-400 font-normal">(Arabic — اختياري)</span></Label>
                <Input dir="rtl" lang="ar" value={descArDraft} onChange={e => setDescArDraft(e.target.value)} placeholder="تلميح يظهر أسفل السؤال بالعربية…" />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReqDraft(r => !r)}
              className={cn(
                'flex items-center gap-2.5 w-fit px-3 py-2 rounded-xl border text-xs font-medium transition-colors',
                reqDraft
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
              )}
              data-testid={`btn-required-draft-${q.id}`}
            >
              {/* Toggle track */}
              <span className={cn('relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0', reqDraft ? 'bg-red-500' : 'bg-slate-300')}>
                <span className={cn('inline-block h-3 w-3 rounded-full bg-white shadow transition-transform', reqDraft ? 'translate-x-3.5' : 'translate-x-0.5')} />
              </span>
              {reqDraft ? 'Required — respondent must answer this question' : 'Optional — respondent may skip this question'}
            </button>

            {/* ODK / XLSForm variable name */}
            <div className="space-y-1 pt-1">
              <Label className="text-xs flex items-center gap-1.5">
                <Code2 className="w-3 h-3 text-slate-400" />
                ODK Variable Name
                <span className="text-slate-400 font-normal">(e.g. respondent_age, has_electricity)</span>
              </Label>
              <Input
                value={varNameDraft}
                onChange={e => setVarNameDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+/, '').replace(/_+$/, ''))}
                placeholder="snake_case_name"
                className="font-mono text-xs h-8"
                data-testid={`input-varname-${q.id}`}
              />
              <p className="text-[10px] text-slate-400">Used in exports, skip logic, and ODK/XLSForm compatibility. Letters, numbers, underscores only.</p>
            </div>
          </div>

          {isYesNo && (
            <div className="space-y-1.5">
              <Label className="text-xs">Answer options</Label>
              <div className="flex gap-2">
                {['Yes', 'No'].map(opt => (
                  <div key={opt} className={cn(
                    'flex-1 text-center py-2 rounded-xl border-2 text-sm font-semibold',
                    opt === 'Yes' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600',
                  )}>{opt}</div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">Yes / No options are fixed and cannot be customised.</p>
            </div>
          )}

          {hasOptions && (
            <div className="space-y-1.5">
              <Label className="text-xs">Answer options</Label>
              {optsDraft.map((opt, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={opt}
                    onChange={e => { const next = [...optsDraft]; next[i] = e.target.value; setOptsDraft(next); }}
                    className="h-7 text-sm flex-1"
                    placeholder={`Option ${i + 1} (English)`}
                  />
                  <Input
                    dir="rtl" lang="ar"
                    value={optsArDraft[i] ?? ''}
                    onChange={e => { const next = [...optsArDraft]; next[i] = e.target.value; setOptsArDraft(next); }}
                    className="h-7 text-sm flex-1"
                    placeholder={`الخيار ${i + 1} (عربي)`}
                  />
                  <button onClick={() => { setOptsDraft(optsDraft.filter((_, j) => j !== i)); setOptsArDraft(optsArDraft.filter((_, j) => j !== i)); }} className="p-1 text-slate-400 hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <Input value={newOpt} onChange={e => setNewOpt(e.target.value)} placeholder="Add option (English)…" className="h-7 text-sm flex-1"
                  onKeyDown={e => { if (e.key === 'Enter' && newOpt.trim()) { setOptsDraft([...optsDraft, newOpt.trim()]); setOptsArDraft([...optsArDraft, '']); setNewOpt(''); } }} />
                <button
                  onClick={() => { if (newOpt.trim()) { setOptsDraft([...optsDraft, newOpt.trim()]); setOptsArDraft([...optsArDraft, '']); setNewOpt(''); } }}
                  className="p-1 text-indigo-600 hover:bg-indigo-100 rounded"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {q.type === 'scale' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Scale range</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Min</Label>
                  <Input type="number" value={scaleMin} onChange={e => setScaleMin(Number(e.target.value))} className="h-7 text-sm" min={0} max={scaleMax - 1} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Max</Label>
                  <Input type="number" value={scaleMax} onChange={e => setScaleMax(Number(e.target.value))} className="h-7 text-sm" min={scaleMin + 1} max={20} />
                </div>
              </div>
            </div>
          )}

          {q.type === 'gps' && (
            <div className="border border-emerald-200 rounded-xl p-3 space-y-3 bg-emerald-50/40">
              <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />GPS Settings
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Accuracy threshold (m)</Label>
                  <Input
                    type="number"
                    value={gpsAccThreshold}
                    onChange={e => setGpsAccThreshold(Math.max(1, Number(e.target.value)))}
                    className="h-7 text-sm"
                    min={1} max={500}
                    title="Minimum GPS accuracy required before showing 'Ready to capture'"
                  />
                  <p className="text-[10px] text-slate-400">Signal must be ≤ this value</p>
                </div>
                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gpsCaptureAlt}
                      onChange={e => setGpsCaptureAlt(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs font-medium text-slate-700">Capture altitude</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gpsAllowManual}
                      onChange={e => setGpsAllowManual(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-xs font-medium text-slate-700">Allow manual entry</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {q.type === 'calculate' && (
            <div className="border border-indigo-200 rounded-xl p-3 space-y-3 bg-indigo-50/40">
              <p className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
                <FunctionSquare className="w-3.5 h-3.5" />Formula
              </p>
              <div className="space-y-1">
                <Textarea
                  value={formulaDraft}
                  onChange={e => setFormulaDraft(e.target.value)}
                  rows={2}
                  placeholder="e.g.  ${age} * 2   or   ${score_a} + ${score_b}"
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-indigo-600 leading-relaxed">
                  Reference other fields by their ODK variable name: <code className="bg-indigo-100 px-1 rounded">${'{'}variable_name{'}'}</code>.
                  Supports +, −, *, / and standard math expressions.
                  The result is shown read-only to the respondent and stored with their submission.
                </p>
                {/* Live preview of referenced variables */}
                {formulaDraft.trim() && (() => {
                  const refs = [...formulaDraft.matchAll(/\$\{([^}]+)\}/g)].map(m => m[1]);
                  if (!refs.length) return null;
                  return (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      <span className="text-[10px] text-indigo-400 self-center">References:</span>
                      {refs.map((r, i) => {
                        const found = questions.find(pq => String(pq.settings?.variable_name ?? '') === r);
                        return (
                          <span
                            key={i}
                            className={cn(
                              'text-[10px] font-mono px-1.5 py-0.5 rounded-full border',
                              found ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200',
                            )}
                          >
                            ${r}{found ? '' : ' ⚠ not found'}
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {q.type === 'grid_table' && (
            <div className="border border-teal-200 rounded-xl p-3 space-y-4 bg-teal-50/40">
              <p className="text-xs font-semibold text-teal-800 flex items-center gap-1.5">
                <Table2 className="w-3.5 h-3.5" />Grid Columns
              </p>

              {/* Column list */}
              <div className="space-y-2">
                {gridCols.map((col, ci) => (
                  <div key={col.id} className="bg-white border border-teal-100 rounded-lg p-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-teal-400 w-5 shrink-0">{ci + 1}</span>
                      <Input
                        value={col.label}
                        onChange={e => setGridCols(prev => prev.map((c, i) => i === ci ? { ...c, label: e.target.value } : c))}
                        placeholder="Column header (English)…"
                        className="h-7 text-xs flex-1"
                      />
                      <Select
                        value={col.type}
                        onValueChange={v => setGridCols(prev => prev.map((c, i) => i === ci ? { ...c, type: v as GridCol['type'] } : c))}
                      >
                        <SelectTrigger className="h-7 text-xs w-28 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="dropdown">Dropdown</SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => setGridCols(prev => prev.filter((_, i) => i !== ci))}
                        disabled={gridCols.length <= 1}
                        className="p-1 text-slate-300 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 pl-5">
                      <Input
                        dir="rtl"
                        lang="ar"
                        value={col.label_ar ?? ''}
                        onChange={e => setGridCols(prev => prev.map((c, i) => i === ci ? { ...c, label_ar: e.target.value } : c))}
                        placeholder="اسم العمود بالعربية…"
                        className="h-7 text-xs flex-1"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Dropdown options for dropdown columns */}
              {gridCols.filter(c => c.type === 'dropdown').map(col => (
                <div key={col.id} className="space-y-1.5 pl-4 border-l-2 border-teal-200">
                  <p className="text-[10px] font-semibold text-teal-700">Options for "{col.label}"</p>
                  {(col.options ?? []).map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-1.5">
                      <Input
                        value={opt}
                        onChange={e => setGridCols(prev => prev.map(c => c.id === col.id ? { ...c, options: (c.options ?? []).map((o, j) => j === oi ? e.target.value : o) } : c))}
                        className="h-6 text-xs flex-1"
                        placeholder={`Option ${oi + 1}`}
                      />
                      <button
                        onClick={() => setGridCols(prev => prev.map(c => c.id === col.id ? { ...c, options: (c.options ?? []).filter((_, j) => j !== oi) } : c))}
                        className="p-1 text-slate-300 hover:text-red-400"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setGridCols(prev => prev.map(c => c.id === col.id ? { ...c, options: [...(c.options ?? []), ''] } : c))}
                    className="text-[10px] text-teal-600 hover:text-teal-800 flex items-center gap-1 font-medium"
                  >
                    <Plus className="w-2.5 h-2.5" />Add option
                  </button>
                </div>
              ))}

              {/* Add column */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={newColLabel}
                    onChange={e => setNewColLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newColLabel.trim()) {
                        setGridCols(prev => [...prev, { id: `col_${Date.now()}`, label: newColLabel.trim(), label_ar: newColLabelAr.trim() || undefined, type: 'text' }]);
                        setNewColLabel(''); setNewColLabelAr('');
                      }
                    }}
                    placeholder="New column name (English)…"
                    className="h-7 text-xs flex-1"
                  />
                  <button
                    onClick={() => {
                      if (!newColLabel.trim()) return;
                      setGridCols(prev => [...prev, { id: `col_${Date.now()}`, label: newColLabel.trim(), label_ar: newColLabelAr.trim() || undefined, type: 'text' }]);
                      setNewColLabel(''); setNewColLabelAr('');
                    }}
                    className="p-1.5 text-teal-600 hover:bg-teal-100 rounded"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <Input
                  dir="rtl"
                  lang="ar"
                  value={newColLabelAr}
                  onChange={e => setNewColLabelAr(e.target.value)}
                  placeholder="اسم العمود الجديد بالعربية (اختياري)…"
                  className="h-7 text-xs"
                />
              </div>

              {/* Row limits */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-teal-100">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Min rows</Label>
                  <Input
                    type="number"
                    value={gridMinRows}
                    onChange={e => setGridMinRows(Math.max(1, Number(e.target.value)))}
                    className="h-7 text-xs"
                    min={1} max={gridMaxRows}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Max rows</Label>
                  <Input
                    type="number"
                    value={gridMaxRows}
                    onChange={e => setGridMaxRows(Math.max(gridMinRows, Number(e.target.value)))}
                    className="h-7 text-xs"
                    min={gridMinRows} max={50}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Validation settings */}
          {hasValidation && (
            <div className="border border-blue-200 rounded-xl p-3 space-y-3 bg-blue-50/30">
              <p className="text-xs font-semibold text-blue-800 flex items-center gap-1">
                <CheckSquare2 className="w-3 h-3" />Validation Constraints
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Min length / value</Label>
                  <Input value={minLength} onChange={e => setMinLength(e.target.value)} type="number" className="h-7 text-xs" placeholder="e.g. 5" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-slate-500">Max length / value</Label>
                  <Input value={maxLength} onChange={e => setMaxLength(e.target.value)} type="number" className="h-7 text-xs" placeholder="e.g. 250" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">Pattern (regex)</Label>
                <Input value={pattern} onChange={e => setPattern(e.target.value)} className="h-7 text-xs font-mono" placeholder="e.g. ^[A-Z]{2}\\d{4}$" />
                <p className="text-[10px] text-slate-400">Regular expression the answer must match.</p>
              </div>
            </div>
          )}

          {/* Likert settings */}
          {q.type === 'likert' && (
            <div className="border border-violet-200 rounded-xl p-3 space-y-3 bg-violet-50/30">
              <p className="text-xs font-semibold text-violet-800 flex items-center gap-1">
                <LayoutList className="w-3 h-3" />Likert Scale Settings
              </p>
              <div className="space-y-2">
                <Label className="text-[10px] text-slate-500">Rows (statements)</Label>
                {likertRows.map((r, ri) => (
                  <div key={ri} className="flex items-center gap-1.5">
                    <Input value={r} onChange={e => setLikertRows(prev => prev.map((x, i) => i === ri ? e.target.value : x))} className="h-7 text-xs flex-1" />
                    <button onClick={() => setLikertRows(prev => prev.filter((_, i) => i !== ri))} disabled={likertRows.length <= 1} className="p-1 text-slate-300 hover:text-red-400 disabled:opacity-30"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <Input value={newLikertRow} onChange={e => setNewLikertRow(e.target.value)} placeholder="Add row…" className="h-7 text-xs flex-1"
                    onKeyDown={e => { if (e.key === 'Enter' && newLikertRow.trim()) { setLikertRows(p => [...p, newLikertRow.trim()]); setNewLikertRow(''); }}} />
                  <button onClick={() => { if (newLikertRow.trim()) { setLikertRows(p => [...p, newLikertRow.trim()]); setNewLikertRow(''); }}} className="p-1 text-violet-600 hover:bg-violet-100 rounded"><Plus className="w-3 h-3" /></button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] text-slate-500">Columns (scale points)</Label>
                {likertCols.map((c, ci) => (
                  <div key={ci} className="flex items-center gap-1.5">
                    <Input value={c} onChange={e => setLikertCols(prev => prev.map((x, i) => i === ci ? e.target.value : x))} className="h-7 text-xs flex-1" />
                    <button onClick={() => setLikertCols(prev => prev.filter((_, i) => i !== ci))} disabled={likertCols.length <= 2} className="p-1 text-slate-300 hover:text-red-400 disabled:opacity-30"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <Input value={newLikertCol} onChange={e => setNewLikertCol(e.target.value)} placeholder="Add column…" className="h-7 text-xs flex-1"
                    onKeyDown={e => { if (e.key === 'Enter' && newLikertCol.trim()) { setLikertCols(p => [...p, newLikertCol.trim()]); setNewLikertCol(''); }}} />
                  <button onClick={() => { if (newLikertCol.trim()) { setLikertCols(p => [...p, newLikertCol.trim()]); setNewLikertCol(''); }}} className="p-1 text-violet-600 hover:bg-violet-100 rounded"><Plus className="w-3 h-3" /></button>
                </div>
              </div>
            </div>
          )}

          {/* Conditional answer options */}
          {hasOptions && (
            <div className="border border-emerald-200 rounded-xl p-3 space-y-3 bg-emerald-50/30">
              <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
                <GitBranch className="w-3 h-3" />Conditional Options
                <span className="text-slate-400 font-normal ml-1">(show option only when a prior question equals a value)</span>
              </p>
              {condOptRules.map((rule, ri) => (
                <div key={ri} className="flex items-center gap-1.5 flex-wrap">
                  <Select value={rule.option} onValueChange={v => setCondOptRules(prev => prev.map((r, i) => i === ri ? { ...r, option: v } : r))}>
                    <SelectTrigger className="h-7 text-xs w-32 shrink-0"><SelectValue placeholder="Option…" /></SelectTrigger>
                    <SelectContent>{optsDraft.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                  <span className="text-[10px] text-slate-400 shrink-0">shows when</span>
                  <Select value={rule.depends_on} onValueChange={v => setCondOptRules(prev => prev.map((r, i) => i === ri ? { ...r, depends_on: v } : r))}>
                    <SelectTrigger className="h-7 text-xs w-36 shrink-0"><SelectValue placeholder="Question…" /></SelectTrigger>
                    <SelectContent>
                      {prevQuestions.map(pq => (
                        <SelectItem key={pq.id} value={pq.id} className="text-xs py-1.5">
                          <div className="flex flex-col gap-0.5 leading-tight">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] font-bold text-indigo-400 shrink-0">#{skipQNumMap.get(pq.id) ?? '?'}</span>
                              <span className="text-slate-700">{pq.label}</span>
                            </div>
                            {skipSectionMap.get(pq.id) && (
                              <span className="text-[10px] text-slate-400 pl-5">{skipSectionMap.get(pq.id)}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-slate-400 shrink-0">=</span>
                  <Input value={rule.depends_value} onChange={e => setCondOptRules(prev => prev.map((r, i) => i === ri ? { ...r, depends_value: e.target.value } : r))} className="h-7 text-xs w-24 shrink-0" placeholder="value…" />
                  <button onClick={() => setCondOptRules(prev => prev.filter((_, i) => i !== ri))} className="p-1 text-slate-300 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              {prevQuestions.length > 0 && optsDraft.length > 0 && (
                <button
                  onClick={() => setCondOptRules(prev => [...prev, { option: optsDraft[0] ?? '', depends_on: prevQuestions[0]?.id ?? '', depends_value: '' }])}
                  className="text-xs text-emerald-700 flex items-center gap-1 hover:underline"
                ><Plus className="w-3 h-3" />Add condition</button>
              )}
            </div>
          )}

          {/* Multi-condition skip logic */}
          <div className="border border-amber-200 rounded-xl p-3 space-y-3 bg-amber-50/40">
            <div className="flex items-center gap-2">
              <input type="checkbox" id={`skip-${q.id}`} checked={skipEnabled} onChange={e => setSkipEnabled(e.target.checked)} className="rounded" />
              <Label htmlFor={`skip-${q.id}`} className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                <GitBranch className="w-3 h-3" />Show this question only if…
              </Label>
              {skipEnabled && skipConditions.length > 1 && (
                <div className="ml-auto flex items-center gap-1">
                  <span className="text-[10px] text-amber-700">Match:</span>
                  <button onClick={() => setSkipLogicMode('AND')} className={cn('px-2 py-0.5 text-[10px] font-semibold rounded', skipLogicMode === 'AND' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700')}>ALL</button>
                  <button onClick={() => setSkipLogicMode('OR')} className={cn('px-2 py-0.5 text-[10px] font-semibold rounded', skipLogicMode === 'OR' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700')}>ANY</button>
                </div>
              )}
            </div>

            {skipEnabled && (
              <div className="space-y-2 pl-2">
                {prevQuestions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No previous questions available for conditions.</p>
                ) : (
                  <>
                    {skipConditions.map((cond, ci) => (
                      <div key={ci} className="flex items-center gap-1 flex-wrap bg-amber-50 rounded-lg p-2 border border-amber-100">
                        {skipConditions.length > 1 && (
                          <span className="text-[10px] font-bold text-amber-600 w-6 text-center shrink-0">{skipLogicMode === 'AND' ? 'AND' : 'OR'}</span>
                        )}
                        <Select value={cond.question_id} onValueChange={v => updateSkipCond(ci, { question_id: v })}>
                          <SelectTrigger className="h-7 text-xs flex-1 min-w-[120px]"><SelectValue placeholder="Question…" /></SelectTrigger>
                          <SelectContent>
                            {prevQuestions.map(pq => (
                              <SelectItem key={pq.id} value={pq.id} className="text-xs py-1.5">
                                <div className="flex flex-col gap-0.5 leading-tight">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10px] font-bold text-indigo-400 shrink-0">#{skipQNumMap.get(pq.id) ?? '?'}</span>
                                    <span className="text-slate-700">{pq.label}</span>
                                  </div>
                                  {skipSectionMap.get(pq.id) && (
                                    <span className="text-[10px] text-slate-400 pl-5">{skipSectionMap.get(pq.id)}</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={cond.operator} onValueChange={v => updateSkipCond(ci, { operator: v as SkipCondition['operator'] })}>
                          <SelectTrigger className="h-7 text-xs w-32 shrink-0"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SKIP_OPERATORS.map(op => <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {!['answered','not_answered'].includes(cond.operator) && (
                          <Input value={cond.value ?? ''} onChange={e => updateSkipCond(ci, { value: e.target.value })} placeholder="value…" className="h-7 text-xs w-24 shrink-0" />
                        )}
                        <button onClick={() => removeSkipCond(ci)} disabled={skipConditions.length <= 1} className="p-1 text-amber-300 hover:text-red-400 disabled:opacity-30 shrink-0"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                    <button onClick={addSkipCond} className="flex items-center gap-1 text-xs text-amber-700 hover:underline">
                      <Plus className="w-3 h-3" />Add condition
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={save} disabled={saving} data-testid={`btn-save-q-${q.id}`}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onEdit}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}


// ── SubmissionDialog ──────────────────────────────────────────────────────────
function SubmissionDialog({
  response, questions, answers, canManage, onDelete, onClose,
}: {
  response: Response;
  questions: Question[];
  answers: Answer[];
  canManage: boolean;
  onDelete: () => void;
  onClose: () => void;
}) {
  const displayName = response.respondent_name ?? response.respondent_email ?? 'Anonymous';
  const imageAnswers = answers.filter(a => {
    const q = questions.find(q => q.id === a.question_id);
    return q?.type === 'image' && a.answer_json;
  });
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', response.respondent_name ? 'bg-indigo-100' : 'bg-slate-100')}>
              <span className={cn('text-sm font-bold', response.respondent_name ? 'text-indigo-700' : 'text-slate-400')}>
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base">{displayName}</DialogTitle>
                {!response.respondent_name && !response.respondent_email && (
                  <span className="text-[10px] bg-slate-100 text-slate-400 rounded-full px-2 py-0.5">anonymous</span>
                )}
                {response.respondent_id && (
                  <span className="text-[10px] bg-indigo-50 text-indigo-500 rounded-full px-2 py-0.5">verified account</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                <p className="text-xs text-slate-400">{format(new Date(response.submitted_at), 'dd MMM yyyy, HH:mm')}</p>
                {response.respondent_email && (
                  <p className="text-xs text-slate-400">· {response.respondent_email}</p>
                )}
              </div>
            </div>
            {canManage && (
              <button
                onClick={() => { onClose(); onDelete(); }}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                title="Delete this submission"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Media gallery */}
          {imageAnswers.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />Media Gallery
              </p>
              <div className="grid grid-cols-3 gap-2">
                {imageAnswers.map((a, ai) => (
                  <button
                    key={a.id}
                    onClick={() => setGalleryIndex(ai)}
                    className="aspect-square rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-400 hover:scale-105 transition-all"
                  >
                    <img
                      src={String(a.answer_json)}
                      alt={`Media ${ai + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
              {/* Lightbox */}
              {galleryIndex !== null && (
                <div
                  className="fixed inset-0 bg-black/85 z-[9999] flex items-center justify-center p-4"
                  onClick={() => setGalleryIndex(null)}
                >
                  <div className="relative max-w-4xl max-h-full" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setGalleryIndex(null)}
                      className="absolute -top-10 right-0 text-white/70 hover:text-white"
                    >
                      <X className="w-6 h-6" />
                    </button>
                    <img
                      src={String(imageAnswers[galleryIndex].answer_json)}
                      alt={`Media ${galleryIndex + 1}`}
                      className="max-h-[80vh] max-w-full rounded-xl"
                    />
                    {imageAnswers.length > 1 && (
                      <div className="flex justify-center gap-2 mt-3">
                        {imageAnswers.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setGalleryIndex(i)}
                            className={cn('w-2 h-2 rounded-full transition-colors', i === galleryIndex ? 'bg-white' : 'bg-white/30 hover:bg-white/60')}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Q&A list */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Answers</p>
            {questions.map((q, qi) => {
              const ans = answers.find(a => a.question_id === q.id);
              let displayValue: React.ReactNode;
              if (!ans) {
                displayValue = <span className="text-slate-300 italic text-sm">No answer</span>;
              } else if (q.type === 'image' && ans.answer_json) {
                displayValue = (
                  <img
                    src={String(ans.answer_json)}
                    className="max-h-40 rounded-lg border border-slate-200 cursor-pointer hover:opacity-90"
                    alt="Response image"
                    onClick={() => {
                      const idx = imageAnswers.findIndex(a => a.id === ans.id);
                      if (idx >= 0) setGalleryIndex(idx);
                    }}
                  />
                );
              } else if (q.type === 'file' && ans.answer_json) {
                const meta = (() => { try { return JSON.parse(String(ans.answer_json)); } catch { return null; } })();
                displayValue = (
                  <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200 text-sm text-slate-700">
                    <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{meta ? `${meta.name} (${(meta.size / 1024).toFixed(1)} KB)` : String(ans.answer_json)}</span>
                  </div>
                );
              } else if (q.type === 'gps' && ans.answer_text) {
                const gp = ans.answer_text.split(',');
                // Support both legacy 3-field (lat,lng,acc) and new 4-field (lat,lng,alt,acc)
                const lat = parseFloat(gp[0]);
                const lng = parseFloat(gp[1]);
                const alt = gp.length >= 4 && gp[2] !== '' ? parseFloat(gp[2]) : null;
                const acc = gp.length >= 4 ? parseFloat(gp[3]) : (gp[2] ? parseFloat(gp[2]) : null);
                displayValue = (
                  <div className="space-y-2">
                    {isNaN(lat) ? (
                      <span className="text-sm text-slate-700">{ans.answer_text}</span>
                    ) : (
                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <div className="grid grid-cols-2 gap-px bg-slate-100">
                          {[
                            { label: 'Latitude',  value: `${lat.toFixed(6)}°` },
                            { label: 'Longitude', value: `${lng.toFixed(6)}°` },
                            ...(alt !== null ? [{ label: 'Altitude', value: `${alt.toFixed(1)} m` }] : []),
                            ...(acc !== null ? [{ label: 'Accuracy', value: `±${acc.toFixed(1)} m` }] : []),
                          ].map(row => (
                            <div key={row.label} className="bg-white px-3 py-1.5">
                              <p className="text-[9px] text-slate-400 uppercase tracking-wider font-medium">{row.label}</p>
                              <p className="text-xs font-mono font-semibold text-slate-700">{row.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!isNaN(lat) && !isNaN(lng) && (
                      <a
                        href={`https://www.google.com/maps?q=${lat},${lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />Open in Google Maps
                      </a>
                    )}
                  </div>
                );
              } else if (q.type === 'grid_table' && ans.answer_json) {
                const rows = (() => { try { return JSON.parse(String(ans.answer_json)) as Array<Record<string, string>>; } catch { return null; } })();
                type GridCol = { id: string; label: string; type: string };
                const cols = (q.settings?.grid_columns as GridCol[] | undefined) ?? [];
                displayValue = rows && cols.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-2 py-1.5 text-left text-[10px] font-bold text-slate-400 border-b border-slate-200 w-6">#</th>
                          {cols.map(c => <th key={c.id} className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-600 border-b border-slate-200">{c.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, ri) => (
                          <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="px-2 py-1.5 text-[10px] font-semibold text-slate-400 border-b border-slate-100">{ri + 1}</td>
                            {cols.map(c => <td key={c.id} className="px-2 py-1.5 text-slate-700 border-b border-slate-100">{row[c.id] ?? '—'}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <span className="text-slate-300 italic text-sm">No answer</span>;
              } else if (q.type === 'likert' && ans.answer_json) {
                const val = (() => { try { return typeof ans.answer_json === 'object' ? ans.answer_json as Record<string, string> : JSON.parse(String(ans.answer_json)); } catch { return null; } })();
                const cols = (q.settings?.likert_cols as string[] | undefined) ?? [];
                displayValue = val ? (
                  <div className="space-y-1">
                    {Object.entries(val).map(([row, col]) => (
                      <div key={row} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600 flex-1 truncate">{row}</span>
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0', cols.indexOf(col as string) >= cols.length / 2 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600')}>{col as string}</span>
                      </div>
                    ))}
                  </div>
                ) : <span className="text-slate-300 italic text-sm">No answer</span>;
              } else if (q.type === 'signature' && ans.answer_json) {
                displayValue = (
                  <img src={String(ans.answer_json)} alt="Signature" className="max-h-20 rounded border border-slate-200 bg-white" />
                );
              } else {
                const value = ans.answer_text
                  ?? (Array.isArray(ans.answer_json) ? (ans.answer_json as string[]).join(', ')
                  : ans.answer_json != null ? String(ans.answer_json) : null);
                displayValue = value
                  ? <span className="text-sm text-slate-700 leading-relaxed">{value}</span>
                  : <span className="text-slate-300 italic text-sm">No answer</span>;
              }
              return (
                <div key={q.id} className="bg-white rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-full">Q{qi + 1}</span>
                    <p className="text-[11px] font-semibold text-slate-600">{q.label}{q.required ? <span className="text-red-400 ml-0.5">*</span> : ''}</p>
                  </div>
                  <div className="pl-0.5">{displayValue}</div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
