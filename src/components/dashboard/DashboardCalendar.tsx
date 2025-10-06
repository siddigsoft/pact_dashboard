
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { CalendarClock, MapPin } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export const DashboardCalendar = () => {
  const { siteVisits } = useSiteVisitContext();
  const [date, setDate] = React.useState<Date>(new Date());
  const navigate = useNavigate();

  const scheduledVisits = React.useMemo(() => {
    return siteVisits.filter(visit => 
      isSameDay(new Date(visit.dueDate), date)
    );
  }, [siteVisits, date]);

  const isDayWithVisits = (day: Date) => {
    return siteVisits.some(visit => 
      isSameDay(new Date(visit.dueDate), day)
    );
  };

  return (
    <Card className="transition-all duration-300 hover:shadow-lg border-t-4 border-t-indigo-500">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-indigo-500" />
          <CardTitle className="text-lg font-semibold">Schedule</CardTitle>
        </div>
        <Badge variant="outline" className="bg-background">
          {scheduledVisits.length} Events
        </Badge>
      </CardHeader>
      <CardContent>
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col gap-4"
        >
          <Calendar
            mode="single"
            selected={date}
            onSelect={(newDate) => {
              const selected = newDate || new Date();
              const hasVisits = siteVisits.some(visit =>
                isSameDay(new Date(visit.dueDate), selected)
              );
              if (!hasVisits) {
                navigate('/calendar');
              } else {
                setDate(selected);
              }
            }}
            className="rounded-md border shadow-sm"
            modifiers={{
              withVisits: (date) => isDayWithVisits(date),
            }}
            modifiersStyles={{
              withVisits: {
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fontWeight: 'bold',
                color: '#4F46E5',
              }
            }}
          />
          {scheduledVisits.length > 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="space-y-3"
            >
              <h4 className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                Scheduled for {format(date, 'MMMM d, yyyy')}
              </h4>
              <div className="space-y-2">
                {scheduledVisits.map((visit, index) => (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * index }}
                    key={visit.id}
                    className="flex items-center justify-between p-3 bg-accent/50 rounded-lg border border-border/50 hover:bg-accent/70 transition-colors"
                  >
                    <span className="font-medium">{visit.siteName}</span>
                    <Badge 
                      variant={visit.status === 'completed' ? 'secondary' : 'outline'}
                      className="capitalize"
                    >
                      {visit.status}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </CardContent>
    </Card>
  );
};

// Also add a default export to resolve the import issue
export default DashboardCalendar;
