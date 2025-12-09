import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'pact-form-drafts';
const DB_VERSION = 1;
const DRAFTS_STORE = 'drafts';

const AUTO_SAVE_INTERVAL = 30000;
const MAX_DRAFTS_PER_FORM = 5;
const DRAFT_EXPIRY_DAYS = 7;

export interface FormDraft<T = Record<string, any>> {
  id: string;
  formId: string;
  userId: string;
  data: T;
  lastSaved: number;
  createdAt: number;
  version: number;
  metadata?: {
    formTitle?: string;
    step?: number;
    totalSteps?: number;
    completionPercent?: number;
  };
}

export interface DraftRecoveryInfo {
  hasDraft: boolean;
  draft?: FormDraft;
  age: string;
  isStale: boolean;
}

let db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (db) return db;

  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(DRAFTS_STORE)) {
        const store = database.createObjectStore(DRAFTS_STORE, { keyPath: 'id' });
        store.createIndex('formId', 'formId');
        store.createIndex('userId', 'userId');
        store.createIndex('formUser', ['formId', 'userId']);
        store.createIndex('lastSaved', 'lastSaved');
      }
    },
  });

  return db;
}

function generateDraftId(formId: string, userId: string): string {
  return `${formId}__${userId}__${Date.now()}`;
}

export async function saveDraft<T>(
  formId: string,
  userId: string,
  data: T,
  metadata?: FormDraft['metadata']
): Promise<FormDraft<T>> {
  const database = await getDB();

  const existingDrafts = await database.getAllFromIndex(DRAFTS_STORE, 'formUser', [formId, userId]);

  let draft: FormDraft<T>;

  if (existingDrafts.length > 0) {
    const latestDraft = existingDrafts.sort((a, b) => b.lastSaved - a.lastSaved)[0];

    draft = {
      ...latestDraft,
      data,
      lastSaved: Date.now(),
      version: latestDraft.version + 1,
      metadata: { ...latestDraft.metadata, ...metadata },
    } as FormDraft<T>;
  } else {
    draft = {
      id: generateDraftId(formId, userId),
      formId,
      userId,
      data,
      lastSaved: Date.now(),
      createdAt: Date.now(),
      version: 1,
      metadata,
    };
  }

  await database.put(DRAFTS_STORE, draft);

  if (existingDrafts.length > MAX_DRAFTS_PER_FORM) {
    const oldDrafts = existingDrafts
      .sort((a, b) => b.lastSaved - a.lastSaved)
      .slice(MAX_DRAFTS_PER_FORM);

    for (const oldDraft of oldDrafts) {
      await database.delete(DRAFTS_STORE, oldDraft.id);
    }
  }

  return draft;
}

export async function getDraft<T>(formId: string, userId: string): Promise<FormDraft<T> | null> {
  const database = await getDB();
  const drafts = await database.getAllFromIndex(DRAFTS_STORE, 'formUser', [formId, userId]);

  if (drafts.length === 0) return null;

  const latestDraft = drafts.sort((a, b) => b.lastSaved - a.lastSaved)[0] as FormDraft<T>;

  const ageMs = Date.now() - latestDraft.lastSaved;
  const expiryMs = DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  if (ageMs > expiryMs) {
    await deleteDraft(formId, userId);
    return null;
  }

  return latestDraft;
}

export async function checkForDraft(formId: string, userId: string): Promise<DraftRecoveryInfo> {
  const draft = await getDraft(formId, userId);

  if (!draft) {
    return { hasDraft: false, age: '', isStale: false };
  }

  const ageMs = Date.now() - draft.lastSaved;
  const staleThresholdMs = 24 * 60 * 60 * 1000;

  let age: string;
  if (ageMs < 60000) {
    age = 'Just now';
  } else if (ageMs < 3600000) {
    const mins = Math.floor(ageMs / 60000);
    age = `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  } else if (ageMs < 86400000) {
    const hours = Math.floor(ageMs / 3600000);
    age = `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(ageMs / 86400000);
    age = `${days} day${days !== 1 ? 's' : ''} ago`;
  }

  return {
    hasDraft: true,
    draft,
    age,
    isStale: ageMs > staleThresholdMs,
  };
}

export async function deleteDraft(formId: string, userId: string): Promise<void> {
  const database = await getDB();
  const drafts = await database.getAllFromIndex(DRAFTS_STORE, 'formUser', [formId, userId]);

  for (const draft of drafts) {
    await database.delete(DRAFTS_STORE, draft.id);
  }
}

export async function deleteAllDraftsForUser(userId: string): Promise<number> {
  const database = await getDB();
  const drafts = await database.getAllFromIndex(DRAFTS_STORE, 'userId', userId);

  for (const draft of drafts) {
    await database.delete(DRAFTS_STORE, draft.id);
  }

  return drafts.length;
}

export async function getAllDraftsForUser(userId: string): Promise<FormDraft[]> {
  const database = await getDB();
  const drafts = await database.getAllFromIndex(DRAFTS_STORE, 'userId', userId);
  return drafts.sort((a, b) => b.lastSaved - a.lastSaved);
}

export async function cleanupExpiredDrafts(): Promise<number> {
  const database = await getDB();
  const expiryTime = Date.now() - DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  const allDrafts = await database.getAll(DRAFTS_STORE);
  let deletedCount = 0;

  for (const draft of allDrafts) {
    if (draft.lastSaved < expiryTime) {
      await database.delete(DRAFTS_STORE, draft.id);
      deletedCount++;
    }
  }

  return deletedCount;
}

export class FormAutoSaver<T extends Record<string, any>> {
  private formId: string;
  private userId: string;
  private interval: NodeJS.Timeout | null = null;
  private lastData: T | null = null;
  private isDirty: boolean = false;
  private onSaveCallback?: (draft: FormDraft<T>) => void;
  private onErrorCallback?: (error: Error) => void;
  private metadata?: FormDraft['metadata'];

  constructor(
    formId: string,
    userId: string,
    options?: {
      onSave?: (draft: FormDraft<T>) => void;
      onError?: (error: Error) => void;
      metadata?: FormDraft['metadata'];
    }
  ) {
    this.formId = formId;
    this.userId = userId;
    this.onSaveCallback = options?.onSave;
    this.onErrorCallback = options?.onError;
    this.metadata = options?.metadata;
  }

  start(): void {
    if (this.interval) return;

    this.interval = setInterval(async () => {
      if (this.isDirty && this.lastData) {
        await this.save();
      }
    }, AUTO_SAVE_INTERVAL);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  update(data: T, metadata?: FormDraft['metadata']): void {
    this.lastData = data;
    this.isDirty = true;
    if (metadata) {
      this.metadata = { ...this.metadata, ...metadata };
    }
  }

  updateMetadata(metadata: Partial<FormDraft['metadata']>): void {
    this.metadata = { ...this.metadata, ...metadata };
  }

  async save(): Promise<FormDraft<T> | null> {
    if (!this.lastData) return null;

    try {
      const draft = await saveDraft(this.formId, this.userId, this.lastData, this.metadata);
      this.isDirty = false;
      this.onSaveCallback?.(draft);
      return draft;
    } catch (error) {
      this.onErrorCallback?.(error as Error);
      return null;
    }
  }

  async forceSave(): Promise<FormDraft<T> | null> {
    return this.save();
  }

  async loadDraft(): Promise<FormDraft<T> | null> {
    return getDraft<T>(this.formId, this.userId);
  }

  async discardDraft(): Promise<void> {
    await deleteDraft(this.formId, this.userId);
    this.lastData = null;
    this.isDirty = false;
  }

  isDraftDirty(): boolean {
    return this.isDirty;
  }
}

export function useFormAutoSave<T extends Record<string, any>>(
  formId: string,
  userId: string,
  options?: {
    onSave?: (draft: FormDraft<T>) => void;
    onError?: (error: Error) => void;
    metadata?: FormDraft['metadata'];
  }
): FormAutoSaver<T> {
  return new FormAutoSaver<T>(formId, userId, options);
}
