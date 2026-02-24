
import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRange } from "react-day-picker";
import { format, addMonths, subMonths, isToday, isSameDay } from "date-fns";
import { useSiteVisitContext } from "@/context/siteVisit/SiteVisitContext";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Calendar as CalendarIcon,
  CalendarDays,
  CalendarClock,
  List,
  Map,
  MapPin,
  Clock,
  CalendarX,
  Shield,
  Eye,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useUser } from "@/context/user/UserContext";
import { getHubAccessInfo, filterByHubAccess, isStateNameInHub, normalizeStateName, normalizeStateId } from "@/utils/hubAccessControl";

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

const CalendarPage = () => {
  const { siteVisits } = useSiteVisitContext();
  const navigate = useNavigate();
  const { currentUser, users } = useUser();

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

  const hubAccessInfo = useMemo(() => getHubAccessInfo(currentUser), [currentUser]);

  const roleFilteredVisits = useMemo(() => {
    if (!currentUser) return [];

    if (isGlobalAdmin) {
      return siteVisits;
    }

    if (isSupervisor && currentUser.hubId) {
      const primaryHub = currentUser.hubId || '';
      const secondaryHub = (currentUser as any).secondaryHubId || '';
      const userHubs = [primaryHub, secondaryHub].filter(Boolean);

      const isCountryOffice = userHubs.some(h => 
        normalizeRole(h).includes('countryoffice') || normalizeRole(h) === 'country_office'
      );
      if (isCountryOffice) {
        return siteVisits;
      }

      return siteVisits.filter(visit => {
        for (const hubId of userHubs) {
          if (visit.state && isStateNameInHub(visit.state, hubId)) return true;
          const hubOffice = (visit as any).hubOffice || visit.hub || '';
          if (hubOffice && normalizeRole(hubOffice).includes(normalizeRole(hubId))) return true;
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
      return siteVisits.filter(visit => {
        if (visit.assignedTo === currentUser.id) return true;
        if ((visit as any).team?.coordinator === currentUser.id) return true;
        if (visit.assignedBy === currentUser.id) return true;
        if ((visit as any).dispatched_by === currentUser.id) return true;
        if ((visit as any).forwarded_to_user_id === currentUser.id) return true;
        if ((visit as any).accepted_by === currentUser.id) return true;
        return false;
      });
    }

    if (isDataCollector) {
      return siteVisits.filter(visit => {
        if (visit.assignedTo === currentUser.id) return true;
        if ((visit as any).accepted_by === currentUser.id) return true;
        if ((visit as any).forwarded_to_user_id === currentUser.id) return true;
        if ((visit as any).team?.fieldOfficer === currentUser.id) return true;
        return false;
      });
    }

    return siteVisits.filter(visit => {
      return visit.assignedTo === currentUser.id ||
             (visit as any).accepted_by === currentUser.id;
    });
  }, [siteVisits, currentUser, isGlobalAdmin, isSupervisor, isDataTeam, isCoordinator, isDataCollector, hubAccessInfo]);

  const filteredVisits = useMemo(() => {
    if (viewMode === "daily" && date) {
      return roleFilteredVisits.filter((visit) => {
        const visitDate = new Date(visit.dueDate);
        return isSameDay(visitDate, date);
      });
    } else if (viewMode === "range" && dateRange?.from) {
      return roleFilteredVisits.filter((visit) => {
        const visitDate = new Date(visit.dueDate);
        if (dateRange.to) {
          return (
            visitDate >= dateRange.from! && visitDate <= dateRange.to
          );
        } else {
          return isSameDay(visitDate, dateRange.from!);
        }
      });
    }
    return [];
  }, [roleFilteredVisits, date, dateRange, viewMode]);

  const accessLevelLabel = useMemo(() => {
    if (isGlobalAdmin) return 'All Hubs & Teams';
    if (isSupervisor) {
      const primaryHub = currentUser?.hubId || '';
      const secondaryHub = (currentUser as any)?.secondaryHubId || '';
      const hubs = [primaryHub, secondaryHub].filter(Boolean);
      const isCountryOffice = hubs.some(h => 
        normalizeRole(h).includes('countryoffice') || normalizeRole(h) === 'country_office'
      );
      if (isCountryOffice) return 'All Hubs (Country Office)';
      if (hubs.length > 1) return `Hubs: ${hubs.join(' & ')}`;
      return `Hub: ${hubs[0] || 'Your Hub'}`;
    }
    if (isDataTeam) return `State: ${currentUser?.stateId || 'Your State'}`;
    if (isCoordinator) return 'Your Coordinated Visits';
    if (isDataCollector) return 'Your Assigned Visits';
    return 'Your Visits';
  }, [isGlobalAdmin, isSupervisor, isDataTeam, isCoordinator, isDataCollector, currentUser]);

  const resolveUserName = (id?: string) => {
    if (!id) return undefined;
    const u = (users || []).find(u => u.id === id);
    return u?.name || (u as any)?.fullName || (u as any)?.username;
  };

  // Handler to navigate to site visit details
  const handleVisitClick = (visitId: string) => {
    navigate(`/site-visits/${visitId}`);
  };

  const isDayWithVisits = (day: Date) => {
    return roleFilteredVisits.some((visit) => {
      const visitDate = new Date(visit.dueDate);
      return isSameDay(visitDate, day);
    });
  };

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
                      withVisits: (day) => isDayWithVisits(day),
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

            <div className="mt-6 w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/site-visits/create")}
                className="w-full flex items-center justify-center gap-2"
              >
                <CalendarClock className="h-4 w-4" />
                Schedule New Site Visit
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">
              {viewMode === "daily"
                ? `Scheduled for ${format(date, "MMMM d, yyyy")}`
                : "Scheduled Visits"}
            </CardTitle>
            <Badge variant="outline" className="ml-auto">
              {filteredVisits.length} visit{filteredVisits.length !== 1 ? 's' : ''}
            </Badge>
          </CardHeader>
          <CardContent>
            {filteredVisits.length > 0 ? (
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-3">
                  {filteredVisits.map((visit, idx) => (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      key={visit.id}
                      className="border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => handleVisitClick(visit.id)}
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
                            visit.status === "completed"
                              ? "success"
                              : visit.status === "pending"
                              ? "outline"
                              : visit.status === "inProgress"
                              ? "secondary"
                              : "outline"
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
                            variant={
                              visit.priority === "high"
                                ? "destructive"
                                : visit.priority === "medium"
                                ? "warning"
                                : "outline"
                            }
                            className="capitalize text-xs"
                          >
                            {visit.priority}
                          </Badge>
                        )}
                        {visit.visitType && (
                          <Badge
                            variant="outline"
                            className="bg-slate-100 text-xs"
                          >
                            {visit.visitType}
                          </Badge>
                        )}
                      </div>
                      {visit.assignedTo && (
                        <div className="text-sm mt-2 flex items-center">
                          <span className="text-muted-foreground mr-2">
                            Assigned to:
                          </span>
                          <span className="font-medium">
                            {resolveUserName(visit.assignedTo) || 'Unknown'}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-center">
                <CalendarX className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium mb-1">No visits scheduled</h3>
                <p className="text-muted-foreground mb-4">
                  {viewMode === "daily"
                    ? `No site visits scheduled for ${format(date, "MMMM d, yyyy")}`
                    : "No site visits found in the selected date range"}
                </p>
                <Button
                  variant="outline"
                  onClick={() => navigate("/site-visits/create")}
                  className="flex items-center gap-2"
                >
                  <CalendarClock className="h-4 w-4" />
                  Schedule a Visit
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CalendarPage;

