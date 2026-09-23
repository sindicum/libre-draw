/**
 * Request / response broker between the MCP server and the single browser
 * page that hosts LibreDraw.
 *
 * The host does not know about WebSockets: it is handed any object that can
 * `send` text and be `close`d, and receives incoming text through
 * `handleMessage`. That keeps the protocol testable without a network.
 *
 * Wire format (JSON, one object per message):
 * - host → page: `{ id, tool, args }`
 * - page → host: `{ id, result }`
 */

export interface BridgeSocket {
  send(text: string): void;
  close(): void;
}

export interface BridgeFailure {
  ok: false;
  reason: 'no-client' | 'timeout';
}

interface Pending {
  resolve(result: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

export class BridgeHost {
  private socket: BridgeSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private timeoutMs: number;
  private log: (message: string) => void;

  constructor(options: { timeoutMs?: number; log?: (message: string) => void } = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.log = options.log ?? (() => {});
  }

  /** Whether a page is currently attached. */
  get connected(): boolean {
    return this.socket !== null;
  }

  /** Start using `socket` as the page. A previously attached socket is dropped first. */
  attach(socket: BridgeSocket): void {
    if (this.socket) this.detach();
    this.socket = socket;
  }

  /**
   * Forget the current page. Every call still waiting for an answer fails
   * with `no-client`, because the answer can no longer arrive.
   */
  detach(): void {
    this.socket = null;
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.resolve(noClient());
    }
  }

  /**
   * Ask the page to run `tool` with `args`. Resolves with whatever the page
   * returned, or with a `BridgeFailure` when there is no page or it did not
   * answer in time. Never rejects.
   */
  call(tool: string, args: unknown): Promise<unknown> {
    const socket = this.socket;
    if (!socket) return Promise.resolve(noClient());

    const id = this.nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.log(`request ${id} (${tool}) timed out`);
        resolve({ ok: false, reason: 'timeout' } satisfies BridgeFailure);
      }, this.timeoutMs);
      this.pending.set(id, { resolve, timer });
      try {
        socket.send(JSON.stringify({ id, tool, args }));
      } catch (error) {
        // A socket that cannot send is as good as gone: report it like a
        // missing page rather than rejecting.
        clearTimeout(timer);
        this.pending.delete(id);
        this.log(`request ${id} (${tool}) could not be sent: ${String(error)}`);
        resolve(noClient());
      }
    });
  }

  /** Feed one text message received from the page. Unknown or malformed messages are ignored. */
  handleMessage(text: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.log('ignored a message that is not JSON');
      return;
    }
    if (!isResponse(parsed)) {
      this.log('ignored a message without a numeric id');
      return;
    }
    const entry = this.pending.get(parsed.id);
    if (!entry) {
      this.log(`ignored a response for unknown request ${parsed.id}`);
      return;
    }
    clearTimeout(entry.timer);
    this.pending.delete(parsed.id);
    entry.resolve(parsed.result);
  }
}

function noClient(): BridgeFailure {
  return { ok: false, reason: 'no-client' };
}

function isResponse(value: unknown): value is { id: number; result: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'number' &&
    'result' in value
  );
}
