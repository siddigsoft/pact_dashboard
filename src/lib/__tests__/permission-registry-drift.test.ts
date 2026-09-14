/**
 * Permission Registry — source-level drift guard
 *
 * The module registry is the inventory rendered by Unified Access Manager's
 * Buttons & Actions view. This test keeps that inventory in sync with literal
 * permission gates in application code.
 *
 * Deliberately static gates:
 *   - checkPermission('resource', 'action')
 *   - hasPermission(userId, 'resource', 'action')
 *   - PermissionGuard / FieldTeamMapPermissions with literal resource + action
 *
 * Dynamic gates are not guessed by this test. For example,
 * MmpFullReportDialog calls checkPermission('mmp', reportKind), where
 * reportKind is a runtime-selected union. Its three values are independently
 * registered as mmp:full_report, mmp:state_report, and mmp:hub_report.
 * The source audit therefore records the dynamic call as an explicit
 * exclusion rather than pretending it is a literal pair.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MODULE_REGISTRY } from '@/types/moduleRegistry';

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * These are intentionally dynamic and cannot be reduced to one source-level
 * resource/action pair. Keep this list documented when adding another dynamic
 * gate; concrete runtime values still need registry entries.
 */
const DYNAMIC_PERMISSION_EXCLUSIONS = [
  {
    source: 'src/components/mmp/MmpFullReportDialog.tsx',
    expression: "checkPermission('mmp', reportKind)",
    reason: 'reportKind is a runtime-selected union; all three union members are registered independently.',
  },
] as const;

interface PermissionUse {
  key: string;
  source: string;
  line: number;
  expression: string;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      // Tests describe expected behavior; they are not production permission gates.
      if (entry.name === '__tests__') return [];
      return sourceFiles(path);
    }
    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return [path];
  });
}

function lineNumber(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function collectLiteralPermissionUses(): PermissionUse[] {
  const uses: PermissionUse[] = [];
  const checkPermission = /\bcheckPermission\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/g;
  // hasPermission has userId as its first argument in the authorization
  // context, so the resource/action pair is the second and third argument.
  const hasPermission = /\bhasPermission\(\s*[^,]+,\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/g;
  const gatedComponent = /<(?:PermissionGuard|FieldTeamMapPermissions)\b[^>]*\bresource\s*=\s*(['"])([^'"]+)\1[^>]*\baction\s*=\s*(['"])([^'"]+)\3[^>]*>/g;

  for (const absolutePath of sourceFiles(SRC_ROOT)) {
    const source = readFileSync(absolutePath, 'utf8');
    const relativePath = absolutePath.slice(SRC_ROOT.length + 1).replace(/\\/g, '/');
    const collect = (pattern: RegExp, keyFromMatch: (match: RegExpExecArray) => string, expressionFromMatch: (match: RegExpExecArray) => string) => {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source))) {
        uses.push({
          key: keyFromMatch(match),
          source: `src/${relativePath}`,
          line: lineNumber(source, match.index),
          expression: expressionFromMatch(match),
        });
      }
    };

    collect(
      checkPermission,
      match => `${match[2]}:${match[4]}`,
      match => match[0],
    );
    collect(
      hasPermission,
      match => `${match[2]}:${match[4]}`,
      match => match[0],
    );
    collect(
      gatedComponent,
      match => `${match[2]}:${match[4]}`,
      match => match[0],
    );
  }

  return uses;
}

function registryKeys(): Set<string> {
  return new Set(
    MODULE_REGISTRY.flatMap(module =>
      module.pages.flatMap(page => page.actions.map(action => action.key)),
    ),
  );
}

describe('Unified Access Manager — permission registry coverage', () => {
  it('registers every literal permission pair used by src', () => {
    const registered = registryKeys();
    const missing = collectLiteralPermissionUses().filter(use => !registered.has(use.key));

    if (missing.length > 0) {
      const details = missing
        .map(use => `  • ${use.key} — ${use.source}:${use.line} (${use.expression})`)
        .join('\n');
      throw new Error(
        `Permission gates missing from MODULE_REGISTRY:\n${details}\n\n` +
        'Add each key to the page/module that owns the gated action. ' +
        'Dynamic gates must be documented in DYNAMIC_PERMISSION_EXCLUSIONS ' +
        'and have every concrete runtime value registered.',
      );
    }

    expect(missing).toHaveLength(0);
  });

  it('keeps dynamic permission exclusions documented', () => {
    expect(DYNAMIC_PERMISSION_EXCLUSIONS.length).toBeGreaterThan(0);
    for (const exclusion of DYNAMIC_PERMISSION_EXCLUSIONS) {
      expect(exclusion.source).toMatch(/^src\//);
      expect(exclusion.expression).toContain('checkPermission');
      expect(exclusion.reason.length).toBeGreaterThan(20);
    }
  });
});