/**
 * security.mjs — loopback-only HTTP guard helpers.
 * Pure functions, no I/O. Kept separate so tests can exercise the rules
 * without binding sockets.
 */

export const HOST_NAME = '127.0.0.1'; // never 0.0.0.0 / :: / LAN

export function allowedHostHeader(port) {
  return `${HOST_NAME}:${port}`;
}

/** Only our exact IPv4 loopback host header is accepted (no localhost alias). */
export function hostAllowed(hostHeader, port) {
  if (typeof hostHeader !== 'string') return false;
  return hostHeader === allowedHostHeader(port);
}

/** Same-origin navigations/requests from our own page are the only Origin. */
export function originAllowed(origin, port) {
  if (origin === undefined || origin === null) return true; // same-origin GETs may omit it
  return origin === `http://${HOST_NAME}:${port}`;
}

/** Reject anything explicitly marked cross-site by the browser. */
export function fetchMetadataAllowed(secFetchSite) {
  if (secFetchSite === undefined || secFetchSite === null) return true;
  return secFetchSite === 'same-origin' || secFetchSite === 'none';
}

export function methodAllowed(method) {
  return method === 'GET' || method === 'HEAD';
}

export function securityHeaders(port, { csp } = {}) {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      csp ||
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; " +
        "font-src 'none'; connect-src 'self'; object-src 'none'; base-uri 'none'; " +
        "frame-ancestors 'none'; form-action 'none'; frame-src 'none'; media-src 'none'",
  };
}

export function newAccessKey() {
  // crypto.randomUUID-style entropy; deterministic test keys may be injected.
  const bytes = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint8Array(18))
    : null;
  if (bytes) return Buffer.from(bytes).toString('base64url');
  throw new Error('secure randomness unavailable');
}
