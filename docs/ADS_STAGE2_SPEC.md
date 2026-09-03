# 메타 광고 2단계 — 광고 세트 · 소재 · 광고 생성 구현 스펙 v1.0

작성 기준: 2026-09-03 · **Graph/Marketing API 현행 v26.0**(2026-07-29 출시, 변경 로그 실측 — https://developers.facebook.com/docs/graph-api/changelog ) ·
저장소 고정값 `GRAPH_FB_VERSION = "v25.0"`(`lib/meta/ads-oauth.ts:19`, 2028-07-29 까지 지원. Marketing API v24.0 은 2026-10-06 종료).

> **이 스펙의 근거는 문서 실측이지 실서버 실측이 아니다.** `META_APP_ID` 가 아직 없어 광고 토큰이 0개고, 실 호출은 한 번도 안 나갔다.
> 본문의 표기: **확인** = developers.facebook.com 현행 문서에서 원문 확인 · **추정** = 문서 정황·예제로 유추 · **미확인** = 문서에 없음(§11 미확정 목록에 번호로 모았다).
> 조사 노트 6차원(adset · targeting · creative · ad-preview · permissions · codebase)에 없는 사실은 적지 않았다. 첫 실 호출(§10 슬라이스 0 뒤)에서 §11 을 순서대로 지운다.

1단계(캠페인 계층)는 커밋 `1f47b40`·`b51f023` — `lib/meta/ads-write.ts` · `lib/ads/campaign-rules.ts` · `app/(finch)/(app)/ads/campaigns/actions.ts` · `supabase/migrations/0081_meta_ad_write_log.sql`.
현황 정본은 `docs/API_ROADMAP.md` 4절, 제품 범위는 `PRD.md` 4.7.

---

## 0. 결론 먼저

1. **한 마법사, 3단계, 서버 제출 1회, 전부 PAUSED.** 기존 PAUSED 캠페인 행의 «광고 만들기» → ① 광고 세트 ② 소재 ③ 미리보기·확인 → 서버 액션 하나가 `adsets → adcreatives → ads` 를 **한 pending 예약 안에서** 순서대로 만든다. 마법사 안에서는 어떤 경우에도 돈이 나갈 수 없다(캠페인 PAUSED + 광고 세트 예산 없음(CBO) + 광고 세트·광고 PAUSED — 세 겹).
2. **게재 시작은 기존 행 버튼 하나**를 유지하되, 사전 점검(하위 광고의 심사·거부 상태)과 «일시중지된 광고 세트·광고도 함께 켜기»를 붙인다. 켜는 순서는 **광고 세트 → 광고 → 캠페인(마지막)** — 중간에 실패하면 캠페인이 PAUSED 로 남아 한 푼도 안 나간다.
3. **v1 소재는 단일 이미지 + 링크**뿐이다. 영상·캐러셀·기존 게시물 광고·픽셀 전환 최적화·수동 노출 위치 격자는 2차(§9).
4. **스코프는 지금 늘린다**: `["ads_read","ads_management"]` → `+ "pages_show_list", "pages_read_engagement"`(둘 다 권한 레퍼런스가 `ads_management` 의 **선언된 의존 권한**으로 적은 값). 지금이 재동의 비용이 0 인 유일한 시점이다(발급 토큰 0개). `instagram_basic`·`pages_manage_ads` 는 넣지 않는다(§3).
5. **이미지는 서버 액션 FormData(File) → Meta `adimages` multipart** 로 보낸다. Storage 를 경유하지 않는다(4.5MB 벽 아래로 클라이언트가 먼저 줄인다). 영상은 2차이며 그때 공개 버킷 + `file_url` 경로(§4).
6. **미리보기는 `generatepreviews`**(생성 전, 누구나 열람, 사용자 토큰) — `INSTAGRAM_STANDARD`·`INSTAGRAM_STORY`·`INSTAGRAM_REELS`·`MOBILE_FEED_STANDARD` 4종을 폰 프레임 안 iframe 으로. `proxy.ts` frame-src 에 `https://www.facebook.com` 을 **앱 경로에만** 연다(§5).
7. **마이그레이션 0082 하나**: `meta_ad_write_log.action` 확장 + `adset_id`/`ad_id` 컬럼, `meta_ad_accounts` 에 광고 페이지·IG 계정·최소 예산 캐시 컬럼(§6).
8. **1단계에서 손봐야 시작되는 것 3가지**(슬라이스 0): 캠페인 생성에 `bid_strategy=LOWEST_COST_WITHOUT_CAP` 명시(안 보내면 CBO 하위 광고 세트가 `bid_amount` 없이는 실패할 수 있다 — 추정), `writeErrorCode` 가 `error_subcode` 와 7자리 코드를 읽도록, `fbPost` 옆에 multipart 헬퍼.

---

## 1. 사용자 흐름

### 1.1 진입

- `/ads/campaigns` 목록의 **PAUSED 캠페인 행**에 «광고 만들기»(secondary). ACTIVE 행에는 없다 — 게재 중인 캠페인에 광고를 덧붙이는 것은 생성 즉시 노출이 될 수 있어 2차에서 별도 확인 모달과 함께 연다.
- 목표가 `OUTCOME_LEADS`·`OUTCOME_APP_PROMOTION`(광고 관리자에서 만든 기존 캠페인)이면 버튼 대신 «이 목표는 아직 핀치에서 광고를 만들 수 없어요» 툴팁(`campaign_objective_unsupported`, §8).
- 라우트: `/ads/campaigns/[campaignId]`(상세 — 광고 세트·광고 목록, 슬라이스 1) · `/ads/campaigns/[campaignId]/ads/new`(마법사). `ads` 는 이미 예약어(`0078`·`lib/links/reserved.ts`)라 예약어 마이그레이션이 필요 없다.
- viewer 는 버튼을 보지 못한다. 그러나 **서버 액션이 유일한 관문**이다(`getAdsWriteContext` 의 role 검사 + 0081 insert RLS) — 화면 숨김은 예의지 방어가 아니다.

### 1.2 ① 광고 세트 — 타겟 · 일정 · 노출 위치

상태는 클라이언트에 모으고(데모 마법사 `STEPS` + `stepIssues` 패턴, `demo-wizard.tsx:269-301`) 서버 제출은 ③ 에서 한 번.

| 입력 | v1 범위 | 직렬화(§2.3) |
|---|---|---|
| 지역 | «전국» 기본. 시·도 다중 선택(검색은 서버 액션 `adgeolocation`, `country_code=KR`, `location_types=['region']`) | `geo_locations.countries:["KR"]` 또는 `geo_locations.regions:[{key}]` |
| 연령 | 18~65+ 기본. «타겟 자동 확장» 켜짐이면 최소 18~25 만, 최대 65+ 고정(Advantage+ audience 규칙, 확인). 끄면 13~65 | `age_min`, `age_max` |
| 성별 | 전체/남/여 | 생략 / `[1]` / `[2]` |
| 관심사 | 선택(0~N). 검색은 서버 액션 `adinterest&locale=ko_KR` → `{id,name}` 저장 | `flexible_spec:[{interests:[{id,name}]}]` |
| 타겟 자동 확장 | 토글, **기본 켜짐**(권장 라벨) | `targeting_automation.advantage_audience: 1/0` — **항상 명시** |
| 노출 위치 | 2택: «자동(권장)» · «인스타그램만» | 자동 = 위치 키를 **하나도 안 보냄** / 인스타만 = `publisher_platforms:["instagram"]` |
| 시작 | «지금» 또는 날짜·시각(계정 `timezone_name` 표기) | `start_time`(UTC UNIX) — **항상 보낸다**(생략 시 기본값이 문서에 없다) |
| 종료 | «종료 없음» 기본 또는 날짜 | 생략 / `end_time`(UNIX) — §11-6 |
| 예산 | **입력 없음.** «이 캠페인의 일 예산 {formatMoney} 안에서 자동 배분돼요(캠페인 예산)» 안내만 | 광고 세트에 `daily_budget`/`lifetime_budget` 을 **넣지 않는다**(1885621, 확인) |
| 예상 도달 | `reachestimate` 의 `users_lower_bound~upper_bound` 를 «지난달 활성 사용자 약 N~M명»으로. 실패·`estimate_ready=false` 면 칸을 숨긴다(0 이나 «너무 좁음» 판정을 만들지 않는다) | GET, 생성 없음 |

잠금 규칙(전부 화면+서버 공유, `lib/ads/adset-rules.ts` 신설):
- **18세 미만 포함**(`age_min < 18`): 성별 전체 고정 · 관심사 비움 · 자동 확장 **끔 고정**(켜면 `age_min` 18~25 만 허용). 데모의 `includesMinors` 규칙과 같다.
- **특별 광고 카테고리(캠페인에서 읽음)** 중 `EMPLOYMENT`·`HOUSING`·`CREDIT`·`FINANCIAL_PRODUCTS_SERVICES` 가 있으면: 연령 18~65+ 고정, 성별 전체 고정, 관심사 비움(상세 타겟 제외·행동 타겟 불가 — 확인), 지역은 전국·시·도만(v1 은 어차피 그뿐). `ISSUES_ELECTIONS_POLITICS` 는 타겟 제한 없음(확인).
- **기존 광고 세트가 있는 캠페인**: 자동 입찰 CBO 에서는 모든 광고 세트의 `optimization_goal` 이 같아야 한다(확인). 기존 것의 goal 이 우리 표(§2.2)와 같으면 그대로, 다르면 `campaign_mixed_goals` 로 막는다.

### 1.3 ② 소재 — 이미지 · 문구 · 링크 · CTA · 페이지/IG

| 입력 | 규칙 |
|---|---|
| 게시 주체 | 저장된 «광고 페이지 · Instagram 계정»(§3.3, `meta_ad_accounts.ad_page_id / ad_ig_user_id`)을 읽기 전용으로 보여준다. 없으면 이 단계에 «페이지 선택» 인라인 모달(슬라이스 2)을 띄우고 완료 전엔 다음으로 못 간다 |
| 이미지 | 1장. JPG/PNG, 원본 ≤ 30MB, **짧은 변 ≥ 600px**, 비율 4:5 ~ 1.91:1(권장 1:1 또는 4:5 1440×1800). 클라이언트가 캔버스로 정규화한 뒤(§4.2) 서버 액션으로 올리고 `image_hash` 를 받는다. 업로드는 ③ 제출과 **별개 액션**이다 |
| 본문(`message`) | 권장 125자, 차단 1024자 |
| 제목(`name`) | 권장 40자, 차단 255자 |
| 설명(`description`) | 선택. «Facebook 피드에서만 보여요» 메타 문구(IG 는 무시 — 확인). 차단 255자 |
| 링크(`link`) | **v1 은 필수**(4목표 공통). 기본값 = 사용자의 프로필 링크 주소(`finch.ai.kr/{slug}`)가 있으면 그것. https 만. `caption`(표시 URL)은 링크의 호스트로 자동 |
| CTA | 목표별 소수(§2.6). 미선택 시 IG 는 «더 알아보기»가 기본(확인)이므로 기본값 `LEARN_MORE` |
| 광고 이름 | 자동 `«{캠페인 이름}» 광고 {n}` — 접혀 있는 «이름 바꾸기»로만 수정. 광고 세트 이름도 같은 규칙(400자 상한, 확인) |

오른쪽에는 자체 폰 목업(데모 마법사의 인스타 피드 목업을 `_components/ad-preview.tsx` 로 분리, `demo-wizard.tsx:962-1058`)이 타이핑을 즉시 반영한다. 라벨은 **«대략적인 모습이에요 — 실제 모습은 다음 단계에서»**. 렌더러가 둘인 상황(`CLAUDE.md` 의 프로필 링크 함정)이라 목업은 «입력 확인용», 메타 iframe 이 «정본»임을 화면이 말해야 한다.

### 1.4 ③ 미리보기 · 확인 → 생성

- 탭 4개: 인스타 피드 · 스토리 · 릴스 · 페이스북 피드. 탭을 열 때 `generatepreviews` 를 부르고 세션 동안 재사용(§5).
- 요약 카드: 목표 라벨(`objectiveLabel`) · 타겟 한 줄 · 일정 · «예산: 캠페인 일 예산 {formatMoney} 안에서» · 페이지/IG · 링크.
- 제출은 `ConfirmSubmit`(`components/ui/confirm-submit.tsx`): 제목 **«광고를 만들어요 — 아직 게재되지 않아요»**, 설명에 «만든 뒤 캠페인 목록에서 게재 시작을 눌러야 노출이 시작되고 비용이 발생해요. 심사는 만들자마자 시작돼요(보통 24시간 안에 끝나요).»
- 성공 → `/ads/campaigns/[campaignId]?created=ad` 로 이동, 상세 화면의 광고 행에 «심사 중» 배지.
- 실패 → 단계별 인라인(`values` echo — `campaign-form.tsx:27-51` 관례). **부분 성공**(광고 세트는 생겼는데 소재/광고 실패)은 별도 문구 `partial_created` 와 함께 상세 화면으로 보낸다(§7.5).

### 1.5 게재 시작(기존 행 버튼의 확장)

`campaign-row-actions.tsx:45-62` 의 ACTIVE 전환 모달을 데이터 기반으로 바꾼다. 서버가 먼저 `/{campaign_id}/adsets?fields=id,name,status,effective_status` 와 `/{campaign_id}/ads?fields=id,name,status,effective_status,ad_review_feedback` 을 읽어:

| 상태 | 모달 |
|---|---|
| 광고 0개 | «이 캠페인에는 아직 광고가 없어 켜도 비용이 발생하지 않아요» — 허용(지금과 같다) |
| PAUSED 하위가 있음 | 체크박스 «일시중지된 광고 세트 N개·광고 M개도 함께 켜기»(기본 켬, 이름 나열). 켬이면 서버가 **광고 세트 → 광고 → 캠페인** 순으로 ACTIVE(한 예약, action `activate_tree`) |
| `PENDING_REVIEW` 있음 | 경고 «심사 중인 광고 N개는 승인 전까지 노출되지 않아요» — 허용 |
| 전부 `DISAPPROVED` | 차단 `children_disapproved` |
| 일부 `DISAPPROVED` | 경고 + 허용 |
| 조회 실패(null) | **fail-closed** `campaign_unverified` — 돈 경로다 |

일시중지(PAUSED 전환)는 지금처럼 가볍게 캠페인만 끈다(하위는 `CAMPAIGN_PAUSED` 로 자동 정지 — 확인).

---

## 2. API 호출 순서와 파라미터

### 2.1 순서(마법사 한 번)

```
[②에서]  P1  POST /act_{id}/adimages            multipart  → images.<file>.hash        (3점)
[③ 탭]   P2  GET  /act_{id}/generatepreviews    creative 스펙 + ad_format → iframe   (탭당 1회)
[③ 제출 — 서버 액션 createAdTreeAction, pending 예약 1건]
         0   GET  /{campaign_id}?fields=account_id,objective,status,bid_strategy,daily_budget,lifetime_budget,special_ad_categories
             → 소유 대조(account_id) + 규칙 입력. null 이면 fail-closed
         0'  GET  /{campaign_id}/adsets?fields=optimization_goal,status  → 기존 goal 잠금 · 개수(최소 예산 경고)
         1   POST /act_{id}/adsets      execution_options=["validate_only"]     (확인)
         2   POST /act_{id}/adcreatives execution_options=["validate_only"]     (확인)
         3   POST /act_{id}/adsets      → {id}                 status=PAUSED
             ↳ pending 행 request.adset_id 갱신
         4   POST /act_{id}/adcreatives → {id}
             ↳ request.creative_id 갱신
         5   POST /act_{id}/ads         execution_options=["validate_only"]     (확인) — adset_id·creative_id 가 있어야 검증된다
         6   POST /act_{id}/ads         → {id}                 status=PAUSED
         ↳ settle ok (adset_id, ad_id 컬럼)
```

- 1·2 를 먼저 돌리는 이유: 실패 확률이 가장 높은 두 검증(타겟팅 조합·페이지/IG 권한)을 **아무것도 만들기 전에** 끝낸다. 광고 검증(5)은 부모 id 가 필요해 뒤로 갈 수밖에 없다.
- 각 응답의 `usage.utilPct` 를 읽어 **90 이상이면 다음 쓰기 전에 멈춘다**(`rate_limited`) — 지금 `actions.ts` 는 usage 를 한 번도 읽지 않는다(코드베이스 노트). 개발 등급은 60점·쓰기 3점이라 한 마법사(≈ 21점 + 검색·미리보기)가 두 번 겹치면 300초 차단이다.
- 왕복 6회 ≈ 12~15초. `maxDuration` 60초(Hobby 상한, `app/api/cron/pool-finalize/route.ts:21` 주석) 안이다.
- ⚠️ **쓰기 자동 재시도 금지**는 그대로다(`ads-write.ts:12-18`).

### 2.2 목표별 광고 세트 파라미터 표(v1 고정값 — 화면에 선택지를 주지 않는다)

| 캠페인 목표 | `destination_type` | `optimization_goal` | `billing_event` | `promoted_object` | 근거·신뢰도 |
|---|---|---|---|---|---|
| `OUTCOME_TRAFFIC` | `WEBSITE` | `LINK_CLICKS` | `IMPRESSIONS` | 없음 | 제한 표 «트래픽/웹사이트 {LANDING_PAGE_VIEWS, LINK_CLICKS, IMPRESSIONS, REACH}», 매핑표 promoted_object «—» — **확인** |
| `OUTCOME_AWARENESS` | 생략(«해당 없음») | `REACH` | `IMPRESSIONS` | `{"page_id"}` — 매핑표가 인지도 전 행에 page_id 를 적었다 | goal·billing **확인**, page_id 필요 여부 **추정**(§11-5) |
| `OUTCOME_ENGAGEMENT` | `ON_POST` | `POST_ENGAGEMENT` | `IMPRESSIONS` | 없음 | 제한 표 «게시물 {POST_ENGAGEMENT, IMPRESSIONS, REACH}», v20+ ON_POST 의 IMPRESSIONS 최적화 폐기 — **확인**. 단 `object_story_spec` 으로 새로 만든 소재가 ON_POST 에 허용되는지 **미확인**(§11-4). 폴백: `ON_PAGE` + `PAGE_LIKES` + `{"page_id"}`(공식 예제, 확인) |
| `OUTCOME_SALES` | `WEBSITE` | `LINK_CLICKS` | `IMPRESSIONS` | 없음(픽셀 없음) | LINK_CLICKS 가 판매/웹사이트 허용 목록에 있음 **확인**. 픽셀(promoted_object) 생략 가능 여부 **미확인**(§11-2). 거절되면 `sales_pixel_required` 로 «트래픽 목표로 만들어 주세요» 안내. 픽셀 선택 + `OFFSITE_CONVERSIONS` 는 2차 |

- `billing_event` 는 기본값이 문서에 없으므로 **항상 `IMPRESSIONS` 명시**(확인). AUCTION 에서 IMPRESSIONS 외 청구가 되는 goal 은 LINK_CLICKS·THRUPLAY·TWO_SECOND_CONTINUOUS_VIDEO_VIEWS 뿐이다(확인) — v1 은 쓰지 않는다.
- 2차 후보(표시만 해 둔다): 트래픽 `LANDING_PAGE_VIEWS`, 인지도 `AD_RECALL_LIFT`, 참여 `ON_VIDEO`+`THRUPLAY`(영상), 판매 `OFFSITE_CONVERSIONS`/`VALUE`(`{pixel_id, custom_event_type}` 필수 — 확인), 트래픽 `INSTAGRAM_PROFILE` 목적지(허용 goal·청구 이벤트 미확인).
- `promoted_object` 를 **둘 이상 넣으면 1487929**(확인). 표대로 한 종류만.
- `OUTCOME_SALES` 광고 생성에는 `conversion_domain`(링크의 호스트)을 함께 보낸다 — «픽셀과 데이터를 공유하는 캠페인에 필수»(확인). 픽셀 없는 판매 캠페인에서 받아들여지는지 **미확인**(§11-3).

### 2.3 광고 세트 파라미터(전체)

| 파라미터 | 값 | 신뢰도 |
|---|---|---|
| `name` | 자동 이름, ≤ 400자 | 확인 |
| `campaign_id` | 경로 검증(`^\d{1,30}$`)을 통과한 id | — |
| `status` | `"PAUSED"` 상수 | 확인(생성 시 ACTIVE·PAUSED 만 유효) |
| `optimization_goal` / `billing_event` / `destination_type` / `promoted_object` | §2.2 | — |
| `targeting` | JSON 문자열, 아래 | — |
| `start_time` | UNIX 초(UTC). «지금» = 현재 | 형식 확인, 생략 기본값 미확인 → 항상 보냄 |
| `end_time` | 사용자가 종료일을 골랐을 때만 UNIX 초. 과거면 1487033 | «lifetime_budget 있을 때만 필수» 확인. CBO 하위에서 생략 vs `0` 은 §11-6 |
| `execution_options` | 검증 호출에만 `["validate_only"]` | 확인 |
| 보내지 않는 것 | `daily_budget`·`lifetime_budget`(CBO — 1885621), `bid_amount`(자동 입찰), `bid_strategy`(CBO 는 캠페인이 정함 — 확인), `dsa_payor`/`dsa_beneficiary`(EU 밖은 저장도 안 됨 — 확인), `is_dynamic_creative` | 확인 |

`targeting` 직렬화 예(자동 확장 끔, 서울 · 여성 · 25~44 · 관심사 1개 · 인스타만):

```json
{
  "geo_locations": { "regions": [{ "key": "<adgeolocation key>" }] },
  "age_min": 25, "age_max": 44,
  "genders": [2],
  "flexible_spec": [{ "interests": [{ "id": "<id>", "name": "<name>" }] }],
  "publisher_platforms": ["instagram"],
  "targeting_automation": { "advantage_audience": 0 }
}
```

- «전국» = `{"countries":["KR"]}`. 시·도를 골랐을 때 `countries` 를 **함께 보내면 합집합이 되어 전국이 된다**(geo 항목은 OR) — 그래서 regions 만 보낸다. «국가 1개 필수» 규칙과 충돌하는지 **미확인**(§11-15). validate_only 가 거절하면 v1 은 전국만 열고 시·도는 2차.
- 자동 확장 켬(`advantage_audience:1`)이면 `age_max` 를 보내지 않고 `age_min` 은 18~25 만(확인). 성별·관심사는 «제안값»으로 넘어서 노출된다 — 화면 문구는 «…을 우선하되 넘어서도 보여줘요». **«입력한 그대로 적용됩니다»(데모 478행) 문구는 v23+ 에서 거짓이다.**
- `location_types` 는 `['home','recent']` 하나뿐이라 보내지 않는다(확인). «거주자만» 같은 옵션을 만들지 않는다.
- 노출 위치 «자동» = `publisher_platforms`·`*_positions` 를 **모두 생략**(확인 — 생략이 곧 Advantage+ 노출 위치). «인스타만» = `publisher_platforms:["instagram"]` 만(positions 생략 = 그 플랫폼 기본 위치 전부). v26 에서 Explore 명시는 오류, `messenger_positions.story` 는 조용히 제거(확인) — 위치 키를 안 보내므로 v1 은 영향이 없다.
- `targeting_optimization`(상세 타겟 확장)은 보내지 않는다 — 링크 클릭 최적화에서는 확장이 강제라 필드를 넣으면 거부된다(추정). 화면에 «정확히 이 관심사만» 이라고 쓰지 않는다.
- 관심사 id 는 **저장하지 않고**(v24 통합으로 썩는다 — 확인) 제출 직전 `/act_{id}/targetingvalidation`(`id_list`) 로 재검증한다. 실패한 id 는 `targeting_deprecated` 로 되돌린다.

### 2.4 CBO 규칙과 캠페인 쪽 선행 수정

| 규칙 | 근거 | 우리 조치 |
|---|---|---|
| 캠페인 예산과 광고 세트 예산은 둘 중 한 곳만 | 1885621, 확인 | 광고 세트에 예산 필드 없음 |
| CBO 에서 `bid_strategy` 는 캠페인이 정한다. 캠페인 생성 시 지정 안 하면 `LOWEST_COST_WITH_BID_CAP` 이 기본이라는 문장이 캠페인 레퍼런스에 있고, BID_CAP/COST_CAP 이면 광고 세트마다 `bid_amount` 필수 | 추정(문서 진술, 실서버 미확인 — §11-1) | **슬라이스 0**: `campaignParams`(`ads-write.ts:116-127`)에 `bid_strategy: "LOWEST_COST_WITHOUT_CAP"` 추가(Advantage 캠페인 예산 가이드 예제 전부가 그렇게 보낸다 — 확인). 기존 캠페인은 호출 0 에서 `bid_strategy` 를 읽어 BID_CAP/COST_CAP 이면 `campaign_bid_cap` 으로 막는다 |
| 자동 입찰 CBO 는 모든 광고 세트 goal 동일 | 확인 | 기존 goal 잠금(§1.2) |
| 캠페인 예산 ≥ 광고 세트 수 × 최소 | 2238055, 확인 | `minimum_budgets` 캐시(§6)로 **경고**만(차단 아님 — 단위·기준 미확인 §11-29), Meta 거절은 `budget_too_low` 로 번역 |
| 캠페인당 광고 세트 200개, 광고 세트당 광고 50개 | 확인 | 초과는 Meta 오류로 |
| v24: 광고 세트 예산을 쓰려면 캠페인 `is_adset_budget_sharing_enabled` 필요 | 확인 | CBO 라 무관. ABO 는 2차 |
| 특별 카테고리 선택 시 `special_ad_category_country` | 정치는 필수(확인), 주택·고용·금융은 세금 국가 기본값(가이드에만 있음 — §11-22) | **슬라이스 0**: `ISSUES_ELECTIONS_POLITICS` 선택 시 `special_ad_category_country: ["KR"]` 추가. 정치 광고는 계정 인증도 필요(2708008) |

### 2.5 소재 · 광고 파라미터

`POST /act_{id}/adcreatives`(확인된 필드만):

```json
{
  "name": "«{캠페인}» 광고 {n}",
  "object_story_spec": {
    "page_id": "<ad_page_id>",
    "instagram_user_id": "<ad_ig_user_id>",
    "link_data": {
      "link": "https://…",
      "message": "<본문 ≤1024>",
      "name": "<제목 ≤255>",
      "description": "<설명 ≤255, 선택>",
      "caption": "<링크 호스트>",
      "image_hash": "<adimages hash>",
      "call_to_action": { "type": "LEARN_MORE", "value": { "link": "https://…" } }
    }
  },
  "degrees_of_freedom_spec": {
    "creative_features_spec": {
      "adapt_to_placement":     { "enroll_status": "OPT_OUT" },
      "description_automation": { "enroll_status": "OPT_OUT" },
      "inline_comment":         { "enroll_status": "OPT_OUT" }
    }
  }
}
```

- `instagram_actor_id` 는 v22 폐기 · 2025-09-09 전 버전 종료(확인) — `instagram_user_id` 만 쓴다.
- `call_to_action.value.link` 는 `link_data.link` 와 같아야 한다(확인).
- `degrees_of_freedom_spec`: 문서가 «기본 opt-in»으로 적은 키는 위 3개뿐(확인). **끄는 이유는 미리보기와 게재본을 같게 두기 위해서다**(이 저장소의 «편집기와 발행본이 다르다» 회귀 원칙). 부적격 키 OPT_IN/OUT 은 조용히 무시된다(확인). `standard_enhancements` 키 자체는 보내지 않는다(3858504 사례 — 추정). 생성 뒤 `GET /{creative_id}?fields=degrees_of_freedom_spec` 으로 실제 값을 한 번 읽어 §11-20 을 지운다.
- 이름 ≤ 100자(확인). 소재 내용은 만든 뒤 수정 불가(수정 가능 필드는 name·adlabels·status·account_id — 확인) → «수정» = 새 소재 + 광고의 creative 교체(2차).

`POST /act_{id}/ads`:

| 파라미터 | 값 | 신뢰도 |
|---|---|---|
| `name` | 광고 이름 | 필수, 확인 |
| `adset_id` | 3 의 id | 필수, 확인 |
| `creative` | `{"creative_id": "<4 의 id>"}` | 필수·형식 확인 |
| `status` | `"PAUSED"` | 확인 |
| `conversion_domain` | `OUTCOME_SALES` 에만 링크 호스트 | 요건 확인, 픽셀 없는 경우 미확인 |
| `execution_options` | 검증 호출에만 `["validate_only"]`(`synchronous_ad_review` 는 단독 불가·최종 아님 — 확인, v1 안 씀) | 확인 |
| `tracking_specs` | 보내지 않음(기본이 자동으로 붙는다 — 확인) | 확인 |

### 2.6 CTA 표(목표별 노출)

한국어 라벨 → `call_to_action.type`(enum 값 확인, 목표별 배정은 제품 결정):

| 목표 | 노출하는 CTA |
|---|---|
| 판매 | `SHOP_NOW` 지금 구매 · `BUY_NOW` 바로 구매 · `ORDER_NOW` 지금 주문 · `GET_OFFER` 혜택 받기 · `LEARN_MORE` 더 알아보기 |
| 트래픽 | `LEARN_MORE` · `SIGN_UP` 가입하기 · `BOOK_NOW` 예약하기 · `CONTACT_US` 문의하기 · `DOWNLOAD` 다운로드 · `SUBSCRIBE` 구독하기 |
| 인지도 | `LEARN_MORE` · `WATCH_MORE` 더 보기 · `NO_BUTTON` 버튼 없음 |
| 참여 | `LEARN_MORE` · `SEE_MORE` 더 보기 · `FOLLOW_PAGE` 페이지 팔로우 · `NO_BUTTON` |

데모 마법사의 CTA 7종 한국어 문자열은 이 표로 대체한다(코드에 매핑이 없었다 — 코드베이스 노트).

---

## 3. 페이지 · IG 요구사항과 스코프 변경안

### 3.1 무엇이 필요한가

- 소재(`object_story_spec`)는 **`page_id` 가 사실상 필수**(레퍼런스 required 표기는 없으나 예제 전부·IG 가이드가 필수 — 추정 §11-9). 인스타 노출에는 `instagram_user_id` 도 필요(확인). 즉 «페이지 없는 광고»는 없다 — 페이지 없이 되는 것은 캠페인·광고 세트·이미지 업로드까지다(추정).
- 토큰 주인은 그 페이지에 **ADVERTISE 과업**이 있어야 한다(Pages API 과업표 — 추정). `/me/accounts` 응답의 `tasks` 배열로 걸러 ADVERTISE 가 없는 페이지는 목록에서 뺀다.
- IG 계정은 페이지에 연결된 것(또는 페이지 기반 IG 계정 PBIA)이어야 하고 소재에는 같은 페이지를 쓴다(확인).
- ⚠️ **개발 모드 앱이 만든 `object_story_spec` 소재로는 광고를 못 만든다**(100 / 서브코드 1885183 — 추정, 커뮤니티·SDK 이슈 다수). 캠페인·광고 세트는 이 제약 대상이 아니다. 소재 슬라이스(5·6)의 실 테스트는 **앱 Live 전환**이 전제다(§11-10).

### 3.2 스코프 변경안

```ts
// lib/meta/ads-oauth.ts:41
export const META_ADS_SCOPES = ["ads_read", "ads_management", "pages_show_list", "pages_read_engagement"] as const;
```

| 스코프 | 왜 | 근거 |
|---|---|---|
| `pages_show_list` | `/me/accounts`(페이지 목록·tasks) 조회. IG 시작 가이드도 이 권한으로 `/me/accounts` 를 부른다 | 권한 레퍼런스·IG 가이드 — 추정 |
| `pages_read_engagement` | 권한 레퍼런스가 `ads_management` 의 **Dependencies** 로 `pages_read_engagement, pages_show_list` 를 명시. `/me/accounts` 오류 문구가 요구하는 «확장 권한» 후보이기도 하다 | 의존 표기 확인, 강제 여부 미확인(§11-8) |
| 넣지 않음 `instagram_basic` | IG 그래프 경로(`/{page-id}?fields=instagram_business_account`)에만 필요(확인). 우리는 Marketing API 경로(§3.3)를 먼저 쓴다. 의존 권한(`pages_read_user_content`)까지 딸려 와 동의 화면·검수가 길어진다 | 확인 |
| 넣지 않음 `pages_manage_ads` | `/act_{id}/promote_pages` 에 필요(확인)하지만 `/me/accounts` 로 대체. `adcreatives` 생성에 필수라는 공식 문장은 없다(§11-9) | 추정 |
| 넣지 않음 `business_management` | 필요 근거를 문서에서 찾지 못했다 | — |

**왜 지금이 안전한가**: 스코프는 동의 시점에 고정된다(`granted-scopes.ts` 헤더). 광고 연동은 `META_APP_ID` 미설정이라 콜백이 `unconfigured` 로 즉시 반환(`app/api/auth/meta-ads/callback/route.ts:67-70`) — **이 흐름으로 발급된 토큰이 0개**다. 지금 늘리면 재동의 비용 0, 소재 기능을 연 뒤 늘리면 전원 재연동(인스타 발행 권한에서 이미 겪은 함정, `ads-oauth.ts:26-31`).
비용: 늘린 스코프마다 Advanced Access 검수 스크린캐스트가 붙는다(고객 광고 계정 대행 시 — `ads_read` 포함 **모든** 스코프가 Advanced 여야 한다. 저장소 주석의 «Standard 로 검수 불필요»는 앱 역할 사용자(사장님 본인)에게만 참이다 — 확인). 본인 계정 실측 단계에서는 Standard 로 충분하다.

동의 화면 라벨(`META_ADS_SCOPE_LABELS`, 고객이 본다 — 내부 용어 금지):

```ts
pages_show_list:       "광고를 게시할 Facebook 페이지 목록 확인",
pages_read_engagement: "광고에 사용할 페이지 정보 읽기",
```

함께 고칠 것: `missingScopes(channel)`(`granted-scopes.ts:48-55`)이 `"instagram" | "threads"` 만 받아 광고 연동의 «재연동 필요» 배지를 못 만든다 → `"meta_ads"` 채널 추가(`META_ADS_SCOPES` 대조). `REQUIRED_SCOPE` 에 `pagesList: "pages_show_list"` 를 두고, 소재 액션은 `checkScope(…, pagesList)` 가 `missing` 이면 `scope_missing_pages`.

### 3.3 페이지 · IG 조회와 저장(슬라이스 2)

조회 순서(전부 서버, 사용자 토큰):

1. `GET /me/accounts?fields=id,name,tasks` → `tasks` 에 `ADVERTISE` 가 있는 페이지만.
2. IG 계정 — 권한 표기가 없는 Marketing API 경로부터: `GET /act_{id}/instagram_accounts`(광고 계정에 연결된 IG, 확인) → 없으면 `GET /{page-id}/instagram_accounts?fields=id,username`(페이지 토큰 + 페이지 ADVERTISER 역할, IG 계정 역할 불필요 — 추정. 페이지 토큰은 요청 안에서만 쓰고 **저장·로그 금지**) → 그래도 없으면 «인스타그램 계정이 페이지에 연결돼 있지 않아요. Meta Business Suite 에서 연결한 뒤 다시 시도해 주세요»(`instagram_required`). PBIA 생성(`POST /{page-id}/page_backed_instagram_accounts`)은 2차.
3. 저장: `meta_ad_accounts.ad_page_id / ad_page_name / ad_ig_user_id / ad_ig_username`(0082, §6). 광고 계정마다 하나. 쓰기는 소유자만(0077 RLS 그대로 — editor 는 바꿀 수 없다, 읽기는 팀 전원).
4. 저장 액션의 검증: 제출된 `page_id` 가 1 의 목록에, `ig_user_id` 가 2 의 목록에 **있어야** 저장한다(클라이언트 hidden 값을 믿지 않는다 — `campaignId` 규칙과 같다).

---

## 4. 미디어 업로드

### 4.1 결정 — Storage 를 경유하지 않는다(v1 이미지)

| 경로 | 판정 |
|---|---|
| (A) 브라우저 → 서버 액션 **FormData(File)** → 서버가 Meta `adimages` multipart | **채택.** 이미지는 클라이언트가 먼저 줄여 ≤ 2.5MB(서버 하드캡 4MB, Vercel 4.5MB 벽 아래). 새 버킷·RLS·고아 정리·`USER_BUCKETS` 갱신이 없다. Meta 가 계정 이미지 라이브러리에 보관하므로 사본이 필요 없다 |
| (B) 브라우저 → Storage 서명 업로드 → 서버가 내려받아 Meta 로 | 영상(2차)용. `links/actions.ts:891-966` 패턴 그대로 + **새 공개 버킷**(`link-assets` 는 20MB 상한·MIME 목록에 mp4 없음) + `lib/account/delete.ts:16` `USER_BUCKETS` 추가. `advideos` 에는 `file_url`(공개 URL, Meta 가 가져감 — cardnews 와 같은 방식)로 넘겨 60초 함수 예산을 피한다 |
| (C) data URL 을 서버 액션 본문에 | **금지.** base64 +33% 가 4.5MB 벽에 걸린다(`links/actions.ts:886`, `post-composer.tsx:188-196` 실측 주석) |

⚠️ `next.config.ts:11` 의 `bodySizeLimit: "25mb"` 는 Next 상한일 뿐 Vercel 함수 본문 4.5MB 가 실제 벽이다(추정, 저장소 실측 주석 두 곳).

### 4.2 서버 액션 `uploadAdImageAction(formData)`

1. `passGates()` 통과(§7 — 돈은 안 나가지만 쓰기 3점이고 계정 라이브러리에 남는다). **pending 예약은 하지 않는다**(생성 체인의 잠금과 충돌 — 마법사 흐름상 제출 전에 끝난다).
2. `File` 검증(서버): 크기 0 < n ≤ 4MB · **매직 바이트**로 JPEG/PNG 판정(브라우저 MIME 은 OS 마다 다르다 — `links/actions.ts:888`) · PNG IHDR / JPEG SOFn 에서 폭·높이 파싱(외부 의존성 없이 수십 줄) → 짧은 변 ≥ 600, 비율 0.8 ≤ w/h ≤ 1.91(허용오차 1%).
3. Meta: `POST /act_{id}/adimages` multipart — 파일 필드 이름이 곧 파일명이고 **확장자가 있어야 한다**(`ad_{uuid}.jpg`, 확인). 토큰은 본문 필드 `access_token`. `cache:"no-store"`. 새 헬퍼 `fbPostForm(path, FormData, token)` 을 `ads-write.ts` 에 추가(기존 `fbPost` 는 쿼리스트링 전용이라 바이트를 못 싣는다 — `ads-write.ts:72`).
4. 응답 `images.<파일명>.{hash,url,url_128,width,height}` → 클라이언트에 `{hash, url_128, width, height}` 만 돌려준다.
5. 감사 로그에는 넣지 않는다(게재 객체가 아니다). hash 는 제출 시 request jsonb 에 남는다(§6.3).

클라이언트 정규화(`post-composer.tsx:96-130` 관례를 광고용 상수로 분리): 긴 변 ≤ 1800px(4:5 권장 1440×1800), JPEG 0.85 → 2.5MB 초과 시 0.72, PNG 투명은 흰 바탕. 원본 30MB 초과·비율 밖은 **업로드 전에** 안내(«1:1 또는 4:5 이미지가 가장 잘 나와요»).

### 4.3 영상은 1차 범위 밖이다

이유: (1) `advideos` 청크 절차의 현행 원문·호스트(`graph-video.facebook.com`)·권장 청크 크기가 구 가이드 검색 요약뿐(추정), (2) 처리 완료 폴링(`GET /{video_id}?fields=status`)이 Video 노드 필드 표에서 안 보였다(§11-14), (3) 썸네일(`image_url`/`image_hash`) 필수 여부 미확인, (4) 새 버킷·60초 함수 예산·4GB 상한 설계가 이미지와 전혀 다르다. 이미지 경로가 실서버에서 한 번 돌아간 뒤 (B) 로 붙인다.

---

## 5. 미리보기

### 5.1 `generatepreviews` 를 쓴다(소재 생성 전)

| | `GET /act_{id}/generatepreviews` | `GET /{creative_id}/previews` · `/{ad_id}/previews` |
|---|---|---|
| 시점 | 소재를 만들기 전 — 마법사 ③ 에 맞다 | 만든 뒤 — 상세 화면(2차) |
| 가시성 | **누구나** 열람(확인) | 광고 계정에 역할 있는 사람만(확인) → 고객 브라우저의 Facebook 로그인·3rd-party 쿠키 의존 가능성(§11-12) |
| 입력 | `creative`(스펙 JSON — `object_story_spec` 에 `page_id`+`instagram_user_id` 필수, 확인) + `ad_format` | `ad_format` |
| 토큰 | **사용자 토큰**(페이지 토큰 불가 — 확인). `getAdsWriteContext` 가 주는 것이 그것 | 동일 |

`ad_format` 4종(공식 정의문 있는 IG 3종 확인, FB 피드 값은 이름·예제 근거 추정):
`INSTAGRAM_STANDARD`(피드) · `INSTAGRAM_STORY` · `INSTAGRAM_REELS` · `MOBILE_FEED_STANDARD`(FB 모바일 피드).
`INSTAGRAM_EXPLORE_CONTEXTUAL` 은 목록에 남아 있지만 v26 에서 Explore 게재가 사라져 후보에서 뺀다(확인).

응답 `{"data":[{"body":"<iframe src=\"https://www.facebook.com/ads/api/preview_iframe.php?d=…&t=…\" width=\"274\" height=\"213\" …>"}]}` — 서버가 `src`·`width`·`height` 만 정규식으로 뽑아 돌려주고 클라이언트가 **우리 `<iframe>`** 을 그린다(`dangerouslySetInnerHTML` 금지). `src` 호스트가 `www.facebook.com` 이 아니면 버린다.
유효기간 **24시간**(확인) — DB 저장 금지, 클라이언트 세션 상태에만. 탭당 1회, 소재 입력이 바뀌면 무효화.
`width`/`height` 는 iframe 크기만 바꾸고 안의 광고 렌더 크기는 안 바뀐다(확인, 권장 최소 280×280). 스토리·릴스는 9:16 이라 `height` 도 준다(예 360×640).

### 5.2 폰 프레임 재사용과 크기

- `PhonePreview` 컴포넌트는 링크 편집기에 강결합(1,400줄)이라 import 하지 않는다. **클래스 레시피만** 가져온다: `overflow-hidden rounded-[42px] border-[9px] border-fg/15 bg-body aspect-[375/812] phone-frame`(+`phone-frame-lit` 호버, 측면 버튼 span 4개) — `phone-preview.tsx:311-341`, `app/globals.css:384-394`.
- 안폭 ≈ 357px. Meta 가 그리는 내부 폭은 문서에 없어 **첫 자격증명 뒤 320·360·375 로 실측**해 `transform: scale()` 계수를 정한다(§11-12). 그 전엔 iframe 을 안폭에 맞추고 세로 스크롤을 허용한다.
- ② 단계의 자체 목업(`ad-preview.tsx`)은 IG 피드 하나만(데모가 가진 것). 스토리/릴스 목업은 만들지 않는다 — 그건 ③ 의 iframe 몫이다.
- 미리보기 UI 언어(«Sponsored»·«Learn more»)는 `locale` 파라미터가 없어 무엇을 따르는지 미확인(§11-12).

### 5.3 CSP(`proxy.ts:170`)

```ts
// 앱 화면 전용 — 공개 프로필(/p) 에는 열 이유가 없다
const fbPreview = publicLink ? "" : " https://www.facebook.com";
`frame-src ${toss} ${youtube} ${musicEmbeds} https://postcode.map.daum.net https://postcode.map.kakao.com${fbPreview}`,
```

- 지금 상태로는 브라우저가 **조용히 빈 상자**를 그린다(확인). `connect-src` 는 손대지 않는다 — Graph 호출은 전부 서버다. `frame-ancestors 'none'`·`X-Frame-Options DENY` 는 «우리가 남에게 프레이밍되는 것»이라 무관(추정).
- `preview_iframe.php` 가 `web.`/`m.facebook.com` 으로 리다이렉트하면 `https://*.facebook.com` 으로 넓힌다 — 실측 항목(§11-12).
- 레이트리밋: 미리보기 전용 한도는 없고 계정 점수제(읽기 1점)·BUC(표준 300+40×활성 광고/시간, 80004)를 탄다(추정). 탭당 1회 + 세션 캐시면 마법사 한 번에 ≤ 4회.

---

## 6. 데이터

### 6.1 마이그레이션 `0082_meta_ad_tree.sql`(SQL Editor 수동 적용 — 코드는 `isMissingTableError`/컬럼 부재를 견딘다)

```sql
-- 광고 세트·광고 쓰기를 기록할 자리 — 0081 은 캠페인 4동작만 받는다(check 제약).
alter table public.meta_ad_write_log drop constraint if exists meta_ad_write_log_action_check;
alter table public.meta_ad_write_log add constraint meta_ad_write_log_action_check
  check (action in ('create','status','budget','name',
                    'create_ad',        -- 광고 세트→소재→광고 체인(한 행)
                    'status_adset',     -- 광고 세트 ACTIVE/PAUSED
                    'status_ad',        -- 광고 ACTIVE/PAUSED
                    'activate_tree'));  -- 게재 시작: 하위 켜기 + 캠페인 ACTIVE(한 행)
alter table public.meta_ad_write_log
  add column if not exists adset_id text,
  add column if not exists ad_id    text;

-- 광고 계정별 게시 주체 + 최소 예산 캐시. 토큰은 절대 넣지 않는다(페이지 토큰 포함).
alter table public.meta_ad_accounts
  add column if not exists ad_page_id      text,
  add column if not exists ad_page_name    text,
  add column if not exists ad_ig_user_id   text,
  add column if not exists ad_ig_username  text,
  add column if not exists min_daily_budget_imp         integer,
  add column if not exists min_daily_budget_high_freq   integer,
  add column if not exists min_daily_budget_video_views integer,
  add column if not exists min_daily_budget_low_freq    integer,
  add column if not exists min_budget_fetched_at        timestamptz;
```

- 제약 이름은 0081 이 이름 없이 `check (action in …)` 로 만들었으므로 Postgres 자동 이름(`meta_ad_write_log_action_check`)이다 — 적용 전 대시보드에서 실제 이름을 한 번 확인한다(0077:132-136 의 같은 패턴).
- RLS 는 기존 정책 그대로 — 새 컬럼은 같은 행이다. `meta_ad_accounts` 쓰기는 본인만(0077).
- 0082 미적용 상태의 동작: `create_ad` insert 가 check 위반(23514)으로 실패한다 → `reserveWrite` 가 지금은 그 외 오류를 fail-closed 로 막는다(`actions.ts:129-135`). **의도된 동작이다** — 광고 세트·광고는 캠페인과 달리 «게재될 것»이므로 로그 없이 만들지 않는다(캠페인 생성만 `no_table` 통과가 허용됐던 이유가 «만들어도 게재될 것이 없어서»였다 — `actions.ts:225-226`). 사용자 문구는 `not_ready`.

### 6.2 캐시할 것 / 안 할 것

| 데이터 | 캐시 | 어디 · 언제 | 이유 |
|---|---|---|---|
| `/act_{id}/minimum_budgets` | O | 0082 컬럼, 연동 콜백 + 24시간 지나면 상세 화면 진입 시 갱신 | 잘 안 바뀌고 폼 렌더(서버 컴포넌트)에 필요. KR 계정 2배 규칙은 이 엣지 값에 이미 반영된 것으로 읽는다(확인) |
| 선택한 페이지·IG **id·이름** | O | 0082 컬럼 | 소재 생성 필수값 |
| 페이지·IG **목록** | X | 선택 모달에서 매번 조회 | 역할·연결이 바뀐다 |
| 페이지 토큰 | **절대 X** | 요청 안에서만 | 자격증명 |
| 타겟팅 검색 결과·관심사 id | X | 검색 시점 결과만, 제출 직전 `targetingvalidation` | v24 통합으로 썩는다(확인) |
| 예상 도달(`reachestimate`) | X | 입력 바뀔 때 debounce 호출 | 추정치 |
| 미리보기 iframe | 세션만 | 클라이언트 상태 | 24시간 만료(확인) |
| 광고 세트·광고 목록 | X(렌더 내 `cache()`) | 상세 화면 진입마다 | 실패=null 규칙, 심사 상태가 바뀐다 |
| 이미지 hash | request jsonb + 클라이언트 상태 | — | Meta 라이브러리가 보관. 재시도 시 재업로드 불필요 |

### 6.3 감사 로그 `request` 에 담는 값(`create_ad` 한 행)

```json
{
  "campaign_id": "…", "objective": "OUTCOME_TRAFFIC",
  "adset": { "name": "…", "optimization_goal": "LINK_CLICKS", "billing_event": "IMPRESSIONS",
             "destination_type": "WEBSITE", "promoted_object": null,
             "targeting": { "geo": {"countries":["KR"]}, "age_min": 18, "age_max": null, "genders": [],
                            "interests": [{"id":"…","name":"…"}], "advantage_audience": 1, "placements": "advantage" },
             "start_time": 1760000000, "end_time": null },
  "creative": { "page_id": "…", "instagram_user_id": "…", "image_hash": "…",
                "link": "https://…", "cta": "LEARN_MORE", "message": "…", "name": "…", "description": null },
  "ad": { "name": "…", "conversion_domain": null },
  "steps": { "adset_validate": "ok", "creative_validate": "ok", "adset_id": "…", "creative_id": "…", "ad_validate": "ok" }
}
```

- 토큰·페이지 토큰·이미지 바이트 금지. `steps` 는 체인이 진행될 때마다 pending 행을 update 로 갱신한다(0081 settle 정책이 «본인 pending 행 update» 를 허용) — 함수가 중간에 죽어도 생긴 id 가 남는다.
- `activate_tree` 행: `{campaign_id, adset_ids:[…], ad_ids:[…], include_children: true, review_summary:{pending:N, disapproved:M}}` + 단계별 결과.

---

## 7. 안전장치(돈 경로)

### 7.1 1단계의 겹을 그대로 잇는다

`passGates()`(`actions.ts:53-87`) = 데모 → 설정 → 로그인 → 동의 → 역할(viewer·unknown 거절) → 토큰·통화 → 계정 상태 → 스코프 → 쿨다운. 새 액션 5개(이미지 업로드 · 페이지 저장 · 생성 체인 · 광고 세트/광고 상태 · 게재 시작 확장)가 **전부 이 함수로 시작**한다. 헬퍼(`passGates`·`reserveWrite`·`settleWrite`)는 파일 내부 함수라 `lib/ads/write-gates.ts` 로 끌어올리고 `actions.ts` 는 그것을 import 한다(동작 불변 — 슬라이스 0 회귀 점검 포인트).

| 겹 | 캠페인(1단계) | 광고 세트·소재·광고(2단계) |
|---|---|---|
| 상수 PAUSED | 캠페인 | 광고 세트·광고 모두 `"PAUSED"` 상수, 마법사에 토글 없음 |
| 돈이 나갈 조건 | 소재 없음 → 0 | 캠페인 PAUSED **그리고** 광고 세트 예산 없음(CBO) **그리고** 광고 세트·광고 PAUSED — 캠페인이 밖에서 켜져 있어도 마법사가 만든 것은 안 나간다 |
| 규칙(화면=서버) | `campaign-rules.ts` | `adset-rules.ts`·`creative-rules.ts` 신설 — 목표표·타겟 잠금·글자 수·이미지 규격·CTA 표 |
| validate_only | 생성 1회 | 광고 세트·소재는 **만들기 전**, 광고는 부모 생성 후(§2.1) — 세 엔드포인트 모두 지원 확인 |
| 소유 대조 | `fetchCampaignAccountId` | 캠페인: 호출 0 의 `account_id`. 광고 세트: `GET /{adset_id}?fields=account_id,campaign_id`. 광고: `GET /{ad_id}?fields=account_id,adset_id,campaign_id`. 계정 불일치 → `object_not_yours`, null → `object_unverified`(fail-closed). 모든 id 는 `^\d{1,30}$` |
| 연타 잠금 | pending 유니크 | **체인 전체가 예약 1건**(`create_ad`). 별도 액션 4번으로 쪼개면 두 번째부터 `busy`/`cooldown` 에 걸린다(코드베이스 노트). 이미지 업로드는 예약 없음(제출 전 단계) |
| 쿨다운 3초 | 확정 직후 | 같다. 체인이 끝난 뒤 3초 안의 «게재 시작»은 `cooldown` — 화면이 성공 뒤 상세로 이동하므로 실제로 부딪히지 않는다 |
| 고아 pending 60초 | — | 체인 ≤ 15초라 60초 안에 확정된다. 넘기면 같은 사용자의 다른 탭이 잠금을 지울 수 있다 — `maxDuration` 과 함께 60초 예산을 지킨다 |
| 감사 로그 없으면 | 생성은 통과, ACTIVE 만 차단 | **생성도 차단**(§6.1) |
| viewer | role 검사 + RLS | 같다 + 상세 화면의 버튼 숨김 |
| ConfirmSubmit | ACTIVE 전환 | ③ 제출(«아직 게재되지 않아요») · 게재 시작(예산·하위 개수·심사 상태를 문구에) · 광고 세트/광고 ACTIVE 단독 전환도 같은 모달 |
| usage 감시 | 없음 | 매 쓰기 뒤 `utilPct ≥ 90` 이면 중단(§2.1). `parseUsage` 는 `X-Business-Use-Case-Usage` 도 함께 읽는다(두 문서가 어긋난다 — §11-11) |

### 7.2 게재 시작 체인의 순서가 곧 안전장치다

`activate_tree`: 광고 세트 ACTIVE → 광고 ACTIVE → **캠페인 ACTIVE 마지막**. 하위를 먼저 켜도 캠페인이 PAUSED 면 `CAMPAIGN_PAUSED` 로 한 푼도 안 나간다(확인). 어느 단계가 실패하면 거기서 멈추고 캠페인은 PAUSED 로 남는다 — 되돌리기(보상 쓰기)가 필요 없다.

### 7.3 클라이언트를 믿지 않는다

- `campaignId`·`adsetId`·`adId`·`creativeId`·`image_hash`·`page_id`·`ig_user_id` 전부 hidden/상태값이다. id 는 정규식, hash 는 `^[a-f0-9]{32}$`(응답에서 본 형식으로 좁힌다 — 첫 실 호출에서 확인), page/ig 는 **저장된 값과 일치**해야 한다(제출값을 쓰지 않고 DB 값을 쓴다).
- 텍스트는 서버가 길이·개행·제어문자를 다시 검사한다. URL 은 `https:` 만, 길이 ≤ 1000(확인).
- 실패 사유는 코드만 URL·상태로 나른다(`ADS_WRITE_MESSAGES` 단일 출처 — URL 문구 주입 차단 원칙 유지).

### 7.4 광고 계정 스위처는 만들지 않는다

읽기(`getLiveAds`)·쓰기(`getAdsWriteContext`)·소유 대조 세 곳이 전부 기본 계정만 본다(코드베이스 노트). 2단계도 기본 계정 하나다 — 스위처를 붙이려면 세 곳에 같은 `adAccountId` 를 꿰어야 하고 그건 별도 작업이다.

### 7.5 부분 실패 방침

광고 세트(3)·소재(4)까지 생기고 광고(5·6)가 실패하면: **지우지 않는다**(DELETE 도 쓰기이고, PAUSED 광고 세트는 CBO 라 예산도 없어 비용 0, 소재는 게재 객체가 아니다). 로그 `steps` 에 id 를 남기고 `partial_created` 문구로 상세 화면에 보낸다. 다음 시도는 새로 만든다(광고 세트 200개 한도까지 여유). «이어서 만들기»(기존 광고 세트 재사용)는 2차.

---

## 8. 오류 코드 → 사용자 문구 · 검수 표시

### 8.1 파서 수정(슬라이스 0)

`writeErrorCode`(`ads-write.ts:170-178`)는 `code` 만 본다. 7자리 검증 오류는 문서 간에 위치가 갈린다(DSA 예제는 `error_subcode`, 오류 레퍼런스 샘플은 `code` — 추정) → **둘 다 본다**: `const k = [e.subcode, e.code]` 순으로 아래 표를 찾는다. 응답의 `error_user_title`·`error_user_msg`·`blame_field_specs` 는 `error_message` 컬럼에 함께 남긴다(내부용).

### 8.2 `ADS_WRITE_MESSAGES` 확장안(`campaign-rules.ts:69-93` 에 추가 — 키는 `AdsWriteFailCode` 유니온에 자동 편입)

| 키 | 트리거 | 문구 |
|---|---|---|
| `scope_missing_pages` | `checkScope(pages_show_list)=missing` | 이 연결에는 페이지 조회 권한이 없어요. 설정에서 다시 연결해 주세요. |
| `page_required` | 저장된 페이지 없음 | 광고를 게시할 Facebook 페이지를 먼저 선택해 주세요. |
| `instagram_required` | IG 조회 결과 없음 | 선택한 페이지에 연결된 Instagram 계정이 없어요. Meta Business Suite 에서 연결한 뒤 다시 시도해 주세요. |
| `campaign_objective_unsupported` | 목표가 4종 밖 | 이 캠페인 목표는 아직 핀치에서 광고를 만들 수 없어요. |
| `campaign_bid_cap` | `bid_strategy` ∈ {LOWEST_COST_WITH_BID_CAP, COST_CAP, LOWEST_COST_WITH_MIN_ROAS} | 이 캠페인은 입찰가 상한이 설정돼 있어 핀치에서 광고 세트를 만들 수 없어요. 메타 광고 관리자에서 만들어 주세요. |
| `campaign_mixed_goals` | 기존 광고 세트 goal 불일치 | 이 캠페인의 기존 광고 세트와 최적화 방식이 달라 추가할 수 없어요. |
| `budget_too_low` | 1885272 · 2238055 · 1885650 | 캠페인 일 예산이 광고 세트 수에 비해 적어요. 캠페인 예산을 올린 뒤 다시 시도해 주세요. |
| `bid_mismatch` | 1885204 | 입찰 설정이 캠페인과 맞지 않아요. 메타 광고 관리자에서 캠페인 입찰 전략을 확인해 주세요. |
| `end_time_past` | 1487033 | 종료 시각이 이미 지났어요. 종료일을 다시 골라 주세요. |
| `link_required` | 2446383 | 이 캠페인 목표에는 웹사이트 주소가 필요해요. |
| `special_category_targeting` | 2909035 | 특별 광고 카테고리 캠페인은 연령·성별·관심사 타겟을 제한해요. 타겟을 넓혀 주세요. |
| `verification_required` | 2859024 · 2708008 | 이 광고에는 메타 광고주 인증이 필요해요. 메타 광고 관리자에서 인증을 완료해 주세요. |
| `targeting_deprecated` | 1487694 · 2446394 · `targetingvalidation` 실패 | 선택한 관심사 중 더 이상 쓸 수 없는 항목이 있어요. 다시 골라 주세요. |
| `sales_pixel_required` | 판매 목표 광고 세트 validate_only 가 promoted_object 사유로 거절(코드 미확인 — 수집) | 이 판매 캠페인은 픽셀이 필요해요. 픽셀 없이 진행하려면 트래픽 목표 캠페인에서 광고를 만들어 주세요. |
| `account_blocked` | 1404078 | 광고 계정이 잠시 차단된 상태예요. 메타 광고 관리자에서 확인해 주세요. |
| `adset_limit` | 2695 | 이 캠페인에는 더 이상 광고 세트를 만들 수 없어요. |
| `creative_not_ready` | 100 + 1885183(개발 모드 앱) | 광고 소재 만들기는 아직 준비 중이에요. |
| `media_invalid` | 서버 이미지 검증 실패 | 이미지 형식이나 크기가 맞지 않아요. JPG·PNG, 짧은 변 600px 이상, 1:1 또는 4:5 비율이 좋아요. |
| `media_upload_failed` | adimages 실패(코드 매핑 없음) | 이미지를 광고 계정에 올리지 못했어요. 잠시 후 다시 시도해 주세요. |
| `preview_failed` | generatepreviews 실패 | 미리보기를 불러오지 못했어요. 광고는 그대로 만들 수 있어요. |
| `object_not_yours` / `object_unverified` | 소유 대조 | 이 광고는 현재 선택된 광고 계정의 것이 아니에요. / 광고 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요. |
| `partial_created` | 체인 부분 성공 | 광고 세트는 만들어졌지만 광고는 만들지 못했어요. 캠페인 화면에서 확인한 뒤 다시 만들어 주세요. |
| `children_disapproved` | 게재 시작 사전 점검 | 거부된 광고만 있어 게재를 시작할 수 없어요. 소재를 고친 뒤 다시 시도해 주세요. |
| 기존 `write_denied` 확장 | + 294(ads_management 확장 권한/허용 목록), + 3(capability 없음) | (문구 그대로) |
| 기존 `bad_input` 확장 | + 194(필수 파라미터 누락) | 입력값을 광고 계정이 받지 않았어요. 문구·링크·이미지를 확인해 주세요.(광고용 문구는 `bad_input_ad` 키로 분리 — 기존 문구가 «예산과 이름»을 말한다) |
| 기존 `rate_limited` | + BUC 80004 는 이미 포함. + `utilPct ≥ 90` 자체 중단 | (그대로) |

⚠️ «Error handling should be done using only the Error Codes. The Description string is subject to change» — 메시지 문자열 매칭 금지. `sales_pixel_required` 처럼 코드를 모르는 것은 첫 validate_only 로그에서 코드를 수집한 뒤 매핑한다(그 전엔 `bad_input_ad`).

### 8.3 검수(심사) 표시

- **API 에 `IN_REVIEW` 값은 없다** — 광고 관리자의 «In review» 가 `effective_status = PENDING_REVIEW` 다(확인). `meta-labels.ts:57` 이 이미 «심사 중»으로 매핑한다.
- 광고는 만들어지는 순간 심사에 들어가고, 끝나면 생성 때 고른 PAUSED 로 «되돌아간다»(확인). 즉 마법사 직후 상세 화면의 광고 행은 «심사 중», 며칠 뒤엔 «일시중지». PAUSED 로 만든 광고가 심사 중일 때 `effective_status` 가 무엇을 우선 보여주는지는 미확인(§11-21) — 화면은 `PENDING_REVIEW` 가 오면 그것을, 아니면 `status` 를 보여준다(`statusLabel` 규칙 그대로).
- 심사 상태는 **광고 단에서만** 보인다 — 캠페인·광고 세트 `effective_status` 에는 `PENDING_REVIEW`·`DISAPPROVED` 가 없다(확인). 목록 행 배지(«심사 중 N»)는 `GET /act_{id}/ads?fields=campaign_id,effective_status`(페이지 끝까지) 한 번으로 묶는다 — 캠페인마다 부르지 않는다. 실패하면 배지를 **숨긴다**(0 아님).
- 거부 사유: `GET /{ad_id}?fields=effective_status,ad_review_feedback,issues_info`. `ad_review_feedback.global`·`placement_specific.{facebook,instagram,…}` 은 `key→설명문` 맵(확인, 사유 key 목록 페이지는 404). v1 은 «거부됨 — 사유는 메타 광고 관리자에서 확인» + 접힌 «메타가 보낸 사유» 원문 표시. key 를 로그로 모아 한국어 표를 만든다(2차). `WITH_ISSUES` 는 `issues_info[].error_summary` 를 같은 자리에.
- 문구: «보통 24시간 안에 끝나요»(투명성 센터 원문 — 확인). «1시간 이내» 같은 커뮤니티 수치는 쓰지 않는다.
- 폴링·규칙 엔진은 만들지 않는다 — 상세 화면 진입 시 읽는다(Ad Rules 의 `effective_status` 필터는 SCHEDULE 규칙만 — 확인).

---

## 9. 범위 밖(2차로 미룸)과 이유

| 항목 | 이유 |
|---|---|
| 영상 소재 | §4.3 — 절차·폴링·썸네일·버킷·60초 예산이 전부 미확정 |
| 캐러셀(`child_attachments` 2~5장) | 이미지 N장 업로드·순서 UI·`message` 필수 규칙 — 단일 이미지가 실서버에서 돈 뒤 |
| 링크 없는 소재(`photo_data`) | 분기 하나가 늘고, v1 은 프로필 링크 주소를 기본 링크로 줄 수 있다 |
| 기존 게시물 광고(`object_story_id`) | IG 게시물 목록 조회·노출 위치 커스터마이즈 미지원(확인) 등 별도 흐름 |
| 수동 노출 위치 격자 | 의존 규칙(FB story 는 feed/IG story 동반 등)·v26 폐기 값·`meta-placements.ts` 자체 키 교체가 필요. `placement-selector.tsx` 는 제약을 하나도 강제하지 않는다(확인) |
| 시·군·구·우편번호·반경 | `cities` 의 `radius` 기본값 없음, 서울 «구»가 city 인지 subcity 인지 미확인(§11-15) |
| 픽셀·`OFFSITE_CONVERSIONS`·`VALUE`·`LANDING_PAGE_VIEWS` | 픽셀 목록 조회·이벤트 선택 UI. 판매 목표는 v1 에서 LINK_CLICKS 로만 |
| 잠재고객·앱 홍보 목표 | 리드 폼·앱 연결이 전제. `FORM_OBJECTIVES` 는 4종 유지 |
| PBIA 생성 | 페이지에 쓰는 POST + ADVERTISER 역할 — IG 미연결 사용자에게만 필요 |
| 표준 개선(Advantage+ creative) 켜기 | v1 은 3개 OPT_OUT 고정. 켜면 미리보기와 게재본이 달라진다 |
| `asset_feed_spec` 노출 위치별 소재(정사각/세로 두 장) | `is_dynamic_creative` 필요 여부 미확인(§11-24) |
| 광고 세트 예산(ABO)·총 예산·게재 시간대·입찰가 상한 | CBO 일 예산 캠페인만 만든다. ABO 는 v24 `is_adset_budget_sharing_enabled` 까지 얽힌다 |
| 소재 수정·광고 삭제·«이어서 만들기» | 내용 수정 = 새 소재 + 교체(확인). 삭제는 쓰기이고 되돌릴 수 없다 |
| 생성 후 미리보기(`/{ad_id}/previews`)·상세 화면 썸네일 | 로그인·쿠키 의존 가능성(§11-12) |
| 거부 사유 한국어 표 | key 목록 페이지 404 — 실 거부 로그로 수집 |
| EU 타겟·DSA(`dsa_payor/beneficiary`) | v1 은 KR 만. EU 를 열면 필수(확인) |
| 광고 계정 스위처 | §7.4 |
| 관심사 audience_size(«약 N만») | `adinterest` 응답에 없음(확인). `targetingsearch` 노드 필드 미확인(§11-16) — 있으면 슬라이스 4 에서 켠다 |
| ACTIVE 캠페인에 광고 추가 | 생성 즉시 노출 가능 — 별도 확인 모달 설계 후 |
| 크레딧·플랜 게이트 | 캠페인 쓰기가 무과금이라 같은 관례. 소재 카피 AI 를 붙일 때 `chargeGeneration` 과 함께 결정 |

---

## 10. 구현 슬라이스(각각 단독 커밋·빌드·린트 통과)와 소넷 점검 포인트

| # | 슬라이스 | 만드는 것 | 소넷 점검 포인트 |
|---|---|---|---|
| 0 | **기반 정비(화면 변화 0)** | `GRAPH_FB_VERSION` → `v26.0`(`ads-oauth.ts:19`, `graph.ts` 의 인스타 버전은 별개) · `campaignParams` 에 `bid_strategy=LOWEST_COST_WITHOUT_CAP` + 정치 카테고리 시 `special_ad_category_country:["KR"]` · `writeErrorCode` 가 subcode·7자리 표·194/294/3 처리 · `parseUsage` 가 BUC 헤더도 · `fbPostForm` 추가 · `META_ADS_SCOPES` 확장 + 라벨 + `missingScopes("meta_ads")` · `fetchMinimumBudgets` · 게이트 헬퍼를 `lib/ads/write-gates.ts` 로 이동 | 캠페인 생성·상태 전환 **동작 불변**(스냅샷: 보내는 파라미터 diff 가 `bid_strategy`·`special_ad_category_country` 뿐) · 라벨 Record 가 새 스코프 누락 시 컴파일 실패하는지 · 오류 파서 단위 테스트(code/subcode 양쪽) · 토큰이 로그·URL 에 새지 않는지 |
| 1 | **0082 + 조회 어댑터 + 상세 화면(읽기 전용)** | `0082_meta_ad_tree.sql` · `fetchCampaignDetail`·`fetchAdSets`·`fetchAds`(effective_status·ad_review_feedback·issues_info)·`fetchAccountAdsStatus` · `/ads/campaigns/[campaignId]` 목록 · 목록 행 «심사 중/거부» 배지 | **실패=null ≠ 빈 배열** 전 함수 · `act_` 접두 조립 · 페이지네이션 20장 경고 · 배지가 실패 시 숨는지 · 라벨은 `statusLabel` 재사용(새 맵 금지) · 빈 데이터 EmptyState |
| 2 | **페이지 · IG 선택 저장** | `/me/accounts`·IG 3경로 조회 · 선택 모달(설정 채널 화면 + 마법사 ② 인라인) · 저장 액션(목록 대조) | 페이지 토큰이 DB·로그·클라이언트 어디에도 없는지 · viewer/editor 차단(소유자만) · 제출값이 아닌 조회 목록으로 검증하는지 · 경쟁사 이름 0건 |
| 3 | **규칙 표(순수 함수 + 테스트)** | `lib/ads/adset-rules.ts`(목표표·타겟 직렬화·잠금·이름) · `lib/ads/creative-rules.ts`(글자 수·CTA 표·URL) · `lib/ads/image-spec.ts`(매직 바이트·치수 파서·비율) | 직렬화 출력이 §2.3 JSON 과 자구까지 같은지(스냅샷) · `advantage_audience` 가 **모든** 경로에서 명시되는지 · 자동 확장 켬 + `age_min>25` 가 불가능한지 · HEC-F 잠금 · 특별 카테고리 없이 `countries` 만일 때 DSA 필드가 없는지 |
| 4 | **타겟팅 검색 서버 액션 + 피커 재배선** | `adgeolocation(region, KR)`·`adinterest(ko_KR)`·`targetingvalidation`·`reachestimate` · `InterestPicker`/`RegionPicker` 를 `{id,name}`/`{key,name}` 타입으로(데모 마법사는 목 데이터 그대로 둔다) | 검색이 서버 전용·debounce · 결과를 DB 에 안 넣는지 · 도달 추정 실패 시 칸이 **사라지는지**(0 표기 금지) · «약 N만» 은 근거 있는 필드가 올 때만 · InfoTip 에 «메타가 추정한 지난달 활성 사용자 범위» 근거 |
| 5 | **이미지 업로드** | `uploadAdImageAction` · 클라이언트 정규화 · `fbPostForm` 실사용 | 서버 4MB 하드캡 · 매직 바이트 판정(확장자·MIME 불신) · data URL 경로 0건 · 오류 매핑(`media_invalid`/`media_upload_failed`) · 업로드 중 버튼 잠금 |
| 6 | **마법사 3단계 + 생성 체인** | `/ads/campaigns/[campaignId]/ads/new` · `createAdTreeAction`(예약 1건, validate 1·2 선행, steps 갱신, PAUSED 상수) · `ConfirmSubmit` · `values` echo · `ad-preview.tsx`(② 목업) | §7.1 표의 겹 하나하나 · id 정규식·hash 형식 · **status 가 PAUSED 외 값이 될 수 있는 코드 경로 0건** · 부분 실패 문구·로그 · usage 90 중단 · 입력 16px·타입 스케일 7단계·`bg-plate` 지면 직접 사용 0건·`tnum` · 모바일 1열에서 목업이 폼 아래로 |
| 7 | **미리보기** | `generatePreviewAction` · CSP frame-src(앱 경로만) · `<iframe>` 파싱·렌더 · 폰 프레임 레시피 · 탭 4개 세션 캐시 | `dangerouslySetInnerHTML` 0건 · src 호스트 화이트리스트 · 공개 프로필 응답의 frame-src 에 facebook 이 **없는지** · 탭 재진입 시 재호출 안 하는지 · 실패 시 `preview_failed` 배너와 제출 가능 |
| 8 | **게재 시작 확장 + 광고 세트/광고 상태** | 사전 점검 조회 · 모달 데이터화(«함께 켜기» 체크·심사 경고·거부 차단) · `activate_tree`(세트→광고→캠페인) · 상세 화면 행별 일시중지/시작(`status_adset`·`status_ad`) | **캠페인이 마지막**인지 · 조회 실패 시 fail-closed · 각 id 소유 대조 · 모달 문구에 예산·통화·개수 · 일시중지는 확인 가볍게 · 0082 미적용 시 ACTIVE 계열 전부 `not_ready` |
| 9 | **문서** | `docs/API_ROADMAP.md` 4절 · `PRD.md` 4.7 진행 기록 · `CLAUDE.md`(스코프 4종·프레임 CSP 한 줄) · 이 스펙 상단에 «구현 대조» 블록 | 마케팅·문서 문구가 코드와 일치하는지(기억으로 쓰지 않기) |

공통: 매 슬라이스 `npm run build`·`npm run lint`. 슬라이스 0 뒤 `META_APP_ID` 가 들어오면 **본인 계정·앱 역할 사용자**로 캠페인 → 광고 세트(validate_only)까지는 개발 모드에서 실측 가능하고, 소재(5·6)부터는 앱 Live 가 필요하다(§3.1).

---

## 11. 미확정 목록(open questions — 실 호출로 지운다)

1. CBO 캠페인을 `bid_strategy` 없이 만들면 실제로 `LOWEST_COST_WITH_BID_CAP` 이 기본인가(문서 진술). 기존 캠페인 `GET /{id}?fields=bid_strategy` 로 확인. 슬라이스 0 의 명시로 신규는 무관.
2. `OUTCOME_SALES` + `WEBSITE` + `LINK_CLICKS` 에서 `promoted_object`(픽셀) 생략이 되는가. 거절 시 오류 코드(→ `sales_pixel_required` 매핑).
3. 픽셀 없는 판매 광고에 `conversion_domain` 을 보내면 받아들여지는가 / 빼면 100 인가.
4. `object_story_spec` 으로 새로 만든 소재가 `destination_type=ON_POST` + `POST_ENGAGEMENT` 광고 세트에 허용되는가. 안 되면 참여 목표는 `ON_PAGE`+`PAGE_LIKES`+`page_id`(공식 예제) 로.
5. 인지도 광고 세트에 `promoted_object {page_id}` 가 필수인가(매핑표 정황). 넣어서 거절되지는 않는지.
6. CBO(일 예산) 하위 광고 세트에서 «종료 없음»이 `end_time` 생략인가 `end_time=0` 인가. 캠페인이 총 예산일 때 하위 `end_time` 필수 여부(핀치는 일 예산이라 당장 무관).
7. 7자리 검증 오류가 `code` 에 오는가 `error_subcode` 에 오는가(파서는 둘 다 본다 — 확정만 남음). `optimization_goal×billing_event` 불일치·`advantage_audience` 누락의 코드.
8. 권한 «Dependencies»(`ads_management → pages_read_engagement, pages_show_list`)가 OAuth/API 에서 강제되는가, 검수 묶음일 뿐인가. `ads_management` 만으로 `/act_{id}/instagram_accounts` 가 열리는가.
9. `pages_manage_ads` 가 `POST /act_{id}/adcreatives`(`object_story_spec.page_id`)에 필수인가. `page_id` 없이 소재 생성이 되는가(사실상 필수로 설계).
10. 개발 모드 앱이 실 광고 계정에 캠페인·광고 세트를 쓰는 것이 허용되는가(문서화된 실패는 소재 1885183 뿐).
11. v26 에서 광고 계정 레이트리밋의 정본 헤더가 `X-Ad-Account-Usage`(점수제) 인가 `X-Business-Use-Case-Usage`(BUC) 인가 — 첫 호출 로그로 둘 다 오는지 확인. 미리보기·업로드가 몇 점으로 계산되는가.
12. 미리보기: `generatepreviews` 4형식의 내부 렌더 폭·높이(scale 계수), `preview_iframe.php` 의 리다이렉트 호스트(frame-src 범위), UI 언어(로케일 근거), 생성 후 `/previews` 의 로그인·3rd-party 쿠키 의존.
13. `adimages` 의 API 레벨 파일 크기·픽셀 상한(Ads Guide 30MB 만 있음). 응답 `hash` 의 형식(32자 hex 로 좁혀도 되는가).
14. (2차) `advideos` 청크 절차 현행 원문·호스트·청크 크기, `GET /{video_id}?fields=status` 가 VideoStatus 를 주는가, `video_data` 썸네일 필수 여부.
15. `adgeolocation` 에 `locale=ko_KR` 이 먹는가, 한국어 질의로 시·도가 오는가, `regions` 만(국가 없이) 보내면 «국가 1개 필수»에 걸리는가, (2차) 서울 «구»가 city 인지 subcity 인지·`radius` 기본값·KR 우편번호 key 형식.
16. `/act_{id}/targetingsearch`·`targetingvalidation` 응답 노드(AdAccountTargetingUnified)의 필드 — `audience_size_lower_bound/upper_bound`·`valid` 가 실제로 오는가(«약 N만» 표기의 유일한 근거).
17. v26 «Instagram Explore Feed 제거»가 `explore` 만인가 `explore_home` 도인가(v1 은 위치 키를 안 보내 무관, 2차 수동 격자에서 필요).
18. `age_min<18` + 성별/상세 타겟 조합을 API 가 거절하는 코드·문구, 한국이 «청소년 기준이 18세보다 높은 국가»에 드는가.
19. «오디언스가 너무 좁음» 임계값 — 문서 근거 없음. v1 은 판정하지 않고 범위만 보여준다.
20. `degrees_of_freedom_spec` 을 생략/부분 지정했을 때 실제로 켜지는 기능 전체 — 생성 후 `GET /{creative_id}?fields=degrees_of_freedom_spec` 으로 확인.
21. PAUSED 로 만든 광고가 심사 중일 때 `effective_status` 가 `PENDING_REVIEW` 를 우선 보여주는가 — 게재 시작 게이트 문구에 영향.
22. 주택·고용·금융에서 `special_ad_category_country` 생략 시 세금 국가 기본값이 현행 캠페인 레퍼런스에도 유효한가(가이드에만 있음). KR 전용 타겟에 특별 카테고리 선언 의무가 없는지(문서는 미국·캐나다·유럽만 언급).
23. `CONVERSATIONS`·`QUALITY_CALL`·`VISIT_INSTAGRAM_PROFILE` 등 신형 goal 의 허용 `billing_event`(2차 «프로필 방문» 목적지에 필요).
24. (2차) `asset_feed_spec` 노출 위치 커스터마이즈에 광고 세트 `is_dynamic_creative=true` 가 필요한가. 규칙 상한 50/50 의 현행 출처.
25. 광고 세트에 `instagram_user_id` 파라미터가 v22.0+ 에 있다는 노트 — «인스타만» 노출 위치에서 광고 세트에도 넣어야 하는가(v1 은 소재에만).
26. `GET /act_{id}/minimum_budgets` 값의 단위(최소 단위인가 주 단위인가)와 «최적화 기준인가 청구 이벤트 기준인가» — KRW 는 지수 0 이라 한국 계정에서는 단위 차이가 없다. 경고 임계는 `imp`·`high_freq` 중 큰 값으로 보수 처리.
27. `/me/accounts` 응답으로 페이지 토큰을 받는 필드·권한(일반 경로이나 이번 노트에서 확정 못 함). 필요 없으면 §3.3 2 의 두 번째 경로를 뺀다.
28. 「마케팅 API로 광고 만들기 및 관리」 이용 사례가 실제로 묶는 필수/선택 권한(카탈로그 페이지 404) — 앱 대시보드에서 직접 확인. 늘린 스코프 4종의 Advanced Access 스크린캐스트 요건.
29. Facebook Login for Business 의 `scope` 파라미터(«가능하나 비권장») 존속 — `config_id` 로그인 구성·시스템 사용자 토큰(만료 없음) 전환 여부는 별도 결정.
30. 한국(KR) 광고 계정·한국어 사용자에 특유한 생성·검수·미리보기 제약은 이번 조사 범위 문서에서 발견되지 않았다 — «없음»을 확정한 것은 아니다.

---

## 12. 근거 URL(이번 조사에서 실제로 연 것)

- 변경 로그·버전: https://developers.facebook.com/docs/graph-api/changelog · /changelog/version26.0 · /version24.0 · /version23.0 · /version22.0 · https://developers.facebook.com/docs/marketing-api/versions
- 광고 세트: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign (성과 중심적 광고 경험 > 제한 사항 표, DSA, 예산 검증) · 캠페인 매핑표: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group#odax-mapping
- 청구 이벤트·입찰: https://developers.facebook.com/docs/marketing-api/bidding/overview/billing-events · /bidding/overview/bid-strategy · /bidding/guides/advantage-campaign-budget/ · 최소 예산: https://developers.facebook.com/docs/marketing-api/reference/minimum-budget/
- 특별 카테고리: https://developers.facebook.com/docs/marketing-api/special-ad-category
- 타겟팅: https://developers.facebook.com/docs/marketing-api/audiences/reference/basic-targeting · /advanced-targeting · /flexible-targeting · /placement-targeting · /targeting-search · Advantage+ audience: https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/reference/targeting-expansion/advantage-audience · 블로그 2025-06-13 · 상세 타겟 확장 블로그 2024-01-23
- 추정: https://developers.facebook.com/docs/marketing-api/reference/ad-account/reachestimate/ · /delivery_estimate/ · /targetingsearch · /targetingvalidation/
- 이미지·영상: https://developers.facebook.com/docs/marketing-api/reference/ad-image/ · /ad-account/adimages/ · /ad-account/advideos/ · https://developers.facebook.com/docs/graph-api/reference/video-status/ · Ads Guide(IG 피드·스토리·릴스·FB 피드): https://www.facebook.com/business/ads-guide/update/image/instagram-feed 외
- 소재: https://developers.facebook.com/docs/marketing-api/reference/ad-account/adcreatives/ · /ad-creative/ · /ad-creative-object-story-spec/ · /ad-creative-link-data/ · /ad-creative-link-data-call-to-action/ · /ad-creative-video-data/ · /ad-creative-photo-data/ · /ad-creative-features-spec/ · Advantage+ creative 시작: https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/advantage-creative/get-started · 노출 위치별 소재: https://developers.facebook.com/docs/marketing-api/dynamic-creative/placement-asset-customization/ · Threads 광고: https://developers.facebook.com/docs/marketing-api/ad-creative/threads-ads
- 페이지·IG: https://developers.facebook.com/docs/instagram/ads-api/guides/pages-ig-account/ · https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/ig-accounts-with-business-manager · https://developers.facebook.com/docs/marketing-api/reference/ad-account/instagram_accounts/ · /promote_pages/ · https://developers.facebook.com/docs/graph-api/reference/user/accounts/ · /page/ · https://developers.facebook.com/docs/pages-api/overview · https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started
- 광고·검수: https://developers.facebook.com/docs/marketing-api/reference/ad-account/ads/ · /adgroup/ · /adgroup-review-feedback/ · /adgroup-issues-info/ · /adgroup/previews/ · https://developers.facebook.com/docs/marketing-api/tracking-specs/ · https://developers.facebook.com/docs/marketing-api/ad-rules/overview/evaluation-spec/ · https://transparency.meta.com/policies/ad-standards/
- 미리보기: https://developers.facebook.com/docs/marketing-api/generatepreview/ · /reference/ad-account/generatepreviews/ · /reference/ad-creative/previews/ · https://developers.facebook.com/docs/instagram/ads-api/guides/get-ad-preview
- 권한·접근: https://developers.facebook.com/docs/permissions · https://developers.facebook.com/docs/graph-api/overview/access-levels · https://developers.facebook.com/docs/marketing-api/overview/authorization · /overview/rate-limiting · https://developers.facebook.com/docs/graph-api/overview/rate-limiting/ · https://developers.facebook.com/docs/development/build-and-test/app-modes · https://developers.facebook.com/docs/facebook-login/facebook-login-for-business · 오류 레퍼런스: https://developers.facebook.com/docs/marketing-api/error-reference

---

## 13. 검토 반영 결정 (v1.1 — 2026-09-03, 비판 검토 2렌즈 30건 중 반영 25건)

위 본문(v1.0)은 초안 그대로 두고, 검토에서 확정된 **변경은 이 절이 우선**한다. 구현은 이 절 기준이다.

**돈·잠금 (blocker·major)**
1. **일시중지(PAUSED 전환)는 pending 잠금·쿨다운을 거치지 않는다.** 로그는 남기되 예약 없이 ok/failed 행을 바로 쓴다. editor 의 체인이 죽어 pending 이 남아도 소유자가 캠페인을 끌 수 있어야 한다(«끄는 걸 막는 쪽이 더 위험하다»). 0082 에서 unlock/settle RLS 를 «actor 본인 **또는** 워크스페이스 소유자» 로 넓히고, `reserveWrite` 의 고아 정리는 (user_id, ad_account_id) 기준으로 60초 지난 pending 을 지운다.
2. **전송 실패(code=null)를 «실패»로 단정하지 않는다.** 상태 쓰기(status·activate_tree·status_adset·status_ad)는 전송 실패 시 즉시 `GET /{id}?fields=status,effective_status` 로 실제 상태를 읽어 관측값으로 settle 하고, 그마저 실패면 새 코드 `status_unverified`(«게재 상태를 확인하지 못했어요. 목록에서 상태를 확인해 주세요»). `fbPost`/`fbPostForm`/`fbGet` 에 `AbortSignal.timeout(15_000)`. 체인 전체 예산 ≤ 45초.
3. **게재 시작 «함께 켜기» 기본값**: 핀치가 이 화면에서 만든 하위(write_log `create_ad` 의 adset_id/ad_id 와 일치)만 기본 켬. 그 밖의 PAUSED 하위는 이름을 나열하되 **기본 해제**. 서버는 클라이언트 id 목록을 믿지 않고 «캠페인 하위 조회 결과 ∩ 체크된 id» 만 켠다. 광고 0개인 세트는 목록에서 뺀다.
4. **이미지 업로드도 기록·제한한다**: write_log `action='upload_image'`(pending 없음, 쿨다운 대상 아님), (actor, 5분) 슬라이딩 윈도 8회 초과 시 `cooldown`, 직전 `utilPct ≥ 90` 이면 `rate_limited`, `file.size` 는 바이트 읽기 **전**에 검사, 이미지 교체 시 이전 hash 재사용(재업로드 금지).
5. **상세 화면(읽기)도 소유 대조**: `fetchCampaignDetail` 의 `account_id` ≠ 선택 계정이면 `notFound()`, null 이면 «캠페인 정보를 확인하지 못했어요»(빈 화면 아님). 하위 조회는 `/{campaign_id}/adsets`·`/{campaign_id}/ads` 엣지로만.
6. **페이지·IG 조회는 실패(null)와 0건([])을 가른다**: null → `pages_unverified`/`instagram_unverified`(«…확인하지 못했어요. 잠시 후 다시 시도해 주세요»), 권한 오류(10/200/294) → `scope_missing_pages`, 세 경로 **모두 []** 일 때만 `instagram_required`.
7. **bid_strategy 막다른 길 제거**: 신규 캠페인은 `LOWEST_COST_WITHOUT_CAP` 명시(문서 원문 «during creation this is the default … LOWEST_COST_WITH_BID_CAP» — 확정). 기존 캠페인이 BID_CAP/COST_CAP 이고 (광고 세트 0개 또는 핀치 create 로그가 있음)이면 `campaign_bid_cap` 로 막지 않고 «입찰 전략을 자동으로 바꾸고 계속» 확인 뒤 `updateCampaign({bid_strategy})`(action `budget` 계열 예약)로 고친다.
8. **API 버전은 v25.0 유지**(슬라이스 0 의 «v26.0 으로 올림» 철회). v26 의 «샵 보유 광고주 소재 `destination_spec` 자동 WEBSITE_AND_SHOP» 이 미리보기=게재본 원칙과 어긋난다. v1 이 걱정한 v26 항목(advantage_audience 명시·Explore)은 «항상 명시·위치 키 미전송» 으로 v25 에서도 안전하다.
9. **스코프**: `pages_show_list`·`pages_read_engagement` 추가는 유지(권한 레퍼런스의 `ads_management` 의존 권한). `instagram_basic` 은 «넣지 않음(확인)» 이 아니라 **미확정** — META_APP_ID 투입 직후 사장님 계정(앱 역할, 재동의 비용 1명)으로 `/me/accounts?fields=id,name,tasks` → `/act_{id}/instagram_accounts` → `/{page-id}/instagram_accounts` 세 경로를 실측하고, 하나도 IG id 를 못 주면 그때 `instagram_basic` 을 더한다(«슬라이스 0.5»). 슬라이스 0 전에 `select count(*), granted_scopes from meta_ad_connections where connected` 로 «토큰 0개» 를 실측해 §3.2 와 actions.ts:61 주석 중 틀린 쪽을 고친다.

**파라미터·규칙 (minor 확정)**
10. `special_ad_category_country` 는 **카테고리가 비어 있지 않으면 항상** 보낸다(값은 타겟 국가 집합 — v1 은 `["KR"]`). 정치에만 붙이지 않는다.
11. «종료 없음» = `end_time: "0"` 명시(광고 세트 레퍼런스 원문). 생략하지 않는다. §11-6 은 «CBO 하위에서도 0 이 통하는지» 로 좁힌다.
12. `FORM` 노출 특별 카테고리에서 `CREDIT` 제거(2025-01-14 부로 `FINANCIAL_PRODUCTS_SERVICES` 가 대체). 라벨 «금융 상품·서비스 (대출·카드·보험 포함)». enum 은 조회용으로 유지.
13. `RATE_LIMIT_CODES` 에 4·80000·80003·80014 추가.
14. `reserveWrite`: `error.code === "23514"`(0082 미적용 check 위반) → `not_ready`.
15. `conversion_domain` 은 «호스트»가 아니라 eTLD+1 이다(`shop.brand.co.kr` → `brand.co.kr`, `finch.ai.kr` 은 `ai.kr` 이 공용 접미사). v1 은 픽셀 없는 판매 캠페인에 **보내지 않는다**(§11-3 이 풀릴 때까지). 보내게 되면 KR 2단계 접미사 표(`co.kr ne.kr or.kr re.kr pe.kr go.kr ac.kr ai.kr …`)로 추출 + 단위 테스트.
16. 거부 사유 **원문은 v1 화면에 내지 않는다** — «거부됨 — 사유는 메타 광고 관리자에서 확인» + 링크만. key 는 로그로만 수집.
17. 읽기도 점수를 쓴다: `fbGet` 도 usage 를 파싱, 검색은 최소 2자·400ms·세션 캐시, `reachestimate` 는 «예상 보기» 버튼 1회. `utilPct ≥ 70` 이면 검색·추정 잠시 비활성, `≥ 90` 이면 쓰기 차단.
18. CSP frame-src 는 **경로까지** `https://www.facebook.com/ads/api/preview_iframe.php`. iframe 에 `referrerPolicy="no-referrer"`.
19. 페이지·IG 저장은 소유자만(0077) — editor 에게는 모달 대신 `page_owner_only`(«광고 페이지 선택은 워크스페이스 소유자만 할 수 있어요. 소유자에게 요청해 주세요»). 저장 성공은 `.select()` 행 수로.
20. 부분 실패 뒤 재시도는 같은 캠페인의 마지막 `create_ad` failed 로그의 `steps.adset_id` 를 소유·PAUSED·광고 0개 확인 뒤 **재사용**(소재·광고만 새로). 빈 세트가 쌓여 `budget_too_low` 에 걸리는 것을 막는다.
21. 신뢰도 표기 정정: §2.3 «geo 는 OR 합집합» → 추정 · §6.2 «2배 규칙 반영(확인)» → 추정 · §1.2 «관심사 비움(확인)» → v1 제품 결정(문서는 승인 목록 내 포함 허용) · §3.1 ADVERTISE 필터 vs object_story_spec 의 Admin/Editor 요구 — 소재 validate_only 가 권한 오류(200/10/294)를 주면 새 키 `page_role_required`(«이 페이지에는 편집자 이상 역할이 필요해요») · §3.2 promote_pages 권한 → 추정 · 218행 OPT_OUT 무시 여부는 §11-20 으로 · 273행 스크린캐스트 요건 → 미확인(§11-28) · 181행 참조 → §11-26 · 499행 2695 는 iOS14 캠페인 그룹 한도(200개 초과 코드는 수집) · 516행 → «보통 24시간 안에 일시중지로 돌아온다» · 4행 v25.0 종료일은 Graph 표 기준(Marketing 은 TBD).
22. 안전 겹 표현 정정: 돈을 막는 것은 **두 겹**(캠페인 PAUSED + 광고 세트·광고 PAUSED 상수)이다. CBO 는 «광고 세트에 예산 필드를 안 보내는 이유(1885621)» 일 뿐 지출을 막지 않는다(§0-1·§7.1·§7.5 의 «세 겹»·«예산 없어 비용 0» 은 틀렸다).
23. 시·도 선택 시 `reachestimate` 는 `countries` 필수라 실패할 수 있다 → `countries:["KR"]` 로 «전국 기준» 라벨을 붙여 상한만 보여주거나 칸을 숨긴다(0·«너무 좁음» 금지 유지). regions-only 광고 세트가 «countries 필수» 에 걸리는지는 §11-15.

**반영하지 않은 것(이유)**: 슬라이스 0 에서 스코프 확정을 빼자는 제안 — 두 스코프는 의존 권한이라 지금 넣고, 미확정은 `instagram_basic` 뿐이다(9번). Full Access 전환 전 «제품 한계» 문구를 로드맵에 — 슬라이스 9 문서 항목으로 이관.

---

## 14. 구현 기록 (2026-09-03 — 슬라이스 0~9 완료)

| 슬라이스 | 커밋 | 구현이 스펙과 다른 점(의도) |
|---|---|---|
| 0 파서·스코프·마이그레이션 | ec105cd | — |
| 1 캠페인 상세 읽기 | daa2ca9 | React cache 인자 개수 고정(`loadReadContextCached(undefined)`), 표에 «옆으로 밀면» 안내 |
| 2 게시 주체 | 1688d6e | IG 조회는 **페이지 스코프(②③)가 정본**, 계정 전체(①)는 페이지 스코프가 비고 ①이 정확히 1건일 때만 채택. 190 → `expired`. 0082 미적용 저장은 `publisher_not_ready`(게재 시작의 `not_ready` 와 분리). 피커는 ModalShell |
| 3 규칙 | c7afdf6 | `IMAGE_HASH_RE` 는 16~128자 영숫자(32자 hex 로 좁히는 건 실측 뒤). `parseTargetingInput` 이 클라이언트 JSON 모양 검사를 맡는다 |
| 4 타겟 검색·도달 | c7afdf6 | 검색 실패 코드 `search_unverified`/`search_paused`(권한은 `scope_missing`), 도달 추정은 `estimate_unavailable` 로 칸을 숨긴다. 시·도만 실패하면 전국 기준 상한(§13-23). 실 연동 피커는 데모 피커와 **별개 컴포넌트** |
| 5 이미지 | c7afdf6 | `upload_image` 로그가 쿨다운을 만들지 않게 `passGates` 쿨다운 조회에서 제외. 직전 점수는 로그 `request.util_pct` 로 본다 |
| 6 생성 체인 | 07a362b | 게재 중(ACTIVE) 캠페인은 서버도 `campaign_active_create` 로 막는다. 전송 실패는 `create_unverified`. 캠페인 이름 기반 자동 이름은 클라이언트가 채우고 서버는 비었을 때만 대체 |
| 7 미리보기 | 07a362b | `AD_PREVIEW_FORMATS` 는 `lib/ads/preview-formats.ts`(순수) — 서버 전용 모듈을 클라이언트가 물지 않게. 자동 재시도 없음(«다시 시도» 버튼) |
| 8 게재 제어 | 07a362b | **목록의 «게재 시작»은 상세로 보내는 링크** — 데이터 기반 모달은 상세 화면에만 있다(캠페인마다 하위를 읽지 않는다). 하위 켜기는 캠페인이 ACTIVE 면 danger 확인. `activate_partial` 신설 |
| 9 문서 | (이 커밋) | API_ROADMAP §4 · PRD 4.7 · CLAUDE.md 워크플로 절 · 메모리 |

**실 호출 전 상태**: 위 전부 tsc·eslint·`npm run build` 통과, 소넷 리뷰(슬라이스 0·1·2 각각, 3~8 묶음) 반영. Graph 응답 형식에 기댄 파서는 전부 «필드가 없으면 null» 로 썼다 — §11 이 지워지면 좁힌다.
