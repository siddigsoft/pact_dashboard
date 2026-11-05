import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { resolve } from 'node:path';

describe('ProjectDetail render references', () => {
  it('does not reference undeclared values, including in inactive tab children', () => {
    const file = resolve('src/components/project/ProjectDetail.tsx');
    // Transpilation alone accepts undefined render variables. Check identifier
    // bindings without loading the whole application's dependency graph.
    const program = ts.createProgram([file], {
      noResolve: true, types: [], skipLibCheck: true,
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    });
    const source = program.getSourceFile(file)!;
    const undefinedReferences = program.getSemanticDiagnostics(source)
      .filter(diagnostic => [2304, 2552].includes(diagnostic.code))
      .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    expect(undefinedReferences).toEqual([]);
  });
});
