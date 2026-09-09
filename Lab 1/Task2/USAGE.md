# Task2 — smail 메일 연동 사용법

NJU smail(@smail.nju.edu.cn) 메일을 지속적으로 가져와, 사람이 보낸 메일에 **영어 답장 초안**을 자동 작성해 두는 개인 비서. 발송은 **내가 확인할 때만** 나갑니다(자동 발송 없음). 자세한 설계는 `plan.md`, 모바일 채널은 `plan-04-mobile.md` 참고.

## 처음 한 번 (설정)

```bash
cd "…/Lab 1/Task2"
npm install
npm run cred:setup        # smail 주소 + 클라이언트 전용(2차 인증) 비밀번호를 Keychain에 저장
npm run mail:cred-verify  # IMAP/SMTP 접속·폴더 확인
npm run mail:agent -- start   # 매시간 자동 수집·초안 작성 시작
```

> 비밀번호: 웹 로그인에 QR 2차 인증이 걸려 있으므로, IMAP/SMTP에는 웹메일에서 발급한 **클라이언트 전용 비밀번호**를 씁니다(웹 로그인 비밀번호는 거부됨).

## 매일 쓰는 명령

| 명령 | 설명 |
|---|---|
| `npm run mail:now` | **지금 즉시** 새 메일 확인 + 초안 작성 + 검토할 목록 요약 |
| `npm run mail:send -- <id>` | 승인한 초안 발송 (수신자·전문 표시 후 `y` 확인) |
| `npm run mail:triage -- <id> draft` | 판단 대기 메일에 초안 만들기 |
| `npm run mail:triage -- <id> skip` | 판단 대기 메일 무시 |
| `npm run mail:db status` | 상태 요약 (검토 대기 초안·triage·토큰 사용량) |
| `npm run mail:db search <말>` | 아카이브된 메일 검색 |
| `npm run mail:resolve -- <id> sent\|unsent` | 발송 여부 불명 상태 해소 |

`<id>`는 `mail:now` / `mail:db status`가 알려주는 초안 번호(예: `20260909-9772287d`)입니다.

## 발송하는 법

1. `npm run mail:now` → 검토 대기 초안 목록과 파일 경로 확인
2. 초안 파일(`~/Library/Application Support/NJUSmail/private/drafts/<id>.md`)을 열어 본문 편집
3. frontmatter의 `approve: false` → **`approve: true`** 로 바꿔 저장
4. `npm run mail:send -- <id>` → 화면의 수신자·최종본 확인 후 **`y`**

> 초안 파일에서 `<!-- BODY END -->` 위쪽만 발송됩니다. 아래(요약·근거)는 참고용이며 발송되지 않습니다. **이 줄은 지우지 마세요.**

## 아이폰으로 (선택)

`config/settings.json`에 `"mobile": { "enabled": true }`가 켜져 있으면, 초안이 서버 임시 저장함(Drafts)에도 올라가 **iPhone Mail 임시 저장함**에서 보입니다. 폰에서 편집·발송하면 다음 `mail:now`가 자동 감지합니다.
설정: iPhone Mail에 이 계정을 IMAP으로 추가 + 계정 고급 설정에서 임시 저장함=`Drafts`, 보낸 메일함=`Sent Messages`로 매핑. (맥이 잠자면 그 시간대 수집은 건너뜁니다.)

## 자동 실행 제어 / 데이터 삭제

```bash
npm run mail:agent -- status   # 상태 확인
npm run mail:agent -- stop     # 자동 실행 중지 (데이터 유지)
npm run mail:agent -- start    # 재개
npm run mail:agent -- remove   # 자동 실행 제거 (데이터 유지)
npm run mail:agent -- purge    # ⚠️ 로컬 데이터 전부 삭제 (DELETE 입력 요구)
```

`purge`는 로컬 메일·초안·기록만 지웁니다. **Keychain 비밀번호와 서버(smail)의 실제 메일은 건드리지 않습니다.**

## 데이터 위치

- 메일 원문·초안·상태: `~/Library/Application Support/NJUSmail/` (Git 밖, 0700/0600)
- 비밀번호: macOS Keychain (`nju.smail`)
- Git에는 코드·설계 문서만 — 메일 본문·비밀번호는 절대 커밋되지 않습니다.


