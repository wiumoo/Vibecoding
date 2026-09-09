# Task1 — NJU ehall 개인 데이터베이스 자동 업데이트 + 로컬 대시보드

설계 기준: `plan.md`(운영/보안), `plan-web.md`(웹 대시보드). 개인 Mac 개인용.

## 구조 (요약)

- 수집: `ehallapp.nju.edu.cn` wdkb 앱(我的课表) JSON API (headless Playwright, silent SSO)
- 저장(PRIVATE): `~/Library/Application Support/NJUEhall/` (Git 밖, 0700) — 원본은 마스킹하지 않음
- 자격증명: macOS Keychain(service `nju-ehall-personal`); 세션 쿠키는 보호된 **평문 vault 파일**(0600)에 보관 (Keychain이 아님)
- PRIVATE snapshot: `private/snapshots/<id>/{profile,courses,schedule,manifest}.json` + `private/current.json`
- PUBLIC(마스킹): 공유 개발 저장소 `wiumoo/Vibecoding`의 `Lab 1/Task1/public-data/` — 빈 객체에서 승인 필드만 추가, leak check 후 commit, 승인 remote에만 fast-forward push
- 로컬 웹 대시보드: `src/web/` (read-only, 127.0.0.1 전용)
- 정기 실행: launchd LaunchAgent `com.personal.nju-ehall-sync` (08:00/20:00 Mac 로컬 시각)
- 학사 시간 해석: `Asia/Shanghai`

## 주요 명령 (Terminal)

```bash
cd "/Users/minwoo/Desktop/minwoo/Vibecoding/Lab 1/Task1"
npm install

npm run cred:setup        # 최초 1회: Keychain에 로그인 정보 저장 (화면 비노출)
npm run auth:login        # 슬라이더 1회: 세션 생성 + vault 저장
npm run auth:status       # 세션 상태 (VALID/INVALID/NO_VAULT)

npm run sync              # 수집 → 검증 → 변경 시에만 PRIVATE snapshot
npm run db profile        # LOCAL TRUSTED 원본 조회 (+ source 인용)
npm run db courses
npm run db schedule
npm run db search "검색어"
npm run db status
npm run publish           # 마스킹 → leak check → public-data commit → 승인 remote push
npm run web               # 로컬 웹 대시보드 (http://127.0.0.1:4317)
npm test                  # 단위/통합/API 테스트 (합성 데이터)
```

## 로컬 웹 대시보드

```bash
npm run web
# → http://127.0.0.1:4317 를 브라우저로 연 뒤,
#   터미널에 표시된 1회성 접근 키를 입력
# 종료: Ctrl+C
```

- **LOCAL TRUSTED · READ ONLY**: 화면/조회는 저장된 snapshot 파일만 읽습니다. sync·snapshot 저장·state·Git·launchd를 실행하지 않습니다.
- 원본 개인정보(마스킹 없음)가 브라우저에 표시됩니다. 화면 공유·캡처에 주의하세요.
- 화면: Overview / Profile / Courses / Schedule(주간 그리드·요일 목록·주차 필터) / Search, 레코드별 출처(snapshot_id·local_file·record_key·json_pointer).
- UI 언어: 상단 **한/중/영** 토글 — 한국어·中文·English 전환(브라우저에 저장).
- `127.0.0.1`에만 bind하며 Host/Origin/접근 키/경로를 검증합니다. 외부 배포·port forwarding용이 아닙니다.
- 제한(현재 수집 데이터 기준): 교시별 실제 시각·개강일·현재 주차·보강/휴강/예외 일정은 없으므로 추정하지 않고 “미제공/미확인”으로 표시합니다.
- 웹과 launchd 수집은 독립적입니다. “다시 읽기”는 저장된 파일을 다시 읽을 뿐 새로 수집하지 않습니다.

## 상태 파일 / 로그

- `state/sync-state.json` — 마지막 실행·수집·게시 결과
- `logs/` — launchd 표준 출력/오류
- 웹 시작/종료 안내는 터미널에만 출력

## 보안 원칙

- 비밀번호는 Keychain에만. 코드·설정·argv·로그·채팅에 평문 없음.
- PRIVATE 원본·쿠키 vault·로그는 Git 밖. Git/GitHub에는 마스킹 결과만.
- 반출 정책: `config/publish-policy.json`. 이름 `朴**`, 학번 `2152*****` 등 부분 마스킹; 정확한 강의실·민족·반·내부 ID는 비공개(조정 가능).
- push는 state에 기록된 승인 remote/브랜치와 origin이 일치하고 fast-forward일 때만. force push·history rewrite 없음.
- 로컬 조회는 정확한 원본, 외부/공유 출력은 마스킹만. 같은 사용자 권한의 프로세스를 완전히 격리하는 sandbox가 아니라는 점을 문서로 명시(plan.md §15).
