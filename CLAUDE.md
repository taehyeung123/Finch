@AGENTS.md

# 핀치(Finch) 프로젝트 규칙

기능 명세·디자인·로드맵의 단일 출처는 `PRD.md`(기획서 v1.2)다. 작업 전 해당 PART를 반드시 확인한다.

## 기본 정보

- 서비스명: 핀치(Finch) — AI SNS 통합 분석 & 메타광고 관리 플랫폼
- 채널: Instagram · TikTok · Threads + Meta 광고 계정
- 프레임워크: Next.js 16 (App Router, Turbopack). **`middleware.ts`가 아니라 `proxy.ts`를 사용한다.**
- 스타일: Tailwind CSS v4 — 토큰은 `app/globals.css`의 `@theme`에 정의. **코드에 hex 하드코딩 금지, 항상 토큰 사용.**
- 아이콘: lucide-react. 차트는 `components/ui/charts.tsx`의 경량 SVG 컴포넌트 사용(외부 차트 라이브러리 금지).

## 디자인 규칙 (PRD PART 7)

- 다크모드 전용: surface `#0C0C11` → body `#16161C` → overlay `#212128` (토큰: `bg-surface`/`bg-body`/`bg-overlay`)
- 그림자(box-shadow) 금지 — 반투명 테두리(`border-line`)로 깊이 표현
- 라운드 2단계만: 카드/버튼/인풋 `rounded-card`(8px), 칩/뱃지 `rounded-chip`(32px)
- 브랜드 컬러 시그널 코랄(`bg-primary`) 위 텍스트는 **항상 다크**(`text-on-primary`) — 흰색 금지(WCAG 대비 미달)
- 상승=초록(`positive`), 하락=빨강(`negative`) — 주식 관행(빨강=상승) 금지
- 숫자 지표에는 `.tnum`(tabular-nums) 클래스 적용
- 채널 배지 컬러는 브랜드 컬러와 분리 관리 (`components/ui/badge.tsx`의 ChannelBadge)

## 데이터 규칙 (PRD PART 2·3)

- "내 계정" 기능(공식 API)과 "타계정/트렌드"(3rd party 필요) 기능은 데이터 소스를 처음부터 분리 설계한다.
- **페이지·컴포넌트는 반드시 `@/lib/data`에서 import 한다 — `lib/mock/data` 직접 참조 금지.** 데모 모드는 샘플, 실제 모드는 연동 전까지 빈 데이터가 나가며, API 연동 시 `lib/data/index.ts`의 해당 export만 실제 소스로 교체한다 (연동 순서: `docs/API_ROADMAP.md`).
- 새 화면은 빈 데이터에서도 깨지지 않아야 한다 (배열 인덱싱·0 나눗셈 가드, EmptyState 제공).
- 3rd party 데이터가 표시되는 화면에는 출처 배지(`DataSourceBadge`)와 갱신 시점 표기를 반드시 넣는다.
- 자체 산출 지표(도달 스코어 등)에는 계산 근거 설명을 함께 노출한다.

## 라우트 구조 (PRD PART 5)

- `app/(marketing)`: 랜딩·요금제 — 공개, SEO 대상
- `app/(auth)`: 로그인·회원가입·온보딩 — Supabase Auth(Google·Kakao). 환경변수 미설정 시 데모 모드 폴백
- `app/(app)`: 사이드바 레이아웃 전체 — `robots: { index: false }`

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
- 실제 API 연동(Meta/TikTok/Threads OAuth, Ad Library, 결제)은 사용자 지시로 **맨 마지막 단계**다. 그 전까지는 인터페이스만 두고 목 처리한다.
