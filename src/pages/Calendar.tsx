
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRange } from "react-day-picker";
import { format, addMonths, isToday, isSameDay, parseISO, isValid, startOfDay, endOfDay, getDay } from "date-fns";
import { useSiteVisitContext } from "@/context/siteVisit/SiteVisitContext";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarClock,
  MapPin,
  Clock,
  CalendarX,
  Eye,
  CheckSquare,
  RefreshCw,
  Briefcase,
  Mail,
  Loader2,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useUser } from "@/context/user/UserContext";
import { getHubAccessInfo, isStateNameInHub, normalizeStateName, normalizeStateId } from "@/utils/hubAccessControl";
import { usePersonalTasks, type PersonalTask } from "@/hooks/usePersonalTasks";
import { useOutlookCalendar, type CalendarEvent } from "@/hooks/useOutlookCalendar";

function normalizeRole(role: string): string {
  return role.toLowerCase().replace(/[\s_-]+/g, '');
}

function hasRoleIn(role: string, targets: string[]): boolean {
  const normalized = normalizeRole(role);
  return targets.some(t => normalizeRole(t) === normalized);
}

const GLOBAL_ADMIN_ROLES = [
  'admin', 'superAdmin', 'super_admin', 'Super Admin',
  'ict', 'ICT', 'ICT admin',
  'fom', 'fieldOpManager', 'Field Operation Manager (FOM)', 'Field Operation Manager',
  'countryDirector', 'country_director', 'Country Director',
  'financialAdmin', 'financial_admin', 'Financial Admin',
  'projectManager', 'project_manager', 'Project Manager',
  'seniorOperationsLead', 'senior_operations_lead', 'Senior Operations Lead',
];

const SUPERVISOR_ROLES = ['supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor'];
const DATA_TEAM_ROLES = ['dataTeam', 'data_team', 'Data Team', 'DataTeam'];
const COORDINATOR_ROLES = ['coordinator', 'Coordinator'];
const DATA_COLLECTOR_ROLES = ['dataCollector', 'data_collector', 'Data Collector', 'DataCollector', 'datacollector'];

const PRIORITY_BADGE: Record<string, 'destructive' | 'warning' | 'outline' | 'secondary'> = {
  critical: 'destructive', high: 'destructive', medium: 'warning', low: 'outline',
};

const CalendarPage = () => {
  const { siteVisits } = useSiteVisitContext();
  const navigate = useNavigate();
  const { currentUser, users } = useUser();
  const { tasks: personalTasks } = usePersonalTasks(currentUser?.id);
  const outlook = useOutlookCalendar();

  const [date, setDate] = useState<Date>(new Date());
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: addMonths(new Date(), 1),
  });
  const [viewMode, setViewMode] = useState<"daily" | "range">("daily");

  const userRole = currentUser?.role || '';
  const isGlobalAdmin = hasRoleIn(userRole, GLOBAL_ADMIN_ROLES);
  const isSupervisor = hasRoleIn(userRole, SUPERVISOR_ROLES);
  const isDataTeam = hasRoleIn(userRole, DATA_TEAM_ROLES);
  const isCoordinator = hasRoleIn(userRole, COORDINATOR_ROLES);
  const isDataCollector = hasRoleIn(userRole, DATA_COLLECTOR_ROLES);
  const isFieldRole = isSupervisor || isDataTeam || isCoordinator || isDataCollector;
  // "Employee" = office staff with no field/admin role → no site visits
  const canSeeSiteVisits = isGlobalAdmin || isFieldRole;
  const isEmployee = !canSeeSiteVisits;

  const hubAccessInfo = useMemo(() => getHubAccessInfo(currentUser), [currentUser]);

  // ── Role-filtered site visits (unchanged) ────────────────────────────────────
  const roleFilteredVisits = useMemo(() => {
    if (!currentUser || !canSeeSiteVisits) return [];
    if (isGlobalAdmin) return siteVisits;
    if (isSupervisor && currentUser.hubId) {
      return siteVisits.filter(visit => {
        const visitState = visit.state || (visit as any).stateName || (visit as any).state_name || '';
        if (visitState && hubAccessInfo.hubIds.some(hId => isStateNameInHub(visitState, hId))) return true;
        const hubOffice = (visit as any).hubOffice || visit.hub || '';
        if (hubOffice) {
          const normalizedHubOffice = normalizeRole(hubOffice);
          if (hubAccessInfo.hubIds.some(hId => normalizedHubOffice.includes(normalizeRole(hId)))) return true;
        }
        return false;
      });
    }
    if (isDataTeam && currentUser.stateId) {
      return siteVisits.filter(visit => {
        const visitState = visit.state || '';
        const userState = currentUser.stateId || '';
        if (normalizeStateName(visitState) === normalizeStateName(userState)) return true;
        if (normalizeStateId(visitState) === normalizeStateId(userState)) return true;
        return false;
      });
    }
    if (isCoordinator) {
      return siteVisits.filter(visit => (
        visit.assignedTo === currentUser.id ||
        (visit as any).team?.coordinator === currentUser.id ||
        visit.assignedBy === currentUser.id ||
        (visit as any).dispatched_by === currentUser.id ||
        (visit as any).forwarded_to_user_id === currentUser.id ||
        (visit as any).accepted_by === currentUser.id
      ));
    }
    if (isDataCollector) {
      return siteVisits.filter(visit => (
        visit.assignedTo === currentUser.id ||
        (visit as any).accepted_by === currentUser.id ||
        (visit as any).forwarded_to_user_id === currentUser.id ||
        (visit as any).team?.fieldOfficer === currentUser.id
      ));
    }
    return [];
  }, [siteVisits, currentUser, canSeeSiteVisits, isGlobalAdmin, isSupervisor, isDataTeam, isCoordinator, isDataCollector, hubAccessInfo]);

  // ── Tasks the current user owns or is assigned to ────────────────────────────
  // Personal tasks are already filtered server-side by the hook; split into one-time vs daily-works.
  const myTasksAll = personalTasks ?? [];
  const myOneTimeTasks = useMemo(() => myTasksAll.filter(t => {
    if (t.status === 'cancelled' || t.status === 'done') return false;
    const isRecurring = !!t.dailyTaskDate || (t.recurrence && t.recurrence !== 'none');
    return !isRecurring;
  }), [myTasksAll]);
  const myDailyWorks = useMemo(() => myTasksAll.filter(t => {
    if (t.status === 'cancelled') return false;
    return !!t.dailyTaskDate || (t.recurrence && t.recurrence !== 'none');
  }), [myTasksAll]);

  // ── Outlook meetings: auto-fetch for the visible day when connected ──────────
  useEffect(() => {
    if (!outlook.account) return;
    if (viewMode === 'daily') {
      outlook.fetchMyEvents(startOfDay(date), endOfDay(date));
    } else if (dateRange?.from) {
      outlook.fetchMyEvents(startOfDay(dateRange.from), endOfDay(dateRange.to ?? dateRange.from));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlook.account, date, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), viewMode]);

  // ── Date filtering helpers ───────────────────────────────────────────────────
  const inSelectedRange = (d: Date): boolean => {
    if (viewMode === 'daily') return isSameDay(d, date);
    if (!dateRange?.from) return false;
    if (!dateRange.to) return isSameDay(d, dateRange.from);
    return d >= startOfDay(dateRange.from) && d <= endOfDay(dateRange.to);
  };

  const filteredVisits = useMemo(() => roleFilteredVisits.filter(v => {
    const d = new Date(v.dueDate); return isValid(d) && inSelectedRange(d);
  }), [roleFilteredVisits, date, dateRange, viewMode]);

  const filteredTasks = useMemo(() => myOneTimeTasks.filter(t => {
    if (!t.dueDate) return false;
    try { const d = parseISO(t.dueDate); return isValid(d) && inSelectedRange(d); } catch { return false; }
  }), [myOneTimeTasks, date, dateRange, viewMode]);

  const filteredDailyWorks = useMemo(() => {
    return myDailyWorks.filter(t => {
      // dailyTaskDate => exact date match
      if (t.dailyTaskDate) {
        try { const d = parseISO(t.dailyTaskDate); return isValid(d) && inSelectedRange(d); } catch { return false; }
      }
      // recurrence: daily always shows; weekly/specific_days check day-of-week
      if (t.recurrence === 'daily') return true;
      if ((t.recurrence === 'weekly' || t.recurrence === 'specific_days') && Array.isArray(t.recurrenceDays) && t.recurrenceDays.length > 0) {
        if (viewMode === 'daily') return t.recurrenceDays.includes(getDay(date));
        if (dateRange?.from) {
          const days: number[] = [];
          const end = dateRange.to ?? dateRange.from;
          for (let d = new Date(dateRange.from); d <= end; d.setDate(d.getDate() + 1)) days.push(d.getDay());
          return days.some(d => t.recurrenceDays!.includes(d));
        }
      }
      return false;
    });
  }, [myDailyWorks, date, dateRange, viewMode]);

  const filteredMeetings = useMemo(() => (outlook.events ?? []).filter(e => {
    try {
      const start = e.start ? new Date(e.start) : null;
      return start && isValid(start) && inSelectedRange(start);
    } catch { return false; }
  }), [outlook.events, date, dateRange, viewMode]);

  // ── Calendar dot indicators (any item that day) ──────────────────────────────
  const isDayWithItems = (day: Date) => {
    if (canSeeSiteVisits && roleFilteredVisits.some(v => { const d = new Date(v.dueDate); return isValid(d) && isSameDay(d, day); })) return true;
    if (myOneTimeTasks.some(t => { try { const d = parseISO(t.dueDate ?? ''); return isValid(d) && isSameDay(d, day); } catch { return false; } })) return true;
    if (outlook.events.some(e => { try { const d = e.start ? new Date(e.start) : null; return d && isValid(d) && isSameDay(d, day); } catch { return false; } })) return true;
    return false;
  };

  const accessLevelLabel = useMemo(() => {
    if (isGlobalAdmin) return 'All Hubs & Teams';
    if (isSupervisor) {
      if (hubAccessInfo.isCountryOffice) return 'All Hubs (Country Office)';
      const userHubs = [currentUser?.hubId, (currentUser as any)?.secondaryHubId].filter(Boolean);
      if (userHubs.length > 1) return `Hubs: ${userHubs.join(' & ')}`;
      return `Hub: ${userHubs[0] || 'Your Hub'}`;
    }
    if (isDataTeam) return `State: ${currentUser?.stateId || 'Your State'}`;
    if (isCoordinator) return 'Your Coordinated Visits';
    if (isDataCollector) return 'Your Assigned Visits';
    return 'My Tasks, Daily Works & Meetings';
  }, [isGlobalAdmin, isSupervisor, isDataTeam, isCoordinator, isDataCollector, currentUser, hubAccessInfo]);

  const resolveUserName = (id?: string) => {
    if (!id) return undefined;
    const u = (users || []).find(u => u.id === id);
    return u?.name || (u as any)?.fullName || (u as any)?.username;
  };

  const dateRangeLabel = viewMode === 'daily'
    ? format(date, 'MMMM d, yyyy')
    : dateRange?.from
      ? `${format(dateRange.from, 'MMM d')}${dateRange.to ? ` – ${format(dateRange.to, 'MMM d, yyyy')}` : ''}`
      : 'selected range';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <CalendarDays className="mr-2 h-6 w-6" />
            Schedule & Planning
          </h1>
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground" data-testid="text-access-level">
            <Eye className="h-3.5 w-3.5" />
            <span>Viewing: <span className="font-medium text-foreground/80">{accessLevelLabel}</span></span>
            {!isGlobalAdmin && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 ml-1">
                Filtered
              </Badge>
            )}
          </div>
        </div>
        <Tabs
          value={viewMode}
          onValueChange={(v) => setViewMode(v as "daily" | "range")}
          className="w-[240px]"
        >
          <TabsList className="w-full">
            <TabsTrigger value="daily" className="flex-1">
              <CalendarIcon className="h-4 w-4 mr-1" />
              Daily
            </TabsTrigger>
            <TabsTrigger value="range" className="flex-1">
              <CalendarClock className="h-4 w-4 mr-1" />
              Range
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Calendar (left) ─── */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Calendar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <Tabs value={viewMode} className="w-full">
              <TabsContent value="daily" className="mt-0">
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(newDate) => setDate(newDate || new Date())}
                    className="rounded-md w-full"
                    modifiers={{
                      withVisits: (day) => isDayWithItems(day),
                      today: (day) => isToday(day),
                    }}
                    modifiersStyles={{
                      withVisits: {
                        backgroundColor: "rgba(99, 102, 241, 0.1)",
                        fontWeight: "bold",
                        color: "#4F46E5",
                      },
                      today: {
                        fontWeight: "bold",
                        border: "2px solid currentColor",
                      },
                    }}
                  />
                </div>
              </TabsContent>
              <TabsContent value="range" className="mt-0">
                <div className="flex justify-center w-full">
                  <DatePickerWithRange
                    dateRange={dateRange}
                    onDateRangeChange={setDateRange}
                  />
                </div>
              </TabsContent>
            </Tabs>

            {canSeeSiteVisits && (
              <div className="mt-6 w-full">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/site-visits/create")}
                  className="w-full flex items-center justify-center gap-2"
                  data-testid="button-schedule-new-visit"
                >
                  <CalendarClock className="h-4 w-4" />
                  Schedule New Site Visit
                </Button>
              </div>
            )}
            <div className="mt-3 w-full flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/my-tasks")}
                className="w-full flex items-center justify-center gap-2"
                data-testid="button-open-my-tasks"
              >
                <CheckSquare className="h-4 w-4" />
                Open My Tasks
              </Button>
              {!outlook.account ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={outlook.connect}
                  disabled={outlook.isConnecting}
                  className="w-full flex items-center justify-center gap-2"
                  data-testid="button-connect-outlook"
                >
                  {outlook.isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  {outlook.isConnecting ? 'Connecting…' : 'Connect Outlook for Meetings'}
                </Button>
              ) : (
                <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  Outlook connected — meetings will appear below.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ─── Right column: stack of role-aware sections ─── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Site Visits — only for field roles & admins */}
          {canSeeSiteVisits && (
            <Card data-testid="section-site-visits">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-indigo-600" />
                  Scheduled for {dateRangeLabel}
                </CardTitle>
                <Badge variant="outline">
                  {filteredVisits.length} visit{filteredVisits.length !== 1 ? 's' : ''}
                </Badge>
              </CardHeader>
              <CardContent>
                {filteredVisits.length > 0 ? (
                  <ScrollArea className="h-[420px] pr-4">
                    <div className="space-y-3">
                      {filteredVisits.map((visit, idx) => (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          key={visit.id}
                          className="border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
                          onClick={() => navigate(`/site-visits/${visit.id}`)}
                          data-testid={`visit-card-${visit.id}`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-medium">{visit.siteName}</h3>
                              <div className="flex items-center text-sm text-muted-foreground mt-1">
                                <MapPin className="h-4 w-4 mr-1" />
                                <span>
                                  {visit.locality}
                                  {visit.state && `, ${visit.state}`}
                                </span>
                              </div>
                            </div>
                            <Badge
                              className="capitalize"
                              variant={
                                visit.status === "completed" ? "success" :
                                visit.status === "pending"   ? "outline" :
                                visit.status === "inProgress" ? "secondary" : "outline"
                              }
                            >
                              {visit.status}
                            </Badge>
                          </div>
                          <div className="mt-3 flex gap-4 text-sm">
                            <div className="flex items-center text-muted-foreground">
                              <Clock className="h-4 w-4 mr-1" />
                              {format(new Date(visit.dueDate), "HH:mm")}
                            </div>
                            {visit.priority && (
                              <Badge
                                variant={PRIORITY_BADGE[String(visit.priority)] ?? 'outline'}
                                className="capitalize text-xs"
                              >
                                {visit.priority}
                              </Badge>
                            )}
                            {visit.visitType && (
                              <Badge variant="outline" className="bg-slate-100 text-xs">
                                {visit.visitType}
                              </Badge>
                            )}
                          </div>
                          {visit.assignedTo && (
                            <div className="text-sm mt-2 flex items-center">
                              <span className="text-muted-foreground mr-2">Assigned to:</span>
                              <span className="font-medium">{resolveUserName(visit.assignedTo) || 'Unknown'}</span>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[200px] text-center">
                    <CalendarX className="h-12 w-12 text-gray-300 mb-3" />
                    <p className="text-muted-foreground text-sm">
                      No site visits scheduled for {dateRangeLabel}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* My Tasks — visible to everyone */}
          <Card data-testid="section-my-tasks">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-blue-600" />
                My Tasks
              </CardTitle>
              <Badge variant="outline">
                {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
              </Badge>
            </CardHeader>
            <CardContent>
              {filteredTasks.length > 0 ? (
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-2.5">
                    {filteredTasks.map((t) => (
                      <TaskRow key={t.id} task={t} onOpen={() => navigate(`/my-tasks?taskId=${t.id}`)} />
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No tasks due {dateRangeLabel.toLowerCase().includes('–') ? 'in this range' : 'on this day'}.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Daily Works — visible to everyone */}
          <Card data-testid="section-daily-works">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-emerald-600" />
                Daily Works
              </CardTitle>
              <Badge variant="outline">
                {filteredDailyWorks.length} item{filteredDailyWorks.length !== 1 ? 's' : ''}
              </Badge>
            </CardHeader>
            <CardContent>
              {filteredDailyWorks.length > 0 ? (
                <div className="space-y-2.5">
                  {filteredDailyWorks.map((t) => (
                    <TaskRow key={t.id} task={t} onOpen={() => navigate(`/my-tasks?taskId=${t.id}`)} compact />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No recurring or day-to-day items for {dateRangeLabel}.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Meetings (Outlook) — visible to everyone */}
          <Card data-testid="section-meetings">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Mail className="h-5 w-5 text-orange-600" />
                Meetings (Outlook)
              </CardTitle>
              <Badge variant="outline">
                {filteredMeetings.length} meeting{filteredMeetings.length !== 1 ? 's' : ''}
              </Badge>
            </CardHeader>
            <CardContent>
              {!outlook.account ? (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 text-[12px] text-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    Connect your Outlook account to see meetings and invitations from your email here.
                    Use the <strong>Connect Outlook</strong> button on the left.
                  </div>
                </div>
              ) : outlook.isFetchingEvents ? (
                <p className="text-sm text-muted-foreground py-6 text-center flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading meetings…
                </p>
              ) : outlook.error ? (
                <p className="text-sm text-red-600 py-6 text-center">{outlook.error}</p>
              ) : filteredMeetings.length > 0 ? (
                <div className="space-y-2.5">
                  {filteredMeetings.map((e) => (
                    <MeetingRow key={e.id} event={e} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No meetings on {dateRangeLabel}.
                </p>
              )}
            </CardContent>
          </Card>

          {isEmployee && (
            <p className="text-[11px] text-muted-foreground text-center px-4">
              Site visit scheduling is only available to field roles. You can manage all your work here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────────

function TaskRow({ task, onOpen, compact = false }: { task: PersonalTask; onOpen: () => void; compact?: boolean }) {
  const due = (() => {
    if (!task.dueDate) return null;
    try { const d = parseISO(task.dueDate); return isValid(d) ? d : null; } catch { return null; }
  })();
  return (
    <div
      onClick={onOpen}
      className="border rounded-lg p-3 hover:shadow-sm hover:bg-slate-50 transition-all cursor-pointer flex items-start gap-3"
      data-testid={`task-row-${task.id}`}
    >
      <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
        task.category === 'project' ? 'bg-violet-100 text-violet-700' :
        task.category === 'recurring' ? 'bg-emerald-100 text-emerald-700' :
        'bg-blue-100 text-blue-700'
      }`}>
        {task.category === 'project' ? <Briefcase className="h-4 w-4" /> :
         task.category === 'recurring' ? <RefreshCw className="h-4 w-4" /> :
         <CheckSquare className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.title}</p>
        {!compact && task.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{task.description.replace(/<[^>]*>/g, ' ').slice(0, 120)}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {due && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />{format(due, 'HH:mm')}
            </span>
          )}
          {task.priority && (
            <Badge variant={PRIORITY_BADGE[task.priority] ?? 'outline'} className="text-[10px] capitalize px-1.5 py-0 h-4">
              {task.priority}
            </Badge>
          )}
          {task.status && (
            <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0 h-4">
              {String(task.status).replace(/_/g, ' ')}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function MeetingRow({ event }: { event: CalendarEvent }) {
  const start = event.start ? new Date(event.start) : null;
  const end = event.end ? new Date(event.end) : null;
  return (
    <div className="border rounded-lg p-3 hover:shadow-sm hover:bg-slate-50 transition-all flex items-start gap-3" data-testid={`meeting-row-${event.id}`}>
      <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 bg-orange-100 text-orange-700">
        <Mail className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{event.subject}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {start && end && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {event.isAllDay ? 'All day' : `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`}
            </span>
          )}
          {event.location && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" />{event.location}
            </span>
          )}
          {event.organizer && (
            <span className="text-[11px] text-muted-foreground">From: {event.organizer}</span>
          )}
          <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0 h-4">
            {event.status}
          </Badge>
        </div>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-50" />
    </div>
  );
}

export default CalendarPage;
