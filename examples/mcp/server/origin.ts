/**
 * Whether a WebSocket handshake may come from `origin`.
 *
 * The bridge has no authentication, so besides binding to loopback it only
 * accepts pages served from this machine: any web page a user happens to
 * open could otherwise connect to `ws://127.0.0.1:<port>` and drive the map.
 * A missing header (non-browser clients such as a smoke script) is allowed.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (origin === undefined || origin === '') return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}
