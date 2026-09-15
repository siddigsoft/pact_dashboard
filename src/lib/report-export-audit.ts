import ts from 'typescript';

export interface ReportExportDeclaration {
  resource: string;
  action: string;
  line: number;
}

export interface UngatedReportExport {
  expression: string;
  line: number;
}

export interface ReportExportAudit {
  declarations: ReportExportDeclaration[];
  ungated: UngatedReportExport[];
  invalidGates: InvalidReportExportGate[];
}

export interface InvalidReportExportGate {
  expression: string;
  line: number;
  reason: string;
}

export interface ReportExportSource {
  source: string;
  content: string;
}

export interface InventoriedUngatedReportExport extends UngatedReportExport {
  source: string;
}

function lineNumber(sourceFile: ts.SourceFile, offset: number): number {
  return sourceFile.getLineAndCharacterOfPosition(offset).line + 1;
}

function tagName(node: ts.JsxOpeningLikeElement): string {
  return node.tagName.getText();
}

function attribute(
  node: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function literalAttribute(
  node: ts.JsxOpeningLikeElement,
  name: string,
): string | undefined {
  const initializer = attribute(node, name)?.initializer;
  return initializer && ts.isStringLiteral(initializer)
    ? initializer.text
    : undefined;
}

function normalizedExpression(node: ts.Node, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile).replace(/\s+/g, ' ').trim();
}

function isExportButton(node: ts.JsxOpeningLikeElement): boolean {
  if (tagName(node) !== 'Button') return false;

  const onClick = attribute(node, 'onClick')?.initializer?.getText() ?? '';
  const testId = literalAttribute(node, 'data-testid') ?? '';
  return /(?:export|download|generatePdf)/i.test(onClick) ||
    /(?:export|download)/i.test(testId);
}

function gateDeclaration(
  node: ts.JsxOpeningLikeElement,
  sourceFile: ts.SourceFile,
): ReportExportDeclaration | InvalidReportExportGate {
  const resource = literalAttribute(node, 'resource');
  const actionAttribute = attribute(node, 'action');
  const action = literalAttribute(node, 'action') ?? 'export';
  const common = {
    line: lineNumber(sourceFile, node.getStart(sourceFile)),
  };

  if (!resource) {
    return {
      ...common,
      expression: normalizedExpression(node, sourceFile),
      reason: 'resource must be a string literal',
    };
  }
  if (actionAttribute && literalAttribute(node, 'action') === undefined) {
    return {
      ...common,
      expression: normalizedExpression(node, sourceFile),
      reason: 'action must be a string literal when provided',
    };
  }
  if (ts.isJsxSelfClosingElement(node)) {
    return {
      ...common,
      expression: normalizedExpression(node, sourceFile),
      reason: 'ReportExportGate cannot be self-closing',
    };
  }
  return { ...common, resource, action };
}

/**
 * Audits literal report/export controls in a TSX source string using the
 * TypeScript syntax tree. Dynamic gates are invalid because their concrete
 * resource/action pair cannot be checked against MODULE_REGISTRY.
 */
export function auditReportExportSource(source: string): ReportExportAudit {
  const sourceFile = ts.createSourceFile(
    'report-export-audit.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations: ReportExportDeclaration[] = [];
  const ungated: UngatedReportExport[] = [];
  const invalidGates: InvalidReportExportGate[] = [];

  const visit = (node: ts.Node, validGateDepth: number) => {
    if (ts.isJsxElement(node)) {
      const opening = node.openingElement;
      if (tagName(opening) === 'ReportExportGate') {
        const result = gateDeclaration(opening, sourceFile);
        const isValid = 'resource' in result;
        if (isValid) declarations.push(result);
        else invalidGates.push(result);
        node.children.forEach(child => visit(child, validGateDepth + (isValid ? 1 : 0)));
        return;
      }
      if (isExportButton(opening) && validGateDepth === 0) {
        ungated.push({
          expression: normalizedExpression(opening, sourceFile),
          line: lineNumber(sourceFile, opening.getStart(sourceFile)),
        });
      }
      node.children.forEach(child => visit(child, validGateDepth));
      return;
    }

    if (ts.isJsxSelfClosingElement(node)) {
      if (tagName(node) === 'ReportExportGate') {
        const result = gateDeclaration(node, sourceFile);
        if ('resource' in result) declarations.push(result);
        else invalidGates.push(result);
      } else if (isExportButton(node) && validGateDepth === 0) {
        ungated.push({
          expression: normalizedExpression(node, sourceFile),
          line: lineNumber(sourceFile, node.getStart(sourceFile)),
        });
      }
      return;
    }

    ts.forEachChild(node, child => visit(child, validGateDepth));
  };

  visit(sourceFile, 0);

  return { declarations, ungated, invalidGates };
}

export function collectUngatedReportExports(
  sources: ReportExportSource[],
): InventoriedUngatedReportExport[] {
  return sources.flatMap(({ source, content }) =>
    auditReportExportSource(content).ungated.map(control => ({
      ...control,
      source,
    })),
  );
}