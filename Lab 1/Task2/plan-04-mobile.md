# Plan 04 — iPhone Mail 승인 채널 (4단계)

> 상태: **서버 사이드 구현 완료**(2026-09-09), 실기기 종단 검증 대기. `settings.mobile.enabled`(기본 OFF)로 켠다 — OFF이면 M1–M4 동작 불변.
> 코드: `src/mobile/drafts.mjs`(APPEND/헤더 삭제/폴백 매칭), `src/mobile/detect-sends.mjs`(폰 발송 감지), draft 파이프라인·`mail:send`·`mail:sync`에 게이트 연결.
> 실검증(폰 불요): Drafts 폴더 탐색=`Drafts`(SPECIAL-USE), 본문만 APPEND→헤더 조회 1건→`deleteDraftById` 삭제→잔여 0건. UIDPLUS 지원(M1 확정)이나 삭제는 헤더 로컬 매칭으로 처리(iOS 재APPEND 대비).
> Task2 기반 재사용: 파일 기반 초안, Sent 폴더 동기화, `mail:send`의 pre-SMTP 타기기 발송 감지.

## 개념

smail이 표준 IMAP이므로 iPhone 기본 Mail 앱을 앱 개발 없이 승인 채널로 쓴다:

```text
[draft] 초안 생성 시 서버 Drafts 폴더에 APPEND (\Draft, 본문만 — 근거·요약 절대 미포함,
        In-Reply-To·References·To·Subject 세팅, X-NJUSmail-Draft: <id> 커스텀 헤더)
→ iPhone Mail 임시 저장함에 표시 → 사용자가 폰에서 편집·발송
   (발송 주체가 사람 → "내가 확인한 최종본만 발송"을 구조적으로 만족)
→ 다음 폴링의 Sent 동기화가 발송 감지 → 원장 sent + 아카이빙
```

## 서버 Drafts 수명주기

- **삭제 매칭은 UID가 아니라 헤더로**: APPEND가 UID를 돌려주려면 UIDPLUS(APPENDUID) 지원 필요(CAPABILITY로 확인)하고, iOS Mail은 초안을 수정·저장할 때 기존 것을 지우고 **새 UID로 다시 APPEND**하므로 기록한 UID는 stale이거나 다른 메일을 가리킬 수 있다. Drafts 폴더는 작으니 매번 전체 헤더를 가져와 `X-NJUSmail-Draft` (또는 Message-ID)로 **로컬 매칭** 후 `\Deleted`+`EXPUNGE`.
- 삭제 시점: 초안이 `superseded`로 전이되거나 데스크톱 `mail:send`로 발송됐을 때 — 안 지우면 낡은 초안이 폰에 남아 그대로 발송될 수 있다.

## 발송 감지

- 1차: Sent 동기화에서 In-Reply-To(원본 Message-ID — 우리가 알고 불변)를 로컬 매칭.
- **iOS Mail이 APPEND된 초안을 발송할 때 In-Reply-To를 보존하는지 미검증** — 미보존이면 1차가 통째로 실패하므로 폴백(To + 정규화 제목 + 시간 창) 병행 구현, 실기기에서 어느 쪽이 동작하는지 확정.
- 감지 전 창(최대 1시간)의 데스크톱 중복 발송은 Task2 §7.4의 pre-SMTP 조회가 막는다.

## 실기기 검증 (착수 조건)

- [ ] iPhone Mail 계정 설정에서 **Drafts Mailbox·Sent Mailbox 모두 서버 폴더로 매핑** (Drafts 미매핑 → 초안 안 보임, Sent 미매핑 → 발송 감지 불가)
- [ ] Tencent exmail에서 서버 Drafts가 실제 동기화·편집되는지
- [ ] 발송 시 In-Reply-To 보존 여부 (→ 폴백 확정)
- [ ] APPENDUID 지원 여부

## 한계: 맥 sleep (결정: 한계로 문서화)

launchd는 맥이 잠들면 안 돈다 → 노트북을 닫아 두면 새 초안이 폰에 안 뜬다. **결정(2026-09-09): 한계로 감수·문서화** — 시스템 전원 설정은 바꾸지 않는다. "맥이 깨어 있을 때만 새 초안이 폰에 반영된다"가 이 채널의 전제다. 즉시성이 필요해지면 `caffeinate`(전원 연결 시)나 `pmset repeat wake`를 사용자가 직접 적용할 수 있다.

## 실기기 종단 검증 (사용자 단계, 폰 필요)

서버 사이드는 검증됐고, 아래는 iPhone이 있어야 확정된다:
1. iPhone Mail에 smail 계정 추가 + 계정 설정에서 **임시 저장함(Drafts)·보낸 메일함(Sent)을 서버 폴더로 매핑**.
2. `settings.json`에 `"mobile": { "enabled": true }` 설정 후 `mail:sync` → iPhone 임시 저장함에 초안이 뜨는지.
3. 폰에서 편집·발송 → 다음 `mail:sync`가 `detected phone send`로 감지하고 원장 `sent` + Drafts 정리하는지.
4. **In-Reply-To 보존 여부**: 감지 로그의 `via`가 `in-reply-to`면 iOS가 헤더를 보존한 것, `fallback`이면 To+제목+시간창으로 잡은 것 — 어느 쪽이 동작하는지 확정.
