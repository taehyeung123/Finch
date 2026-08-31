# API 연동 로드맵 — 무엇이 끝났고 무엇이 남았나

> **최종 대조: 2026-08-31.** 이 문서는 «앞으로 할 일» 목록이라 실제와 어긋나면 곧장 헛수고가 된다.
> 2026-08-30 점검에서 **20건 넘는 항목이 이미 끝난 일을 «할 일»로 붙들고 있었다** — 전면 개정했다.
> 고칠 때는 반드시 코드를 열어 확인할 것. 기억으로 쓰면 다시 같은 상태가 된다.

연동은 두 종류다. **키만 넣으면 도는 것**과 **Meta·TikTok 승인이 있어야 실사용자에게 열리는 것**.
코드는 대부분 이미 짜여 있다 — 남은 건 자격증명과 승인이다.

## 현재 상태 한눈에

| 연동 | 코드 | 자격증명 | 남은 일 |
|---|---|---|---|
| Supabase (Auth+DB) | ✅ 완료 | ✅ Pro 결제·설정 완료 | 마이그레이션 적용 유지 |
| Anthropic Claude | ✅ 완료 (크레딧 과금·모델 3단 배치까지) | ✅ 키 설정 완료 | 없음 |
| ScrapeCreators (광고·레퍼런스 수집) | ✅ 완료 (공용 풀 크론 가동) | ✅ 키 설정 완료 | 없음 |
| Instagram (지표·발행·자동DM) | ✅ 완료 | ✅ **프로덕션 설정 완료** | ⚠️ 재연동(발행 권한) → 심사 |
| Threads (지표·발행) | ✅ 완료 (2026-08-31 발행 추가) | ✅ **프로덕션 설정 완료** | 심사 |
| TikTok (프로필 지표) | ✅ 완료 | ❌ `TIKTOK_CLIENT_KEY/SECRET` 미설정 | 앱 등록(심사 불요로 개발 가능) |
| Toss Payments | ✅ 완료 (위젯·빌링·웹훅) | ❌ 키 미설정 | 계약 → 키 |
| Meta 광고 관리 (Marketing API) | ❌ **미착수** | — | 어댑터부터 신규 개발 |

---

## 1. Supabase — 인증 + 데이터베이스 ✅

Pro 결제·프로젝트 생성 완료. Google/Kakao 로그인 동작 중(구글은 동의화면 브랜딩·인증까지 끝).

**⚠️ 마이그레이션은 74개다**(`0001`~`0074`). 옛 문서가 «0001~0003이면 된다»고 적어 두었는데
그것만 적용하면 결제·예약발행·틱톡·팀·크레딧·레퍼런스·공용 풀·프로필 링크가 전부 없는 반쪽 DB가 된다.
적용 순서·주의사항은 `supabase/README.md` — 특히 **이미 돌아가는 프로젝트에 `apply_all`을 다시 돌리지 말 것**
(`create or replace`가 뒤 마이그레이션이 고쳐 놓은 함수를 옛 버전으로 되돌린다).

새 마이그레이션은 사장님이 Supabase 대시보드 → SQL Editor 에 직접 붙여넣어 적용한다.

## 2. Anthropic Claude API ✅

키 설정 완료, 코드도 이미 그 키로 돈다(`lib/ai/claude.ts`).

**옛 문서가 «만들어야 한다»고 적은 것들은 전부 이미 있다:**
- `/api/ai/*` 라우트는 만들지 말 것 — 같은 기능이 **서버 액션**으로 구현돼 있다
  (`studio/actions.ts`의 카드뉴스·아이디어, `lib/actions/agent-chat.ts`의 에이전트 챗).
  라우트로 다시 만들면 중복이다.
- 비용 가드도 이미 있다 — 모든 AI 호출이 `chargeGeneration()`(`lib/actions/credits.ts`)을 거치고
  실패 시 환불한다. 단가는 `lib/pricing/credit-config.ts`, DB 한도는 `use_quota()`.
- 모델도 기능별로 갈라져 있다(`lib/ai/claude.ts`): 스튜디오 Opus · 챗/분석 Sonnet · 감성분류 Haiku.

## 3. Meta 개발자 앱 — 인스타그램 + 스레드 (심사 리드타임이 가장 길다)

> ## ✅ 앱 생성·자격증명·연동은 **이미 끝났다** (2026-08-31 라이브 DB 확인)
>
> `connected_accounts` 에 인스타(@__taaae_h, 팔로워 1,114, 2026-07-18 연동)와
> 스레드(2026-07-24 연동)가 살아 있고, 토큰이 `v1:` 포맷으로 암호화돼 저장돼 있다
> — 즉 `INSTAGRAM_APP_ID`·`THREADS_APP_ID/SECRET`·`TOKEN_ENCRYPTION_KEY` 가
> **Vercel 환경변수에 이미 설정돼 있다**(로컬 `.env.local` 에만 없다).
> 두 행의 `updated_at` 이 매일 갱신되고 있어 토큰 갱신 크론도 정상 동작 중이다.
>
> ### ⚠️ 그런데 인스타 토큰에는 **발행 권한이 없다**
>
> 토큰은 2026-07-18 발급인데 `instagram_business_content_publish` 는 **2026-08-30 에야**
> 스코프 배열에 들어갔다(git 대조 완료 — 그 시점 배열은 4개뿐이었다).
> **스코프는 동의 시점에 고정**되므로 배열만 고쳐도 이미 발급된 토큰은 안 바뀐다.
> → **설정에서 인스타를 다시 연동해야 예약 발행이 된다.** 재연동은 토큰 만료도 60일로 리셋한다.
>
> ### ⚠️ `TOKEN_ENCRYPTION_KEY` 를 **새로 만들면 안 된다**
>
> 저장된 토큰이 그 키로 봉인돼 있다. 바꾸면 복호화가 `null` 이 되고, 코드는 그걸
> «연동 없음» 처럼 다뤄 **화면에 오류 하나 없이** 지표가 통째로 빈다. 빌링키도 같은 키를 쓴다.

**코드는 완성돼 있다.** OAuth(장기토큰 교환·리프레시·웹훅 구독), 지표 조회, 예약 발행, 댓글 자동 DM
파이프라인 전부. 아래 1~6은 **처음 세팅할 때의 절차 기록**이다.

1. 사전 준비: 비즈니스용 Facebook 계정. 도메인(`finch.ai.kr`)·개인정보처리방침(`/privacy`)은 게시됨.
2. https://developers.facebook.com → 앱 생성 (유형: Business)
3. 앱에 제품 추가: **Instagram**(Instagram Login 경로) + **Threads API**
   - ⚠️ Facebook 로그인 제품이 아니다. 핀치는 페이지 없이 크리에이터 계정을 직접 잇는
     Instagram Login 경로를 쓴다(`docs/REAL_API_SPEC.md` 1절).
4. 앱 대시보드에 아이콘 업로드 — `public/brand/finch-app-icon-1024.png`
5. 자격증명: `INSTAGRAM_APP_ID`, `THREADS_APP_ID`, `THREADS_APP_SECRET`, `META_APP_SECRET`,
   `TOKEN_ENCRYPTION_KEY`(32바이트 base64 또는 64자 hex —
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
   - ⚠️ `INSTAGRAM_APP_SECRET` 이라는 변수는 **없다.** 코드는 `META_APP_SECRET` 하나만 읽는다
     (웹훅 서명검증과 시크릿을 공유해야 해서다).
6. **개발·테스트는 심사 없이 가능하다.** Standard Access(앱에 역할이 있는 테스터 계정)로
   전 기능을 돌려볼 수 있다. 심사는 **일반 사용자에게 열 때** 필요하다.
7. Instagram 앱 심사(App Review) — **신청 목록의 정본은 [docs/REAL_API_SPEC.md](REAL_API_SPEC.md) 1절.** 사본:
   `instagram_business_basic` · `instagram_business_manage_insights` · `instagram_business_manage_comments` ·
   `instagram_business_manage_messages` · `instagram_business_content_publish`(예약 발행)
   - ⚠️ 전부 **Instagram Login 경로** 값이다. `instagram_basic`·`instagram_manage_*`·`pages_read_engagement`는
     Facebook Login 경로 값이라 섞어 신청하면 안 된다. 예전 이 자리에 그 이름들이 적혀 있었고
     발행 권한은 아예 빠져 있었다(2026-08-30 적발) — 그대로 신청했으면 심사를 통과하고도
     예약 발행이 권한 오류로 실패했다.
8. Threads 앱 심사 — 스코프 **5개**다(`lib/meta/threads-oauth.ts`):
   `threads_basic` · `threads_content_publish`(발행) · `threads_manage_replies` ·
   `threads_read_replies` · `threads_manage_insights`
9. 앱 대시보드 > 설정 > 기본 설정에 콜백 URL 4개 등록 — **코드는 전부 구현돼 있다, 등록만 하면 된다**:
   - Data Deletion Instructions: `/api/auth/instagram/data-deletion` · `/api/auth/threads/data-deletion`
   - Deauthorize(연동 해제): `/api/auth/instagram/deauthorize` · `/api/auth/threads/deauthorize`
   (전부 `https://finch.ai.kr` 기준. 해제 콜백을 빠뜨리면 사용자가 메타 쪽에서 끊어도 우리 DB 는
   «연동됨»으로 남아 죽은 토큰으로 계속 호출한다.)

**3-확장) 인스타 댓글 자동 DM** — 파이프라인 전체가 **이미 완성**돼 있다:
웹훅 서명검증(타이밍 세이프 HMAC), 즉시 200 후 비동기 처리, 규칙 매칭, `reserve_dm_send`
(멱등·하루상한·옵트아웃·24h 쿨다운을 한 트랜잭션에서), 야간 보류, 광고 표기, 재처리 크론까지.
- 남은 건 권한 심사뿐: `instagram_business_manage_messages` + `instagram_business_manage_comments`
  — **별도 심사·사업자 인증(수주~수개월), 조기 병행 신청**
- 하드 제약: 댓글당 비공개 답장 **1회·7일**, 계정당 레이트리밋, 토큰 60일 만료
- 법률: 정보통신망법(광고성 정보 동의·(광고) 표기·수신거부·야간), 개인정보보호법(수탁자 DPA)
- 비용·운영 체크리스트: [docs/AUTO_DM_COST_RISK.md](AUTO_DM_COST_RISK.md)

## 4. Meta 광고 관리 (Marketing API) — **유일하게 코드가 없는 항목**

`/ads`·`/ads/campaigns` 화면(5단계 캠페인 마법사 포함)은 완성돼 있지만, **Marketing API 호출 코드가
저장소에 0건**이다. 화면 자체가 「Phase 3 예정」·「상태 변경은 목 동작」이라고 적고 있다.

남은 일(전부 신규 개발):
1. `ads_management`·`ads_read` 스코프를 요청하는 광고 계정 연결 플로우 — 지금 IG/Threads OAuth엔 광고 스코프가 없다
2. `lib/meta/ads.ts` 어댑터 — `/act_{id}/campaigns`·`/insights` 조회, Campaign→AdSet→Ad 3단 생성
3. 캠페인·인사이트 저장용 마이그레이션 (현재 관련 테이블 0건)
4. `lib/data/index.ts`의 `campaigns` export를 실 조회로 교체
5. 접근 수준: **본인 광고 계정**은 Standard Access. **고객 광고 계정 대행**은 Advanced Access
   (사업자등록증 + 비즈니스 인증) — 사업자 나온 뒤

> ⚠️ **경쟁사 광고 수집과 혼동하지 말 것.** 그건 별개 기능이고 **이미 돌아간다**(6번).

## 5. TikTok for Developers — 프로필 지표 (발행은 로드맵 밖)

**코드는 완료**(`lib/tiktok/oauth.ts`, `lib/tiktok/api.ts`, 콜백 라우트, 토큰 회전 컬럼).

1. https://developers.tiktok.com → 앱 등록 (서비스 소개, 도메인, 개인정보처리방침)
2. **심사 없이 개발 가능** — Sandbox 모드 + target user(테스터 계정 최대 10개)
3. `TIKTOK_CLIENT_KEY`·`TIKTOK_CLIENT_SECRET` 설정
4. 요청 스코프는 프로필 3종뿐이다(`user.info.basic`·`profile`·`stats`) —
   영상 목록/인사이트 스코프는 심사 없이 동작한다는 확답을 못 얻어 요청하지 않는다

**틱톡 자동발행은 이 로드맵에 없다.** 하려면 Content Posting API 심사를 새로 받고
`video.publish` 스코프·영상 업로드 파이프라인을 처음부터 만들어야 한다.

## 6. 레퍼런스·경쟁사 광고 수집 ✅ — **이미 돌아간다**

공급사는 **ScrapeCreators**(+ 인스타 키워드용 Apify 폴백)이고 자가 발급 키다. `.env.local`에 설정돼 있다.

- 광고 라이브러리 검색: `lib/reference/meta-ads.ts` (한국 상업광고는 공식 Meta `ads_archive`가
  EU/UK만 반환해 이 경로를 쓴다)
- 공용 풀 크론: `pool-plan`(1회/일) → `pool-work`(8회/일) → `pool-finalize`(1회/일), `vercel.json` 등록됨
- 화면: `/library`(레퍼런스), `/scrap`

**원가는 사용자 수와 분리돼 있다** — 사용자별 자동수집 크론은 2026-08-10 폐기하고 공용 풀로 옮겼다.
운영 문서: [docs/POOL_OPERATIONS.md](POOL_OPERATIONS.md)

> ⚠️ `.env.example`에 `SCRAPECREATORS_API_KEY`·`UPSTAGE_API_KEY`·`LINK_COOKIE_SECRET`이 빠져 있다.

## 7. Toss Payments — 결제

**코드는 완료**: 결제 위젯(`toss-checkout.tsx`), 정기결제(`lib/toss/billing.ts`), 웹훅
(`app/api/webhooks/toss/route.ts`), 플랜·크레딧 연동.

1. https://developers.tosspayments.com — 테스트 키로 개발 가능
2. **정기(자동)결제는 별도 계약** — 사업자등록증으로 신청, 심사 수일
3. `NEXT_PUBLIC_TOSS_CLIENT_KEY`·`TOSS_SECRET_KEY`·`NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY`·`TOSS_BILLING_SECRET_KEY` 설정
4. ⚠️ **결제 웹훅에는 서명이 없다**(payout/seller 웹훅만 서명이 있다). 공식 IP 허용목록도 없다 —
   그래서 코드는 본문을 믿지 않고 `GET /v1/payments/{paymentKey}` **재조회 결과**를 진위 근거로 쓴다.
   옛 문서의 「서명 검증 필수」는 사실과 반대였다.
5. 크레딧·선불 요소의 전자금융업 해당 여부 법률 검토 (PRD 12)

---

## 사람이 해야 할 일 (2026-08-31 기준)

**끝난 것** — Supabase Pro·프로젝트 생성 · Anthropic 키 · ScrapeCreators 키 ·
개인정보처리방침 게시 · Vercel 배포 · 도메인(finch.ai.kr) · 네이버·구글 사이트등록 ·
구글 OAuth 브랜딩·인증

**남은 것**

- [x] ~~Meta 개발자 앱 생성 + 자격증명 + `TOKEN_ENCRYPTION_KEY`~~ — **이미 끝났다**(3절 참조).
      ⚠️ 암호화 키를 **새로 만들지 말 것** — 저장된 토큰·빌링키가 전부 죽는다.
- [ ] ⚠️ **인스타그램 재연동** — 지금 토큰에는 발행 권한이 없다(2026-07-18 발급, 4개 스코프 시절).
      설정 화면에서 다시 연동하면 발행 권한 획득 + 토큰 만료 60일 리셋 + 웹훅 구독 재시도가 한 번에 된다.
- [ ] **`LINK_COOKIE_SECRET` 설정** — 없으면 서비스 롤 키를 대신 쓰므로, 그 키를 돌리는 순간
      모든 프로필 링크 잠금해제 쿠키가 무효가 된다
- [ ] Meta 앱 심사 신청 (위 3-7·3-8 스코프 목록 그대로)
- [ ] TikTok 개발자 앱 등록 → `TIKTOK_CLIENT_KEY/SECRET`
- [ ] 사업자등록증 발급 후: Toss 정기결제 계약, Meta 비즈니스 인증(Advanced Access),
      개인정보처리방침·약관의 사업자 항목 채우기
- [ ] **Vercel 플랜 확인** — 지금 코드는 Hobby 제약에 맞춰져 있다(크론 하나가 하루 1회만
      돌 수 있어 `pool-work`를 시각만 다른 8줄로 쪼갰고, `maxDuration`도 60초로 묶여 있다).
      토스 정기결제가 붙은 서비스는 Vercel이 상업적 이용으로 보므로 Hobby면 약관 위반이다.
      Pro로 올리면 **예약 발행을 하루 1회 배치가 아니라 자주 돌릴 수 있다** — 제품이 달라진다.
