
import { Calendar, AlertTriangle } from "lucide-react";
import { SiteVisit } from "@/types";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { isOverdue, getDaysOverdue } from "@/utils/siteVisitUtils";

interface SiteVisitDatesProps {
  siteVisit: SiteVisit;
}

export const SiteVisitDates = ({ siteVisit }: SiteVisitDatesProps) => {
  return (
    <Card className="p-6 mt-6 hover:shadow-lg transition-shadow border-none bg-gradient-to-br from-primary/5 via-primary/10 to-background">
      <h3 className="text-lg font-semibold mb-4 text-primary">Important Dates</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-start gap-3 p-3 rounded-md bg-white/50 hover:bg-white/80 transition-colors">
          <Calendar className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Visit Date</p>
            <p className="font-semibold">
              {siteVisit.scheduledDate 
                ? format(new Date(siteVisit.scheduledDate), 'MMM d, yyyy')
                : 'Not scheduled'}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-md bg-white/50 hover:bg-white/80 transition-colors">
          <Calendar className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">Distribution Date</p>
            <p className="font-semibold">
              {siteVisit.scheduledDate
                ? format(new Date(siteVisit.scheduledDate), 'MMM d, yyyy')
                : 'Not scheduled'}
            </p>
          </div>
        </div>

        <div className={`flex items-start gap-3 p-3 rounded-md transition-colors ${
          isOverdue(siteVisit.dueDate, siteVisit.status) 
            ? 'bg-red-50 hover:bg-red-100 border border-red-200' 
            : 'bg-white/50 hover:bg-white/80'
        }`}>
          {isOverdue(siteVisit.dueDate, siteVisit.status) ? (
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
          ) : (
            <Calendar className="h-5 w-5 text-primary mt-0.5" />
          )}
          <div>
            <p className={`text-sm font-medium ${
              isOverdue(siteVisit.dueDate, siteVisit.status) 
                ? 'text-red-700' 
                : 'text-muted-foreground'
            }`}>
              Due Date {isOverdue(siteVisit.dueDate, siteVisit.status) && 
                `(${getDaysOverdue(siteVisit.dueDate, siteVisit.status)} days overdue)`}
            </p>
            <p className={`font-semibold ${
              isOverdue(siteVisit.dueDate, siteVisit.status) 
                ? 'text-red-800' 
                : ''
            }`}>
              {format(new Date(siteVisit.dueDate || new Date()), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};
