@AGENTS.md

# 핀치(Finch) 프로젝트 규칙

기능 명세·디자인·로드맵의 단일 출처는 `PRD.md`(기획서 v1.2)다. 작업 전 해당 PART를 반드시 확인한다.

## 기본 정보

- 서비스명: 핀치(Finch) — AI SNS 통합 분석 & 메타광고 관리 플랫폼
- 채널: Instagram · TikTok · Threads + Meta 광고 계정
- 프레임워크: Next.js 16 (App Router, Turbopack). **`middleware.ts`가 아니라 `proxy.ts`를 사용한다.**
- 스타일: Tailwind CSS v4 — 토큰은 `app/globals.css`의 `@theme`에 정의. **코드에 hex 하드코딩 금지, 항상 토큰 사용.**
- 아이콘: lucide-react. 차트는 `components/ui/charts.tsx`의 경량 SVG 컴포넌트 사용(외부 차트 라이브러리 금지).
- **프로필 링크 화면은 두 벌이다 — 한쪽만 고치지 말 것.** 공개 페이지 `app/p/[slug]/_components/block-renderer.tsx`(+`page.tsx`)와
  편집 미리보기 `app/(finch)/(app)/links/_components/phone-preview.tsx`는 **같은 모습을 각자 그린다**(미리보기는 폰 프레임 비율로 축소한 값).
  블록·헤더의 모양을 바꾸면 **반드시 두 파일을 함께** 고친다 — 한쪽만 고치면 "편집기에서 본 것과 발행본이 다르다"가 되고,
  이 저장소가 가장 자주 겪은 회귀다(2026-08-24 기준 소넷 점검에서 4회 적발).
- **공개 프로필은 «창고»에서 나간다 — 방문마다 그리지 않는다** (2026-09-11, 설명 정본 `docs/PROFILE_CACHE.md`).
  처음 온 방문자 때 한 번 그린 완성 화면을 Vercel CDN 에 넣어 두고(ISR, 수명 하루) 다음 방문자부터 거기서 준다.
  ① **방문자에게 보이는 것을 바꾸는 쓰기는 반드시 `lib/links/public-cache.ts` 를 부른다**(`purgePublicPage`,
     주소 구조가 바뀌면 쓰기 **전에** `collectPublicPaths(…, { structure: true })`). 안 부르면 옛 화면이 최대 하루 나간다 —
     비공개로 돌린 페이지·비밀번호 건 페이지·숨긴 방명록까지. 발행본(스냅샷)이 아니라 **바로 읽히는 것**(설정·비밀번호·
     공개 여부·주소·방명록)이 특히 잘 빠진다. 서브 페이지는 창고본이 두 개다(`/p/{child}`, `/p/{부모}/{서브}`).
     `revalidateTag(…, "max")` 는 옛 화면을 한 번 더 주므로 쓰지 않는다.
  ② **창고 렌더(`app/p/[slug]/page.tsx`·`[sub]/page.tsx`, live=false)에서 쿠키·헤더로 화면을 가르지 말 것.** `force-static` 이라
     빈 값이 온다. 쿠키로 달라지는 화면(주인 미리보기·잠금 해제)은 proxy.ts 가 세션·열림 쿠키를 보고 보내는
     **즉석 경로 `app/p/-live`** 가 그린다. 새 개인화가 필요하면 proxy.ts `needsLiveRender` 에 쿠키를 더한다.
     창고용 조회는 `loadCachedPublicPage`(anon 클라이언트 — RLS 가 두 번째 안전장치), 쿠키가 필요한 판정은 `loadPublicPage`.
     창고 렌더의 조회 오류는 **던진다** — null 을 돌려주면 404 가 하루 동안 굳는다.
  ③ 앱 밖(Supabase 대시보드·SQL)에서 공개 페이지를 바꿨으면 `POST /api/admin/purge-profile` 로 비운다(사용법은 docs).

## 디자인 규칙 (PRD PART 7)

- **라이트 기본 + 다크 토글, 듀얼 테마 정식 지원** (2026-08 결정 — 과거 "다크모드 전용" 방침 폐기).
- **라이트 지면은 약간 회색빛이다 — 지면 위에 흰 카드가 뜬다** (2026-08-16 사장님 지시: "스니핏처럼 약간 회색빛 도는 배경에 박스 단차").
  라이트 surface `#F3F4F6`(2026-08-23 `#F7F8FA`에서 한 단계 더 회색으로 — 흰 카드가 흰색으로 읽히게) → body/overlay/rail `#FFFFFF`, 다크 surface `#0C0C11` → body `#16161C` → overlay `#212128`.
  실제 값은 `app/globals.css`의 `:root`/`:root[data-theme="dark"]`가 정한다.
  ⚠️ 한 번 순백 지면(`#FFFFFF`)으로 갔다가 되돌렸다. 지면과 카드가 같은 색이면 깊이가 그림자 하나에만 걸리고,
  다크에서는 그 그림자가 `none`이라 단차가 통째로 사라진다 — **라이트/다크가 같은 구조로 읽히지 않는다.**
- **면(surface) 역할 7개 — 이 밖의 배경색을 새로 만들지 않는다.**
  `bg-surface` 지면(회색빛) · `bg-body` 카드(흰) · `bg-overlay` 모달/시트 · `bg-rail` 사이드바(흰 판) ·
  `bg-plate` 카드 **안**의 중첩 면·썸네일 레터박스 · `bg-tint-hover` 호버 틴트 · `bg-scrim` 사진 위 스크림(테마 무관 항상 어둡다).
  (2026-08-20 편집 무대(bg-stage) 시도는 사장님 지시로 철회 — 편집 캔버스는 지면 위에 그대로 둔다.)
  ⚠️ `bg-plate`를 **지면 위에 직접 쓰지 말 것** — 지면과 거의 같은 색이라 조용히 사라진다.
  마케팅 섹션 교차 밴드는 회색 지면 위 **흰 판**(`border-y border-line bg-body`)으로 만든다.
- 깊이 표현은 테마별로 다르다:
  **라이트 = 헤어라인(`--line: #E8EBEF`) + 2겹 미세 그림자.** 정적 카드는 `card-face`(배경+테두리+그림자) 한 클래스로 쓰고,
  호버로 뜨는 카드는 `card-hover`를 함께 건다(요소는 1px도 움직이지 않는다 — 선과 그림자만 반응).
  **다크 = 밝기 단차 + 반투명 테두리만.** `--shadow-card`/`--shadow-pop`이 다크에서 `none`이라 같은 클래스가 자동으로 테두리만 남긴다.
  임의 Tailwind `shadow-*` 유틸(`shadow-sm`/`shadow-lg` 등) 직접 사용 금지 — `card-face` 또는 `shadow-pop` 토큰으로.
- 라운드 2단계만: 카드/버튼/인풋 `rounded-card`(12px), 칩/뱃지 `rounded-chip`(32px)
- **앱 화면 타입 스케일 7단계**: 11(라벨·뱃지) · 12(메타) · 14(보조 본문·내비) · 15(본문) · 17(카드 제목·소제목, semibold) · 20(페이지 제목·강조 숫자, bold) · 28(히어로 숫자 전용).
  (2026-08-19 밀도 개편 — "링크팜 비율 맞추기" 지시로 페이지 제목 28→20, 카드 제목 20→17. 페이지/카드 제목은 크기 3px+굵기(bold/semibold)로 위계를 가른다. 카드 패딩 p-4, 사이드바 208px, 상단바 h-14.)
  이 밖의 px 값을 새로 만들지 않는다. 마케팅(`app/(finch)/(marketing)`)은 디스플레이 스케일을 따로 쓴다.
  **프로필 링크 편집기·미리보기도 예외다** — 방문자 페이지의 자체 스케일(제목 17/21/26px 등)을
  그대로 재현해야 «편집기에서 본 것과 발행본이 다르다»가 안 생긴다. 앱 크롬에는 적용하지 않는다.
  제목 색(`--fg-strong`)·자간은 `@layer base`가 h1~h4에 일괄로 건다 — 화면에서 손으로 붙이지 않는다.
- **글자색은 3단계**: `text-fg`(본문) · `text-fg-sub`(보조 본문, 흰 지면 5.6:1) · `text-fg-faint`(약 4.7:1).
  ⚠️ `fg-faint`는 **본문 텍스트 금지** — 플레이스홀더·아이콘·표 헤더·차트 축 라벨·비활성 UI 전용이다.
  정확한 값은 `app/globals.css` 가 정한다(여기 숫자를 근거로 대비를 계산하지 말 것 — 조정되면 어긋난다).
- 모션은 `trans-state` 등 프리셋으로 — `transition-*` 유틸 직접 사용은 duration/ease를 의도적으로 오버라이드할 때만.
- **반응 기준 — 모든 버튼·모든 전환이 같은 속도로 반응한다** (2026-09-11 사장님 지시 «메이저 사이트처럼, 모든 버튼과
  모든 전환이 같게». 깃허브·유튜브·토스증권 실측 + 구글 INP «0.2초 안»·닐슨 «0.1초»에 맞췄다). 정본은 `app/globals.css`.
  ① **누름**: 누르는 순간 opacity 0.72, 전환 없이 즉시 — globals.css 의 `:where(button, a[href], [role=button|tab|menuitem|option], summary):active`
  한 규칙이 앱 전체에 건다. 컴포넌트마다 `active:` 색을 새로 넣지 말 것(예전엔 버튼 두 종류에만 있어 반응이 제각각이었다).
  ② **로딩 표시**: `--loading-delay`(0.2초) 안에 끝나면 띄우지 않는다 — 빠른 동작에 로더가 번쩍이면 더 불안하다.
  넘으면 `--dur-2` 로 나타난다. 쓰는 클래스는 `.busy-veil-in` 하나(화면 이동 덮개·편집기 작업 막). 그동안 투명한 막은 클릭을 통과시킨다.
  ③ **나타남**: 새 화면·모달·시트·서랍·탭 교체·위저드 단계는 전부 `--dur-2`(0.16초)·`--ease-arrive`. 순차 지연(스태거) 금지.
     채움 방식은 **backwards** — `both`·`forwards` 금지. 끝난 뒤에도 마지막 장면을 붙잡아 섹션마다 쌓임 맥락이 남고,
     앞 섹션에서 연 모달이 뒤 섹션 밑에 깔린다(2026-09-11 연결 해제 모달 버튼이 아래 카드에 덮여 해제를 못 했다).
  ④ Tailwind duration 유틸에 숫자(200ms·240ms 등)를 직접 쓰지 않는다 — `--dur-1`·`--dur-2`·`--dur-3` 토큰을 var() 로 감싸 쓴다
  (예: `components/layout/sidebar.tsx`). 색만 바뀌는 호버는 `--dur-1`. ⚠️ 이 문서에 대괄호 클래스 예시를 적지 말 것 —
  Tailwind 가 저장소의 .md 까지 훑어 클래스로 오인하고 잘못된 CSS 를 만든다(2026-09-11 빌드 경고로 확인).
  메뉴 링크는 누른 뒤 도착 전까지 호버 색으로 붙잡아 둔다(`LinkStatusIcon` 의 `data-nav-pending` + `has-[[data-nav-pending]]:`).
- **연동·해제 결과는 띠가 아니라 모달이다** (`components/ui/result-modal.tsx`, 2026-09-09 사장님 지시).
  연동은 «다른 사이트를 다녀와서» 끝나는데, 돌아온 화면 맨 위의 초록 띠는 «방금 한 일의 결과»가 아니라 «원래 있던 안내»로 읽힌다.
  실패는 더 나쁘다 — 해제 확인 모달이 열린 채 실패 띠가 뜨면 띠가 **스크림 뒤에 숨는다**(실제로 있던 버그다).
  `ResultBanner`(띠)는 결제·프로필처럼 «화면 안에서 저장한 결과»에만 남는다. 채널·로그인 계정 화면을 거기 도로 붙이지 말 것.
  결과 모달은 **모달 껍데기를 새로 짜지 말고** `ModalShell` 위에 얹는다(이미 손으로 짠 복제본이 둘 있다).
  **밖으로 나가는 이동(OAuth 인가 화면 등)도 마찬가지다** — 버튼 글자를 「이동 중…」으로 바꾸는 식은 작아서 아무도 못 본다
  (2026-09-10 지시). 누르는 즉시 「○○으로 이동하고 있어요」 모달(`components/ui/connect-link.tsx`)을 세운다.
- **클릭은 그 자리에서 반응해야 한다 — 서버 응답을 기다려서 보여주는 피드백은 피드백이 아니다** (2026-09-10 지시
  «클릭하면 바로 반응 오게, 준비 안 됐으면 로딩창»). 앱 안 화면 이동은 `next/link` 대신 `components/ui/app-link.tsx` 의
  `AppLink`(`ButtonLink` 도 이걸 쓴다)로 — 누르는 즉시 이동이 시작되고, 0.2초 안에 새 화면이 안 오면 `<main>` 위에
  로딩 화면이 덮였다가(`components/layout/nav-pending.tsx`, 위 «반응 기준» ②) 새 화면이 오면 걷힌다. 버튼에서 `router.push` 를 부를 땐 `useNavPending().navigate()` 로. 항상 보이는 메뉴는
  `prefetch="intent"`(호버·터치 시작 때 프리페치), 아예 끄는 `prefetch={false}` 는 쓰지 않는다 — 운영 실측에서
  클릭 뒤 첫 바이트까지 0.6~1.1초 동안 아무 반응이 없던 원인이다. `(app)/layout.tsx` 는 인증·동의 확인 밖의
  조회를 **await 하지 않는다**(레이아웃이 끝나기 전엔 `loading.tsx` 도 못 뜬다 — 알림 배지처럼 `Suspense` 로 뒤따르게).
- 브랜드 컬러 시그널 코랄(`bg-primary`) 위 텍스트는 **항상 다크**(`text-on-primary`) — 흰색 금지(WCAG 대비 미달)
- 상승=초록(`positive`), 하락=빨강(`negative`) — 주식 관행(빨강=상승) 금지
- 숫자 지표에는 `.tnum`(tabular-nums) 클래스 적용
- 채널 배지 컬러는 브랜드 컬러와 분리 관리 (`components/ui/badge.tsx`의 ChannelBadge)

## 데이터 규칙 (PRD PART 2·3)

- "내 계정" 기능(공식 API)과 "타계정/트렌드"(3rd party 필요) 기능은 데이터 소스를 처음부터 분리 설계한다.
- **페이지·컴포넌트는 반드시 `@/lib/data`에서 import 한다 — `lib/mock/data` 직접 참조 금지.** 데모 모드는 샘플, 실제 모드는 연동 전까지 빈 데이터가 나가며, API 연동 시 `lib/data/index.ts`의 해당 export만 실제 소스로 교체한다 (연동 순서: `docs/API_ROADMAP.md`).
- 새 화면은 빈 데이터에서도 깨지지 않아야 한다 (배열 인덱싱·0 나눗셈 가드, EmptyState 제공).
- **경쟁사 이름(리틀리·인포크·링크트리·링크팜·스니핏 등)을 고객이 보는 문자열에 넣지 않는다**
  (2026-08-26 사장님 지시): JSX 텍스트·placeholder·aria-label·오류 문구·목데이터·다운로드 파일 전부 해당.
  이사(가져오기) 기능도 「쓰던 페이지 주소」처럼 이름 없이 말한다 — 주소를 붙여넣으면 호스트로 인식한다.
  코드 주석·변수명·호스트 화이트리스트 상수는 허용(고객에게 안 보인다).
- **데이터 출처·지원수준 배지는 고객 화면에 노출하지 않는다** (2026-07 결정): "공식 API"/"제휴 데이터"/"부분 지원" 문구, 앱 자격증명·심사 절차 안내는 전부 내부 운영 정보다 — UI에 넣지 말 것. (그 문구를 품고 있던 `DataSourceBadge`·`SupportBadge`·`DataSourceNote` 컴포넌트는 2026-08-31 에 삭제했다 — 사용처가 0곳인데 자동완성으로 되살아날 위험만 있었다. 다시 만들지 말 것.) 법적으로 필요한 고지는 약관·개인정보처리방침에서 다룬다.
- 자체 산출 지표(도달 스코어, AI 후킹 태그 등)에는 "?" InfoTip으로 계산 근거 설명을 함께 노출한다 — 이건 출처 배지와 달리 유지한다.

## 라우트 구조 (PRD PART 5)

**모든 앱 라우트는 `app/(finch)/` 아래에 있다** — 2026-08-24 방문자 레이아웃 분리(`app/p/layout.tsx`) 때
루트를 갈랐다. 아래 이름만 보고 `app/(marketing)` 을 찾으면 없다.

- `app/(finch)/(marketing)`: 랜딩·요금제·기능 페이지 — 공개, SEO 대상
- `app/(finch)/(auth-split)`: 로그인·회원가입 (좌우 분할 레이아웃)
- `app/(finch)/(auth)`: 온보딩 — Supabase Auth(Google·Kakao). 환경변수 미설정 시 데모 모드 폴백
- `app/(finch)/(app)`: 사이드바 레이아웃 전체 — `robots: { index: false }`
- `app/p/[slug]`: 공개 프로필 링크 (자체 루트 레이아웃, 아래 참조)
- **공개 프로필 링크는 루트 주소다: `finch.ai.kr/{slug}`** (2026-08-25, 리틀리와 같은 모양).
  파일은 `app/p/[slug]/` 그대로이고 `proxy.ts` 가 리라이트한다 — 옛 `/p/{slug}` 는 301 로 새 주소로 보낸다.
  ⚠️ **새 라우트를 만들면 `lib/links/reserved.ts` 와 예약어 마이그레이션(0066·0068·0073 — 최신 것)에 같이 넣는다.**
  Next.js 는 정적 경로가 동적 경로를 이기므로, 그 이름을 쓰던 사용자 페이지가 **조용히 가려진다.**

## 인증 규칙 (Supabase Auth)

- 서버에서 인증 판단은 **반드시 `supabase.auth.getUser()`** — `getSession()`은 쿠키를 재검증 없이 신뢰하므로 인증 판단에 절대 쓰지 않는다.
- 로그인 후 리다이렉트 `next` 파라미터는 same-origin 검증(경로가 `/`로 시작하고 `//`로 시작하지 않으며 `\`를 포함하지 않을 것) 후에만 사용한다 (`app/auth/callback/route.ts` 패턴 유지).
- `SUPABASE_SERVICE_ROLE_KEY` 등 시크릿은 절대 클라이언트 코드에서 참조하지 않는다. 클라이언트에는 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`(공개 가능)만 노출한다.
- **데모 모드 폴백 유지**: 모든 인증 경로는 `isSupabaseConfigured()`(`lib/supabase/config.ts`)를 먼저 확인하고, 환경변수 미설정 시 빌드·런타임이 깨지지 않고 데모 모드로 동작해야 한다. 설정 절차는 `docs/AUTH_SETUP.md`.
- Supabase 클라이언트는 `lib/supabase/client.ts`(브라우저) / `lib/supabase/server.ts`(서버, `await cookies()`)만 사용한다. `@supabase/auth-helpers-nextjs`는 deprecated — 절대 쓰지 않는다.
  예외 두 개: `lib/supabase/admin.ts`(service_role, 세션 없는 서버 작업) · `lib/supabase/anon.ts`(세션 없는 anon — **창고에 굳힐 공개 화면 전용**,
  쿠키를 안 읽고 RLS 가 그대로 걸린다). 로그인·주인 판정에 anon.ts 를 쓰지 말 것.
- 세션 리프레시는 `proxy.ts`가 담당한다 (@supabase/ssr 미들웨어 패턴). 기존 보안 헤더 로직을 제거하지 말 것.
- 로그인은 **구글·카카오뿐이다** — 비밀번호 로그인 코드는 저장소에 한 줄도 없다. 새로 만들지 말 것
  (만들면 무차별 대입·크리덴셜 스터핑·비밀번호 재설정 우회가 통째로 새 공격면이 된다).

## 보안 규칙 (2026-09-07 종합 감사에서 확정)

- **토큰 암호문은 서버만 만진다.** `connected_accounts`·`meta_ad_connections` 의 `*_token_cipher` 는
  0085 가 `authenticated` 의 select/insert/update 대상에서 뺐다. 이 컬럼을 읽거나 쓰는 코드는 반드시
  `createAdminClient()` 로 하고, 접근 범위는 `.eq("user_id", ownerId)` 가 정한다(admin 은 RLS 를 우회하므로 **필터가 곧 권한**이다).
  두 표에 `select("*")` 를 쓰면 권한 오류로 조회 전체가 떨어진다 — 컬럼을 적어라.
- **수리에 «없으면 원래대로» 폴백을 남기지 말 것.** 폴백이 성공하는 조건이 곧 취약한 조건인 경우가 많다
  (2026-09-07 에 두 번 연속 그랬다: `createAdminClient() ?? supabase`, `secret || "finch-thumb"`).
  닫는 쪽으로 실패하고 로그를 남긴다. 예외는 «본인이 자기 것을 쓰는» 경로뿐이다(OAuth 콜백).
- **남의 URL 을 서버가 여는 것은 두 곳뿐이다** — `lib/links/safe-fetch.ts`(HTML), `lib/media/safe-image.ts`(이미지).
  그 밖에서 맨 `fetch` 로 외부 URL 을 열지 않는다. Vercel 에는 아웃바운드 방화벽이 없다.
- **검증 없는 경로 조각을 `new URL()`·`redirect()` 의 목적지로 쓰지 않는다.** 라우트 파라미터는 **디코드된 값**이라
  `\`(`%5C`)가 들어오면 `//` 로 읽혀 크로스 오리진이 된다. 로그인 `next` 는 `lib/auth/safe-next.ts`,
  프로필 slug 는 `SLUG_RE` 로 먼저 거른다.
- **접속 IP 는 `lib/net/client-ip.ts` 의 `clientIp()` 로만 본다.** 출발점은 Vercel 이 덮어써 위조할 수 없는
  «바로 앞 접속자»(`x-vercel-forwarded-for` → `x-real-ip` → xff **마지막** 값)이고, 그 주소가 **Cloudflare 에지 대역일 때만**
  `cf-connecting-ip` 를 믿는다. `cf-connecting-ip` 를 무조건 믿으면 안 된다 — Vercel 은 Cloudflare 를 건너뛴 직접 접속도
  받아서, 그 헤더를 위조해 IP 상한을 우회할 수 있었다(2026-09-10 적발). 이 방식은 Cloudflare 프록시를 켜든 끄든 그대로 맞다.
  xff **첫** 값은 요청자가 직접 넣는 값이라 위조된다. IP 원문은 저장하지 않는다 — 페퍼를 섞어 해시만 남긴다.
- **시크릿을 읽는 모듈 1행에 `import "server-only";`** 를 넣는다. 경계를 사람이 아니라 빌드가 지킨다.
- **인증 «전» 경로의 `console.error` 는 반드시 `consoleErrorThrottled` + `flatten`** 으로 감싼다
  (`lib/monitoring/log-throttle.ts`). Sentry 가 console.error 를 전부 이벤트로 올리므로, 안 감싸면
  외부인이 무료 한도를 태워 **우리의 유일한 오류 관측 수단을 끌 수 있다.**
- **상태를 바꾸는 동작을 GET 렌더 안에서 하지 않는다.** 서버 액션(POST)으로 옮긴다 — Next 가 Origin 을 검증해
  CSRF 가 함께 닫힌다(팀 초대 수락이 그래서 옮겨졌다).
- **발행 사진·영상(publish-media 버킷·publish_uploads 원장)은 서버만 만진다** (2026-09-11, 0093). 새 미디어 글은 `create_publish_post`(service_role)로만
  만들고, `scheduled_posts` 의 엔진 칸(container_id·publish_attempted_at·next_check_at·media 등)은 로그인 사용자에게 쓰기 권한이 없다 —
  상태 전이는 `scheduled_posts_guard` 가 막는다. 발행은 `lib/publish/run.ts` 의 `claimPost`(선점이 돌려준 행만 믿는다) → `advanceClaimedPost` 로만.
  메타 발행 호출 **전에** 시도 기록을 먼저 적는다(두 번 올리지 않기, `lib/publish/engine-core.ts`).
- **INSERT 를 검사하는 트리거·정책은 UPDATE 도 함께 봐야 한다.** 0060 의 소유 대조가 INSERT 에만 걸려 있어
  남의 페이지 밑에 내 페이지를 붙일 수 있었다(0086 이 수리). 새 가드를 만들 때 두 동작을 같이 생각한다.

## 개발 워크플로

- 작업 완료 후 `npm run build`와 `npm run lint`를 실행하고, 실패하면 다음 작업 전에 반드시 고친다.
- 커밋은 기능 단위로 나눈다.
- **API 연동은 대부분 끝났다**(2026-08-31 대조). OAuth 3종·발행(인스타·스레드)·결제(토스 위젯/빌링/웹훅)·
  광고 라이브러리 수집이 전부 실 호출로 구현돼 있다. 남은 것은 **자격증명과 승인**이지 코드가 아니다.
  현재 상태와 남은 일은 [docs/API_ROADMAP.md](docs/API_ROADMAP.md) 가 정본이다.
  **심사·승인(메타 인스타·스레드·광고, 틱톡, 페이앱)은 [docs/APP_REVIEW.md](docs/APP_REVIEW.md) 가 정본이다** — 권한을 늘리거나 빼기 전에
  거기 «기능 → 필요한 권한» 표부터 본다(요청만 하고 안 쓰는 권한은 심사 반려 사유다).
  - **Meta 광고 관리(Marketing API)도 2026-09-03 에 코드가 다 붙었다** — 읽기·캠페인·광고 세트·소재·광고 생성·
    미리보기·게재 제어까지(`docs/ADS_STAGE2_SPEC.md` 가 설계 정본, §13 이 우선). 자격증명은 들어가 있고(광고 호출 41회 기록, 2026-09-11)
    남은 것은 **메타 앱 심사와 호출 등급(Full)** 이다 — 준비물은 `docs/APP_REVIEW.md` §4.
    광고 스코프는 `ads_read`+`ads_management`+`pages_show_list`+`pages_read_engagement`+`business_management`(`lib/meta/ads-oauth.ts`,
    마지막 것은 2026-09-11 — 마케팅 API 이용 사례 필수, `docs/APP_REVIEW.md` §2) —
    그 전에 연동한 토큰은 설정 > 채널에서 «재연동 필요»로 안내한다. 미리보기 iframe 때문에 `proxy.ts` CSP `frame-src` 에
    `https://www.facebook.com/ads/api/preview_iframe.php` 가 **앱 화면에만** 열려 있다(공개 프로필엔 없다).
  - 새 기능을 «목으로 두라»는 옛 방침은 폐기됐다. 지금 목인 화면은 데모 모드의 예시뿐이다.
