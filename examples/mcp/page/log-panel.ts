import type { LibreDraw, LibreDrawEventMap } from '../../../src';

const EVENT_NAMES: (keyof LibreDrawEventMap)[] = [
  'create',
  'update',
  'delete',
  'split',
  'splitfailed',
  'setback',
  'setbackfailed',
  'union',
  'unionfailed',
  'rotate',
  'selectionchange',
  'modechange',
  'draftchange',
];

const MAX_ROWS = 200;

/**
 * A fixed panel listing what happened, with each LibreDraw event tagged by
 * its `origin` so a viewer can tell the AI's changes from their own.
 */
export class LogPanel {
  private list: HTMLElement;

  constructor(container: HTMLElement) {
    this.list = container;
  }

  /** Subscribe to every LibreDraw event and log it with its origin. */
  observe(draw: LibreDraw): void {
    for (const name of EVENT_NAMES) {
      draw.on(name, (event) => {
        this.add(event.origin, `${name} ${summarize(name, event)}`);
      });
    }
  }

  status(connected: boolean): void {
    this.add('bridge', connected ? 'connected to the MCP server' : 'waiting for the MCP server');
  }

  call(tool: string, args: unknown, result: unknown): void {
    this.add('tool', `${tool}(${JSON.stringify(args)}) → ${short(JSON.stringify(result))}`);
  }

  private add(kind: 'api' | 'user' | 'bridge' | 'tool', text: string): void {
    const row = document.createElement('li');
    row.className = `log-row log-${kind}`;
    const badge = document.createElement('span');
    badge.className = 'log-badge';
    badge.textContent = kind;
    row.append(badge, document.createTextNode(text));
    this.list.prepend(row);
    while (this.list.children.length > MAX_ROWS) this.list.lastElementChild?.remove();
  }
}

function summarize<K extends keyof LibreDrawEventMap>(
  name: K,
  event: LibreDrawEventMap[K]
): string {
  const e = event as unknown as Record<string, unknown>;
  switch (name) {
    case 'create':
    case 'update':
    case 'delete':
    case 'rotate':
    case 'setback':
      return String((e.feature as { id?: string } | undefined)?.id ?? '');
    case 'split':
      return `${(e.originalFeature as { id: string }).id} → ${(e.features as { id: string }[]).map((f) => f.id).join(', ')}`;
    case 'union':
      return `${(e.originalFeatures as { id: string }[]).map((f) => f.id).join(' + ')} → ${(e.feature as { id: string }).id}`;
    case 'splitfailed':
    case 'setbackfailed':
    case 'unionfailed':
      return String(e.reason);
    case 'selectionchange':
      return JSON.stringify(e.selectedIds);
    case 'modechange':
      return `${e.previousMode} → ${e.mode}`;
    case 'draftchange':
      return `vertices=${e.vertexCount}`;
    default:
      return '';
  }
}

function short(text: string): string {
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}
