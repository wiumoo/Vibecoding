# Task1 — 개인 데이터베이스 자동 업데이트 시스템 구현 계획

> 상태: PLAN만 작성. 구현과 Discovery는 아직 실행하지 않았다.
> 대상: https://ehall.nju.edu.cn/
> 이 문서는 사용자 피드백을 반영한 MVP 구현 기준이다. 실제 로그인·페이지·API 구조는 확인되지 않았으며, 관련 선택은 Discovery 결과에 따라 확정한다.

## 1. 목표와 완료 범위

개인 Mac에서 NJU ehall의 다음 자료를 수집하고, 변경 시 자동 갱신하며, Agent가 로컬에서 검색할 수 있도록 한다.

1. 본인 개인정보
2. 이번 학기 선택 과목
3. 이번 학기 시간표·스케줄

핵심 흐름:

```text
launchd 정기 실행
→ ehall 인증 및 조회
→ 세 영역 전체 수집·검증
→ 기존 데이터와 비교
→ 변경 시 완전한 PRIVATE snapshot 게시
→ 승인된 필드만 마스킹 결과 생성
→ leak check
→ 독립 publish repo에서 실제 diff가 있을 때만 commit
→ 미전송 commit을 현재 반출 정책으로 재검증한 뒤 GitHub push
```

원본은 마스킹하지 않고 Git 밖에 저장한다. 단, 원본의 범위는 승인된 업무 필드이며 API 응답 전체가 아니다. GitHub에는 마스킹·반출 정책을 통과한 자료만 저장한다. Private repository도 원본이나 로그인 정보를 저장하는 장소로 사용하지 않는다.

## 2. 확인된 환경과 미확인 사항

### 확인된 환경

| 항목 | 확인 결과 |
|---|---|
| 프로젝트 | `/Users/minwoo/Desktop/minwoo/Vibecoding/Lab 1/Task1` |
| 최초 확인 파일 | `.DS_Store` 외 구현 파일 없음 |
| macOS | 26.6.2, arm64 |
| Python | 3.9.6 |
| Node.js / npm | 26.8.1 / 11.19.0 |
| Git / gh | 2.55.0 / 2.96.0 |
| 시스템 도구 | `security`, `launchctl` 사용 가능 |
| 실제 개발 Git 루트 | `/Users/minwoo/Desktop/minwoo/Vibecoding` |
| 확인 시 개발 Git 상태 | `main...origin/main`, 변경 없음 |
| 기존 루트 ignore | `.DS_Store`, `.env`, `.env.*` 등. PRIVATE·세션 보호 규칙은 없음 |

Task1은 상위 개발 저장소의 하위 디렉터리다. 자동 동기화 프로그램은 개발 저장소에서 commit/push하지 않는다. 개발 저장소의 Git 설정도 자동으로 변경하지 않는다.

### 미확인 사항

- ehall 인증 방식, SSO 도메인, CAPTCHA/MFA, 세션 유지 조건
- 개인정보·과목·시간표 메뉴와 API, 페이지네이션, 현재 학기 판정 방식
- 사이트 자동 조회 관련 정책과 접속 제약
- GitHub 저장소의 Private 여부와 무인 SSH 인증 가능 여부
- launchd에서 Keychain, Desktop 경로, 네트워크에 실제 접근 가능한지

### 스킬 준비 상태

- `find-skills` 지침과 기존 `agent-browser` 스킬 안내를 확인했다.
- 기존 `agent-browser` 스킬은 있으나 실행 파일은 확인 당시 PATH에 없었다.
- 외부 스킬 검색, 패키지 설치, 브라우저 실행은 하지 않았다.
- Discovery 승인 후 필요 시 외부 스킬을 검색하고 출처·품질을 검토한다. 검색 과정에서 도구 다운로드가 필요하면 설치 승인 후 진행한다.
- 사이트 조사에는 기존 `agent-browser` 스킬을 우선 활용하고, 실행 전 해당 버전의 실제 사용 지침을 읽는다. 조사 도구와 운영 수집기의 기술 선택은 별개다.

## 3. MVP 원칙과 기술 결정

### MVP에 반드시 포함

- Git 밖 PRIVATE 저장
- macOS Keychain 자격증명 관리
- 수집 allowlist와 반출 allowlist 분리
- 완전한 snapshot 및 원자적 current 전환
- 의미 기반 변경 감지
- 마스킹, commit 전 leak check, push 직전 현재 정책으로 pending 이력 재검증
- 독립 publish Git repository
- 읽기 전용 Agent 검색 CLI
- launchd 정기 실행과 실패 시 기존 정상 DB 유지

### Discovery 이후 결정

- HTTP / 브라우저 / 브라우저 인증 + HTTP 조회 중 수집 방식
- 운영 도구와 구현 언어
- 세션 저장 여부 및 방식
- 실제 수집 필드, record key, 학기·시간표 구조

Node.js는 현재 설치되어 있어 우선 후보로 둔다. 실제 수집 방식과 도구 호환성을 확인한 뒤 최종 결정한다. 언어를 확정하기 전 파일 확장자나 패키지 의존성을 고정하지 않는다.

### MVP에서 제외

- 별도 서버, Docker, DB 서버, 벡터 DB, MCP 서버
- 별도 `Application Support/NJUEhall/app/` 배포 과정
- 자체 세션 암호화 포맷의 선제 구현
- 매 실행 GitHub visibility 조회
- 필수 pre-commit hook
- 범용 schema registry나 복잡한 오류 분류 프레임워크

단순한 필수 필드·타입·완전성 검증과 `schema_version`은 유지한다.

## 4. 폴더 구조와 데이터 경계

### 개발 프로젝트

```text
Task1/
├── plan.md
├── README.md
├── .gitignore
├── config/
│   ├── settings.example.json
│   ├── collection-policy.json
│   └── publish-policy.json
├── src/                    # 언어·파일 구성은 Discovery 후 확정
│   ├── auth/
│   ├── collectors/
│   ├── storage/
│   ├── publish/
│   └── query/
├── tests/
│   └── fixtures/           # 가상 데이터만
└── launchd/
    └── agent.plist.example
```

### 운영 데이터: 개발 Git 저장소 밖

```text
~/Library/Application Support/NJUEhall/
├── private/
│   ├── snapshots/
│   │   └── <snapshot_id>/
│   │       ├── profile.json
│   │       ├── courses.json
│   │       ├── schedule.json
│   │       └── manifest.json
│   ├── current.json
│   └── auth/               # 필요할 때만 생성; 저장 방식은 Discovery 후 결정
├── state/
│   ├── sync-state.json
│   └── run.lock
├── logs/
└── publish-repo/
    ├── .git/
    └── data/
        ├── profile.masked.json
        ├── courses.masked.json
        ├── schedule.masked.json
        └── manifest.json
```

- PRIVATE 디렉터리 권한은 `0700`, 민감 파일은 `0600`을 기본으로 한다.
- 로그와 상태 파일도 Git 밖에 둔다.
- 실제 경로는 canonical path로 확인하고, PRIVATE와 publish 경로가 겹치거나 symlink로 경계를 우회하지 못하도록 검사한다.
- publish repo에는 마스킹 결과만 존재한다. 원본 임시파일을 이 디렉터리에서 만들지 않는다.
- MVP launchd는 프로젝트의 실제 실행 파일을 절대 경로로 실행한다.
- Desktop/Documents는 macOS 개인정보 보호 권한(TCC)의 영향을 받을 수 있다. 터미널 실행 성공은 LaunchAgent 접근 성공을 보장하지 않는다. MVP는 아래의 **초기 접근 테스트 → 실패 시 비보호 개발 경로 이동** 절차를 따른다.
- 구현 초기, 언어·runtime 선택 직후 실제 LaunchAgent에서 프로젝트 파일·설정·의존성 읽기와 최소 실행을 시험한다. 이 사전 시험에는 ehall 로그인·개인정보 수집·Git push를 포함하지 않는다.
- 성공하면 현재 Desktop 경로를 유지한다. TCC 접근 실패가 확인되면 사용자 승인하에 개발 Git 루트 전체를 `~/Developer/Vibecoding`으로 이동하고 Task1 실행 경로를 `~/Developer/Vibecoding/Lab 1/Task1`로 변경한다. Task1만 분리해 상위 Git 관계를 끊거나 Desktop으로 연결되는 symlink로 대체하지 않는다.
- 이동 전 작업 중 변경과 다른 하위 프로젝트 영향을 확인하고, 자동 작업을 중지한 뒤 plist·작업 디렉터리·절대 경로를 갱신하여 같은 LaunchAgent 시험을 다시 수행한다. PRIVATE와 publish repo 위치는 유지한다. `~/Developer`에서도 접근 가능성을 실제 검증하며 TCC 해제나 광범위한 Full Disk Access를 기본 해결책으로 삼지 않는다.
- 프로젝트 이동은 별도 app 배포 시스템을 도입하는 것이 아니다. 이번 PLAN 수정에서는 이동·LaunchAgent 시험을 실행하지 않는다.
- FileVault를 권장하며 로컬 백업·클라우드 동기화 범위도 확인한다.

## 5. Discovery: 실제 ehall 구조 확인

구현 승인 후 아래 순서로 진행한다. 승인 전 로그인이나 계정정보 요청은 하지 않는다.

1. 공개 진입 페이지와 로그인 리다이렉트·인증 도메인 확인
2. 로그인 폼, CSRF, SSO, CAPTCHA/MFA 여부 확인
3. 사용자 승인하에 로컬 보안 입력 및 인증 수행
4. 개인정보 페이지/API 확인
5. 이번 학기 과목 페이지/API 및 전체 페이지 조회 방식 확인
6. 시간표 페이지/API, 주차·예외 수업·교시 정보 확인
7. 세션 유효성 검사와 만료 시 동작 확인
8. 수집 allowlist, 안정적인 record key, 검증 규칙 확정
9. 수집 기술·구현 언어·세션 보존 방식 확정

### 수집 기술 선택 기준

| 확인 결과 | 선택 방향 |
|---|---|
| 공식적이고 적절한 조회 API 제공 | 공식 API 우선 |
| 로그인 후 안정적인 JSON 조회 가능 | 인증된 HTTP 클라이언트 |
| 브라우저 로그인 필요, 조회는 HTTP 가능 | 브라우저 인증 + HTTP 조회 |
| 동적 화면·브라우저 상태에 의존 | 브라우저 자동화; Playwright 등 비교 |
| 매번 사람의 CAPTCHA/MFA 필요 | 사용자 재인증이 필요한 운영으로 한계 명시 |

접근 권한 밖의 조회나 인증 우회는 하지 않는다. 사이트 정책·제한을 존중하고 낮은 빈도로 읽기 전용 조회한다. 요청 URL·DOM·네트워크 기록에 비밀정보가 포함될 수 있으므로 실제 응답을 fixture, 로그, Git, 외부 Agent 대화에 그대로 남기지 않는다.

### Discovery 산출물

비밀값 없는 문서에 다음을 기록한다.

- 인증 흐름과 허용 도메인
- 실제 페이지/API와 조회 레코드로 연결되는 안전한 출처 식별자; 필요 시 `source_route`, `source_app_id`, `source_record_type`의 정확성과 비민감성 확인
- 세 영역의 조회 방법과 필드 allowlist
- 현재 학기 결정 방법, 페이지네이션과 빈 결과 조건
- record key와 데이터 검증 기준
- 선택한 언어·도구·세션 방식 및 선택 이유
- 무인 실행 가능 여부와 사용자 개입이 필요한 조건

## 6. 자격증명과 세션

### ehall 자격증명

- 아이디와 비밀번호는 macOS Keychain에 저장한다.
- 소스·설정·`.env`·launchd plist·명령행 인자에 비밀값을 넣지 않는다.
- 초기 등록은 보안 입력창 또는 에코 없는 로컬 입력으로 수행한다.
- 설정에는 비밀값이 아닌 Keychain 항목 식별자만 둔다.
- 인증정보는 확인된 인증 도메인에만 전달하며 리다이렉트로 유출되지 않게 한다.
- 로그에 입력값, 쿠키, HTTP 인증 헤더, Keychain 출력이 남지 않게 한다.
- Keychain이 잠겼거나 접근 승인이 필요하면 자동 실행은 보류한다. 평문 fallback은 없다.
- 터미널뿐 아니라 실제 LaunchAgent 환경에서 접근을 검증한다.

### 세션: Discovery 후 A/B/C 중 선택

세션은 최소 상태만 보존하는 것을 우선하되 저장 방식은 미리 확정하지 않는다.

| 선택 | 적용 조건 | 보관 원칙 |
|---|---|---|
| A. 전용 persistent browser context | 브라우저 프로필 재사용이 가장 안정적 | Task1 전용 profile을 PRIVATE에 저장; 평소 브라우저 profile과 분리 |
| B. 최소 cookie/token | HTTP 세션만으로 조회 가능 | 필요한 상태만 보관; 규모·도구에 따라 Keychain 또는 보호된 저장 방식 선택 |
| C. 세션 미보존 | 매번 자동 로그인이 안정적이고 허용됨 | 프로세스 종료 후 인증 상태 폐기 |

A/B에서는 가벼운 인증 조회로 세션을 확인하고 유효하면 재사용한다. 만료 시 재인증은 실행당 최대 1회로 제한한다. HTTP 200으로 로그인 HTML이 돌아오는 경우도 감지한다.

브라우저 profile과 쿠키·토큰은 비밀번호 수준의 민감정보로 취급한다. 도구가 평문 상태를 저장한다면 그 사실과 디스크 보호 수준을 명시하고, 더 강한 보호가 필요한지 사용자와 결정한다. `session.enc`나 자체 암호화를 기본 전제로 두지 않는다.

비밀번호 변경·CAPTCHA/MFA 요구 시 사용자 재인증이 필요하다고 알리고 기존 DB를 유지한다.

## 7. 수집 범위와 로컬 데이터 모델

### 수집 allowlist

Discovery에서 사이트별 실제 필드명과 타입을 확정한다. 예상 개인정보 후보는 다음과 같다.

```text
name
student_id
department
major
academic_status
phone
email
```

사진, 가족, 건강, 금융, 신분증·여권 등은 기본 범위에 포함하지 않는다. 새로 나타난 필드는 자동 수집·반출하지 않는다. 필요한 경우 정책 검토 후 추가한다.

### `source`와 `normalized` 정의

- `source`: 수집 allowlist에 포함된 업무 필드의 사이트 원본 표현·값
- `normalized`: 검색·연결·비교를 위한 정규화 표현
- API response 전체, 인증 헤더, 쿠키, ticket, 요청 ID는 원본 업무 데이터에 포함하지 않음

학번·전화번호 등은 문자열로 보관하여 앞자리 0을 보존한다. 원본 업무 필드를 마스킹하거나 검색 편의를 위해 덮어쓰지 않는다. 정규화는 별도 표현에 적용한다. 저장에는 `source`와 `normalized`를 모두 포함하며, 의미 기반 해시는 9절의 canonical representation만 대상으로 계산한다.

### collection-policy / schema 변경

수집 범위·필드별 정규화 규칙을 포함한 `collection-policy.json`의 내용 해시와 `schema_version`을 PRIVATE manifest에 기록한다. 정규화 코드의 의미가 바뀔 때도 정책/스키마 식별자를 갱신한다. 버전 문자열만 같다고 같은 정책으로 판단하지 않는다.

```text
현재 snapshot의 collection_policy_hash / schema_version과 실행 설정 비교
→ 다르거나 식별 정보 없음: recollection_required 상태 기록
→ 이전 content_hash와 단순 비교하여 무변경 처리하지 않음
→ 새 정책으로 profile + courses + schedule 전체 재수집·검증
→ 데이터 값이 같더라도 새 정책·스키마의 완전한 snapshot 생성
→ current 원자적 교체 후 재수집 필요 상태 해제
```

- 이 경우에는 변경되지 않은 영역도 이전 파일을 그대로 재사용하지 않고 새 정책 기준으로 구성한다. 실행 중 정책이 바뀌면 후보를 게시하지 않고 다시 수집한다.
- 실패하면 기존 정상 snapshot을 유지하고 재수집 필요 상태를 해제하지 않는다. 조회 결과에 정책 불일치를 표시한다. 지원하지 않는 과거 스키마는 추정 변환하지 않고 조회를 중단한다.
- 필드 추가는 새 수집 allowlist에 대한 승인이지 Git/외부 반출 승인이 아니다. publish allowlist는 별도로 유지한다.
- 민감 필드 제거 시 현재 snapshot·보관 snapshot·백업에 과거 값이 남아 있을 수 있음을 값 자체 없이 알린다. 현재 조회는 호환 가능한 범위에서 새 allowlist를 적용해 제거된 필드를 반환하지 않으며, 과거 snapshot 원본 조회는 잔존 데이터 접근임을 명시한다.
- 정책 변경을 이유로 과거 snapshot을 자동 수정·일괄 삭제하지 않는다. 기존 보관 주기에 따른 만료는 별개이며 즉시 삭제나 백업 삭제를 보장하지 않는다. 완전한 제거가 필요하면 사용자 승인하에 현재·과거 snapshot과 백업 범위를 검토해 정리한다.
- 수집 정책 변경은 publish-policy 및 이미 공개된 Git history의 정리를 대신하지 않는다. 반출도 금지할 필요가 있으면 별도 publish-policy를 변경하고 12절의 이력 검증을 수행한다.

### 개인정보

- 본인 정보 페이지/API에서 승인된 필드만 추출한다.
- 필수 필드·타입과 로그인한 본인 계정 일치를 검증한다.
- 미제공 값과 빈 문자열을 임의로 동일시하지 않는다.

### 이번 학기 선택 과목

- 사이트가 제공하는 현재 학기 ID·명칭으로 학기를 결정한다.
- Mac 날짜만으로 이번 학기를 추정하지 않는다.
- 과목 코드·분반·이름·학점·담당 교수·수강 상태 등의 수집 여부를 확정한다.
- 전체 페이지를 조회하고 가능한 경우 서버 전체 개수와 대조한다.
- 대기·취소·수강 확정 상태는 구별하며, 포함 정책을 명시한다.

### 시간표·스케줄

- 과목 목록에서 임의 추정하지 않고 실제 시간표 조회 결과를 수집한다.
- 요일, 교시, 주차 범위, 홀짝 주, 강의실, 캠퍼스, 보강·휴강 등 제공되는 승인 필드를 보존한다.
- 시간대는 `Asia/Shanghai`로 명시한다.
- 교시만 제공되면 검증된 교시표 없이 시작·종료 시각을 만들어 넣지 않는다.
- 과목·분반 연결, 중복, 시간 범위, 학기 일치를 검증한다. 연결할 수 없는 항목을 조용히 삭제하지 않는다.

## 8. 완전한 snapshot과 manifest

### 게시 조건

profile, courses, schedule이 모두 수집·검증에 성공해야 게시 후보를 만들 수 있다. 아래 무변경 최적화는 collection-policy와 schema가 동일할 때만 적용한다. 정책·스키마가 바뀌면 7절에 따라 세 영역을 새 기준으로 재수집하고 완전한 snapshot을 반드시 생성한다.

```text
동일 정책·스키마에서 세 영역 모두 성공
→ 의미 기반 비교
  ├─ 전체 동일: 새 snapshot 생성하지 않음
  └─ 하나 이상 변경:
      변경되지 않은 영역은 기존 값을 그대로 사용
      변경된 영역은 새 값을 사용
      → 세 파일 모두 포함한 완전한 snapshot 생성
      → current 포인터 원자적 교체
```

예시:

```text
snapshot v12
profile  = 이전 값
courses  = 새 값
schedule = 새 값
```

파일별 독립 게시나 일부 성공 데이터의 게시를 하지 않는다. 초기 수집도 세 영역 전체 성공이 필요하다. 학기가 바뀌면 과목·시간표의 학기 일치와 빈 학기 조건을 먼저 검증한다.

향후 profile endpoint 장애가 반복되어 학사 데이터 갱신을 막는다면 `identity snapshot(profile)`과 `academic snapshot(courses + schedule)` 분리를 검토한다. 이는 MVP에 구현하지 않으며, 도입 시 영역별 최신성 표시와 조회 일관성 규칙을 별도로 정한다.

### PRIVATE manifest

아래 값은 구조 예시이며 실제 학기를 의미하지 않는다.

```json
{
  "schema_version": 1,
  "collection_policy_hash": "<collection-policy-sha256>",
  "snapshot_id": "20260909T000000Z-unique",
  "term": "2026-2027-1",
  "content_hashes": {
    "profile": "<semantic-sha256>",
    "courses": "<semantic-sha256>",
    "schedule": "<semantic-sha256>"
  },
  "source_system": "NJU ehall"
}
```

- `snapshot_id`는 저장된 snapshot의 식별자이며 UTC 시각과 충돌 방지 식별자로 생성한다. 변경 감지 기준으로 사용하지 않는다.
- `content_hashes`는 정규화된 실제 업무 데이터의 변경 여부를 판단한다. snapshot ID·수집 시각은 해시 입력에서 제외한다.
- manifest는 해당 snapshot의 스키마·수집 정책·학기·의미 기반 콘텐츠 해시를 설명한다. 정책 해시는 업무 콘텐츠 해시와 역할이 다르며 정책 변경 시 강제 재수집 여부를 판단한다.
- `last_checked_at`, `last_successful_sync_at`, 실행 결과, push 대기 상태는 `state/sync-state.json`에 저장한다.
- session ID·token·인증 ticket은 manifest뿐 아니라 일반 상태 파일에도 저장하지 않는다. 필요하면 인증 전용 보호 저장소에서만 관리한다.
- 오류 추적에는 서버의 민감할 수 있는 request ID 대신 로컬 run ID를 사용한다.

### current.json

current 포인터에는 경로가 아닌 snapshot ID만 저장한다.

```json
{
  "snapshot_id": "20260909T000000Z-abc123"
}
```

읽는 쪽은 ID의 형식·길이를 검증하고 고정된 PRIVATE `snapshots/` 아래에서만 경로를 구성한다. 허용 문자는 ASCII 영문·숫자·하이픈으로 제한하고 `/`, `\\`, `.`, 절대 경로, 경로 탈출을 거부한다. canonical path가 snapshot 루트 안에 있는지, 실제 디렉터리·manifest의 ID가 일치하는지 확인한다. 조회 시작 시 current를 한 번 읽고 해당 snapshot만 사용한다.

### 원자적 게시와 보관

1. PRIVATE의 같은 파일시스템 안에 후보 디렉터리를 만든다.
2. 완전한 세 파일과 manifest를 쓰고 검증한다.
3. 파일 쓰기를 완료하고 후보를 최종 snapshot 위치로 확정한다.
4. 임시 포인터 파일을 만든 뒤 atomic rename으로 `current.json`을 교체한다.
5. 최근 정상 snapshot 5개를 기본 보관한다.

현재 snapshot은 수정하지 않는다. 중간 종료 시 current가 이전 정상 버전을 계속 가리키게 한다. 다음 실행에서 미완료 후보를 정리한다. 게시·보관 정리는 조회 중인 snapshot을 삭제하지 않도록 짧은 읽기 잠금 등 최소 조정을 적용한다.

## 9. 변경 감지와 무변경 실행

### 의미 기반 비교

저장은 `source + normalized`, semantic `content_hash`는 **검증된 normalized 표현으로 구성한 canonical representation**을 대상으로 한다. 두 객체를 통째로 이어 붙이거나 파일 바이트 전체를 해시하지 않는다.

```text
allowlist 업무 필드
→ 필드별 정규화 규칙 적용
→ 의미 있는 모든 필드를 포함한 canonical representation
→ 안정적인 JSON 직렬화(키·목록 순서, 타입·null 처리 고정)
→ UTF-8 바이트의 SHA-256
```

필드별 규칙에 따라 표현 차이만 제거한다. 학번 앞자리 0, 수강 상태, 주차·예외 날짜 등 의미 있는 차이는 반드시 남긴다. 원본 표현 자체가 중요한 필드는 identity normalization으로 정확한 값을 canonical 표현에 포함한다. 정규화 규칙이 없는 필드에 임의의 trim·타입 변환을 적용하지 않는다.

예를 들어 학과명에 후행 공백 무시 규칙이 승인되어 있다면 `"Computer Science "`와 `"Computer Science"`는 같은 해시다. 이 차이만으로 snapshot을 갱신하지 않으며 저장된 `source`는 마지막으로 게시된 해당 영역의 실제 원본 표현을 유지한다. 즉 의미 없는 표시 차이의 모든 버전을 보관하는 시스템은 아니다. 정확한 표현 변경도 보존해야 하는 필드는 Discovery에서 identity normalization 대상으로 정한다.

- JSON 키 순서와 목록 순서를 안정화한다.
- 과목은 학기·과목 코드·분반 등 확정된 키로 정렬한다.
- 시간표는 과목·요일·주차·교시·예외 날짜 등으로 정렬한다.
- 표시용 공백·HTML 차이는 검증된 규칙으로 비교 표현에서만 정리한다.
- 의미 있는 allowlist 필드 전체가 비교에 포함되어야 한다.
- 수집 시각, 인증정보, 요청 ID 등은 비교에서 제외한다.
- 원본 해시는 Git으로 반출하지 않는다.

| 상황 | 동작 |
|---|---|
| 동일 수집 정책·스키마에서 업무 데이터 동일 | snapshot·데이터 파일·Git commit 변경 없음 |
| collection-policy / schema_version 변경 | 재수집 필요 표시, 세 영역 재수집·검증 성공 시 값이 같아도 새 snapshot 게시 |
| 동일 수집 정책·스키마에서 업무 데이터 변경 | 세 영역을 포함한 새 snapshot 게시 |
| 원본 변경, 마스킹 결과 동일 | PRIVATE만 갱신; Git commit 없음 |
| 반출 정책만 변경 | 현재 정상 snapshot에서 마스킹 재생성; 현재 정책으로 과거 이력도 검사하며 위반 시 push 중단 |
| 새 변경 없음, 이전 push 실패 있음 | 현재 정책으로 미전송 이력 전체를 재검증한 뒤 통과한 경우에만 push 재시도 |

무변경 실행에서도 검사 시각·실행 상태·최소 로그는 갱신할 수 있다. 업무 데이터 파일을 단순히 현재 시각 때문에 다시 쓰지 않는다. snapshot이 오래되었더라도 최근 수집 성공이면 데이터가 오래된 것으로 잘못 판단하지 않는다.

## 10. 마스킹과 반출 정책

수집 allowlist와 반출 allowlist는 별도다. PRIVATE 객체를 복사한 뒤 일부 필드를 삭제하지 않는다. 빈 공개 객체에서 시작해 승인된 필드만 추가한다.

### 기본 정책

| 필드 | Git 반출 기본값 |
|---|---|
| 이름 | 첫 글자만 유지, 나머지 `*`; 한 글자는 `*` |
| 학번 | 전체 마스킹; 형식 확인·승인 후 앞 4자리 유지 가능 |
| 전화번호 | 확인된 형식만 부분 마스킹. 예: `010-****-5678`; 미확인 국제 형식은 전체 마스킹 |
| 이메일 | 로컬파트 첫 글자만 유지하고 도메인은 기본 마스킹; 실제 도메인 공개는 별도 승인 |
| 단과대 | 승인된 범위만 허용 |
| 상세 전공·학적 상태 | 기본 제외 |
| 생년월일·주소·기숙사·신분증 | 제외 |
| 금융·건강·가족·사진·서명·QR | 제외 |
| 학기 ID·명칭 | 허용 |
| 과목명·코드·학점 | 반출 범위 승인 후 허용 |
| 담당 교수·수강 상세 상태·성적 | 기본 제외 |
| 시간표 요일·교시·주차 | 별도 승인 시 허용; 초기에는 요일별 수업 수 등 요약 |
| 정확한 강의실·캠퍼스 | 기본 제외 |
| 내부 사용자 ID·개인화 URL·인증정보 | 제외 |
| 미정의 필드 | 자동 반출 금지 |

마스킹은 익명화가 아니다. 과목 조합과 시간표 자체가 개인을 식별할 수 있으므로 Private repo라도 최소 반출을 적용한다. 짧거나 형식이 불명확한 값은 공개 범위를 늘리지 않고 전체 마스킹 또는 제외한다.

### 공개 manifest

공개 manifest는 반출 정책 버전, 공개 스키마 버전, 승인된 학기와 공개 콘텐츠 해시만 포함한다. PRIVATE snapshot ID·원본 해시·실행 시각을 복사하지 않는다. 그래야 PRIVATE만 바뀌었을 때 공개 manifest 때문에 불필요한 commit이 생기지 않는다.

### commit 전 leak check

- 파일 경로와 공개 필드 allowlist 검사
- 비밀키·쿠키·token·ticket 및 민감 식별값 패턴 검사
- 알려진 원본 학번·연락처 등이 비마스킹 상태로 남았는지 검사
- 허용하지 않은 개인화 URL과 새 필드 차단
- 파일별 검증뿐 아니라 staged 내용과 push 대상의 앱 생성 이력 검증

차단 사유에는 필드명·오류 코드만 남긴다. 검사 대상 실제 값을 로그에 출력하지 않는다. 정규식만으로 안전을 보장하지 않고 구조 allowlist를 주 방어로 사용한다.

## 11. Git 원본 유입 방지

첫 실제 수집 전에 다음을 완료한다.

1. PRIVATE가 Git 저장소 밖에 있는지 확인한다.
2. 프로젝트 ignore에 `local/`, 세션·브라우저 profile, 로그, 임시파일, 백업, 실제 데이터 아티팩트를 추가한다.
3. `.gitignore`로 이미 추적된 파일은 보호되지 않으므로 추적 목록과 관련 이력을 확인한다.
4. publish repo는 전용 경로에 만들고 PRIVATE 파일을 복사하지 않는다.
5. stage 대상은 명시된 공개 데이터 파일로 한정한다. `git add .`를 사용하지 않는다.
6. pre-commit hook 없이도 앱 자체에서 반출 검사를 반드시 수행한다.

평문 비밀값을 테스트 목적으로 실제 저장소에 넣지 않는다. 테스트는 가상 식별값과 격리된 임시 저장소를 사용한다.

## 12. GitHub 설정과 자동 commit/push

### 인증 방식

MVP 기준은 **SSH + macOS Keychain 연계**다. PAT와 병행하는 자동 fallback은 만들지 않는다.

- 기존 SSH 인증을 우선 검토하고 새 키가 필요하면 사용자 승인 후 준비한다.
- 전용 저장소로 제한된 키를 사용할 수 있는지 검토한다.
- passphrase, host key 확인, 비대화형 인증을 실제 launchd 환경에서 테스트한다.
- GitHub host key 확인을 비활성화하지 않는다.
- SSH 방식이 환경상 불가능하면 구현 전 사용자와 대안을 확정한다.

### 초기 검증

- 전용 GitHub repository가 Private인지 확인
- 승인된 remote URL, branch, 저장소 경로 고정
- 깨끗한 초기 이력과 단일 자동 작성자 원칙 확인
- commit identity는 전용 저장소 로컬 설정으로만 적용
- 개발 저장소와 글로벌 Git 설정은 자동 변경하지 않음

정기 실행에서는 remote URL과 branch가 승인 값과 동일한지 확인한다. 매번 GitHub visibility API를 호출하지 않는다. 이 선택으로 외부에서 저장소 공개 상태가 바뀐 것을 매 실행 감지하지는 못한다. 공개 상태는 사용자가 유지하며 설정 변경·점검 시 재검증한다. 데이터 반출 검사는 항상 수행한다.

### 실행 흐름

1. 전용 저장소·remote·branch 확인
2. 알 수 없는 수정·staged 내용·미확인 commit이 있으면 Git 단계 중단
3. 현재 정상 PRIVATE snapshot에서 마스킹 후보 생성
4. leak check 후 변경된 공개 파일만 교체
5. 명시적 경로만 stage하고 staged diff 재검사
6. 실제 staged diff가 있을 때만 commit
7. push 직전에 현재 publish-policy와 leak check 기준으로 미전송 commit 전체를 재검증
8. 과거 이력 위반·검증 불가 상태가 없고 검증한 대상과 정책이 그대로인 경우에만 승인된 branch를 명시하여 push; 다른 branch·tag는 자동 전송하지 않음
9. 성공한 전송 위치와 대기 상태를 로컬 state에 기록

예상 commit 메시지:

```text
update: refresh ehall profile
update: refresh current-term courses
update: course schedule changed
update: refresh ehall personal data
```

개인정보와 변경된 실제 값을 commit 메시지에 넣지 않는다.

push 실패 후 새 데이터가 없어도 아래 재검증을 거쳐 미전송 commit을 재시도한다. 원격이 앞서거나 분기되면 자동 merge/rebase/reset/force push하지 않고 확인을 요청한다. 다른 저장소나 사용자 변경을 자동 commit하지 않는다.

### pending commit: 현재 정책으로 push 직전 재검증

과거 시점에 안전하다고 판단된 commit도 현재 정책에 적합하다고 가정하지 않는다.

검사 범위를 구분한다. **매 push에서는 un-pushed commit 전체만 재검증**하고, **publish-policy 또는 leak checker 기준이 바뀔 때에는 reachable published history 전체도 재검증**한다. 초기 기준선 검증 이후 정책·검사기·승인 이력이 그대로라면 매 실행 이미 게시된 전체 history를 반복 스캔하지 않는다. 검증된 정책/검사기 식별자와 published commit 기준선을 로컬 state에 기록하며 기준선 유실·미확인 이력 변경 시 push를 보류하고 기준선을 재검증한다.

```text
pending commit 발견
→ 현재 publish-policy와 leak check 기준 로드
→ 실제 전송될 모든 pending commit의 파일·내용·메타데이터 검사
→ 통과: 검증한 commit ID를 대상으로 push
→ 실패 또는 검증 불가: push 금지, 사용자 알림, 재생성·이력 정리 필요 상태 기록
```

- 최신 working tree나 마지막 commit만 검사하지 않는다. 중간 commit에서 노출되었다가 삭제된 정보도 차단한다.
- 변경된 정책 내용과 검사기 기준을 식별할 해시/버전을 관리한다. 버전 문자열이 같더라도 정책 내용이 달라지면 재검증한다.
- 원격 상태를 확인할 수 없으면 이전 승인 기록만으로 전송 범위를 추정해 push하지 않고 보류한다.
- 검사 도중 정책이나 전송 대상 commit이 바뀌면 검증을 무효화하고 다시 검사한다.
- 최신 마스킹 파일을 다시 생성하는 것만으로 금지 정보가 들어 있는 ancestor commit 문제가 해결되지는 않는다. 검증할 근거가 부족한 과거 값은 안전하다고 간주하지 않는다.

### 반출 정책 강화와 과거 Git history

정책 또는 leak checker 기준 변경 시 승인된 publish branch의 기존 도달 가능한 이력(이미 push한 이력 포함)을 현재 기준으로 다시 검사한다. 현재 금지된 정보가 남아 있거나 검사할 수 없으면:

1. push를 일시 중단하고 로컬 상태·민감정보 없는 알림으로 사용자에게 알린다.
2. PRIVATE 수집·snapshot·trusted local 조회는 계속 유지한다.
3. 자동 history rewrite, reset, force push, 저장소 삭제는 하지 않는다.
4. 사용자 승인하에 이력 정리 또는 안전한 새 repository 생성 중 복구 방식을 결정한다.
5. 복구한 이력·remote·branch·정책을 재검증한 후 push를 재개한다.

기존 commit에서 파일을 삭제하는 새 commit만 추가해도 과거 내용은 남는다. 이력 정리나 저장소 교체 역시 기존 clone·백업 등의 사본까지 지운다고 보장하지 않으므로, 노출 범위와 자격증명 폐기 필요성을 별도로 확인한다.

## 13. launchd 정기 실행

- 사용자 LaunchAgent 사용
- 초기 주기: 매일 Mac 현지 시각 08:00, 20:00
- 정기 실행은 의도적으로 Mac 시스템 local timezone을 따른다. 여행·시스템 시간대 변경 시 실행 시각도 그 현지 시각을 따르며, 학사 데이터·날짜 조회의 시간 해석은 별도로 `Asia/Shanghai`를 유지한다.
- `RunAtLoad`는 MVP에서 사용하지 않음
- `KeepAlive`로 상시 재실행하지 않음
- plist는 `~/Library/LaunchAgents/`에 승인 후 설치
- runtime, 프로그램, 작업 디렉터리, 설정 경로는 절대 경로 사용
- 공백이 있는 프로젝트 경로를 개별 인자로 안전하게 전달
- 셸 초기화나 열린 터미널의 PATH·SSH agent에 의존하지 않음
- 실행 잠금과 전체 timeout으로 동시 실행·무한 대기 방지

### run.lock: OS advisory lock

`run.lock` 파일의 존재 여부나 PID 파일만으로 실행 중인지 판단하지 않는다.

```text
고정된 run.lock 파일 open
→ 열린 file descriptor에 비차단 OS advisory exclusive lock 요청
→ 획득 성공: 전체 sync·게시·Git 단계 동안 descriptor와 lock 유지
→ 다른 실행이 점유: 두 번째 실행 skip
→ 권한/I/O 등 그 밖의 오류: 안전하게 중단하고 오류 기록
```

잠금 방식은 언어 확정 후 macOS에서 지원되는 `flock(2)`/`fcntl` 계열 중 하나로 통일한다. macOS에 `flock` CLI가 기본 설치되어 있다고 가정하지 않는다. 모든 수동·정기 sync 진입점이 동일 잠금을 사용한다. 종료·비정상 종료 시 OS가 lock을 해제하며, 남은 lock 파일은 실행 중이라는 뜻이 아니다. lock 파일을 실행마다 삭제·재생성하거나 파일 나이만 보고 삭제하지 않는다. inode가 바뀌어 이중 실행되는 것을 방지한다. 자식 프로세스에 불필요하게 descriptor가 상속되지 않게 하고, timeout 시 관련 작업도 종료한다.

사용자가 로그인한 Mac에서 독립 동작한다. 로그아웃·전원 종료 중 실행을 보장하지 않는다. 잠자기·깨우기에서 실제 launchd 동작을 테스트하며, 누락되더라도 다음 정기 sync에서 정상 복구해야 한다. Mac을 강제로 깨우는 설정은 MVP에 포함하지 않는다.

프로젝트 파일을 직접 실행하므로 편집 중 실행될 위험이 있다. 의존성·핵심 파일 변경 시 자동 작업을 잠시 중지하고 테스트 후 재개한다. 별도 app 배포는 운영상 필요해질 때만 도입한다.

## 14. 실패 처리와 복구

원칙: 수집·검증 실패는 현재 정상 PRIVATE snapshot을 바꾸지 않는다. Git 실패는 이미 검증된 로컬 DB를 롤백시키지 않는다.

| 상황 | 처리 및 복구 |
|---|---|
| 로그인 실패 | 즉시 또는 제한된 인증 시도 후 중단, 기존 DB 유지 |
| 비밀번호 변경 | Keychain 수정·재인증 안내, 기존 세션 정리 |
| 세션 만료 | 실행당 재인증 1회; 실패하면 다음 실행/사용자 조치 대기 |
| CAPTCHA/MFA | 우회하지 않음, 로컬 재인증 요청 |
| 사이트 구조 변경 | 응답 타입·필수 필드 검증 실패로 후보 폐기 |
| 네트워크 오류·일시적 5xx | 조회 요청만 제한된 backoff 재시도, 실패 시 현재 DB 유지 |
| 429 | `Retry-After` 존중, 무리한 재시도 금지 |
| 일부 정보·페이지만 수집 | 전체 게시 보류, 정상 snapshot 유지 |
| 갑자기 빈 목록 | 인증·학기·명시적 0개·페이지 완료 확인, 필요 시 재조회 |
| 학기 불일치 | 과목·시간표를 섞지 않고 게시 보류 |
| 파일 쓰기 실패·디스크 부족 | current 유지, 미완료 후보 정리 |
| 강제 종료 | OS가 advisory lock 해제; 남은 lock 파일은 유지하고 다음 실행에서 잠금 재획득·미완료 후보 정리 |
| commit 실패 | PRIVATE 유지, 앱이 만든 공개 후보만 재검증 후 재시도 |
| push 실패·GitHub 연결 단절 | 로컬 commit 유지, 이후 실행에서 현재 정책으로 미전송 이력 재검증 후 재시도 |
| pending/과거 이력의 현재 정책 위반 | push 중단·알림, 사용자 승인하에 재생성·이력 정리 또는 새 repo 검토 |
| SSH 인증 실패 | Git 단계 보류·인증 복구 안내, 로컬 수집은 지속 |
| remote/branch 변경·이력 충돌 | Git 단계 중단, 수동 확인; force push 금지 |
| Keychain 잠김 | 작업 보류, 비밀값 평문 대체 저장 금지 |
| 동시 실행 | 동일 파일 descriptor 기반 OS advisory lock 획득 실패 시 두 번째 작업 skip |

수집 실패 중에도 미전송 commit을 현재 정책으로 push 직전 재검증하여 통과하면 별도 전송 단계로 재시도할 수 있다. 과거 검증 결과만으로 전송하지 않는다. 불완전한 수집 결과로 공개 파일을 만들지는 않는다.

상태에는 최근 확인·수집 성공·게시·push 결과를 구별해 저장한다. 로그는 짧은 보관·용량 제한을 두고 오류 단계·코드·재시도 횟수만 기록한다. 민감정보 없는 `status` 출력으로 복구 필요 상태를 확인하고, 필요하면 macOS 알림을 추가한다.

## 15. Agent 검색과 원문 위치 인용

### 애플리케이션 정책 경계: LOCAL TRUSTED와 EXTERNAL / SHARED

로컬 trusted Agent는 PRIVATE DB를 읽고 정확한 원본으로 검색·판단할 수 있다. 외부 모델/API로 전달하거나 공유 가능한 출력으로 변환할 때 별도의 masking policy를 반드시 적용한다.

| 경계 | PRIVATE 접근 및 출력 |
|---|---|
| LOCAL TRUSTED | 사용자가 신뢰·허용한 Mac 내 Agent와 로컬 처리 경로. 정확한 원본 조회를 기본으로 제공 |
| EXTERNAL / SHARED | 외부 API·모델·GitHub·공유 응답. 승인된 필드의 마스킹 출력만 허용 |
| 신뢰 경계 미확인 | 원본 접근을 거부하고 마스킹 경로만 제공 |

단순히 CLI나 Agent 프로세스가 Mac에서 실행된다는 이유로 trusted로 판정하지 않는다. 외부 모델에 tool result·대화·telemetry를 보내는 Agent는 EXTERNAL 경로다. trusted 등록은 사용자 승인 설정과 실제 데이터 흐름 확인으로 정하며, 단순 요청 인자만으로 승격하지 않는다. 외부 Agent에는 원본 파일·trusted CLI에 대한 직접 접근 권한을 주지 않고 마스킹된 조회 인터페이스만 노출한다. 동일 macOS 사용자 권한으로 임의 파일을 읽을 수 있는 Agent를 CLI 플래그만으로 격리할 수 없으므로 도구 권한·sandbox 등 실제 접근 경계도 확인한다.

**Threat model:** LOCAL TRUSTED 분류는 동일 macOS 사용자 내에서 강제되는 완전한 보안 sandbox가 아니라 애플리케이션 정책 경계다. `0700`/`0600`은 다른 일반 사용자의 접근을 제한하지만 같은 사용자 권한의 프로세스를 차단하지 않는다. 실제 원본 접근 차단이 필요한 Agent에는 별도 사용자 권한에 의한 파일시스템 격리 또는 sandbox/tool permission으로 PRIVATE 경로 접근 자체를 제한해야 한다. 이를 강제하지 못하는 환경에서 CLI 분류만으로 원본 유출을 방지한다고 주장하지 않는다.

### 읽기 전용 CLI

정확한 실행 명령은 언어 확정 후 정하되 기능 인터페이스는 다음과 같다.

```text
db profile
db courses --term current
db search "검색어"
db schedule --date YYYY-MM-DD
db status
```

- CLI 조회 자체는 수집·snapshot 변경·Git 작업을 하지 않는다.
- 승인된 LOCAL TRUSTED 조회의 기본은 정확한 PRIVATE 원본이다. 외부·공유용 인터페이스는 별도로 마스킹 결과만 반환한다.
- 원본 조회 결과가 외부 stdout 수집·로그·공유 응답으로 자동 전달되지 않도록 소비 경로를 확인한다.
- 결과에는 학기·시간대·최근 수집 성공 시각과 stale 여부를 포함한다.
- 최근 성공 상태를 확인할 수 없으면 최신이라고 단정하지 않는다.
- 초기에는 JSON 필드·문자열 검색만 사용한다.

### 출처 필드

로컬 조회 결과에는 최소 다음을 제공한다.

| 필드 | 의미 |
|---|---|
| `snapshot_id` | 실제 조회한 정상 snapshot |
| `local_file` | snapshot 내부 상대 파일 경로 |
| `record_key` | 학기·과목·분반 또는 해당 레코드를 재식별할 안정적 키 |
| `source_system` | `NJU ehall` |
| `source_page` | Discovery에서 확인한 실제 페이지 이름/안전한 식별자 |

Discovery에서 출처 식별자가 실제 화면/API와 해당 레코드로 정확히 연결되는지 확인한다. 필요하면 비민감한 `source_route`, `source_app_id`, `source_record_type`을 추가한다. 개인·세션 식별자가 섞인 값은 저장하지 않는다.

시간표 결과가 과목명도 함께 보여주면 `schedule.json`과 `courses.json`의 레코드를 각각 인용한다. 과목 코드만으로 분반·학기를 구별할 수 없다면 복합 키를 사용한다.

예시이며 실제 페이지명·과목을 뜻하지 않는다.

```text
Operating Systems — Monday 3–4

Source:
  snapshot_id: <snapshot-id>
  local_file: schedule.json
  record_key: term=<term>;course=<code>;section=<section>;meeting=<id>
  source_system: NJU ehall
  source_page: <확인된 시간표 페이지명>
```

URL이 필요하면 승인된 origin/path만 보관한다. CAS ticket, token, query parameter, fragment, 개인 ID가 포함된 path, session identifier는 출처 메타데이터에 저장하지 않는다. 안전한 route로 표현할 수 없으면 URL을 생략한다. 검색 결과의 snapshot·로컬 출처 정보는 로컬 사용용이며 공개 manifest에 자동 복사하지 않는다. 외부·공유 출처 역시 반출 allowlist를 적용하며 개인 record key나 로컬 경로를 그대로 내보내지 않는다.

MVP의 외부 모델/API·공유 출력에는 원본 전달 예외를 두지 않고 마스킹 정책을 적용한다. 수집한 페이지 텍스트는 데이터로 취급하며 Agent 실행 지시로 신뢰하지 않는다.

발표·검토용 `current-summary.md`는 추후 선택 기능이다. MVP는 JSON + CLI로 완료하며, 추가 시 PRIVATE 요약과 공유용 마스킹 요약의 저장·반출 경계를 동일하게 적용한다.

## 16. 구현 순서 및 단계별 테스트

### 단계 1 — Discovery와 선택 확정

- 사용자 승인 범위, 실제 인증·세 영역 조회 구조 확인
- 수집 allowlist, 기술·언어·세션 방식 확정
- runtime 선택 직후, 4절의 개인정보 없는 LaunchAgent 경로 접근 사전 시험 수행; TCC 실패 시 승인된 `~/Developer/Vibecoding` 이동·재시험
- 전용 Private repo, SSH, 반출 수준, 실행 시각 확정

검증: 본인 데이터만 조회되는지, 전체 페이지·학기·빈 결과를 식별할 수 있는지, 세션 만료와 추가 인증 조건을 재현할 수 있는지 확인한다. 무인 실행 불가능 조건이 있으면 먼저 보고한다.

### 단계 2 — 보안 기반과 수동 수집·snapshot

- Git 밖 저장·권한·ignore·Keychain 구성
- 세 영역 수집·검증·정규화·완전한 snapshot 게시
- 상태와 최소 로그 구현

검증: 가상 데이터로 필드 누락·부분 실패·0개·학기 변경·순서 변경을 테스트한다. 실제 승인 데이터는 화면과 대조한다. 쓰기 중 강제 종료·동시 실행에서도 이전 current가 유지되는지 확인한다. lock 파일만 남은 경우 정상 실행, 실제 lock 점유 중 skip, 강제 종료 후 재획득을 검증한다. current의 잘못된 ID·경로 탈출·manifest 불일치를 차단하고, snapshot ID가 아니라 canonical representation의 content hash로 변경을 판정하는지 확인한다. 후행 공백 같은 승인된 표시 차이는 무변경, 학번·주차·수강 상태 변경은 변경으로 판정해야 한다. 필드 추가·제거·schema 변경 시 값이 같아도 전체 재수집·새 snapshot 생성이 이루어지고 실패 시 기존 snapshot과 재수집 필요 상태가 유지되는지 검사한다. 민감 필드 제거 알림과 과거 snapshot 비자동 삭제 정책도 검증한다.

### 단계 3 — Agent 조회·마스킹·반출 검사

- 읽기 전용 CLI와 출처 인용
- 두 allowlist 및 마스킹 변환
- 공개 manifest와 leak check

검증: 이름 길이·국제 전화·이메일·미정의 필드·개인화 URL을 가상 데이터로 테스트한다. 출처가 실제 레코드로 연결되는지, 날짜·주차·예외 수업이 맞는지 확인한다. trusted local 조회는 정확한 원본을 반환하고 외부·공유 경로는 마스킹만 반환해야 한다. 로컬 실행·외부 모델 조합이 trusted로 잘못 분류되지 않는지 확인한다. CLI 경유 정책 검증과 OS/sandbox 접근 차단 검증을 구분하여, 격리를 적용한 외부 Agent가 원본 도구·PRIVATE 경로에 직접 접근하지 못하는지 시험한다. 같은 사용자 권한만 사용하는 환경의 한계도 기록한다. PRIVATE만 바뀌고 공개 결과가 같을 때 공개 diff가 없어야 한다.

### 단계 4 — 독립 Git 자동화

- Private repo 초기 검증, SSH + Keychain, 고정 remote/branch
- 명시적 stage·조건부 commit·push 재시도

검증: 임시 로컬 bare remote와 가상 데이터로 무변경·commit 실패·전송 실패·원격 분기·알 수 없는 staged 변경을 테스트한다. 이전 정책으로 만든 pending commit, 중간 commit에만 남은 금지 값, 이미 push된 이력에 대한 정책 강화를 재현하여 push 중단·알림·자동 rewrite 금지를 확인한다. 현재 정책에 맞는 pending만 재전송되고 검사 후 정책·commit 변경 시 재검증되는지 확인한다. 정책·기준선이 그대로인 반복 push에서는 published history 전체를 재스캔하지 않는지도 확인한다. 이후 승인된 GitHub repo로 전송하고 파일·이력에 원본이 없는지 확인한다.

### 단계 5 — launchd 운영 검증과 문서

- 단계 1의 경로 접근 시험 결과를 확인하고 최종 경로에서 정시 LaunchAgent 등록, 절대 경로·timeout·잠금 검증
- 실제 launchd에서 Keychain과 SSH push 검증
- 복구·중지·재개·비밀번호 변경·정책 변경 절차 문서화

검증: 터미널·Agent 종료, 잠자기·깨우기, 네트워크 단절·복구, Keychain 접근 불가를 테스트한다. 실행 일정은 Mac local timezone, 학사 데이터 해석은 `Asia/Shanghai`를 따르는지 서로 다른 시스템 시간대 조건에서 확인한다. 최소 2~3일 또는 충분한 반복 실행으로 불필요한 snapshot/commit이 없는지 확인한다.

## 17. 최종 완료 기준

### 정확성·검색

- [ ] 승인된 개인정보·이번 학기 과목·시간표가 사이트와 일치한다.
- [ ] 원본 업무 값이 마스킹되지 않고 정확히 보존된다.
- [ ] 페이지·분반·주차·예외 수업이 누락되지 않는다.
- [ ] trusted local Agent가 정확한 PRIVATE 원본으로 과목·날짜·검색어를 조회하고 snapshot/file/record/page를 인용한다.
- [ ] Discovery에서 출처 위치의 정확성을 확인하고 출처 메타데이터에 인증·세션·개인화 URL이 없다.
- [ ] 최근 확인과 최근 변경을 구분하고 실패 후 자료를 최신으로 오인시키지 않는다.

### 일관성·변경 감지

- [ ] 모든 snapshot에 profile/courses/schedule/manifest가 존재한다.
- [ ] 일부 수집 실패는 current를 변경하지 않는다.
- [ ] 동일 수집 정책·스키마·업무 데이터의 반복 실행은 새 snapshot·업무 파일 수정·commit을 만들지 않는다.
- [ ] canonical hash가 표시 차이와 의미 있는 변경을 필드별 규칙대로 구분한다.
- [ ] collection-policy/schema 변경 시 전체 재수집하고 값이 같아도 새 snapshot을 게시하며, 실패 시 재수집 필요 상태를 유지한다.
- [ ] 수집 민감 필드 제거 시 과거 snapshot·백업 잔존을 알리고 정책 변경에 따른 자동 과거 데이터 삭제는 하지 않는다.
- [ ] 변경 시 기존 값과 새 값을 조합한 완전한 snapshot을 게시한다.
- [ ] PRIVATE만 변경되고 마스킹 결과가 같으면 commit하지 않는다.
- [ ] 강제 종료·동시 실행에도 정상 snapshot을 읽을 수 있다.
- [ ] current에는 검증된 snapshot ID만 저장하며 변경 감지는 content hash로 수행한다.
- [ ] 동시 실행은 lock 파일 존재가 아닌 OS advisory lock으로 판단하고 종료 후 재획득된다.

### 보안·Git

- [ ] 아이디·비밀번호는 Keychain에서 읽으며 코드·로그·명령 이력에 남지 않는다.
- [ ] 수집 allowlist 밖 API 필드가 원본 DB에 자동 저장되지 않는다.
- [ ] PRIVATE·세션·로그가 Git 추적 대상과 push 이력에 없다.
- [ ] 반출은 빈 객체에서 승인된 필드만 생성하며 leak check를 통과한다.
- [ ] 전용 Private repo와 승인된 SSH remote/branch를 사용한다.
- [ ] 개발 저장소·글로벌 Git 설정·사용자 변경에 자동 작업이 간섭하지 않는다.
- [ ] 외부 모델/API·공유 인터페이스에는 마스킹만 전달하며 로컬에서 실행되는 외부 API Agent도 예외가 아니다.
- [ ] LOCAL TRUSTED의 애플리케이션 정책과 실제 파일 접근 격리를 구분해 검증하고 동일 사용자 권한의 한계를 문서화한다.
- [ ] 모든 pending commit을 push 직전 현재 정책으로 재검증하며 중간 이력 위반도 차단한다.
- [ ] 정책 강화로 과거 이력이 위반되면 push를 중단하고 자동 history rewrite·force push 없이 알린다.

### 독립 실행·복구

- [ ] 열린 채팅창·터미널 없이 launchd 정기 실행된다.
- [ ] 초기 LaunchAgent 경로 접근 시험을 완료하고 Desktop/TCC 실패 시 승인된 비보호 개발 경로로 이동·재시험한다.
- [ ] 최종 프로젝트 경로의 실제 LaunchAgent 환경에서 Keychain과 SSH push가 동작한다.
- [ ] sleep/wake를 실제 시험하고 누락 시 다음 정기 sync로 복구된다.
- [ ] Mac local timezone의 실행 일정과 `Asia/Shanghai` 학사 시간 해석이 분리된다.
- [ ] GitHub 단절 중 로컬 DB가 유지·갱신되며 현재 정책 재검증을 통과한 미전송 commit만 나중에 전송된다.
- [ ] 로그인 실패·비밀번호 변경·구조 변경·부분 수집·Git 실패의 복구 절차가 있다.

## 18. 승인 후 다음 행동

다음 단계는 PLAN 재설계가 아니라 **승인된 범위의 Discovery**다.

```text
실제 로그인 구조
→ 개인정보 페이지/API
→ 수강 과목 페이지/API
→ 시간표 페이지/API
→ 수집 필드 allowlist
→ 수집 기술·언어·세션 방식 확정
```

현재 문서 작성은 Discovery·패키지 설치·ehall 로그인·저장소 생성·Git 설정 변경을 수행했다는 의미가 아니다. 해당 작업은 사용자 승인 후 진행한다.
