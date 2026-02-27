import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Megaphone, Send, Clock, Users, AlertCircle, CheckCircle2,
  RefreshCw, Info, Bell, Link as LinkIcon, Shield, Eye, UserCheck, UserX, ChevronDown, ChevronUp,
  Download, RotateCcw, SendHorizonal, Smartphone
} from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { format } from 'date-fns';

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All Users / جميع المستخدمين' },
  { value: 'no_bank_account', label: 'Users without bank account / مستخدمون بدون حساب بنكي' },
  { value: 'data_collector', label: 'Data Collectors / جامعو البيانات' },
  { value: 'coordinator', label: 'Coordinators / المنسقون' },
  { value: 'supervisor', label: 'Supervisors / المشرفون' },
  { value: 'admin', label: 'Admins / المدراء' },
  { value: 'financialadmin', label: 'Financial Admins / المدراء الماليون' },
];

const PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal / عادي', color: 'bg-slate-100 text-slate-700' },
  { value: 'high', label: 'High / عالي', color: 'bg-amber-100 text-amber-700' },
  { value: 'urgent', label: 'Urgent / عاجل', color: 'bg-red-100 text-red-700' },
];

const QUICK_TEMPLATES = [
  {
    id: 'bank_account',
    label: 'Bank Account Reminder',
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
    label: 'New Feature Announcement',
    titleEn: 'New Feature Available',
    titleAr: 'ميزة جديدة متاحة',
    messageEn: 'A new feature has been added to the platform. Please check it out.',
    messageAr: 'تمت إضافة ميزة جديدة إلى المنصة. يرجى الاطلاع عليها.',
    link: '',
    audience: 'all',
    priority: 'normal',
  },
];

type BroadcastHistory = {
  id: string;
  broadcast_id: string | null;
  title: string;
  message: string;
  created_at: string;
  event_type: string;
  priority: string;
  recipient_count?: number;
  read_count?: number;
};

type ReceiptUser = {
  userId: string;
  name: string;
  role: string;
  isRead: boolean;
  readAt: string | null;
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
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; audience: string } | null>(null);

  const [history, setHistory] = useState<BroadcastHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('compose');
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, ReceiptUser[]>>({});
  const [receiptsLoading, setReceiptsLoading] = useState<Record<string, boolean>>({});
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [userCount, setUserCount] = useState<number | null>(null);
  const [fcmResult, setFcmResult] = useState<{ sent: number; failed: number; tokens: number; error?: string } | null>(null);
  const [fcmTesting, setFcmTesting] = useState(false);

  const role = (currentUser?.role || '').toLowerCase();
  const isAdmin = ['admin', 'superadmin', 'ict', 'financialadmin'].includes(role);

  useEffect(() => {
    if (activeTab === 'history') loadHistory();
  }, [activeTab]);

  useEffect(() => {
    loadUserCount();
  }, [audience]);

  const loadUserCount = async () => {
    try {
      let query = supabase.from('profiles').select('id', { count: 'exact', head: true });
      if (audience === 'no_bank_account') {
        // Can't easily filter JSONB missing in count query, just show total
        const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).not('role', 'is', null);
        setUserCount(count ?? 0);
        return;
      }
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

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      // Minimal query — only metadata columns, no read-status fields.
      // Read counts are loaded on-demand when the user opens the Receipts panel.
      // Date window limits the scan to recent data only.
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('notifications')
        .select('id, title_en, message_en, created_at, priority, related_entity_id')
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
            message: n.message_en || '',
            created_at: n.created_at,
            event_type: 'broadcast',
            priority: n.priority,
            recipient_count: 1,
          };
        } else {
          grouped[key].recipient_count = (grouped[key].recipient_count || 1) + 1;
        }
      });

      setHistory(Object.values(grouped).sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ).slice(0, 30));
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadReceipts = async (broadcastId: string) => {
    if (receiptsLoading[broadcastId]) return;
    setReceiptsLoading(prev => ({ ...prev, [broadcastId]: true }));
    try {
      // Select all three read-signal columns — the standard mark-as-read path sets
      // status='read' + read_at, while the acknowledgment hook also sets is_read=true
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

      const receiptList: ReceiptUser[] = notifs.map(n => {
        // A notification is considered read if ANY of the three signals is set
        const isRead = n.is_read === true || n.status === 'read' || !!n.read_at;
        return {
          userId: n.user_id,
          name: profileMap[n.user_id]?.full_name || n.user_id?.slice(0, 8) || 'Unknown',
          role: profileMap[n.user_id]?.role || '—',
          isRead,
          readAt: n.read_at || null,
        };
      });

      // Sort: read first (by readAt desc), then unread alphabetically
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
      // Fetch original Arabic content from one of the existing notifications
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
        title_ar: orig?.title_ar || item.title,
        message_en: item.message,
        message_ar: orig?.message_ar || item.message,
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

      // FCM push to mobile devices for re-sent broadcast
      const resendFcmPriority = item.priority === 'urgent' || item.priority === 'high' ? 'high' : 'normal';
      const resendTitleAr = orig?.title_ar && orig.title_ar !== item.title ? ` | ${orig.title_ar}` : '';
      const resendBodyAr  = orig?.message_ar && orig.message_ar !== item.message ? `\n${orig.message_ar}` : '';
      supabase.functions.invoke('send-fcm-push', {
        body: {
          user_ids: unread.map(u => u.userId),
          title: `${item.title}${resendTitleAr}`,
          body:  `${item.message}${resendBodyAr}`,
          priority: resendFcmPriority,
          data: {
            type: 'broadcast',
            broadcast_id: broadcastId,
            action_url: orig?.action_url || '',
            priority: item.priority,
          },
        },
      }).catch(() => {});

      toast({
        title: 'Re-sent / أعيد الإرسال',
        description: `Re-sent to ${unread.length} user(s) who hadn't read it.`,
      });
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

  const handleSend = async () => {
    if (!titleEn.trim() || !messageEn.trim()) {
      toast({ title: 'Missing fields', description: 'Please fill in at least the English title and message.', variant: 'destructive' });
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      const { data: users } = await supabase
        .from('profiles')
        .select('id, bank_account, role')
        .not('role', 'is', null);

      if (!users) throw new Error('Could not load users');

      let targetUsers = users;
      if (audience === 'no_bank_account') {
        targetUsers = users.filter(u => {
          const ba = u.bank_account as any;
          return !ba?.accountNumber && !ba?.account_number;
        });
      } else if (audience !== 'all') {
        targetUsers = users.filter(u => (u.role || '').toLowerCase() === audience);
      }

      if (targetUsers.length === 0) {
        toast({ title: 'No recipients', description: 'No users match the selected audience.', variant: 'destructive' });
        setSending(false);
        return;
      }

      const now = new Date().toISOString();
      const broadcastId = crypto.randomUUID();
      const titleText = titleEn.trim();
      const titleArText = titleAr.trim() || titleText;
      const messageText = messageEn.trim();
      const messageArText = messageAr.trim() || messageText;
      const notifType = priority === 'urgent' ? 'error' : priority === 'high' ? 'warning' : 'info';
      const link = actionLink.trim() || null;

      // Single bulk insert — one DB call for all recipients
      const rows = targetUsers.map(u => ({
        recipient_id: u.id,
        user_id: u.id,
        title_en: titleText,
        title_ar: titleArText,
        message_en: messageText,
        message_ar: messageArText,
        priority: priority,
        action_url: link,
        related_entity_id: broadcastId,
        entity_type: 'broadcast_batch',
        event_type: 'broadcast',
        status: 'pending',
        email_sent: false,
        title: titleText,
        message: messageText,
        link: link,
        type: notifType,
        is_read: false,
        created_at: now,
      }));

      const { error: insertError } = await supabase.from('notifications').insert(rows);
      if (insertError) throw new Error(insertError.message);

      // Fire FCM push to all mobile devices — single batch call, awaited for diagnostics
      const fcmPriority = priority === 'urgent' || priority === 'high' ? 'high' : 'normal';
      setFcmResult(null);
      try {
        // Build bilingual FCM title/body — show both languages so all users understand
        const fcmTitle = titleAr.trim()
          ? `${titleText} | ${titleAr.trim()}`
          : titleText;
        const fcmBody = messageAr.trim()
          ? `${messageText}\n${messageAr.trim()}`
          : messageText;

        const { data: fcmData, error: fcmError } = await supabase.functions.invoke('send-fcm-push', {
          body: {
            user_ids: targetUsers.map(u => u.id),
            title: fcmTitle,
            body: fcmBody,
            priority: fcmPriority,
            data: {
              type: 'broadcast',
              broadcast_id: broadcastId,
              action_url: link || '',
              priority,
            },
            ...(link ? { action_url: link } : {}),
          },
        });
        if (fcmError) {
          console.error('[BROADCAST] FCM push error:', fcmError.message);
          setFcmResult({ sent: 0, failed: 0, tokens: 0, error: fcmError.message });
        } else {
          console.log('[BROADCAST] FCM push result:', fcmData);
          setFcmResult({
            sent: fcmData?.sent ?? 0,
            failed: fcmData?.failed ?? 0,
            tokens: fcmData?.tokens_targeted ?? 0,
            error: fcmData?.error,
          });
        }
      } catch (fcmEx: any) {
        console.error('[BROADCAST] FCM push threw:', fcmEx);
        setFcmResult({ sent: 0, failed: 0, tokens: 0, error: fcmEx?.message || 'Unknown error' });
      }

      const sent = targetUsers.length;
      setSendResult({ sent, audience });
      toast({
        title: 'Broadcast sent / تم الإرسال',
        description: `Notification delivered to ${sent} user(s).`,
      });

      // If email requested, send sequentially in the background (fire-and-forget)
      if (sendEmail) {
        (async () => {
          for (const u of targetUsers) {
            try {
              await NotificationTriggerService.send({
                userId: u.id,
                title: titleText,
                titleAr: titleArText,
                message: messageText,
                messageAr: messageArText,
                type: notifType as any,
                category: 'broadcast' as any,
                priority: priority as any,
                link: link || undefined,
                sendEmail: true,
              });
            } catch { /* ignore per-user email errors */ }
          }
        })();
      }

      // Clear form
      setTitleEn(''); setTitleAr('');
      setMessageEn(''); setMessageAr('');
      setActionLink('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to send broadcast.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
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

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-violet-600 rounded-xl">
          <Megaphone className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Broadcast Center</h1>
          <p className="text-muted-foreground text-sm">مركز الإذاعة — Send notifications to all users or specific groups</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="compose" className="gap-2">
            <Megaphone className="w-4 h-4" /> Compose
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2" onClick={loadHistory}>
            <Clock className="w-4 h-4" /> History
          </TabsTrigger>
        </TabsList>

        {/* COMPOSE TAB */}
        <TabsContent value="compose" className="space-y-4">

          {/* Quick Templates */}
          <Card className="border-dashed border-violet-300 dark:border-violet-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Bell className="w-4 h-4" /> Quick Templates / قوالب سريعة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {QUICK_TEMPLATES.map(t => (
                  <Button
                    key={t.id}
                    variant="outline"
                    size="sm"
                    onClick={() => applyTemplate(t)}
                    className="text-xs border-violet-300 dark:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Message Form */}
          <Card>
            <CardHeader>
              <CardTitle>Compose Message / كتابة الرسالة</CardTitle>
              <CardDescription>Write your message in both English and Arabic for full bilingual support.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Title (English) <span className="text-red-500">*</span></Label>
                  <Input
                    value={titleEn}
                    onChange={e => setTitleEn(e.target.value)}
                    placeholder="Enter notification title..."
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Title (Arabic) / العنوان بالعربية</Label>
                  <Input
                    value={titleAr}
                    onChange={e => setTitleAr(e.target.value)}
                    placeholder="أدخل عنوان الإشعار..."
                    dir="rtl"
                    maxLength={120}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Message (English) <span className="text-red-500">*</span></Label>
                  <Textarea
                    value={messageEn}
                    onChange={e => setMessageEn(e.target.value)}
                    placeholder="Enter your message..."
                    rows={4}
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground text-right">{messageEn.length}/500</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Message (Arabic) / الرسالة بالعربية</Label>
                  <Textarea
                    value={messageAr}
                    onChange={e => setMessageAr(e.target.value)}
                    placeholder="أدخل رسالتك..."
                    rows={4}
                    dir="rtl"
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground text-right">{messageAr.length}/500</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  <LinkIcon className="w-3.5 h-3.5" /> Action Link (optional)
                </Label>
                <Input
                  value={actionLink}
                  onChange={e => setActionLink(e.target.value)}
                  placeholder="/settings?tab=profile or https://..."
                />
                <p className="text-xs text-muted-foreground">Users will be directed here when they tap the notification.</p>
              </div>
            </CardContent>
          </Card>

          {/* Delivery Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Delivery Settings / إعدادات الإرسال</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    <Users className="w-4 h-4" /> Target Audience / الجمهور المستهدف
                  </Label>
                  <Select value={audience} onValueChange={setAudience}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIENCE_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {userCount !== null && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {audience === 'no_bank_account'
                        ? `Up to ${userCount} users (filtered at send time)`
                        : `~${userCount} user(s) will receive this`}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Priority / الأولوية</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <p className="text-sm font-medium">Also send by email</p>
                  <p className="text-xs text-muted-foreground">إرسال نسخة عبر البريد الإلكتروني أيضاً</p>
                </div>
                <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
              </div>
            </CardContent>
          </Card>

          {/* Send Result */}
          {sendResult && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-900/10 p-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Broadcast sent successfully / تم إرسال الإذاعة بنجاح
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  Delivered to <strong>{sendResult.sent}</strong> user(s) — <em>{AUDIENCE_OPTIONS.find(a => a.value === sendResult.audience)?.label}</em>
                </p>
              </div>
            </div>
          )}

          {/* FCM Push Result */}
          {fcmResult && (
            <div className={`rounded-lg border p-4 ${
              fcmResult.error
                ? 'border-red-300 bg-red-50 dark:bg-red-900/10'
                : fcmResult.tokens === 0
                  ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10'
                  : 'border-blue-300 bg-blue-50 dark:bg-blue-900/10'
            }`}>
              <div className="flex items-start gap-3">
                <Smartphone className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                  fcmResult.error ? 'text-red-500' : fcmResult.tokens === 0 ? 'text-amber-500' : 'text-blue-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    fcmResult.error ? 'text-red-700 dark:text-red-300' : fcmResult.tokens === 0 ? 'text-amber-700 dark:text-amber-300' : 'text-blue-700 dark:text-blue-300'
                  }`}>
                    {fcmResult.error
                      ? 'Mobile push failed / فشل الإشعار للجوال'
                      : fcmResult.tokens === 0
                        ? 'No mobile devices registered / لا أجهزة مسجلة'
                        : `Mobile push sent / أُرسل للجوال`}
                  </p>
                  {fcmResult.error ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-all font-mono">{fcmResult.error}</p>
                  ) : fcmResult.tokens === 0 ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                      None of the selected users have a registered mobile device. They will still see the in-app notification when they open the web app.
                    </p>
                  ) : (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                      {fcmResult.tokens} device(s) targeted — <strong>{fcmResult.sent}</strong> delivered
                      {fcmResult.failed > 0 && <>, <strong>{fcmResult.failed}</strong> failed (stale tokens auto-cleaned)</>}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Send Button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !titleEn.trim() || !messageEn.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              height: '48px',
              backgroundColor: sending || !titleEn.trim() || !messageEn.trim() ? '#a78bfa' : '#7c3aed',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: sending || !titleEn.trim() || !messageEn.trim() ? 'not-allowed' : 'pointer',
              opacity: sending || !titleEn.trim() || !messageEn.trim() ? 0.7 : 1,
            }}
          >
            {sending ? (
              <><RefreshCw className="w-5 h-5 animate-spin" /> Sending broadcast...</>
            ) : (
              <><Send className="w-5 h-5" /> Send Broadcast to {AUDIENCE_OPTIONS.find(a => a.value === audience)?.label.split('/')[0].trim()}</>
            )}
          </button>

          {/* Preview */}
          {(titleEn || messageEn) && (
            <Card className="border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Info className="w-4 h-4" /> Preview / معاينة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <p className="font-semibold text-sm">{titleEn || '—'}</p>
                    {priority !== 'normal' && (
                      <Badge className={PRIORITY_OPTIONS.find(p => p.value === priority)?.color + ' text-xs border-0'}>
                        {priority.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{messageEn || '—'}</p>
                  {titleAr && <p className="text-sm font-semibold text-right" dir="rtl">{titleAr}</p>}
                  {messageAr && <p className="text-xs text-muted-foreground text-right" dir="rtl">{messageAr}</p>}
                  {actionLink && (
                    <p className="text-xs text-blue-500 flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" /> {actionLink}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-violet-500" />
                  Recent Broadcasts / الإرسالات الأخيرة
                </CardTitle>
                <button
                  onClick={loadHistory}
                  disabled={historyLoading}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              <CardDescription>History of broadcast notifications sent from this system.</CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading history...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Megaphone className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No broadcasts sent yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((item, idx) => {
                    const bid = item.broadcast_id;
                    const isOpen = openReceiptId === bid;
                    const total = item.recipient_count || 0;
                    const receiptList = bid ? receipts[bid] : null;
                    const isLoadingReceipts = bid ? receiptsLoading[bid] : false;
                    // Read counts come from the on-demand receipts query
                    const readCount = receiptList ? receiptList.filter(r => r.isRead).length : null;
                    const readPct = readCount !== null && total > 0 ? Math.round((readCount / total) * 100) : null;

                    return (
                      <div key={item.id + idx} className="rounded-lg border overflow-hidden">
                        {/* Broadcast header row */}
                        <div className="flex items-start gap-3 p-4">
                          <Megaphone className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{item.title}</p>
                              <Badge variant="outline" className={
                                item.priority === 'urgent' ? 'border-red-300 text-red-600 text-[10px]' :
                                item.priority === 'high' ? 'border-amber-300 text-amber-600 text-[10px]' :
                                'text-[10px]'
                              }>
                                {item.priority}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.message}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {item.created_at ? format(new Date(item.created_at), 'MMM dd, yyyy HH:mm') : '—'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {total} sent
                              </span>
                              {readCount !== null ? (
                                <span className="flex items-center gap-1 text-emerald-600">
                                  <UserCheck className="w-3 h-3" />
                                  {readCount} read ({readPct}%)
                                </span>
                              ) : (
                                bid && (
                                  <span className="flex items-center gap-1 text-violet-400">
                                    <Eye className="w-3 h-3" />
                                    Open receipts to see reads
                                  </span>
                                )
                              )}
                            </div>
                            {/* Progress bar — only shown after receipts are loaded */}
                            {readPct !== null && total > 0 && (
                              <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-400 rounded-full transition-all"
                                  style={{ width: `${readPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                          {/* View receipts button */}
                          {bid && (
                            <button
                              onClick={() => toggleReceipts(item)}
                              className="flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 font-medium shrink-0 mt-0.5"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              {isOpen ? 'Hide' : 'Receipts'}
                              {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          )}
                        </div>

                        {/* Expandable receipts panel */}
                        {isOpen && bid && (
                          <div className="border-t bg-slate-50 dark:bg-slate-900/40 p-4">
                            {isLoadingReceipts ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading receipts...
                              </div>
                            ) : !receiptList || receiptList.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">No receipt data available for this broadcast.</p>
                            ) : (
                              <div>
                                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                    {receiptList.filter(r => r.isRead).length} of {receiptList.length} acknowledged
                                  </p>
                                  <div className="flex items-center gap-2">
                                    {/* Refresh receipts */}
                                    <button
                                      onClick={() => refreshReceipts(bid)}
                                      disabled={isLoadingReceipts}
                                      title="Refresh"
                                      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 transition-colors"
                                    >
                                      <RotateCcw className={`w-3 h-3 ${isLoadingReceipts ? 'animate-spin' : ''}`} />
                                    </button>
                                    {/* Export CSV */}
                                    <button
                                      onClick={() => exportReceiptsCSV(item, bid)}
                                      title="Export CSV"
                                      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 transition-colors"
                                    >
                                      <Download className="w-3 h-3" />
                                      CSV
                                    </button>
                                    {/* Re-send to unread */}
                                    {receiptList.some(r => !r.isRead) && (
                                      <button
                                        onClick={() => resendToUnread(item, bid)}
                                        disabled={resendingId === bid}
                                        className="flex items-center gap-1 text-[11px] bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded px-2 py-1 font-medium transition-colors"
                                      >
                                        {resendingId === bid
                                          ? <><RefreshCw className="w-3 h-3 animate-spin" /> Sending...</>
                                          : <><SendHorizonal className="w-3 h-3" /> Re-send to {receiptList.filter(r => !r.isRead).length} unread</>
                                        }
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-1 max-h-72 overflow-y-auto">
                                  {receiptList.map(r => (
                                    <div key={r.userId} className={`flex items-center gap-3 rounded px-3 py-2 text-xs ${r.isRead ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-white dark:bg-slate-800'}`}>
                                      {r.isRead
                                        ? <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                        : <UserX className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                      }
                                      <span className="flex-1 font-medium truncate">{r.name}</span>
                                      <span className="text-muted-foreground capitalize shrink-0">{r.role}</span>
                                      {r.isRead && r.readAt && (
                                        <span className="text-emerald-600 shrink-0">
                                          {format(new Date(r.readAt), 'MMM dd HH:mm')}
                                        </span>
                                      )}
                                      {!r.isRead && (
                                        <span className="text-slate-400 shrink-0">Pending</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}
