/**
 * source.mjs — source registry and record locators for LOCAL query results.
 * Pure module, shared by the CLI, web API and browser. No secrets here and no
 * filesystem / network access. `local_file` values are relative snapshot file
 * names only — never absolute OS paths.
 */

export const SOURCE_PAGE = {
  profile: { system: 'NJU ehall', page: '我的课表 · 学生基本信息 (jwapp wdkb xskcb)' },
  courses: { system: 'NJU ehall', page: '我的课表 · 学生课程列表 (jwapp wdkb xskcb)' },
  schedule: { system: 'NJU ehall', page: '我的课表 · 课程时间 (jwapp wdkb xskcb)' },
};

/** Base source metadata for one area record inside the current snapshot. */
export function areaSource(file, record_key) {
  const meta = SOURCE_PAGE[file.replace('.json', '')] || { system: 'NJU ehall', page: 'NJU ehall' };
  return {
    local_file: file,
    record_key: record_key || null,
    source_system: meta.system,
    source_page: meta.page,
  };
}

/**
 * Full locator for a record shown on a dashboard page.
 * `json_pointer` locates the record inside the snapshot JSON file and is only
 * valid together with `snapshot_id`. Meeting pointers are derived from their
 * index inside schedule.json /meetings.
 */
export function recordLocator(snapshotId, file, { record_key = null, json_pointer = null } = {}) {
  const meta = SOURCE_PAGE[file.replace('.json', '')] || { system: 'NJU ehall', page: 'NJU ehall' };
  return {
    snapshot_id: snapshotId,
    local_file: file,
    record_key,
    json_pointer,
    source_system: meta.system,
    source_page: meta.page,
  };
}
