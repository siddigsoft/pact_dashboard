import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  auditReportExportSource,
  collectUngatedReportExports,
  ReportExportSource,
} from '@/lib/report-export-audit';
import { MODULE_REGISTRY } from '@/types/moduleRegistry';

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(path);
    }
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

function registryPairs(): Set<string> {
  return new Set(
    MODULE_REGISTRY.flatMap(module =>
      module.pages.flatMap(page =>
        page.actions.map(action => `${action.resource}:${action.action}`),
      ),
    ),
  );
}

function productionSources(): ReportExportSource[] {
  return sourceFiles(SRC_ROOT).map(absolutePath => ({
    source: `src/${absolutePath.slice(SRC_ROOT.length + 1).replace(/\\/g, '/')}`,
    content: readFileSync(absolutePath, 'utf8'),
  }));
}

describe('report export access-control inventory', () => {
  it('rejects a representative export control without ReportExportGate', () => {
    const audit = auditReportExportSource(`
      export function ExampleReport() {
        const handleExportCsv = () => {};
        return <Button data-testid="button-export-csv" onClick={handleExportCsv}>Export CSV</Button>;
      }
    `);

    expect(audit.declarations).toEqual([]);
    expect(audit.invalidGates).toEqual([]);
    expect(audit.ungated).toEqual([
      expect.objectContaining({ line: 4 }),
    ]);
  });

  it('accepts and inventories a gated export control', () => {
    const audit = auditReportExportSource(`
      <ReportExportGate resource="finances">
        <Button onClick={downloadReport}>Download</Button>
      </ReportExportGate>
    `);

    expect(audit.ungated).toEqual([]);
    expect(audit.invalidGates).toEqual([]);
    expect(audit.declarations).toEqual([
      { resource: 'finances', action: 'export', line: 2 },
    ]);
  });

  it('rejects an ungated inline arrow export handler', () => {
    const audit = auditReportExportSource(
      '<Button onClick={() => exportCsv()}>Export</Button>',
    );

    expect(audit.ungated).toHaveLength(1);
  });

  it.each([
    {
      source: '<ReportExportGate resource={reportResource}><Button onClick={exportCsv}>Export</Button></ReportExportGate>',
      ungatedCount: 1,
    },
    {
      source: '<ReportExportGate resource="reports" action={reportAction}><Button onClick={exportCsv}>Export</Button></ReportExportGate>',
      ungatedCount: 1,
    },
    {
      source: '<ReportExportGate resource="reports" />',
      ungatedCount: 0,
    },
  ])('rejects a non-inventoriable gate: $source', ({ source, ungatedCount }) => {
    const audit = auditReportExportSource(source);

    expect(audit.invalidGates).toHaveLength(1);
    expect(audit.declarations).toEqual([]);
    expect(audit.ungated).toHaveLength(ungatedCount);
  });

  it('fails the production inventory when a new ungated export is introduced', () => {
    const existingSources: ReportExportSource[] = [{
      source: 'src/pages/ExistingReport.tsx',
      content: '<ReportExportGate resource="reports"><Button onClick={exportCsv}>Export</Button></ReportExportGate>',
    }];
    const changedSources = [...existingSources, {
      source: 'src/pages/NewReport.tsx',
      content: '<Button data-testid="button-export-csv" onClick={exportCsv}>Export</Button>',
    }];

    expect(collectUngatedReportExports(existingSources)).toEqual([]);
    expect(collectUngatedReportExports(changedSources)).toEqual([
      expect.objectContaining({
        source: 'src/pages/NewReport.tsx',
        line: 1,
      }),
    ]);
  });

  it('does not add ungated export controls to the audited production inventory', () => {
    const ungated = collectUngatedReportExports(productionSources());

    // This reviewed snapshot is the baseline of legacy controls audited before
    // this guard was introduced. Any new item is a regression and must instead
    // be wrapped in ReportExportGate with a registry-backed permission pair.
    expect(ungated).toMatchSnapshot();
  });

  it('uses only literal, non-self-closing gates in production', () => {
    const invalid = productionSources().flatMap(({ source, content }) =>
      auditReportExportSource(content).invalidGates.map(gate => ({
        ...gate,
        source,
      })),
    );

    expect(invalid).toEqual([]);
  });

  it('keeps every declared report export permission in MODULE_REGISTRY', () => {
    const registered = registryPairs();
    const missing = productionSources().flatMap(({ source, content }) => {
      return auditReportExportSource(content).declarations
        .filter(({ resource, action }) => !registered.has(`${resource}:${action}`))
        .map(declaration => ({
          ...declaration,
          source,
        }));
    });

    if (missing.length > 0) {
      throw new Error(
        'ReportExportGate declarations missing from MODULE_REGISTRY:\n' +
        missing.map(item =>
          `  • ${item.resource}:${item.action} — ${item.source}:${item.line}`,
        ).join('\n'),
      );
    }

    expect(missing).toEqual([]);
  });
});