import { supabase } from '@/integrations/supabase/client';
import {
  getPendingSyncActions,
  updateSyncActionStatus,
  removeSyncAction,
  getUnsyncedSiteVisits,
  markSiteVisitSynced,
  getUnsyncedLocations,
  markLocationsSynced,
  getOfflineStats,
  cleanExpiredCache,
  type PendingSyncAction,
} from './offline-db';

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  current: string | null;
  isRunning: boolean;
  phase: 'idle' | 'preparing' | 'site_visits' | 'locations' | 'pending_actions' | 'cleanup' | 'complete';
  lastSyncAt: Date | null;
  nextRetryAt: Date | null;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
  duration: number;
  timestamp: Date;
}

export interface ConflictResolution {
  strategy: 'server_wins' | 'client_wins' | 'last_write_wins' | 'manual';
  conflictHandler?: (local: any, server: any) => any;
}

type SyncProgressCallback = (progress: SyncProgress) => void;
type SyncCompleteCallback = (result: SyncResult) => void;
type NetworkStatusCallback = (isOnline: boolean) => void;

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 60000; // 60 seconds
const SYNC_DEBOUNCE_MS = 2000; // 2 seconds

class SyncManager {
  private isRunning = false;
  private progressCallbacks: Set<SyncProgressCallback> = new Set();
  private completeCallbacks: Set<SyncCompleteCallback> = new Set();
  private networkCallbacks: Set<NetworkStatusCallback> = new Set();
  private syncQueue: Promise<SyncResult> | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private lastSyncResult: SyncResult | null = null;
  
  private progress: SyncProgress = {
    total: 0,
    completed: 0,
    failed: 0,
    current: null,
    isRunning: false,
    phase: 'idle',
    lastSyncAt: null,
    nextRetryAt: null,
  };

  private conflictResolution: ConflictResolution = {
    strategy: 'last_write_wins',
  };

  constructor() {
    this.setupNetworkListeners();
  }

  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[SyncManager] Network restored');
        this.networkCallbacks.forEach(cb => cb(true));
        this.scheduleSyncWithDebounce();
      });

      window.addEventListener('offline', () => {
        console.log('[SyncManager] Network lost');
        this.networkCallbacks.forEach(cb => cb(false));
        this.cancelPendingRetry();
      });
    }
  }

  onProgress(callback: SyncProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    callback({ ...this.progress });
    return () => this.progressCallbacks.delete(callback);
  }

  onComplete(callback: SyncCompleteCallback): () => void {
    this.completeCallbacks.add(callback);
    return () => this.completeCallbacks.delete(callback);
  }

  onNetworkChange(callback: NetworkStatusCallback): () => void {
    this.networkCallbacks.add(callback);
    return () => this.networkCallbacks.delete(callback);
  }

  setConflictResolution(resolution: ConflictResolution) {
    this.conflictResolution = resolution;
  }

  private notifyProgress() {
    this.progressCallbacks.forEach(cb => cb({ ...this.progress }));
  }

  private notifyComplete(result: SyncResult) {
    this.lastSyncResult = result;
    this.completeCallbacks.forEach(cb => cb(result));
  }

  private scheduleSyncWithDebounce() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.syncAll();
    }, SYNC_DEBOUNCE_MS);
  }

  private cancelPendingRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.progress.nextRetryAt = null;
    this.notifyProgress();
  }

  private scheduleRetry(failedCount: number) {
    if (!navigator.onLine) return;
    
    const delay = Math.min(
      BASE_RETRY_DELAY * Math.pow(2, this.consecutiveFailures),
      MAX_RETRY_DELAY
    );
    
    this.progress.nextRetryAt = new Date(Date.now() + delay);
    this.notifyProgress();
    
    console.log(`[SyncManager] Scheduling retry in ${delay}ms (attempt ${this.consecutiveFailures + 1})`);
    
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.syncAll();
    }, delay);
  }

  private calculateRetryDelay(retryCount: number): number {
    const jitter = Math.random() * 1000;
    return Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount) + jitter, MAX_RETRY_DELAY);
  }

  async syncAll(force = false): Promise<SyncResult> {
    if (this.isRunning && !force) {
      console.log('[SyncManager] Sync already in progress, queuing...');
      if (this.syncQueue) {
        return this.syncQueue;
      }
      return { success: false, synced: 0, failed: 0, errors: ['Sync already in progress'], duration: 0, timestamp: new Date() };
    }

    if (!navigator.onLine) {
      return { success: false, synced: 0, failed: 0, errors: ['No network connection'], duration: 0, timestamp: new Date() };
    }

    const startTime = Date.now();
    this.isRunning = true;
    const errors: string[] = [];
    let synced = 0;
    let failed = 0;

    try {
      this.progress.phase = 'preparing';
      this.progress.current = 'Preparing sync...';
      this.notifyProgress();

      const stats = await getOfflineStats();
      const totalItems = stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations;
      
      if (totalItems === 0) {
        console.log('[SyncManager] Nothing to sync');
        this.consecutiveFailures = 0;
        const result: SyncResult = {
          success: true,
          synced: 0,
          failed: 0,
          errors: [],
          duration: Date.now() - startTime,
          timestamp: new Date(),
        };
        this.progress = {
          ...this.progress,
          current: null,
          isRunning: false,
          phase: 'complete',
          lastSyncAt: new Date(),
          nextRetryAt: null,
        };
        this.notifyProgress();
        this.notifyComplete(result);
        return result;
      }

      this.progress = {
        total: totalItems,
        completed: 0,
        failed: 0,
        current: 'Starting sync...',
        isRunning: true,
        phase: 'preparing',
        lastSyncAt: this.progress.lastSyncAt,
        nextRetryAt: null,
      };
      this.notifyProgress();

      console.log(`[SyncManager] Starting sync: ${stats.unsyncedVisits} visits, ${stats.unsyncedLocations} locations, ${stats.pendingActions} actions`);

      // Sync in priority order: site visits first (most important), then locations, then pending actions
      this.progress.phase = 'site_visits';
      const siteVisitResult = await this.syncSiteVisits();
      synced += siteVisitResult.synced;
      failed += siteVisitResult.failed;
      errors.push(...siteVisitResult.errors);

      this.progress.phase = 'locations';
      const locationResult = await this.syncLocations();
      synced += locationResult.synced;
      failed += locationResult.failed;
      errors.push(...locationResult.errors);

      this.progress.phase = 'pending_actions';
      const pendingResult = await this.syncPendingActions();
      synced += pendingResult.synced;
      failed += pendingResult.failed;
      errors.push(...pendingResult.errors);

      // Cleanup expired cache
      this.progress.phase = 'cleanup';
      this.progress.current = 'Cleaning up...';
      this.notifyProgress();
      
      const cleanedCount = await cleanExpiredCache();
      if (cleanedCount > 0) {
        console.log(`[SyncManager] Cleaned ${cleanedCount} expired cache entries`);
      }

      const result: SyncResult = {
        success: failed === 0,
        synced,
        failed,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      if (failed > 0) {
        this.consecutiveFailures++;
        this.scheduleRetry(failed);
      } else {
        this.consecutiveFailures = 0;
      }

      this.progress = {
        ...this.progress,
        current: null,
        isRunning: false,
        phase: 'complete',
        lastSyncAt: new Date(),
      };
      this.notifyProgress();
      this.notifyComplete(result);

      console.log(`[SyncManager] Sync complete: ${synced} synced, ${failed} failed in ${result.duration}ms`);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown sync error';
      errors.push(errorMsg);
      
      const result: SyncResult = {
        success: false,
        synced,
        failed: failed + 1,
        errors,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };
      
      this.consecutiveFailures++;
      this.scheduleRetry(1);
      
      this.progress = {
        ...this.progress,
        current: null,
        isRunning: false,
        phase: 'idle',
      };
      this.notifyProgress();
      this.notifyComplete(result);
      
      console.error('[SyncManager] Sync failed:', errorMsg);
      return result;
    } finally {
      this.isRunning = false;
      this.syncQueue = null;
    }
  }

  private async syncSiteVisits(): Promise<{ synced: number; failed: number; errors: string[] }> {
    const visits = await getUnsyncedSiteVisits();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const visit of visits) {
      try {
        this.progress.current = `Syncing visit: ${visit.siteName}`;
        this.notifyProgress();

        if (visit.status === 'started') {
          // Check for conflicts first
          const { data: serverData, error: fetchError } = await supabase
            .from('mmp_site_entries')
            .select('status, visit_started_at, updated_at')
            .eq('id', visit.siteEntryId)
            .single();

          if (fetchError && fetchError.code !== 'PGRST116') {
            throw fetchError;
          }

          // Deduplication check: Skip if server already has this visit in a terminal/advanced state
          if (this.isTerminalOrAdvancedStatus(serverData?.status, 'started')) {
            console.log(`[SyncManager] Skipping started visit ${visit.id} - server already has status: ${serverData?.status}`);
            await markSiteVisitSynced(visit.id);
            synced++;
            this.progress.completed++;
            this.notifyProgress();
            continue;
          }

          // Resolve conflict using configured strategy
          const shouldUpdate = this.resolveConflict(visit, serverData);
          if (!shouldUpdate) {
            console.log(`[SyncManager] Skipping visit ${visit.id} due to conflict resolution`);
            await markSiteVisitSynced(visit.id);
            synced++;
            this.progress.completed++;
            this.notifyProgress();
            continue;
          }

          const { error } = await supabase
            .from('mmp_site_entries')
            .update({
              status: 'In Progress',
              visit_started_at: visit.startedAt,
              additional_data: {
                offline_start: true,
                start_location: visit.startLocation,
                synced_at: new Date().toISOString(),
              },
            })
            .eq('id', visit.siteEntryId);

          if (error) throw error;
        } else if (visit.status === 'completed') {
          const { data: existingEntry, error: fetchError } = await supabase
            .from('mmp_site_entries')
            .select('additional_data, status, updated_at')
            .eq('id', visit.siteEntryId)
            .single();

          if (fetchError) throw fetchError;

          // Deduplication check: Skip if server already has this visit in a terminal state
          if (this.isTerminalOrAdvancedStatus(existingEntry?.status, 'completed')) {
            console.log(`[SyncManager] Skipping completed visit ${visit.id} - server already has status: ${existingEntry?.status}`);
            await markSiteVisitSynced(visit.id);
            synced++;
            this.progress.completed++;
            this.notifyProgress();
            continue;
          }

          const updateData: Record<string, any> = {
            status: 'Completed',
            visit_completed_at: visit.completedAt,
          };

          if (visit.notes) {
            updateData.notes = visit.notes;
          }

          updateData.additional_data = {
            ...(existingEntry?.additional_data || {}),
            offline_complete: true,
            end_location: visit.endLocation,
            offline_synced_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from('mmp_site_entries')
            .update(updateData)
            .eq('id', visit.siteEntryId);

          if (error) throw error;
        }

        await markSiteVisitSynced(visit.id);
        synced++;
        this.progress.completed++;
        this.notifyProgress();
      } catch (error) {
        failed++;
        this.progress.failed++;
        const errMsg = `Failed to sync ${visit.siteName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errMsg);
        console.error('[SyncManager]', errMsg);
        
        // Don't stop on individual failures, continue with next
        await this.delay(500); // Brief delay before next attempt
      }
    }

    return { synced, failed, errors };
  }

  private resolveConflict(local: any, server: any): boolean {
    if (!server) return true; // No server data, safe to update

    switch (this.conflictResolution.strategy) {
      case 'client_wins':
        return true;
      
      case 'server_wins':
        return false;
      
      case 'last_write_wins':
        const localTime = new Date(local.startedAt || local.completedAt).getTime();
        const serverTime = new Date(server.updated_at).getTime();
        return localTime > serverTime;
      
      case 'manual':
        if (this.conflictResolution.conflictHandler) {
          return this.conflictResolution.conflictHandler(local, server);
        }
        return true;
      
      default:
        return true;
    }
  }

  /**
   * Normalizes a status string and checks if it represents a terminal or advanced state.
   * Handles various formats: 'In Progress', 'in_progress', 'in-progress', 'inprogress', etc.
   * Covers all known Supabase status values across the application.
   */
  private isTerminalOrAdvancedStatus(status: string | null | undefined, attemptedAction: 'started' | 'completed'): boolean {
    if (!status) return false;
    
    // Normalize: lowercase, remove all non-alphanumeric characters
    const normalized = status.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Terminal states - visit is definitively done and should never be updated
    const terminalStates = [
      'completed',
      'cancelled', 'canceled',
      'rejected',
      'declined',
      'closed',
      'archived',
    ];
    
    // Advanced states - visit has progressed past the initial state
    const inProgressStates = ['inprogress'];
    
    // Check for terminal states (always skip regardless of attempted action)
    if (terminalStates.includes(normalized)) {
      return true;
    }
    
    if (attemptedAction === 'started') {
      // For 'started' visits, skip if server is already in progress
      // (meaning we already synced the start or someone else started it)
      return inProgressStates.includes(normalized);
    }
    
    // For 'completed' visits, only terminal states should skip (handled above)
    return false;
  }

  private async syncLocations(): Promise<{ synced: number; failed: number; errors: string[] }> {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.user?.id) {
      return { synced: 0, failed: 0, errors: [] };
    }

    const userId = session.session.user.id;
    const locations = await getUnsyncedLocations(userId);
    
    if (locations.length === 0) {
      return { synced: 0, failed: 0, errors: [] };
    }

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];
    const syncedIds: string[] = [];

    // Get the most recent location
    const latestLocation = locations.reduce((latest, loc) => 
      loc.timestamp > latest.timestamp ? loc : latest
    );

    try {
      this.progress.current = 'Syncing location data...';
      this.notifyProgress();

      const { error } = await supabase
        .from('profiles')
        .update({
          location: {
            lat: latestLocation.lat,
            lng: latestLocation.lng,
            accuracy: latestLocation.accuracy,
            lastUpdated: new Date(latestLocation.timestamp).toISOString(),
            offline_synced: true,
          },
        })
        .eq('id', userId);

      if (error) throw error;

      syncedIds.push(...locations.map(l => l.id));
      synced = locations.length;
      this.progress.completed += locations.length;
      this.notifyProgress();
    } catch (error) {
      failed = locations.length;
      this.progress.failed += locations.length;
      const errMsg = `Failed to sync locations: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errMsg);
      console.error('[SyncManager]', errMsg);
    }

    if (syncedIds.length > 0) {
      await markLocationsSynced(syncedIds);
    }

    return { synced, failed, errors };
  }

  private async syncPendingActions(): Promise<{ synced: number; failed: number; errors: string[] }> {
    const actions = await getPendingSyncActions();
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    // Sort by timestamp (oldest first) and retry count (lowest first)
    const sortedActions = actions.sort((a, b) => {
      if (a.retries !== b.retries) return a.retries - b.retries;
      return a.timestamp - b.timestamp;
    });

    for (const action of sortedActions) {
      if (action.retries >= MAX_RETRIES) {
        console.warn(`[SyncManager] Skipping action ${action.id} after max retries`);
        await removeSyncAction(action.id);
        failed++;
        this.progress.failed++;
        errors.push(`Action ${action.type} exceeded max retries and was discarded`);
        continue;
      }

      try {
        this.progress.current = `Processing: ${action.type}`;
        this.notifyProgress();

        await updateSyncActionStatus(action.id, 'syncing');

        // Add retry delay with exponential backoff
        if (action.retries > 0) {
          const retryDelay = this.calculateRetryDelay(action.retries);
          console.log(`[SyncManager] Retry ${action.retries} for ${action.type}, waiting ${retryDelay}ms`);
          await this.delay(retryDelay);
        }

        switch (action.type) {
          case 'site_visit_claim':
            await this.syncSiteVisitClaim(action);
            break;
          case 'site_visit_start':
            await this.syncSiteVisitStart(action);
            break;
          case 'site_visit_complete':
            await this.syncSiteVisitComplete(action);
            break;
          case 'location_update':
            await this.syncLocationUpdate(action);
            break;
          case 'photo_upload':
            await this.syncPhotoUpload(action);
            break;
          case 'cost_submission':
            await this.syncCostSubmission(action);
            break;
          default:
            console.warn(`[SyncManager] Unknown action type: ${action.type}`);
        }

        await removeSyncAction(action.id);
        synced++;
        this.progress.completed++;
        this.notifyProgress();
      } catch (error) {
        failed++;
        this.progress.failed++;
        const errMsg = `Failed to sync ${action.type}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errMsg);
        await updateSyncActionStatus(action.id, 'failed', errMsg);
        console.error('[SyncManager]', errMsg);
      }
    }

    return { synced, failed, errors };
  }

  private async syncSiteVisitClaim(action: PendingSyncAction): Promise<void> {
    const { 
      siteEntryId, 
      userId, 
      isDispatchedSite, 
      enumeratorFee, 
      transportFee, 
      totalCost,
      classificationLevel,
      roleScope,
      feeSource,
      claimedAt 
    } = action.payload;

    if (isDispatchedSite) {
      const { data, error } = await supabase.rpc('claim_site_visit', {
        p_site_id: siteEntryId,
        p_user_id: userId,
        p_enumerator_fee: null,
        p_total_cost: null,
        p_classification_level: classificationLevel || null,
        p_role_scope: roleScope || null,
        p_fee_source: feeSource
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message: string };
      if (!result.success) {
        throw new Error(result.message || result.error || 'Claim failed');
      }
    } else {
      const { error } = await supabase
        .from('mmp_site_entries')
        .update({
          status: 'accepted',
          accepted_by: userId,
          accepted_at: claimedAt,
          updated_at: new Date().toISOString(),
          enumerator_fee: enumeratorFee,
          transport_fee: transportFee,
          cost: totalCost,
          additional_data: {
            offline_claim: true,
            offline_synced_at: new Date().toISOString(),
          }
        })
        .eq('id', siteEntryId);

      if (error) throw error;
    }
  }

  private async syncSiteVisitStart(action: PendingSyncAction): Promise<void> {
    const { siteEntryId, startedAt, location, userId } = action.payload;

    const { error } = await supabase
      .from('mmp_site_entries')
      .update({
        status: 'In Progress',
        visit_started_at: startedAt,
        visit_started_by: userId,
        additional_data: {
          offline_start: true,
          start_location: location,
          offline_synced_at: new Date().toISOString(),
        },
      })
      .eq('id', siteEntryId);

    if (error) throw error;
  }

  private async syncSiteVisitComplete(action: PendingSyncAction): Promise<void> {
    const { siteEntryId, completedAt, location, notes, userId } = action.payload;

    const { data: existing, error: fetchError } = await supabase
      .from('mmp_site_entries')
      .select('additional_data, enumerator_fee, transport_fee')
      .eq('id', siteEntryId)
      .single();

    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from('mmp_site_entries')
      .update({
        status: 'Completed',
        visit_completed_at: completedAt,
        visit_completed_by: userId,
        notes: notes || existing?.additional_data?.notes,
        additional_data: {
          ...(existing?.additional_data || {}),
          offline_complete: true,
          end_location: location,
          offline_synced_at: new Date().toISOString(),
        },
      })
      .eq('id', siteEntryId);

    if (error) throw error;

    // Process wallet transaction for completed visit
    const fee = (existing?.enumerator_fee || 0) + (existing?.transport_fee || 0);
    if (fee > 0 && userId) {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, total_earned')
        .eq('user_id', userId)
        .single();

      if (wallet) {
        await supabase.from('wallet_transactions').insert({
          wallet_id: wallet.id,
          user_id: userId,
          type: 'earning',
          amount: fee,
          amount_cents: Math.round(fee * 100),
          description: `Site visit completion (offline sync)`,
          reference_id: siteEntryId,
          reference_type: 'site_visit',
        });

        await supabase
          .from('wallets')
          .update({ total_earned: (wallet.total_earned || 0) + fee })
          .eq('id', wallet.id);
      }
    }
  }

  private async syncLocationUpdate(action: PendingSyncAction): Promise<void> {
    const { userId, lat, lng, accuracy, timestamp } = action.payload;

    const { error } = await supabase
      .from('profiles')
      .update({
        location: {
          lat,
          lng,
          accuracy,
          lastUpdated: new Date(timestamp).toISOString(),
          offline_synced: true,
        },
      })
      .eq('id', userId);

    if (error) throw error;
  }

  private async syncPhotoUpload(action: PendingSyncAction): Promise<void> {
    const { siteEntryId, photoData, fileName } = action.payload;
    
    let base64Data = photoData;
    if (photoData.includes(',')) {
      base64Data = photoData.split(',')[1];
    }
    
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });

    const filePath = `site-visits/${siteEntryId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('site-photos')
      .upload(filePath, blob, { 
        contentType: 'image/jpeg',
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: existing } = await supabase
      .from('mmp_site_entries')
      .select('additional_data')
      .eq('id', siteEntryId)
      .single();

    const existingPhotos = existing?.additional_data?.photos || [];
    await supabase
      .from('mmp_site_entries')
      .update({
        additional_data: {
          ...(existing?.additional_data || {}),
          photos: [...existingPhotos, filePath],
        },
      })
      .eq('id', siteEntryId);
  }

  private async syncCostSubmission(action: PendingSyncAction): Promise<void> {
    const payload = action.payload;
    
    const { error } = await supabase
      .from('cost_submissions')
      .insert({
        user_id: payload.userId,
        site_visit_id: payload.siteVisitId,
        transport_cost: payload.transportCost,
        other_costs: payload.otherCosts,
        notes: payload.notes,
        status: 'pending',
        created_at: payload.createdAt || new Date().toISOString(),
      });

    if (error) throw error;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getProgress(): SyncProgress {
    return { ...this.progress };
  }

  getLastResult(): SyncResult | null {
    return this.lastSyncResult;
  }

  isCurrentlySyncing(): boolean {
    return this.isRunning;
  }

  isOnline(): boolean {
    return navigator.onLine;
  }

  async forceSync(): Promise<SyncResult> {
    this.cancelPendingRetry();
    this.consecutiveFailures = 0;
    return this.syncAll(true);
  }

  destroy() {
    this.cancelPendingRetry();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.progressCallbacks.clear();
    this.completeCallbacks.clear();
    this.networkCallbacks.clear();
  }
}

export const syncManager = new SyncManager();

export function setupAutoSync(intervalMs: number = 30000) {
  let syncInterval: NodeJS.Timeout | null = null;
  let isActive = true;

  const runSync = async () => {
    if (!isActive) return;
    
    try {
      if (navigator.onLine && !syncManager.isCurrentlySyncing()) {
        const stats = await getOfflineStats();
        if (stats.pendingActions > 0 || stats.unsyncedVisits > 0 || stats.unsyncedLocations > 0) {
          console.log('[AutoSync] Background sync starting...', stats);
          await syncManager.syncAll();
        }
      }
    } catch (error) {
      console.error('[AutoSync] Background sync error:', error);
    }
  };

  const startInterval = () => {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(runSync, intervalMs);
    runSync();
  };

  const stopInterval = () => {
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  };

  const handleOnline = () => {
    console.log('[AutoSync] Network restored, starting background sync...');
    runSync();
    startInterval();
  };

  const handleOffline = () => {
    console.log('[AutoSync] Network lost, pausing background sync...');
    stopInterval();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      console.log('[AutoSync] App became visible, syncing...');
      runSync();
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibility);

  if (navigator.onLine) {
    startInterval();
  }

  return () => {
    isActive = false;
    stopInterval();
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
}

// Hook for React components
export function useSyncManager() {
  return {
    syncAll: () => syncManager.syncAll(),
    forceSync: () => syncManager.forceSync(),
    getProgress: () => syncManager.getProgress(),
    getLastResult: () => syncManager.getLastResult(),
    isCurrentlySyncing: () => syncManager.isCurrentlySyncing(),
    isOnline: () => syncManager.isOnline(),
    onProgress: (cb: SyncProgressCallback) => syncManager.onProgress(cb),
    onComplete: (cb: SyncCompleteCallback) => syncManager.onComplete(cb),
    onNetworkChange: (cb: NetworkStatusCallback) => syncManager.onNetworkChange(cb),
    setConflictResolution: (res: ConflictResolution) => syncManager.setConflictResolution(res),
  };
}
