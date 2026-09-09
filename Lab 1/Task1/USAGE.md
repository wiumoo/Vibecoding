# Task1 사용 방법 (User Guide)

> 최종 갱신: 2026-09-09
> 본인(MINWOO PARK)의 개인 Mac에서 NJU ehall 개인 DB를 자동 수집·검색·GitHub 공개용 마스킹 배포하는 시스템.

---

## 1. 한눈에 보기

```
매일 08:00 / 20:00 (Mac 로컬 시간)
  └ launchd(com.personal.nju-ehall-sync) 자동 실행
       ├ 세션 확인 → silent SSO로 자동 갱신
       ├ ehall 수집 (학기/개인정보/선택과목/시간표)
       ├ 변경 있을 때만 PRIVATE snapshot 저장
       ├ 마스킹 → leak check
       ├ GitHub(public-data)에 변경 있을 때만 commit + push
```

- 터미널·채팅창이 열려 있지 않아도 동작합니다.
- 매 실행 결과는 로그와 상태 파일에 기록됩니다.

---

## 2. 구성 요소 위치

| 항목 | 경로 |
|---|---|
| 프로젝트(소스/설정) | `/Users/minwoo/Desktop/minwoo/Vibecoding/Lab 1/Task1` |
| PRIVATE 데이터(원본) | `~/Library/Application Support/NJUEhall/private/` (Git 밖) |
| 상태 파일 | `~/Library/Application Support/NJUEhall/state/sync-state.json` |
| 로그 | `~/Library/Application Support/NJUEhall/logs/` |
| GitHub 공개 데이터 | `wiumoo/Vibecoding` 저장소의 `Lab 1/Task1/public-data/` |
| 로그인 정보(Keychain) | 서비스명 `nju-ehall-personal` |
| 세션 쿠키 vault | `~/Library/Application Support/NJUEhall/private/auth/cookies.vault.json` |
| LaunchAgent | `~/Library/LaunchAgents/com.personal.nju-ehall-sync.plist` |

> 평소 작업은 프로젝트 폴더에서 실행합니다.
> ```bash
> cd "/Users/minwoo/Desktop/minwoo/Vibecoding/Lab 1/Task1"
> ```

---

## 3. 최초 설정(1회만)

```bash
npm install                    # 의존성 설치(이미 되어 있으면 생략)

npm run cred:setup             # ① Keychain에 아이디/비밀번호 저장
                               #   → 학번 입력, macOS가 비밀번호 숨김 프롬프트(1회)
npm run cred:verify            # ② 저장 확인 (password length=N 나오면 OK)

npm run auth:login             # ③ 브라우저 열림 → 슬라이더 퍼즐 1회 드래그
                               #   → 세션 쿠키가 vault에 저장됨
npm run auth:status            # ④ VALID 가 나오면 세션 정상
```

---

## 4. 수동 명령 (일상)

| 명령 | 설명 |
|---|---|
| `npm run sync` | 수집→검증→변경 시에만 snapshot 저장 (변경 없으면 아무것도 안 함) |
| `npm run publish` | 마스킹→leak check→GitHub `public-data`에 commit→(가능하면)push |
| `npm run db profile` | 내 개인정보(원본, LOCAL 전용) |
| `npm run db courses` | 이번 학기 선택 과목 |
| `npm run db schedule` | 시간표(meeting 단위) |
| `npm run db search "검색어"` | 과목/장소 등 검색 (source 인용 포함) |
| `npm run db status` | 현재 snapshot·마지막 실행 상태 |
| `npm run web` | 로컬 웹 대시보드 실행 |
| `npm test` | 자동 테스트 (가상 데이터) |

조회 명령은 **로컬 trusted 전용(원본)**이며 아무것도 변경하지 않습니다.
GitHub에는 항상 마스킹된 결과만 올라갑니다.

---

## 4-1. 로컬 웹 대시보드 (web)

```bash
npm run web
```

- 브라우저에서 `http://127.0.0.1:4317` 열기 → 터미널에 표시된 **1회성 접근 키** 입력.
- **read-only**: 조회해도 sync·snapshot 저장·state·Git·launchd가 실행되지 않습니다.
- **원본 개인정보가 마스킹 없이 표시**됩니다 → 화면 공유·캡처 주의.
- 종료는 터미널에서 `Ctrl+C`. 브라우저를 닫아도 서버는 터미널 종료까지 유지.
- 화면: Overview(상태·최신성) / Profile / Courses / Schedule(주간 그리드·요일 목록·주차 필터) / Search.
- UI 언어: 상단바의 **한/중/영** 토글로 한국어·中文·English 전환(설정 저장, 테마 토글 옆).
- “다시 읽기”는 저장된 snapshot 파일을 다시 읽을 뿐, ehall에서 새로 수집하지 않습니다.
- **표시 한계**: 실제 교시 시각·개강일·현재 주차·보강/휴강/예외 일정은 현재 수집 데이터에 없어 추정하지 않고 “미제공/미확인”으로 표시합니다.
- LOCAL TRUSTED 위협 모델: `127.0.0.1` bind + 접근 키 + Host/Origin 검증입니다. 같은 사용자 권한 프로세스까지 막는 sandbox는 아닙니다(plan.md §15).
- 다른 브라우저·기기에서 접근, 외부 배포, port forwarding 금지.

## 5. 자동 실행 (launchd) 상태 확인

```bash
# 등록/상태 확인 (state = active 이면 정상, not running 이면 "정시 대기 중")
launchctl print gui/$(id -u)/com.personal.nju-ehall-sync | grep -E 'state|runs|last exit'

# 지금 당장 한 번 실행
launchctl kickstart -k gui/$(id -u)/com.personal.nju-ehall-sync

# 마지막 실행 결과 보기
cat "$HOME/Library/Application Support/NJUEhall/state/sync-state.json"

# 로그 보기
tail -20 "$HOME/Library/Application Support/NJUEhall/logs/agent.stdout.log"
tail -20 "$HOME/Library/Application Support/NJUEhall/logs/agent.stderr.log"
```

state 항목 의미:
- `ok` : 정상
- `no-change`(lastReasons) : 데이터 변화 없음 → 아무것도 안 함(정상)
- `need-login` : 세션 만료 → 6번 재로그인
- `failed`/`sync-failed` : 오류 → 로그 확인

---

## 6. 세션 만료 시 재로그인

자동 실행이 `need-login` 상태가 되면 macOS 알림이 옵니다. 그때:

```bash
npm run auth:login     # 슬라이더 퍼즐 1회
npm run auth:status    # VALID 확인
```

슬라이더 캡차는 우회하지 않으므로 사람이 1회 필요합니다. 쿠키 vault가 살아있는 동안은 silent SSO로 자동 갱신되어 보통 필요 없습니다.

---

## 7. 자동 실행 중지 / 재시작 / 제거 (추천: 스크립트 사용)

프로젝트 폴더에서 실행하면 **터미널에 결과 메시지**가 표시됩니다.

> 참고: `stop`(bootout)은 launchd 등록만 해제합니다. plist 파일이 남아 있으면 **다음 로그인/재부팅 시 다시 로드될 수 있습니다**. 완전히 제거하려면 `remove`(plist 삭제)까지 실행하세요.

```bash
cd "/Users/minwoo/Desktop/minwoo/Vibecoding/Lab 1/Task1"

bash scripts/nju-agent.sh status   # 상태 확인 (▶ 켜짐 / ⏸ 중지 / ❌ 제거됨)
bash scripts/nju-agent.sh start    # ✅ 자동 실행 시작
bash scripts/nju-agent.sh stop     # 🛑 중지 (등록 파일 유지 → start 로 재시작)
bash scripts/nju-agent.sh remove   # 🗑 완전 제거 (등록 파일 삭제)
```

예시 출력:
```
✅ 자동 실행이 시작되었습니다. (매일 08:00 / 20:00, Mac 로컬 시간)
🛑 자동 실행이 중지되었습니다. (등록 파일은 유지 …)
🗑 자동 실행이 완전히 제거되었습니다.
```

원시 명령으로 직접 다룰 수도 있습니다:
```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.personal.nju-ehall-sync.plist   # 중지
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.personal.nju-ehall-sync.plist  # 재시작
rm ~/Library/LaunchAgents/com.personal.nju-ehall-sync.plist                                # 제거
```

> 중지/제거해도 PRIVATE DB·Keychain·쿠키 vault·로그는 유지됩니다. 언제든 수동 `npm run sync` 가능.
> 이 에이전트는 KeepAlive가 없어 예약 시각(08/20시)에만 실행됩니다.

---

## 8. GitHub 공개 범위와 조정

공개 데이터 위치: `wiumoo/Vibecoding` → `Lab 1/Task1/public-data/`

현재 정책 (안전 판단 기본값):
- profile: 이름 `朴**`, 학번 `2152*****`, 전공·학년 공개
- courses: 과목명/코드/학점/개설단과대/교수/선택유형 공개
- schedule: 요일·교시·주차 공개
- **공개 안 함**: 정확한 강의실, 민족, 반, 내부 ID 등

변경하려면 `config/publish-policy.json`을 수정한 뒤:
```bash
npm run publish
```
- `profile_publish.allow` : 프로필 공개 필드 (+마스킹 rule)
- `courses_publish.allow` : 과목 공개 필드
- `schedule_publish.allow` : 시간표 공개 필드 (예: `location` 추가 시 강의실 공개)
- 마스킹 rule 예: `first_char_only`, `student_id_prefix4`, `mask_all`

> 어떤 필드를 추가해도 leak check가 통과해야 반영됩니다.
> 저장소를 **public으로 전환**해도 안전하도록 마스킹 정책이 적용되어 있으며, 전환 전 이력에 개인정보가 없는지 `git log`로 한 번 확인하세요.

---

## 9. GitHub push가 안 될 때

공유 저장소(wiumoo/Vibecoding) 특성상 다음 상황에서는 자동 push가 멈추고 알림이 갑니다(강제 push 없음):

- 당신이 dev 커밋을 먼저 GitHub에 push한 경우 → 다음 정기 실행에서 자동 재시도
- 원격과 분기된 경우 → 수동 확인 필요

```bash
cd "/Users/minwoo/Desktop/minwoo/Vibecoding/Lab 1/Task1"
npm run publish        # 재시도
```

---

## 10. 자주 묻는 문제

| 증상 | 해결 |
|---|---|
| `auth:status` → `INVALID` | `npm run auth:login` (슬라이더 1회) |
| `auth:status` → `NO_VAULT` | `npm run cred:setup` 후 `npm run auth:login` |
| 자동 실행 알림: 세션 만료 | 6번 재로그인 |
| 수집 실패(네트워크/점검) | 기존 정상 snapshot 유지됨. 다음 실행에서 자동 복구 |
| GitHub push 미동작 | 9번 확인 |
| 모든 것을 초기화하고 싶음 | 자동실행 제거(7번) 후 PRIVATE 삭제는 별도 문의 |

---

## 11. 보안 노트

- 비밀번호는 macOS Keychain에만 저장됩니다. 코드·설정·로그·채팅에 평문이 없습니다.
- PRIVATE 원본·쿠키·로그는 Git 저장소 **밖**(Application Support)에 있습니다.
- GitHub에는 빈 객체에서 **승인된 필드만 추가**한 마스킹 데이터만 올라갑니다.
- 세션 쿠키 vault는 0600 권한 파일이며 FileVault 사용을 권장합니다.
