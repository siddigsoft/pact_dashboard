
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { PageInfoBanner } from "@/components/financial/PageInfoBanner";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRange } from "react-day-picker";
import { format, addMonths, isToday, isSameDay, parseISO, isValid, startOfDay, endOfDay, getDay, addDays, differenceInCalendarDays } from "date-fns";
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
  const [viewMode, setViewMode] = useState<"daily" | "range" | "timeline">("daily");

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

  // Multi-day-aware: a task is shown on day D if startDate <= D <= dueDate.
  // Falls back to single-day match on dueDate if no startDate.
  const taskCoversDate = (t: PersonalTask, day: Date): boolean => {
    if (!t.dueDate) return false;
    try {
      const due = parseISO(t.dueDate);
      if (!isValid(due)) return false;
      const start = t.startDate ? parseISO(t.startDate) : due;
      if (!isValid(start)) return false;
      return day >= startOfDay(start) && day <= endOfDay(due);
    } catch { return false; }
  };

  const taskInSelectedRange = (t: PersonalTask): boolean => {
    if (!t.dueDate) return false;
    if (viewMode === 'daily') return taskCoversDate(t, date);
    if (!dateRange?.from) return false;
    const rStart = startOfDay(dateRange.from);
    const rEnd = endOfDay(dateRange.to ?? dateRange.from);
    try {
      const due = parseISO(t.dueDate);
      if (!isValid(due)) return false;
      const start = t.startDate ? parseISO(t.startDate) : due;
      if (!isValid(start)) return false;
      // overlap
      return start <= rEnd && due >= rStart;
    } catch { return false; }
  };

  const filteredTasks = useMemo(
    () => myOneTimeTasks.filter(taskInSelectedRange),
    [myOneTimeTasks, date, dateRange, viewMode]
  );

  // Anchor for interval-based recurrences (every_2_days / every_3_days / biweekly).
  // Prefer startDate, fall back to dueDate, then today.
  const recurrenceAnchor = (t: PersonalTask): Date | null => {
    const src = t.startDate ?? t.dueDate ?? null;
    if (!src) return startOfDay(new Date());
    try { const d = parseISO(src); return isValid(d) ? startOfDay(d) : null; } catch { return null; }
  };

  // Whether a recurring task (no dailyTaskDate) fires on a specific day.
  const recurrenceFiresOn = (t: PersonalTask, day: Date): boolean => {
    if (!t.recurrence || t.recurrence === 'none') return false;
    // Respect end date
    if (t.recurrenceEndDate) {
      try { const end = parseISO(t.recurrenceEndDate); if (isValid(end) && day > endOfDay(end)) return false; } catch {}
    }
    // Don't fire before start date / due date anchor
    const anchor = recurrenceAnchor(t);
    if (anchor && day < anchor) return false;

    const dow = getDay(day); // 0=Sun..6=Sat

    switch (t.recurrence) {
      case 'daily':
        return true;
      case 'weekdays':
        return dow >= 1 && dow <= 5;
      case 'weekly':
      case 'specific_days':
        return Array.isArray(t.recurrenceDays) && t.recurrenceDays.length > 0
          ? t.recurrenceDays.includes(dow)
          : false;
      case 'every_2_days':
      case 'every-2-days': {
        if (!anchor) return false;
        return differenceInCalendarDays(startOfDay(day), anchor) % 2 === 0;
      }
      case 'every_3_days':
      case 'every-3-days': {
        if (!anchor) return false;
        return differenceInCalendarDays(startOfDay(day), anchor) % 3 === 0;
      }
      case 'biweekly': {
        if (!anchor) return false;
        const diff = differenceInCalendarDays(startOfDay(day), anchor);
        return diff % 14 === 0;
      }
      case 'monthly': {
        const targetDay = t.recurrenceMonthlyDay ?? (anchor ? anchor.getDate() : 1);
        return day.getDate() === targetDay;
      }
      default:
        return false;
    }
  };

  const filteredDailyWorks = useMemo(() => {
    return myDailyWorks.filter(t => {
      // dailyTaskDate => exact date match
      if (t.dailyTaskDate) {
        try { const d = parseISO(t.dailyTaskDate); return isValid(d) && inSelectedRange(d); } catch { return false; }
      }
      if (!t.recurrence || t.recurrence === 'none') return false;
      if (viewMode === 'daily') return recurrenceFiresOn(t, date);
      if (dateRange?.from) {
        const end = dateRange.to ?? dateRange.from;
        for (let d = new Date(dateRange.from); d <= end; d.setDate(d.getDate() + 1)) {
          if (recurrenceFiresOn(t, new Date(d))) return true;
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
    if (myOneTimeTasks.some(t => taskCoversDate(t, day))) return true;
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
      <PageInfoBanner
        title="Schedule & Planning"
        description="Unified calendar showing every site visit, leave day, project milestone, and meeting on a single view. Switch between day, week, and month. Click any event to open it. The Outlook tab syncs with your Microsoft Outlook calendar so both stay in sync. Use the Planning tab to drag visits across days and adjust schedules."
        descriptionAr="تقويم موحد يعرض كل زيارة موقع، يوم إجازة، معلم مشروع، واجتماع في عرض واحد. بدّل بين اليوم والأسبوع والشهر. انقر على أي حدث لفتحه. تتزامن علامة التبويب Outlook مع تقويم Microsoft Outlook الخاص بك حتى يبقيا متزامنين. استخدم علامة تبويب التخطيط لسحب الزيارات عبر الأيام وتعديل الجداول."
      />
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
          onValueChange={(v) => setViewMode(v as "daily" | "range" | "timeline")}
          className="w-[360px]"
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
            <TabsTrigger value="timeline" className="flex-1" data-testid="tab-timeline">
              <CalendarDays className="h-4 w-4 mr-1" />
              Timeline
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {viewMode === 'timeline' && (
        <TimelineView
          startDate={date}
          tasks={myOneTimeTasks}
          dailyWorks={myDailyWorks}
          onOpenTask={(id) => navigate(`/my-tasks?taskId=${id}`)}
        />
      )}

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

// ── Timeline (Outlook-style 14-day horizontal grid) ─────────────────────────
function TimelineView({
  startDate,
  tasks,
  dailyWorks,
  onOpenTask,
}: {
  startDate: Date;
  tasks: PersonalTask[];
  dailyWorks: PersonalTask[];
  onOpenTask: (id: string) => void;
}) {
  const DAYS = 14;
  const days = Array.from({ length: DAYS }, (_, i) => addDays(startOfDay(startDate), i));
  const rangeStart = days[0];
  const rangeEnd = endOfDay(days[DAYS - 1]);

  // Materialise rows: any task whose [start..due] overlaps the visible window
  const rows = useMemo(() => {
    const all = [...tasks, ...dailyWorks];
    const out: Array<{
      task: PersonalTask;
      offset: number;       // 0..DAYS-1
      span: number;         // 1..DAYS
      hoursPerDay: number | null;
      isRecurring: boolean;
      recurringDays: Set<number>;
    }> = [];
    for (const t of all) {
      const isRecurring = !!(t.recurrence && t.recurrence !== 'none');
      if (isRecurring) {
        // Compute the exact set of dates within the visible window where this
        // recurrence fires. Supports daily, weekdays, weekly, specific_days,
        // monthly, every_2_days, every_3_days, biweekly.
        const fires = new Set<number>(); // day-offset indices into `days[]`
        const anchorSrc = t.startDate ?? t.dueDate ?? null;
        let anchor: Date | null = null;
        if (anchorSrc) {
          try { const d = parseISO(anchorSrc); if (isValid(d)) anchor = startOfDay(d); } catch {}
        }
        let endLimit: Date | null = null;
        if (t.recurrenceEndDate) {
          try { const e = parseISO(t.recurrenceEndDate); if (isValid(e)) endLimit = endOfDay(e); } catch {}
        }
        for (let i = 0; i < DAYS; i++) {
          const day = days[i];
          if (anchor && day < anchor) continue;
          if (endLimit && day > endLimit) continue;
          const dow = getDay(day);
          let hit = false;
          switch (t.recurrence) {
            case 'daily': hit = true; break;
            case 'weekdays': hit = dow >= 1 && dow <= 5; break;
            case 'weekly':
            case 'specific_days':
              hit = Array.isArray(t.recurrenceDays) && t.recurrenceDays.includes(dow);
              break;
            case 'every_2_days':
            case 'every-2-days':
              hit = !!anchor && differenceInCalendarDays(day, anchor) % 2 === 0;
              break;
            case 'every_3_days':
            case 'every-3-days':
              hit = !!anchor && differenceInCalendarDays(day, anchor) % 3 === 0;
              break;
            case 'biweekly':
              hit = !!anchor && differenceInCalendarDays(day, anchor) % 14 === 0;
              break;
            case 'monthly': {
              const target = t.recurrenceMonthlyDay ?? (anchor ? anchor.getDate() : 1);
              hit = day.getDate() === target;
              break;
            }
          }
          if (hit) fires.add(i);
        }
        if (fires.size > 0) {
          out.push({ task: t, offset: 0, span: DAYS, hoursPerDay: t.hoursPerDay, isRecurring: true, recurringDays: fires });
        }
        continue;
      }
      if (!t.dueDate) continue;
      try {
        const due = parseISO(t.dueDate);
        if (!isValid(due)) continue;
        const start = t.startDate ? parseISO(t.startDate) : due;
        if (!isValid(start)) continue;
        // Clip to visible window
        if (due < rangeStart || start > rangeEnd) continue;
        const clipStart = start < rangeStart ? rangeStart : startOfDay(start);
        const clipEnd = due > rangeEnd ? rangeEnd : endOfDay(due);
        const offset = Math.max(0, differenceInCalendarDays(clipStart, rangeStart));
        const span = Math.min(DAYS - offset, differenceInCalendarDays(clipEnd, clipStart) + 1);
        if (span <= 0) continue;
        out.push({ task: t, offset, span, hoursPerDay: t.hoursPerDay, isRecurring: false, recurringDays: new Set() });
      } catch { /* ignore */ }
    }
    return out;
  }, [tasks, dailyWorks, rangeStart, rangeEnd]);

  return (
    <Card data-testid="card-timeline">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-indigo-600" />
            Timeline · next {DAYS} days
          </CardTitle>
          <Badge variant="outline">{rows.length} task{rows.length !== 1 ? 's' : ''}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No scheduled tasks in the next {DAYS} days. Set <b>start</b> + <b>end</b> dates on a task to see it here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Day header row */}
              <div className="grid" style={{ gridTemplateColumns: `220px repeat(${DAYS}, minmax(56px, 1fr))` }}>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide px-2 py-1.5 border-b border-slate-200">
                  Task
                </div>
                {days.map((d) => (
                  <div
                    key={d.toISOString()}
                    className={`text-center text-[10px] font-semibold px-1 py-1.5 border-b border-slate-200 ${
                      isToday(d) ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'
                    }`}
                  >
                    <div>{format(d, 'EEE')}</div>
                    <div className={isToday(d) ? 'text-indigo-700 font-bold' : 'text-slate-700'}>{format(d, 'd')}</div>
                  </div>
                ))}
              </div>

              {/* Task rows */}
              {rows.map((r, idx) => (
                <div
                  key={`${r.task.id}-${idx}`}
                  className="grid border-b border-slate-100 hover:bg-slate-50/60"
                  style={{ gridTemplateColumns: `220px repeat(${DAYS}, minmax(56px, 1fr))` }}
                  data-testid={`timeline-row-${r.task.id}`}
                >
                  <button
                    onClick={() => onOpenTask(r.task.id)}
                    className="text-left px-2 py-2 truncate text-xs font-medium text-slate-700 hover:text-indigo-700 flex items-center gap-1.5"
                  >
                    {r.isRecurring ? (
                      <RefreshCw className="h-3 w-3 shrink-0 text-emerald-600" />
                    ) : r.task.category === 'project' ? (
                      <Briefcase className="h-3 w-3 shrink-0 text-violet-600" />
                    ) : (
                      <CheckSquare className="h-3 w-3 shrink-0 text-blue-600" />
                    )}
                    <span className="truncate">{r.task.title}</span>
                  </button>

                  {/* Empty cells for offset */}
                  {Array.from({ length: r.offset }).map((_, i) => (
                    <div key={`pad-${i}`} className="border-l border-slate-50" />
                  ))}

                  {/* For recurring: dot per matching weekday; for one-time: single bar */}
                  {r.isRecurring ? (
                    days.map((d, i) => {
                      const matches = r.recurringDays.has(i);
                      return (
                        <div key={d.toISOString()} className="border-l border-slate-50 flex items-center justify-center py-2">
                          {matches && (
                            <div
                              className="w-full h-6 rounded bg-emerald-100 border border-emerald-300 text-[9px] font-bold text-emerald-800 flex items-center justify-center"
                              title={`${r.task.title}${r.hoursPerDay ? ` · ${r.hoursPerDay}h` : ''}`}
                            >
                              {r.hoursPerDay ? `${r.hoursPerDay}h` : '•'}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div
                      className={`my-2 rounded px-1.5 text-[10px] font-bold flex items-center justify-between gap-1 truncate ${
                        r.task.priority === 'critical' ? 'bg-rose-100 border border-rose-300 text-rose-800'
                        : r.task.priority === 'high' ? 'bg-amber-100 border border-amber-300 text-amber-800'
                        : r.task.category === 'project' ? 'bg-violet-100 border border-violet-300 text-violet-800'
                        : 'bg-blue-100 border border-blue-300 text-blue-800'
                      }`}
                      style={{ gridColumn: `span ${r.span} / span ${r.span}` }}
                      title={`${r.task.title}${r.hoursPerDay ? ` · ${r.hoursPerDay}h/day` : ''}`}
                    >
                      <span className="truncate">{r.task.title}</span>
                      {r.hoursPerDay != null && <span className="shrink-0">{r.hoursPerDay}h/d</span>}
                    </div>
                  )}

                  {/* Trailing pad cells */}
                  {!r.isRecurring && Array.from({ length: Math.max(0, DAYS - r.offset - r.span) }).map((_, i) => (
                    <div key={`tail-${i}`} className="border-l border-slate-50" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
