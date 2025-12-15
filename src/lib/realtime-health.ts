/**
 * Realtime Health Service
 * Tracks channel status, connection health, retry counts, and provides debugging capabilities
 */

export type ChannelStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

export interface ChannelHealth {
  name: string;
  status: ChannelStatus;
  lastConnected: Date | null;
  lastError: string | null;
  errorCount: number;
  retryCount: number;
  eventCount: number;
}

export interface RealtimeHealthState {
  isOnline: boolean;
  channels: Map<string, ChannelHealth>;
  totalEvents: number;
  lastActivity: Date | null;
  connectionAttempts: number;
  maxRetriesReached: boolean;
}

export interface RealtimeMetrics {
  channelCount: number;
  connectedChannels: number;
  errorChannels: number;
  totalRetries: number;
  totalEvents: number;
  uptime: number;
  lastError: string | null;
}

type HealthListener = (state: RealtimeHealthState) => void;

class RealtimeHealthService {
  private state: RealtimeHealthState = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    channels: new Map(),
    totalEvents: 0,
    lastActivity: null,
    connectionAttempts: 0,
    maxRetriesReached: false,
  };

  private listeners: Set<HealthListener> = new Set();
  private startTime: Date = new Date();
  private debugMode: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      
      (window as any).__REALTIME_HEALTH__ = this;
    }
  }

  private handleOnline = () => {
    this.state.isOnline = true;
    this.state.maxRetriesReached = false;
    this.log('Network restored');
    this.notifyListeners();
  };

  private handleOffline = () => {
    this.state.isOnline = false;
    this.log('Network lost');
    this.notifyListeners();
  };

  registerChannel(name: string): void {
    if (!this.state.channels.has(name)) {
      this.state.channels.set(name, {
        name,
        status: 'connecting',
        lastConnected: null,
        lastError: null,
        errorCount: 0,
        retryCount: 0,
        eventCount: 0,
      });
      this.log(`Channel registered: ${name}`);
      this.notifyListeners();
    }
  }

  unregisterChannel(name: string): void {
    this.state.channels.delete(name);
    this.log(`Channel unregistered: ${name}`);
    this.notifyListeners();
  }

  updateChannelStatus(name: string, status: ChannelStatus, error?: string): void {
    const channel = this.state.channels.get(name);
    if (!channel) {
      this.registerChannel(name);
      return this.updateChannelStatus(name, status, error);
    }

    channel.status = status;
    
    if (status === 'connected') {
      channel.lastConnected = new Date();
      channel.retryCount = 0;
      this.state.connectionAttempts = 0;
      if (this.state.maxRetriesReached) {
        this.state.maxRetriesReached = false;
        this.log('Max retries flag cleared after successful connection');
      }
    } else if (status === 'error' || status === 'disconnected') {
      channel.errorCount++;
      if (error) {
        channel.lastError = error;
      }
    } else if (status === 'reconnecting') {
      channel.retryCount++;
      this.state.connectionAttempts++;
    }

    this.log(`Channel ${name} status: ${status}${error ? ` (${error})` : ''}`);
    this.notifyListeners();
  }

  recordEvent(channelName: string): void {
    const channel = this.state.channels.get(channelName);
    if (channel) {
      channel.eventCount++;
    }
    this.state.totalEvents++;
    this.state.lastActivity = new Date();
    this.notifyListeners();
  }

  setMaxRetriesReached(reached: boolean): void {
    this.state.maxRetriesReached = reached;
    if (reached) {
      this.log('Max retries reached - connection exhausted');
    }
    this.notifyListeners();
  }

  getState(): RealtimeHealthState {
    return { ...this.state, channels: new Map(this.state.channels) };
  }

  getMetrics(): RealtimeMetrics {
    const channels = Array.from(this.state.channels.values());
    const connectedChannels = channels.filter(c => c.status === 'connected').length;
    const errorChannels = channels.filter(c => c.status === 'error').length;
    const totalRetries = channels.reduce((sum, c) => sum + c.retryCount, 0);
    const lastError = channels
      .filter(c => c.lastError)
      .sort((a, b) => (b.lastConnected?.getTime() || 0) - (a.lastConnected?.getTime() || 0))[0]?.lastError || null;

    return {
      channelCount: channels.length,
      connectedChannels,
      errorChannels,
      totalRetries,
      totalEvents: this.state.totalEvents,
      uptime: Date.now() - this.startTime.getTime(),
      lastError,
    };
  }

  subscribe(listener: HealthListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }

  enableDebugMode(): void {
    this.debugMode = true;
    console.log('[RealtimeHealth] Debug mode enabled. Access via window.__REALTIME_HEALTH__');
  }

  disableDebugMode(): void {
    this.debugMode = false;
  }

  private log(message: string): void {
    if (this.debugMode) {
      console.log(`[RealtimeHealth] ${message}`);
    }
  }

  getDebugInfo(): object {
    return {
      state: this.getState(),
      metrics: this.getMetrics(),
      listeners: this.listeners.size,
      startTime: this.startTime.toISOString(),
    };
  }

  reset(): void {
    this.state = {
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      channels: new Map(),
      totalEvents: 0,
      lastActivity: null,
      connectionAttempts: 0,
      maxRetriesReached: false,
    };
    this.startTime = new Date();
    this.notifyListeners();
  }

  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
      delete (window as any).__REALTIME_HEALTH__;
    }
    this.listeners.clear();
    this.state.channels.clear();
  }
}

export const realtimeHealth = new RealtimeHealthService();
