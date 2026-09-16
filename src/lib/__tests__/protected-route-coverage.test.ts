import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveRouteAccessTarget } from '@/lib/page-roles';

describe('declared protected route coverage', () => {
  it('requires an access target for every URL inside the authenticated page tree', () => {
    const appPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../App.tsx');
    const source = readFileSync(appPath, 'utf8');
    const protectedStart = source.indexOf(
      '<Route element={<AuthGuard><PageRouteGuard><MainLayout /></PageRouteGuard></AuthGuard>}>',
    );
    expect(protectedStart).toBeGreaterThan(0);
    const workspaceMarker = source.indexOf('{/* WorkspaceHub', protectedStart);
    expect(workspaceMarker).toBeGreaterThan(protectedStart);
    const protectedSource = source.slice(protectedStart, workspaceMarker);
    const paths = [...protectedSource.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map(match => match[1]).filter(routePath => routePath !== '*');
    const missing = paths.filter(routePath => !resolveRouteAccessTarget(
      routePath.replace(/:[A-Za-z][A-Za-z0-9_]*/g, 'example-id'),
    ));
    expect(missing).toEqual([]);
  });
});
