import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/context/user/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Clock, MapPin, LogIn, LogOut, Calendar, Users, Building2, Globe2,
  Loader2, Info, ExternalLink,
} from 'lucide-react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';

type AttendanceLog = {
  id: string; user_id: string; log_date: string;
  check_in_at: string | null; check_in_lat: number | null; check_in_lng: number | null;
  check_out_at: string | null; check_out_lat: number | null; check_out_lng: number | null;
  hours_worked: number | null; notes: string | null;
  user_name?: string;
};

type CheckInMethod = 'gps' | 'office' | 'remote';

const fmtTime = (iso?: string | null) => iso ? format(new Date(iso), 'HH:mm') : '—';
const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const LATE_HOUR = 9; // anything after 09:00 local is "late"

// Aligned with attendance_logs RLS: super_admin/admin/hr/manager only.
// Finance roles are intentionally excluded — they would get empty/error responses.
const isAdminRole = (role?: string | null) => {
  const r = (role ?? '').toLowerCase().replace(/_/g, '');
  return ['superadmin', 'admin', 'hr', 'hrmanager', 'manager'].some(x => r.includes(x));
};

const methodFromRow = (l: AttendanceLog): CheckInMethod => {
  if (l.notes?.startsWith('[Office]')) return 'office';
  if (l.notes?.startsWith('[Remote')) return 'remote';
  if (l.check_in_lat != null) return 'gps';
  return 'office';
};

const methodLabel = (m: CheckInMethod) =>
  m === 'gps' ? 'GPS' : m === 'office' ? 'Office' : 'Remote';

const stripPrefix = (notes: string | null) => {
  if (!notes) return '';
  return notes.replace(/^\[(Office|Remote(?::[^\]]+)?)\]\s*/, '');
};

const remoteLocationFromNotes = (notes: string | null): string | null => {
  const m = notes?.match(/^\[Remote:\s*([^\]]+)\]/);
  return m ? m[1].trim() : null;
};

export default function Attendance() {
  const { user, profile } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<CheckInMethod | 'out' | null>(null);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteLabel, setRemoteLabel] = useState('');
  const [remoteNote, setRemoteNote] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutNote, setCheckoutNote] = useState('');
  const isAdmin = isAdminRole(profile?.role);

  const { data: today } = useQuery<AttendanceLog | null>({
    queryKey: ['attendance-today', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs').select('*')
        .eq('user_id', user!.id).eq('log_date', todayStr()).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data as AttendanceLog | null;
    },
  });

  const { data: myHistory = [], isLoading: loadingHistory } = useQuery<AttendanceLog[]>({
    queryKey: ['attendance-history', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs').select('*')
        .eq('user_id', user!.id)
        .order('log_date', { ascending: false }).limit(60);
      if (error) throw error;
      return (data ?? []) as AttendanceLog[];
    },
  });

  const { data: teamToday = [], isLoading: loadingTeam } = useQuery<AttendanceLog[]>({
    queryKey: ['attendance-team-today'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: logs, error } = await supabase
        .from('attendance_logs').select('*')
        .eq('log_date', todayStr())
        .order('check_in_at', { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((logs ?? []).map((l: any) => l.user_id)));
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      return (logs ?? []).map((l: any) => ({ ...l, user_name: nameById.get(l.user_id) ?? l.user_id.slice(0,8) }));
    },
  });

  const getCoords = () => new Promise<{ lat: number; lng: number } | null>(resolve => {
    if (!('geolocation' in navigator)) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });

  const performCheckIn = async (method: CheckInMethod, opts?: { label?: string; note?: string }): Promise<boolean> => {
    if (!user?.id) return false;
    setBusy(method);
    try {
      const coords = method === 'gps' ? await getCoords() : null;
      const now = new Date().toISOString();
      // Sanitize label so brackets don't break the prefix-parsing on display
      const safeLabel = (opts?.label?.trim() || 'Field').replace(/[\[\]]/g, '');
      let notes = '';
      if (method === 'office') {
        notes = `[Office]${opts?.note ? ' ' + opts.note : ''}`;
      } else if (method === 'remote') {
        notes = `[Remote: ${safeLabel}]${opts?.note ? ' ' + opts.note : ''}`;
      }
      const payload: any = {
        user_id: user.id,
        log_date: todayStr(),
        check_in_at: now,
        check_in_lat: coords?.lat ?? null,
        check_in_lng: coords?.lng ?? null,
        notes: notes || null,
      };
      const { error } = await supabase
        .from('attendance_logs')
        .upsert(payload, { onConflict: 'user_id,log_date' });
      if (error) throw error;
      const where =
        method === 'gps'
          ? (coords ? `GPS ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'GPS unavailable — checked in without location')
          : method === 'office' ? 'Office'
          : `Remote: ${safeLabel}`;
      toast({
        title: 'Checked in / تم تسجيل الحضور',
        description: `${format(new Date(now), 'HH:mm')} — ${where}`,
      });
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['attendance-history'] });
      qc.invalidateQueries({ queryKey: ['attendance-team-today'] });
      return true;
    } catch (err: any) {
      toast({ title: 'Check-in failed / فشل', description: err.message ?? String(err), variant: 'destructive' });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const submitRemote = async () => {
    const ok = await performCheckIn('remote', { label: remoteLabel, note: remoteNote });
    if (ok) {
      setRemoteOpen(false);
      setRemoteLabel('');
      setRemoteNote('');
    }
  };

  const checkOut = async () => {
    if (!user?.id || !today?.check_in_at) return;
    setBusy('out');
    try {
      const coords = await getCoords();
      const now = new Date();
      const checkInDate = new Date(today.check_in_at);
      const hours = Math.max(0, (now.getTime() - checkInDate.getTime()) / 3600_000);
      const finalNotes = checkoutNote.trim()
        ? `${today.notes ?? ''}${today.notes ? '\n' : ''}Out: ${checkoutNote.trim()}`
        : today.notes;
      const { error } = await supabase.from('attendance_logs').update({
        check_out_at: now.toISOString(),
        check_out_lat: coords?.lat ?? null,
        check_out_lng: coords?.lng ?? null,
        notes: finalNotes,
      }).eq('id', today.id);
      if (error) throw error;
      toast({ title: 'Checked out / تم الانصراف', description: `${hours.toFixed(2)}h worked` });
      setCheckoutOpen(false);
      setCheckoutNote('');
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['attendance-history'] });
      qc.invalidateQueries({ queryKey: ['attendance-team-today'] });
    } catch (err: any) {
      toast({ title: 'Check-out failed / فشل', description: err.message ?? String(err), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const hoursThisMonth = useMemo(() => {
    const m = new Date().getMonth(), y = new Date().getFullYear();
    return myHistory.filter(l => {
      const d = new Date(l.log_date);
      return d.getMonth() === m && d.getFullYear() === y;
    }).reduce((s, l) => s + Number(l.hours_worked ?? 0), 0);
  }, [myHistory]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, []);

  const weekTotals = useMemo(() => weekDays.map(d => {
    const log = myHistory.find(l => isSameDay(new Date(l.log_date), d));
    return { date: d, log };
  }), [weekDays, myHistory]);

  const todayMethod = today?.check_in_at ? methodFromRow(today) : null;
  const isLate = today?.check_in_at && new Date(today.check_in_at).getHours() >= LATE_HOUR;
  const dayName = format(new Date(), 'EEE');

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-6xl" data-testid="page-attendance">
      <PageInfoBanner
        title="Attendance"
        description="Check in for the day using one of three methods: GPS (verifies you're at site), Office (Wi-Fi/QR-code check-in), or Remote (manual with reason). Your check-in time, location, and method are logged. HR and managers can view team attendance, export reports, and follow up on missed days. Check out at end-of-day to record total hours worked."
        descriptionAr="سجِّل حضورك لليوم بإحدى ثلاث طرق: نظام تحديد المواقع (يتحقق من وجودك في الموقع)، أو المكتب (تسجيل عبر شبكة Wi-Fi / رمز QR)، أو عن بُعد (يدوي مع سبب). يتم تسجيل وقت تسجيل الدخول والموقع والطريقة. يمكن لقسم الموارد البشرية والمديرين عرض حضور الفريق وتصدير التقارير ومتابعة الأيام الغائبة. سجِّل خروجك في نهاية اليوم لتسجيل إجمالي ساعات العمل."
      />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Clock className="w-7 h-7 text-primary" />
            Attendance <span className="text-base text-muted-foreground">/ الحضور</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Check in three ways: GPS, Office, or Remote. / سجّل حضورك بثلاث طرق.
          </p>
        </div>
      </div>

      <Tabs defaultValue="me" className="space-y-4">
        <TabsList>
          <TabsTrigger value="me" data-testid="tab-me">My Attendance / حضوري</TabsTrigger>
          {isAdmin && <TabsTrigger value="team" data-testid="tab-team">Team Today / فريقي اليوم</TabsTrigger>}
        </TabsList>

        <TabsContent value="me" className="space-y-4">
          {/* HERO — Today */}
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                <span>Today / اليوم — {dayName}, {format(new Date(), 'd MMM yyyy')}</span>
                {today?.check_in_at && today?.check_out_at && (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">✓ Day Complete</Badge>
                )}
                {today?.check_in_at && !today?.check_out_at && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-300">In Progress</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Check In</div>
                  <div className="text-2xl font-mono font-semibold flex items-center gap-2" data-testid="text-checkin-time">
                    {fmtTime(today?.check_in_at)}
                    {isLate && <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px] py-0">LATE</Badge>}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Check Out</div>
                  <div className="text-2xl font-mono font-semibold" data-testid="text-checkout-time">{fmtTime(today?.check_out_at)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Hours Today</div>
                  <div className="text-2xl font-mono font-semibold">{today?.hours_worked ? Number(today.hours_worked).toFixed(2) : '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Method</div>
                  <div className="text-2xl font-semibold flex items-center gap-2">
                    {todayMethod === 'gps' && <><MapPin className="w-5 h-5 text-blue-600" /><span className="text-base">GPS</span></>}
                    {todayMethod === 'office' && <><Building2 className="w-5 h-5 text-violet-600" /><span className="text-base">Office</span></>}
                    {todayMethod === 'remote' && <><Globe2 className="w-5 h-5 text-amber-600" /><span className="text-base">{remoteLocationFromNotes(today?.notes ?? null) || 'Remote'}</span></>}
                    {!todayMethod && <span className="text-base text-muted-foreground">—</span>}
                  </div>
                </div>
              </div>

              {/* Action area */}
              {!today?.check_in_at ? (
                <div className="space-y-3 pt-2 border-t">
                  <div className="text-sm font-medium">Choose how to check in / اختر طريقة الحضور:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Button
                      onClick={() => performCheckIn('gps')}
                      disabled={!!busy}
                      size="lg"
                      className="justify-start"
                      data-testid="button-check-in-gps"
                    >
                      {busy === 'gps' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
                      <div className="text-left">
                        <div className="font-semibold">GPS Check-In</div>
                        <div className="text-[10px] opacity-80 font-normal">Captures live location</div>
                      </div>
                    </Button>
                    <Button
                      onClick={() => performCheckIn('office')}
                      disabled={!!busy}
                      size="lg"
                      variant="secondary"
                      className="justify-start"
                      data-testid="button-check-in-office"
                    >
                      {busy === 'office' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Building2 className="w-4 h-4 mr-2" />}
                      <div className="text-left">
                        <div className="font-semibold">Office Check-In</div>
                        <div className="text-[10px] opacity-80 font-normal">Instant, no GPS</div>
                      </div>
                    </Button>
                    <Button
                      onClick={() => setRemoteOpen(true)}
                      disabled={!!busy}
                      size="lg"
                      variant="outline"
                      className="justify-start"
                      data-testid="button-check-in-remote"
                    >
                      <Globe2 className="w-4 h-4 mr-2" />
                      <div className="text-left">
                        <div className="font-semibold">Remote / Field</div>
                        <div className="text-[10px] opacity-80 font-normal">Add a location label</div>
                      </div>
                    </Button>
                  </div>
                  {busy === 'gps' && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Getting your location… (will check in without GPS after 8s if blocked)
                    </div>
                  )}
                </div>
              ) : !today?.check_out_at ? (
                <div className="pt-2 border-t flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-muted-foreground">
                    You're checked in. End your day when you finish.
                  </div>
                  <Button
                    onClick={() => setCheckoutOpen(true)}
                    disabled={!!busy}
                    size="lg"
                    variant="secondary"
                    data-testid="button-check-out"
                  >
                    {busy === 'out' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />}
                    Check Out / انصراف
                  </Button>
                </div>
              ) : (
                <div className="pt-2 border-t text-sm text-muted-foreground">
                  Day complete. See you tomorrow! / يوم مكتمل، نراك غدًا.
                </div>
              )}
            </CardContent>
          </Card>

          {/* How to check in — collapsible help */}
          <Accordion type="single" collapsible className="bg-muted/30 rounded-lg px-4">
            <AccordionItem value="how" className="border-0">
              <AccordionTrigger className="hover:no-underline" data-testid="accordion-how">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Info className="w-4 h-4 text-primary" /> How to check in — 3 ways / كيفية تسجيل الحضور
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-sm space-y-3 pt-2">
                <div className="flex gap-3">
                  <MapPin className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">1. GPS Check-In</div>
                    <div className="text-muted-foreground">
                      Best for field staff. Click <b>GPS Check-In</b>; the browser asks for location permission.
                      Allow it once and your latitude/longitude are saved with the check-in. If you block GPS or it
                      times out (8s), the check-in still happens but without coordinates.
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Building2 className="w-5 h-5 text-violet-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">2. Office Check-In</div>
                    <div className="text-muted-foreground">
                      Instant click — no GPS prompt, no waiting. Use this when you're at PACT HQ or any
                      pre-known location.
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Globe2 className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">3. Remote / Field Check-In</div>
                    <div className="text-muted-foreground">
                      Opens a small form so you can write where you are (e.g. "Khartoum field site",
                      "Home — Omdurman") plus an optional note. Useful when GPS is blocked or you want a
                      named location for HR records.
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground border-t pt-2">
                  Whichever method you use, your day is open until you click <b>Check Out</b>.
                  Hours are calculated automatically.
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Stats */}
          <div className="grid sm:grid-cols-3 gap-3">
            <Card><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Hours This Month / ساعات الشهر</div>
              <div className="text-2xl font-bold mt-1" data-testid="text-hours-month">{hoursThisMonth.toFixed(2)}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Days Attended / أيام الحضور</div>
              <div className="text-2xl font-bold mt-1" data-testid="text-days-attended">{myHistory.filter(l => l.check_in_at).length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Avg Hours / متوسط الساعات</div>
              <div className="text-2xl font-bold mt-1" data-testid="text-avg-hours">{
                (() => {
                  const w = myHistory.filter(l => l.hours_worked);
                  return w.length ? (w.reduce((s,l) => s+Number(l.hours_worked),0)/w.length).toFixed(2) : '0.00';
                })()
              }</div>
            </CardContent></Card>
          </div>

          {/* This week mini summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" /> This Week / هذا الأسبوع
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {weekTotals.map(({ date, log }) => {
                  const isToday = isSameDay(date, new Date());
                  return (
                    <div
                      key={date.toISOString()}
                      className={`rounded-lg border p-2 text-center text-xs ${isToday ? 'border-primary bg-primary/5' : 'border-border'}`}
                      data-testid={`week-cell-${format(date, 'yyyy-MM-dd')}`}
                    >
                      <div className="font-semibold">{format(date, 'EEE')}</div>
                      <div className="text-muted-foreground">{format(date, 'd')}</div>
                      <div className="mt-1 font-mono text-sm">
                        {log?.hours_worked ? Number(log.hours_worked).toFixed(1) : log?.check_in_at ? '…' : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5"/> Recent History / السجل الأخير</CardTitle></CardHeader>
            <CardContent>
              {loadingHistory ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div> :
               myHistory.length === 0 ? <div className="text-center text-muted-foreground py-6">No attendance logs yet. / لا توجد سجلات بعد.</div> :
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>In</TableHead>
                    <TableHead>Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {myHistory.map(l => {
                      const m = methodFromRow(l);
                      const noteText = stripPrefix(l.notes);
                      return (
                        <TableRow key={l.id} data-testid={`row-attendance-${l.id}`}>
                          <TableCell className="font-medium">{l.log_date}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtTime(l.check_in_at)}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtTime(l.check_out_at)}</TableCell>
                          <TableCell>{l.hours_worked ? Number(l.hours_worked).toFixed(2) : '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              m === 'gps' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              m === 'office' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }>{methodLabel(m)}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {l.check_in_lat != null && l.check_in_lng != null ? (
                              <a
                                href={`https://www.google.com/maps?q=${l.check_in_lat},${l.check_in_lng}`}
                                target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                data-testid={`link-map-${l.id}`}
                              >
                                <MapPin className="w-3 h-3" />
                                {Number(l.check_in_lat).toFixed(3)}, {Number(l.check_in_lng).toFixed(3)}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : remoteLocationFromNotes(l.notes) ? (
                              <span className="text-muted-foreground">{remoteLocationFromNotes(l.notes)}</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate" title={noteText}>{noteText || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              }
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="team">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5"/> Team Attendance Today / حضور الفريق اليوم</CardTitle></CardHeader>
              <CardContent>
                {loadingTeam ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div> :
                 teamToday.length === 0 ? <div className="text-center text-muted-foreground py-6">No one has checked in yet today. / لم يسجل أحد الحضور اليوم بعد.</div> :
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>In</TableHead>
                      <TableHead>Out</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {teamToday.map(l => {
                        const m = methodFromRow(l);
                        return (
                          <TableRow key={l.id} data-testid={`row-team-attendance-${l.id}`}>
                            <TableCell className="font-medium">{l.user_name}</TableCell>
                            <TableCell className="font-mono text-sm">{fmtTime(l.check_in_at)}</TableCell>
                            <TableCell className="font-mono text-sm">{fmtTime(l.check_out_at)}</TableCell>
                            <TableCell>{l.hours_worked ? Number(l.hours_worked).toFixed(2) : '—'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                m === 'gps' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                m === 'office' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                                'bg-amber-50 text-amber-700 border-amber-200'
                              }>{methodLabel(m)}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                l.check_out_at ? 'bg-gray-100 text-gray-700' :
                                l.check_in_at ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                'bg-amber-100 text-amber-800 border-amber-300'
                              }>
                                {l.check_out_at ? 'Departed' : l.check_in_at ? 'Present' : 'Pending'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                }
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Remote check-in dialog */}
      <Dialog open={remoteOpen} onOpenChange={setRemoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Globe2 className="w-5 h-5 text-amber-600"/> Remote / Field Check-In</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Where are you? / أين أنت؟</label>
              <Input
                placeholder='e.g. "Khartoum field site", "Home — Omdurman"'
                value={remoteLabel}
                onChange={e => setRemoteLabel(e.target.value)}
                data-testid="input-remote-label"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Note (optional)</label>
              <Textarea
                placeholder="Anything HR should know…"
                value={remoteNote}
                onChange={e => setRemoteNote(e.target.value)}
                rows={3}
                data-testid="input-remote-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoteOpen(false)} data-testid="button-remote-cancel">Cancel</Button>
            <Button onClick={submitRemote} disabled={busy === 'remote'} data-testid="button-remote-submit">
              {busy === 'remote' ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <LogIn className="w-4 h-4 mr-2"/>}
              Check In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check-out dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LogOut className="w-5 h-5"/> Check Out / انصراف</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Add an end-of-day note (optional). GPS will be captured if you allow it.
            </div>
            <Textarea
              placeholder="What did you accomplish? Anything blocked?"
              value={checkoutNote}
              onChange={e => setCheckoutNote(e.target.value)}
              rows={3}
              data-testid="input-checkout-note"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckoutOpen(false)} data-testid="button-checkout-cancel">Cancel</Button>
            <Button onClick={checkOut} disabled={busy === 'out'} data-testid="button-checkout-confirm">
              {busy === 'out' ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <LogOut className="w-4 h-4 mr-2"/>}
              Confirm Check Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
