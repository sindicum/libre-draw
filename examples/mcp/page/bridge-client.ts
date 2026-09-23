import { dispatch } from './dispatch';
import type { DrawApi } from './dispatch';

const RECONNECT_DELAY_MS = 1000;

export interface BridgeClientEvents {
  onStatus(connected: boolean): void;
  onCall(tool: string, args: unknown, result: unknown): void;
}

/**
 * Keep one WebSocket open to the MCP server and answer its tool requests by
 * running them against LibreDraw. Reconnects on its own, so the page can be
 * opened before or after the server starts.
 */
export function startBridgeClient(url: string, draw: DrawApi, events: BridgeClientEvents): void {
  let socket: WebSocket | null = null;

  const connect = (): void => {
    socket = new WebSocket(url);
    socket.addEventListener('open', () => events.onStatus(true));
    socket.addEventListener('message', (event) => {
      let request: { id: number; tool: string; args: unknown };
      try {
        request = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const result = dispatch(draw, request.tool, request.args);
      events.onCall(request.tool, request.args, result);
      socket?.send(JSON.stringify({ id: request.id, result }));
    });
    socket.addEventListener('close', () => {
      events.onStatus(false);
      socket = null;
      setTimeout(connect, RECONNECT_DELAY_MS);
    });
    // A failed connection attempt also fires `close`, which schedules the retry.
    socket.addEventListener('error', () => {});
  };

  connect();
}
