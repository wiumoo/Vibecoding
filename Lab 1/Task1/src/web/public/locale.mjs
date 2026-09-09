/* locale.mjs — UI i18n core: ko/zh/en dictionaries + helpers.
 * Data values (course names, source pages …) are data, never translated here. */

export const LANGS = [
  { id: 'ko', label: '한', name: '한국어' },
  { id: 'zh', label: '中', name: '中文' },
  { id: 'en', label: '英', name: 'English' },
];
const LANG_KEY = 'task1.lang';

let _lang = 'ko';
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (LANGS.some((l) => l.id === saved)) _lang = saved;
} catch { /* storage unavailable */ }

export function currentLang() { return _lang; }
export function setLang(id) {
  if (!LANGS.some((l) => l.id === id)) return;
  _lang = id;
  try { localStorage.setItem(LANG_KEY, id); } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = id;
  document.title = id === 'zh' ? 'Task1 · 本地学业信息' : id === 'en' ? 'Task1 · Local Academic' : 'Task1 · Local Academic';
}

const RAW = { ko: {}, en: {}, zh: {} };
let FLAT = null;

function key(k, o, out = {}) {
  for (const [kk, v] of Object.entries(o)) {
    const p = k ? `${k}.${kk}` : kk;
    if (v && typeof v === 'object' && !Array.isArray(v)) key(p, v, out);
    else out[p] = String(v);
  }
  return out;
}

function flatOf(lang) {
  return key('', RAW[lang]);
}

/** Translate `a.b.c` with optional {var} substitution; falls back ko then key. */
export function t(k, vars) {
  if (!FLAT) {
    FLAT = { ko: flatOf('ko'), zh: flatOf('zh'), en: flatOf('en') };
  }
  let s = FLAT[_lang]?.[k] ?? FLAT.ko[k] ?? k;
  if (vars) {
    for (const [vk, vv] of Object.entries(vars)) {
      s = s.replaceAll(`{${vk}}`, String(vv));
    }
  }
  return s;
}

/* ---------- language-aware arrays / maps used by pages ---------- */
const COLS = {
  ko: ['수업명', '코드', '학점', '교수', '개설 단위', '선택 구분', ''],
  en: ['Course', 'Code', 'Credits', 'Instructor', 'College', 'Type', ''],
  zh: ['课程', '代码', '学分', '教师', '开课单位', '选课类型', ''],
};
export function coursesCols() { return COLS[_lang] || COLS.ko; }

// day_of_week: 1 = Monday (周一). Array index = day number; [0] unused.
const DAY_SHORT = {
  ko: [null, '월', '화', '수', '목', '금', '토', '일'],
  en: [null, 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  zh: [null, '一', '二', '三', '四', '五', '六', '日'],
};
const DAY_FULL = {
  ko: [null, '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'],
  en: [null, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  zh: [null, '周一', '周二', '周三', '周四', '周五', '周六', '周日'],
};
export function dayShort(d) { const a = DAY_SHORT[_lang] || DAY_SHORT.ko; return a[Number(d)] || t('misc.dayN', { n: d }); }
export function dayFull(d) { const a = DAY_FULL[_lang] || DAY_FULL.ko; return a[Number(d)] || t('misc.dayN', { n: d }); }

export function navLabel(id) { return t(`nav.${id}`); }
export function pageTitle(id) { return t(`pt.${id}`); }
export function profileFieldLabel(f) { return t(`pf.${f}`) === `pf.${f}` ? f : t(`pf.${f}`); }
export function courseFieldLabel(f) { const v = t(`cf.${f}`); return v === `cf.${f}` ? f : v; }
export function weekTypeText(w) { return t(`wt.${w}`); }
export function freshnessText(f) { return t(`fr.${f}`); }
export function syncTokenText(k) { return t(`sy.${k}`); }
export function publishTokenText(k) { return t(`pu.${k}`); }
export function problemText(k) { return t(`prob.${k}`); }
export function friendlyCode(k) { const v = t(`fc.${k}`); return v === `fc.${k}` ? k : v; }

/* ---------- content ---------- */

RAW.ko = {
  nav: { overview: 'Overview', profile: 'Profile', courses: 'Courses', schedule: 'Schedule', search: 'Search' },
  pt: { overview: 'Overview', profile: 'Profile', courses: 'Courses', schedule: 'Schedule', search: 'Search' },
  misc: {
    source: '출처', detail: '상세', close: '닫기', reload: '다시 읽기', connect: '연결',
    noRecord: '기록 없음', notProvided: '미제공', emptyString: '(빈 문자열)',
    nameNone: '(이름 없음)', keyNone: '(키 없음)', roomNone: '(강의실 미제공)',
    notAvail: '(미제공)', weekSuffix: '주', periodSuffix: '교시',
    dayN: '요일{n}', countUnit: '{n}건', itemsUnit: '{n}개',
    fieldNote: ' · 저장된 수',
  },
  pf: {
    XM: '이름', XH: '학번', XBMC: '성별', MZMC: '민족', YXMC: '단과대학', YXDM: '단과대 코드',
    ZYMC: '전공', BJMC: '학급', XZNJ: '입학 연도', XZNJMC: '학년', XSBH: '내부 식별번호',
  },
  cf: {
    KCH: '과목 코드', JXBMC: '수업명', JXBID: '분반 ID', XF: '학점', PKDWDM_DISPLAY: '개설 단위',
    SKJS: '교수', XKLY_DISPLAY: '선택 구분', ZCXQJCDD: '수업시간 원문',
  },
  wt: { all: '전체 주', odd: '홀수 주', even: '짝수 주' },
  fr: { fresh: '최근 수집됨', stale: '오래된 데이터', unknown: '최신성 확인 불가', 'clock-warning': '시각 오류 감지', 'no-snapshot': 'snapshot 없음' },
  sy: {
    never: '아직 실행 기록 없음', success: '마지막 실행 성공', 'need-login': '로그인 필요',
    'running-recorded': '마지막 기록: 실행 중', failed: '마지막 실행 실패', unknown: '상태 확인 불가',
  },
  pu: {
    never: '아직 게시 기록 없음', pushed: 'push 완료(기록)', 'up-to-date': '변경 없음(기록)',
    'not-approved': '승인된 원격지 없음', diverged: '원격과 분기 — 확인 필요',
    'origin-mismatch': '원격 주소 불일치', 'remote-unreachable': '원격 연결 실패',
    'push-failed': 'push 실패', other: '기타 상태', unknown: '확인 불가',
  },
  prob: {
    'invalid-day': '요일 값이 올바르지 않음', 'invalid-period': '교시 범위가 올바르지 않음',
    'invalid-weeks': '주차 범위가 올바르지 않음', 'invalid-week-type': '주차 유형(전체/홀수/짝수)이 아님',
    'invalid-shape': '일정 레코드 구조가 아님',
  },
  fc: {
    CURRENT_CORRUPT: '현재 데이터 위치를 읽을 수 없음', CURRENT_INVALID: '현재 데이터 위치가 올바르지 않음',
    CURRENT_TOO_LARGE: '현재 데이터 위치 크기 초과', CURRENT_SYMLINK: '현재 데이터 위치 보안 위반',
    SNAPSHOT_MISSING: 'snapshot을 찾을 수 없음', SNAPSHOT_CORRUPT: 'snapshot 파일 손상',
    SNAPSHOT_PATH_VIOLATION: 'snapshot 경로 보안 위반', SNAPSHOT_TOO_LARGE: 'snapshot 크기 초과',
    MANIFEST_ID_MISMATCH: 'snapshot 식별자 불일치', UNSUPPORTED_SCHEMA: '지원하지 않는 snapshot 형식',
    TERM_MISMATCH: 'snapshot 내부 학기 정보 불일치',
  },
  note: {
    period: '현재 수집 자료에는 교시별 실제 시각이 없어 “N교시”로만 표시합니다. 실제 시각을 추정하지 않습니다.',
    calendar: '개강 기준일 데이터가 없어 “이번 주차”나 날짜 연결은 제공하지 않습니다.',
    exc: '보강·휴강·예외 일정은 현재 수집 자료에 포함되어 있지 않습니다. 일정이 없다고 확인된 것은 아닙니다.',
    derived: '시간표는 독립 시간표 조회가 아니라 과목의 “수업시간 원문(ZCXQJCDD)”에서 파생된 결과입니다.',
  },
  btn: { source: '출처', detail: '상세', reload: '다시 읽기', close: '닫기', connect: '연결' },
  con: {
    title: 'Task1 Local Dashboard',
    sub: 'LOCAL TRUSTED · READ ONLY',
    p1: '이 화면은 ',
    p1b: '127.0.0.1의 로컬 서버',
    p1c: '가 제공하는 개인 대시보드입니다. 시작 터미널에 표시된 실행당 임시 접근 키를 입력하세요.',
    keyPh: '서버 시작 터미널에 표시된 접근 키',
    keyAria: '로컬 접근 키',
    why: '왜 키가 필요한가요?',
    why1: '같은 사용자의 다른 프로그램(웹사이트가 만든 localhost 요청 포함)이 개인정보 API를 읽지 못하게 하기 위한 1회성 방어입니다. 키는 URL·파일·로컬 저장소에 저장되지 않습니다. 서버를 재시작하면 새 키가 발급됩니다.',
    can: '이 화면에서 할 수 있는 것 / 없는 것',
    can1: '표시·검색은 저장된 snapshot 파일을 읽기만 합니다. sync 실행, 데이터 수정, GitHub push, launchd 제어는 없습니다.',
  },
  lang: { aria: '언어 변경', group: '언어' },
  ui: {
    trust: 'LOCAL TRUSTED', readOnly: 'READ ONLY',
    metaTerm: '학기 {term} · snapshot {id}',
    metaNone: '저장된 snapshot 없음',
    reading: '저장 데이터 읽는 중…',
    readAgainAria: '저장 데이터 다시 읽기',
    themeAria: '테마 변경', closeAria: '서버 연결 종료',
    globalSearchPh: '검색 ( / )', globalSearchAria: '전체 검색',
    sidebarFoot: '로컬 전용 · 읽기 전용',
  },
  ov: {
    title: 'Overview',
    desc: '이 화면은 ehall 실시간 연결이 아니라 저장된 snapshot을 표시합니다. 조회만으로 수집·게시·Git·launchd는 실행되지 않습니다.',
    mCourses: '수강 과목', mCredits: '확인 가능한 학점 합계',
    mCreditsNote: '수강한 {n}개 항목 기준',
    mCreditsSkip: '{n}건은 숫자로 해석 불가(제외)',
    mLast: '마지막 정상 수집',
    mLastBasisManifest: 'snapshot 생성 시각', mLastBasisState: '마지막 정상 수집 기록',
    mLastRel: '{rel} 기준 ({basis})',
    mTry: '마지막 수집 시도', mTryNote: '웹은 시도를 만들지 않습니다.',
    statusTitle: '상태', statusSub: '· 기록 기준 · 실시간 확인 아님',
    rFresh: '데이터 최신성', rSync: 'sync', rPub: 'GitHub 게시', rSnap: '표시 중인 snapshot',
    rFreshNoBasis: '신뢰할 수 있는 정상 수집 시각이 없습니다.',
    rSyncRunning: '마지막 기록이 “실행 중”입니다. 현재 프로세스 생존 여부는 확인하지 않습니다.',
    rSyncWeb: '정기 실행은 launchd(08:00/20:00)가 담당하며, 웹은 아무것도 실행하지 않습니다.',
    rPubNote: '“마지막 게시 기록 기준”이며 실시간 원격 상태 확인이 아닙니다.',
    rSnapNone: '없음',
    rSnapCollected: ' · 생성 시 수집 ',
    rSnapReadAt: '웹에서 마지막으로 읽은 시각: {t}',
    rReasons: 'reasons: {r}',
    summaryTitle: '이번 학기 요약',
    sCourses: '과목 수', sSegments: '일정 segment 수', sProfileFields: '프로필 필드',
    sNone: '표시할 snapshot이 없습니다.',
    committedYes: ' (마지막 게시에서 commit 발생)', committedNo: ' (변경 없음)',
  },
  pr: {
    title: 'Profile',
    desc1: 'LOCAL TRUSTED 원본 개인정보를 마스킹 없이 표시합니다.',
    desc2: '화면 공유·캡처 시 개인정보가 그대로 노출됩니다.',
    desc3: ' 미제공 값은 “없음”으로 추정하지 않고 미제공/빈 값으로 구분해 표시합니다.',
    gBasic: '기본 정보', gAcademic: '학사 정보', gOther: '기타(내부 식별자)',
    gInternalBadge: '내부 식별자 · 공개 반출 대상 아님',
    gCount: '{n}개 필드 기준 · snapshot에 없는 값은 미제공으로 표시',
    badgeId: '학번',
    infoTitle: '필드 안내 · ',
    info1: '여기에 보이는 필드는 수집 정책으로 승인된 것만 저장된 값입니다. 예: 학번 앞자리 0은 문자열로 그대로 보존됩니다.',
  },
  cs: {
    title: 'Courses',
    emptyT: '저장된 과목이 없습니다',
    empty1: '이 snapshot의 courses.json에 과목이 없습니다. 수강하지 않았다고 단정할 수 없으며, sync 결과(과목 수 0)와 사이트 표시를 함께 확인해야 합니다.',
    count: '{n}개 과목',
    desc1: 'snapshot에 저장된 과목 {n}개.',
    desc2: ' 수업명(JXBMC)은 분반을 포함한 표시명이며, 별도 분반 번호 필드는 미제공입니다. 수강 확정 상태 필드도 미제공입니다.',
    noticeT: '표시 안내 · ',
    notice1: '분반 번호와 수강 확정 상태는 수집 필드에 없어 추정하지 않습니다. “상세”에서 원문(ZCXQJCDD)과 연결 일정을 확인할 수 있습니다.',
    det: { code: '과목 코드', jxbid: '분반 ID', xf: '학점', raw: '수업시간 원문', key: 'record_key', linked: '연결된 일정 {n}개 (schedule.json)', none: '연결된 일정 없음' },
  },
  sc: {
    title: '시간표',
    desc1: '주간 그리드와 요일 목록을 지원합니다. ',
    desc2: '교시별 실제 시각·개강일·현재 주차는 수집 자료에 없어 추정하지 않습니다.',
    desc3: ' 보강·휴강·예외 일정 필드도 현재 없습니다.',
    emptyHead: '저장된 일정이 없습니다',
    emptyT: '구조화된 수업 일정이 없습니다',
    empty1: '이 snapshot의 schedule.json meetings가 비어 있습니다. “수업 없음”으로 단정할 수 없습니다. sync 결과(일정 수 0)와 사이트 표시를 함께 확인해야 합니다.',
    week: '주차', weekAll: '전체(모든 주차 배치)', weekOpt: '{n}주',
    weekAria: '주차 선택', weekNote: '개강 기준일이 없어 “이번 주” 자동 선택은 제공하지 않습니다.',
    view: '보기', viewGrid: '주간 그리드', viewAgenda: '요일 목록', viewAria: '시간표 보기 모드',
    badgeCount: '{n}개 일정', badgeNeed: '{n}개 확인 필요',
    bAll: '전체 주차 배치 — 같은 교시에 겹치는 일정은 각자 다른 칸(레인)으로 표시됩니다. 실제 충돌 배지는 주차까지 겹치는 경우에만 표시됩니다.',
    bEmptyWeek: '선택한 주차에는 표시할 일정이 없습니다.',
    gridAria: '주간 그리드', agendaAria: '요일 목록',
    problemTitle: '확인 필요 일정', problemSub: '· 그리드에 배치하지 않고 여기에 표시',
    problemNote: ' · 이 일정은 값 형식이 현재 스키마와 맞지 않는 것일 수 있습니다(파싱 오류가 아님).',
    conflict: '겹침',
    agendaEmptyDay: '이 요일에는 표시할 일정이 없습니다',
    legendAria: '범례',
    emptyWeekBanner: '선택한 주차에는 표시할 일정이 없습니다.',
  },
  sr: {
    title: 'Search',
    ph: '과목명·코드·교수·강의실 … (200자)', aria: '데이터 검색',
    waiting: '입력 대기',
    ask: '검색어를 입력하세요',
    ask1: '수업명, 과목 코드, 교수, 개설 단위, 선택 구분, 강의실, course key를 검색할 수 있습니다. 검색은 이 브라우저 메모리에서만 수행되며 기록하지 않습니다.',
    noneT: '결과 없음',
    none1: '“{q}” 와 일치하는 항목이 없습니다. 다른 단어로 다시 검색해 보세요.',
    groupCourse: '과목 {n}건', groupTime: '시간표 {n}건',
    teacher: '교수 {t}', scheduleN: '시간표 {n}개',
    matchedFields: '일치 필드: ',
    overflow: '첫 {n}건만 표시합니다. 검색어를 좁혀 보세요.',
    desc: '이 snapshot의 저장된 값에서 부분 일치를 검색합니다. 검색은 브라우저 메모리에서만 수행되며, 검색어를 URL·이력·서버 로그에 기록하지 않습니다.',
    foot: 'Profile 필드는 검색 대상에서 제외됩니다(LOCAL 조회 범위). CLI와 동일한 검색 규칙을 사용합니다.',
    credits: '{n}학점',
  },
  src: {
    courseTitle: '과목 레코드 출처',
    meetingTitle: '시간표 일정 출처',
    profileTitle: '프로필 레코드 출처',
    note: '이 주소는 이 snapshot 안에서만 유효한 상대 위치입니다.',
    derivedRaw: '원문(파생 근거)', derivedName: '과목명',
    derivedNote: '시간표는 위 원문 문자열에서 파생된 표시입니다.',
    localFile: 'local_file', recordKey: 'record_key', pointer: 'json_pointer',
    system: 'source_system', page: 'source_page',
    dialogAria: '출처 정보',
    snapshotNote: '출처는 현재 표시 중인 snapshot({id})에 한정됩니다.',
  },
  bnd: {
    staleT: '오래된 데이터(스테일)',
    stale1: '마지막 정상 수집: {t}. 새로 고치려면 터미널에서 {code} 또는 정기 실행(08:00/20:00)을 기다리세요. 웹은 수집을 실행하지 않습니다.',
    clockT: '시각 오류 감지',
    clock1: '기록된 수집 시각이 현재보다 미래로 설정되어 있습니다. 기기 시각·타임존을 확인하세요.',
    unknownT: '최신성 확인 불가',
    unknown1: '마지막 정상 수집 시각을 확인할 수 없습니다(sync 상태 파일 없음 또는 손상). 표시된 snapshot 자체는 정상입니다.',
    policyT: '수집 정책이 바뀌었습니다',
    policy1: '표시 중인 snapshot은 현재 collection-policy와 다른 정책으로 수집되었을 수 있습니다. 재수집이 필요할 수 있습니다(웹은 자동 실행하지 않음).',
    noSnapT: '저장된 snapshot이 없습니다',
    noSnap1: '터미널에서 {code} 를 실행해 첫 snapshot을 만들면 이 화면에 표시됩니다. 웹은 sync를 실행하지 않습니다.',
    corruptT: '데이터 위치에 문제가 있어 snapshot을 표시할 수 없습니다.',
  },
  ns: {
    head: '표시할 데이터가 아직 없습니다.',
    emptyT: '저장된 snapshot이 없습니다',
    line1: '첫 수집 전에는 이 대시보드가 표시할 내용이 없습니다. 터미널에서:',
    line2: 'sync 후 이 페이지에서 “다시 읽기”를 누르세요.',
    diagTitle: '데이터 진단',
  },
  rel: {
    future: '시각이 미래로 설정됨', just: '방금 전', min: '{n}분 전', hour: '{n}시간 전', day: '{n}일 전',
  },
  err: {
    keyInvalid: '접근 키가 유효하지 않습니다(서버 재시작 후 새 키 필요).',
    unreachable: '서버에 연결할 수 없습니다. 터미널에서 서버가 실행 중인지 확인하고 다시 읽기를 누르세요.',
  },
};

RAW.en = {
  nav: { overview: 'Overview', profile: 'Profile', courses: 'Courses', schedule: 'Schedule', search: 'Search' },
  pt: { overview: 'Overview', profile: 'Profile', courses: 'Courses', schedule: 'Schedule', search: 'Search' },
  misc: {
    source: 'Source', detail: 'Details', close: 'Close', reload: 'Reload', connect: 'Connect',
    noRecord: 'No record', notProvided: 'Not collected', emptyString: '(empty string)',
    nameNone: '(no name)', keyNone: '(no key)', roomNone: '(room not collected)',
    notAvail: '(not collected)', weekSuffix: 'w', periodSuffix: '',
    dayN: 'Day {n}', countUnit: '{n}', itemsUnit: '{n}',
    fieldNote: ' · stored',
  },
  pf: {
    XM: 'Name', XH: 'Student ID', XBMC: 'Gender', MZMC: 'Ethnicity', YXMC: 'College', YXDM: 'College code',
    ZYMC: 'Major', BJMC: 'Class', XZNJ: 'Enrollment year', XZNJMC: 'Grade', XSBH: 'Internal ID',
  },
  cf: {
    KCH: 'Course code', JXBMC: 'Course', JXBID: 'Section ID', XF: 'Credits', PKDWDM_DISPLAY: 'College',
    SKJS: 'Instructor', XKLY_DISPLAY: 'Selection type', ZCXQJCDD: 'Raw schedule string',
  },
  wt: { all: 'All weeks', odd: 'Odd weeks', even: 'Even weeks' },
  fr: { fresh: 'Recently collected', stale: 'Data is stale', unknown: 'Freshness unknown', 'clock-warning': 'Clock anomaly', 'no-snapshot': 'No snapshot' },
  sy: {
    never: 'No run recorded', success: 'Last run succeeded', 'need-login': 'Login required',
    'running-recorded': 'Last record: running', failed: 'Last run failed', unknown: 'Status unknown',
  },
  pu: {
    never: 'No publish recorded', pushed: 'Pushed (recorded)', 'up-to-date': 'No change (recorded)',
    'not-approved': 'No approved remote', diverged: 'Diverged from remote — check',
    'origin-mismatch': 'Remote URL mismatch', 'remote-unreachable': 'Remote unreachable',
    'push-failed': 'Push failed', other: 'Other state', unknown: 'Unknown',
  },
  prob: {
    'invalid-day': 'Invalid weekday', 'invalid-period': 'Invalid period range',
    'invalid-weeks': 'Invalid week range', 'invalid-week-type': 'Invalid week type (all/odd/even)',
    'invalid-shape': 'Malformed meeting record',
  },
  fc: {
    CURRENT_CORRUPT: 'Cannot read the current pointer', CURRENT_INVALID: 'Current pointer is invalid',
    CURRENT_TOO_LARGE: 'Current pointer too large', CURRENT_SYMLINK: 'Current pointer security violation',
    SNAPSHOT_MISSING: 'Snapshot not found', SNAPSHOT_CORRUPT: 'Snapshot file corrupt',
    SNAPSHOT_PATH_VIOLATION: 'Snapshot path security violation', SNAPSHOT_TOO_LARGE: 'Snapshot too large',
    MANIFEST_ID_MISMATCH: 'Snapshot id mismatch', UNSUPPORTED_SCHEMA: 'Unsupported snapshot schema',
    TERM_MISMATCH: 'Inconsistent term inside snapshot',
  },
  note: {
    period: 'No verified per-period clock times exist in the collected data, so only “period N” is shown. Times are never guessed.',
    calendar: 'Without a term start date, “current week” and calendar linking are not provided.',
    exc: 'Make-up classes, cancellations and exceptional schedules are not part of the collected data. This does not confirm that none exist.',
    derived: 'The timetable is derived from each course’s raw schedule string (ZCXQJCDD), not from a separate timetable API.',
  },
  btn: { source: 'Source', detail: 'Details', reload: 'Reload', close: 'Close', connect: 'Connect' },
  con: {
    title: 'Task1 Local Dashboard',
    sub: 'LOCAL TRUSTED · READ ONLY',
    p1: 'This screen is served by the ',
    p1b: 'local server on 127.0.0.1',
    p1c: '. Enter the one-time access key printed in the terminal that started the server.',
    keyPh: 'Access key shown in the server terminal',
    keyAria: 'Local access key',
    why: 'Why is a key required?',
    why1: 'It is a one-time defence so other programs running as the same user (including localhost requests made by websites) cannot read the personal API. The key is never stored in URLs, files or local storage and is replaced on every server restart.',
    can: 'What this screen can / cannot do',
    can1: 'Viewing and searching only reads saved snapshot files. No sync run, data changes, GitHub push or launchd control happens here.',
  },
  lang: { aria: 'Change language', group: 'Language' },
  ui: {
    trust: 'LOCAL TRUSTED', readOnly: 'READ ONLY',
    metaTerm: 'Term {term} · snapshot {id}',
    metaNone: 'No saved snapshot',
    reading: 'Reading saved data…',
    readAgainAria: 'Reload saved data',
    themeAria: 'Toggle theme', closeAria: 'End server connection',
    globalSearchPh: 'Search ( / )', globalSearchAria: 'Search',
    sidebarFoot: 'Local only · read only',
  },
  ov: {
    title: 'Overview',
    desc: 'This screen shows the saved snapshot, not live ehall data. Viewing it never triggers collection, publishing, Git or launchd.',
    mCourses: 'Courses', mCredits: 'Countable credits',
    mCreditsNote: 'from {n} items with credits',
    mCreditsSkip: '{n} items skipped (not numeric)',
    mLast: 'Last successful collection',
    mLastBasisManifest: 'snapshot creation time', mLastBasisState: 'last successful collection record',
    mLastRel: '{rel} basis · {basis}',
    mTry: 'Last collection attempt', mTryNote: 'This web screen never starts an attempt.',
    statusTitle: 'Status', statusSub: ' · recorded only · not a live check',
    rFresh: 'Data freshness', rSync: 'sync', rPub: 'GitHub publish', rSnap: 'Snapshot shown',
    rFreshNoBasis: 'No trusted successful collection time is available.',
    rSyncRunning: 'The last record says “running”. Process liveness is not checked here.',
    rSyncWeb: 'Scheduled runs are handled by launchd (08:00/20:00); this web screen runs nothing.',
    rPubNote: '“Based on the last recorded publish” — not a live remote check.',
    rSnapNone: 'none',
    rSnapCollected: ' · collected when created ',
    rSnapReadAt: 'Last read by this web screen: {t}',
    rReasons: 'reasons: {r}',
    summaryTitle: 'Current term summary',
    sCourses: 'Courses', sSegments: 'Meeting segments', sProfileFields: 'Profile fields',
    sNone: 'There is no snapshot to show.',
    committedYes: ' (commit created on last publish)', committedNo: ' (no change)',
  },
  pr: {
    title: 'Profile',
    desc1: 'Unmasked LOCAL TRUSTED source personal data.',
    desc2: 'Sharing or capturing this screen exposes your personal data.',
    desc3: ' Missing values are not guessed as “none”; they are shown distinctly as not collected / empty.',
    gBasic: 'Basic information', gAcademic: 'Academic information', gOther: 'Other (internal identifiers)',
    gInternalBadge: 'Internal identifier · not part of public export',
    gCount: 'Based on {n} fields · fields absent from the snapshot are shown as not collected',
    badgeId: 'Student ID',
    infoTitle: 'Field note · ',
    info1: 'Only policy-approved collected fields appear here. Example: leading zeros of a student id are preserved as strings.',
  },
  cs: {
    title: 'Courses',
    emptyT: 'No courses stored',
    empty1: 'courses.json in this snapshot contains no courses. That does not confirm you are enrolled in none — compare the sync result (0 courses) with the site.',
    count: '{n} courses',
    desc1: '{n} courses stored in this snapshot.',
    desc2: ' JXBMC is the display name including its section. A separate section-number field is not collected, and a confirmed-enrollment status field is not collected.',
    noticeT: 'Display note · ',
    notice1: 'Section numbers and enrolment status are not collected fields, so they are never guessed. Use “Details” to inspect the raw schedule string and linked meetings.',
    det: { code: 'Course code', jxbid: 'Section ID', xf: 'Credits', raw: 'Raw schedule string', key: 'record_key', linked: '{n} linked meetings (schedule.json)', none: 'No linked meetings' },
  },
  sc: {
    title: 'Schedule',
    desc1: 'Weekly grid and day list are available. ',
    desc2: 'No verified per-period clock times, term start date or current week exist in the collected data — nothing is guessed.',
    desc3: ' Make-up, cancelled and exceptional-schedule fields are also absent.',
    emptyHead: 'No meetings stored',
    emptyT: 'No structured meetings',
    empty1: 'schedule.json in this snapshot has no meetings. That is not a confirmation of “no classes” — compare the sync result (0) with the site.',
    week: 'Week', weekAll: 'All weeks (full-term view)', weekOpt: 'Week {n}',
    weekAria: 'Select week', weekNote: 'No term start date exists, so “this week” is never auto-selected.',
    view: 'View', viewGrid: 'Weekly grid', viewAgenda: 'Day list', viewAria: 'Timetable view mode',
    badgeCount: '{n} meetings', badgeNeed: '{n} need review',
    bAll: 'Full-term view — meetings sharing a slot are placed on separate lanes. A conflict badge only appears when their weeks also overlap.',
    bEmptyWeek: 'No meetings to show for the selected week.',
    gridAria: 'Weekly grid', agendaAria: 'Day list',
    problemTitle: 'Meetings needing review', problemSub: ' · shown here instead of the grid',
    problemNote: ' · this entry’s values do not match the current schema (not a parse failure).',
    conflict: 'Conflict',
    agendaEmptyDay: 'No meetings to show for this day',
    legendAria: 'Legend',
    emptyWeekBanner: 'No meetings to show for the selected week.',
  },
  sr: {
    title: 'Search',
    ph: 'Course, code, instructor, room … (200 chars)', aria: 'Search data',
    waiting: 'Waiting for input',
    ask: 'Type a search term',
    ask1: 'Searches course names, codes, instructors, colleges, selection types, rooms and course keys. Search runs only in this browser’s memory and is never recorded.',
    noneT: 'No results',
    none1: 'Nothing matches “{q}”. Try a different term.',
    groupCourse: 'Courses · {n}', groupTime: 'Schedule · {n}',
    teacher: 'Instructor {t}', scheduleN: '{n} meetings in schedule',
    matchedFields: 'Matched fields: ',
    overflow: 'Only the first {n} results are shown. Narrow your query.',
    desc: 'Substring search over the stored values of this snapshot. It runs only in browser memory and never writes the query to URLs, history or server logs.',
    foot: 'Profile fields are excluded from search (LOCAL scope). Uses the same rules as the CLI.',
    credits: '{n} credits',
  },
  src: {
    courseTitle: 'Course record source',
    meetingTitle: 'Meeting record source',
    profileTitle: 'Profile record source',
    note: 'These references are only valid inside this snapshot.',
    derivedRaw: 'Raw text (derivation basis)', derivedName: 'Course name',
    derivedNote: 'The timetable shown is derived from the raw string above.',
    localFile: 'local_file', recordKey: 'record_key', pointer: 'json_pointer',
    system: 'source_system', page: 'source_page',
    dialogAria: 'Source details',
    snapshotNote: 'Source is limited to the snapshot currently shown ({id}).',
  },
  bnd: {
    staleT: 'Data is stale',
    stale1: 'Last successful collection: {t}. To refresh, run {code} in a terminal or wait for the next scheduled run (08:00/20:00). This web screen never collects.',
    clockT: 'Clock anomaly detected',
    clock1: 'The recorded collection time lies in the future. Check the device clock and timezone.',
    unknownT: 'Freshness unknown',
    unknown1: 'The last successful collection time cannot be determined (sync state file missing or corrupt). The snapshot itself is intact.',
    policyT: 'Collection policy changed',
    policy1: 'The snapshot shown may have been collected under a different collection-policy. Recollection may be required (this screen never starts it automatically).',
    noSnapT: 'No saved snapshot',
    noSnap1: 'Run {code} in a terminal to create the first snapshot; it will then appear here. This web screen never runs sync.',
    corruptT: 'There is a problem with the data location, so the snapshot cannot be shown.',
  },
  ns: {
    head: 'There is no data to show yet.',
    emptyT: 'No saved snapshot',
    line1: 'Before the first collection this dashboard has nothing to show. In a terminal:',
    line2: 'After sync, press “Reload” on this page.',
    diagTitle: 'Data diagnostics',
  },
  rel: {
    future: 'Time set in the future', just: 'just now', min: '{n}m ago', hour: '{n}h ago', day: '{n}d ago',
  },
  err: {
    keyInvalid: 'The access key is invalid (a new key is issued after each server restart).',
    unreachable: 'Cannot reach the server. Make sure it is running in a terminal and press Reload.',
  },
};

RAW.zh = {
  nav: { overview: '概览', profile: '个人信息', courses: '课程', schedule: '课表', search: '搜索' },
  pt: { overview: '概览', profile: '个人信息', courses: '课程', schedule: '课表', search: '搜索' },
  misc: {
    source: '来源', detail: '详情', close: '关闭', reload: '重新读取', connect: '连接',
    noRecord: '无记录', notProvided: '未采集', emptyString: '(空字符串)',
    nameNone: '(无名称)', keyNone: '(无键)', roomNone: '(未采集教室)',
    notAvail: '(未采集)', weekSuffix: '周', periodSuffix: '节',
    dayN: '第 {n} 天', countUnit: '{n} 条', itemsUnit: '{n} 个',
    fieldNote: ' · 已保存',
  },
  pf: {
    XM: '姓名', XH: '学号', XBMC: '性别', MZMC: '民族', YXMC: '院系', YXDM: '院系代码',
    ZYMC: '专业', BJMC: '班级', XZNJ: '入学年份', XZNJMC: '年级', XSBH: '内部学号标识',
  },
  cf: {
    KCH: '课程代码', JXBMC: '课程名称', JXBID: '教学班 ID', XF: '学分', PKDWDM_DISPLAY: '开课单位',
    SKJS: '授课教师', XKLY_DISPLAY: '选课类型', ZCXQJCDD: '上课时间原文',
  },
  wt: { all: '全部周', odd: '单周', even: '双周' },
  fr: { fresh: '近期已采集', stale: '数据已过期', unknown: '新鲜度未知', 'clock-warning': '检测到时钟异常', 'no-snapshot': '无 snapshot' },
  sy: {
    never: '尚无运行记录', success: '上次运行成功', 'need-login': '需要登录',
    'running-recorded': '上条记录：运行中', failed: '上次运行失败', unknown: '状态未知',
  },
  pu: {
    never: '尚无发布记录', pushed: '已推送(记录)', 'up-to-date': '无变更(记录)',
    'not-approved': '未批准远程地址', diverged: '与远程分叉 — 需确认',
    'origin-mismatch': '远程地址不匹配', 'remote-unreachable': '远程无法连接',
    'push-failed': '推送失败', other: '其他状态', unknown: '未知',
  },
  prob: {
    'invalid-day': '星期值不正确', 'invalid-period': '节次范围不正确',
    'invalid-weeks': '周次范围不正确', 'invalid-week-type': '周类型(全部/单/双)不正确',
    'invalid-shape': '日程记录结构不正确',
  },
  fc: {
    CURRENT_CORRUPT: '无法读取当前数据指针', CURRENT_INVALID: '当前数据指针无效',
    CURRENT_TOO_LARGE: '当前数据指针过大', CURRENT_SYMLINK: '当前数据指针安全违规',
    SNAPSHOT_MISSING: '找不到 snapshot', SNAPSHOT_CORRUPT: 'snapshot 文件损坏',
    SNAPSHOT_PATH_VIOLATION: 'snapshot 路径安全违规', SNAPSHOT_TOO_LARGE: 'snapshot 过大',
    MANIFEST_ID_MISMATCH: 'snapshot 标识不一致', UNSUPPORTED_SCHEMA: '不支持的 snapshot 格式',
    TERM_MISMATCH: 'snapshot 内学期信息不一致',
  },
  note: {
    period: '已采集数据中没有经过核实的节次时刻，因此仅显示“第 N 节”，不会推测实际时间。',
    calendar: '没有开学基准日数据，因此不提供“本周”或日期关联。',
    exc: '调课、停课和例外日程不在当前采集数据中。这并不等于确认不存在。',
    derived: '课表并非来自独立的课表接口，而是由课程的“上课时间原文(ZCXQJCDD)”推导得出。',
  },
  btn: { source: '来源', detail: '详情', reload: '重新读取', close: '关闭', connect: '连接' },
  con: {
    title: 'Task1 本地仪表盘',
    sub: 'LOCAL TRUSTED · READ ONLY',
    p1: '本页面由 ',
    p1b: '127.0.0.1 上的本地服务',
    p1c: '提供。请输入启动终端中显示的本次临时访问密钥。',
    keyPh: '服务器终端中显示的访问密钥',
    keyAria: '本地访问密钥',
    why: '为什么需要密钥？',
    why1: '这是一次性防护，防止同一用户下的其他程序（包括网页发起的 localhost 请求）读取个人 API。密钥不会存入 URL、文件或本地存储，每次重启服务都会重新生成。',
    can: '此页面能做 / 不能做的事',
    can1: '显示与搜索只会读取已保存的 snapshot 文件。不会触发 sync、数据修改、GitHub 推送或 launchd 控制。',
  },
  lang: { aria: '切换语言', group: '语言' },
  ui: {
    trust: 'LOCAL TRUSTED', readOnly: 'READ ONLY',
    metaTerm: '学期 {term} · snapshot {id}',
    metaNone: '无已保存 snapshot',
    reading: '正在读取已保存数据…',
    readAgainAria: '重新读取已保存数据',
    themeAria: '切换主题', closeAria: '结束服务器连接',
    globalSearchPh: '搜索 ( / )', globalSearchAria: '全局搜索',
    sidebarFoot: '仅本地 · 只读',
  },
  ov: {
    title: '概览',
    desc: '本页面显示的是已保存的 snapshot，而非 ehall 实时数据。仅查看不会触发采集、发布、Git 或 launchd。',
    mCourses: '修读课程', mCredits: '可统计学分合计',
    mCreditsNote: '按 {n} 条有学分记录统计',
    mCreditsSkip: '{n} 条无法按数字解析(已排除)',
    mLast: '最近一次成功采集',
    mLastBasisManifest: 'snapshot 创建时间', mLastBasisState: '最近成功采集记录',
    mLastRel: '{rel} · 依据 {basis}',
    mTry: '最近一次采集尝试', mTryNote: '本页面不会发起采集。',
    statusTitle: '状态', statusSub: ' · 仅依据记录 · 非实时检测',
    rFresh: '数据新鲜度', rSync: 'sync', rPub: 'GitHub 发布', rSnap: '当前显示的 snapshot',
    rFreshNoBasis: '没有可信任的成功采集时间。',
    rSyncRunning: '上一条记录为“运行中”。此处不检查进程是否存活。',
    rSyncWeb: '定时运行由 launchd(08:00/20:00) 负责；本页面不运行任何任务。',
    rPubNote: '“以上次发布记录为准”，并非实时远程状态。',
    rSnapNone: '无',
    rSnapCollected: ' · 创建时采集 ',
    rSnapReadAt: '本页面最近读取时间：{t}',
    rReasons: 'reasons: {r}',
    summaryTitle: '本学期概要',
    sCourses: '课程数', sSegments: '日程 segment 数', sProfileFields: '个人信息字段',
    sNone: '没有可显示的 snapshot。',
    committedYes: ' (上次发布产生 commit)', committedNo: ' (无变更)',
  },
  pr: {
    title: '个人信息',
    desc1: '显示未脱敏的 LOCAL TRUSTED 原始个人信息。',
    desc2: '分享或截图此页面会直接暴露个人信息。',
    desc3: ' 缺失值不会被当作“无”来猜测，而是区分显示为“未采集/空字符串”。',
    gBasic: '基本信息', gAcademic: '学籍信息', gOther: '其他(内部标识)',
    gInternalBadge: '内部标识 · 不属于对外发布内容',
    gCount: '按 {n} 个字段 · snapshot 中不存在的值显示为“未采集”',
    badgeId: '学号',
    infoTitle: '字段说明 · ',
    info1: '此处仅显示经采集策略批准并保存的字段。例如学号前导 0 会以字符串原样保留。',
  },
  cs: {
    title: '课程',
    emptyT: '没有已保存的课程',
    empty1: '该 snapshot 的 courses.json 中没有课程。这并不等于确认没有选课，请结合 sync 结果(0 门)与网站显示确认。',
    count: '{n} 门课程',
    desc1: 'snapshot 中保存了 {n} 门课程。',
    desc2: ' JXBMC 是含教学班的显示名称；单独的班号字段与“已确认选课”状态字段均未采集。',
    noticeT: '显示说明 · ',
    notice1: '班号与选课确认状态不在采集字段中，因此不会推测。可在“详情”中查看上课时间原文与关联日程。',
    det: { code: '课程代码', jxbid: '教学班 ID', xf: '学分', raw: '上课时间原文', key: 'record_key', linked: '关联日程 {n} 条 (schedule.json)', none: '无关联日程' },
  },
  sc: {
    title: '课表',
    desc1: '支持周历网格与按日列表。 ',
    desc2: '采集数据中没有经核实的节次时刻、开学基准日或当前周次，因此不做任何推测。',
    desc3: ' 调课、停课、例外日程等字段目前也尚未采集。',
    emptyHead: '没有已保存的日程',
    emptyT: '没有结构化的上课日程',
    empty1: '该 snapshot 的 schedule.json meetings 为空。这并非“没有课”的确认，请结合 sync 结果(0 条)与网站显示确认。',
    week: '周次', weekAll: '全部(整学期视图)', weekOpt: '第 {n} 周',
    weekAria: '选择周次', weekNote: '没有开学基准日，因此不会自动选择“本周”。',
    view: '视图', viewGrid: '周历网格', viewAgenda: '按日列表', viewAria: '课表显示方式',
    badgeCount: '{n} 条日程', badgeNeed: '{n} 条需核查',
    bAll: '整学期视图 — 同一时段重叠的日程会分栏显示；只有周次也重叠时才会显示冲突标记。',
    bEmptyWeek: '所选周次没有可显示的日程。',
    gridAria: '周历网格', agendaAria: '按日列表',
    problemTitle: '需要核查的日程', problemSub: ' · 不在网格中显示，列于此处',
    problemNote: ' · 该条目的数值与当前 schema 不符(并非解析失败)。',
    conflict: '冲突',
    agendaEmptyDay: '这一天没有可显示的日程',
    legendAria: '图例',
    emptyWeekBanner: '所选周次没有可显示的日程。',
  },
  sr: {
    title: '搜索',
    ph: '课程、代码、教师、教室…(200 字)', aria: '搜索数据',
    waiting: '等待输入',
    ask: '请输入搜索词',
    ask1: '可搜索课程名称、课程代码、教师、开课单位、选课类型、教室与 course key。搜索仅在浏览器内存中进行且不会被记录。',
    noneT: '没有结果',
    none1: '没有与“{q}”匹配的内容。请尝试其他关键词。',
    groupCourse: '课程 · {n}', groupTime: '课表 · {n}',
    teacher: '教师 {t}', scheduleN: '关联课表 {n} 条',
    matchedFields: '匹配字段：',
    overflow: '仅显示前 {n} 条，请缩小关键词。',
    desc: '在本 snapshot 的已保存值中进行子串搜索。搜索仅在浏览器内存中进行，关键词不会写入 URL、历史记录或服务器日志。',
    foot: '个人信息字段不参与搜索(仅本地范围)。搜索规则与 CLI 一致。',
    credits: '{n} 学分',
  },
  src: {
    courseTitle: '课程记录来源',
    meetingTitle: '日程记录来源',
    profileTitle: '个人信息记录来源',
    note: '这些引用仅在当前 snapshot 内有效。',
    derivedRaw: '原文(推导依据)', derivedName: '课程名称',
    derivedNote: '所显示的课表由上方原文推导而来。',
    localFile: 'local_file', recordKey: 'record_key', pointer: 'json_pointer',
    system: 'source_system', page: 'source_page',
    dialogAria: '来源详情',
    snapshotNote: '来源仅限于当前显示的 snapshot({id})。',
  },
  bnd: {
    staleT: '数据已过期',
    stale1: '最近一次成功采集：{t}。如需更新，请在终端运行 {code}，或等待下次定时运行(08:00/20:00)。本页面不会自动采集。',
    clockT: '检测到时钟异常',
    clock1: '记录的采集时间晚于当前时间，请检查设备时钟与时区。',
    unknownT: '新鲜度未知',
    unknown1: '无法确定最近成功采集时间(sync 状态文件缺失或损坏)。显示的 snapshot 本身正常。',
    policyT: '采集策略已变更',
    policy1: '当前显示的 snapshot 可能是在与现有 collection-policy 不同的策略下采集的，可能需要重新采集(本页面不会自动执行)。',
    noSnapT: '没有已保存的 snapshot',
    noSnap1: '在终端运行 {code} 创建第一个 snapshot 后即可显示。本页面不会运行 sync。',
    corruptT: '数据位置存在问题，无法显示 snapshot。',
  },
  ns: {
    head: '还没有可显示的数据。',
    emptyT: '没有已保存的 snapshot',
    line1: '首次采集前此仪表盘没有可显示内容。请在终端中：',
    line2: 'sync 完成后在本页面点击“重新读取”。',
    diagTitle: '数据诊断',
  },
  rel: {
    future: '时间被设置为未来', just: '刚刚', min: '{n} 分钟前', hour: '{n} 小时前', day: '{n} 天前',
  },
  err: {
    keyInvalid: '访问密钥无效(重启服务器后会生成新密钥)。',
    unreachable: '无法连接服务器。请确认服务器在终端中运行，然后点击“重新读取”。',
  },
};

/* noscript fallback copy for the static shell */
export const NOSCRIPT = {
  ko: ['此页面需要 JavaScript。请启用后重新打开。', '本页面仅限 localhost，只读取已保存的 snapshot。'],
  en: ['This dashboard requires JavaScript. Enable it and reopen this page.', 'This screen is localhost-only and only reads the saved snapshot.'],
  zh: ['此仪表盘需要启用 JavaScript 后重新打开。', '此页面仅限 localhost 使用，且只读取已保存的 snapshot。'],
};
export function noscriptHtml() {
  return NOSCRIPT[_lang]?.map((p) => `<p>${p}</p>`).join('') || '';
}
