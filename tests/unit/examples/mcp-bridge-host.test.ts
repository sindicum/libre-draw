import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeHost } from '../../../examples/mcp/server/bridge-host';
import type { BridgeSocket } from '../../../examples/mcp/server/bridge-host';

function fakeSocket() {
  const sent: { id: number; tool: string; args: unknown }[] = [];
  const socket: BridgeSocket & { sent: typeof sent } = {
    sent,
    send: (text: string) => sent.push(JSON.parse(text)),
    close: vi.fn(),
  };
  return socket;
}

describe('BridgeHost', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fails immediately with no-client when no page is attached', async () => {
    const host = new BridgeHost();
    expect(host.connected).toBe(false);
    await expect(host.call('get_features', {})).resolves.toEqual({
      ok: false,
      reason: 'no-client',
    });
  });

  it('sends { id, tool, args } and resolves with the matching { id, result }', async () => {
    const host = new BridgeHost();
    const socket = fakeSocket();
    host.attach(socket);
    expect(host.connected).toBe(true);

    const pending = host.call('split', {
      id: 'a',
      line: [
        [0, 0],
        [1, 1],
      ],
    });
    expect(socket.sent).toEqual([
      {
        id: 1,
        tool: 'split',
        args: {
          id: 'a',
          line: [
            [0, 0],
            [1, 1],
          ],
        },
      },
    ]);

    host.handleMessage(JSON.stringify({ id: 1, result: { ok: true, created: [] } }));
    await expect(pending).resolves.toEqual({ ok: true, created: [] });
  });

  it('matches out-of-order responses by id and increments ids', async () => {
    const host = new BridgeHost();
    const socket = fakeSocket();
    host.attach(socket);

    const first = host.call('undo', {});
    const second = host.call('redo', {});
    expect(socket.sent.map((m) => m.id)).toEqual([1, 2]);

    host.handleMessage(JSON.stringify({ id: 2, result: 'second' }));
    host.handleMessage(JSON.stringify({ id: 1, result: 'first' }));
    await expect(second).resolves.toBe('second');
    await expect(first).resolves.toBe('first');
  });

  it('times out a request the page never answers', async () => {
    const host = new BridgeHost({ timeoutMs: 500 });
    host.attach(fakeSocket());

    const pending = host.call('rotate', { id: 'a', angleDeg: 90 });
    vi.advanceTimersByTime(499);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    vi.advanceTimersByTime(1);
    await expect(pending).resolves.toEqual({ ok: false, reason: 'timeout' });
  });

  it('fails waiting calls with no-client when the page detaches', async () => {
    const host = new BridgeHost();
    host.attach(fakeSocket());
    const pending = host.call('get_features', {});

    host.detach();

    await expect(pending).resolves.toEqual({ ok: false, reason: 'no-client' });
    expect(host.connected).toBe(false);
    await expect(host.call('get_features', {})).resolves.toEqual({
      ok: false,
      reason: 'no-client',
    });
  });

  it('ignores malformed messages and unknown ids', async () => {
    const log = vi.fn();
    const host = new BridgeHost({ log });
    host.attach(fakeSocket());
    const pending = host.call('undo', {});

    host.handleMessage('not json');
    host.handleMessage(JSON.stringify({ result: 1 }));
    host.handleMessage(JSON.stringify({ id: 99, result: 1 }));
    expect(log).toHaveBeenCalledTimes(3);

    host.handleMessage(JSON.stringify({ id: 1, result: true }));
    await expect(pending).resolves.toBe(true);
  });

  it('resolves with no-client instead of rejecting when the socket cannot send', async () => {
    const host = new BridgeHost();
    host.attach({
      send: () => {
        throw new Error('socket is closing');
      },
      close: vi.fn(),
    });

    await expect(host.call('undo', {})).resolves.toEqual({ ok: false, reason: 'no-client' });
    // The failed request left nothing pending: a later answer with its id is ignored.
    const log = vi.fn();
    const host2 = new BridgeHost({ log });
    host2.attach({
      send: () => {
        throw new Error('socket is closing');
      },
      close: vi.fn(),
    });
    await host2.call('undo', {});
    host2.handleMessage(JSON.stringify({ id: 1, result: true }));
    expect(log).toHaveBeenLastCalledWith('ignored a response for unknown request 1');
  });

  it('replaces a previously attached page', () => {
    const host = new BridgeHost();
    const first = fakeSocket();
    const second = fakeSocket();
    host.attach(first);
    host.attach(second);
    void host.call('undo', {});
    expect(first.sent).toHaveLength(0);
    expect(second.sent).toHaveLength(1);
  });
});
