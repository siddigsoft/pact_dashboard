import React from "react";
import { Bell, Calendar, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteVisit } from "@/types";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { useNavigate } from "react-router-dom";

interface SiteVisitRemindersProps {
  dueSoon: SiteVisit[];
  overdue: SiteVisit[];
  onClose: () => void;
}

export const SiteVisitReminders: React.FC<SiteVisitRemindersProps> = ({
  dueSoon,
  overdue,
  onClose,
}) => {
  const navigate = useNavigate();
  
  const getVisitStatusBadge = (visit: SiteVisit) => {
    const dueDate = new Date(visit.dueDate);
    
    if (isPast(dueDate)) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Overdue
        </Badge>
      );
    }
    
    if (isToday(dueDate)) {
      return (
        <Badge variant="warning" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Due Today
        </Badge>
      );
    }
    
    if (isTomorrow(dueDate)) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Upcoming
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="flex items-center gap-1">
        <Calendar className="h-3 w-3" />
        Upcoming
      </Badge>
    );
  };
  
  const handleViewVisit = (visitId: string) => {
    navigate(`/site-visits/${visitId}`);
    onClose();
  };
  
  const handleViewAll = () => {
    navigate("/site-visits");
    onClose();
  };
  
  const hasReminders = dueSoon.length > 0 || overdue.length > 0;
  
  if (!hasReminders) {
    return null;
  }
  
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-500" />
            <CardTitle>Site Visit Reminders</CardTitle>
          </div>
          <Badge variant="outline">
            {overdue.length + dueSoon.length} Total
          </Badge>
        </div>
        <CardDescription>
          {overdue.length > 0 ? `${overdue.length} overdue, ` : ""}
          {dueSoon.length > 0 ? `${dueSoon.length} upcoming` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {overdue.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Overdue
            </h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {overdue.map((visit) => (
                <div 
                  key={visit.id}
                  className="p-2 border rounded-md flex items-center justify-between bg-red-50"
                >
                  <div>
                    <p className="font-medium text-sm">{visit.siteName}</p>
                    <p className="text-xs text-gray-500">
                      Due: {format(new Date(visit.dueDate), "PPP")}
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleViewVisit(visit.id)}
                  >
                    View
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {dueSoon.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-amber-600 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Due Soon
            </h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {dueSoon.map((visit) => (
                <div 
                  key={visit.id}
                  className="p-2 border rounded-md flex items-center justify-between bg-amber-50"
                >
                  <div>
                    <p className="font-medium text-sm">{visit.siteName}</p>
                    <p className="text-xs text-gray-500">
                      Due: {format(new Date(visit.dueDate), "PPP")}
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleViewVisit(visit.id)}
                  >
                    View
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex justify-end pt-2">
          <div className="space-x-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Dismiss
            </Button>
            <Button size="sm" onClick={handleViewAll}>
              View All Visits
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SiteVisitReminders;
