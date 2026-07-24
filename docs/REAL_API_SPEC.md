# 실 API 연동 스펙 (2026 검증본)

이 문서는 핀치의 실 데이터/결제 연동에 필요한 외부 API 스펙을 2026년 7월 웹검증한 결과다.
구현 파일(`lib/meta/*`, `lib/toss/*`, `app/api/auth/instagram/*`)의 근거이며, 엔드포인트·필드가 바뀌면
여기부터 갱신한다. 각 항목의 출처는 developers.facebook.com / docs.tosspayments.com 공식 문서다.

## 1. Instagram OAuth — "Instagram API with Instagram Login" 채택

핀치는 크리에이터가 자기 IG 프로페셔널 계정을 직접 연동하는 구조 → **Facebook Page 불필요한
Instagram Login 경로**를 쓴다. 호스트는 `graph.instagram.com`(v25.0). (Facebook Login 경로는
graph.facebook.com + Page 연결 + pages_* 스코프가 필요해 온보딩이 무겁다.)

하나의 플로우에 **호스트가 3개** 등장한다:

1. 인가(리다이렉트): `GET https://www.instagram.com/oauth/authorize`
   - params: `client_id`(=Instagram App ID), `redirect_uri`, `response_type=code`, `scope`(콤마구분), `state`(CSRF)
2. code → 단기토큰(1시간): `POST https://api.instagram.com/oauth/access_token`
   - form: `client_id`, `client_secret`, `grant_type=authorization_code`, `redirect_uri`(일치必), `code`
   - 반환: `{ access_token, user_id, permissions }`
3. 단기 → 장기토큰(60일): `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=...&access_token=...`
   - 반환: `{ access_token, token_type: 'bearer', expires_in }` (약 5183944초)
4. 리프레시(+60일): `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=...`
   - 장기토큰이 24시간 이상 경과 & 미만료(<60일)여야 갱신 가능. 리프레시엔 client_secret 불필요.

### 스코프 (2025-01-27 이후 신형 값만 사용)

- `instagram_business_basic` — 기본(필수)
- `instagram_business_manage_insights` — 계정·미디어 인사이트
- `instagram_business_manage_comments` — 댓글 조회/모더레이션 + Private Reply 게이팅
- `instagram_business_manage_messages` — DM 송수신

구형 값(`business_basic`, `business_manage_messages` 등)은 2025-01-27 폐기. `instagram_manage_*`(business 없는)는
Facebook Login 경로 값이라 혼용 금지.

### 접근 수준

- Standard Access(기본): 앱에 역할(admin/developer/tester)이 있는 계정만 — **개발자 모드 테스트 티어(심사 불요)**.
- Advanced Access: 제3자 계정 서비스 시 필요 — App Review + 비즈니스 인증 필수. (사업자 등록 ~8월 이후)

### 메시징 제약

- 표준 DM: 사용자가 먼저 메시지 보낸 뒤 24시간 이내만. 콜드 DM 불가.
- Private Reply(댓글→비공개 DM): `POST https://graph.instagram.com/v25.0/<IG_ID>/messages`,
  body `{ recipient: { comment_id }, message: {...} }`, **댓글 후 7일 이내·댓글당 1회**.

## 2. Instagram 인사이트/미디어 (graph.instagram.com v25.0)

### 계정 정보

`GET /v25.0/<IG_ID>?fields=id,username,name,followers_count,follows_count,media_count,profile_picture_url,biography,website`

### 계정 인사이트

`GET /v25.0/<IG_ID>/insights?metric=<csv>&metric_type=total_value&period=day`
- 현재 지원 metric(total_value/day): `reach`, `views`, `accounts_engaged`, `total_interactions`, `likes`, `comments`, `saves`, `shares`, `replies`, `reposts`, `follows_and_unfollows`, `profile_links_taps`
- 값 위치: `data[].total_value.value` (time_series 아님). `reach`·`follower_count`만 time_series 허용.
- `follower_count`(일별 신규 팔로워)는 time_series: `metric=follower_count&period=day`.

### 폐기된 지표 (중요 — 옛 대시보드 KPI 대체)

- `profile_views` (계정) — 2025-01-08 폐기 → `profile_links_taps`(계정) / `profile_visits`(미디어)로 대체
- `impressions` (계정·미디어) — 2025-04-21 전면 폐기 → `views`로 대체
- `website_clicks`, `phone_call_clicks` 등 액션 지표 — 2025-01-08 폐기
- 오디언스 `audience_city/country/gender_age/locale` → `follower_demographics`/`engaged_audience_demographics`
  (`period=lifetime` + `metric_type=total_value` + `timeframe` + `breakdown` 전부 필수)

### 미디어

`GET /v25.0/<IG_ID>/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp,like_count,comments_count,media_url&limit=25`
- `media_type` ∈ {IMAGE, VIDEO, CAROUSEL_ALBUM}, `media_product_type` ∈ {AD, FEED, STORY, REELS}
- `thumbnail_url`은 VIDEO/REELS만. IMAGE는 `media_url` 폴백.

### 미디어 인사이트

`GET /v25.0/<IG_MEDIA_ID>/insights?metric=views,reach,likes,saved,shares,comments,total_interactions`
- 미디어 레벨 저장 지표는 `saved`(계정은 `saves`). metric_type 불필요.
- REELS엔 `profile_visits/follows/reposts` 없음 — media_product_type로 분기.

### 소액 계정 제약

`followers_count`, `follower_count`, `online_followers`, 데모그래픽은 **100팔로워 미만이면 비공개** — 빈 응답 우아하게 처리.

## 3. Meta Ad Library API — KR 상업광고 조회 불가 (기능 재설계 필요)

`GET https://graph.facebook.com/<ver>/ads_archive` — 신원확인 사용자 토큰만 필요(App Review 불요).
`ad_reached_countries` 필수 + `search_terms`/`search_page_ids` 필수. `ad_type` 기본값은 `POLITICAL_AND_ISSUE_ADS`.

**결정적 제약(2023-08 DSA 이후):** `ad_type=ALL`(상업/비정치 광고)은 **EU 회원국 + 영국** 대상 광고만 반환.
그 외 국가(**한국 KR 포함**)는 **정치·이슈·선거 광고만** 조회 가능. → 한국 상업 브랜드 경쟁사 광고는
이 API로 조회 **불가**. 웹 UI(facebook.com/ads/library)엔 KR 상업광고가 보이지만 API엔 안 나온다(스크래핑은 ToS 위반).

- 정치광고만 impressions/spend(범위값)·demographic/region 분포 제공. 상업광고는 이런 지표 전무.
- KR 상업광고 정식 경로는 Meta Content Library(CASD 연구자 승인) — 제품 연동용 아님.

**핀치 대응:** 경쟁사 "광고" 모니터링은 KR에서 불가로 확정. 경쟁사 **비교**(오가닉)는 IG Graph의
`business_discovery`로 공개 비즈니스/크리에이터 계정의 `followers_count`, `media_count`, 최근 미디어를
조회하는 경로가 유효(연동 계정 토큰 필요). competitorAds는 실 API 연동 대신 명시적 "예시/수동" 데이터로 유지.

## 4. Toss Payments (테스트 모드, v2 결제위젯)

패키지: `@tosspayments/tosspayments-sdk` (v2, ~2.7.x). v1 `loadPaymentWidget`/`@tosspayments/payment-widget-sdk`와 혼용 금지.

### 키 세트 (중요)

v2 결제위젯은 **'결제위젯 연동 키'** 세트를 쓴다: 클라이언트 `test_gck_...`, 시크릿 `test_gsk_...`.
(`test_ck_`/`test_sk_`는 '결제창·브랜드페이'용 **API 개별 연동 키**라 위젯에 쓰면 NOT_REGISTERED_PAYMENT_WIDGET/INVALID_API_KEY 오류.)
클라이언트·시크릿은 반드시 같은 세트로 짝지어 쓴다. 발급: 개발자센터 > 내 개발정보 > API 키.

### 클라이언트 (결제 요청)

```
const tossPayments = await loadTossPayments(clientKey);   // test_gck_...
const widgets = tossPayments.widgets({ customerKey });     // 게스트는 ANONYMOUS
await widgets.setAmount({ currency: "KRW", value });        // v2는 객체 인자
await widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" });
await widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" });
await widgets.requestPayment({ orderId, orderName, successUrl, failUrl });
// 성공 시 successUrl?paymentKey=&orderId=&amount= 로 리다이렉트 (amount는 requestPayment에 안 넘김)
```

### 서버 (승인)

`POST https://api.tosspayments.com/v1/payments/confirm`
- body `{ paymentKey, orderId, amount }`
- 헤더 `Authorization: Basic base64(secretKey + ":")` — **콜론 필수**(빈 비번). test_gsk_...
- `Idempotency-Key` 헤더 권장(중복 승인 방지). 리다이렉트 후 **10분 이내** 호출.
- **금액은 successUrl 쿼리/웹훅을 신뢰하지 말고** 내 DB에서 orderId로 조회한 값을 넘긴다.

### 웹훅

- `PAYMENT_STATUS_CHANGED` 등 결제 웹훅은 **서명 없음**(payout.changed/seller.changed만 서명 헤더 有).
  공식 IP 허용목록도 없음 → **본문 신뢰 대신 `GET /v1/payments/{paymentKey}` 재조회**로 진위 확인.
- 엔드포인트는 반드시 200 반환. 실패 시 최대 7회 재시도(1,4,16,64,256,1024,4096분).
- payload: `{ eventType, createdAt, data }`.

### 정기결제

`자동결제`(billing)는 **별도 계약** 후 `POST /v1/billing/authorizations/issue` 등 사용 가능. 테스트 자가활성 불가.

## 5. Threads OAuth·인사이트·발행 (2026 조사본)

구현 파일: `lib/meta/threads-oauth.ts`, `lib/meta/threads.ts`, `app/api/auth/threads/*`. 출처는 전부
developers.facebook.com/docs/threads 하위 페이지(get-started, posts, insights, reference/user).
Instagram Login(1·2절)과 달리 인가만 별도 호스트(threads.net)고 토큰 교환·리프레시는 전부
graph.threads.net에 모여 있다.

### 접근 수준 — 사업자등록·앱심사 불요로 바로 개발 가능

Instagram과 동일하게 **Standard Access(개발자 모드, 앱 역할에 등록된 테스터 계정만)** 로 심사 없이
바로 연동·테스트할 수 있다. 제3자 계정 서비스(Advanced Access)는 App Review + 비즈니스 인증이 필요.

### OAuth 플로우

1. 인가(리다이렉트): `GET https://threads.net/oauth/authorize`
   - params: `client_id`(Threads App ID), `redirect_uri`, `scope`(콤마구분), `response_type=code`, `state`(CSRF)
2. code → 단기토큰: `POST https://graph.threads.net/oauth/access_token`
   - form: `client_id`, `client_secret`, `grant_type=authorization_code`, `redirect_uri`(일치必), `code`
   - 반환: `{ access_token, user_id }` (permissions 필드는 문서상 미확인 — 코드는 방어적으로 파싱)
3. 단기 → 장기토큰(60일): `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=...&access_token=...`
4. 리프레시(+60일): `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=...`
   - 24시간 이상 경과 & 미만료여야 갱신 가능. client_secret 불필요(인스타그램과 동일 제약).

### 스코프

`threads_basic`(필수) · `threads_content_publish`(발행) · `threads_manage_replies`(답글 작성) ·
`threads_read_replies`(답글 조회) · `threads_manage_insights`(인사이트). `threads_delete` 등은 문서에서 미확인.

### 프로필 조회 (GET /{threads-user-id} 또는 /me)

`fields=id,username,name,threads_profile_picture_url,threads_biography,is_verified,recently_searched_keywords`

**중요:** 이 필드 목록엔 `followers_count`/`media_count`가 없다(IG와 다름). 팔로워 수는
`threads_insights(metric=followers_count)`로, 게시물 총수는 공식 필드가 없어 최근 목록 조회 결과 길이로
근사한다(`lib/data/live.ts` computeThreadsPiece 주석 참고 — 정확한 총계가 필요하면 전체 페이지네이션 필요).

### 게시물 발행 (2단계 — Instagram 캐러셀 패턴과 동일 골격)

1. 컨테이너 생성: `POST /{threads-user-id}/threads` — `media_type`(`TEXT`|`IMAGE`|`VIDEO`|`CAROUSEL`),
   `text`(최대 500자), `image_url`/`video_url`, `is_carousel_item`, `children`(캐러셀 2~20개),
   `link_attachment`, `gif_attachment`, `topic_tag`
2. 발행: `POST /{threads-user-id}/threads_publish` — `creation_id` 필수. 처리 대기 권장(평균 30초).
   (현재 코드베이스엔 미구현 — Instagram의 `lib/meta/instagram-publish.ts` 2단계 폴링 패턴을 그대로
   이식하면 된다. TODO로 남겨둔 후속 작업.)

### 인사이트

- 계정: `GET /{threads-user-id}/threads_insights?metric=<csv>` — `views`, `likes`, `replies`, `reposts`,
  `quotes`, `clicks`, `followers_count`, `follower_demographics`. `since`/`until`는 2024-04-13 이전 미지원.
- 게시물: `GET /{threads-media-id}/insights?metric=<csv>` — `views`, `likes`, `replies`, `reposts`, `quotes`, `shares`.
- **불확실성(TODO):** 응답이 IG처럼 `total_value`(합계) vs `time_series`(일별 배열) 두 형태로 나뉘는지
  공식 문서로 확정하지 못했다. `lib/meta/threads.ts`의 `extractTotal()`이 두 형태를 모두 방어적으로
  파싱하도록 구현했으니, 실 테스터 계정 연동 후 로그를 보고 필드별 실제 포맷을 재검증할 것.
  `followers_count`는 일별 시계열이 아닌 `period=lifetime` 스냅샷값으로 가정했다(팔로워 순증감·일별
  추이 차트는 이 가정이 맞을 때까지 항상 0/빈 배열로 폴백).

### 게시물 목록

`GET /{threads-user-id}/threads?fields=id,media_type,media_url,permalink,text,timestamp,is_quote_post` —
페이지네이션 목록. 답글은 `/replies`, 멘션은 `/mentions`, 발행 한도는 `/threads_publishing_limit`
(참고용 — 핀치가 아직 쓰지 않음).

### 프로필/미디어 CDN

Threads는 인스타그램과 같은 Meta 인프라(`*.cdninstagram.com`, `*.fbcdn.net`)를 쓴다 — `proxy.ts`의
기존 CSP `img-src` 허용목록이 그대로 커버하므로 추가 도메인이 필요 없다.

## 6. TikTok Login Kit + Display API (2026 조사본)

구현 파일: `lib/tiktok/oauth.ts`, `lib/tiktok/api.ts`, `app/api/auth/tiktok/*`. 출처는 전부
developers.tiktok.com/doc 하위 페이지(login-kit-web, login-kit-desktop, oauth-user-access-token-management,
tiktok-api-v2-get-user-info, add-a-sandbox) + bulletin(user-info-scope-migration).

**현재 구현 범위(정직 고지):** 심사 없이 확인된 범위는 `GET /v2/user/info/`의 기본 프로필
(팔로워·좋아요·영상 수·아바타·닉네임)뿐이다. 영상 목록(`video.list`)·조회수/참여율 등 인사이트 계열은
아래 5항 사유로 미구현이며, 설정 화면에도 "상세 분석은 앱 심사 후 제공"으로 고지한다.

### 접근 수준 — 사업자등록·앱심사 불요로 바로 개발 가능

Sandbox 모드 + target user(테스터 계정, 최대 10개까지 등록) 조합으로 심사 없이 바로 연동·테스트할 수
있다. Sandbox 설정 > "Add account"에서 해당 계정으로 로그인 + TikTok Developer ToS 동의, 반영까지
최대 1시간 소요. 제3자 계정 서비스로 정식 출시하려면 App Review + 비즈니스 인증이 필요(추후 작업).

### OAuth 플로우 및 PKCE 결정

1. 인가(리다이렉트): `GET https://www.tiktok.com/v2/auth/authorize/`
   - params: `client_key`(필수), `response_type=code`(필수), `scope`(필수, 콤마구분), `redirect_uri`(필수),
     `state`(필수, CSRF), `disable_auto_auth`(선택, 미사용)
   - **PKCE 미사용**: 파라미터 목록에 `code_challenge`가 없고, `code_verifier`는 Desktop/Mobile(공개
     클라이언트) 전용으로 문서에 명시돼 있다. 핀치는 client_secret을 서버에 보관하는 confidential
     client(웹 서버사이드)이므로 PKCE를 적용하지 않는다. TODO: 실무에서 문서와 실제 동작이 다르다는
     보고가 있어 완전히 배제하긴 어렵다 — 인가 요청이 `invalid_request`류로 거부되면 가장 먼저 의심할 것
     (Desktop 규격 참고: `code_verifier`는 `[A-Za-z0-9\-._~]` 43~128자, `code_challenge`는 SHA256의
     **hex 인코딩**(표준 base64url이 아님), `code_challenge_method=S256`).
2. code → 토큰: `POST https://open.tiktokapis.com/v2/oauth/token/` (`Content-Type: application/x-www-form-urlencoded`)
   - form: `client_key`, `client_secret`, `code`, `grant_type=authorization_code`, `redirect_uri`(일치必)
   - 반환: `{ access_token, expires_in(24시간), open_id, refresh_token, refresh_expires_in(365일), scope, token_type=Bearer }`
3. 리프레시: 동일 엔드포인트, form: `client_key`, `client_secret`, `grant_type=refresh_token`, `refresh_token`
   - 응답의 `refresh_token`이 기존 값과 다를 수 있어(회전) 매번 재저장 필요.

**IG/Threads와의 근본적 차이:** IG/Threads는 "장기토큰이 자기 자신을 갱신"하는 모델이라
`access_token_cipher` 컬럼 하나로 충분했지만, TikTok은 access_token(24시간)·refresh_token(365일)이
분리된 표준 OAuth2 모델이라 `refresh_token_cipher` 컬럼을 별도로 추가했다(0011 마이그레이션).
액세스 토큰 수명이 24시간뿐이라 크론(`app/api/cron/refresh-tokens`)이 매일 돌지 않으면 대시보드를
방문하지 않는 사용자의 연동이 조용히 끊긴다 — `daysUntil`(하루 단위 올림)로는 갱신 시점을 안정적으로
판별할 수 없어 `lib/data/live.ts`의 `ensureFreshTiktokToken`은 시간 단위(`hoursUntil`)로 판단한다.

### 프로필 조회 — `GET /v2/user/info/?fields=<csv>` (스코프별 필드)

Authorization 헤더에 `Bearer <access_token>`. 최근 스코프 마이그레이션으로 필드 범위가 스코프별로
쪼개졌다(출처: bulletin/user-info-scope-migration):

- `user.info.basic`: `open_id`, `union_id`, `avatar_url`, `avatar_url_100`, `avatar_large_url`, `display_name`
- `user.info.profile`: `bio_description`, `profile_deep_link`, `is_verified`, `username`
- `user.info.stats`: `follower_count`, `following_count`, `likes_count`, `video_count`

핀치는 세 스코프를 모두 요청해 `open_id, avatar_url, display_name, username, follower_count,
following_count, likes_count, video_count`를 조회한다(`bio_description`은 최소 권한 원칙상 미요청 —
설정 화면 권한 목록과 1:1). 응답 봉투는 `{ data: { user: {...} }, error: { code, message, log_id } }`이고
`error.code`가 `"ok"`가 아니면 실패로 처리한다.

### 영상 목록·인사이트 — 미구현(TODO, 심사 필요 여부 미확정)

공식 문서엔 "Sandbox는 앱 심사 없이 통합을 시연하는 용도"라고만 돼 있고, `video.list`가 Sandbox에서
심사 없이 완전히 동작한다는 명시적 확답은 확보하지 못했다. Content Posting API(공개 영상 게시)·Data
Portability API는 Sandbox 미지원이 문서에 명확히 명시돼 있다. 따라서 이 구현은 영상 목록/인사이트를
호출하지 않고, 대시보드의 TikTok 채널은 `posts: []`/`contentMix: []`/`EMPTY_TREND`/참여율 0으로
정직하게 비워둔다(`lib/data/live.ts`의 `computeTiktokPiece`). TODO: 실제 테스터 계정으로 `video.list`를
시험 호출해 Sandbox 동작 여부를 확인한 뒤 인사이트 어댑터를 추가할 것.

### 프로필 사진 CDN

TikTok avatar_url은 매 응답마다 서명된 전체 URL로 내려오는 방식이라 공식 문서에 고정 CDN 호스트명이
명시돼 있지 않다. `proxy.ts`의 CSP `img-src`에는 널리 확인되는 도메인 패턴(`*.tiktokcdn.com`,
`*.tiktokcdn-us.com`)만 최소 허용해 뒀다. TODO: 첫 테스터 계정 연동 후 실제 `avatar_url` 호스트를
로그로 확인해 필요시 좁히거나 보정할 것.

### client_key/client_secret 발급 위치

https://developers.tiktok.com → "Manage apps" → 앱 생성("Connect an app") 후 App details 상단에
Client Key(=App ID), Client Secret이 표시된다.
