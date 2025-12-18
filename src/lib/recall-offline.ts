import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface RecallDraft {
  id: string;
  mmpId: string;
  mmpName: string;
  tier: 'admin_to_fom' | 'fom_to_coordinator' | 'coordinator_to_collector';
  scopeType: string;
  scopeFilters?: Record<string, any>;
  reason?: string;
  recoveryMethod?: 'deduct_future' | 'cash_return' | 'write_off';
  affectedSiteIds: string[];
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'pending_sync' | 'synced' | 'failed';
  syncError?: string;
}

interface PendingApproval {
  id: string;
  recallEventId: string;
  mmpId: string;
  mmpName: string;
  action: 'approve' | 'reject';
  notes?: string;
  createdAt: string;
  status: 'pending_sync' | 'synced' | 'failed';
  syncError?: string;
}

interface RecallOfflineDB extends DBSchema {
  recall_drafts: {
    key: string;
    value: RecallDraft;
    indexes: { 
      'by-mmp': string;
      'by-status': string;
    };
  };
  pending_approvals: {
    key: string;
    value: PendingApproval;
    indexes: { 
      'by-recall': string;
      'by-status': string;
    };
  };
}

const DB_NAME = 'pact-recall-offline';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RecallOfflineDB>> | null = null;

async function getDB(): Promise<IDBPDatabase<RecallOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RecallOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('recall_drafts')) {
          const draftsStore = db.createObjectStore('recall_drafts', { keyPath: 'id' });
          draftsStore.createIndex('by-mmp', 'mmpId');
          draftsStore.createIndex('by-status', 'status');
        }

        if (!db.objectStoreNames.contains('pending_approvals')) {
          const approvalsStore = db.createObjectStore('pending_approvals', { keyPath: 'id' });
          approvalsStore.createIndex('by-recall', 'recallEventId');
          approvalsStore.createIndex('by-status', 'status');
        }
      },
    });
  }
  return dbPromise;
}

export async function saveRecallDraft(draft: Omit<RecallDraft, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<string> {
  const db = await getDB();
  const id = `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();
  
  const fullDraft: RecallDraft = {
    ...draft,
    id,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
  };

  await db.put('recall_drafts', fullDraft);
  return id;
}

export async function updateRecallDraft(id: string, updates: Partial<RecallDraft>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('recall_drafts', id);
  
  if (!existing) {
    throw new Error('Draft not found');
  }

  const updated: RecallDraft = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await db.put('recall_drafts', updated);
}

export async function getRecallDraft(id: string): Promise<RecallDraft | undefined> {
  const db = await getDB();
  return db.get('recall_drafts', id);
}

export async function getRecallDraftsByMmp(mmpId: string): Promise<RecallDraft[]> {
  const db = await getDB();
  return db.getAllFromIndex('recall_drafts', 'by-mmp', mmpId);
}

export async function getPendingDrafts(): Promise<RecallDraft[]> {
  const db = await getDB();
  const drafts = await db.getAllFromIndex('recall_drafts', 'by-status', 'pending_sync');
  return drafts;
}

export async function deleteRecallDraft(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('recall_drafts', id);
}

export async function queueApproval(approval: Omit<PendingApproval, 'id' | 'createdAt' | 'status'>): Promise<string> {
  const db = await getDB();
  const id = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const fullApproval: PendingApproval = {
    ...approval,
    id,
    createdAt: new Date().toISOString(),
    status: 'pending_sync',
  };

  await db.put('pending_approvals', fullApproval);
  return id;
}

export async function getPendingApprovals(): Promise<PendingApproval[]> {
  const db = await getDB();
  return db.getAllFromIndex('pending_approvals', 'by-status', 'pending_sync');
}

export async function markApprovalSynced(id: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get('pending_approvals', id);
  
  if (existing) {
    await db.put('pending_approvals', {
      ...existing,
      status: 'synced',
    });
  }
}

export async function markApprovalFailed(id: string, error: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get('pending_approvals', id);
  
  if (existing) {
    await db.put('pending_approvals', {
      ...existing,
      status: 'failed',
      syncError: error,
    });
  }
}

export async function getOfflineRecallStats(): Promise<{
  draftCount: number;
  pendingSyncCount: number;
  failedCount: number;
}> {
  const db = await getDB();
  
  const allDrafts = await db.getAll('recall_drafts');
  const allApprovals = await db.getAll('pending_approvals');
  
  const draftCount = allDrafts.filter(d => d.status === 'draft').length;
  const pendingSyncCount = allDrafts.filter(d => d.status === 'pending_sync').length +
                          allApprovals.filter(a => a.status === 'pending_sync').length;
  const failedCount = allDrafts.filter(d => d.status === 'failed').length +
                     allApprovals.filter(a => a.status === 'failed').length;

  return { draftCount, pendingSyncCount, failedCount };
}

export async function clearSyncedData(): Promise<void> {
  const db = await getDB();
  
  const syncedDrafts = await db.getAllFromIndex('recall_drafts', 'by-status', 'synced');
  for (const draft of syncedDrafts) {
    await db.delete('recall_drafts', draft.id);
  }

  const syncedApprovals = await db.getAllFromIndex('pending_approvals', 'by-status', 'synced');
  for (const approval of syncedApprovals) {
    await db.delete('pending_approvals', approval.id);
  }
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

export function subscribeToOnlineStatus(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
