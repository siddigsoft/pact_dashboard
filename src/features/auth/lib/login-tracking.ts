import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';

export interface LoginEvent {
  id?: string;
  user_id: string;
  platform: 'web' | 'android' | 'ios';
  device_model?: string;
  device_manufacturer?: string;
  os_version?: string;
  app_version?: string;
  browser?: string;
  browser_version?: string;
  ip_address?: string;
  user_agent?: string;
  login_at: string;
  logout_at?: string;
  session_id?: string;
  success: boolean;
  mfa_used?: boolean;
  login_method?: string;
}

export interface SessionInfo {
  platform: 'web' | 'android' | 'ios';
  device_model?: string;
  device_manufacturer?: string;
  os_version?: string;
  app_version?: string;
  browser?: string;
  browser_version?: string;
  user_agent?: string;
}

// Get device information
export async function getDeviceInfo(): Promise<SessionInfo> {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  
  if (Capacitor.isNativePlatform()) {
    try {
      const deviceInfo = await Device.getInfo();
      const appInfo = await Device.getId().catch(() => ({ identifier: 'unknown' }));
      return {
        platform: deviceInfo.platform === 'ios' ? 'ios' : 'android',
        device_model: deviceInfo.model,
        device_manufacturer: deviceInfo.manufacturer,
        os_version: deviceInfo.osVersion,
        app_version: '1.0.0',
        user_agent: userAgent,
      };
    } catch (err) {
      console.error('[LoginTracking] Error getting device info:', err);
      return {
        platform: Capacitor.getPlatform() === 'ios' ? 'ios' : 'android',
        user_agent: userAgent,
      };
    }
  }
  
  // Web browser - parse user agent
  const browserInfo = parseBrowserInfo(userAgent);
  
  return {
    platform: 'web',
    browser: browserInfo.browser,
    browser_version: browserInfo.version,
    os_version: browserInfo.os,
    user_agent: userAgent,
  };
}

// Parse browser info from user agent
function parseBrowserInfo(userAgent: string): { browser: string; version: string; os: string } {
  let browser = 'Unknown';
  let version = '';
  let os = 'Unknown';
  
  // Detect browser
  if (userAgent.includes('Firefox/')) {
    browser = 'Firefox';
    const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
    if (match) version = match[1];
  } else if (userAgent.includes('Edg/')) {
    browser = 'Edge';
    const match = userAgent.match(/Edg\/(\d+\.\d+)/);
    if (match) version = match[1];
  } else if (userAgent.includes('Chrome/')) {
    browser = 'Chrome';
    const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
    if (match) version = match[1];
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    browser = 'Safari';
    const match = userAgent.match(/Version\/(\d+\.\d+)/);
    if (match) version = match[1];
  }
  
  // Detect OS
  if (userAgent.includes('Windows')) {
    os = 'Windows';
    if (userAgent.includes('Windows NT 10.0')) os = 'Windows 10/11';
    else if (userAgent.includes('Windows NT 6.3')) os = 'Windows 8.1';
    else if (userAgent.includes('Windows NT 6.2')) os = 'Windows 8';
  } else if (userAgent.includes('Mac OS X')) {
    os = 'macOS';
    const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
    if (match) os = `macOS ${match[1].replace('_', '.')}`;
  } else if (userAgent.includes('Linux')) {
    os = 'Linux';
  } else if (userAgent.includes('Android')) {
    os = 'Android';
    const match = userAgent.match(/Android (\d+\.\d+)/);
    if (match) os = `Android ${match[1]}`;
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    os = 'iOS';
    const match = userAgent.match(/OS (\d+_\d+)/);
    if (match) os = `iOS ${match[1].replace('_', '.')}`;
  }
  
  return { browser, version, os };
}

// Record a login event
export async function recordLoginEvent(
  userId: string, 
  success: boolean = true,
  options?: {
    mfaUsed?: boolean;
    loginMethod?: string;
    sessionId?: string;
  }
): Promise<void> {
  try {
    const deviceInfo = await getDeviceInfo();
    
    const loginEvent: LoginEvent = {
      user_id: userId,
      platform: deviceInfo.platform,
      device_model: deviceInfo.device_model,
      device_manufacturer: deviceInfo.device_manufacturer,
      os_version: deviceInfo.os_version,
      app_version: deviceInfo.app_version,
      browser: deviceInfo.browser,
      browser_version: deviceInfo.browser_version,
      user_agent: deviceInfo.user_agent,
      login_at: new Date().toISOString(),
      success,
      mfa_used: options?.mfaUsed,
      login_method: options?.loginMethod || 'password',
      session_id: options?.sessionId,
    };
    
    // Insert into login_events table
    const { error } = await supabase
      .from('login_events')
      .insert([loginEvent]);
    
    if (error) {
      console.error('[LoginTracking] Error recording login event:', error);
      // Fall back to localStorage if table doesn't exist
      saveToLocalStorage(loginEvent);
    } else {
      console.log('[LoginTracking] Login event recorded:', deviceInfo.platform);
    }
  } catch (err) {
    console.error('[LoginTracking] Error in recordLoginEvent:', err);
  }
}

// Record logout event
export async function recordLogoutEvent(userId: string, sessionId?: string): Promise<void> {
  try {
    const logoutTime = new Date().toISOString();
    
    // First fetch the most recent open session for this user
    const { data: sessions, error: fetchError } = await supabase
      .from('login_events')
      .select('id')
      .eq('user_id', userId)
      .is('logout_at', null)
      .order('login_at', { ascending: false })
      .limit(1);
    
    if (fetchError) {
      console.error('[LoginTracking] Error fetching session:', fetchError);
      return;
    }
    
    if (!sessions || sessions.length === 0) {
      console.log('[LoginTracking] No open session found for user:', userId);
      return;
    }
    
    // Update the specific session by id
    const { error: updateError } = await supabase
      .from('login_events')
      .update({ logout_at: logoutTime })
      .eq('id', sessions[0].id);
    
    if (updateError) {
      console.error('[LoginTracking] Error recording logout:', updateError);
    } else {
      console.log('[LoginTracking] Logout recorded for user:', userId);
    }
  } catch (err) {
    console.error('[LoginTracking] Error in recordLogoutEvent:', err);
  }
}

// Get login history for a user
export async function getLoginHistory(
  userId?: string,
  options?: {
    limit?: number;
    offset?: number;
    platform?: 'web' | 'android' | 'ios';
    fromDate?: Date;
    toDate?: Date;
  }
): Promise<{ data: LoginEvent[]; count: number }> {
  try {
    let query = supabase
      .from('login_events')
      .select('*', { count: 'exact' });
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    if (options?.platform) {
      query = query.eq('platform', options.platform);
    }
    
    if (options?.fromDate) {
      query = query.gte('login_at', options.fromDate.toISOString());
    }
    
    if (options?.toDate) {
      query = query.lte('login_at', options.toDate.toISOString());
    }
    
    query = query.order('login_at', { ascending: false });
    
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('[LoginTracking] Error fetching login history:', error);
      return { data: getFromLocalStorage(), count: 0 };
    }
    
    return { data: data || [], count: count || 0 };
  } catch (err) {
    console.error('[LoginTracking] Error in getLoginHistory:', err);
    return { data: getFromLocalStorage(), count: 0 };
  }
}

// Get login statistics
export async function getLoginStats(): Promise<{
  totalLogins: number;
  webLogins: number;
  androidLogins: number;
  iosLogins: number;
  uniqueDevices: number;
  avgSessionDuration: number | null;
}> {
  try {
    const { data: events, error } = await supabase
      .from('login_events')
      .select('*');
    
    if (error || !events) {
      return {
        totalLogins: 0,
        webLogins: 0,
        androidLogins: 0,
        iosLogins: 0,
        uniqueDevices: 0,
        avgSessionDuration: null,
      };
    }
    
    const webLogins = events.filter(e => e.platform === 'web').length;
    const androidLogins = events.filter(e => e.platform === 'android').length;
    const iosLogins = events.filter(e => e.platform === 'ios').length;
    
    // Count unique device models
    const uniqueDevices = new Set(
      events
        .filter(e => e.device_model)
        .map(e => `${e.device_manufacturer || ''}-${e.device_model}`)
    ).size;
    
    // Calculate average session duration
    const sessionsWithDuration = events.filter(e => e.login_at && e.logout_at);
    let avgSessionDuration: number | null = null;
    
    if (sessionsWithDuration.length > 0) {
      const totalDuration = sessionsWithDuration.reduce((acc, e) => {
        const loginTime = new Date(e.login_at).getTime();
        const logoutTime = new Date(e.logout_at!).getTime();
        return acc + (logoutTime - loginTime);
      }, 0);
      avgSessionDuration = totalDuration / sessionsWithDuration.length / 1000 / 60; // in minutes
    }
    
    return {
      totalLogins: events.length,
      webLogins,
      androidLogins,
      iosLogins,
      uniqueDevices,
      avgSessionDuration,
    };
  } catch (err) {
    console.error('[LoginTracking] Error in getLoginStats:', err);
    return {
      totalLogins: 0,
      webLogins: 0,
      androidLogins: 0,
      iosLogins: 0,
      uniqueDevices: 0,
      avgSessionDuration: null,
    };
  }
}

// Get active sessions (users currently logged in)
export async function getActiveSessions(): Promise<LoginEvent[]> {
  try {
    const { data, error } = await supabase
      .from('login_events')
      .select('*')
      .is('logout_at', null)
      .order('login_at', { ascending: false });
    
    if (error) {
      console.error('[LoginTracking] Error fetching active sessions:', error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('[LoginTracking] Error in getActiveSessions:', err);
    return [];
  }
}

// Local storage fallback
function saveToLocalStorage(event: LoginEvent): void {
  try {
    const stored = localStorage.getItem('pact_login_events');
    const events: LoginEvent[] = stored ? JSON.parse(stored) : [];
    events.unshift(event);
    // Keep only last 100 events
    localStorage.setItem('pact_login_events', JSON.stringify(events.slice(0, 100)));
  } catch (err) {
    console.error('[LoginTracking] Error saving to localStorage:', err);
  }
}

function getFromLocalStorage(): LoginEvent[] {
  try {
    const stored = localStorage.getItem('pact_login_events');
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    return [];
  }
}
