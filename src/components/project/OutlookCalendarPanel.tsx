import { useState, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, parseISO, isValid } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, Loader2, LogIn, LogOut, AlertCircle, Clock, MapPin, Users, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useOutlookCalendar, CalendarEvent } from '@/hooks/useOutlookCalendar';

const STATUS_COLORS: Record<string, string> = {
  busy: 'bg-red-500',
  tentative: 'bg-amber-400',
  oof: 'bg-purple-500',
  free: 'bg-emerald-400',
};

const STATUS_LABELS: Record<string, string> = {
  busy: 'Busy',
  tentative: 'Tentative',
  oof: 'Out of Office',
  free: 'Free',
};

function EventCard({ event }: { event: CalendarEvent }) {
  const start = isValid(parseISO(event.start)) ? parseISO(event.start) : null;
  const end = isValid(parseISO(event.end)) ? parseISO(event.end) : null;

  return (
    <div className={cn(
      'flex items-start gap-2 p-2.5 rounded-lg border text-sm transition-colors hover:bg-muted/50',
      event.status === 'busy' && 'border-red-200 bg-red-50/40 dark:bg-red-900/10 dark:border-red-900',
      event.status === 'tentative' && 'border-amber-200 bg-amber-50/40 dark:bg-amber-900/10 dark:border-amber-900',
      event.status === 'oof' && 'border-purple-200 bg-purple-50/40 dark:bg-purple-900/10 dark:border-purple-900',
      event.status === 'free' && 'border-emerald-200 bg-emerald-50/30 dark:bg-emerald-900/10 dark:border-emerald-900',
    )}>
      <div className={cn('h-2 w-2 rounded-full mt-1.5 flex-shrink-0', STATUS_COLORS[event.status] ?? 'bg-slate-400')} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm leading-snug truncate">{event.subject}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
          {event.isAllDay ? (
            <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" /> All day</span>
          ) : start && end ? (
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            </span>
          ) : null}
          {event.location && (
            <span className="flex items-center gap-0.5 truncate max-w-[160px]">
              <MapPin className="h-3 w-3 flex-shrink-0" />{event.location}
            </span>
          )}
          {event.organizer && (
            <span className="flex items-center gap-0.5 truncate max-w-[160px]">
              <Users className="h-3 w-3 flex-shrink-0" />{event.organizer}
            </span>
          )}
          <Badge
            variant="outline"
            className={cn(
              'text-[9px] px-1 py-0 border-0 font-medium',
              event.status === 'busy' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
              event.status === 'tentative' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
              event.status === 'oof' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
              event.status === 'free' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
            )}
          >
            {STATUS_LABELS[event.status] ?? event.status}
          </Badge>
        </div>
      </div>
    </div>
  );
}

function DayColumn({ date, events }: { date: Date; events: CalendarEvent[] }) {
  const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  const busyCount = events.filter(e => e.status === 'busy' || e.status === 'oof').length;

  return (
    <div className={cn(
      'flex-1 min-w-0 border-r last:border-r-0 dark:border-slate-700',
    )}>
      <div className={cn(
        'px-2 py-2 border-b dark:border-slate-700 text-center',
        isToday && 'bg-[#1D3461]/5 dark:bg-[#1D3461]/20',
      )}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{format(date, 'EEE')}</p>
        <p className={cn(
          'text-sm font-bold mt-0.5',
          isToday ? 'text-[#1D3461] dark:text-blue-300' : 'text-foreground',
        )}>{format(date, 'd')}</p>
        {busyCount > 0 && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0 mt-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {busyCount} busy
          </Badge>
        )}
      </div>
      <div className="p-1.5 space-y-1.5 min-h-[80px]">
        {events.length === 0 ? (
          <p className="text-[10px] text-center text-muted-foreground/60 pt-2">Free</p>
        ) : (
          events.map(e => (
            <div key={e.id} className={cn(
              'rounded px-1.5 py-1 text-[10px] leading-tight truncate cursor-default',
              e.status === 'busy' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
              e.status === 'tentative' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
              e.status === 'oof' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
              e.status === 'free' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
            )} title={e.subject}>
              {e.isAllDay ? '🗓 ' : `${e.start ? format(parseISO(e.start), 'h:mma') : ''} `}
              {e.subject}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface Props {
  projectId: string;
}

export function OutlookCalendarPanel({ projectId: _ }: Props) {
  const {
    account, isConnected, isConnecting, isFetchingEvents, error,
    events, connect, disconnect, fetchMyEvents, hasClientId,
  } = useOutlookCalendar();

  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), weekOffset);
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  useEffect(() => {
    if (isConnected) {
      fetchMyEvents(weekStart, weekEnd);
    }
  }, [isConnected, weekOffset]);

  const getEventsForDay = (date: Date): CalendarEvent[] => {
    const dayStr = format(date, 'yyyy-MM-dd');
    return events.filter(e => {
      if (!e.start) return false;
      try {
        const evDate = isValid(parseISO(e.start)) ? format(parseISO(e.start), 'yyyy-MM-dd') : null;
        return evDate === dayStr;
      } catch {
        return false;
      }
    });
  };

  if (!hasClientId) {
    return (
      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#1D3461]" />
            Outlook Calendar Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Microsoft Client ID not configured.</strong> To enable Outlook Calendar integration, add the{' '}
              <code className="bg-muted px-1 rounded text-xs">VITE_MICROSOFT_CLIENT_ID</code> environment variable with your
              Azure AD app's client ID.
              <a
                href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 mt-2 text-[#1D3461] hover:underline text-xs font-medium"
              >
                <ExternalLink className="h-3 w-3" /> Open Azure App Registrations
              </a>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header card — connection status */}
      <Card>
        <CardHeader className="p-4 pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#1D3461]" />
              Outlook Calendar
            </CardTitle>

            {isConnected ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="font-medium">{account?.name ?? account?.username}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={disconnect}
                >
                  <LogOut className="h-3 w-3 mr-1" /> Disconnect
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-sm border-[#1D3461] text-[#1D3461] hover:bg-[#1D3461]/5"
                onClick={connect}
                disabled={isConnecting}
                data-testid="button-connect-outlook"
              >
                {isConnecting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <LogIn className="h-3.5 w-3.5 mr-1.5" />
                )}
                {isConnecting ? 'Connecting…' : 'Connect Microsoft Account'}
              </Button>
            )}
          </div>
        </CardHeader>

        {!isConnected && (
          <CardContent className="p-4 pt-0">
            <p className="text-sm text-muted-foreground">
              Connect your Microsoft account to view your Outlook calendar events directly within this project.
              Your credentials are handled securely via Microsoft OAuth — no passwords are stored.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Error banner */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {/* Calendar view */}
      {isConnected && (
        <Card>
          <CardHeader className="p-3 pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(w => w - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold min-w-[180px] text-center">
                  {format(weekStart, 'd MMM')} – {format(weekEnd, 'd MMM yyyy')}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(w => w + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setWeekOffset(0)}
                  disabled={weekOffset === 0}
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => fetchMyEvents(weekStart, weekEnd)}
                  disabled={isFetchingEvents}
                  title="Refresh"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', isFetchingEvents && 'animate-spin')} />
                </Button>
              </div>
            </div>
          </CardHeader>

          <Separator />

          {/* Legend */}
          <div className="flex items-center gap-3 px-3 py-2 text-[10px] text-muted-foreground flex-wrap">
            {Object.entries(STATUS_LABELS).map(([k, label]) => (
              <span key={k} className="flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-full', STATUS_COLORS[k])} />
                {label}
              </span>
            ))}
          </div>

          <Separator />

          {isFetchingEvents ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading events…</span>
            </div>
          ) : (
            <>
              {/* Week grid */}
              <div className="flex overflow-x-auto">
                {weekDays.map(day => (
                  <DayColumn key={day.toISOString()} date={day} events={getEventsForDay(day)} />
                ))}
              </div>

              {/* Event list for selected days */}
              {events.length > 0 && (
                <>
                  <Separator />
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      All Events This Week ({events.length})
                    </p>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {events
                        .sort((a, b) => a.start.localeCompare(b.start))
                        .map(e => <EventCard key={e.id} event={e} />)}
                    </div>
                  </div>
                </>
              )}

              {events.length === 0 && !isFetchingEvents && (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No events found for this week.
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}
