
import { supabase } from '@/integrations/supabase/client';

interface QueuedRequest {
  id: string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  data: any;
  timestamp: number;
  retries: number;
}

const QUEUE_KEY = 'pact_offline_queue';
const MAX_RETRIES = 3;

export class OfflineQueue {
  private queue: QueuedRequest[] = [];
  private isOnline: boolean = navigator.onLine;
  private isSyncing: boolean = false;

  constructor() {
    this.loadQueue();
    this.setupNetworkListeners();
  }

  private loadQueue(): void {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log(`Loaded ${this.queue.length} queued requests from storage`);
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
      this.queue = [];
    }
  }

  private saveQueue(): void {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      console.log('Network connection restored');
      this.isOnline = true;
      this.syncQueue();
    });

    window.addEventListener('offline', () => {
      console.log('Network connection lost');
      this.isOnline = false;
    });
  }

  async queueRequest(
    url: string, 
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    data: any
  ): Promise<void> {
    const request: QueuedRequest = {
      id: crypto.randomUUID(),
      url,
      method,
      data,
      timestamp: Date.now(),
      retries: 0
    };

    if (this.isOnline) {
      try {
        await this.executeRequest(request);
        return;
      } catch (error) {
        console.warn('Request failed, queuing for retry:', error);
      }
    }

    this.queue.push(request);
    this.saveQueue();
    console.log(`Request queued (offline): ${method} ${url}`);
  }

  private async executeRequest(request: QueuedRequest): Promise<void> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
      },
      body: JSON.stringify(request.data)
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }
  }

  async syncQueue(): Promise<void> {
    if (this.isSyncing || !this.isOnline || this.queue.length === 0) {
      return;
    }

    this.isSyncing = true;
    console.log(`Syncing ${this.queue.length} queued requests...`);

    const failedRequests: QueuedRequest[] = [];

    for (const request of this.queue) {
      try {
        await this.executeRequest(request);
        console.log(`Successfully synced: ${request.method} ${request.url}`);
      } catch (error) {
        console.error(`Failed to sync request (attempt ${request.retries + 1}):`, error);
        
        request.retries++;
        if (request.retries < MAX_RETRIES) {
          failedRequests.push(request);
        } else {
          console.error(`Request exceeded max retries, discarding:`, request);
        }
      }
    }

    this.queue = failedRequests;
    this.saveQueue();
    this.isSyncing = false;

    console.log(`Sync complete. ${failedRequests.length} requests remain in queue.`);
  }

  getQueueStatus(): { pending: number; isOnline: boolean } {
    return {
      pending: this.queue.length,
      isOnline: this.isOnline
    };
  }

  clearQueue(): void {
    this.queue = [];
    this.saveQueue();
    console.log('Offline queue cleared');
  }
}

export const offlineQueue = new OfflineQueue();

export function useOfflineQueue() {
  return {
    queueRequest: offlineQueue.queueRequest.bind(offlineQueue),
    syncQueue: offlineQueue.syncQueue.bind(offlineQueue),
    getStatus: offlineQueue.getQueueStatus.bind(offlineQueue),
    clearQueue: offlineQueue.clearQueue.bind(offlineQueue)
  };
}
