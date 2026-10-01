import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVENT_NAMES } from '../../../examples/mcp/page/log-panel';

/** The event names in the Events table of docs/api/index.md. */
function documentedEvents(): string[] {
  const text = readFileSync(resolve('docs/api/index.md'), 'utf8');
  return [...text.matchAll(/^\| \[`([a-z]+)`\]\(\/api\/events#/gm)].map((m) => m[1]);
}

describe('MCP log panel', () => {
  it('subscribes to every event the API reference documents', () => {
    const documented = documentedEvents();
    expect(documented.length).toBeGreaterThan(0);
    expect(new Set(EVENT_NAMES)).toEqual(new Set(documented));
  });
});
