# Task1 Local Web Dashboard — Implementation Plan

> 상태: 구현 전 계획. 이 파일 저장은 구현 시작을 의미하지 않는다.
> 성격: LOCAL TRUSTED, read-only viewer
> 기준: 기존 `plan.md`의 데이터·보안 경계 유지
> 목표: 기존 PRIVATE 스냅샷을 정확하고 아름답게 읽는 개인 대시보드
> 비목표: 수집기 교체, 새 DB, 공개 웹서비스, 웹 기반 자동화 제어

## 1. 핵심 결정

| 항목 | 결정 |
|---|---|
| Backend | Node.js 내장 `node:http`, ESM |
| Frontend | HTML + CSS + Vanilla JavaScript ESM |
| 추가 의존성 | 기본적으로 없음 |
| 데이터 저장소 | 기존 PRIVATE JSON snapshot 그대로 |
| 주소 | `http://127.0.0.1:4317` |
| 실행 | 향후 추가할 `npm run web` |
| 종료 | 해당 터미널에서 `Ctrl+C` |
| 자동 시작 | 이번 범위에서 추가하지 않음 |
| query 재사용 | CLI 실행부와 순수 조회 함수를 최소 분리 |
| 화면 데이터 전달 | 검증된 snapshot 전체를 하나의 일관된 응답으로 전달 |
| 검색 | 메모리 내 검색, CLI와 동일한 순수 함수 재사용 |
| 외부 통신 | 없음 |
| 웹의 변경 기능 | 없음 |
| 테마 | System / Light / Dark |
| 시간표 기본 단위 | 검증된 실제 시각이 없는 현재는 교시 |
| 미수집 정보 | 미제공·미확인 표시, 추정 금지 |

**웹을 시작하거나 화면을 조회해도 수집·세션 갱신·snapshot 저장·state 저장·Git 작업·launchd 제어가 발생하지 않는다.**

## 2. 현재 프로젝트 분석

### 2.1 검토 범위

다음을 읽기 전용으로 검토했다.

- `plan.md` 전체
- `README.md`, `USAGE.md`
- `package.json`
- `config/`의 설정·수집 정책·공개 정책
- `src/auth/`, `collect/`, `core/`, `storage/`
- `src/query/`, `publish/`, `cli/`, `discovery/`
- `tests/core.test.mjs`, `tests/publish.test.mjs`
- `launchd/agent.plist.example`
- 자격증명·LaunchAgent 제어 스크립트
- 현재 PRIVATE snapshot과 state의 키·타입·개수

PRIVATE의 실제 개인 값은 계획·fixture에 복사하지 않는다. Keychain 비밀번호와 쿠키 내용은 조회하지 않았다. 현재 테스트는 코드만 검토했다. 계획 검토 작업에서 테스트 통과 여부를 새로 확인한 것은 아니다.

### 2.2 현재 기술 스택

- Node.js ESM, `package.json`의 Node 요구 버전 `>=20`
- 의존성: Playwright
- 테스트: `node:test`
- 저장: 파일시스템 JSON
- 인증: macOS Keychain + 보호된 평문 cookie vault
- 운영: macOS LaunchAgent
- 웹 서버·frontend framework·DB는 없음

이 규모에서 React, Next.js, Vite, Express, DB 서버를 도입할 필요가 없다.

### 2.3 실제 실행 경로

```text
launchd
  └ src/cli/run-scheduled.mjs
      ├ src/cli/sync.mjs
      │   ├ Keychain / cookie vault
      │   ├ collect/jwapp.mjs
      │   └ storage/snapshot.mjs
      └ src/cli/publish.mjs
          ├ publish/mask.mjs
          └ publish/git.mjs

수동 조회
  └ src/query/db.mjs
      ├ current.json
      ├ snapshot JSON
      └ sync-state.json
```

웹은 이 중 로컬 읽기 경로에만 연결한다.

### 2.4 현재 PRIVATE 구조

```text
NJUEhall/
├── private/
│   ├── current.json
│   ├── snapshots/
│   │   └── <snapshot_id>/
│   │       ├── profile.json
│   │       ├── courses.json
│   │       ├── schedule.json
│   │       └── manifest.json
│   └── auth/
├── state/
│   └── sync-state.json
└── logs/
```

검토 시 snapshot 디렉터리는 2개였다. 현재 snapshot은 profile 1건, courses 1건, schedule segment 2건이며 네 JSON 파일의 권한은 `0600`이었다. 이는 검토 시점의 관찰이며 구현 시 재확인이 필요하다.

| 파일 | 주요 구조 |
|---|---|
| profile | `source`, `normalized` |
| courses | `term`, `count`, `list[]` |
| course record | `record_key`, `source`, `normalized` |
| schedule | `term`, `timezone`, `count`, `meetings[]` |
| meeting | `course_key`, `course_code`, 요일·교시·주차·강의실 |
| manifest | 스키마·정책 해시·학기·snapshot ID·수집 시각·counts |
| state | 마지막 실행·수집·게시 결과, Git 승인 설정 |

manifest의 `collected_at`은 snapshot 생성 당시 시각이다. 무변경 수집 성공 이후의 최신성은 `state.lastCollectedAt`을 확인해야 한다.

### 2.5 실제 제공 가능한 데이터

#### Profile

현재 source에는 다음 키가 있다.

```text
XH, XM, YXDM, ZYMC, BJMC, XZNJ, XSBH
```

정책에 존재하더라도 실제 저장되지 않은 성별·단과대명 등의 값은 만들지 않는다.

#### Courses

```text
KCH
JXBMC
JXBID
XF
PKDWDM_DISPLAY
SKJS
XKLY_DISPLAY
ZCXQJCDD
```

- `JXBMC`는 수업반 명칭이다. 별도의 순수 과목명과 분반 번호가 확보됐다고 가정하지 않는다.
- `JXBID`는 수업반 ID이며 사람이 읽는 분반 번호와 동일하지 않다.
- `XKLY_DISPLAY`는 선택 경로·유형으로 표시한다. 수강 확정 상태로 해석하지 않는다.
- 수강 상태 전용 필드가 없으므로 상태는 `미제공`이다.

#### Schedule

현재 제공:

```text
요일
시작·종료 교시
시작·종료 주차
전체/홀수/짝수 주
강의실
연결 과목 키
```

현재 미제공:

```text
검증된 교시별 실제 시각
개강 기준일
현재 학사 주차
구조화된 보강·휴강
예외 날짜 목록
```

시간표는 독립 시간표 API 결과가 아니라 과목의 `ZCXQJCDD` 문자열에서 파생된 결과다. UI에서 이 출처와 한계를 명시한다.

## 3. 기존 버그·PLAN 불일치 목록

계획 단계에서는 수정하지 않는다. 향후 구현 시 아래 두 범주를 구분한다.

### 3.1 웹 구현에 필요한 최소 보완

| ID | 현재 문제 | 웹 구현 시 대응 |
|---|---|---|
| W-01 | `query/db.mjs` import 시 `main()` 실행 | CLI 실행부와 순수 조회 함수 분리 |
| W-02 | 조회 CLI가 `ensureDataLayout()`으로 mkdir/chmod 수행 | 읽기 경로에서 제거 |
| W-03 | snapshot loader가 query와 publish에 중복 | 검증된 읽기 모듈 신설, 우선 CLI/Web 공유 |
| W-04 | current reader가 오류를 모두 `null`로 처리 | 없음·손상·권한 오류 구분 |
| W-05 | ID 길이·canonical path·symlink·manifest 일치 검증 부족 | 웹 읽기 경계에 검증 추가 |
| W-06 | `readState()`가 모든 오류를 `{}`로 숨김 | 읽기 전용 상세 결과 함수 추가 |
| W-07 | status CLI가 snapshot 없으면 실패 | snapshot 없음에서도 status 조회 허용 |
| W-08 | stale 판정 없음 | 순수 status projection 추가 |
| W-09 | 출처가 파일 단위이거나 meeting을 구분하지 못함 | snapshot 내 record locator 보완 |
| W-10 | 검색 로직이 CLI 내부에 결합 | 순수 검색 함수 추출 |

`publish/mask.mjs`의 loader 교체는 웹 구현에 필수적이지 않다. 이번 최소 리팩터링에서는 publisher의 실행 경로를 그대로 둔다.

### 3.2 별도 보수 항목 — 웹에 끼워 넣지 않음

| 영역 | 확인된 문제 |
|---|---|
| Snapshot | 정책 변경 시에도 해시가 같은 영역의 이전 파일을 재사용 |
| Schema | manifest 스키마 하드코딩, 정책 스키마 비교 불충분 |
| Snapshot ID | UTC가 아닌 로컬 날짜로 생성 |
| 보관 | prune 정규식이 실제 hex suffix 일부를 허용하지 않음 |
| 원자성 | pointer rename은 있으나 fsync·완성 후보 확정·읽기와 prune 조정 부족 |
| 정규화 | `identity`도 trim하며 숫자 문자열화·null 생략 발생 |
| Collection | required·계정 일치·페이지 전체 개수·중복·학기 검증 부족 |
| Schedule parser | 전체 문자열 소비·숫자 범위 검증 부족 |
| Policy | 수집 결과의 `course_code`가 schedule field allowlist에 명시되지 않음 |
| 실행 잠금 | PLAN의 OS advisory lock 미구현 |
| Timeout | 전체 scheduled 실행 timeout 부재 |
| Git | pending commit 및 정책 변경 시 published history 재검증 부재 |
| Git | 현재 branch 검증 부족, 공유 저장소의 무관한 pending commit 전송 가능성 |
| Git | staged diff 검사 범위가 게시 경로로 제한되지 않음 |
| Git | `ls-remote`로 얻은 원격 commit 객체가 로컬에 없으면 비교 실패 가능 |
| Masking | `always_deny` 목록 자체를 강제하지 않음 |
| Leak check | 잘못된 정규식을 무시하며 짧은 원본 민감값 검사 누락 |
| State | 이전 오류가 남을 수 있고 sync/publish 상태 구분 불완전 |
| Auth | `auth:status`는 네트워크 접근과 쿠키 갱신을 수행하므로 read-only가 아님 |
| Auth 문구 | 일부 주석·출력이 파일 vault를 Keychain vault로 잘못 설명 |
| Credentials | setup Python 스크립트가 runtime override 대신 example 설정만 읽음 |
| Tests | 기존 fixture에 실제 식별값·시간표 예시 포함 |
| Tests | publish test가 캐시된 settings 객체를 직접 수정 |
| Discovery | 일부 스크립트가 실제 화면 텍스트를 출력할 수 있음 |
| 문서 | README의 게시 경로·공개 범위 설명이 현재 구현과 다름 |
| launchd 문서 | bootout 후 plist가 남으면 다음 로그인에 재로드될 수 있다는 설명 부족 |

판정 원칙:

- 웹의 path 검증·read-only 보장은 웹 완료 전 필수다.
- 기존 수집 정확성·Git 안전성 결함을 웹 UI로 해결된 것처럼 표시하지 않는다.
- 전체 Task1의 보안·정확성 완료를 이번 웹 확장으로 새로 선언하지 않는다.
- 실제 식별값 fixture는 구현 단계의 테스트 정비에서 합성 값으로 교체하되 운영 데이터를 수정하지 않는다.

## 4. 재사용 모듈과 최소 리팩터링

### 4.1 재사용 표

| 기존 모듈 | 활용 |
|---|---|
| `config.mjs: loadSettings()` | 시작 시 설정 읽기 |
| `config.mjs: layoutOf()` | 고정 PRIVATE 경로 계산 |
| `normalize.mjs: canonicalJson(), sha256Hex()` | 현재 정책 해시 식별 등 순수 처리 |
| collection policy | LOCAL 조회 승인 필드와 스키마 참고 |
| `query/db.mjs`의 검색 로직 | 순수 함수로 추출 |
| `query/db.mjs`의 SOURCE_PAGE | 공통 출처 registry로 이동 |
| `state.mjs`의 파일 구조 | 읽기 전용 status adapter에서 소비 |

다음 모듈·기능은 웹에서 호출하지 않는다.

```text
auth/*
collect/*
cli/sync.mjs
cli/publish.mjs
cli/run-scheduled.mjs
publish/git.mjs
storage/snapshot.mjs의 쓰기 함수
ensureDataLayout()
writeState()
```

### 4.2 예정 파일 구조

```text
src/
├── storage/
│   └── reader.mjs             # 검증된 read-only snapshot/state reader
├── query/
│   ├── db.mjs                 # 기존 CLI 진입점 유지
│   ├── service.mjs            # 순수 profile/courses/search 조회
│   ├── source.mjs             # 출처 registry와 locator
│   ├── status.mjs             # 최신성·실행·게시 상태 투영
│   └── timetable.mjs          # 주차 필터·충돌 판정·표시 모델
└── web/
    ├── server.mjs             # HTTP 서버 진입점
    ├── security.mjs           # 접근 키·Host/Origin·보안 헤더
    ├── view-model.mjs         # 브라우저 전달용 명시적 DTO
    └── public/
        ├── index.html
        ├── app.mjs
        ├── api.mjs
        ├── components.mjs
        ├── pages/
        │   ├── overview.mjs
        │   ├── profile.mjs
        │   ├── courses.mjs
        │   ├── schedule.mjs
        │   └── search.mjs
        └── styles/
            ├── tokens.css
            ├── layout.css
            ├── components.css
            └── timetable.css
```

- 파일 수를 맞추기 위한 과도한 분리는 하지 않는다.
- `service/source/timetable`은 Node·브라우저 공용 순수 ESM으로 작성한다.
- 브라우저용 공개는 이 파일들만 명시적 asset map으로 허용한다.
- 프로젝트 디렉터리를 통째로 정적 서빙하지 않는다.
- 공용 모듈은 파일시스템·프로세스·네트워크에 의존하지 않는다.

## 5. Read-only 데이터 흐름

```text
npm run web
  → 설정·현재 정책 읽기
  → 127.0.0.1에 HTTP listen
  → PRIVATE 파일 생성/수정 없음

브라우저 연결
  → 빈 HTML shell
  → 로컬 접근 키 확인
  → GET /api/view
      → current ID 한 번 선택
      → 해당 snapshot의 네 파일 읽기
      → 경로·타입·연결·학기 검증
      → state 읽기
      → 승인 필드로 DTO 생성
  → 브라우저 메모리에서 화면·검색·주차 필터 구성
```

### 5.1 Snapshot reader 계약

```text
readDashboardData(settings)
  → snapshot | null
  → state | null
  → diagnostics[]
  → observedAt
```

검증 순서:

1. PRIVATE root와 snapshot root의 실제 경로 확인.
2. `current.json`을 제한된 크기로 읽기.
3. ID는 ASCII 영숫자·하이픈, 길이 1~128로 제한.
4. ID로만 snapshot 경로 생성.
5. 디렉터리 및 네 파일의 symlink·경로 이탈 차단.
6. 각 파일은 regular file만 허용.
7. manifest ID와 선택 ID 일치 확인.
8. 지원 스키마 확인.
9. 필수 컨테이너·타입·배열·count 확인.
10. 학기 일치, record key 중복, meeting 연결 검사.
11. 현재 collection allowlist를 적용해 제거된 필드가 조회로 재노출되지 않게 함.

초기 제한:

- pointer: 4 KiB
- state: 256 KiB
- snapshot 파일: 각 10 MiB
- 초과 시 일부만 자르지 않고 명시적 오류

### 5.2 오류를 숨기지 않는 판정

전체 snapshot 조회 차단:

- 잘못된 current
- 경로 이탈·symlink
- 잘못된 JSON
- 파일 누락
- 지원하지 않는 스키마
- manifest ID 불일치
- 영역 간 학기 불일치

부분 경고와 상세 확인 허용:

- 선택 필드 미제공
- 연결되지 않은 meeting
- 표시할 수 없는 교시·주차
- 정책 해시 불일치
- state 손상·부재

잘못된 meeting은 정상 그리드에 배치하지 않고 “확인 필요 일정” 목록에 남긴다. 조용히 버리지 않는다.

### 5.3 수집과 조회의 동시성

- 한 응답은 하나의 snapshot에 고정한다.
- 파일마다 current를 다시 읽지 않는다.
- 읽는 도중 이전 snapshot이 prune되면 전체 읽기를 한 번 재시도한다.
- 재시도도 실패하면 `SNAPSHOT_UNAVAILABLE`로 종료한다.
- 이전 snapshot과 새 snapshot의 파일을 섞어 응답하지 않는다.
- 웹 reader가 snapshot writer의 잠금 방식·보관 동작을 변경하지 않는다.

브라우저에는 전체 응답을 원자적으로 교체한다. 갱신 실패 시 이전 표시를 유지하되 “이전 읽기 결과 — 새로 읽기 실패”를 명확히 표시한다.

### 5.4 새 데이터 반영

- 최초 접속과 명시적 “저장 데이터 다시 읽기”에서 `/api/view` 호출.
- MVP에서는 자동 polling·SSE·파일 watcher를 추가하지 않는다.
- 버튼 아래 설명: “ehall 수집이 아니라 저장된 파일만 다시 읽습니다.”
- 실제 표시 snapshot ID와 읽은 시각을 확인할 수 있게 한다.

## 6. 서버/API 설계

### 6.1 허용 route

| Method / route | 동작 |
|---|---|
| `GET /` | 개인정보 없는 HTML shell |
| `GET /assets/<명시된 파일>` | 프로젝트 내부 고정 asset만 제공 |
| `GET /api/view` | 검증된 snapshot DTO와 status 제공 |

- API는 로컬 접근 키 필수.
- GET 이외 API method는 `405`.
- 알 수 없는 route는 `404`.
- 외부 origin preflight를 승인하지 않는다.
- 임의 `file`, `path`, `command`, 과거 snapshot 요청 parameter는 제공하지 않는다.
- 검색어·학번·record key를 URL에 넣지 않는다.

### 6.2 응답 구조

```text
api_version
observed_at
snapshot
  snapshot_id
  schema_version
  term
  source_system
  snapshot_collected_at
  profile
  courses
  meetings
status
  last_attempt_at
  last_successful_collection_at
  freshness
  sync
  publish
capabilities
  period_times
  calendar_week_mapping
  exceptions
diagnostics[]
```

- snapshot이 없으면 `snapshot: null`과 명시적 상태를 제공한다.
- 손상된 snapshot은 안전한 오류 코드로 응답한다.
- state의 `gitApproved`, 원격 URL, raw error message, shell output을 통째로 전달하지 않는다.
- 원본과 normalized를 중복으로 모두 전송하지 않는다. 검색용 정규화는 공용 순수 함수에서 수행한다.
- manifest hash 존재만으로 “무결성 검증 완료”라고 표시하지 않는다.

### 6.3 실행 수명

향후 제공 명령:

```bash
npm run web
```

- 기본 port `4317`.
- 필요 시 port만 옵션으로 변경 가능.
- bind 주소를 외부 주소로 바꾸는 옵션은 제공하지 않는다.
- port 충돌이면 설명 후 종료. 임의 fallback 금지.
- `Ctrl+C` 시 HTTP 서버 종료 및 메모리 접근 키 폐기.
- 웹 종료는 기존 launchd 수집 작업에 영향을 주지 않는다.
- 브라우저를 닫아도 서버는 터미널에서 종료할 때까지 남는다고 문서화한다.

## 7. LOCAL TRUSTED 보안 경계

### 7.1 위협 모델

보호 대상:

- PRIVATE 프로필·수강·시간표
- 로컬 source key
- state의 운영 메타데이터

차단 목표:

- LAN 접근
- 다른 웹사이트에서 localhost API 읽기
- DNS rebinding
- 경로 탈출
- snapshot 문자열을 통한 XSS
- 로그·캐시·외부 리소스를 통한 노출

보장하지 않는 것:

- 같은 macOS 사용자 권한의 악성 프로세스 차단
- 악성 브라우저 확장 차단
- root·디버거·메모리 접근 차단
- 사용자의 스크린샷·복사 후 공유 통제

`127.0.0.1`과 파일 권한은 완전한 사용자 간 sandbox가 아니다. 기존 `plan.md`의 threat model을 그대로 따른다.

### 7.2 접근 방어

1. IPv4 loopback에만 bind: `127.0.0.1`. `0.0.0.0`, `::`, LAN IP 금지.
2. Host 검증: 현재 `127.0.0.1:<port>`만 허용. `localhost` alias도 기본 미허용. DNS rebinding용 다른 host 거부.
3. 실행당 임시 접근 키:
   - 암호학적 난수 생성.
   - 로컬 시작 터미널에서만 사용자에게 안내.
   - 브라우저 연결 화면에 입력.
   - URL·argv·파일·지속 로그에 저장하지 않음.
   - 브라우저 메모리에만 보관.
   - API custom header로 전달.
   - 재시작 시 무효화.
4. Origin / Fetch Metadata:
   - 외부 Origin 거부.
   - cross-site 요청 거부.
   - Origin 없는 요청도 API 접근 키 없이는 불허.
   - CORS 허용 헤더를 제공하지 않음.

### 7.3 브라우저 방어

- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `frame-ancestors 'none'`
- `Cross-Origin-Resource-Policy: same-origin`
- CSP: script/style/connect는 self만, inline script·eval 금지, 외부 font/image/connect 금지, object·frame·form submission 금지.

추가 원칙:

- 데이터는 `textContent` 또는 안전한 DOM node로 렌더링.
- snapshot 문자열을 `innerHTML`에 넣지 않음.
- 검색 강조도 text node와 `<mark>`로 구성.
- 데이터에 포함된 URL을 자동 링크로 만들지 않음.
- telemetry·analytics·CDN·웹폰트·service worker 없음.
- localStorage에는 테마 값만 저장.
- 검색어·개인정보·접근 키는 persistent browser storage에 저장하지 않음.
- API 본문·검색어·접근 키를 서버 로그에 기록하지 않음.
- 프로젝트 전체, `config/`, `private/`, `.git/`, `auth/` 정적 접근 금지.

웹은 Keychain과 cookie vault를 읽을 이유가 없다.

## 8. 정보 구조와 시각 디자인

### 8.1 디자인 방향

차분한 개인 학사 워크스페이스를 목표로 한다.

- 넓은 여백
- 절제된 색상
- 선명한 정보 계층
- 얇은 경계선
- 과하지 않은 그림자
- 일관된 카드·상태 배지·타이포그래피
- 원본 확인이 필요한 경우에만 세부 정보 펼치기

과한 gradient, glassmorphism, 배경 animation, 장식용 chart는 사용하지 않는다.

### 8.2 Desktop layout

```text
┌────────────────┬──────────────────────────────────────┐
│ Task1          │ 페이지 제목          테마 / 다시 읽기 │
│ Local Academic │ 학기 · LOCAL TRUSTED · READ ONLY      │
│                ├──────────────────────────────────────┤
│ Overview       │ stale / 오류 / 정책 경고              │
│ Profile        │                                      │
│ Courses        │ 주요 내용                             │
│ Schedule       │                                      │
│ Search         │                          Source Drawer│
│                │                                      │
│ 로컬 전용      │ snapshot · 저장 파일 읽은 시각        │
└────────────────┴──────────────────────────────────────┘
```

- Sidebar: 약 224px
- Header: 약 72px
- Main padding: desktop 32px, mobile 16px
- 일반 화면 최대 폭: 약 1280px
- Source Drawer: desktop 420~480px
- URL hash에는 `#/overview` 같은 페이지명만 사용
- 검색어·개인 record key는 browser history에 기록하지 않음

### 8.3 디자인 토큰

| 항목 | 기준 |
|---|---|
| 배경 | Light `#F6F7FB`, Dark `#10141D` |
| Surface | Light white, Dark `#181F2B` |
| Accent | Indigo 계열 |
| 보조 색 | Teal, Blue, Violet, Amber |
| 본문 | 15px / line-height 약 1.6 |
| 제목 | 28~32px |
| 보조 텍스트 | 13px 이상 |
| 간격 | 4, 8, 12, 16, 24, 32, 48px |
| 카드 radius | 14~16px |
| 컨트롤 radius | 8~10px |
| 인터랙션 | 약 120~180ms |
| 폰트 | 시스템 한·중·영문 fallback |
| ID·source | 시스템 monospace |

색상 값은 구현 후 Light/Dark 각각 대비 검증한다. 상태는 색상뿐 아니라 아이콘·텍스트로 구분한다.

### 8.4 공통 컴포넌트

```text
AppShell
Sidebar / MobileNavigation
PageHeader
TrustBadge
StatusBadge
FreshnessBanner
MetricCard
FieldList
CourseTable / CourseCard
WeekSelector
TimetableGrid
MeetingCard
AgendaList
SearchInput
SearchResultGroup
SourceButton
SourceDrawer
EmptyState
ErrorState
Skeleton
```

### 8.5 접근성·responsive

- 1024px 이상: sidebar + table/grid
- 640~1023px: 축소 navigation + 유동 layout
- 640px 미만: mobile navigation, Courses 카드, Schedule agenda 기본
- 375px에서도 본문 전체 가로 overflow 금지
- 시간표 grid는 사용자가 선택했을 때만 내부 가로 스크롤
- 모든 기능 키보드 접근 가능
- focus ring 유지
- drawer/dialog focus trap, Escape 닫기, 원래 버튼으로 focus 복원
- touch target 약 44px
- `prefers-reduced-motion` 준수
- 긴 이름은 줄바꿈과 상세보기 제공, tooltip만으로 전체 정보 제공하지 않음

## 9. 화면별 상세 설계

### 9.1 Overview

첫 화면은 개인정보 전체를 펼치기보다 데이터 상태와 학사 요약을 보여준다.

상단:

- 현재 snapshot의 학기
- LOCAL TRUSTED / READ ONLY 배지
- “ehall 실시간 연결이 아닌 저장된 자료” 안내

상태 카드:

1. 수강 과목 수
2. 학점 합계
3. 마지막 정상 수집
4. 마지막 수집 시도

학점 합계는 유효한 숫자 값만 집계한다. 일부 값이 해석되지 않으면 “확인 가능한 학점 합계”로 표시한다.

상태 패널:

- freshness
- 최근 sync 결과
- 마지막 게시 시도
- 기록된 GitHub push 결과
- snapshot 생성 시각
- 웹에서 마지막으로 읽은 시각

표현 금지:

- 과거 `running` 기록만으로 “지금 수집 중” 확정
- 과거 push 성공만으로 “현재 GitHub와 동기화 완료” 확정
- 설정에 08/20시가 있다는 이유로 “launchd 활성” 확정

GitHub 상태에는 항상 “마지막 기록 기준, 실시간 확인 아님”을 표시한다.

### 9.2 Profile

- 기본 정보: 이름·학번
- 학사 정보: 전공·학년·반·단과대 코드
- 추가 승인 필드: 접을 수 있는 영역
- 내부 식별자는 기본 정보보다 덜 강조된 세부 영역
- 원본은 LOCAL TRUSTED에서 마스킹 없이 표시
- 학번 앞자리 0 및 원본 문자열 보존
- 빈 문자열과 미제공을 구분
- 미제공 필드를 `0`, “없음”, 추정 이름으로 치환하지 않음
- 각 필드 또는 그룹에 Source 버튼 제공

### 9.3 Courses

| 열 | 데이터 |
|---|---|
| 수업명 | `JXBMC`, 원문 그대로 |
| 코드 | `KCH` |
| 분반 | 별도 값 미제공 표시 |
| 학점 | `XF` |
| 교수 | `SKJS` |
| 개설 단위 | `PKDWDM_DISPLAY` |
| 선택 유형 | `XKLY_DISPLAY` |
| 수강 상태 | 미제공 |
| 출처 | 상세 열기 |

행 확장:

- `JXBID`
- 수업시간 원문 `ZCXQJCDD`
- 연결된 meeting
- record key
- 기타 실제 수집된 승인 필드

정렬·검색은 메모리에서만 수행한다. 과목명에서 정규식으로 분반을 임의 추출하지 않는다.

### 9.4 Schedule

구체적인 그리드·주차·충돌 규칙은 10절을 따른다.

### 9.5 Search

- 명시적 검색 화면과 header 검색 진입
- 입력 debounce 약 150ms
- 검색어 최대 200자
- 문자열 부분 검색, Unicode 정규화·대소문자 처리 공용화
- 정규식 실행·외부 API·검색 DB 없음

대상:

- 수업명
- 코드
- 교수
- 개설 단위
- 선택 유형
- 강의실
- course key

기존 CLI의 과목·meeting 검색 범위를 우선 유지한다. Profile 전체 검색은 이번 MVP에서 추가하지 않는다.

```text
과목 결과
  제목 / 코드 / 일치한 필드 / Source

시간표 결과
  과목 / 요일 / 교시 / 주차 / 장소 / Source
```

- 과목명 검색으로 연결 meeting도 탐색 가능
- 검색 결과에서 해당 화면 및 source drawer로 이동
- 대량 결과는 50건 단위 표시
- 검색 실패와 결과 없음 구분

### 9.6 Source Detail

독립 메뉴 대신 모든 화면에서 여는 drawer로 구현한다. Mobile에서는 full-screen dialog로 전환한다.

```text
snapshot_id
local_file
record_key
json_pointer
source_system
source_page
derived_from
```

- `local_file`은 `profile.json` 같은 상대 파일명
- OS 절대 경로·파일 열기 기능 없음
- `source_page`는 확인된 공통 registry 사용
- 수집하지 않은 레코드별 URL을 만들지 않음
- 일정이 파생 데이터라는 사실 표시
- 과목명과 일정이 함께 쓰이면 두 레코드 모두 인용

## 10. Timetable 구현 명세

### 10.1 기본 형태

Desktop:

- 월~일 7열
- 행은 교시
- 각 교시 높이 약 48~56px
- 요일 header와 교시 label sticky
- 과목별 일관된 accent 색상
- meeting card에 과목·교시·강의실·주차 표시

현재 실제 시각이 없으므로 `3–4교시`로 표시하며 `10:00–11:40` 같은 시간을 만들지 않는다.

### 10.2 주차 선택

- 기본: 학기 전체 배치
- 선택: 1주, 2주, … 수집된 범위
- 현재 주차 자동 선택 없음
- 개강일이 없으므로 “이번 주”라고 표시하지 않음

```text
week_start ≤ 선택 주차 ≤ week_end

week_type = all   → 포함
week_type = odd   → 홀수 주차만
week_type = even  → 짝수 주차만
```

범위가 잘못되었거나 `week_type`이 미지원이면 확인 필요 일정으로 보낸다.

### 10.3 과목 연결

1. `meeting.course_key`와 `course.record_key` 정확 일치
2. 코드만으로 연결할 경우 해당 snapshot에서 유일한지 확인
3. 중복이면 임의 연결 금지
4. 연결 실패 시 코드·일정을 그대로 보여주고 경고

동일 과목 코드의 다른 분반을 합치지 않는다.

### 10.4 겹침과 충돌

- 교시·요일이 겹치면 별도 lane으로 배치
- 카드가 서로 덮어 가리지 않음
- 실제 충돌은 주차 조건까지 겹칠 때만 판정
- 홀수/짝수 주가 서로 배타적이면 충돌 아님
- 전체 학기 화면에서 자리만 겹치는 경우는 “주차별 배치”로 표현
- 단일 교시 inclusive 범위를 layout용 half-open 범위로 변환해 계산

주차는 유한한 정수 집합으로 평가한다. 시각화 과정에서 데이터를 합치거나 수정하지 않는다.

### 10.5 Mobile agenda

```text
월요일
  3–4교시  수업명
  장소 · 1–16주 · 홀수 주

화요일
  …
```

- 주차 selector 상단 유지
- 수업 없는 날은 접을 수 있음
- 별도 주간 그리드 전환 제공
- agenda와 grid는 같은 meeting 모델 사용

### 10.6 보강·휴강·예외 일정

현재 데이터에는 구조화된 예외 일정이 없다.

MVP 표기:

> 보강·휴강·예외 일정은 현재 수집 자료에 포함되어 있지 않습니다. 일정이 없다고 확인된 것은 아닙니다.

이번 범위에서 하지 않을 일:

- 새로운 ehall API 탐색
- 원문에서 보강·휴강을 임의 추정
- 비공식 개강일 설정
- 임의 날짜 event 생성
- 새로운 snapshot schema 도입

예외 표현을 위한 배지 시각 디자인은 정의하되, 실제 활성화는 향후 검증된 수집 계약이 있을 때 별도 승인으로 진행한다.

## 11. Source 연결과 검색 공통 계약

### 11.1 레코드 식별

- Profile: 고정 singleton locator
- Course: 기존 record key + snapshot 내 array index
- Meeting: course key + snapshot 내 meeting index

기존 meeting에 고유 ID가 없으므로 `snapshot_id + local_file + json_pointer`로 구분한다.

예:

```text
schedule.json
/meetings/0
```

index locator는 해당 snapshot에서만 유효하다. snapshot 간 안정적인 meeting ID라고 주장하지 않는다.

### 11.2 출처 참조

```text
Source A
  schedule.json
  /meetings/<index>

Derived from
  courses.json
  /list/<index>/source/ZCXQJCDD

Course title
  courses.json
  /list/<index>/source/JXBMC
```

프로필 식별값이나 record key는 로컬 상세에만 표시하고 URL·로그에 넣지 않는다.

### 11.3 CLI 호환성

- 기존 명령 유지
- 기존 결과의 주요 키 유지
- 기존 정상 조회가 동일한 업무 값을 반환하도록 golden test 추가
- 추가 metadata는 호환성을 검토하여 도입
- 검색 입력 정규화·매칭 규칙을 CLI/Web에서 한곳에 정의
- 웹이 CLI subprocess를 실행하는 방식은 금지

## 12. Status와 stale 판정

### 12.1 시각 의미

| UI 항목 | 근거 |
|---|---|
| Snapshot 생성 당시 수집 | `manifest.collected_at` |
| 마지막 정상 수집 | 호환되는 `state.lastCollectedAt` |
| 마지막 수집 시도 | `state.lastRunAt` |
| 마지막 게시 시도 | `state.lastPublishAt` |
| 웹에서 읽은 시각 | 서버 응답 `observed_at` |

`updatedAt`은 state의 어떤 갱신에도 바뀔 수 있으므로 마지막 정상 수집 시각으로 사용하지 않는다.

state의 snapshot ID·학기 정보가 현재 snapshot과 맞지 않으면 최신성 근거로 무조건 채택하지 않는다.

### 12.2 Freshness

초기 UI 기준: 마지막 정상 수집 후 26시간. 대시보드의 표시 기준이며 수집 일정을 바꾸지 않는다.

| 상태 | 조건 |
|---|---|
| fresh | 신뢰 가능한 마지막 정상 수집이 26시간 이내 |
| stale | 26시간 초과 |
| unknown | 정상 수집 시각 부재·손상·state 불일치 |
| clock-warning | 시각이 현재보다 비정상적으로 미래 |
| no-snapshot | 표시할 snapshot 없음 |

- 최신 sync 실패와 freshness는 별개로 표시
- 마지막 실패 후에도 최근 정상 데이터가 있을 수 있음
- 오래된 snapshot이라도 최근 no-change 수집 성공이면 fresh
- 최신 정책과 다르면 freshness와 별도로 정책 경고 표시
- 웹을 다시 읽은 시각을 수집 시각으로 오인시키지 않음

### 12.3 운영 상태의 한계

`running`은 실행 중 상태 파일 기록일 뿐이다.

```text
마지막 기록: 실행 중
현재 프로세스 생존 여부는 확인하지 않음
```

GitHub도 `lastPublishPush.pushed/reason`의 허용된 값만 사람이 읽기 좋은 상태로 변환한다. raw stderr는 브라우저에 전달하지 않는다.

## 13. Loading / Empty / Error / Stale UX

| 상태 | UI |
|---|---|
| 초기 로딩 | 카드·표 구조를 유지한 skeleton |
| 접근 키 없음 | 개인정보 없는 연결 화면 |
| snapshot 없음 | “저장된 snapshot이 없습니다” + 터미널 사용 안내 |
| current 손상 | “현재 데이터 위치를 읽을 수 없습니다” |
| 빈 courses | “이 snapshot에 저장된 과목이 없습니다” |
| 빈 schedule | “구조화된 수업 일정이 없습니다” |
| 검색 결과 없음 | 검색어 재입력 안내 |
| stale | amber banner와 마지막 정상 수집 시각 |
| state 없음 | 학사 자료는 표시, 운영 상태는 unknown |
| 정책 불일치 | 재수집 필요 가능성 안내, 웹 자동 실행 없음 |
| 서버 종료 | 연결 끊김 표시, 자동 수집·서버 재시작 없음 |
| 다시 읽기 실패 | 이전 화면 유지 + 실패 시각·배너 |

빈 결과를 “이번 학기에 수강하지 않음” 또는 “수업 없음 확정”으로 과장하지 않는다.

복구 안내는 텍스트로만 제공한다. 웹에 `Sync now`, `Publish`, `Login`, `Start agent`, `Delete` 버튼을 만들지 않는다.

## 14. 테스트 전략

### 14.1 실행 원칙

- 합성 데이터만 사용
- 실제 snapshot을 fixture로 복사하지 않음
- 실제 Keychain·ehall·GitHub 접근 금지
- 임시 dataHome·임시 HOME·임시 Git remote 사용
- settings는 복제하여 테스트 간 공유 변이 차단
- 브라우저 screenshot도 합성 데이터만 사용

### 14.2 Backend / reader

- 정상 current snapshot
- snapshot 없음
- current JSON 손상
- 잘못된 ID·길이 초과
- `../`, 역슬래시, 인코딩 경로 탈출
- symlink·non-regular file
- 파일 누락·과대 JSON
- manifest ID·schema·학기 불일치
- count 불일치
- state 없음·손상
- 정책 변경 후 제거 필드 미반환
- 읽는 중 current 교체
- 읽는 중 이전 snapshot 삭제
- 응답 내 snapshot 혼합 없음

### 14.3 API 보안

- bind address가 정확히 `127.0.0.1`
- IPv6 wildcard·LAN listen 없음
- 허용 Host 외 거부
- 외부 Origin·cross-site 요청 거부
- 키 없음·오류 키 거부
- 재시작 후 이전 키 거부
- POST/PUT/PATCH/DELETE 거부
- `/config`, `/.git`, `/private`, `/auth` 접근 거부
- API 캐시 금지·CSP 검증
- 로그에 query·token·개인 값 없음
- XSS 문자열이 실행되지 않고 텍스트로 표시
- frontend 외부 요청 0건

### 14.4 Timetable

- 빈 schedule
- 단일·복수 meeting
- 주차 구간 경계
- 홀수·짝수 주
- 단일 주
- 겹치는 교시
- 주차가 배타적인 일정은 충돌 아님
- 같은 코드·다른 분반
- 강의실 미제공
- 잘못된 교시·주차
- 연결 불가능한 course key
- 긴 과목명·한중영 혼합
- 실제 시각·현재 주차를 임의 생성하지 않음

보강·휴강 테스트는 현재 미지원 상태를 명확히 표현하는지 검증한다.

- 예외 정보 부재를 “없음 확정”으로 표시하지 않음
- 합성 원문에 보강·휴강 표현이 있어도 일반 정규 수업으로 조용히 변환하지 않음
- 미지원 구조를 임의 적용하지 않고 확인 필요 상태로 처리
- 향후 지원 테스트와 현재 구현 완료 테스트를 혼동하지 않음

### 14.5 Query / Source / Status

- CLI/Web 검색 결과 일치
- 중국어·한국어·영문 검색
- 앞자리 0 보존
- 특수문자 안전 처리
- source가 실제 snapshot 레코드를 재식별
- meeting 출처와 과목명 출처 둘 다 제공
- source drawer가 다른 snapshot으로 이동하지 않음
- 26시간 stale 경계
- 최근 no-change 성공은 fresh
- 실패 상태와 freshness 분리
- 미래 timestamp 경고
- state 불일치 시 unknown

### 14.6 Read-only 증명

테스트 전후 비교:

```text
PRIVATE snapshot
current.json
state
auth/vault
public-data
Git HEAD/index
LaunchAgent plist
```

- 파일 내용·mtime·권한·디렉터리 목록 불변
- mkdir/chmod/write/rename/unlink 호출 없음
- Keychain·auth·collector·Git·launchctl subprocess 호출 없음
- 서버 시작·모든 화면·검색·source 열기·새로 읽기·종료 모두 포함

파일 atime은 OS의 읽기 정책으로 바뀔 수 있으므로 application write 증거와 구분한다.

### 14.7 Regression

| 영역 | 검증 |
|---|---|
| CLI | 기존 명령·결과·출처 유지, 조회의 부수효과 제거 |
| Sync | 합성 수집 payload의 snapshot·hash 결과 불변 |
| Publish | 기존 마스킹 출력·임시 remote 테스트 유지 |
| Git | 실제 origin 접근 없이 임시 저장소에서 검증 |
| launchd | plist 일정·기존 진입점 불변 |
| Agent script | mocked launchctl로 제어 메시지 유지 |
| 웹 종료 | 수집 일정·자동화 상태에 영향 없음 |

실제 LaunchAgent를 start/stop/remove하여 regression을 검사하지 않는다.

### 14.8 UI 검수

- Desktop 1440×900
- Tablet 768×1024
- Mobile 375×812
- Light/Dark
- 키보드만으로 화면 탐색
- 200% 확대
- loading·empty·error·stale
- drawer focus 복원
- 긴 텍스트·다량 과목·일정 충돌

브라우저 자동화가 필요한 구현 단계에는 해당 브라우저 도구 지침을 읽은 후 진행한다.

## 15. README / USAGE 변경 계획

향후 구현 완료 시 다음을 문서화한다.

### 추가

- `npm run web` 시작 방법
- 로컬 접속 주소와 임시 접근 키 사용
- `Ctrl+C` 종료
- 웹과 launchd의 독립성
- “저장 데이터 다시 읽기”와 sync의 차이
- 원본 개인정보가 브라우저에 표시된다는 경고
- snapshot·state·freshness의 의미
- 교시·주차·예외 일정 한계
- LOCAL TRUSTED threat model
- 원격 접근·port forwarding·외부 배포 금지

### 정정

- 실제 게시 경로는 공유 저장소의 `Lab 1/Task1/public-data`
- 현재 공개 정책과 README의 구형 설명 차이
- cookie vault가 평문 보호 파일이라는 사실
- 세션 수명·자동 갱신을 보장할 수 없다는 사실
- `bootout`과 영구 제거의 차이
- 기존 Git 이력 검사 기능이 완전하다는 과장 제거

원래 `plan.md`를 조용히 재작성하지 않는다. 실제 구현과 다른 부분은 현재 운영 문서 및 별도 결함 목록에서 명확히 연결한다.

## 16. 구현 순서와 단계별 Gate

### Phase 1 — 재사용 계약 확정

작업:

1. 현재 snapshot v2의 읽기 계약 고정
2. 수집 가능한 필드·미제공 capability 명시
3. CLI 출력 characterization test 추가
4. 실제 식별값 fixture를 합성 값으로 교체
5. reader·query·status 분리 범위 확정

Gate:

- 운영 파일 변경 없음
- 웹 요구 때문에 collector/publisher를 재설계하지 않음
- 미제공 데이터 해석이 문서와 테스트에 고정됨

### Phase 2 — Read-only backend/API

작업:

1. 검증된 reader
2. typed error·status projection
3. loopback 서버
4. 접근 키·Host/Origin·asset allowlist
5. `/api/view`

Gate:

- snapshot 없음에서도 서버 시작 가능
- 모든 API 요청에 쓰기·외부 통신 없음
- path traversal·XSS·외부 origin 테스트 통과

### Phase 3 — Overview / Profile / Courses

작업:

1. 디자인 토큰과 AppShell
2. 연결·loading·error 상태
3. Overview 상태 카드
4. Profile field list
5. Courses table/card

Gate:

- 실제 미제공 필드를 추정하지 않음
- 최신성 시각 구분 정확
- Mobile·Dark mode 기본 동작

### Phase 4 — Schedule / Search / Source

작업:

1. 순수 timetable 모델
2. 주차 필터·충돌 판정
3. Desktop grid·Mobile agenda
4. 공통 검색
5. source drawer·레코드 연결

Gate:

- 주차·홀짝·겹침 정확
- source 재식별 가능
- 예외 일정 미지원 한계가 명확함

### Phase 5 — UI polish

작업:

1. 여백·밀도·타이포그래피 조정
2. 긴 데이터·빈 상태 정리
3. responsive 완성
4. 키보드·focus·contrast
5. skeleton·짧은 transition·reduced motion

Gate:

- 합성 데이터 기준 모든 지정 viewport 검수
- 디버그 JSON 페이지처럼 보이지 않음
- 아름다움을 위해 정확한 정보를 숨기지 않음

### Phase 6 — 보안·Regression·문서

작업:

1. read-only 불변성 검증
2. CLI·sync·publish·Git·launchd regression
3. 외부 요청 0건 확인
4. README/USAGE 갱신
5. 미해결 기존 결함 별도 보고

Gate:

- 웹의 기능 완료와 기존 Task1 결함을 구분하여 보고
- 사용자가 승인한 경우에만 로컬 실제 snapshot으로 수동 확인
- 실제 개인정보 screenshot·fixture·외부 tool transcript 생성 금지

## 17. 최종 완료 기준

### 기능

- [ ] Overview / Profile / Courses / Schedule / Search 제공
- [ ] 모든 데이터는 기존 PRIVATE current snapshot에서 읽음
- [ ] source가 표시 레코드와 정확히 연결됨
- [ ] 빈 데이터·손상 데이터·state 없음 처리
- [ ] 최신 확인·정상 수집·snapshot 생성 시각 구분
- [ ] 미수집 정보는 미제공·미확인으로 표현

### 정확성

- [ ] 응답당 하나의 snapshot만 사용
- [ ] 학번·코드의 원본 문자열 보존
- [ ] 분반·상태·시각·개강일을 추정하지 않음
- [ ] 홀짝·주차 필터와 충돌 판정 정확
- [ ] 보강·휴강 지원을 허위로 주장하지 않음

### Read-only·보안

- [ ] `127.0.0.1`에만 bind
- [ ] 외부 사이트·잘못된 Host·접근 키 없는 API 접근 차단
- [ ] PRIVATE·state·auth·public-data·Git·plist 변경 없음
- [ ] Keychain·ehall·GitHub·launchctl 호출 없음
- [ ] 로그·URL·browser persistent storage에 개인 값 저장 없음
- [ ] CDN·analytics·telemetry·외부 요청 없음
- [ ] same-user sandbox 한계 문서화

### UI/UX

- [ ] 차분하고 일관된 개인 대시보드 디자인
- [ ] Desktop grid와 Mobile agenda 사용 가능
- [ ] Light/Dark/System 지원
- [ ] loading·empty·error·stale 완성
- [ ] 긴 데이터·source detail·키보드 접근성 검증

### Regression·운영

- [ ] CLI query 공통 로직 재사용
- [ ] 기존 수집·게시·launchd 실행 계약 유지
- [ ] 합성 데이터 기반 테스트 통과
- [ ] 실행·종료·복구 문서 제공
- [ ] 기존 미해결 결함 별도 명시

## 구현 Agent에게 전달할 최종 지침

기존 Task1은 데이터 생산자이며, 웹은 읽기 전용 소비자다.

기존 JSON 저장소 위에 작고 안전한 조회 계층과 정돈된 UI만 추가한다. 조회 화면을 열기 위해 인증·수집·게시·Git·launchd를 실행하지 않는다. 저장되지 않은 시간·분반·상태·예외 일정을 만들어 내지 않는다.

read-only와 정확성 Gate를 먼저 통과한 후 미관을 다듬는다. 발견한 기존 결함은 필요한 최소 읽기 보완과 별도 보수 작업으로 분리한다.
