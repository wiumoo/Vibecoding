# Plan 04 — iPhone Mail 승인 채널 (4단계)

> 상태: **구현·실기기 종단 검증 완료**(2026-09-09). `settings.mobile.enabled`(기본 OFF)로 켠다 — OFF이면 M1–M4 동작 불변.
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
- 폴백: To + 정규화 제목 + 시간 창 (Sent 메시지에 reply 헤더가 아예 없을 때만 — 형제 초안 오탐 방지).
- **실기기 확정(2026-09-09): iOS Mail은 임시 저장함 초안을 발송할 때 In-Reply-To를 보존하지 않는다** → 1차 매칭 실패, **폴백이 실제 감지 경로**. 종단 테스트에서 `detected phone send (fallback) → sent`로 원장 전이 + 서버 Drafts 사본 정리(0건) 확인. 폴백을 함께 구현한 것이 필수였음. (제목/시간창에 의존하므로, 같은 발신자·같은 제목의 서로 다른 초안이 짧은 시간에 몰리면 이론상 혼동 가능 — 실사용 빈도상 무시. 필요 시 초안에 고유 토큰을 제목에 심는 방식으로 강화 가능.)
- 감지 전 창(최대 1시간)의 데스크톱 중복 발송은 Task2 §7.4의 pre-SMTP 조회가 막는다.

## 실기기 검증 (착수 조건)

- [ ] iPhone Mail 계정 설정에서 **Drafts Mailbox·Sent Mailbox 모두 서버 폴더로 매핑** (Drafts 미매핑 → 초안 안 보임, Sent 미매핑 → 발송 감지 불가)
- [ ] Tencent exmail에서 서버 Drafts가 실제 동기화·편집되는지
- [ ] 발송 시 In-Reply-To 보존 여부 (→ 폴백 확정)
- [ ] APPENDUID 지원 여부

## 한계: 맥 sleep (결정: 한계로 문서화)

launchd는 맥이 잠들면 안 돈다 → 노트북을 닫아 두면 새 초안이 폰에 안 뜬다. **결정(2026-09-09): 한계로 감수·문서화** — 시스템 전원 설정은 바꾸지 않는다. "맥이 깨어 있을 때만 새 초안이 폰에 반영된다"가 이 채널의 전제다. 즉시성이 필요해지면 `caffeinate`(전원 연결 시)나 `pmset repeat wake`를 사용자가 직접 적용할 수 있다.

## 실기기 종단 검증 — **완료 (2026-09-09)**

iPhone(계정: IMAP 수동 설정, 클라이언트 전용 비밀번호, 임시 저장함=`Drafts`·보낸 메일함=`Sent Messages` 서버 매핑)로 종단 검증 통과:
1. ✅ 서버 Drafts에 올린 초안이 iPhone Mail **임시 저장함에 표시**됨 (exmail↔iOS 동기화 확인).
2. ✅ 새 수신 메일 → `mail:sync`가 초안 생성 + **서버 Drafts APPEND**.
3. ✅ 폰에서 편집·발송 → 다음 `mail:sync`가 감지 → 원장 `new→drafted→sent`, 서버 Drafts 사본 삭제(0건), 재sync 멱등.
4. ✅ **In-Reply-To 미보존 확정** → 감지는 `via=fallback`(To+제목+시간창). (위 "발송 감지" 참조.)

계정 설정 주의: 이 계정은 웹 2차 인증이 걸려 있어 iPhone에도 **클라이언트 전용 비밀번호**를 넣어야 한다(웹 비밀번호는 "잘못된 암호"). 사용자 이름은 전체 주소 소문자, 받는/보내는 서버 비밀번호 둘 다 동일값.
