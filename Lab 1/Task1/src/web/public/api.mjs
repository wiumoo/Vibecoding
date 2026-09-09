/* api.mjs — browser-side API client.
   The access key is held only in memory (never persisted, never in URLs). */
let accessKey = null;

export function setAccessKey(k) {
  accessKey = String(k || '').trim();
}

export function hasAccessKey() {
  return Boolean(accessKey);
}

export async function fetchView({ signal } = {}) {
  if (!accessKey) return { status: 401, payload: null };
  try {
    const res = await fetch('/api/view', {
      headers: { 'X-Task1-Key': accessKey },
      cache: 'no-store',
      signal,
    });
    if (!res.ok) return { status: res.status, payload: null };
    return { status: 200, payload: await res.json() };
  } catch (e) {
    if (e && e.name === 'AbortError') return { status: 0, aborted: true, payload: null };
    return { status: 0, payload: null };
  }
}

export function clearAccessKey() {
  accessKey = null;
}
