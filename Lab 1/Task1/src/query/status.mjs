/**
 * status.mjs — pure status projection: freshness + human-ish tokens for the
 * last sync and publish records. Never fabricates certainty: a "running" state
 * file entry is only reported as *recorded* running, and GitHub push status is
 * reported as *recorded at last publish* only.
 */

export const FRESHNESS_WINDOW_MS = 26 * 60 * 60 * 1000; // 26h display window
const FUTURE_SKEW_MS = 60 * 60 * 1000; // allow small clock skew before flagging

export function isValidIso(v) {
  if (typeof v !== 'string' || !v) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

export function isoAgeMs(v, now) {
  return now - Date.parse(v);
}

/** Human-ish status for a recorded sync run. Pure token mapping. */
export function syncStatusToken(state) {
  if (!state || !state.lastStatus) return 'never';
  const s = state.lastStatus;
  if (s === 'ok' || s === 'published' || s === 'no-change') return 'success';
  if (s === 'need-login') return 'need-login';
  if (s === 'running') return 'running-recorded'; // recorded only, not verified
  if (s === 'failed' || s === 'sync-failed') return 'failed';
  return 'unknown';
}

/** Publish result token derived only from allowed fields of lastPublishPush. */
export function publishStatusToken(state) {
  const p = state?.lastPublishPush;
  if (!p || typeof p !== 'object') return 'never';
  if (p.pushed === true) return 'pushed';
  if (p.pushed === false) {
    if (p.reason === 'up-to-date') return 'up-to-date';
    if (p.reason === 'no-approved-remote') return 'not-approved';
    if (p.reason === 'diverged') return 'diverged';
    if (p.reason === 'origin-mismatch') return 'origin-mismatch';
    if (p.reason === 'ls-remote-failed' || p.reason === 'fetch-failed') return 'remote-unreachable';
    if (p.reason === 'push-failed') return 'push-failed';
    return 'other';
  }
  return 'unknown';
}

/**
 * Choose the trusted "last successful collection" instant.
 * state.lastCollectedAt is preferred only when it is plausible with the
 * snapshot we are showing (same snapshot id or a success/no-change record).
 * Falls back to manifest.collected_at when the state points at this snapshot.
 */
export function lastSuccessfulCollectionAt({ state, snapshot, now }) {
  const stateOk = state && (state.lastStatus === 'ok' || state.lastStatus === 'no-change' || state.lastStatus === 'published');
  if (stateOk && isValidIso(state.lastCollectedAt)) {
    const candidate = Date.parse(state.lastCollectedAt);
    if (candidate > now + FUTURE_SKEW_MS) return { at: state.lastCollectedAt, source: 'state-future' };
    // state claims a collection on a different snapshot than the one displayed
    const stSnap = state.currentSnapshotId;
    const shownId = snapshot?.id;
    if (stSnap && shownId && stSnap !== shownId) {
      return { at: null, source: 'state-snapshot-mismatch' };
    }
    return { at: state.lastCollectedAt, source: 'state' };
  }
  if (snapshot?.collectedAt && isValidIso(snapshot.collectedAt)) {
    // The snapshot we show was itself collected successfully when created.
    const candidate = Date.parse(snapshot.collectedAt);
    if (candidate > now + FUTURE_SKEW_MS) return { at: null, source: 'manifest-future' };
    return { at: snapshot.collectedAt, source: 'manifest' };
  }
  return { at: null, source: 'none' };
}

/** Freshness classification (see plan §12.2). */
export function freshnessOf({ state, snapshot, now = Date.now() }) {
  if (!snapshot) return { state: 'no-snapshot', lastSuccessfulCollectionAt: null, basis: 'none' };
  const res = lastSuccessfulCollectionAt({ state, snapshot, now });
  if (!res.at) {
    // future timestamps -> clock warning rather than plain unknown
    const fc = state?.lastCollectedAt && isValidIso(state.lastCollectedAt) && Date.parse(state.lastCollectedAt) > now + FUTURE_SKEW_MS;
    const mc = snapshot.collectedAt && isValidIso(snapshot.collectedAt) && Date.parse(snapshot.collectedAt) > now + FUTURE_SKEW_MS;
    return { state: fc || mc ? 'clock-warning' : 'unknown', lastSuccessfulCollectionAt: res.at, basis: res.source };
  }
  const age = now - Date.parse(res.at);
  if (age < -FUTURE_SKEW_MS) return { state: 'clock-warning', lastSuccessfulCollectionAt: res.at, basis: res.source };
  return {
    state: age <= FRESHNESS_WINDOW_MS ? 'fresh' : 'stale',
    lastSuccessfulCollectionAt: res.at,
    basis: res.source,
  };
}

/**
 * Full status projection for the API payload. `state` is the parsed (possibly
 * absent) sync-state file. Never forwards gitApproved, remote URLs or raw
 * stderr/shell text.
 */
export function projectStatus({ state, snapshot, now = Date.now() }) {
  const freshness = freshnessOf({ state, snapshot, now });
  return {
    lastAttemptAt: state?.lastRunAt && isValidIso(state.lastRunAt) ? state.lastRunAt : null,
    lastPublishedAt: state?.lastPublishAt && isValidIso(state.lastPublishAt) ? state.lastPublishAt : null,
    freshness: freshness.state,
    freshnessBasis: freshness.basis,
    lastSuccessfulCollectionAt: freshness.lastSuccessfulCollectionAt,
    sync: {
      token: syncStatusToken(state),
      lastRecordedStatus: state?.lastStatus ?? null,
      lastReasons: Array.isArray(state?.lastReasons) ? state.lastReasons : [],
    },
    publish: {
      token: publishStatusToken(state),
      committed: typeof state?.lastPublishCommitted === 'boolean' ? state.lastPublishCommitted : null,
    },
    recordedRunning: state?.lastStatus === 'running',
  };
}
