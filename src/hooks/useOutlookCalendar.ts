import { useState, useCallback } from 'react';
import { PublicClientApplication, AccountInfo, InteractionRequiredAuthError } from '@azure/msal-browser';

const CLIENT_ID = import.meta.env.VITE_MICROSOFT_CLIENT_ID as string | undefined;

const SCOPES = [
  'User.Read',
  'Calendars.Read',
  'Calendars.ReadBasic',
];

let msalInstance: PublicClientApplication | null = null;

function getMsalInstance(): PublicClientApplication {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID ?? '',
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
      },
    });
  }
  return msalInstance;
}

export interface CalendarEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  isAllDay: boolean;
  status: 'free' | 'busy' | 'tentative' | 'oof';
  organizer?: string;
  location?: string;
}

export interface TeamMemberAvailability {
  userId: string;
  displayName: string;
  email: string;
  events: CalendarEvent[];
  scheduleStatus: 'loaded' | 'error' | 'loading';
}

async function acquireToken(): Promise<string> {
  const msal = getMsalInstance();
  await msal.initialize();

  const accounts = msal.getAllAccounts();
  const request = { scopes: SCOPES, account: accounts[0] };

  try {
    const result = await msal.acquireTokenSilent(request);
    return result.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const result = await msal.acquireTokenPopup(request);
      return result.accessToken;
    }
    throw err;
  }
}

async function graphFetch<T>(endpoint: string, token: string): Promise<T> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error?.message ?? `Graph API error ${res.status}`);
  }
  return res.json();
}

function mapShowAs(s?: string): CalendarEvent['status'] {
  if (s === 'busy') return 'busy';
  if (s === 'tentative') return 'tentative';
  if (s === 'oof') return 'oof';
  return 'free';
}

export function useOutlookCalendar() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFetchingEvents, setIsFetchingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [teamAvailability, setTeamAvailability] = useState<TeamMemberAvailability[]>([]);

  const connect = useCallback(async () => {
    if (!CLIENT_ID) {
      setError('Microsoft Client ID is not configured. Please add VITE_MICROSOFT_CLIENT_ID to your environment variables.');
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const msal = getMsalInstance();
      await msal.initialize();
      const result = await msal.loginPopup({ scopes: SCOPES });
      setAccount(result.account);
    } catch (err: any) {
      if (err?.errorCode === 'user_cancelled') {
        setError('Sign-in was cancelled.');
      } else {
        setError(err?.message ?? 'Failed to connect to Microsoft account.');
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      const msal = getMsalInstance();
      await msal.initialize();
      const accounts = msal.getAllAccounts();
      if (accounts[0]) {
        await msal.logoutPopup({ account: accounts[0] });
      }
    } catch {
    }
    setAccount(null);
    setEvents([]);
    setTeamAvailability([]);
    setError(null);
  }, []);

  const fetchMyEvents = useCallback(async (startDate: Date, endDate: Date) => {
    if (!account) return;
    setIsFetchingEvents(true);
    setError(null);
    try {
      const token = await acquireToken();
      const start = startDate.toISOString();
      const end = endDate.toISOString();
      const data = await graphFetch<{ value: any[] }>(
        `/me/calendarView?startDateTime=${start}&endDateTime=${end}&$select=id,subject,start,end,isAllDay,showAs,organizer,location&$orderby=start/dateTime&$top=50`,
        token,
      );
      const mapped: CalendarEvent[] = (data.value ?? []).map((e: any) => ({
        id: e.id,
        subject: e.subject ?? '(No title)',
        start: e.start?.dateTime ?? e.start?.date,
        end: e.end?.dateTime ?? e.end?.date,
        isAllDay: !!e.isAllDay,
        status: mapShowAs(e.showAs),
        organizer: e.organizer?.emailAddress?.name,
        location: e.location?.displayName,
      }));
      setEvents(mapped);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load calendar events.');
    } finally {
      setIsFetchingEvents(false);
    }
  }, [account]);

  const fetchTeamAvailability = useCallback(async (emails: string[], startDate: Date, endDate: Date) => {
    if (!account || emails.length === 0) return;
    setIsFetchingEvents(true);
    setError(null);
    try {
      const token = await acquireToken();
      const body = {
        schedules: emails,
        startTime: { dateTime: startDate.toISOString(), timeZone: 'UTC' },
        endTime: { dateTime: endDate.toISOString(), timeZone: 'UTC' },
        availabilityViewInterval: 60,
      };
      const data = await graphFetch<{ value: any[] }>('/me/calendar/getSchedule', token);

      const result: TeamMemberAvailability[] = (data.value ?? []).map((s: any, i: number) => ({
        userId: emails[i],
        displayName: s.scheduleId ?? emails[i],
        email: s.scheduleId ?? emails[i],
        events: (s.scheduleItems ?? []).map((item: any, j: number) => ({
          id: `${emails[i]}-${j}`,
          subject: item.subject ?? 'Busy',
          start: item.start?.dateTime ?? '',
          end: item.end?.dateTime ?? '',
          isAllDay: !!item.isAllDay,
          status: mapShowAs(item.status),
          organizer: undefined,
          location: item.location ?? undefined,
        })),
        scheduleStatus: 'loaded' as const,
      }));
      setTeamAvailability(result);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load team availability.');
    } finally {
      setIsFetchingEvents(false);
    }
  }, [account]);

  return {
    account,
    isConnected: !!account,
    isConnecting,
    isFetchingEvents,
    error,
    events,
    teamAvailability,
    connect,
    disconnect,
    fetchMyEvents,
    fetchTeamAvailability,
    hasClientId: !!CLIENT_ID,
  };
}
