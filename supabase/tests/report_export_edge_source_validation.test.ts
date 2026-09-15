import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

async function readEdge(name: string): Promise<string> {
  return readFile(
    resolve(process.cwd(), 'supabase', 'functions', name, 'index.ts'),
    'utf8',
  );
}

function expectBefore(source: string, first: string, second: string): void {
  const firstAt = source.indexOf(first);
  const secondAt = source.indexOf(second);

  expect(firstAt).toBeGreaterThanOrEqual(0);
  expect(secondAt).toBeGreaterThanOrEqual(0);
  expect(firstAt).toBeLessThan(secondAt);
}

describe('report export edge authorization boundaries', () => {
  it('checks dashboard analytics permission before report queries', async () => {
    const source = await readEdge('dashboard-actions-export');
    const assertion = "anonClient.rpc(\n    'assert_report_export_permission'";

    expect(source).toContain(assertion);
    expectBefore(source, assertion, ".from('audit_logs')");
    expectBefore(source, assertion, ".from('dashboard_actions')");
  });

  it('checks PACT archive analytics permission before form and submission queries', async () => {
    const source = await readEdge('create-pact-archive');
    const assertion = "callerClient.rpc(\n      'assert_report_export_permission'";

    expect(source).toContain(assertion);
    expectBefore(source, assertion, ".from('fd_forms')");
    expectBefore(source, assertion, ".from('fd_submissions')");
  });

  it('routes existing archive downloads through the guarded Edge Function', async () => {
    const edgeSource = await readEdge('create-pact-archive');
    const pageSource = await readFile(
      resolve(process.cwd(), 'src', 'pages', 'FieldDataBackup.tsx'),
      'utf8',
    );

    expect(edgeSource).toContain("action === 'sign-download'");
    expectBefore(
      edgeSource,
      "callerClient.rpc(\n      'assert_report_export_permission'",
      ".from('fd_archive_logs')",
    );
    expect(pageSource).toContain("body: { action: 'sign-download', archive_id: a.id }");

    const archiveHistory = pageSource.slice(pageSource.indexOf('{archiveLogs.map'));
    expect(archiveHistory).not.toContain(".from('field-data-archives')");
    expect(archiveHistory).not.toContain('.createSignedUrl(');
  });
});