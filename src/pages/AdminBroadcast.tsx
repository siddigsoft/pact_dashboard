import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Megaphone, Send, Clock, Users, AlertCircle, CheckCircle2,
  RefreshCw, Info, Bell, Link as LinkIcon, Shield, Eye, UserCheck,
  UserX, ChevronDown, ChevronUp, Download, RotateCcw, SendHorizonal,
  Smartphone, Rss, FileText, BarChart3, Globe, AlertTriangle,
  CheckCheck, Radio, TrendingUp, MessageSquare, X, CalendarClock,
  FlaskConical, MapPin, Save, Trash2
} from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ensureValidSession } from '@/lib/session-health';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { format } from 'date-fns';

const AUDIENCE_OPTIONS = [
  { value: 'all',             labelEn: 'All Users',        labelAr: 'جميع المستخدمين',   icon: '👥' },
  { value: 'no_bank_account', labelEn: 'No Bank Account',  labelAr: 'بدون حساب بنكي',    icon: '🏦' },
  { value: 'data_collector',  labelEn: 'Data Collectors',  labelAr: 'جامعو البيانات',     icon: '📋' },
  { value: 'coordinator',     labelEn: 'Coordinators',     labelAr: 'المنسقون',            icon: '🤝' },
  { value: 'supervisor',      labelEn: 'Supervisors',      labelAr: 'المشرفون',            icon: '👁' },
  { value: 'admin',           labelEn: 'Admins',           labelAr: 'المدراء',             icon: '⚙️' },
  { value: 'financialadmin',  labelEn: 'Financial Admins', labelAr: 'المدراء الماليون',   icon: '💰' },
  { value: 'by_state',        labelEn: 'By State',         labelAr: 'حسب الولاية',        icon: '📍' },
  { value: 'by_hub',          labelEn: 'By Hub',           labelAr: 'حسب المركز',         icon: '🏢' },
  { value: 'by_locality',     labelEn: 'By Locality',      labelAr: 'حسب المحلية',        icon: '🗺️' },
  { value: 'specific_users',  labelEn: 'Specific Users',   labelAr: 'مستخدمون محددون',   icon: '🎯' },
];

const SUDAN_STATES = [
  'Blue Nile', 'Central Darfur', 'East Darfur', 'Gedaref', 'Kassala',
  'Khartoum', 'North Darfur', 'North Kordofan', 'Northern', 'Red Sea',
  'River Nile', 'Sennar', 'South Darfur', 'South Kordofan', 'West Darfur',
  'West Kordofan', 'White Nile',
];

const DRAFT_KEY = 'broadcast_draft_v1';
const SCHEDULED_KEY = 'broadcast_scheduled_v1';

const PRIORITY_OPTIONS = [
  { value: 'normal', labelEn: 'Normal', labelAr: 'عادي', color: 'bg-slate-100 text-slate-700', border: 'border-l-slate-400', badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  { value: 'high', labelEn: 'High', labelAr: 'عالي', color: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
  { value: 'urgent', labelEn: 'Urgent', labelAr: 'عاجل', color: 'bg-red-100 text-red-700', border: 'border-l-red-500', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
];

const QUICK_TEMPLATES = [
  {
    id: 'bank_account',
    label: 'Bank Account Reminder',
    labelAr: 'تذكير بالحساب البنكي',
    icon: '🏦',
    titleEn: 'Action Required: Update Your Bank Account',
    titleAr: 'إجراء مطلوب: تحديث بيانات حسابك البنكي',
    messageEn: 'Please ensure your bank account details (account name, number, branch) are up to date in your Profile Settings. This is required for all transportation advance and withdrawal requests.',
    messageAr: 'يرجى التأكد من تحديث بيانات حسابك البنكي (الاسم، الرقم، الفرع) في إعدادات ملفك الشخصي. هذا مطلوب لجميع طلبات السلف والمكافآت.',
    link: '/settings?tab=profile',
    audience: 'no_bank_account',
    priority: 'high',
  },
  {
    id: 'system_maintenance',
    label: 'System Maintenance',
    labelAr: 'صيانة النظام',
    icon: '🔧',
    titleEn: 'Scheduled Maintenance Notice',
    titleAr: 'إشعار صيانة مجدولة',
    messageEn: 'The system will undergo scheduled maintenance. Please save your work before the maintenance window.',
    messageAr: 'سيخضع النظام لصيانة مجدولة. يرجى حفظ عملك قبل نافذة الصيانة.',
    link: '',
    audience: 'all',
    priority: 'high',
  },
  {
    id: 'new_feature',
    label: 'New Feature',
    labelAr: 'ميزة جديدة',
    icon: '✨',
    titleEn: 'New Feature Available',
    titleAr: 'ميزة جديدة متاحة',
    messageEn: 'A new feature has been added to the platform. Please check it out.',
    messageAr: 'تمت إضافة ميزة جديدة إلى المنصة. يرجى الاطلاع عليها.',
    link: '',
    audience: 'all',
    priority: 'normal',
  },
  {
    id: 'field_reminder',
    label: 'Field Reminder',
    labelAr: 'تذكير ميداني',
    icon: '📍',
    titleEn: 'Field Operations Reminder',
    titleAr: 'تذكير بالعمليات الميدانية',
    messageEn: 'Please complete your pending site visits and submit reports before the deadline.',
    messageAr: 'يرجى إكمال زيارات المواقع المعلقة وتقديم التقارير قبل الموعد النهائي.',
    link: '/site-visits',
    audience: 'data_collector',
    priority: 'high',
  },
  {
    id: 'mmp_available',
    label: 'MMP Available',
    labelAr: 'خطة رصد جديدة',
    icon: '📂',
    titleEn: 'New MMP Available for Assignment',
    titleAr: 'خطة رصد جديدة متاحة للتخصيص',
    messageEn: 'A new Monthly Monitoring Plan (MMP) has been uploaded and is now available. Please log in to review and claim your site visits.',
    messageAr: 'تم رفع خطة رصد شهرية جديدة وهي متاحة الآن. يرجى تسجيل الدخول لمراجعة مواقعك المخصصة.',
    link: '/site-visits',
    audience: 'data_collector',
    priority: 'high',
  },
  {
    id: 'advance_ready',
    label: 'Advance Approved',
    labelAr: 'السلفة معتمدة',
    icon: '💸',
    titleEn: 'Transportation Advance Approved',
    titleAr: 'تمت الموافقة على سلفة النقل',
    messageEn: 'Your transportation advance request has been approved. Please coordinate with your hub office for fund disbursement.',
    messageAr: 'تمت الموافقة على طلب سلفة النقل الخاص بك. يرجى التنسيق مع مكتب المركز لصرف الأموال.',
    link: '/transportation-advances',
    audience: 'data_collector',
    priority: 'normal',
  },
  {
    id: 'report_deadline',
    label: 'Report Deadline',
    labelAr: 'موعد التقرير',
    icon: '⏰',
    titleEn: 'Urgent: Report Submission Deadline Approaching',
    titleAr: 'عاجل: اقتراب موعد تقديم التقرير',
    messageEn: 'The deadline for submitting visit reports is approaching. Please ensure all your pending visits are completed and reports submitted immediately.',
    messageAr: 'يقترب الموعد النهائي لتقديم تقارير الزيارات. يرجى التأكد من إكمال جميع زياراتك المعلقة وتقديم التقارير فوراً.',
    link: '/site-visits',
    audience: 'data_collector',
    priority: 'urgent',
  },
  {
    id: 'training',
    label: 'Training Announcement',
    labelAr: 'إعلان تدريب',
    icon: '🎓',
    titleEn: 'Training Session Scheduled',
    titleAr: 'تم جدولة جلسة تدريبية',
    messageEn: 'A mandatory training session has been scheduled. Please check your email for the date, time, and joining instructions.',
    messageAr: 'تم جدولة جلسة تدريبية إلزامية. يرجى مراجعة بريدك الإلكتروني للاطلاع على التاريخ والوقت وتعليمات الانضمام.',
    link: '',
    audience: 'all',
    priority: 'high',
  },
  {
    id: 'security_alert',
    label: 'Security Notice',
    labelAr: 'تنبيه أمني',
    icon: '🔒',
    titleEn: 'Security Notice: Action Required',
    titleAr: 'تنبيه أمني: إجراء مطلوب',
    messageEn: 'Important security update. Please review the latest security guidelines and ensure your account credentials are up to date.',
    messageAr: 'تحديث أمني مهم. يرجى مراجعة أحدث إرشادات الأمان والتأكد من أن بيانات اعتماد حسابك محدثة.',
    link: '/settings?tab=profile',
    audience: 'all',
    priority: 'urgent',
  },
  {
    id: 'financial_report',
    label: 'Financial Report Due',
    labelAr: 'التقرير المالي',
    icon: '📊',
    titleEn: 'Financial Report Submission Reminder',
    titleAr: 'تذكير بتقديم التقرير المالي',
    messageEn: 'Please ensure all pending cost submissions and transportation advance settlements are submitted before the financial period close.',
    messageAr: 'يرجى التأكد من تقديم جميع طلبات التكاليف المعلقة وتسويات سلف النقل قبل إغلاق الفترة المالية.',
    link: '/cost-submission',
    audience: 'data_collector',
    priority: 'high',
  },
];

type BroadcastHistory = {
  id: string;
  broadcast_id: string | null;
  title: string;
  title_ar?: string;
  message: string;
  message_ar?: string;
  created_at: string;
  event_type: string;
  priority: string;
  recipient_count?: number;
  read_count?: number;
  action_url?: string | null;
  whatsapp_sent?: number;
  whatsapp_failed?: number;
};

type ReceiptUser = {
  userId: string;
  name: string;
  role: string;
  isRead: boolean;
  readAt: string | null;
};

type SendSummary = {
  sent: number;
  audience: string;
  titleEn: string;
  titleAr: string;
  priority: string;
  fcm?: { sent: number; failed: number; tokens: number; error?: string };
  whatsapp?: { sent: number; failed: number; total: number; skipped?: boolean; error?: string };
};

export default function AdminBroadcastPage() {
  const { currentUser } = useUser();
  const { toast } = useToast();

  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [messageAr, setMessageAr] = useState('');
  const [audience, setAudience] = useState('all');
  const [priority, setPriority] = useState('normal');
  const [actionLink, setActionLink] = useState('');
  const [requireAck, setRequireAck] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [sending, setSending] = useState(false);

  const [sendSummary, setSendSummary] = useState<SendSummary | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [history, setHistory] = useState<BroadcastHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('compose');
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, ReceiptUser[]>>({});
  const [receiptsLoading, setReceiptsLoading] = useState<Record<string, boolean>>({});
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [stats, setStats] = useState<{ total: number; avgRead: number } | null>(null);

  const [stateFilter,       setStateFilter]       = useState<string>('');
  const [hubFilter,         setHubFilter]         = useState<string>('');
  const [localityFilter,    setLocalityFilter]    = useState<string>('');
  const [specificUserIds,   setSpecificUserIds]   = useState<string[]>([]);
  const [userSearch,        setUserSearch]        = useState<string>('');
  const [allUsers,          setAllUsers]          = useState<{ id: string; full_name: string; email: string; role: string; hub_id: string; locality_id: string }[]>([]);
  const [allHubs,           setAllHubs]           = useState<string[]>([]);
  const [allLocalities,     setAllLocalities]     = useState<string[]>([]);
  const [scheduleAt,        setScheduleAt]        = useState<string>('');
  const [testSending,       setTestSending]       = useState(false);
  const [showConfirmModal,  setShowConfirmModal]  = useState(false);
  const [confirmTargetUsers, setConfirmTargetUsers] = useState<{ id: string; role: string }[]>([]);
  const [draftRestored,     setDraftRestored]     = useState(false);
  const [scheduledDrafts,   setScheduledDrafts]   = useState<any[]>([]);

  const role = (currentUser?.role || '').toLowerCase();
  const isAdmin = ['admin', 'superadmin', 'ict', 'financialadmin'].includes(role);

  const getPriority = (val: string) => PRIORITY_OPTIONS.find(p => p.value === val) || PRIORITY_OPTIONS[0];
  const getAudience = (val: string) => AUDIENCE_OPTIONS.find(a => a.value === val) || AUDIENCE_OPTIONS[0];

  useEffect(() => {
    if (activeTab === 'feed') loadHistory();
  }, [activeTab]);

  useEffect(() => {
    loadUserCount();
  }, [audience, stateFilter, hubFilter, localityFilter, specificUserIds]);

  useEffect(() => {
    const loadPeopleData = async () => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, email, role, hub_id, locality_id')
        .not('role', 'is', null)
        .order('full_name');
      if (data) {
        setAllUsers(data);
        setAllHubs([...new Set((data as any[]).map((u: any) => u.hub_id).filter(Boolean))].sort());
        setAllLocalities([...new Set((data as any[]).map((u: any) => u.locality_id).filter((l: any) => l && l.trim()))].sort());
      }
    };
    loadPeopleData();
  }, []);

  // Draft auto-save
  useEffect(() => {
    if (!titleEn && !titleAr && !messageEn && !messageAr) return;
    const draft = { titleEn, titleAr, messageEn, messageAr, audience, priority, actionLink, requireAck, sendEmail, stateFilter, scheduleAt };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [titleEn, titleAr, messageEn, messageAr, audience, priority, actionLink, requireAck, sendEmail, stateFilter, scheduleAt]);

  // Draft load on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const d = JSON.parse(saved);
        if (d.titleEn || d.messageEn) {
          setTitleEn(d.titleEn || ''); setTitleAr(d.titleAr || '');
          setMessageEn(d.messageEn || ''); setMessageAr(d.messageAr || '');
          setAudience(d.audience || 'all'); setPriority(d.priority || 'normal');
          setActionLink(d.actionLink || ''); setRequireAck(d.requireAck || false);
          setSendEmail(d.sendEmail || false); setStateFilter(d.stateFilter || '');
          setScheduleAt(d.scheduleAt || '');
          setDraftRestored(true);
        }
      }
    } catch {}
    // Load scheduled drafts
    try {
      const s = localStorage.getItem(SCHEDULED_KEY);
      if (s) setScheduledDrafts(JSON.parse(s));
    } catch {}
  }, []);

  // Scheduled broadcast checker — runs every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const s = localStorage.getItem(SCHEDULED_KEY);
        if (!s) return;
        const drafts: any[] = JSON.parse(s);
        const now = new Date();
        const due = drafts.filter(d => new Date(d.scheduleAt) <= now);
        if (due.length === 0) return;
        for (const d of due) {
          await executeSend(d);
        }
        const remaining = drafts.filter(d => new Date(d.scheduleAt) > now);
        localStorage.setItem(SCHEDULED_KEY, JSON.stringify(remaining));
        setScheduledDrafts(remaining);
        if (due.length > 0) {
          toast({ title: `Scheduled broadcast sent / تم إرسال البث المجدول`, description: `"${due[0].titleEn}" was sent to ${due[0].audience}.` });
          loadHistory();
        }
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setTitleEn(''); setTitleAr(''); setMessageEn(''); setMessageAr('');
    setAudience('all'); setPriority('normal'); setActionLink('');
    setRequireAck(false); setSendEmail(false); setStateFilter(''); setScheduleAt('');
    setDraftRestored(false);
  };

  const loadUserCount = async () => {
    try {
      if (audience === 'specific_users') {
        setUserCount(specificUserIds.length);
        return;
      }
      if (audience === 'no_bank_account') {
        const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).not('role', 'is', null);
        setUserCount(count ?? 0);
        return;
      }
      if (audience === 'by_state') {
        if (!stateFilter) { setUserCount(null); return; }
        const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).ilike('state_id', stateFilter).not('role', 'is', null);
        setUserCount(count ?? 0);
        return;
      }
      if (audience === 'by_hub') {
        if (!hubFilter) { setUserCount(null); return; }
        const { count } = await (supabase as any).from('profiles').select('id', { count: 'exact', head: true }).eq('hub_id', hubFilter).not('role', 'is', null);
        setUserCount(count ?? 0);
        return;
      }
      if (audience === 'by_locality') {
        if (!localityFilter) { setUserCount(null); return; }
        const { count } = await (supabase as any).from('profiles').select('id', { count: 'exact', head: true }).eq('locality_id', localityFilter).not('role', 'is', null);
        setUserCount(count ?? 0);
        return;
      }
      let query = supabase.from('profiles').select('id', { count: 'exact', head: true });
      if (audience !== 'all') {
        query = query.ilike('role', audience);
      } else {
        query = query.not('role', 'is', null);
      }
      const { count } = await query;
      setUserCount(count ?? 0);
    } catch {
      setUserCount(null);
    }
  };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('notifications')
        .select('id, title_en, title_ar, message_en, message_ar, created_at, priority, related_entity_id, action_url')
        .eq('event_type', 'broadcast')
        .gte('created_at', ninetyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(300);

      const grouped: Record<string, BroadcastHistory> = {};
      (data || []).forEach(n => {
        const key = n.related_entity_id || `${n.title_en}_${n.created_at?.slice(0, 16)}`;
        if (!grouped[key]) {
          grouped[key] = {
            id: n.id,
            broadcast_id: n.related_entity_id || null,
            title: n.title_en || '',
            title_ar: n.title_ar || '',
            message: n.message_en || '',
            message_ar: n.message_ar || '',
            created_at: n.created_at,
            event_type: 'broadcast',
            priority: n.priority || 'normal',
            recipient_count: 1,
            action_url: n.action_url || null,
          };
        } else {
          grouped[key].recipient_count = (grouped[key].recipient_count || 1) + 1;
        }
      });

      const sorted = Object.values(grouped)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 30);

      // Fetch WhatsApp delivery logs joined by broadcast_id (deterministic key).
      // Only broadcasts that had WhatsApp enabled will have matching log rows.
      try {
        const broadcastIds = sorted.map(b => b.broadcast_id).filter(Boolean) as string[];
        if (broadcastIds.length > 0) {
          const { data: waLogs } = await (supabase as any)
            .from('whatsapp_logs')
            .select('broadcast_id, status')
            .in('broadcast_id', broadcastIds);

          if (waLogs && waLogs.length > 0) {
            const waSent: Record<string, number> = {};
            const waFailed: Record<string, number> = {};
            for (const log of waLogs as { broadcast_id: string; status: string }[]) {
              if (!log.broadcast_id) continue;
              if (log.status === 'sent') waSent[log.broadcast_id] = (waSent[log.broadcast_id] || 0) + 1;
              else if (log.status === 'failed') waFailed[log.broadcast_id] = (waFailed[log.broadcast_id] || 0) + 1;
            }
            sorted.forEach(broadcast => {
              if (!broadcast.broadcast_id) return;
              const s = waSent[broadcast.broadcast_id];
              const f = waFailed[broadcast.broadcast_id];
              if (s !== undefined || f !== undefined) {
                broadcast.whatsapp_sent = s ?? 0;
                broadcast.whatsapp_failed = f ?? 0;
              }
            });
          }
        }
      } catch {
        // whatsapp_logs query failure is non-fatal
      }

      setHistory(sorted);

      // Stats
      const total = sorted.length;
      setStats({ total, avgRead: 0 });
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadReceipts = async (broadcastId: string) => {
    if (receiptsLoading[broadcastId]) return;
    setReceiptsLoading(prev => ({ ...prev, [broadcastId]: true }));
    try {
      const { data: notifs } = await supabase
        .from('notifications')
        .select('user_id, is_read, read_at, status')
        .eq('related_entity_id', broadcastId)
        .eq('event_type', 'broadcast');

      if (!notifs || notifs.length === 0) {
        setReceipts(prev => ({ ...prev, [broadcastId]: [] }));
        return;
      }

      const userIds = [...new Set(notifs.map(n => n.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', userIds);

      const profileMap: Record<string, { full_name: string; role: string }> = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });

      const receiptList: ReceiptUser[] = notifs.map(n => ({
        userId: n.user_id,
        name: profileMap[n.user_id]?.full_name || n.user_id?.slice(0, 8) || 'Unknown',
        role: profileMap[n.user_id]?.role || '—',
        isRead: n.is_read === true || n.status === 'read' || !!n.read_at,
        readAt: n.read_at || null,
      }));

      receiptList.sort((a, b) => {
        if (a.isRead !== b.isRead) return b.isRead ? 1 : -1;
        if (a.isRead && a.readAt && b.readAt) return new Date(b.readAt).getTime() - new Date(a.readAt).getTime();
        return a.name.localeCompare(b.name);
      });

      setReceipts(prev => ({ ...prev, [broadcastId]: receiptList }));
    } catch {
      setReceipts(prev => ({ ...prev, [broadcastId]: [] }));
    } finally {
      setReceiptsLoading(prev => ({ ...prev, [broadcastId]: false }));
    }
  };

  const toggleReceipts = (item: BroadcastHistory) => {
    if (!item.broadcast_id) return;
    const bid = item.broadcast_id;
    if (openReceiptId === bid) {
      setOpenReceiptId(null);
    } else {
      setOpenReceiptId(bid);
      if (!receipts[bid]) loadReceipts(bid);
    }
  };

  const refreshReceipts = (bid: string) => {
    setReceipts(prev => { const next = { ...prev }; delete next[bid]; return next; });
    loadReceipts(bid);
  };

  const resendToUnread = async (item: BroadcastHistory, bid: string) => {
    const receiptList = receipts[bid] || [];
    const unread = receiptList.filter(r => !r.isRead);
    if (unread.length === 0) {
      toast({ title: 'All caught up', description: 'Every recipient has already read this broadcast.' });
      return;
    }
    setResendingId(bid);
    try {
      const session = await ensureValidSession();
      if (!session.success) { setResendingId(null); return; }

      const { data: orig } = await supabase
        .from('notifications')
        .select('title_ar, message_ar, action_url')
        .eq('related_entity_id', bid)
        .limit(1)
        .single();

      const broadcastId = crypto.randomUUID();
      const now = new Date().toISOString();
      const notifType = item.priority === 'urgent' ? 'error' : item.priority === 'high' ? 'warning' : 'info';
      const rows = unread.map(u => ({
        recipient_id: u.userId,
        user_id: u.userId,
        title_en: item.title,
        title_ar: orig?.title_ar || item.title_ar || item.title,
        message_en: item.message,
        message_ar: orig?.message_ar || item.message_ar || item.message,
        priority: item.priority,
        action_url: orig?.action_url || null,
        related_entity_id: broadcastId,
        entity_type: 'broadcast_batch',
        event_type: 'broadcast',
        status: 'pending',
        email_sent: false,
        title: item.title,
        message: item.message,
        link: orig?.action_url || null,
        type: notifType,
        is_read: false,
        created_at: now,
      }));
      const { error } = await supabase.from('notifications').insert(rows);
      if (error) throw new Error(error.message);

      supabase.functions.invoke('send-fcm-push', {
        body: {
          user_ids: unread.map(u => u.userId),
          title: item.title_ar ? `${item.title} | ${item.title_ar}` : item.title,
          body: item.message_ar ? `${item.message}\n${item.message_ar}` : item.message,
          priority: item.priority,
          notification_type: 'broadcast',
          data: { type: 'broadcast', broadcast_id: broadcastId, priority: item.priority },
        },
      }).catch(() => {});

      toast({ title: 'Re-sent / أعيد الإرسال', description: `Re-sent to ${unread.length} user(s) who hadn't read it.` });
      loadHistory();
    } catch (err: any) {
      toast({ title: 'Re-send failed', description: err.message, variant: 'destructive' });
    } finally {
      setResendingId(null);
    }
  };

  const exportReceiptsCSV = (item: BroadcastHistory, bid: string) => {
    const receiptList = receipts[bid];
    if (!receiptList || receiptList.length === 0) return;
    const header = 'Name,Role,Status,Read At\n';
    const rows = receiptList.map(r =>
      `"${r.name}","${r.role}","${r.isRead ? 'Read' : 'Pending'}","${r.readAt ? format(new Date(r.readAt), 'yyyy-MM-dd HH:mm:ss') : ''}"`
    ).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipts_${item.title.slice(0, 20).replace(/\s+/g, '_')}_${format(new Date(item.created_at), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyTemplate = (t: typeof QUICK_TEMPLATES[0]) => {
    setTitleEn(t.titleEn);
    setTitleAr(t.titleAr);
    setMessageEn(t.messageEn);
    setMessageAr(t.messageAr);
    setActionLink(t.link);
    setAudience(t.audience);
    setPriority(t.priority);
  };

  const getTargetUsers = async (aud: string, sf: string) => {
    if (aud === 'specific_users') {
      if (specificUserIds.length === 0) return [];
      const { data, error } = await (supabase as any).from('profiles').select('id, role').in('id', specificUserIds);
      if (error) throw new Error('Could not load users');
      return data || [];
    }
    const { data: users, error: usersError } = await (supabase as any)
      .from('profiles')
      .select('id, bank_account, role, state_id, hub_id, locality_id, full_name, email')
      .not('role', 'is', null);
    if (usersError || !users) throw new Error('Could not load users');
    if (aud === 'no_bank_account') {
      return users.filter((u: any) => { const ba = u.bank_account as any; return !ba?.accountNumber && !ba?.account_number; });
    }
    if (aud === 'by_state') {
      return users.filter((u: any) => u.state_id?.toLowerCase() === sf.toLowerCase());
    }
    if (aud === 'by_hub') {
      return users.filter((u: any) => u.hub_id === hubFilter);
    }
    if (aud === 'by_locality') {
      return users.filter((u: any) => u.locality_id === localityFilter);
    }
    if (aud !== 'all') {
      return users.filter((u: any) => (u.role || '').toLowerCase() === aud);
    }
    return users;
  };

  const executeSend = async (params: { titleEn: string; titleAr: string; messageEn: string; messageAr: string; audience: string; stateFilter: string; priority: string; actionLink: string; sendEmail: boolean; targetUserIds: string[] }) => {
    const session = await ensureValidSession();
    if (!session.success) throw new Error('Session expired. Please refresh and try again.');

    const { titleEn: tEn, titleAr: tAr, messageEn: mEn, messageAr: mAr, priority: pri, actionLink: al, sendEmail: se, targetUserIds } = params;
    const titleText = tEn.trim();
    const titleArText = tAr.trim() || titleText;
    const messageText = mEn.trim();
    const messageArText = mAr.trim() || messageText;
    const notifType = pri === 'urgent' ? 'error' : pri === 'high' ? 'warning' : 'info';
    const link = al?.trim() || null;
    const now = new Date().toISOString();
    const broadcastId = crypto.randomUUID();

    const rows = targetUserIds.map(uid => ({
      recipient_id: uid, user_id: uid,
      title_en: titleText, title_ar: titleArText,
      message_en: messageText, message_ar: messageArText,
      priority: pri, action_url: link,
      related_entity_id: broadcastId,
      entity_type: 'broadcast_batch', event_type: 'broadcast',
      status: 'pending', email_sent: false,
      title: titleText, message: messageText, link,
      type: notifType, is_read: false, created_at: now,
    }));

    const { error: insertError } = await supabase.from('notifications').insert(rows);
    if (insertError) throw new Error(insertError.message);

    let fcmResult: SendSummary['fcm'] | undefined;
    try {
      const fcmTitle = tAr.trim() ? `${titleText} | ${tAr.trim()}` : titleText;
      const fcmBody = mAr.trim() ? `${messageText}\n${mAr.trim()}` : messageText;
      const { data: fcmData, error: fcmError } = await supabase.functions.invoke('send-fcm-push', {
        body: { user_ids: targetUserIds, title: fcmTitle, body: fcmBody, priority: pri, notification_type: 'broadcast', data: { type: 'broadcast', broadcast_id: broadcastId, action_url: link || '', priority: pri }, ...(link ? { action_url: link } : {}) },
      });
      fcmResult = fcmError ? { sent: 0, failed: 0, tokens: 0, error: fcmError.message } : { sent: fcmData?.sent ?? 0, failed: fcmData?.failed ?? 0, tokens: fcmData?.tokens_targeted ?? 0, error: fcmData?.error };
    } catch (fcmEx: any) {
      fcmResult = { sent: 0, failed: 0, tokens: 0, error: fcmEx?.message };
    }

    if (se) {
      (async () => {
        for (const uid of targetUserIds) {
          try {
            await NotificationTriggerService.send({ userId: uid, title: titleText, titleAr: titleArText, message: messageText, messageAr: messageArText, type: notifType as any, category: 'broadcast' as any, priority: pri as any, link: link || undefined, sendEmail: true });
          } catch {}
        }
      })();
    }

    return { broadcastId, fcmResult, sent: targetUserIds.length };
  };

  // Step 1: Load users and show confirm modal
  const handleSend = async () => {
    if (!titleEn.trim() || !messageEn.trim()) {
      toast({ title: 'Missing fields / حقول مفقودة', description: 'Please fill in the English title and message.', variant: 'destructive' });
      return;
    }
    if (audience === 'by_state' && !stateFilter) {
      toast({ title: 'Select a state', description: 'Please choose a Sudan state to target.', variant: 'destructive' });
      return;
    }
    if (audience === 'by_hub' && !hubFilter) {
      toast({ title: 'Select a hub', description: 'Please choose a hub to target.', variant: 'destructive' });
      return;
    }
    if (audience === 'by_locality' && !localityFilter) {
      toast({ title: 'Select a locality', description: 'Please choose a locality to target.', variant: 'destructive' });
      return;
    }
    if (audience === 'specific_users' && specificUserIds.length === 0) {
      toast({ title: 'Select users', description: 'Please select at least one user to target.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const users = await getTargetUsers(audience, stateFilter);
      if (users.length === 0) {
        toast({ title: 'No recipients', description: 'No users match the selected audience.', variant: 'destructive' });
        return;
      }
      setConfirmTargetUsers(users);
      setShowConfirmModal(true);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // Step 2: Confirmed — actually send
  const handleConfirmedSend = async () => {
    setSending(true);
    setShowConfirmModal(false);
    try {
      const { broadcastId, fcmResult } = await executeSend({
        titleEn, titleAr, messageEn, messageAr, audience, stateFilter, priority, actionLink, sendEmail,
        targetUserIds: confirmTargetUsers.map(u => u.id),
      });

      let waResult: SendSummary['whatsapp'] | undefined;
      if (sendWhatsApp) {
        try {
          const { data: waData, error: waError } = await supabase.functions.invoke('send-whatsapp', {
            body: {
              user_ids: confirmTargetUsers.map(u => u.id),
              event_type: 'broadcast',
              broadcast_id: broadcastId,
              data: {
                message: messageEn.trim(),
                message_ar: messageAr.trim() || messageEn.trim(),
              },
            },
          });
          waResult = waError
            ? { sent: 0, failed: 0, total: confirmTargetUsers.length, error: waError.message }
            : { sent: waData?.sent ?? 0, failed: waData?.failed ?? 0, total: waData?.total ?? 0, skipped: waData?.skipped };
        } catch (waEx: any) {
          waResult = { sent: 0, failed: 0, total: confirmTargetUsers.length, error: waEx?.message };
        }
      }

      setSendSummary({ sent: confirmTargetUsers.length, audience, titleEn: titleEn.trim(), titleAr: titleAr.trim() || titleEn.trim(), priority, fcm: fcmResult, whatsapp: waResult });
      setShowSuccessModal(true);
      localStorage.removeItem(DRAFT_KEY);
      setTitleEn(''); setTitleAr(''); setMessageEn(''); setMessageAr(''); setActionLink(''); setScheduleAt('');
      setDraftRestored(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to send broadcast.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // Test send — only to self
  const handleTestSend = async () => {
    if (!titleEn.trim() || !messageEn.trim()) {
      toast({ title: 'Missing fields', description: 'Please fill in the English title and message first.', variant: 'destructive' });
      return;
    }
    if (!currentUser?.id) return;
    setTestSending(true);
    try {
      await executeSend({ titleEn: `[TEST] ${titleEn}`, titleAr: titleAr ? `[TEST] ${titleAr}` : '', messageEn, messageAr, audience, stateFilter, priority, actionLink, sendEmail: false, targetUserIds: [currentUser.id] });
      toast({ title: 'Test sent ✓', description: 'The broadcast was sent only to you. Check your notification bell.' });
    } catch (err: any) {
      toast({ title: 'Test send failed', description: err.message, variant: 'destructive' });
    } finally {
      setTestSending(false);
    }
  };

  // Schedule — save to localStorage queue
  const handleSchedule = () => {
    if (!titleEn.trim() || !messageEn.trim()) {
      toast({ title: 'Missing fields', description: 'Please fill in the English title and message.', variant: 'destructive' });
      return;
    }
    if (!scheduleAt) {
      toast({ title: 'No schedule time', description: 'Please pick a date and time to schedule.', variant: 'destructive' });
      return;
    }
    if (new Date(scheduleAt) <= new Date()) {
      toast({ title: 'Invalid time', description: 'Scheduled time must be in the future.', variant: 'destructive' });
      return;
    }
    // T31 — Scheduled broadcasts only fire while the tab is open; cap at 24h
    // so users don't accidentally schedule something a week out and forget.
    const maxScheduleAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (new Date(scheduleAt) > maxScheduleAt) {
      toast({
        title: 'Too far in the future / بعيد جدًا',
        description: 'Scheduled broadcasts must be within the next 24 hours (this tab needs to stay open). For longer-term scheduling, use the recurring reminder system.',
        variant: 'destructive',
      });
      return;
    }
    if (audience === 'by_state' && !stateFilter) {
      toast({ title: 'Select a state', description: 'Please choose a Sudan state to target.', variant: 'destructive' });
      return;
    }
    const draft = { id: crypto.randomUUID(), titleEn, titleAr, messageEn, messageAr, audience, stateFilter, priority, actionLink, sendEmail, scheduleAt };
    const existing = scheduledDrafts;
    const updated = [...existing, draft];
    localStorage.setItem(SCHEDULED_KEY, JSON.stringify(updated));
    setScheduledDrafts(updated);
    setScheduleAt('');
    toast({ title: 'Broadcast scheduled ✓ / تم جدولة البث', description: `Will send at ${format(new Date(scheduleAt), 'MMM dd, yyyy HH:mm')} — keep this tab open.` });
  };

  const removeScheduledDraft = (id: string) => {
    const updated = scheduledDrafts.filter(d => d.id !== id);
    localStorage.setItem(SCHEDULED_KEY, JSON.stringify(updated));
    setScheduledDrafts(updated);
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
        <Shield className="w-12 h-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
        <p className="text-muted-foreground">Only administrators can access the broadcast center.</p>
      </div>
    );
  }

  const selectedPriority = getPriority(priority);
  const selectedAudience = getAudience(audience);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-violet-50 dark:from-slate-950 dark:to-violet-950/30">

      {/* ── Success Modal ─────────────────────────────────────────── */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
              Broadcast Sent / تم إرسال الإذاعة
            </DialogTitle>
          </DialogHeader>
          {sendSummary && (
            <div className="space-y-4 pt-2">
              {/* Notification card preview */}
              <div className={`rounded-xl border-l-4 p-4 bg-white dark:bg-slate-900 shadow-sm ${getPriority(sendSummary.priority).border}`}>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-violet-100 dark:bg-violet-900/40 rounded-lg shrink-0">
                    <Megaphone className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{sendSummary.titleEn}</p>
                    {sendSummary.titleAr && sendSummary.titleAr !== sendSummary.titleEn && (
                      <p className="text-sm font-medium text-slate-500 mt-0.5" dir="rtl">{sendSummary.titleAr}</p>
                    )}
                    <Badge className={`mt-2 text-xs border-0 ${getPriority(sendSummary.priority).badge}`}>
                      {sendSummary.priority.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{sendSummary.sent}</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">Recipients / المستلمون</p>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{sendSummary.fcm?.sent ?? 0}</p>
                  <p className="text-xs text-blue-700 dark:text-blue-400">Mobile pushed / الجوال</p>
                </div>
              </div>

              {sendSummary.fcm && (
                <div className={`rounded-lg p-3 text-xs flex items-start gap-2 ${sendSummary.fcm.error ? 'bg-red-50 text-red-700 border border-red-200' : sendSummary.fcm.tokens === 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                  <Smartphone className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {sendSummary.fcm.error
                      ? `Mobile push failed: ${sendSummary.fcm.error}`
                      : sendSummary.fcm.tokens === 0
                        ? 'No mobile devices registered — users will see the in-app notification.'
                        : `${sendSummary.fcm.tokens} devices targeted · ${sendSummary.fcm.sent} delivered${sendSummary.fcm.failed > 0 ? ` · ${sendSummary.fcm.failed} failed` : ''}`
                    }
                  </span>
                </div>
              )}

              {sendSummary.whatsapp && (
                <div className={`rounded-lg p-3 text-xs flex items-start gap-2 ${sendSummary.whatsapp.error ? 'bg-red-50 text-red-700 border border-red-200' : sendSummary.whatsapp.skipped ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                  <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {sendSummary.whatsapp.error
                      ? `WhatsApp failed: ${sendSummary.whatsapp.error}`
                      : sendSummary.whatsapp.skipped
                        ? 'WhatsApp: no phone numbers on file for matched recipients.'
                        : `WhatsApp: ${sendSummary.whatsapp.sent} delivered${sendSummary.whatsapp.failed > 0 ? ` · ${sendSummary.whatsapp.failed} failed` : ''} of ${sendSummary.whatsapp.total} targeted`
                    }
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" onClick={() => { setShowSuccessModal(false); setActiveTab('feed'); loadHistory(); }}>
                  <Rss className="w-4 h-4 mr-2" /> View Feed
                </Button>
                <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => setShowSuccessModal(false)}>
                  New Broadcast
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirmation / Preview Modal ─────────────────────────────── */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-violet-600" />
              Confirm Broadcast / تأكيد الإرسال
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* Notification preview */}
            <div className={`rounded-xl border-l-4 ${getPriority(priority).border} bg-slate-50 dark:bg-slate-900 p-4 space-y-2`}>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-violet-100 dark:bg-violet-900/40 rounded-lg shrink-0">
                  <Megaphone className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-bold text-sm">{titleEn}</p>
                    <Badge className={`text-[10px] border-0 ${getPriority(priority).badge}`}>{priority.toUpperCase()}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{messageEn}</p>
                  {titleAr && <p className="text-sm font-semibold mt-2 text-right" dir="rtl">{titleAr}</p>}
                  {messageAr && <p className="text-xs text-muted-foreground mt-1 text-right" dir="rtl">{messageAr}</p>}
                  {actionLink && <p className="text-xs text-violet-500 mt-2 flex items-center gap-1"><LinkIcon className="w-3 h-3" />{actionLink}</p>}
                </div>
              </div>
            </div>

            {/* Recipients */}
            <div className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-violet-500" />Recipients / المستلمون</p>
                <Badge className="bg-violet-100 text-violet-700 border-0 text-base font-bold px-3">{confirmTargetUsers.length}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {audience === 'by_state' ? `State: ${stateFilter}` : getAudience(audience).labelEn}
                {sendEmail && <span className="ml-2 text-blue-500">· Email enabled</span>}
              </div>
              {/* Role breakdown */}
              {(() => {
                const byRole: Record<string, number> = {};
                confirmTargetUsers.forEach(u => { byRole[u.role || 'unknown'] = (byRole[u.role || 'unknown'] || 0) + 1; });
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(byRole).map(([r, c]) => (
                      <span key={r} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full px-2 py-0.5 font-medium capitalize">{r}: {c}</span>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowConfirmModal(false)}>
                Cancel / إلغاء
              </Button>
              <Button type="button" className="flex-1 bg-violet-600 hover:bg-violet-700 text-white gap-2" onClick={handleConfirmedSend} disabled={sending}>
                {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send to {confirmTargetUsers.length} users
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-gradient-to-r from-violet-700 to-purple-700 dark:from-violet-800 dark:to-purple-900 text-white p-6 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/15 backdrop-blur rounded-xl">
              <Radio className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Broadcast Center</h1>
              <p className="text-violet-200 text-sm mt-0.5">مركز الإذاعة — Send bilingual updates to your field team</p>
            </div>
          </div>
          {stats && (
            <div className="grid grid-cols-3 gap-3 mt-5">
              {[
                { label: 'Total Sent', labelAr: 'إجمالي المرسل', value: stats.total, icon: <Send className="w-4 h-4" /> },
                { label: 'Recipients', labelAr: 'المستلمون', value: userCount ?? '—', icon: <Users className="w-4 h-4" /> },
                { label: 'This Quarter', labelAr: 'هذا الربع', value: history.filter(h => new Date(h.created_at) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)).length, icon: <TrendingUp className="w-4 h-4" /> },
              ].map(s => (
                <div key={s.label} className="bg-white/10 backdrop-blur rounded-xl p-3">
                  <div className="flex items-center gap-2 text-violet-200 text-xs mb-1">{s.icon}{s.label}</div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-violet-300 text-xs">{s.labelAr}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Tab Bar ──────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-white dark:bg-slate-900 rounded-xl p-1.5 shadow-sm border">
          {[
            { id: 'compose', icon: <MessageSquare className="w-4 h-4" />, label: 'Compose', labelAr: 'كتابة' },
            { id: 'feed', icon: <Rss className="w-4 h-4" />, label: 'Broadcasts Feed', labelAr: 'سجل الإرسال' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-violet-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span className={`text-xs font-normal ${activeTab === tab.id ? 'text-violet-200' : 'text-slate-400'}`}>/ {tab.labelAr}</span>
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════
            COMPOSE TAB
        ════════════════════════════════════════════════════════════ */}
        {activeTab === 'compose' && (
          <div className="space-y-5">

            {/* Quick Templates */}
            <Card className="border-violet-200 dark:border-violet-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-violet-500" />
                  Quick Templates / قوالب سريعة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {QUICK_TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => applyTemplate(t)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-400 transition-all text-center"
                    >
                      <span className="text-2xl">{t.icon}</span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{t.label}</span>
                      <span className="text-[10px] text-slate-500">{t.labelAr}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Compose Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-violet-500" />
                  Compose Message / كتابة الرسالة
                </CardTitle>
                <CardDescription>Write your broadcast in both English and Arabic for full bilingual reach.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">

                {/* Titles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <span className="text-base">🇬🇧</span> Title (English) <span className="text-red-500">*</span>
                    </Label>
                    <Input value={titleEn} onChange={e => setTitleEn(e.target.value)} placeholder="Enter notification title..." maxLength={120} />
                    <p className={`text-xs text-right font-medium ${titleEn.length > 114 ? 'text-red-500' : titleEn.length > 96 ? 'text-amber-500' : 'text-muted-foreground'}`}>{titleEn.length}/120</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <span className="text-base">🇸🇩</span> العنوان (عربي)
                    </Label>
                    <Input value={titleAr} onChange={e => setTitleAr(e.target.value)} placeholder="أدخل عنوان الإشعار..." dir="rtl" maxLength={120} />
                    <p className={`text-xs text-right font-medium ${titleAr.length > 114 ? 'text-red-500' : titleAr.length > 96 ? 'text-amber-500' : 'text-muted-foreground'}`}>{titleAr.length}/120</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <span className="text-base">🇬🇧</span> Message (English) <span className="text-red-500">*</span>
                    </Label>
                    <Textarea value={messageEn} onChange={e => setMessageEn(e.target.value)} placeholder="Enter your message..." rows={5} maxLength={600} />
                    <p className={`text-xs text-right font-medium ${messageEn.length > 570 ? 'text-red-500' : messageEn.length > 480 ? 'text-amber-500' : 'text-muted-foreground'}`}>{messageEn.length}/600</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <span className="text-base">🇸🇩</span> الرسالة (عربي)
                    </Label>
                    <Textarea value={messageAr} onChange={e => setMessageAr(e.target.value)} placeholder="أدخل رسالتك..." rows={5} dir="rtl" maxLength={600} />
                    <p className={`text-xs text-right font-medium ${messageAr.length > 570 ? 'text-red-500' : messageAr.length > 480 ? 'text-amber-500' : 'text-muted-foreground'}`}>{messageAr.length}/600</p>
                  </div>
                </div>

                {/* Action Link */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    <LinkIcon className="w-3.5 h-3.5 text-muted-foreground" /> Action Link <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input value={actionLink} onChange={e => setActionLink(e.target.value)} placeholder="/settings?tab=profile or https://..." />
                  <p className="text-xs text-muted-foreground">رابط إجراء — Users will be directed here when they tap the notification.</p>
                </div>
              </CardContent>
            </Card>

            {/* Delivery Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-violet-500" />
                  Delivery Settings / إعدادات الإرسال
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* Audience */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" /> Target Audience / الجمهور المستهدف
                    </Label>
                    <Select value={audience} onValueChange={setAudience}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIENCE_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>
                            <span className="flex items-center gap-2">
                              <span>{o.icon}</span>
                              <span>{o.labelEn}</span>
                              <span className="text-muted-foreground">/ {o.labelAr}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {userCount !== null && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {audience === 'no_bank_account'
                          ? `Up to ${userCount} users (filtered at send time)`
                          : audience === 'by_state' && !stateFilter
                            ? 'Select a state below'
                            : audience === 'by_hub' && !hubFilter
                              ? 'Select a hub below'
                              : audience === 'by_locality' && !localityFilter
                                ? 'Select a locality below'
                                : `~${userCount} user(s) will receive this`}
                      </p>
                    )}
                    {/* By State filter */}
                    {audience === 'by_state' && (
                      <div className="mt-2">
                        <Select value={stateFilter} onValueChange={setStateFilter}>
                          <SelectTrigger className="border-violet-300">
                            <SelectValue placeholder="Select Sudan state / اختر الولاية..." />
                          </SelectTrigger>
                          <SelectContent>
                            {SUDAN_STATES.map(s => (
                              <SelectItem key={s} value={s}>
                                <span className="flex items-center gap-2"><MapPin className="w-3 h-3 text-violet-400" />{s}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {/* By Hub filter */}
                    {audience === 'by_hub' && (
                      <div className="mt-2">
                        <Select value={hubFilter} onValueChange={setHubFilter}>
                          <SelectTrigger className="border-violet-300">
                            <SelectValue placeholder="Select hub / اختر المركز..." />
                          </SelectTrigger>
                          <SelectContent>
                            {allHubs.map(h => (
                              <SelectItem key={h} value={h}>
                                <span className="flex items-center gap-2">🏢 {h}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {/* By Locality filter */}
                    {audience === 'by_locality' && (
                      <div className="mt-2 space-y-1.5">
                        <Input
                          placeholder="Search locality / ابحث عن المحلية..."
                          value={localityFilter}
                          onChange={e => setLocalityFilter(e.target.value)}
                          className="border-violet-300 text-sm"
                        />
                        {localityFilter && (
                          <div className="border rounded-lg max-h-40 overflow-y-auto bg-background shadow-sm">
                            {allLocalities.filter(l => l.toLowerCase().includes(localityFilter.toLowerCase())).slice(0, 20).map(l => (
                              <button
                                key={l}
                                type="button"
                                onClick={() => setLocalityFilter(l)}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2 ${localityFilter === l ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 font-medium' : ''}`}
                              >
                                🗺️ {l}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Specific Users picker */}
                    {audience === 'specific_users' && (
                      <div className="mt-2 space-y-1.5">
                        {specificUserIds.length > 0 && (
                          <div className="flex flex-wrap gap-1 p-2 border rounded-lg bg-muted/30">
                            {specificUserIds.map(uid => {
                              const u = allUsers.find(x => x.id === uid);
                              return (
                                <span key={uid} className="inline-flex items-center gap-1 text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 rounded-full px-2 py-0.5">
                                  {u?.full_name || u?.email || uid.slice(0, 8)}
                                  <button type="button" onClick={() => setSpecificUserIds(prev => prev.filter(id => id !== uid))} className="hover:text-red-500 ml-0.5">×</button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        <Input
                          placeholder="Search by name or email / ابحث بالاسم أو البريد..."
                          value={userSearch}
                          onChange={e => setUserSearch(e.target.value)}
                          className="border-violet-300 text-sm"
                        />
                        {userSearch && (
                          <div className="border rounded-lg max-h-48 overflow-y-auto bg-background shadow-sm">
                            {allUsers
                              .filter(u => !specificUserIds.includes(u.id) && (
                                u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
                                u.email?.toLowerCase().includes(userSearch.toLowerCase())
                              ))
                              .slice(0, 20)
                              .map(u => (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => { setSpecificUserIds(prev => [...prev, u.id]); setUserSearch(''); }}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2 border-b last:border-0"
                                >
                                  <span>
                                    <span className="font-medium">{u.full_name || 'Unknown'}</span>
                                    {u.email && <span className="text-muted-foreground ml-1.5">{u.email}</span>}
                                  </span>
                                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5 capitalize shrink-0">{u.role}</span>
                                </button>
                              ))}
                            {allUsers.filter(u => !specificUserIds.includes(u.id) && (u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase()))).length === 0 && (
                              <p className="text-xs text-muted-foreground text-center py-3">No users found</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Priority */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-muted-foreground" /> Priority / الأولوية
                    </Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>
                            <span className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${o.dot}`} />
                              <span>{o.labelEn}</span>
                              <span className="text-muted-foreground">/ {o.labelAr}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3.5 rounded-xl border bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">Send by Email / إرسال بالبريد الإلكتروني</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Also deliver via IONOS SMTP to each recipient</p>
                    </div>
                    <Switch checked={sendEmail} onCheckedChange={setSendEmail} data-testid="toggle-send-email" />
                  </div>
                  <div className="flex items-center justify-between p-3.5 rounded-xl border bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                        Also send on WhatsApp / إرسال عبر واتساب
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Send a WhatsApp message to all matched recipients with phone numbers on file</p>
                    </div>
                    <Switch checked={sendWhatsApp} onCheckedChange={setSendWhatsApp} data-testid="toggle-send-whatsapp" />
                  </div>
                  <div className="flex items-center justify-between p-3.5 rounded-xl border bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">Require Read Confirmation / تأكيد القراءة</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Track who has explicitly confirmed reading — يتتبع من أكد القراءة</p>
                    </div>
                    <Switch checked={requireAck} onCheckedChange={setRequireAck} />
                  </div>
                </div>

                {/* Schedule */}
                <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-violet-500" />
                    <p className="text-sm font-medium">Schedule Broadcast / جدولة الإرسال</p>
                    <span className="text-xs text-muted-foreground">(optional)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Pick a future date & time — the broadcast fires automatically while this tab is open.</p>
                  <div className="flex gap-2">
                    <input
                      type="datetime-local"
                      value={scheduleAt}
                      onChange={e => setScheduleAt(e.target.value)}
                      min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                      className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    {scheduleAt && (
                      <Button type="button" variant="outline" size="sm" onClick={handleSchedule} className="gap-1.5 shrink-0 border-violet-300 text-violet-700 hover:bg-violet-50">
                        <CalendarClock className="w-4 h-4" /> Queue
                      </Button>
                    )}
                  </div>
                  {scheduledDrafts.length > 0 && (
                    <div className="space-y-1.5 mt-2 pt-2 border-t">
                      <p className="text-xs font-semibold text-violet-600">Scheduled ({scheduledDrafts.length})</p>
                      {scheduledDrafts.map(d => (
                        <div key={d.id} className="flex items-center justify-between gap-2 text-xs bg-violet-50 dark:bg-violet-900/20 rounded-lg px-3 py-2">
                          <span className="font-medium truncate flex-1">{d.titleEn}</span>
                          <span className="text-muted-foreground shrink-0">{format(new Date(d.scheduleAt), 'MMM dd HH:mm')}</span>
                          <button type="button" onClick={() => removeScheduledDraft(d.id)} className="text-red-400 hover:text-red-600 transition-colors shrink-0">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Live Preview */}
            {(titleEn || messageEn) && (
              <Card className="border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Eye className="w-4 h-4 text-violet-500" /> Live Preview / معاينة مباشرة
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Notification card mockup */}
                  <div className={`rounded-xl border-l-4 ${selectedPriority.border} bg-white dark:bg-slate-900 shadow-md p-4 space-y-2`}>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-violet-100 dark:bg-violet-900/40 rounded-lg shrink-0">
                        <Megaphone className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="font-bold text-sm">{titleEn || '—'}</p>
                          <Badge className={`text-[10px] border-0 ${selectedPriority.badge}`}>{priority.toUpperCase()}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{messageEn || '—'}</p>
                        {titleAr && <p className="text-sm font-semibold mt-2 text-right" dir="rtl">{titleAr}</p>}
                        {messageAr && <p className="text-xs text-muted-foreground mt-1 text-right leading-relaxed" dir="rtl">{messageAr}</p>}
                        {actionLink && (
                          <p className="text-xs text-violet-500 flex items-center gap-1 mt-2">
                            <LinkIcon className="w-3 h-3" /> {actionLink}
                          </p>
                        )}
                        {requireAck && (
                          <div className="mt-3 pt-2 border-t flex items-center gap-2">
                            <div className="flex-1 text-xs text-slate-500">Read this announcement? / قرأت هذا الإعلان؟</div>
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500 text-white rounded-full text-xs font-semibold cursor-default">
                              <CheckCheck className="w-3 h-3" /> Confirm Read
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <div className={`w-2 h-2 rounded-full ${selectedPriority.dot}`} />
                      <p className="text-[10px] text-muted-foreground">WFP TPM · {selectedAudience.icon} {selectedAudience.labelEn} · Just now</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Draft restored banner */}
            {draftRestored && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                  <Save className="w-4 h-4 shrink-0" />
                  <span>Draft restored from your last session / تم استعادة المسودة من جلستك السابقة</span>
                </div>
                <button type="button" onClick={clearDraft} className="flex items-center gap-1 text-xs text-amber-600 hover:text-red-600 font-semibold transition-colors shrink-0">
                  <Trash2 className="w-3.5 h-3.5" /> Discard
                </button>
              </div>
            )}

            {/* Send actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleTestSend}
                disabled={testSending || !titleEn.trim() || !messageEn.trim()}
                className="flex items-center gap-2 px-5 h-14 rounded-xl font-semibold text-sm border-2 border-violet-300 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                title="Send only to yourself to preview before going live"
              >
                {testSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                <span className="hidden sm:inline">Test Send</span>
              </button>

              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !titleEn.trim() || !messageEn.trim()}
                className={`flex-1 h-14 rounded-xl text-white font-bold text-base flex items-center justify-center gap-3 transition-all shadow-lg ${
                  sending || !titleEn.trim() || !messageEn.trim()
                    ? 'bg-violet-400 cursor-not-allowed opacity-70'
                    : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 cursor-pointer shadow-violet-500/30'
                }`}
              >
                {sending ? (
                  <><RefreshCw className="w-5 h-5 animate-spin" /> Loading... / جارٍ التحميل</>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Review & Send · مراجعة وإرسال
                    {userCount !== null && <span className="ml-1 bg-white/20 rounded-full px-2 py-0.5 text-sm font-normal">{userCount}</span>}
                  </>
                )}
              </button>
            </div>

          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            FEED TAB
        ════════════════════════════════════════════════════════════ */}
        {activeTab === 'feed' && (
          <div className="space-y-4">

            {/* Feed Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Rss className="w-5 h-5 text-violet-500" /> Broadcasts Feed
                </h2>
                <p className="text-sm text-muted-foreground">سجل الإرسال — All broadcasts from the last 90 days</p>
              </div>
              <Button variant="outline" size="sm" onClick={loadHistory} disabled={historyLoading} className="gap-2">
                <RotateCcw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {historyLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-violet-400" />
                <p className="text-sm text-muted-foreground">Loading broadcasts...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Megaphone className="w-8 h-8 text-violet-400" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No broadcasts sent yet / لم يُرسَل أي إذاعة بعد</p>
                <Button className="mt-4" variant="outline" size="sm" onClick={() => setActiveTab('compose')}>
                  <Send className="w-4 h-4 mr-2" /> Send your first broadcast
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item, idx) => {
                  const bid = item.broadcast_id;
                  const isOpen = openReceiptId === bid;
                  const total = item.recipient_count || 0;
                  const receiptList = bid ? receipts[bid] : null;
                  const isLoadingReceipts = bid ? receiptsLoading[bid] : false;
                  const readCount = receiptList ? receiptList.filter(r => r.isRead).length : null;
                  const readPct = readCount !== null && total > 0 ? Math.round((readCount / total) * 100) : null;
                  const prio = getPriority(item.priority);

                  return (
                    <div key={item.id + idx} className="bg-white dark:bg-slate-900 rounded-2xl border shadow-sm overflow-hidden">
                      {/* Priority stripe + content */}
                      <div className={`border-l-4 ${prio.border} p-4`}>
                        <div className="flex items-start gap-3">

                          {/* Icon */}
                          <div className="p-2.5 bg-violet-100 dark:bg-violet-900/40 rounded-xl shrink-0 mt-0.5">
                            <Megaphone className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                          </div>

                          {/* Main content */}
                          <div className="flex-1 min-w-0">

                            {/* Title row */}
                            <div className="flex items-start gap-2 flex-wrap">
                              <p className="font-bold text-sm flex-1">{item.title}</p>
                              <Badge className={`text-[10px] border-0 shrink-0 ${prio.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${prio.dot} inline-block mr-1`} />
                                {item.priority.toUpperCase()}
                              </Badge>
                            </div>

                            {/* Arabic title */}
                            {item.title_ar && item.title_ar !== item.title && (
                              <p className="text-sm font-semibold text-slate-500 mt-0.5 text-right" dir="rtl">{item.title_ar}</p>
                            )}

                            {/* Message */}
                            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{item.message}</p>
                            {item.message_ar && item.message_ar !== item.message && (
                              <p className="text-xs text-muted-foreground mt-1 text-right leading-relaxed line-clamp-2" dir="rtl">{item.message_ar}</p>
                            )}

                            {/* Metadata */}
                            <div className="flex items-center gap-3 mt-2.5 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {item.created_at ? format(new Date(item.created_at), 'MMM dd, yyyy · HH:mm') : '—'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {total} recipients
                              </span>
                              {readCount !== null ? (
                                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                  <CheckCheck className="w-3 h-3" />
                                  {readCount}/{total} confirmed ({readPct}%)
                                </span>
                              ) : bid && (
                                <span className="flex items-center gap-1 text-violet-400">
                                  <Eye className="w-3 h-3" /> Click receipts to load
                                </span>
                              )}
                              {(item.whatsapp_sent !== undefined || item.whatsapp_failed !== undefined) && (
                                <span
                                  data-testid={`badge-whatsapp-${item.id}`}
                                  className={`flex items-center gap-1 font-medium rounded-full px-2 py-0.5 ${
                                    (item.whatsapp_failed ?? 0) > 0 && (item.whatsapp_sent ?? 0) === 0
                                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                      : (item.whatsapp_failed ?? 0) > 0
                                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                        : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  WhatsApp: {item.whatsapp_sent ?? 0} sent
                                  {(item.whatsapp_failed ?? 0) > 0 && (
                                    <span className="text-red-500 dark:text-red-400">· {item.whatsapp_failed} failed</span>
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Read progress bar */}
                            {readPct !== null && total > 0 && (
                              <div className="mt-2.5">
                                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${readPct === 100 ? 'bg-emerald-500' : readPct >= 50 ? 'bg-blue-400' : 'bg-amber-400'}`}
                                    style={{ width: `${readPct}%` }}
                                  />
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">{readPct}% read confirmation rate</p>
                              </div>
                            )}
                          </div>

                          {/* Toggle button */}
                          {bid && (
                            <button
                              onClick={() => toggleReceipts(item)}
                              className="flex flex-col items-center gap-0.5 text-[10px] text-violet-500 hover:text-violet-700 font-semibold shrink-0 mt-0.5 transition-colors"
                            >
                              <UserCheck className="w-4 h-4" />
                              <span>Receipts</span>
                              {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expandable receipts panel */}
                      {isOpen && bid && (
                        <div className="border-t bg-slate-50 dark:bg-slate-950/60 p-4">
                          {isLoadingReceipts ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3 justify-center">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading receipt data...
                            </div>
                          ) : !receiptList || receiptList.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-3 text-center">No receipt data for this broadcast.</p>
                          ) : (
                            <>
                              {/* Receipt summary bar */}
                              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold rounded-full px-3 py-1">
                                    <CheckCheck className="w-3 h-3" />
                                    {receiptList.filter(r => r.isRead).length} confirmed / تم التأكيد
                                  </div>
                                  <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold rounded-full px-3 py-1">
                                    <UserX className="w-3 h-3" />
                                    {receiptList.filter(r => !r.isRead).length} pending / في الانتظار
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => refreshReceipts(bid)} disabled={isLoadingReceipts} title="Refresh" className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                                    <RotateCcw className={`w-3.5 h-3.5 ${isLoadingReceipts ? 'animate-spin' : ''}`} />
                                  </button>
                                  <button onClick={() => exportReceiptsCSV(item, bid)} title="Export CSV" className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                                    <Download className="w-3.5 h-3.5" /> CSV
                                  </button>
                                  {receiptList.some(r => !r.isRead) && (
                                    <button
                                      onClick={() => resendToUnread(item, bid)}
                                      disabled={resendingId === bid}
                                      className="flex items-center gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg px-3 py-1.5 font-semibold transition-colors"
                                    >
                                      {resendingId === bid
                                        ? <><RefreshCw className="w-3 h-3 animate-spin" /> Sending...</>
                                        : <><SendHorizonal className="w-3 h-3" /> Re-send to {receiptList.filter(r => !r.isRead).length} unread</>
                                      }
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* User list */}
                              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                {receiptList.map(r => (
                                  <div key={r.userId} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs transition-colors ${r.isRead ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800' : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800'}`}>
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${r.isRead ? 'bg-emerald-100 dark:bg-emerald-800' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                      {r.isRead
                                        ? <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                        : <UserX className="w-3.5 h-3.5 text-slate-400" />
                                      }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold truncate">{r.name}</p>
                                      <p className="text-muted-foreground capitalize">{r.role}</p>
                                    </div>
                                    {r.isRead && r.readAt ? (
                                      <div className="text-right shrink-0">
                                        <p className="text-emerald-600 dark:text-emerald-400 font-medium">Confirmed ✓</p>
                                        <p className="text-muted-foreground">{format(new Date(r.readAt), 'MMM dd, HH:mm')}</p>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 shrink-0 bg-slate-100 dark:bg-slate-700 rounded-full px-2 py-0.5">Pending</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
