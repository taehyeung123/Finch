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
