import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { 
  Phone, PhoneMissed, PhoneIncoming, PhoneOutgoing, 
  Clock, Users, TrendingUp, BarChart3, ArrowLeft,
  RefreshCw, Filter
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

interface CallLog {
  id: string;
  caller_id: string;
  callee_id: string;
  direction: 'outgoing' | 'incoming';
  status: 'completed' | 'missed' | 'rejected' | 'no_answer';
  duration: number;
  started_at: string;
  call_type: 'audio' | 'video';
}

interface ProfileMap {
  [id: string]: { full_name: string; role: string };
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#16A34A',
  missed:    '#DC2626',
  rejected:  '#D97706',
  no_answer: '#6B7280',
};

const STATUS_PIE_COLORS = ['#16A34A', '#DC2626', '#D97706', '#6B7280'];

const formatDuration = (secs: number) => {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const CallAnalytics = () => {
  const { currentUser } = useAppContext();
  const [logs,       setLogs]       = useState<CallLog[]>([]);
  const [profiles,   setProfiles]   = useState<ProfileMap>({});
  const [loading,    setLoading]    = useState(true);
  const [timeRange,  setTimeRange]  = useState('30');

  useEffect(() => { loadData(); }, [timeRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - parseInt(timeRange) * 86400_000).toISOString();
      const { data: callData } = await supabase
        .from('call_logs' as any)
        .select('*')
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(500);

      const rows = (callData || []) as CallLog[];
      setLogs(rows);

      // Fetch names for all unique user IDs
      const ids = [...new Set(rows.flatMap(r => [r.caller_id, r.callee_id]).filter(Boolean))];
      if (ids.length) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .in('id', ids.slice(0, 100));
        const map: ProfileMap = {};
        (profileData || []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, role: p.role }; });
        setProfiles(map);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Computed stats ──────────────────────────────────────────────
  const total       = logs.length;
  const completed   = logs.filter(l => l.status === 'completed').length;
  const missed      = logs.filter(l => l.status === 'missed' || l.status === 'no_answer').length;
  const avgDur      = completed ? Math.round(logs.filter(l => l.status === 'completed').reduce((a, b) => a + (b.duration || 0), 0) / completed) : 0;
  const missedPct   = total ? Math.round((missed / total) * 100) : 0;

  // Status breakdown for pie
  const statusBreakdown = Object.entries(
    logs.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  // Calls per day for bar chart (last N days)
  const daysMap: Record<string, { completed: number; missed: number }> = {};
  logs.forEach(l => {
    const day = l.started_at.substring(0, 10);
    if (!daysMap[day]) daysMap[day] = { completed: 0, missed: 0 };
    if (l.status === 'completed') daysMap[day].completed++;
    else daysMap[day].missed++;
  });
  const dailyData = Object.entries(daysMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, vals]) => ({ date: date.substring(5), ...vals }));

  // Top callers
  const callerCounts: Record<string, number> = {};
  logs.forEach(l => { callerCounts[l.caller_id] = (callerCounts[l.caller_id] || 0) + 1; });
  const topCallers = Object.entries(callerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ id, count, name: profiles[id]?.full_name || 'Unknown', role: profiles[id]?.role || '' }));

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6" data-testid="call-analytics-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/calls">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[#0F2041]">Call Analytics</h1>
            <p className="text-sm text-gray-500">Platform-wide call statistics and trends</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32" data-testid="select-time-range">
              <Filter className="h-3.5 w-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={loadData} data-testid="button-refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0F2041]" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card data-testid="stat-total-calls">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-50">
                    <Phone className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-[#0F2041]">{total.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Total Calls</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="stat-completed-calls">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-50">
                    <PhoneIncoming className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-700">{completed.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="stat-missed-calls">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-50">
                    <PhoneMissed className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-700">{missed.toLocaleString()}</p>
                    <p className="text-xs text-gray-500">Missed ({missedPct}%)</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="stat-avg-duration">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-50">
                    <Clock className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-purple-700">{formatDuration(avgDur)}</p>
                    <p className="text-xs text-gray-500">Avg Duration</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Daily bar chart */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#0F2041]" />
                  Calls Over Time (last 14 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dailyData.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No data in this period</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="completed" name="Completed" fill="#16A34A" radius={[3,3,0,0]} />
                      <Bar dataKey="missed"    name="Missed"    fill="#DC2626" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Status pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#0F2041]" />
                  By Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statusBreakdown.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={statusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                        {statusBreakdown.map((_, i) => (
                          <Cell key={i} fill={STATUS_PIE_COLORS[i % STATUS_PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top callers */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-[#0F2041]" />
                Top Callers (by volume)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topCallers.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">No call data available</p>
              ) : (
                <div className="space-y-2">
                  {topCallers.map((caller, i) => (
                    <div key={caller.id} className="flex items-center gap-3 py-2 border-b last:border-0" data-testid={`row-caller-${caller.id}`}>
                      <span className="text-sm font-bold text-gray-400 w-5">{i + 1}</span>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-[#0F2041]/10 text-[#0F2041] text-xs font-bold">
                          {initials(caller.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{caller.name}</p>
                        <p className="text-xs text-gray-500 capitalize">{caller.role}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-[#0F2041]">{caller.count}</p>
                        <p className="text-xs text-gray-400">calls</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent call log */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <PhoneOutgoing className="h-4 w-4 text-[#0F2041]" />
                Recent Calls
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs text-gray-500">
                      <th className="text-left p-3 font-semibold">Caller</th>
                      <th className="text-left p-3 font-semibold">Callee</th>
                      <th className="text-left p-3 font-semibold">Status</th>
                      <th className="text-left p-3 font-semibold">Type</th>
                      <th className="text-left p-3 font-semibold">Duration</th>
                      <th className="text-left p-3 font-semibold">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.slice(0, 25).map(log => (
                      <tr key={log.id} className="border-b last:border-0 hover:bg-gray-50" data-testid={`row-call-${log.id}`}>
                        <td className="p-3 font-medium">{profiles[log.caller_id]?.full_name || '—'}</td>
                        <td className="p-3 text-gray-600">{profiles[log.callee_id]?.full_name || '—'}</td>
                        <td className="p-3">
                          <Badge style={{ backgroundColor: STATUS_COLORS[log.status] + '20', color: STATUS_COLORS[log.status], borderColor: STATUS_COLORS[log.status] + '40' }} variant="outline" className="text-xs capitalize font-semibold">
                            {log.status.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="p-3 text-gray-500 capitalize">{log.call_type}</td>
                        <td className="p-3 text-gray-600">{formatDuration(log.duration)}</td>
                        <td className="p-3 text-gray-400 text-xs">{new Date(log.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {logs.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-8">No calls recorded in this period</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CallAnalytics;
