/**
 * registry-drift.test.ts
 *
 * Asserts that MODULE_REGISTRY tracks every trackable page in PAGE_DEFS.
 * Fails with a grouped, human-readable list of missing pages so the developer
 * knows exactly what to add to src/types/moduleRegistry.ts.
 *
 * Run as part of the normal test suite:
 *   npm test
 *
 * Or standalone for a quick coverage snapshot:
 *   npm run check:registry
 */

import { describe, it, expect, vi } from 'vitest';

// ── Supabase mock ─────────────────────────────────────────────────────────────
// PageAccessControl.tsx (which exports PAGE_DEFS) imports the Supabase client
// at module level. We mock it here to prevent initialisation side-effects when
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are absent in the test environment.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() })),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
  isSupabaseConfigured: false,
}));

// Import AFTER the mock so the mocked module is already registered
import { getRegistryDriftReport, groupDriftedPages } from '@/lib/registry-drift';

// ─────────────────────────────────────────────────────────────────────────────

describe('Button Registry — PAGE_DEFS coverage', () => {
  /**
   * Primary guard: the registry must cover every trackable page.
   * On failure the error message groups missing pages by navigation section,
   * making it easy to spot which MODULE_REGISTRY block needs updating.
   */
  it('MODULE_REGISTRY tracks every trackable page (no drift)', () => {
    const report = getRegistryDriftReport();

    if (report.driftedPages.length > 0) {
      const grouped = groupDriftedPages(report.driftedPages);
      const lines = Object.entries(grouped).flatMap(([group, pages]) => [
        `\n  ${group}:`,
        ...pages.map(p => `    • [${p.slug}]  ${p.label}  →  ${p.path}`),
      ]);

      throw new Error(
        `Button Registry is ${report.coveragePercent}% covered — ` +
        `${report.driftedPages.length} page(s) not tracked:\n` +
        lines.join('\n') +
        '\n\n' +
        'Fix: add the missing page(s) to MODULE_REGISTRY in src/types/moduleRegistry.ts\n' +
        'Docs: each page needs at least one ModuleAction entry with resource + action.',
      );
    }

    expect(report.isDrifted).toBe(false);
  });

  /**
   * Coverage threshold guard — a second line of defence in case EXCLUDED_SLUGS
   * grows too large or PAGE_DEFS shrinks unexpectedly.
   */
  it('coverage is at least 95%', () => {
    const { coveragePercent, trackedCount, totalTrackableCount } = getRegistryDriftReport();
    // Log a snapshot so the developer sees the numbers even on a passing run.
    console.info(
      `[registry-drift] coverage: ${trackedCount} / ${totalTrackableCount} trackable pages ` +
      `(${coveragePercent}%)`,
    );
    expect(coveragePercent).toBeGreaterThanOrEqual(95);
  });

  /**
   * Sanity check: PAGE_DEFS must not be empty (guards against a bad import/mock).
   */
  it('PAGE_DEFS contains trackable pages (import sanity)', () => {
    const { totalTrackableCount } = getRegistryDriftReport();
    expect(totalTrackableCount).toBeGreaterThan(10);
  });
});
