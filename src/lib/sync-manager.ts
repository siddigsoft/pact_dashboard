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
  type PendingSyncAction,
} from './offline-db';

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  current: string | null;
  isRunning: boolean;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

type SyncProgressCallback = (progress: SyncProgress) => void;
type SyncCompleteCallback = (result: SyncResult) => void;

class SyncManager {
  private isRunning = false;
  private progressCallbacks: Set<SyncProgressCallback> = new Set();
  private completeCallbacks: Set<SyncCompleteCallback> = new Set();
  private progress: SyncProgress = {
    total: 0,
    completed: 0,
    failed: 0,
    current: null,
    isRunning: false,
  };

  onProgress(callback: SyncProgressCallback): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  onComplete(callback: SyncCompleteCallback): () => void {
    this.completeCallbacks.add(callback);
    return () => this.completeCallbacks.delete(callback);
  }

  private notifyProgress() {
    this.progressCallbacks.forEach(cb => cb({ ...this.progress }));
  }

  private notifyComplete(result: SyncResult) {
    this.completeCallbacks.forEach(cb => cb(result));
  }

  async syncAll(): Promise<SyncResult> {
    if (this.isRunning) {
      return { success: false, synced: 0, failed: 0, errors: ['Sync already in progress'] };
    }

    if (!navigator.onLine) {
      return { success: false, synced: 0, failed: 0, errors: ['No network connection'] };
    }

    this.isRunning = true;
    const errors: string[] = [];
    let synced = 0;
    let failed = 0;

    try {
      const stats = await getOfflineStats();
      this.progress = {
        total: stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations,
        completed: 0,
        failed: 0,
        current: 'Starting sync...',
        isRunning: true,
      };
      this.notifyProgress();

      const siteVisitResult = await this.syncSiteVisits();
      synced += siteVisitResult.synced;
      failed += siteVisitResult.failed;
      errors.push(...siteVisitResult.errors);

      const locationResult = await this.syncLocations();
      synced += locationResult.synced;
      failed += locationResult.failed;
      errors.push(...locationResult.errors);

      const pendingResult = await this.syncPendingActions();
      synced += pendingResult.synced;
      failed += pendingResult.failed;
      errors.push(...pendingResult.errors);

      const result: SyncResult = {
        success: failed === 0,
        synced,
        failed,
        errors,
      };

      this.progress = {
        ...this.progress,
        current: null,
        isRunning: false,
      };
      this.notifyProgress();
      this.notifyComplete(result);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown sync error';
      errors.push(errorMsg);
      
      const result: SyncResult = {
        success: false,
        synced,
        failed: failed + 1,
        errors,
      };
      
      this.progress.isRunning = false;
      this.notifyProgress();
      this.notifyComplete(result);
      
      return result;
    } finally {
      this.isRunning = false;
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
          const { error } = await supabase
            .from('mmp_site_entries')
            .update({
              status: 'In Progress',
              visit_started_at: visit.startedAt,
              additional_data: {
                offline_start: true,
                start_location: visit.startLocation,
              },
            })
            .eq('id', visit.siteEntryId);

          if (error) throw error;
        } else if (visit.status === 'completed') {
          const updateData: any = {
            status: 'Completed',
            visit_completed_at: visit.completedAt,
          };

          if (visit.notes) {
            updateData.notes = visit.notes;
          }

          const { data: existingEntry, error: fetchError } = await supabase
            .from('mmp_site_entries')
            .select('additional_data')
            .eq('id', visit.siteEntryId)
            .single();

          if (fetchError) throw fetchError;

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
      }
    }

    return { synced, failed, errors };
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

    for (const action of actions) {
      if (action.retries >= 3) {
        console.warn(`[SyncManager] Skipping action ${action.id} after max retries`);
        continue;
      }

      try {
        this.progress.current = `Processing: ${action.type}`;
        this.notifyProgress();

        await updateSyncActionStatus(action.id, 'syncing');

        switch (action.type) {
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

  getProgress(): SyncProgress {
    return { ...this.progress };
  }

  isCurrentlySyncing(): boolean {
    return this.isRunning;
  }
}

export const syncManager = new SyncManager();

export function setupAutoSync() {
  let syncTimeout: NodeJS.Timeout | null = null;

  const scheduleSync = () => {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
      if (navigator.onLine && !syncManager.isCurrentlySyncing()) {
        const stats = await getOfflineStats();
        if (stats.pendingActions > 0 || stats.unsyncedVisits > 0 || stats.unsyncedLocations > 0) {
          console.log('[AutoSync] Starting automatic sync...');
          await syncManager.syncAll();
        }
      }
    }, 5000);
  };

  window.addEventListener('online', () => {
    console.log('[AutoSync] Network restored, scheduling sync...');
    scheduleSync();
  });

  if (navigator.onLine) {
    scheduleSync();
  }

  return () => {
    if (syncTimeout) clearTimeout(syncTimeout);
  };
}
