// Keeps the previous release's hashed JS/CSS in the new build so browser tabs still running the
// old version can lazy-load their chunks after a deploy (self-hosted equivalent of Vercel Skew
// Protection). Only one release back is kept, so the deployment size stays bounded.
// Never fails the build: any problem is logged and skipped.
import { readdir, mkdir, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const DIST = 'dist';
const ASSET_DIRS = ['js', 'assets'];
const MANIFEST = 'deploy-assets.json';
const CONCURRENCY = 16;

async function listFiles(dir, prefix = '') {
  const out = [];
  let entries = [];
  try { entries = await readdir(join(DIST, dir, prefix), { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await listFiles(dir, rel));
    else out.push(`${dir}/${rel}`);
  }
  return out;
}

const exists = (path) => access(path).then(() => true, () => false);

async function main() {
  const ownFiles = (await Promise.all(ASSET_DIRS.map(dir => listFiles(dir)))).flat();
  await writeFile(join(DIST, MANIFEST), JSON.stringify({ builtAt: new Date().toISOString(), files: ownFiles }));
  console.log(`[retain-assets] wrote ${MANIFEST} (${ownFiles.length} files)`);

  const origin = process.env.ASSET_RETENTION_ORIGIN
    || (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  if (!origin) {
    console.log('[retain-assets] not a production deploy; skipping previous-release retention');
    return;
  }

  const res = await fetch(`${origin}/${MANIFEST}`, { cache: 'no-store' });
  if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) {
    console.log(`[retain-assets] no previous manifest at ${origin} (status ${res.status}); skipping`);
    return;
  }
  const previous = await res.json();
  const missing = [];
  for (const file of previous.files ?? []) {
    if (typeof file !== 'string' || file.includes('..') || !ASSET_DIRS.some(d => file.startsWith(`${d}/`))) continue;
    if (!(await exists(join(DIST, file)))) missing.push(file);
  }

  let copied = 0;
  let failed = 0;
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    await Promise.all(missing.slice(i, i + CONCURRENCY).map(async (file) => {
      try {
        const r = await fetch(`${origin}/${file}`);
        if (!r.ok || (r.headers.get('content-type') || '').includes('text/html')) { failed++; return; }
        const target = join(DIST, file);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, Buffer.from(await r.arrayBuffer()));
        copied++;
      } catch {
        failed++;
      }
    }));
  }
  console.log(`[retain-assets] kept ${copied} files from the previous release (${failed} unavailable)`);
}

main().catch((err) => {
  console.warn('[retain-assets] skipped:', err?.message || err);
});
