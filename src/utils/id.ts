/**
 * Hex lookup for byte-to-string conversion (00..ff).
 */
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/**
 * Build an RFC 4122 version 4 UUID from 16 random bytes.
 */
function formatUuidV4(bytes: Uint8Array): string {
  // Version 4 in the high nibble of byte 6, variant 10xx in the top bits of byte 8.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const h = HEX;
  return (
    h[bytes[0]] +
    h[bytes[1]] +
    h[bytes[2]] +
    h[bytes[3]] +
    '-' +
    h[bytes[4]] +
    h[bytes[5]] +
    '-' +
    h[bytes[6]] +
    h[bytes[7]] +
    '-' +
    h[bytes[8]] +
    h[bytes[9]] +
    '-' +
    h[bytes[10]] +
    h[bytes[11]] +
    h[bytes[12]] +
    h[bytes[13]] +
    h[bytes[14]] +
    h[bytes[15]]
  );
}

/**
 * Generate a unique feature ID as an RFC 4122 version 4 UUID.
 *
 * `crypto.randomUUID()` is only defined in secure contexts (HTTPS or
 * localhost), so on a plain-HTTP origin — an intranet deployment, an
 * IP-addressed staging host, a dev server reached over the LAN — it is
 * `undefined` and calling it throws. `crypto.getRandomValues()` carries no
 * such restriction, so the fallback keeps feature creation working there.
 *
 * There is deliberately no `Math.random()` tier below this: an environment
 * without `crypto` is out of support, and a silent drop to weaker randomness
 * would risk ID collisions, which break store identity and undo/redo.
 *
 * @returns A new UUID string, e.g. `3c8da699-670c-4c77-a52b-3baf0c365c5a`.
 */
export function createFeatureId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return formatUuidV4(crypto.getRandomValues(new Uint8Array(16)));
}
