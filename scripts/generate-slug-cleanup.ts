#!/usr/bin/env ts-node
/**
 * generate-slug-cleanup.ts
 *
 * #80 — Auto-generate the valid-slug list in cleanup_orphan_page_permissions.sql
 * from the PAGE_DEFS source in PageAccessControl.tsx so the SQL never goes
 * stale after a page is added or removed.
 *
 * Usage:
 *   npx ts-node scripts/generate-slug-cleanup.ts
 *
 * The script rewrites ONLY the valid_slugs array inside the DO $$ block at the
 * top of supabase/migrations/cleanup_orphan_page_permissions.sql.  All other
 * SQL is preserved verbatim.
 *
 * Run this after adding or removing entries from PAGE_DEFS in
 * src/pages/PageAccessControl.tsx, then commit the updated migration file.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PAC_FILE = path.join(ROOT, 'src/pages/PageAccessControl.tsx');
const SQL_FILE = path.join(ROOT, 'supabase/migrations/cleanup_orphan_page_permissions.sql');

function extractSlugs(source: string): string[] {
  const slugRe = /slug\s*:\s*'([^']+)'/g;
  const slugs = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = slugRe.exec(source)) !== null) {
    slugs.add(m[1]);
  }
  return [...slugs].sort();
}

function buildArrayLiteral(slugs: string[]): string {
  const lines = slugs.map((s, i) => `    '${s}'${i < slugs.length - 1 ? ',' : ''}`);
  return `ARRAY[\n${lines.join('\n')}\n  ]`;
}

function rewriteSql(sqlContent: string, newArray: string): string {
  const arrayRe = /ARRAY\[[\s\S]*?\]/;
  if (!arrayRe.test(sqlContent)) {
    throw new Error('Could not find ARRAY[...] block in SQL file — structure may have changed.');
  }
  const today = new Date().toISOString().slice(0, 10);
  let updated = sqlContent.replace(arrayRe, newArray);
  updated = updated.replace(
    /-- Last synced: \d{4}-\d{2}-\d{2}/,
    `-- Last synced: ${today}`,
  );
  return updated;
}

function main() {
  if (!fs.existsSync(PAC_FILE)) {
    console.error(`ERROR: PageAccessControl.tsx not found at ${PAC_FILE}`);
    process.exit(1);
  }
  if (!fs.existsSync(SQL_FILE)) {
    console.error(`ERROR: cleanup_orphan_page_permissions.sql not found at ${SQL_FILE}`);
    process.exit(1);
  }

  const pacSource = fs.readFileSync(PAC_FILE, 'utf8');
  const slugs = extractSlugs(pacSource);
  console.log(`Found ${slugs.length} slugs in PAGE_DEFS`);

  const sqlContent = fs.readFileSync(SQL_FILE, 'utf8');
  const newArray = buildArrayLiteral(slugs);
  const updated = rewriteSql(sqlContent, newArray);

  fs.writeFileSync(SQL_FILE, updated, 'utf8');
  console.log(`Updated ${SQL_FILE} with ${slugs.length} slugs (last synced: ${new Date().toISOString().slice(0, 10)})`);
}

main();
