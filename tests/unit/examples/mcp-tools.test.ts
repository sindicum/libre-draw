import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../../../examples/mcp/server/tools';
import { TOOL_NAMES } from '../../../examples/mcp/page/dispatch';

/** The names in the first column of the README's tool table (`undo` / `redo` share a row). */
function toolsInReadme(): string[] {
  const text = readFileSync(resolve('examples/mcp/README.md'), 'utf8');
  const names: string[] = [];
  for (const row of text.matchAll(/^\| (`[a-z_]+`(?: \/ `[a-z_]+`)*)\s+\|/gm)) {
    for (const name of row[1].matchAll(/`([a-z_]+)`/g)) names.push(name[1]);
  }
  return names;
}

describe('MCP tool names', () => {
  it('are the same on the server and in the page', () => {
    expect(Object.keys(TOOLS).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it('are all listed in the README, and nothing else is', () => {
    expect(toolsInReadme().sort()).toEqual([...TOOL_NAMES].sort());
  });
});
