# 인스타 댓글 자동 DM — 실발송 연동 가이드 (사람 작업 체크리스트)

코드 파이프라인은 완성돼 있다: 웹훅 수신(서명검증) → 규칙 매칭 → 멱등 예약(중복·하루상한·옵트아웃·24h 쿨다운·월한도) → Private Reply 발송 → 결과 확정. 이 문서는 그 파이프라인에 **Meta 쪽 스위치를 켜는 사람 작업**을 순서대로 정리한다.

전제: Supabase 프로젝트 생성 + 마이그레이션 0001~0004 적용 + 배포(https://finch.ai.kr) 완료.

## 1. Meta 개발자 앱 준비

1. https://developers.facebook.com → 앱 생성(유형: Business) — 이미 만들었다면 그 앱 재사용 (`docs/API_ROADMAP.md` 3번)
2. 제품 추가: **Messenger** 또는 **Instagram** 제품에서 Instagram 메시지 설정 활성화
3. 시크릿 확인: 웹훅 서명은 **Instagram 제품의 시크릿**(`INSTAGRAM_APP_SECRET`, 인스타 로그인 연동과 같은 값)으로 먼저 확인하고,
   맞지 않으면 `META_APP_SECRET` 으로 한 번 더 확인한다(app/api/webhooks/instagram/route.ts `webhookSecrets`).
   ⚠️ `META_APP_SECRET` 하나로만 검증하던 때 운영 댓글 알림이 전부 401 로 버려졌다(2026-09-11 수리).

## 2. 웹훅 구독 등록

1. 임의의 긴 무작위 문자열을 만들어 `IG_WEBHOOK_VERIFY_TOKEN` 환경변수에 입력하고 재배포
2. 앱 대시보드 > Webhooks > **Instagram** 구독:
   - 콜백 URL: `https://finch.ai.kr/api/webhooks/instagram`
   - 확인 토큰: 위에서 정한 값 (일치하면 우리 라우트가 hub.challenge를 에코해 검증 통과)
3. 구독 필드: **comments**(필수), **messages**(수신거부 답장 처리용 권장)
4. 연동 IG 계정이 앱에 연결된 페이스북 페이지와 묶여 있어야 이벤트가 온다

## 3. 개발자 모드 테스트 (심사 전, 본인 계정으로)

심사 승인 전에는 앱 관리자/개발자/테스터 계정(최대 25명)에만 동작한다. 이 단계에서 파이프라인 전체를 실검증한다.

1. 본인 IG 비즈니스 계정을 앱 역할(관리자/테스터)에 추가
2. 그래프 API 탐색기에서 `instagram_business_manage_messages`, `instagram_business_manage_comments` 권한이 든 토큰 발급 → `IG_TEST_ACCESS_TOKEN`에 임시 입력 (OAuth 연동 전 브릿지)
   - ⚠️ **신형 값(`instagram_business_*`)만 쓴다.** 구형 `instagram_manage_*`·`pages_manage_metadata` 는 Facebook Login 경로 값이고 2025-01-27 폐기됐다. 정본은 `lib/meta/instagram-oauth.ts` 의 `INSTAGRAM_SCOPES` 다.
3. Supabase `connected_accounts`에 본인 계정 행 추가하고 `platform_user_id`에 IG 사용자 id 입력 (웹훅 entry.id와 매핑되는 값)
4. `users_profile.plan`을 `creator` 이상으로 변경 (free는 월 발송 한도 0 — 발송이 전부 skipped 처리됨)
5. 앱 `/auto-dm`에서 규칙 생성(실제 DB `auto_dm_rules`에 저장됨) → 본인 게시물에 키워드 댓글 → DM 도착 확인
6. 확인 포인트: dm_sends에 행 1개(중복 웹훅에도 1개), 같은 댓글 재발송 안 됨, `수신거부` 답장 후 재댓글 시 skipped_optout, 광고성 규칙은 본문 앞 (광고)·끝 수신거부 안내 포함

## 3-1. «지금 확인» — 웹훅 없이 댓글을 직접 읽어 보내기 (2026-09-11)

댓글 웹훅은 앱이 **Live + 고급 권한 승인**을 받은 뒤에야 온다. 그 전에는 어떤 댓글도 자동 DM 을 깨우지 못해서
심사자가 기능을 재현할 길이 없고(녹화), 우리도 승인 전에 실발송을 시험할 수 없다. 그래서 규칙 카드마다
**「지금 확인」** 버튼을 둔다 — 누르면 그 규칙 게시물의 댓글을 인스타에서 읽어 **웹훅과 똑같이** 처리한다.

- 코드: 버튼 `app/(finch)/(app)/auto-dm/_components/auto-dm-client.tsx` → 서버 액션 `checkRuleNow`(`auto-dm/actions.ts`)
  → 본체 `lib/auto-dm/check-now.ts` → 댓글 한 건 처리는 **`lib/auto-dm/pipeline.ts` `processCommentEvent`** —
  웹훅(`app/api/webhooks/instagram/route.ts`)도 같은 함수를 부른다. 판정·발송을 두 곳에 따로 쓰지 말 것.
- 대상: 실행 중이고 게시물이 정해진 규칙만. «다음 게시물» 예약 규칙은 게시물이 정해지기 전엔 버튼이 없다
  (바인딩은 지금도 웹훅의 첫 댓글이 한다).
- 읽는 댓글: `GET /{media-id}/comments?fields=id,text,timestamp,username,from{id,username}` — **최신 50개**(한 번에 받을 수 있는 최대, 최상위 댓글만).
  캐시 없이 읽는다(`lib/meta/instagram.ts` `fetchCommentsForAutoDm`). 수신자 해시는 `from.id`(웹훅 `value.from.id` 와 같은 인스타 범위 ID)로 만든다 —
  `from.id` 가 없는 댓글은 수신거부·24시간 확인을 할 수 없어 **보내지 않는다**(웹훅도 같다).
- 거르는 것: 내 계정 댓글(ig_id·platform_user_id·핸들 대조) · 6.5일 넘은 댓글(flush-dms 와 같은 창, `PRIVATE_REPLY_WINDOW_MS`)
  · 이미 dm_sends 행이 있는 댓글(규칙과 무관하게 한 댓글엔 한 번 — 웹훅이 먼저 처리한 것도 여기서 걸린다).
- 나머지는 오래된 것부터 파이프라인에 넣는다 — 규칙 매칭·reserve(멱등·하루 상한·수신거부·24시간 쿨다운)·광고 야간 보류·Private Reply·공개 답글이
  웹훅과 같다. **다시 눌러도 두 번 안 나간다**(dm_sends `(rule_id, ig_comment_id)` 유니크).
- 시간: 페이지 `maxDuration=60`, 새 댓글 처리는 액션 시작 40초에서 멈추고 남은 것은 «다음 확인 때 이어서»로 알린다.
- 남용 제한: **규칙당 30초에 한 번** — `claim_auto_dm_check` 함수와 `auto_dm_manual_checks` 표(마이그레이션 **0092**, service_role 전용).
  ⚠️ **0092 를 적용하지 않으면 버튼이 「지금은 확인하지 못했어요」로 막힌다**(제한 없이 열지 않는다 — Vercel 로그에 «0092 미적용»).
- 결과는 모달: «댓글 N개 확인 · DM M개 보냄 · 건너뜀 K개» + 건너뛴 이유(이미 처리함·조건 불일치·기간 지남·발송 제한).
  실패는 형식이 있다 — 댓글을 못 가져옴 / 연결 만료·권한 빠짐(→ 「다시 연결하기」) / 게시물 없음 / 30초 제한.
- 운영 로그 한 줄: `[auto-dm:check] rule=… checked=… sent=… …`(숫자만, 댓글 원문·사람 id 없음).

**권한 가드(같은 날)**: 연동의 `granted_scopes` 에 `instagram_business_manage_comments` 가 **확실히 없으면**
(null = 0075 이전 연동은 «확인 불가»라 막지 않는다) — 자동 DM 화면이 «다시 연결 필요» 안내를 띄우고, 규칙 만들기·켜기·지금 확인이
거절되며, 웹훅·지금 확인 파이프라인은 예약 전에 건너뛴다(계정당 10분에 한 번 로그). 수신거부 답장 등록은 권한과 무관하게 항상 처리한다.
메타 문서상 Instagram 로그인의 비공개 답장 권한은 `instagram_business_basic` + `instagram_business_manage_comments` 다.

**심사 녹화 순서(예)**: 규칙 만들기(게시물·키워드·DM 문구) → 테스터 계정으로 그 게시물에 키워드 댓글 → 핀치에서 「지금 확인」
→ 결과 모달 «DM 1개 보냄» → 테스터 인스타 받은편지함에 DM 도착 → 한 번 더 「지금 확인」 → «이미 처리함»(두 번 안 나간다)
→ 같은 테스터가 24시간 안에 다시 댓글 → 「지금 확인」 → «발송 제한»(24시간 안에 이미 받은 사람).
⚠️ `수신거부` 답장 등록은 **messages 웹훅**으로만 들어온다 — «지금 확인»은 DM 답장을 읽지 않는다. 수신거부 장면은 웹훅이 오는 환경에서 따로 찍는다.

## 4. 앱 심사 (Advanced Access) — 리드타임 수주~수개월, 최우선 착수

1. 사업자 인증(Business Verification) 먼저 — 사업자등록증 필요
2. App Review 신청 권한: `instagram_business_manage_messages`, `instagram_business_manage_comments`
   — **신청 목록의 정본은 코드다**(`lib/meta/instagram-oauth.ts`). 5개를 한 번에 신청한다:
   `instagram_business_basic` · `_manage_insights` · `_manage_comments` · `_manage_messages` · `_content_publish`.
   스코프는 **동의 시점에 확정**되므로 나중에 추가하면 기존 연동자가 전부 재연동해야 한다.
3. 스크린캐스트 필수 — 반려 1순위 원인. 반드시 담을 것:
   - 사용자가 게시물·키워드·메시지를 직접 설정하는 화면 (자동 스팸이 아니라 사용자 의도 기반임을 증명)
   - 댓글 → DM 수신 전체 흐름
   - **수신거부 동작** (수신거부 답장 → 이후 발송 제외) — 심사가 명시적으로 요구
4. 사용 사례 설명: "게시물 댓글로 정보를 요청한 사용자에게 응답을 전달하는 도구" (대량 마케팅 발송으로 쓰지 않음을 명확히)
5. 반려 2~3회는 정상 범위 — 반려 사유 보고 스크린캐스트 보강 후 재신청

## 5. 운영 전환 시 남은 코드 작업 (Claude Code 담당)

- [x] 규칙 CRUD 실구현 — 앱에서 만든 규칙이 `auto_dm_rules`에 저장·조회된다 (데모 모드는 샘플 유지)
- [x] IG 계정 OAuth 연동 플로우 → `connected_accounts`에 토큰 저장 (+ `platform_user_id` 자동 기록)
- [x] 토큰 암호화 — 앱단 AES-256-GCM 확정(lib/crypto/tokens), decryptToken 실구현 (IG_TEST_ACCESS_TOKEN은 dev 폴백으로 유지)
- [x] held_night(야간 보류)·pending(일시 오류) 재처리 크론 (/api/cron/flush-dms) — 아침 8시 KST 플러시, 7일 창 만료분 window_expired 처리
- [ ] 규칙 상세에 dm_sends 상태별 발송 로그 표 (성공/대기/실패 사유별)
- [ ] 대량 트래픽 시 Inngest 큐 도입 (계정당 시간당 상한 스로틀 — 비용 문서 1-1)

## 참고 문서

- 비용·정책·운영 리스크 전체: [`AUTO_DM_COST_RISK.md`](AUTO_DM_COST_RISK.md)
- 연동 순서 로드맵: [`API_ROADMAP.md`](API_ROADMAP.md) 3-확장
- DB 스키마: `../supabase/migrations/0002_auto_dm.sql`, `0004_dm_send_pipeline.sql`
