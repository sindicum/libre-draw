import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as api from '../../src';

const root = resolve(__dirname, '../..');

/**
 * Every name exported from the package entry, type-only exports included.
 * Resolved by the TypeScript checker so that every export form (`export { }`,
 * `export type { }`, `export * from`, `export type * from`) is covered.
 */
function exportedNames(): Set<string> {
  const entry = resolve(root, 'src/index.ts');
  const program = ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entry);
  if (!sourceFile) throw new Error('src/index.ts was not loaded');
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) throw new Error('src/index.ts has no module symbol');
  return new Set(checker.getExportsOfModule(moduleSymbol).map((symbol) => symbol.name));
}

/**
 * Identifiers listed in the first column of the export tables of docs/api/index.md.
 * The Events table lists event names, not exports, so it is skipped.
 */
function documentedNames(): Set<string> {
  const page = readFileSync(resolve(root, 'docs/api/index.md'), 'utf8');
  const names = new Set<string>();
  let section = '';
  for (const line of page.split('\n')) {
    if (line.startsWith('#')) section = line;
    if (section === '### Events' || !line.startsWith('| ')) continue;
    const firstColumn = line.slice(2, line.indexOf(' |', 2));
    if (/^(Export|Type|Event) /.test(firstColumn) || firstColumn.startsWith('-')) continue;
    for (const match of firstColumn.matchAll(/`([A-Za-z_][A-Za-z_]*)`/g)) names.add(match[1]);
  }
  return names;
}

describe('package root exports', () => {
  it('exposes the runtime values the API reference lists', () => {
    expect(typeof api.LibreDraw).toBe('function');
    expect(typeof api.LibreDrawError).toBe('function');
    expect(typeof api.mergeStyleConfig).toBe('function');
    expect(api.DEFAULT_STYLE_CONFIG.fill).toBeDefined();
    expect(Object.keys(api).sort()).toEqual(
      ['DEFAULT_STYLE_CONFIG', 'LibreDraw', 'LibreDrawError', 'mergeStyleConfig'].sort()
    );
  });

  it('lists every export in docs/api/index.md and exports every name listed there', () => {
    const exported = exportedNames();
    const documented = documentedNames();
    expect([...exported].filter((name) => !documented.has(name))).toEqual([]);
    expect([...documented].filter((name) => !exported.has(name))).toEqual([]);
  });
});
