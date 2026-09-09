# Task1 사용 가이드 (필수)

> 개인용 · macOS 전용 · 더 자세한 설계는 `plan.md`, `plan-web.md`

## 1. 이 시스템이 하는 일
1. **데이터 수집**: NJU ehall에 자동 로그인해 이번 학기 개인정보·과목·시간표를 모아 **PRIVATE snapshot**으로 저장하고, 매일 08:00/20:00 launchd가 갱신합니다.
2. **웹 시각화**: `npm run web`으로 여는 **로컬 대시보드**(Overview/Profile/Courses/Schedule/Search)가 저장된 snapshot을 보여줍니다.

## 2. 데이터 위치 (꼭 알아두기)
- **원본(PRIVATE)**: `~/Library/Application Support/NJUEhall/private/` — **Git 밖**, 0700/0600
- **공개(마스킹)**: 이 저장소 `Lab 1/Task1/public-data/` — 이름 `朴**`, 학번 `2152*****`, 강의실 없음
- 비밀번호: macOS Keychain(service `nju-ehall-personal`) / 세션 쿠키: 보호된 평문 파일(`private/auth/cookies.vault.json`)

## 3. 최초 1회 설정
```bash
cd "/Users/minwoo/Desktop/minwoo/Vibecoding/Lab 1/Task1"
npm install
npm run cred:setup     # Keychain에 ehall 아이디/비밀번호 저장 (화면에 안 보임)
npm run auth:login     # 브라우저 로그인 + 슬라이더 1회 → 세션 저장
npm run auth:status    # VALID 나오면 끝
```

## 4. 일상 명령 (필수만)
| 명령 | 언제 |
|---|---|
| `npm run sync` | 지금 수동 수집(변경 시에만 snapshot 생성) |
| `npm run web` | 웹 대시보드 실행 → `http://127.0.0.1:4317` |
| `npm run publish` | 마스킹 데이터를 GitHub `public-data/`에 반영 |
| `npm run db profile/courses/schedule/search "..." /status` | 터미널 조회(원본, 로컬 전용) |
| `npm test` | 회귀 테스트 |

웹·조회는 **읽기만** 합니다. sync/Git/launchd를 실행하지 않습니다.

## 5. 자동 실행 (launchd) 관리
```bash
bash scripts/nju-agent.sh status   # 켜짐/중지/제거 확인
bash scripts/nju-agent.sh start    # 시작 (매일 08:00/20:00, Mac 로컬 시간)
bash scripts/nju-agent.sh stop     # 중지 — plist는 남으므로 재부팅 시 다시 켜질 수 있음
bash scripts/nju-agent.sh remove   # 완전 제거 (plist 삭제)
```
- 상태·로그: `~/Library/Application Support/NJUEhall/state/sync-state.json`, `logs/`
- 세션 만료 시 macOS 알림 → `npm run auth:login`(슬라이더 1회)만 하면 됩니다.

## 6. 웹 대시보드 사용법 (필수)
1. 터미널에서 `npm run web` → 접속 주소와 **1회성 접근 키**가 표시됨.
2. 브라우저에서 `http://127.0.0.1:4317` → 키 입력.
3. 상단바: **한/중/영 언어** 토글 · **밝은/어두운** 테마 · **다시 읽기**(파일만 재조회, 새 수집 아님).
4. **주의**: 화면은 마스킹 없는 원본 개인정보 → 캡처·공유 금지. 서버는 `127.0.0.1` 전용이며 외부 배포 금지.
5. 종료: 서버 터미널에서 `Ctrl+C` (브라우저를 닫아도 서버는 계속 실행됨).

## 7. 보안 규칙 (필수)
- 아이디·비밀번호는 **Keychain에만**. 코드·설정·로그·채팅에 평문 금지.
- PRIVATE 원본·쿠키·로그는 절대 Git에 올리지 않음. GitHub에는 **마스킹 결과만**.
- 같은 사용자 권한 프로그램까지 막는 sandbox는 아닙니다(로컬 전용 신뢰 경계).

## 8. 현재 한계 (추정하지 않음)
교시별 실제 시각·개강일·현재 주차·보강/휴강/예외 일정은 아직 수집하지 않아 대시보드에 “미제공/미확인”으로 표시됩니다.
