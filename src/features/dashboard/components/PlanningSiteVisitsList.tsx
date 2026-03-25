import React, { useState, useMemo } from 'react';
import { Calendar, MapPin, User, AlertCircle, Clock, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SiteVisit } from '@/types/siteVisit';
import { format, isWithinInterval, addDays, isPast } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PlanningSiteVisitsListProps {
  siteVisits: SiteVisit[];
}

const PlanningSiteVisitsList: React.FC<PlanningSiteVisitsListProps> = ({ siteVisits }) => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  const filteredVisits = useMemo(() => {
    let filtered = [...siteVisits];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(v => v.status === statusFilter);
    }



    
    // Priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(v => v.priority === priorityFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      filtered = filtered.filter(v => {
        if (!v.scheduledDate) return false;
        const schedDate = new Date(v.scheduledDate);
        
        switch (dateFilter) {
          case 'week':
            return isWithinInterval(schedDate, { start: now, end: addDays(now, 7) });
          case 'month':
            return isWithinInterval(schedDate, { start: now, end: addDays(now, 30) });
          case 'overdue':
            return isPast(schedDate) && v.status !== 'completed';
          default:
            return true;
        }
      });
    }

    // Sort by scheduled date
    return filtered.sort((a, b) => {
      if (!a.scheduledDate) return 1;
      if (!b.scheduledDate) return -1;
      return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
    });
  }, [siteVisits, statusFilter, priorityFilter, dateFilter]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
      assigned: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20',
      inProgress: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
      completed: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
      permitVerified: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
    };
    return colors[status] || 'bg-muted';
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
      medium: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
      low: 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20',
    };
    return colors[priority] || 'bg-muted';
  };

  const isOverdue = (visit: SiteVisit) => {
    if (!visit.scheduledDate || visit.status === 'completed') return false;
    return isPast(new Date(visit.scheduledDate));
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center p-3 bg-muted/30 rounded-lg border">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filters:</span>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="inProgress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-priority-filter">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-date-filter">
            <SelectValue placeholder="Time Frame" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Dates</SelectItem>
            <SelectItem value="week">Next 7 Days</SelectItem>
            <SelectItem value="month">Next 30 Days</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto text-xs text-muted-foreground tabular-nums">
          {filteredVisits.length} of {siteVisits.length} visits
        </div>
      </div>

      {/* Site Visit Cards */}
      <div className="grid grid-cols-1 gap-3">
        {filteredVisits.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mb-3 opacity-50" />
              <p>No site visits found matching your filters</p>
            </CardContent>
          </Card>
        ) : (
          filteredVisits.map((visit) => (
            <Card 
              key={visit.id} 
              className="hover-elevate active-elevate-2 transition-all"
              data-testid={`card-site-visit-${visit.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-sm truncate">{visit.siteName}</h4>
                      {isOverdue(visit) && (
                        <Badge variant="destructive" className="text-xs h-5 gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Overdue
                        </Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{visit.locality}, {visit.state}</span>
                      </div>
                      
                      {visit.scheduledDate && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          <span className="tabular-nums">
                            {format(new Date(visit.scheduledDate), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{visit.assignedTo || 'Unassigned'}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="font-mono font-medium">{visit.siteCode}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 items-center flex-wrap">
                    <Badge className={`text-xs h-6 ${getStatusColor(visit.status)}`}>
                      {visit.status}
                    </Badge>
                    <Badge className={`text-xs h-6 ${getPriorityColor(visit.priority)}`}>
                      {visit.priority}
                    </Badge>
                  </div>
                </div>

                {visit.description && (
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-2">
                    {visit.description}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default PlanningSiteVisitsList;
