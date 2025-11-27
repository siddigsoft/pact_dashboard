import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteVisit } from '@/types';
import { Clock, CheckCircle, AlertCircle, CalendarClock, AlertTriangle, Send, UserCheck, PlayCircle, Sparkles } from 'lucide-react';
import { isOverdue } from '@/utils/siteVisitUtils';

interface SiteVisitStatsProps {
  visits: SiteVisit[];
  onStatusClick?: (status: string) => void;
  isDataCollector?: boolean;
}

const SiteVisitStats: React.FC<SiteVisitStatsProps> = ({ visits, onStatusClick, isDataCollector = false }) => {
  const dataCollectorStats = {
    dispatched: visits.filter(v => v.status?.toLowerCase() === 'dispatched').length,
    assigned: visits.filter(v => v.status?.toLowerCase() === 'assigned').length,
    accepted: visits.filter(v => v.status?.toLowerCase() === 'accepted').length,
    ongoing: visits.filter(v => v.status?.toLowerCase() === 'ongoing').length,
    completed: visits.filter(v => v.status?.toLowerCase() === 'completed').length,
  };

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

  if (isDataCollector) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card 
          className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-indigo-500 to-indigo-700 text-white border-0"
          onClick={() => handleCardClick('dispatched')}
          data-testid="card-stat-dispatched"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Dispatched
            </CardTitle>
            <Send className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{dataCollectorStats.dispatched}</div>
            <p className="text-xs text-white/80 mt-1">
              All available site visits
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>
        
        <Card 
          className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-purple-500 to-purple-700 text-white border-0"
          onClick={() => handleCardClick('assigned')}
          data-testid="card-stat-assigned"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Assigned
            </CardTitle>
            <UserCheck className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{dataCollectorStats.assigned}</div>
            <p className="text-xs text-white/80 mt-1">
              Your assigned visits
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>
        
        <Card 
          className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-blue-500 to-blue-700 text-white border-0"
          onClick={() => handleCardClick('accepted')}
          data-testid="card-stat-accepted"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Accepted
            </CardTitle>
            <CheckCircle className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{dataCollectorStats.accepted}</div>
            <p className="text-xs text-white/80 mt-1">
              Visits you've accepted
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>
        
        <Card 
          className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0"
          onClick={() => handleCardClick('ongoing')}
          data-testid="card-stat-ongoing"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Ongoing
            </CardTitle>
            <PlayCircle className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{dataCollectorStats.ongoing}</div>
            <p className="text-xs text-white/80 mt-1">
              Visits in progress
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>
        
        <Card 
          className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-green-500 to-emerald-700 text-white border-0"
          onClick={() => handleCardClick('completed')}
          data-testid="card-stat-completed"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-white/90">
              Completed
            </CardTitle>
            <CheckCircle className="h-5 w-5 text-white/80" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{dataCollectorStats.completed}</div>
            <p className="text-xs text-white/80 mt-1">
              Successfully finalized
            </p>
          </CardContent>
          <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      <Card 
        className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-amber-500 to-orange-600 text-white border-0"
        onClick={() => handleCardClick('pending')}
        data-testid="card-stat-pending"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-white/90">
            Pending
          </CardTitle>
          <Clock className="h-5 w-5 text-white/80" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-white">{regularStats.pending}</div>
          <p className="text-xs text-white/80 mt-1">
            Awaiting review
          </p>
        </CardContent>
        <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
      </Card>
      
      <Card 
        className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-blue-500 to-blue-700 text-white border-0"
        onClick={() => handleCardClick('inProgress')}
        data-testid="card-stat-inprogress"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-white/90">
            In Progress
          </CardTitle>
          <AlertCircle className="h-5 w-5 text-white/80" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-white">{regularStats.inProgress}</div>
          <p className="text-xs text-white/80 mt-1">
            Active assessments
          </p>
        </CardContent>
        <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
      </Card>
      
      <Card 
        className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-green-500 to-emerald-700 text-white border-0"
        onClick={() => handleCardClick('completed')}
        data-testid="card-stat-completed"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-white/90">
            Completed
          </CardTitle>
          <CheckCircle className="h-5 w-5 text-white/80" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-white">{regularStats.completed}</div>
          <p className="text-xs text-white/80 mt-1">
            Successfully finalized
          </p>
        </CardContent>
        <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
      </Card>
      
      <Card 
        className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-purple-500 to-purple-700 text-white border-0"
        onClick={() => handleCardClick('scheduled')}
        data-testid="card-stat-scheduled"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-white/90">
            Scheduled
          </CardTitle>
          <CalendarClock className="h-5 w-5 text-white/80" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-white">{regularStats.scheduled}</div>
          <p className="text-xs text-white/80 mt-1">
            Assigned & verified
          </p>
        </CardContent>
        <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
      </Card>
      
      <Card 
        className="hover-elevate cursor-pointer overflow-hidden relative bg-gradient-to-br from-red-500 to-red-700 text-white border-0"
        onClick={() => handleCardClick('overdue')}
        data-testid="card-stat-overdue"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-white/90">
            Overdue
          </CardTitle>
          <AlertTriangle className="h-5 w-5 text-white/80" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-white">{regularStats.overdue}</div>
          <p className="text-xs text-white/80 mt-1">
            Past due date
          </p>
        </CardContent>
        <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
      </Card>
    </div>
  );
};

export default SiteVisitStats;
