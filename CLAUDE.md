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
- 세션 리프레시는 `proxy.ts`가 담당한다 (@supabase/ssr 미들웨어 패턴). 기존 보안 헤더 로직을 제거하지 말 것.

## 개발 워크플로

- 작업 완료 후 `npm run build`와 `npm run lint`를 실행하고, 실패하면 다음 작업 전에 반드시 고친다.
- 커밋은 기능 단위로 나눈다.
- **API 연동은 대부분 끝났다**(2026-08-31 대조). OAuth 3종·발행(인스타·스레드)·결제(토스 위젯/빌링/웹훅)·
  광고 라이브러리 수집이 전부 실 호출로 구현돼 있다. 남은 것은 **자격증명과 승인**이지 코드가 아니다.
  현재 상태와 남은 일은 [docs/API_ROADMAP.md](docs/API_ROADMAP.md) 가 정본이다.
  - 유일하게 코드가 없는 것: **Meta 광고 관리(Marketing API)** — 화면만 있고 호출부가 0건이다.
  - 새 기능을 «목으로 두라»는 옛 방침을 이 줄이 오래 들고 있었다. 지금 목인 것은 위 한 가지뿐이니,
    다른 기능을 목으로 만들 이유는 없다.
