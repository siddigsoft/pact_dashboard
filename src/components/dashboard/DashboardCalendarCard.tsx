import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';

export const DashboardCalendarCard = () => {
  const { siteVisits } = useSiteVisitContext();
  // Show next 7 upcoming visits
  const upcoming = (siteVisits || [])
    .filter(v => v.dueDate && new Date(v.dueDate) >= new Date())
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 7);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Calendar className="inline h-5 w-5 mr-2" />
          Upcoming Visits & Activities
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul>
          {upcoming.map(v => (
            <li key={v.id} className="flex items-center gap-2 mb-2">
              <span className="font-medium">{v.siteName}</span>
              <span className="text-xs text-muted-foreground">{format(new Date(v.dueDate), 'MMM d, yyyy')}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-800">{v.status}</span>
              <span className="text-xs text-muted-foreground">{v.hub || ''}</span>
            </li>
          ))}
        </ul>
        {upcoming.length === 0 && <div className="text-muted-foreground text-sm">No upcoming visits scheduled.</div>}
      </CardContent>
    </Card>
  );
};
