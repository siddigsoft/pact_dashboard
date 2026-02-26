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
  RefreshCw, Info, Bell, Link as LinkIcon, Shield
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
  title: string;
  message: string;
  created_at: string;
  event_type: string;
  priority: string;
  recipient_count?: number;
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
  const [userCount, setUserCount] = useState<number | null>(null);

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
      const { data } = await supabase
        .from('notifications')
        .select('id, title_en, message_en, created_at, event_type, priority')
        .eq('event_type', 'broadcast')
        .order('created_at', { ascending: false })
        .limit(50);

      const grouped: Record<string, BroadcastHistory> = {};
      (data || []).forEach(n => {
        const key = `${n.title_en}_${n.created_at?.slice(0, 16)}`;
        if (!grouped[key]) {
          grouped[key] = {
            id: n.id,
            title: n.title_en || '',
            message: n.message_en || '',
            created_at: n.created_at,
            event_type: n.event_type,
            priority: n.priority,
            recipient_count: 1,
          };
        } else {
          grouped[key].recipient_count = (grouped[key].recipient_count || 1) + 1;
        }
      });

      setHistory(Object.values(grouped).slice(0, 20));
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
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
      let userIds: string[] = [];

      const { data: users } = await supabase
        .from('profiles')
        .select('id, bank_account, role')
        .not('role', 'is', null);

      if (!users) throw new Error('Could not load users');

      if (audience === 'all') {
        userIds = users.map(u => u.id);
      } else if (audience === 'no_bank_account') {
        userIds = users.filter(u => {
          const ba = u.bank_account as any;
          return !ba?.accountNumber && !ba?.account_number;
        }).map(u => u.id);
      } else {
        userIds = users.filter(u => (u.role || '').toLowerCase() === audience).map(u => u.id);
      }

      if (userIds.length === 0) {
        toast({ title: 'No recipients', description: 'No users match the selected audience.', variant: 'destructive' });
        setSending(false);
        return;
      }

      const sent = await NotificationTriggerService.sendBulk(userIds, {
        title: titleEn.trim(),
        titleAr: titleAr.trim() || titleEn.trim(),
        message: messageEn.trim(),
        messageAr: messageAr.trim() || messageEn.trim(),
        type: priority === 'urgent' ? 'error' : priority === 'high' ? 'warning' : 'info',
        category: 'broadcast' as any,
        priority: priority as any,
        link: actionLink.trim() || undefined,
        sendEmail,
      });

      setSendResult({ sent, audience });
      toast({
        title: 'Broadcast sent / تم الإرسال',
        description: `Notification delivered to ${sent} user(s).`,
      });

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

          {/* Send Result */}
          {sendResult && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-900/10 p-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  Broadcast sent successfully / تم إرسال الإذاعة بنجاح
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  Delivered to <strong>{sendResult.sent}</strong> user(s) in audience: <em>{AUDIENCE_OPTIONS.find(a => a.value === sendResult.audience)?.label}</em>
                </p>
              </div>
            </div>
          )}

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={sending || !titleEn.trim() || !messageEn.trim()}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white h-11 text-base"
            size="lg"
          >
            {sending ? (
              <><RefreshCw className="w-5 h-5 mr-2 animate-spin" /> Sending broadcast...</>
            ) : (
              <><Send className="w-5 h-5 mr-2" /> Send Broadcast to {AUDIENCE_OPTIONS.find(a => a.value === audience)?.label.split('/')[0].trim()}</>
            )}
          </Button>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-violet-500" />
                Recent Broadcasts / الإرسالات الأخيرة
              </CardTitle>
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
                  {history.map((item, idx) => (
                    <div key={item.id + idx} className="flex items-start gap-3 rounded-lg border p-4">
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
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {item.created_at ? format(new Date(item.created_at), 'MMM dd, yyyy HH:mm') : '—'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {item.recipient_count} recipient(s) tracked
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
