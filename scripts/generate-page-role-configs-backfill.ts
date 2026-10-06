import { writeFileSync } from 'node:fs';
import { PAGE_DEFS } from '../src/lib/access-registry';

/** Slugs that already have page_role_configs rows (do not overwrite). */
const EXISTING = new Set([
  'calendar',
  'cost-approval',
  'cost-submission',
  'dashboard',
  'down-payment-approval',
  'incentives',
  'mmp',
  'my-projects',
  'my-tasks',
  'notification-history',
  'notification-preferences',
  'notifications',
  'portfolio',
  'programme-hub',
  'projects',
  'search',
  'workspace',
]);

function sqlTextArray(roles: string[]): string {
  if (roles.length === 0) return 'ARRAY[]::text[]';
  return `ARRAY[${roles.map(r => `'${r.replace(/'/g, "''")}'`).join(', ')}]::text[]`;
}

const missing = PAGE_DEFS.filter(p => !EXISTING.has(p.slug) && !p.slug.includes(':'));
const values = missing
  .map(p => `  ('${p.slug.replace(/'/g, "''")}', ${sqlTextArray(p.roles)})`)
  .join(',\n');

const sql = `-- Backfill page_role_configs for PAGE_DEFS slugs that have no DB row yet.
-- Existing rows are left untouched (Role Management / ops may have customized them).
INSERT INTO public.page_role_configs (page_slug, roles)
VALUES
${values}
ON CONFLICT (page_slug) DO NOTHING;
`;

const out = 'supabase/migrations/20261007010000_backfill_page_role_configs_from_page_defs.sql';
writeFileSync(out, sql);
console.log(`Wrote ${missing.length} rows to ${out}`);
