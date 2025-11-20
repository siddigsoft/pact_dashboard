import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { SiteVisit } from '@/types';
import { Clock, CheckCircle, AlertCircle, CalendarClock, AlertTriangle } from 'lucide-react';
import { isOverdue } from '@/utils/siteVisitUtils';

interface SiteVisitStatsProps {
  visits: SiteVisit[];
  onStatusClick?: (status: string) => void;
}

const SiteVisitStats: React.FC<SiteVisitStatsProps> = ({ visits, onStatusClick }) => {
  const stats = {
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
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">{stats.pending}</span>
              </div>
              <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
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
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">{stats.inProgress}</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
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
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">{stats.completed}</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
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
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">{stats.scheduled}</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">{stats.scheduled}</p>
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
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">{stats.overdue}</span>
              </div>
              <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
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
