/**
 * view-model.mjs — explicit, allowlisted DTO for the browser.
 * Only derived/aggregated fields are sent: no raw sync-state contents, no
 * gitApproved remote, no absolute OS paths, no raw shell/error text, and no
 * duplicated `normalized` copies of private values.
 */
import { readDashboardData } from '../storage/reader.mjs';
import { projectStatus } from '../query/status.mjs';

const MEETING_KEYS = [
  'course_key', 'course_code', 'day_of_week', 'start_period', 'end_period',
  'week_start', 'week_end', 'week_type', 'location',
];

function cleanMeeting(m) {
  const out = {};
  for (const k of MEETING_KEYS) {
    if (m[k] !== undefined && m[k] !== null && m[k] !== '') out[k] = m[k];
  }
  return out;
}

/** Build the /api/view payload for one request. Never throws for data faults. */
export async function buildApiView(settings) {
  const d = await readDashboardData(settings);
  const { snapshot, state, diagnostics, observedAt, policyHash } = d;
  const now = Date.parse(observedAt);

  const payload = {
    api_version: 1,
    observed_at: observedAt,
    data_state: null,
    data_error: null,
    snapshot: null,
    status: null,
    capabilities: {
      period_times: false,
      calendar_week_mapping: false,
      exceptions: false,
    },
    diagnostics: diagnostics.map((x) => ({ code: x.code, severity: x.severity, message: x.message })),
  };

  if (!snapshot) {
    const errDiag =
      diagnostics.find((x) => x.code === 'NO_CURRENT') ||
      diagnostics.find((x) => x.severity === 'error');
    payload.data_state = errDiag && errDiag.code === 'NO_CURRENT' ? 'empty' : 'error';
    payload.data_error = errDiag ? errDiag.code : null;
  } else {
    payload.data_state = 'ok';
    payload.snapshot = {
      snapshot_id: snapshot.id,
      schema_version: snapshot.schemaVersion,
      term: snapshot.term,
      source_system: snapshot.sourceSystem,
      snapshot_collected_at: snapshot.collectedAt,
      counts: {
        profile: 1,
        courses: snapshot.courses.list.length,
        schedule: snapshot.schedule.meetings.length,
      },
      profile: { source: snapshot.profile.source },
      courses: snapshot.courses.list.map((c) => ({ record_key: c.record_key, source: c.source })),
      meetings: snapshot.schedule.meetings.map(cleanMeeting),
    };
  }

  payload.status = projectStatus({ state, snapshot, now });
  if (state) {
    // recorded running indicator only (never a live process check)
    payload.status.sync.recordedAt = state.lastRunAt || null;
  }

  return { payload, policyHash };
}
