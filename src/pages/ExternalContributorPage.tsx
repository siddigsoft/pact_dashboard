import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format, parseISO, isValid, isPast } from 'date-fns';
import {
  CheckCircle2, Clock, AlertCircle, Briefcase, User, Calendar,
  ChevronDown, ChevronUp, Send, FileText, ExternalLink, Lock,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Project, ProjectActivity, ProjectTeamMember, PaymentInstallment } from '@/types/project';

type ActivityStatus = 'pending' | 'inProgress' | 'completed' | 'cancelled';

const STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-50 text-amber-700 border-amber-200',
  inProgress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:  'bg-gray-50 text-gray-500 border-gray-200',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', inProgress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
};

function fmtDate(s?: string) {
  if (!s) return '—';
  try { const d = parseISO(s); return isValid(d) ? format(d, 'dd MMM yyyy') : '—'; } catch { return '—'; }
}

interface ActivityUpdate {
  activityId: string;
  status: ActivityStatus;
  note: string;
}

export default function ExternalContributorPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [project, setProject]       = useState<Project | null>(null);
  const [member, setMember]         = useState<ProjectTeamMember | null>(null);
  const [myActivities, setMyActivities] = useState<ProjectActivity[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updates, setUpdates]       = useState<Record<string, ActivityUpdate>>({});
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState<{ open: boolean; activityId: string; note: string }>({
    open: false, activityId: '', note: '',
  });

  useEffect(() => {
    if (!token) { setError('No access token provided.'); setLoading(false); return; }
    loadProject();
  }, [token]);

  const loadProject = async () => {
    setLoading(true);
    try {
      // Search for the project by scanning team JSON for the token
      // We use a text search since Supabase JS client can't filter on nested JSONB arrays by element property
      const { data, error: fetchErr } = await supabase
        .from('projects')
        .select('id, name, projectCode, status, startDate, endDate, team, activities, budget, description')
        .filter('team::text', 'ilike', `%${token}%`)
        .limit(5);

      if (fetchErr) throw fetchErr;

      // Find the exact project + member matching the token
      let foundProject: Project | null = null;
      let foundMember: ProjectTeamMember | null = null;

      for (const p of (data || [])) {
        const comp = (p.team?.teamComposition || []) as ProjectTeamMember[];
        const m = comp.find(c => c.accessToken === token);
        if (m) { foundProject = p as unknown as Project; foundMember = m; break; }
      }

      if (!foundProject || !foundMember) {
        setError('This link is invalid or has expired. Please contact the project manager.');
        return;
      }

      setProject(foundProject);
      setMember(foundMember);

      // Find activities assigned to this member
      const acts = (foundProject.activities || []).filter(a =>
        a.assignedTo === foundMember!.userId ||
        a.assignedTo === foundMember!.name ||
        (a.assignees || []).includes(foundMember!.userId) ||
        (a.assignees || []).includes(foundMember!.name)
      );
      setMyActivities(acts);

      // Initialise local update state
      const init: Record<string, ActivityUpdate> = {};
      acts.forEach(a => { init[a.id] = { activityId: a.id, status: a.status as ActivityStatus, note: '' }; });
      setUpdates(init);
    } catch (e: any) {
      setError('Failed to load your project. Please try again or contact the project manager.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (activityId: string, status: ActivityStatus) => {
    setUpdates(prev => ({ ...prev, [activityId]: { ...prev[activityId], status } }));
  };

  const handleSaveActivity = async (activityId: string) => {
    if (!project) return;
    setSaving(true);
    try {
      const update = updates[activityId];
      const updatedActivities = (project.activities || []).map(a =>
        a.id === activityId ? { ...a, status: update.status, progress: update.status === 'completed' ? 100 : a.progress } : a
      );
      const { error: saveErr } = await supabase
        .from('projects')
        .update({ activities: updatedActivities })
        .eq('id', project.id);
      if (saveErr) throw saveErr;
      setProject(prev => prev ? { ...prev, activities: updatedActivities } : prev);
      setMyActivities(prev => prev.map(a =>
        a.id === activityId ? { ...a, status: update.status, progress: update.status === 'completed' ? 100 : a.progress } : a
      ));
      setSaved(activityId);
      setTimeout(() => setSaved(null), 2500);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading your project workspace…</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !project || !member) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-rose-50 p-4">
        <Card className="max-w-md w-full text-center shadow-lg">
          <CardContent className="pt-10 pb-8 space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <Lock className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="text-xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground text-sm">{error || 'Your access link is invalid.'}</p>
            <p className="text-xs text-muted-foreground">
              Contact your project manager to get a fresh link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedCount = myActivities.filter(a => a.status === 'completed').length;
  const overallPct     = myActivities.length > 0 ? Math.round((completedCount / myActivities.length) * 100) : 0;

  // Upcoming installments for this member
  const upcomingInstallments = (member.installments || [])
    .filter(i => i.status !== 'paid')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <Briefcase className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">PACT Command Center</p>
              <h1 className="font-bold text-base leading-tight">{project.name}</h1>
            </div>
          </div>
          <Badge variant="outline" className="text-xs hidden sm:flex">{project.projectCode}</Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* ── Welcome card ───────────────────────────────────────────────── */}
        <Card className="border-0 shadow-md bg-gradient-to-r from-primary/5 to-blue-50">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-lg font-bold text-primary">
                {member.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-base">Welcome, {member.name.split(' ')[0]}!</h2>
                {member.organization && (
                  <p className="text-xs text-muted-foreground">{member.organization}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="text-xs capitalize">{member.role}</Badge>
                  <Badge variant="outline" className="text-xs border-violet-200 text-violet-700 bg-violet-50">External Contributor</Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {fmtDate(project.startDate)} — {fmtDate(project.endDate)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── My progress ────────────────────────────────────────────────── */}
        {myActivities.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">My Tasks Progress</span>
                <span className="text-sm font-bold text-primary">{completedCount}/{myActivities.length} done</span>
              </div>
              <Progress value={overallPct} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">{overallPct}% complete</p>
            </CardContent>
          </Card>
        )}

        {/* ── Activities ─────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide px-1">
            My Assigned Activities ({myActivities.length})
          </h2>

          {myActivities.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No activities assigned to you yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Check back later or contact your project manager.</p>
              </CardContent>
            </Card>
          ) : (
            myActivities.map(activity => {
              const localUpdate = updates[activity.id];
              const currentStatus = localUpdate?.status || activity.status as ActivityStatus;
              const isExpanded = expandedId === activity.id;
              const isOverdue = activity.dueDate && isPast(parseISO(activity.dueDate)) && currentStatus !== 'completed';
              const justSaved = saved === activity.id;

              return (
                <Card key={activity.id} className={`transition-all ${isExpanded ? 'shadow-md' : ''}`}>
                  <CardContent className="p-0">
                    {/* Header row */}
                    <div
                      className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg"
                      onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                    >
                      <div className="mt-0.5 shrink-0">
                        {currentStatus === 'completed'
                          ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          : currentStatus === 'inProgress'
                          ? <Clock className="h-5 w-5 text-blue-500" />
                          : <AlertCircle className="h-5 w-5 text-amber-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{activity.name}</p>
                        {activity.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{activity.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border font-medium ${STATUS_COLORS[currentStatus] || STATUS_COLORS.pending}`}>
                            {STATUS_LABELS[currentStatus] || currentStatus}
                          </span>
                          {activity.dueDate && (
                            <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                              <Calendar className="h-3 w-3" />
                              Due {fmtDate(activity.dueDate)}
                              {isOverdue && ' — Overdue'}
                            </span>
                          )}
                          {justSaved && (
                            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Saved
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-muted-foreground ml-2">
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>

                    {/* Expanded update panel */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t pt-4 space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Update Status</Label>
                          <div className="flex flex-wrap gap-2">
                            {(['pending', 'inProgress', 'completed'] as ActivityStatus[]).map(s => (
                              <button
                                key={s}
                                onClick={() => handleStatusChange(activity.id, s)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  currentStatus === s
                                    ? `${STATUS_COLORS[s]} ring-2 ring-offset-1 ring-current`
                                    : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                                }`}
                              >
                                {STATUS_LABELS[s]}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Sub-activities */}
                        {activity.subActivities?.length > 0 && (
                          <div className="space-y-1">
                            <Label className="text-xs">Sub-Tasks</Label>
                            <div className="space-y-1.5 pl-2 border-l-2 border-muted">
                              {activity.subActivities.map(sub => (
                                <div key={sub.id} className="flex items-center gap-2 text-xs">
                                  <div className={`w-2 h-2 rounded-full ${sub.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                  <span className={sub.status === 'completed' ? 'line-through text-muted-foreground' : ''}>{sub.name}</span>
                                  {sub.dueDate && <span className="text-muted-foreground ml-auto">{fmtDate(sub.dueDate)}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <Label className="text-xs">Progress Note (optional)</Label>
                          <Textarea
                            placeholder="Describe what you've done, blockers, next steps…"
                            value={localUpdate?.note || ''}
                            onChange={e => setUpdates(prev => ({ ...prev, [activity.id]: { ...prev[activity.id], note: e.target.value } }))}
                            className="text-sm resize-none"
                            rows={2}
                          />
                        </div>

                        <Button
                          size="sm"
                          onClick={() => handleSaveActivity(activity.id)}
                          disabled={saving}
                          className="w-full"
                        >
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          {saving ? 'Saving…' : 'Save Update'}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* ── Payment schedule ───────────────────────────────────────────── */}
        {member.feeType && (
          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide px-1">
              My Payment Schedule
            </h2>
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Fee type</span>
                  <Badge variant="outline" className="text-xs capitalize">
                    {member.feeType === 'per_hour' ? 'Per Hour' : member.feeType === 'fixed_fee' ? 'Fixed Fee' : '% of Budget'}
                  </Badge>
                </div>
                {member.currency && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Currency</span>
                    <span className="text-xs font-mono font-medium">{member.currency}</span>
                  </div>
                )}
                {upcomingInstallments.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    <p className="text-xs font-medium">Upcoming Payments</p>
                    {upcomingInstallments.map(inst => {
                      const overdue = isPast(parseISO(inst.dueDate)) && inst.status !== 'paid';
                      return (
                        <div key={inst.id} className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                          overdue ? 'border-red-200 bg-red-50' : 'border-border bg-muted/20'
                        }`}>
                          <div>
                            <p className="font-medium">{inst.label}</p>
                            <p className={`${overdue ? 'text-red-500' : 'text-muted-foreground'}`}>
                              Due {fmtDate(inst.dueDate)}{overdue ? ' — Overdue' : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{member.currency} {inst.amount.toLocaleString()}</p>
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              inst.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {inst.status === 'overdue' ? 'Overdue' : 'Pending'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : member.installments?.length ? (
                  <div className="text-center py-3 text-xs text-emerald-600 font-medium flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> All payments received — thank you!
                  </div>
                ) : member.paymentDueDate ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Payment due</span>
                    <span className={isPast(parseISO(member.paymentDueDate)) ? 'text-red-500 font-medium' : ''}>
                      {fmtDate(member.paymentDueDate)}
                    </span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="text-center text-xs text-muted-foreground pb-8">
          <p>Secure external contributor portal — PACT Command Center</p>
          <p className="mt-1 opacity-60">Your data is protected. This link is unique to you.</p>
        </div>
      </div>
    </div>
  );
}
