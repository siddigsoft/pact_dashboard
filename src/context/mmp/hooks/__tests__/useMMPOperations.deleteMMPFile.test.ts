/**
 * useMMPOperations – deleteMMPFile cascade-delete tests
 *
 * These tests verify that the MMP deletion flow completes without FK errors
 * after the migrations:
 *   • 20260803_mmp_fk_set_null_on_delete.sql
 *   • 20260803b_mmp_full_fk_audit.sql
 *
 * All Supabase calls are mocked so the suite runs offline (no DB required).
 * See scripts/test-mmp-delete-e2e.js for a live-database runbook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/session-health', () => ({
  ensureValidSession: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/utils/promise-with-timeout', () => ({
  withTimeout: vi.fn((promise: Promise<unknown>) => promise),
}));

vi.mock('@/services/mmpAudit.service', () => ({
  logDeletionAudit: vi.fn().mockResolvedValue(undefined),
}));

// ─── Supabase chainable mock factory ─────────────────────────────────────────

/**
 * buildSupabaseMock(overrides) creates a minimal chainable Supabase mock.
 * Every .from(...) call returns a fluent builder whose terminal operations
 * (.select / .delete / .update / .eq / .in) resolve to { data, error }.
 *
 * Pass `overrides` to make specific table operations return errors, e.g.:
 *   { 'mmp_files::delete': { error: { message: 'FK violation' } } }
 *
 * Key format: '<table>::<operation>'  (operation = select | delete | update)
 */
function buildSupabaseMock(
  overrides: Record<string, { data?: unknown; error?: { message: string; details?: string } }> = {}
) {
  const ok = { data: [], error: null };

  const makeBuilder = (table: string) => {
    let op = 'select';

    const resolve = () => overrides[`${table}::${op}`] ?? ok;

    const builder: Record<string, unknown> = {
      select: vi.fn(() => { op = 'select'; return builder; }),
      delete: vi.fn(() => { op = 'delete'; return builder; }),
      update: vi.fn(() => { op = 'update'; return builder; }),
      insert: vi.fn(() => { op = 'insert'; return builder; }),
      eq:     vi.fn(() => builder),
      neq:    vi.fn(() => builder),
      in:     vi.fn(() => builder),
      is:     vi.fn(() => builder),
      then:   vi.fn((cb: (v: unknown) => unknown) => Promise.resolve(resolve()).then(cb)),
    };

    // Make the builder awaitable (Promise-like)
    Object.defineProperty(builder, Symbol.toStringTag, { value: 'Promise' });
    (builder as unknown as Promise<unknown>)[Symbol.iterator as never];

    return new Proxy(builder, {
      get(target, prop) {
        if (prop in target) return target[prop];
        // Any unknown method (e.g. .single) returns the builder itself
        return vi.fn(() => Promise.resolve(resolve()));
      },
    });
  };

  const storageBucket = {
    remove: vi.fn().mockResolvedValue({ error: null }),
    upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };

  return {
    from: vi.fn((table: string) => makeBuilder(table)),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: {
              id: 'test-user-id',
              email: 'test@example.com',
              user_metadata: { full_name: 'Test User' },
            },
          },
        },
      }),
    },
    storage: {
      from: vi.fn(() => storageBucket),
    },
    _storageBucket: storageBucket, // exposed for assertions
  };
}

// ─── Module under test ────────────────────────────────────────────────────────

// We import the module AFTER setting up mocks so vi.mock replacements apply.
// The `supabase` mock is injected via vi.mock below.
let supabaseMock: ReturnType<typeof buildSupabaseMock>;

vi.mock('@/integrations/supabase/client', () => ({
  get supabase() { return supabaseMock; },
}));

import { useMMPOperations } from '../useMMPOperations';
import type { MMPFile } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_MMP_ID = 'test-mmp-uuid-001';

function makeFakeMMPFile(overrides: Partial<MMPFile> = {}): MMPFile {
  return {
    id: TEST_MMP_ID,
    name: 'test-mmp.csv',
    mmpId: 'MMP-2026-001',
    filePath: 'mmp-files/test-mmp.csv',
    status: 'approved',
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'test-user-id',
    ...overrides,
  } as MMPFile;
}

function renderHookWithMMP(mmps: MMPFile[]) {
  const setMMPFiles = vi.fn();
  const { result } = renderHook(() =>
    useMMPOperations(mmps, setMMPFiles)
  );
  return { result, setMMPFiles };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('deleteMMPFile – cascade delete after FK migrations', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock = buildSupabaseMock();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns true and calls setMMPFiles when all deletes succeed', async () => {
    const mmp = makeFakeMMPFile();
    const { result, setMMPFiles } = renderHookWithMMP([mmp]);

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    expect(outcome).toBe(true);
    expect(setMMPFiles).toHaveBeenCalled();
  });

  it('queries document_index before deleting records (storage path collection)', async () => {
    const mmp = makeFakeMMPFile();
    const { result } = renderHookWithMMP([mmp]);

    await act(async () => {
      await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    // Should have called from('document_index') for the select + delete
    const docIndexCalls = (supabaseMock.from as ReturnType<typeof vi.fn>).mock.calls
      .filter(([t]: [string]) => t === 'document_index');
    expect(docIndexCalls.length).toBeGreaterThanOrEqual(2); // select + delete
  });

  it('deletes site_visit_photos before mmp_site_entries and mmp_files', async () => {
    const mmp = makeFakeMMPFile();
    const { result } = renderHookWithMMP([mmp]);

    await act(async () => {
      await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    const calls = (supabaseMock.from as ReturnType<typeof vi.fn>).mock.calls.map(
      ([t]: [string]) => t
    );

    const photoIdx    = calls.lastIndexOf('site_visit_photos');
    const entriesIdx  = calls.lastIndexOf('mmp_site_entries');
    const mmpFilesIdx = calls.lastIndexOf('mmp_files');

    // Photos must be cleared before entries (which are cleared before the parent)
    expect(photoIdx).toBeLessThan(entriesIdx);
    expect(entriesIdx).toBeLessThan(mmpFilesIdx);
  });

  it('deletes mmp_site_entries before the parent mmp_files row', async () => {
    const mmp = makeFakeMMPFile();
    const { result } = renderHookWithMMP([mmp]);

    await act(async () => {
      await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    const calls = (supabaseMock.from as ReturnType<typeof vi.fn>).mock.calls.map(
      ([t]: [string]) => t
    );

    // mmp_site_entries delete must appear before the final mmp_files delete
    const entriesIdx  = calls.lastIndexOf('mmp_site_entries');
    const mmpFilesIdx = calls.lastIndexOf('mmp_files');
    expect(entriesIdx).toBeLessThan(mmpFilesIdx);
  });

  it('attempts storage cleanup for both permits and site-photos buckets', async () => {
    const mmp = makeFakeMMPFile();
    // Simulate document_index returning a storage path so cleanup is triggered
    supabaseMock = buildSupabaseMock({
      'document_index::select': {
        data: [{ storage_path: 'permits/receipt-001.pdf', file_url: null }],
        error: null,
      },
    });

    const { result } = renderHookWithMMP([mmp]);
    await act(async () => {
      await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    const bucketCalls = (supabaseMock.storage.from as ReturnType<typeof vi.fn>).mock.calls.map(
      ([b]: [string]) => b
    );
    expect(bucketCalls).toContain('permits');
    expect(bucketCalls).toContain('site-photos');
  });

  it('cleans up the MMP file from mmp-files storage bucket', async () => {
    const mmp = makeFakeMMPFile({ filePath: 'mmp-files/test-mmp.csv' });
    const { result } = renderHookWithMMP([mmp]);

    await act(async () => {
      await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    const bucketCalls = (supabaseMock.storage.from as ReturnType<typeof vi.fn>).mock.calls.map(
      ([b]: [string]) => b
    );
    expect(bucketCalls).toContain('mmp-files');
    expect(supabaseMock._storageBucket.remove).toHaveBeenCalled();
  });

  // ── FK / error paths ────────────────────────────────────────────────────────

  it('returns false when the final mmp_files delete fails (FK error)', async () => {
    supabaseMock = buildSupabaseMock({
      'mmp_files::delete': {
        data: null,
        error: { message: 'FK constraint violation', details: 'Key (id)=(test-mmp-uuid-001) is still referenced from table "site_visits".' },
      },
    });

    const mmp = makeFakeMMPFile();
    const { result } = renderHookWithMMP([mmp]);

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    expect(outcome).toBe(false);
  });

  it('does NOT update local state when the DB delete fails', async () => {
    supabaseMock = buildSupabaseMock({
      'mmp_files::delete': {
        data: null,
        error: { message: 'FK constraint violation' },
      },
    });

    const mmp = makeFakeMMPFile();
    const { result, setMMPFiles } = renderHookWithMMP([mmp]);

    await act(async () => {
      await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    // setMMPFiles must NOT have been called to remove the item
    expect(setMMPFiles).not.toHaveBeenCalled();
  });

  it('returns false when session is invalid', async () => {
    const { ensureValidSession } = await import('@/lib/session-health');
    vi.mocked(ensureValidSession).mockResolvedValueOnce({ success: false, error: 'Session expired' });

    const mmp = makeFakeMMPFile();
    const { result } = renderHookWithMMP([mmp]);

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    expect(outcome).toBe(false);
    // No DB calls should have been made
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('handles a missing MMP (id not in local state) gracefully', async () => {
    const { result } = renderHookWithMMP([]); // no local MMP records

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.deleteMMPFile('nonexistent-id');
    });

    // Should still attempt the DB delete (might already be gone) — just not error out
    // The function should return true or false without throwing
    expect(typeof outcome).toBe('boolean');
  });

  // ── Child-table partial-failure resilience ──────────────────────────────────

  it('continues the delete sequence even if document_index cleanup fails', async () => {
    supabaseMock = buildSupabaseMock({
      'document_index::delete': {
        data: null,
        error: { message: 'permission denied' },
      },
    });

    const mmp = makeFakeMMPFile();
    const { result } = renderHookWithMMP([mmp]);

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    // document_index failure is non-fatal; final delete should still succeed
    expect(outcome).toBe(true);
  });

  it('continues the delete sequence even if site_visit_photos cleanup fails', async () => {
    supabaseMock = buildSupabaseMock({
      'site_visit_photos::delete': {
        data: null,
        error: { message: 'permission denied' },
      },
    });

    const mmp = makeFakeMMPFile();
    const { result } = renderHookWithMMP([mmp]);

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    expect(outcome).toBe(true);
  });

  it('continues even if mmp_site_entries delete fails (SET NULL FK means parent delete still works)', async () => {
    supabaseMock = buildSupabaseMock({
      'mmp_site_entries::delete': {
        data: null,
        error: { message: 'permission denied' },
      },
    });

    const mmp = makeFakeMMPFile();
    const { result } = renderHookWithMMP([mmp]);

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.deleteMMPFile(TEST_MMP_ID);
    });

    // Even if entries delete fails, the FK is now SET NULL so the parent delete works
    expect(outcome).toBe(true);
  });
});
