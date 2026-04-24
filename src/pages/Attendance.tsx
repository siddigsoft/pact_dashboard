import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@/context/user/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, MapPin, LogIn, LogOut, Calendar, Users } from 'lucide-react';
import { format } from 'date-fns';

type AttendanceLog = {
  id: string; user_id: string; log_date: string;
  check_in_at: string | null; check_in_lat: number | null; check_in_lng: number | null;
  check_out_at: string | null; check_out_lat: number | null; check_out_lng: number | null;
  hours_worked: number | null; status: string;
  user_name?: string;
};

const fmtTime = (iso?: string | null) => iso ? format(new Date(iso), 'HH:mm:ss') : '—';
const todayStr = () => format(new Date(), 'yyyy-MM-dd');

const isAdminRole = (role?: string | null) => {
  const r = (role ?? '').toLowerCase();
  return ['super_admin','superadmin','admin','financialadmin','financial_admin','finance','hr','hr_manager'].some(x => r.includes(x.replace('_','')));
};

export default function Attendance() {
  const { user, profile } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
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
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });

  const checkIn = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const coords = await getCoords();
      const now = new Date().toISOString();
      const payload: any = {
        user_id: user.id, log_date: todayStr(),
        check_in_at: now, check_in_lat: coords?.lat ?? null, check_in_lng: coords?.lng ?? null,
        status: 'present',
      };
      const { error } = await supabase.from('attendance_logs').upsert(payload, { onConflict: 'user_id,log_date' });
      if (error) throw error;
      toast({ title: 'Checked in / تم تسجيل الحضور', description: coords ? `GPS: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : 'No GPS available / لا يوجد تحديد موقع' });
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['attendance-history'] });
      qc.invalidateQueries({ queryKey: ['attendance-team-today'] });
    } catch (err: any) {
      toast({ title: 'Failed / فشل', description: err.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const checkOut = async () => {
    if (!user?.id || !today?.check_in_at) return;
    setBusy(true);
    try {
      const coords = await getCoords();
      const now = new Date();
      const checkInDate = new Date(today.check_in_at);
      const hours = Math.max(0, (now.getTime() - checkInDate.getTime()) / 3600_000);
      const { error } = await supabase.from('attendance_logs').update({
        check_out_at: now.toISOString(),
        check_out_lat: coords?.lat ?? null, check_out_lng: coords?.lng ?? null,
        // hours_worked is a GENERATED ALWAYS STORED column — Postgres rejects updates.
      }).eq('id', today.id);
      void hours; // computed only for potential future client-side hints
      if (error) throw error;
      toast({ title: 'Checked out / تم تسجيل الانصراف', description: `${hours.toFixed(2)}h worked / ساعة عمل` });
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['attendance-history'] });
      qc.invalidateQueries({ queryKey: ['attendance-team-today'] });
    } catch (err: any) {
      toast({ title: 'Failed / فشل', description: err.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const hoursThisMonth = useMemo(() => {
    const m = new Date().getMonth(), y = new Date().getFullYear();
    return myHistory.filter(l => {
      const d = new Date(l.log_date);
      return d.getMonth() === m && d.getFullYear() === y;
    }).reduce((s, l) => s + Number(l.hours_worked ?? 0), 0);
  }, [myHistory]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-6xl" data-testid="page-attendance">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Clock className="w-7 h-7 text-primary" />
          Attendance <span className="text-base text-muted-foreground">/ الحضور</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Daily check-in / check-out with GPS. / تسجيل الحضور والانصراف اليومي مع تحديد الموقع.
        </p>
      </div>

      <Tabs defaultValue="me" className="space-y-4">
        <TabsList>
          <TabsTrigger value="me" data-testid="tab-me">My Attendance / حضوري</TabsTrigger>
          {isAdmin && <TabsTrigger value="team" data-testid="tab-team">Team Today / فريقي اليوم</TabsTrigger>}
        </TabsList>

        <TabsContent value="me" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Today / اليوم — {todayStr()}</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Check In / حضور</div>
                  <div className="text-2xl font-mono font-semibold" data-testid="text-checkin-time">{fmtTime(today?.check_in_at)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Check Out / انصراف</div>
                  <div className="text-2xl font-mono font-semibold" data-testid="text-checkout-time">{fmtTime(today?.check_out_at)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Hours / ساعات</div>
                  <div className="text-2xl font-mono font-semibold">{today?.hours_worked ? Number(today.hours_worked).toFixed(2) : '—'}</div>
                </div>
                <div className="flex gap-2">
                  {!today?.check_in_at && (
                    <Button onClick={checkIn} disabled={busy} size="lg" data-testid="button-check-in">
                      <LogIn className="w-4 h-4 mr-2" /> Check In / حضور
                    </Button>
                  )}
                  {today?.check_in_at && !today?.check_out_at && (
                    <Button onClick={checkOut} disabled={busy} variant="secondary" size="lg" data-testid="button-check-out">
                      <LogOut className="w-4 h-4 mr-2" /> Check Out / انصراف
                    </Button>
                  )}
                  {today?.check_in_at && today?.check_out_at && (
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 text-sm py-2 px-3">
                      ✓ Day Complete / يوم مكتمل
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid sm:grid-cols-3 gap-3">
            <Card><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Hours This Month / ساعات الشهر</div>
              <div className="text-2xl font-bold mt-1">{hoursThisMonth.toFixed(2)}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Days Attended / أيام الحضور</div>
              <div className="text-2xl font-bold mt-1">{myHistory.filter(l => l.check_in_at).length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6">
              <div className="text-xs text-muted-foreground">Avg Hours / متوسط الساعات</div>
              <div className="text-2xl font-bold mt-1">{
                (() => {
                  const w = myHistory.filter(l => l.hours_worked);
                  return w.length ? (w.reduce((s,l) => s+Number(l.hours_worked),0)/w.length).toFixed(2) : '0.00';
                })()
              }</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5"/> Recent History / السجل الأخير</CardTitle></CardHeader>
            <CardContent>
              {loadingHistory ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div> :
               myHistory.length === 0 ? <div className="text-center text-muted-foreground py-6">No attendance logs yet. / لا توجد سجلات بعد.</div> :
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date / التاريخ</TableHead>
                    <TableHead>In / دخول</TableHead>
                    <TableHead>Out / خروج</TableHead>
                    <TableHead>Hours / ساعات</TableHead>
                    <TableHead>GPS</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {myHistory.map(l => (
                      <TableRow key={l.id} data-testid={`row-attendance-${l.id}`}>
                        <TableCell className="font-medium">{l.log_date}</TableCell>
                        <TableCell className="font-mono text-sm">{fmtTime(l.check_in_at)}</TableCell>
                        <TableCell className="font-mono text-sm">{fmtTime(l.check_out_at)}</TableCell>
                        <TableCell>{l.hours_worked ? Number(l.hours_worked).toFixed(2) : '—'}</TableCell>
                        <TableCell className="text-xs">{l.check_in_lat ? <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{Number(l.check_in_lat).toFixed(3)}, {Number(l.check_in_lng).toFixed(3)}</span> : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Employee / الموظف</TableHead>
                      <TableHead>In / دخول</TableHead>
                      <TableHead>Out / خروج</TableHead>
                      <TableHead>Hours / ساعات</TableHead>
                      <TableHead>Status / الحالة</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {teamToday.map(l => (
                        <TableRow key={l.id} data-testid={`row-team-attendance-${l.id}`}>
                          <TableCell className="font-medium">{l.user_name}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtTime(l.check_in_at)}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtTime(l.check_out_at)}</TableCell>
                          <TableCell>{l.hours_worked ? Number(l.hours_worked).toFixed(2) : '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              l.check_out_at ? 'bg-gray-100 text-gray-700' :
                              l.check_in_at ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                              'bg-amber-100 text-amber-800 border-amber-300'
                            }>
                              {l.check_out_at ? 'Departed / غادر' : l.check_in_at ? 'Present / حاضر' : l.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                }
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
