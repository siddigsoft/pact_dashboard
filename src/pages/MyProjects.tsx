/**
 * MyProjects — A personal project portal visible to every authenticated user.
 * Shows only the projects the logged-in user is a member of (PM, member, or team composition).
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FolderKanban, Search, CalendarDays, Users, DollarSign,
  ArrowRight, Clock, CheckCircle2, Pause, XCircle, FileEdit,
  Briefcase, MessageSquare, CheckSquare, AlertCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useUserProjects } from '@/hooks/useUserProjects';
import { useAppContext } from '@/context/AppContext';
import { useProjectCommentUnread } from '@/hooks/useProjectCommentUnread';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/project';

/* ── Status styling ── */
const STATUS_CFG: Record<string, { label: string; icon: any; cls: string }> = {
  active:    { label: 'Active',      icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' },
  draft:     { label: 'Draft',       icon: FileEdit,     cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
  onHold:    { label: 'On Hold',     icon: Pause,        cls: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' },
  completed: { label: 'Completed',   icon: CheckCircle2, cls: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' },
  cancelled: { label: 'Cancelled',   icon: XCircle,      cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
};

function statusCfg(s?: string) { return STATUS_CFG[s ?? ''] ?? STATUS_CFG.draft; }

function getMyRole(project: Project, userId?: string): 'Project Manager' | 'Team Member' | 'Consultant' {
  if (!userId) return 'Team Member';
  if (project.team?.projectManager === userId) return 'Project Manager';
  if ((project.team as any)?.teamComposition?.some((m: any) => m?.userId === userId)) return 'Consultant';
  return 'Team Member';
}

function daysLeft(endDate?: string): number | null {
  if (!endDate) return null;
  const diff = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000);
  return diff;
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Project card ── */
function ProjectCard({ project, userId }: { project: Project; userId?: string }) {
  const navigate = useNavigate();
  const cfg = statusCfg(project.status);
  const StatusIcon = cfg.icon;
  const myRole = getMyRole(project, userId);
  const days = daysLeft(project.endDate);
  const budget = (project as any).budget;
  const { unreadCount } = useProjectCommentUnread(project.id, userId);

  return (
    <Card
      className="group border-border/60 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
            <FolderKanban className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">{project.name}</p>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{project.projectCode || project.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0', cfg.cls)}>
            <StatusIcon className="h-2.5 w-2.5" />
            {cfg.label}
          </span>
        </div>

        {/* Role badge */}
        <div className="flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">My role:</span>
          <span className="text-[11px] font-semibold text-foreground">{myRole}</span>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center gap-1 text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            <span>Start: <strong className="text-foreground">{fmtDate(project.startDate)}</strong></span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            <span>End: <strong className="text-foreground">{fmtDate(project.endDate)}</strong></span>
          </div>
        </div>

        {/* Budget if available */}
        {budget?.total > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <DollarSign className="h-3 w-3" />
            <span>Budget: <strong className="text-foreground">{budget.currency} {budget.total.toLocaleString()}</strong></span>
          </div>
        )}

        {/* Days left indicator */}
        {days !== null && project.status === 'active' && (
          <div className={cn(
            'flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1',
            days < 0 ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' :
            days < 14 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
            'bg-muted/50 text-muted-foreground'
          )}>
            {days < 0
              ? <><AlertCircle className="h-3 w-3" /> Overdue by {Math.abs(days)} days</>
              : days === 0
              ? <><Clock className="h-3 w-3" /> Due today</>
              : <><Clock className="h-3 w-3" /> {days} days remaining</>
            }
          </div>
        )}

        {/* Quick action row */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] flex-1 justify-start gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); navigate(`/projects/${project.id}?tab=field_tasks`); }}
          >
            <CheckSquare className="h-3.5 w-3.5" /> Tasks
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] flex-1 justify-start gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={e => { e.stopPropagation(); navigate(`/projects/${project.id}?tab=comments`); }}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Comments
            {unreadCount > 0 && (
              <span className="ml-auto flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-none">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1 text-primary hover:text-primary/80"
            onClick={e => { e.stopPropagation(); navigate(`/projects/${project.id}`); }}
          >
            Open <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Page ── */
export default function MyProjects() {
  const { currentUser } = useAppContext();
  const { userProjects } = useUserProjects();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return userProjects.filter(p => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.projectCode || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      return matchSearch && matchStatus && !p.archived;
    });
  }, [userProjects, search, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, active: 0, draft: 0, onHold: 0, completed: 0 };
    userProjects.forEach(p => { if (!p.archived) { c.all++; c[p.status] = (c[p.status] ?? 0) + 1; } });
    return c;
  }, [userProjects]);

  const statusFilters = [
    { key: 'all',       label: 'All'       },
    { key: 'active',    label: 'Active'    },
    { key: 'draft',     label: 'Draft'     },
    { key: 'onHold',    label: 'On Hold'   },
    { key: 'completed', label: 'Completed' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <FolderKanban className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">My Projects</h1>
            <p className="text-sm text-muted-foreground">
              {counts.all} project{counts.all !== 1 ? 's' : ''} you're part of
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* ── Status filter pills ── */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map(sf => (
          <button
            key={sf.key}
            onClick={() => setStatusFilter(sf.key)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-semibold border transition-all',
              statusFilter === sf.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-background text-muted-foreground hover:bg-muted'
            )}
          >
            {sf.label}
            {counts[sf.key] > 0 && (
              <span className={cn('ml-1.5 px-1.5 py-0.5 rounded-full text-[9px]',
                statusFilter === sf.key ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                {counts[sf.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Project grid ── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-20 text-center">
          <FolderKanban className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {search ? 'No projects match your search' : 'No projects found'}
          </p>
          {!search && (
            <p className="text-xs text-muted-foreground mt-1">
              You'll appear here once you're added to a project team.
            </p>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(project => (
            <ProjectCard key={project.id} project={project} userId={currentUser?.id} />
          ))}
        </div>
      )}
    </div>
  );
}
