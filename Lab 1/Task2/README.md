# Task2 — NJU smail 메일 연동 개인 비서

## 0. Model & token usage

| Stage | Model | Tokens (approx.) | Cost |
|---|---|---|---|
| 계획·구현·리뷰 (이 Claude Code 세션) | Claude Fable 5 | **~7M (추정)** | — |
| 자동 초안 생성 (headless, 누적) | Claude Sonnet 5 | ~10.6K in / 68 out | ~$0.46 |

- **Claude Fable 5**: 계획서 작성·전 구현·코드리뷰·보안리뷰·실기기 검증을 이 대화 세션에서 수행 — 대부분의 토큰이 여기서 소비됨. 값은 **추정치**이며 정확한 합계는 Claude Code 세션 화면에 표시됩니다.
- **Claude Sonnet 5**: 답장 초안 생성에만 격리 실행(`claude -p`)으로 호출. 메일 처리마다 조금씩 늘며 `state/usage.jsonl`에 기록, `npm run mail:db status`로 집계.

---

NJU smail 메일을 매시간 자동으로 가져와, **사람이 보낸 메일에 영어 답장 초안을 자동 작성**해 두는 개인 비서입니다. 초안은 개인 DB(Task1 ehall 자료)를 근거로 참고하며, **발송은 내가 직접 확인하고 승인할 때만** 나갑니다(자동 발송 없음). 초안은 데스크톱 파일 또는 iPhone Mail 임시 저장함에서 편집·발송할 수 있습니다.

## 구현한 것

- **지속 수집**: launchd로 매시간 새 메일 fetch·아카이빙 (채팅창·상주 데몬 의존 없음).
- **초안 작성**: 사람 발신 메일을 분류해 영어 답장 초안을 만들고, 개인 DB 근거를 함께 기록.
- **안전한 발송**: 승인(`approve: true`) + 발송 명령 + 전문 확인의 이중 게이트. 같은 메일을 중복 처리·발송하지 않음.
- **모바일 연동**: 초안을 서버 임시 저장함에 올려 iPhone Mail에서 승인·발송, 시스템이 자동 감지.

## Quick start

```bash
npm install
npm run cred:setup        # smail 주소 + 클라이언트 전용 비밀번호 → Keychain
npm run mail:cred-verify  # 접속 확인
npm run mail:agent -- start   # 매시간 자동 수집·초안
npm run mail:now          # 지금 즉시 확인 + 초안 + 검토 목록
```

명령어와 사용법은 **[USAGE.md](./USAGE.md)**, 설계는 `plan.md` / `plan-04-mobile.md` 참고.

## 데이터 경계

메일 원문·초안·상태는 Git 밖(`~/Library/Application Support/NJUSmail/`), 비밀번호는 macOS Keychain. Git에는 코드·설계 문서만 — 메일 본문·비밀번호는 커밋되지 않습니다.
