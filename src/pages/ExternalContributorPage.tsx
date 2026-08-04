import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format, parseISO, isValid, isPast } from 'date-fns';
import {
  CheckCircle2, Clock, AlertCircle, Briefcase, Calendar,
  ChevronDown, ChevronUp, FileText, Lock,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ProjectTeamMember } from '@/types/project';

type ActivityStatus = 'pending' | 'inProgress' | 'completed' | 'cancelled';

interface PortalActivity {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  status: string;
  notes?: string | null;
}

interface PortalProject {
  id: string;
  name: string;
  projectCode?: string | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  inProgress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  inProgress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function fmtDate(s?: string | null) {
  if (!s) return '—';
  try {
    const d = parseISO(s);
    return isValid(d) ? format(d, 'dd MMM yyyy') : '—';
  } catch {
    return '—';
  }
}

function normalizeStatus(status?: string | null): ActivityStatus {
  if (status === 'in_progress' || status === 'inProgress') return 'inProgress';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  return 'pending';
}

interface ActivityUpdate {
  activityId: string;
  status: ActivityStatus;
}

export default function ExternalContributorPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<PortalProject | null>(null);
  const [member, setMember] = useState<ProjectTeamMember | null>(null);
  const [myActivities, setMyActivities] = useState<PortalActivity[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updates, setUpdates] = useState<Record<string, ActivityUpdate>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No access token provided.');
      setLoading(false);
      return;
    }
    void loadProject(token);
  }, [token]);

  const loadProject = async (accessToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_external_contributor_portal', {
        p_token: accessToken,
      });

      if (rpcErr) throw rpcErr;

      const payload = data as {
        ok?: boolean;
        error?: string;
        project?: PortalProject;
        member?: ProjectTeamMember;
        activities?: PortalActivity[];
      } | null;

      if (!payload?.ok || !payload.project || !payload.member) {
        setError('This link is invalid or has expired. Please contact the project manager.');
        setProject(null);
        setMember(null);
        setMyActivities([]);
        return;
      }

      const acts = (payload.activities ?? []).map((a) => ({
        ...a,
        status: normalizeStatus(a.status),
      }));

      setProject(payload.project);
      setMember(payload.member);
      setMyActivities(acts);

      const init: Record<string, ActivityUpdate> = {};
      acts.forEach((a) => {
        init[a.id] = { activityId: a.id, status: normalizeStatus(a.status) };
      });
      setUpdates(init);
    } catch (e) {
      console.error(e);
      setError('Failed to load your project. Please try again or contact the project manager.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (activityId: string, status: ActivityStatus) => {
    setUpdates((prev) => ({ ...prev, [activityId]: { ...prev[activityId], status } }));
  };

  const handleSaveActivity = async (activityId: string) => {
    if (!token) return;
    setSaving(true);
    try {
      const update = updates[activityId];
      const { data, error: rpcErr } = await supabase.rpc('update_external_contributor_activity', {
        p_token: token,
        p_activity_id: activityId,
        p_status: update.status,
      });
      if (rpcErr) throw rpcErr;

      const result = data as { ok?: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error || 'Update failed');

      setMyActivities((prev) =>
        prev.map((a) => (a.id === activityId ? { ...a, status: update.status } : a)),
      );
      setSaved(activityId);
      setTimeout(() => setSaved(null), 2500);
    } catch (e) {
      console.error(e);
      setError('Could not save your update. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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

  const completedCount = myActivities.filter((a) => normalizeStatus(a.status) === 'completed').length;
  const overallPct = myActivities.length > 0 ? Math.round((completedCount / myActivities.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
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
          {project.projectCode && (
            <Badge variant="outline" className="text-xs hidden sm:flex">{project.projectCode}</Badge>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
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
            myActivities.map((activity) => {
              const localUpdate = updates[activity.id];
              const currentStatus = localUpdate?.status || normalizeStatus(activity.status);
              const isExpanded = expandedId === activity.id;
              const isOverdue = !!(activity.dueDate && isPast(parseISO(activity.dueDate)) && currentStatus !== 'completed');
              const justSaved = saved === activity.id;

              return (
                <Card key={activity.id} className={`transition-all ${isExpanded ? 'shadow-md' : ''}`}>
                  <CardContent className="p-0">
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
                            <span className="text-xs text-emerald-600 font-medium">Saved</span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {(['pending', 'inProgress', 'completed', 'cancelled'] as ActivityStatus[]).map((s) => (
                            <Button
                              key={s}
                              type="button"
                              size="sm"
                              variant={currentStatus === s ? 'default' : 'outline'}
                              className="h-7 text-xs"
                              onClick={() => handleStatusChange(activity.id, s)}
                            >
                              {STATUS_LABELS[s]}
                            </Button>
                          ))}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="bg-[#1D3461] hover:bg-[#0F2041]"
                          disabled={saving}
                          onClick={() => void handleSaveActivity(activity.id)}
                        >
                          {saving ? 'Saving…' : 'Save Progress'}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground pb-8">
          Secure external contributor portal — PACT Command Center
        </p>
      </div>
    </div>
  );
}
