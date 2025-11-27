import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { SiteVisit } from '@/types';
import { Clock, CheckCircle, AlertCircle, CalendarClock, AlertTriangle, Send, UserCheck, PlayCircle } from 'lucide-react';
import { isOverdue } from '@/utils/siteVisitUtils';

interface SiteVisitStatsProps {
  visits: SiteVisit[];
  onStatusClick?: (status: string) => void;
  isDataCollector?: boolean;
}

const SiteVisitStats: React.FC<SiteVisitStatsProps> = ({ visits, onStatusClick, isDataCollector = false }) => {
  // Stats for data collectors
  const dataCollectorStats = {
    dispatched: visits.filter(v => v.status?.toLowerCase() === 'dispatched').length,
    assigned: visits.filter(v => v.status?.toLowerCase() === 'assigned').length,
    accepted: visits.filter(v => v.status?.toLowerCase() === 'accepted').length,
    ongoing: visits.filter(v => v.status?.toLowerCase() === 'ongoing').length,
    completed: visits.filter(v => v.status?.toLowerCase() === 'completed').length,
  };

  // Stats for non-data collectors
  const regularStats = {
    pending: visits.filter(v => v.status === 'pending').length,
    inProgress: visits.filter(v => v.status === 'inProgress').length,
    completed: visits.filter(v => v.status === 'completed').length,
    scheduled: visits.filter(v => ['assigned', 'permitVerified'].includes(v.status)).length,
    overdue: visits.filter(v => isOverdue(v.dueDate, v.status)).length,
  };

  const handleCardClick = (status: string) => {
    if (onStatusClick) {
      onStatusClick(status);
    }
  };

  // Render data collector specific status cards
  if (isDataCollector) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card 
          className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-indigo-50/50 cursor-pointer"
          onClick={() => handleCardClick('dispatched')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-indigo-700">Dispatched</p>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">{dataCollectorStats.dispatched}</span>
                </div>
                <p className="text-2xl font-bold text-indigo-600">{dataCollectorStats.dispatched}</p>
                <p className="text-xs text-muted-foreground group-hover:text-indigo-600">All available site visits</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                <Send className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
            <div className="mt-3 text-xs text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Click to view dispatched visits →
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-purple-50/50 cursor-pointer"
          onClick={() => handleCardClick('assigned')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-purple-700">Assigned</p>
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">{dataCollectorStats.assigned}</span>
                </div>
                <p className="text-2xl font-bold text-purple-600">{dataCollectorStats.assigned}</p>
                <p className="text-xs text-muted-foreground group-hover:text-purple-600">Your assigned visits</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                <UserCheck className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <div className="mt-3 text-xs text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Click to view assigned visits →
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-blue-50/50 cursor-pointer"
          onClick={() => handleCardClick('accepted')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-blue-700">Accepted</p>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">{dataCollectorStats.accepted}</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">{dataCollectorStats.accepted}</p>
                <p className="text-xs text-muted-foreground group-hover:text-blue-600">Visits you've accepted</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <CheckCircle className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Click to view accepted visits →
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-amber-50/50 cursor-pointer"
          onClick={() => handleCardClick('ongoing')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-amber-700">Ongoing</p>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">{dataCollectorStats.ongoing}</span>
                </div>
                <p className="text-2xl font-bold text-amber-600">{dataCollectorStats.ongoing}</p>
                <p className="text-xs text-muted-foreground group-hover:text-amber-600">Visits in progress</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                <PlayCircle className="h-6 w-6 text-amber-600" />
              </div>
            </div>
            <div className="mt-3 text-xs text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Click to view ongoing visits →
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-green-50/50 cursor-pointer"
          onClick={() => handleCardClick('completed')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-green-700">Completed</p>
                  <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">{dataCollectorStats.completed}</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{dataCollectorStats.completed}</p>
                <p className="text-xs text-muted-foreground group-hover:text-green-600">Successfully finalized visits</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-3 text-xs text-green-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Click to view completed visits →
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render regular status cards for non-data collectors
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <Card 
        className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-amber-50/50 cursor-pointer"
        onClick={() => handleCardClick('pending')}
      >
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground group-hover:text-amber-700">Pending</p>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">{regularStats.pending}</span>
              </div>
              <p className="text-2xl font-bold text-amber-600">{regularStats.pending}</p>
              <p className="text-xs text-muted-foreground group-hover:text-amber-600">Visits awaiting review and assignment</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
          </div>
          <div className="mt-3 text-xs text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
            Click to view pending visits →
          </div>
        </CardContent>
      </Card>
      
      <Card 
        className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-blue-50/50 cursor-pointer"
        onClick={() => handleCardClick('inProgress')}
      >
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground group-hover:text-blue-700">In Progress</p>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">{regularStats.inProgress}</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{regularStats.inProgress}</p>
              <p className="text-xs text-muted-foreground group-hover:text-blue-600">Active field team assessments</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <AlertCircle className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-3 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
            Click to view in progress visits →
          </div>
        </CardContent>
      </Card>
      
      <Card 
        className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-green-50/50 cursor-pointer"
        onClick={() => handleCardClick('completed')}
      >
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground group-hover:text-green-700">Completed</p>
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">{regularStats.completed}</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{regularStats.completed}</p>
              <p className="text-xs text-muted-foreground group-hover:text-green-600">Successfully finalized visits</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="mt-3 text-xs text-green-600 opacity-0 group-hover:opacity-100 transition-opacity">
            Click to view completed visits →
          </div>
        </CardContent>
      </Card>
      
      <Card 
        className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-purple-50/50 cursor-pointer"
        onClick={() => handleCardClick('scheduled')}
      >
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground group-hover:text-purple-700">Scheduled</p>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">{regularStats.scheduled}</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">{regularStats.scheduled}</p>
              <p className="text-xs text-muted-foreground group-hover:text-purple-600">Assigned and permit verified</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
              <CalendarClock className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-3 text-xs text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity">
            Click to view scheduled visits →
          </div>
        </CardContent>
      </Card>
      
      <Card 
        className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-red-50/50 cursor-pointer"
        onClick={() => handleCardClick('overdue')}
      >
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground group-hover:text-red-700">Overdue</p>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">{regularStats.overdue}</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{regularStats.overdue}</p>
              <p className="text-xs text-muted-foreground group-hover:text-red-600">Past due date visits</p>
            </div>
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
          </div>
          <div className="mt-3 text-xs text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
            Click to view overdue visits →
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SiteVisitStats;
