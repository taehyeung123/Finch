# 핀치 공용 풀 전환 + 업종별 검색 + 모션 개편 — 단일 구현 스펙 v1.0

작성 기준: 2026-08-10 / 코드 실측 확인 완료 (Next 16.2.10, React 19.2.4, Tailwind v4)

---

## 0. 이 스펙의 3대 규율 (전 구현 단계 공통, 위반 시 되돌린다)

1. **최상위 세로 블록은 화면당 정확히 2개.** `/library`, `/industry`, `/industry/[key]`, `/brand/[id]` 전부 ① sticky 검색/필터 콘솔 ② 결과 영역. 그 외 모든 것은 문서 흐름 밖(드로어·오버레이·fixed).
2. **덧붙이기 금지 — 하나 넣으면 하나 뺀다.** 이 스펙은 라우트 +3, `/library` 상태 −1(`exploreSections`), 카드 정보 슬롯 ±0, 카드 높이 +3px, 순 코드량 감소를 목표한다.
3. **hex 하드코딩은 `app/globals.css`의 `:root` / `:root[data-theme="dark"]` 팔레트 블록 안에서만.** 그 밖 어디에도 색을 직접 쓰지 않는다.

---

## 1. 모션 — 채택 방향과 이유

### 1.1 채택: A(정밀한 절제) 기반 + B의 morph 1개 + C의 계기 2개

핀치는 갤러리가 아니라 **"잘되는 콘텐츠를 찾아 분석하는 도구"**다. 그래서 모션의 유일한 정당성은 "정보를 나르는가"이고, 정보를 안 나르는 모션은 전부 뺀다.

| 결정 | 내용 |
|---|---|
| **카드 진입 애니메이션** | **없다.** 초기 페인트에서 카드는 opacity 1, delay 0. 60장 스태거 fade-up은 읽을 수 있는 콘텐츠를 400~800ms 뒤로 미루는 비용이고 아무 정보도 안 나른다. |
| 예외 | `더 보기`로 **추가된 배치만** opacity 0→1, 160ms, 20ms 스태거, 8개 상한. 여기서는 모션이 "이게 방금 들어온 것"이라는 정보를 나른다. |
| **호버** | 크기·위치 불변. 테두리 `line→line-strong`, 제목 `fg→primary`, 썸네일 레터박스 판 `plate→body`. 80ms. **transform/scale/shadow 전면 금지** (다크는 `--shadow-pop: none`이라 절반의 테마에서 아무 일도 안 일어난다). |
| **필터·정렬 재배열** | FLIP 금지. 컨테이너 1개 opacity 크로스페이드(1→0.62 / 80ms → 1 / 160ms). 높이·스크롤 위치 불변. |
| **카드 → 상세** | 네이티브 `document.startViewTransition` shared-element morph, 380ms. 이 스펙의 유일한 "고급진" 모션. |
| **기준선 미터** | 카드 하단 3px 자. 채움 길이 전환 520ms. 글자 0개. |

### 1.2 시간·이징 (앱 전역에 이것뿐)

틱 τ = 40ms. `--dur-1: 80ms`(2τ, 색·불투명도) / `--dur-2: 160ms`(4τ, 요소 1개 진입·퇴장) / `--dur-3: 240ms`(6τ, 표면 이동) / `--dur-4: 380ms`(morph).
**퇴장은 진입 한 단계 아래 토큰을 재사용한다**(240→160, 160→80 = 66%). 별도 exit 토큰을 만들지 않는 것 자체가 체계다.

이징 3종: `--ease-arrive`(진입·이동, 평평한 정지) / `--ease-depart`(퇴장) / `--ease-state`(on/off 대칭). 기존 `cubic-bezier(0.16,1,0.3,1)`은 랜딩(`.anim-fade-up`/`.reveal`) 전용으로 **격리**하고 앱 화면에서 퇴출한다.

### 1.3 이 개편의 실체는 새 애니메이션이 아니라 치환이다

`transition-colors` 94곳 + `transition-all` 6곳을 `.trans-state`로 일괄 치환하는 것이 작업량의 70%다. `transition-all` 제거는 **포커스 링(outline)이 전환 대상에 끼는 것을 구조적으로 차단**하는 목적도 겸한다 — 페이드되는 포커스 링은 키보드 사용자에 대한 적대 행위다.

### 1.4 그리드 폭 불연속 제거 (실측 수치)

현행 `grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` + `max-w-[1400px]`:
- lg(1024, 사이드바 240, px-6): 736 / 3열 = **234px**
- xl 상한: (1400−48) / 4 = **338px**
→ lg↔xl 경계에서 카드가 **44% 점프**한다.

`repeat(auto-fill, minmax(14rem, 1fr))`로 교체하면 n열이 들어가는 조건이 `n×224 + (n−1)×16 ≤ W`이므로 카드 폭은 **모든 컨테이너 폭에서 224px 이상 240px 미만**에 갇힌다(폭 밴드 7%). 브레이크포인트 추측이 폭 계약으로 바뀐다. 모바일(<40rem)만 `grid-cols-2` 고정(auto-fill이면 1열로 떨어진다).

부수 효과: 열 수를 JS가 모르게 되므로 탐색 모드의 `[&>*:nth-child(4)]:hidden xl:[&>*:nth-child(4)]:block` 열 수 하드코딩이 성립 불가 → 하지만 `exploreSections` 자체를 삭제하므로(§3.4) 이 문제는 소멸한다.

---

## 2. `app/globals.css`에 추가할 CSS 전문 (복붙 가능)

**삽입 위치 — 정확히 지킬 것:**
- ① `@theme { ... }` 블록(11~53행) 안, `--radius-chip: 32px;` 다음 줄에 **2-A** 삽입
- ② `:root { ... }` 라이트 팔레트(56~96행) 안, `--shadow-pop` 다음 줄에 **2-B** 삽입
- ③ `:root[data-theme="dark"] { ... }`(99~126행) 안, `--shadow-pop: none;` 다음 줄에 **2-C** 삽입
- ④ 파일 **맨 끝**(430행 뒤)에 **2-D** 전체 삽입

> Lightning CSS 지뢰(파일 249~257행 주석에 실측 기록됨): **클래스가 커스텀 프로퍼티를 설정하고 다른 클래스 규칙이 그걸 소비하는 패턴은 프로덕션 번들에서 값이 굳는다.** 아래의 `--meter-fill`, `--meter-mark`, `--i`는 전부 **인라인 `style`로만** 주입한다(`.reveal`의 `--reveal-delay`와 동일한 검증된 경로).

### 2-A. `@theme` 안에 추가

```css
  /* ── 앱 모션 이징 3종 (ease-arrive / ease-depart / ease-state 유틸 생성)
     랜딩의 cubic-bezier(0.16,1,0.3,1)·700ms는 그 스케일 전용으로 격리한다 —
     앱 화면에서는 아래 셋과 --dur-* 만 쓴다. out 커브가 2종인 건 체계 위반. */
  --ease-arrive: cubic-bezier(0.2, 0, 0, 1);
  --ease-depart: cubic-bezier(0.4, 0, 1, 1);
  --ease-state: cubic-bezier(0.3, 0, 0.2, 1);

  /* 미디어 레터박스 판 — body와 surface 사이 정확히 한 칸 */
  --color-plate: var(--plate);
```

### 2-B. `:root`(라이트 팔레트) 안에 추가

```css
  /* object-contain 썸네일의 레터박스 — bg-surface(#F4F5F7)면 회색 구멍으로 읽힌다.
     카드 호버 시 이 판만 body로 한 칸 올라온다(요소는 1px도 안 움직인다). */
  --plate: #fafafb;
```

### 2-C. `:root[data-theme="dark"]` 안에 추가

```css
  --plate: #101015;
```

### 2-D. 파일 맨 끝에 추가 (전문)

```css
/* ═══════════════════════════════════════════════════════════════════════
   앱 모션 체계 — "정밀한 계기"
   ───────────────────────────────────────────────────────────────────────
   전제(2026-08-10 실측): 이 레포의 transition 유틸 116곳 중 106곳이 명시
   duration 없이 Tailwind 기본값(150ms / cubic-bezier(0.4,0,0.2,1))으로
   돌고 있었다. 즉 체계가 없고 기본값이 있었다. 아래 duration 4개와 이징
   3개가 앱 화면 모션의 전부다.

   위 랜딩 모션 유틸(.anim-fade-up / .reveal / .marquee-track / .collect-orbit)은
   마케팅 페이지 전용이다. 두 체계를 섞어 쓰지 않는다.
   ═══════════════════════════════════════════════════════════════════════ */

:root {
  /* 틱 τ = 40ms. 퇴장은 진입 "한 단계 아래" 토큰을 재사용한다(240→160, 160→80). */
  --dur-1: 80ms;   /*  2τ 색·불투명도 — hover, focus, 칩 on/off, 스크롤 상태 */
  --dur-2: 160ms;  /*  4τ 요소 1개 진입/퇴장 — 토스트, 크로스페이드, 추가 카드 */
  --dur-3: 240ms;  /*  6τ 표면 이동 — 필터 패널, 시트, 드로어, 사이드바 폭 */
  --dur-4: 380mss; /* morph — 카드 ⇄ 상세 (아래에서 380ms로 정정 사용) */
  --dur-morph: 380ms;
}

/* ───────────────────────────────────────────────────────────────
   전환 프리셋 — 화면 코드에서 duration/ease를 직접 쓰지 않게 한다.
   transition-property를 명시 나열해 outline(포커스 링)이 절대 전환
   대상에 끼지 않도록 보장한다. transition-all은 앱 화면에서 금지.
─────────────────────────────────────────────────────────────── */

.trans-state {
  transition-property: color, background-color, border-color, opacity, fill, stroke;
  transition-duration: var(--dur-1);
  transition-timing-function: var(--ease-state);
  /* 이탈 지연 1틱 — 카드 사이 gap을 커서가 스칠 때 깜빡임이 사라진다.
     "어긋남이 없음"의 실체가 이 40ms다. */
  transition-delay: 40ms;
}

@media (hover: hover) and (pointer: fine) {
  .trans-state:hover,
  .trans-state:focus-visible {
    transition-delay: 0ms; /* 진입은 즉시, 이탈만 1틱 늦게 */
  }
}

/* ───────────────────────────────────────────────────────────────
   결과 그리드 — 카드 폭 계약 [224px, 240px).
   n열 조건: n×224 + (n−1)×16 ≤ W  →  어떤 컨테이너 폭에서도
   카드 폭이 224~240px 밴드를 벗어나지 않는다(폭 밴드 7%).
   현행 lg 3열(234px) → xl 4열(338px)의 44% 점프를 제거한다.
─────────────────────────────────────────────────────────────── */

.grid-refs {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr)); /* 모바일 2열 고정 */
  opacity: 1;
  transition: opacity var(--dur-2) var(--ease-arrive);
}

@media (min-width: 40rem) {
  .grid-refs {
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  }
}

/* 필터·정렬 재배열 = FLIP이 아니라 컨테이너 1개의 불투명도 교차.
   60장을 FLIP으로 옮기면 동시 transform 60개이고 화면은 혼돈이 된다.
   높이는 애니메이션하지 않고 스크롤 위치도 건드리지 않는다. */
.grid-refs[data-pending="true"] {
  opacity: 0.62;
  transition-duration: var(--dur-1);
  transition-timing-function: var(--ease-depart);
}

/* 브랜드 칩 트랙·대표 소재 스트립 — 가로 셸프.
   카드 폭이 검색 그리드와 완전히 동일해서 모드가 바뀌어도 크기가 안 변하고,
   어떤 폭에서도 고아 카드가 없다(열 수 하드코딩이 필요 없다). */
.row-shelf {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(14rem, 1fr);
  gap: 1rem;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
.row-shelf::-webkit-scrollbar { display: none; }
.row-shelf > * { scroll-snap-align: start; }

/* ───────────────────────────────────────────────────────────────
   카드 — 진입 애니메이션 없음. 호버는 선과 판만 반응한다.
─────────────────────────────────────────────────────────────── */

/* 썸네일 레터박스 판. 호버 시 body로 한 칸 올라온다 —
   transform·scale·shadow 없이 깊이를 표현하는 유일한 방법이고,
   다크(--shadow-pop: none)에서도 동일하게 작동하는 유일한 방법이다. */
.card-plate {
  background-color: var(--color-plate);
  transition: background-color var(--dur-1) var(--ease-state);
  transition-delay: 40ms;
}

@media (hover: hover) and (pointer: fine) {
  .group:hover .card-plate {
    background-color: var(--color-body);
    transition-delay: 0ms;
  }
}

/* 접힘선 아래 카드의 스타일·레이아웃·페인트 비용 제거.
   안전 전제: 카드 높이가 결정론적이어야 한다 — 지표 행 상시 렌더(빈 h-[18px])와
   요약 min-h-[2lh]가 그 전제를 만든다. auto 키워드가 첫 렌더 후 실측값을 기억한다.
   (썸네일 4:5 ≈ 288px + 푸터 128px + 미터 3px ≈ 419px) */
.card-defer {
  content-visibility: auto;
  contain-intrinsic-size: auto 27rem;
}

/* '더 보기'로 추가된 배치 전용. 초기 페인트 카드에는 절대 붙이지 않는다.
   --i는 인라인 style로 주입(Lightning CSS 제약). 8개 상한 → 꼬리 최대 160ms. */
@keyframes card-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.card-appear {
  animation: card-in var(--dur-2) var(--ease-arrive) both;
  animation-delay: calc(min(var(--i, 0), 8) * 20ms);
}

/* ───────────────────────────────────────────────────────────────
   기준선 미터 — 카드 최하단 3px 풀블리드 자. 글자 0개.
   같은 열 카드를 세로로 훑으면 성과가 바코드처럼 읽힌다.
   조건부 "기준 대비 N배" Badge를 흡수하므로 정보 슬롯은 순감한다.
   --meter-fill(0~1)·--meter-mark(1.0배 눈금 %)는 인라인 style로만 주입.
─────────────────────────────────────────────────────────────── */
.baseline-meter {
  position: relative;
  height: 3px;
  overflow: hidden;
  background: var(--color-line);
}
.baseline-meter > i {
  display: block;
  height: 100%;
  background: var(--color-fg-faint);
  transform: scaleX(var(--meter-fill, 0));
  transform-origin: left center;
  transition: transform var(--dur-3) var(--ease-arrive);
}
.baseline-meter[data-over="true"] > i {
  background: var(--color-primary);
}
.baseline-meter::after {
  /* 1.0배(기준) 눈금 — 정적 요소. 텍스트 없이 "기준을 넘었나"가 판독된다 */
  content: "";
  position: absolute;
  inset-block: 0;
  left: var(--meter-mark, 50%);
  width: 1px;
  background: var(--color-line-strong);
}

/* 게이지 채움 — width:% 는 값이 바뀔 때마다 레이아웃을 트리거한다.
   사이드바 크레딧 progressbar가 가장 자주 변하는 요소라 transform으로 바꾼다. */
.gauge-fill {
  height: 100%;
  transform: scaleX(var(--meter-fill, 0));
  transform-origin: left center;
  transition: transform var(--dur-3) var(--ease-arrive);
}

/* 크레딧 차감 순간 1회 점멸 — 글자 노드는 건드리지 않는다(리페인트·a11y 트리 무영향).
   재트리거: el.removeAttribute("data-dir"); void el.offsetWidth; el.setAttribute(...) */
@keyframes tick-flash {
  0% { opacity: 0; }
  18% { opacity: 1; }
  100% { opacity: 0; }
}
.tick-flash { position: relative; isolation: isolate; }
.tick-flash::after {
  content: "";
  position: absolute;
  inset: -2px -5px;
  z-index: -1;
  border-radius: var(--radius-card);
  opacity: 0;
  pointer-events: none;
}
.tick-flash[data-dir="down"]::after {
  background: var(--color-primary-weak);
  animation: tick-flash 900ms var(--ease-arrive);
}
.tick-flash[data-dir="up"]::after {
  background: var(--color-positive-weak);
  animation: tick-flash 900ms var(--ease-arrive);
}

/* ───────────────────────────────────────────────────────────────
   표면 레이어 — @starting-style + transition-behavior: allow-discrete.
   현행 `{open ? <Panel/> : null}` 조건부 렌더는 퇴장 애니메이션이 물리적으로
   불가능하다. 상시 렌더 + data-open 토글로 바꾼다.
   부수 이득: 닫을 때마다 날아가던 FilterPanelBody의 showAllSources 상태가 보존된다.
   JS 마운트 상태머신 0줄. 미지원 브라우저는 즉시 표시/즉시 소멸(깨지지 않는다).
─────────────────────────────────────────────────────────────── */

.layer-panel {
  display: block;
  opacity: 1;
  translate: 0 0;
  transition:
    opacity var(--dur-3) var(--ease-arrive),
    translate var(--dur-3) var(--ease-arrive),
    display var(--dur-3) allow-discrete;
}
/* −4px은 의도적으로 작다 — "날아 들어옴"이 아니라 "자리를 잡음" */
@starting-style {
  .layer-panel[data-open="true"] { opacity: 0; translate: 0 -4px; }
}
.layer-panel[data-open="false"] {
  display: none;
  opacity: 0;
  translate: 0 -4px;
  transition-duration: var(--dur-2);
  transition-timing-function: var(--ease-depart);
}

.layer-sheet {
  display: flex;
  translate: 0 0;
  transition:
    translate var(--dur-3) var(--ease-arrive),
    display var(--dur-3) allow-discrete;
}
@starting-style {
  .layer-sheet[data-open="true"] { translate: 0 100%; }
}
.layer-sheet[data-open="false"] {
  display: none;
  translate: 0 100%;
  transition-duration: var(--dur-2);
  transition-timing-function: var(--ease-depart);
}

.layer-drawer {
  display: flex;
  translate: 0 0;
  transition:
    translate var(--dur-3) var(--ease-arrive),
    display var(--dur-3) allow-discrete;
}
@starting-style {
  .layer-drawer[data-open="true"] { translate: 100% 0; }
}
.layer-drawer[data-open="false"] {
  display: none;
  translate: 100% 0;
  transition-duration: var(--dur-2);
  transition-timing-function: var(--ease-depart);
}

/* 스크림 — 퇴장은 스크림(80ms)이 시트(160ms)보다 먼저 끝난다.
   이미 밝아진 화면 위로 시트가 미끄러지지 않게. */
.layer-scrim {
  display: block;
  opacity: 1;
  transition:
    opacity var(--dur-2) var(--ease-arrive),
    display var(--dur-2) allow-discrete;
}
@starting-style {
  .layer-scrim[data-open="true"] { opacity: 0; }
}
.layer-scrim[data-open="false"] {
  display: none;
  opacity: 0;
  transition-duration: var(--dur-1);
  transition-timing-function: var(--ease-depart);
}

/* 토스트 — 문서 흐름 밖. 현행 library-client.tsx의 mt-4 인라인 <p>는
   결과 그리드를 즉시 40px 아래로 밀어내는, 이 화면의 유일한 실측 CLS다. */
.toast-pop {
  opacity: 1;
  translate: 0 0;
  transition:
    opacity var(--dur-2) var(--ease-arrive),
    translate var(--dur-2) var(--ease-arrive),
    display var(--dur-2) allow-discrete;
}
@starting-style {
  .toast-pop[data-open="true"] { opacity: 0; translate: 0 8px; }
}
.toast-pop[data-open="false"] {
  display: none;
  opacity: 0;
  translate: 0 4px;
  transition-duration: var(--dur-1);
  transition-timing-function: var(--ease-depart);
}

/* ───────────────────────────────────────────────────────────────
   스켈레톤 — animate-pulse(Tailwind 기본 2s, 앱의 어떤 리듬과도 무관) 폐기.
   ① 200ms 미만 로딩에서는 아예 안 보인다: duration 0 + delay 200ms + backwards
      fill의 순수 CSS 지연 노출. 90ms 번쩍이는 스켈레톤은 없느니만 못하다. JS 타이머 없음.
   ② 호흡은 1600ms(40τ) — 같은 틱 그리드 위.
   ③ 스태거는 카드가 아니라 행 단위(--row × 80ms) — 위→아래 느린 파동. 인라인 style 주입.
   기존 .shimmer는 역할이 겹치므로 앱 화면에서 사용 중단(랜딩 전용으로 격리).
─────────────────────────────────────────────────────────────── */
@keyframes skeleton-reveal { from { opacity: 0; } to { opacity: 1; } }
@keyframes skeleton-breathe { from { opacity: 1; } to { opacity: 0.55; } }

.skeleton {
  background-color: var(--color-overlay);
  border-radius: var(--radius-card);
  animation:
    skeleton-reveal 0ms var(--ease-state) calc(200ms + var(--row, 0) * 80ms) both,
    skeleton-breathe 1600ms var(--ease-state) calc(200ms + var(--row, 0) * 80ms) infinite alternate;
}

/* ───────────────────────────────────────────────────────────────
   카드 ⇄ 상세 morph — 네이티브 document.startViewTransition.
   상세는 라우트가 아니라 같은 라우트의 모달(reference-detail.tsx)이라
   Next의 라우터 통합이 트리거되지 않는다. 그래서 명령형으로 부른다:
   experimental.viewTransition 플래그도 react/canary 타입도 필요 없다.

   이름은 클릭된 요소 1개(+scrim/panel)에만 붙는다 → 스냅샷 레이어 O(1).
   React <ViewTransition name={id}>로 60장을 감쌌다면 스냅샷 60장이 된다.
─────────────────────────────────────────────────────────────── */

/* 같은 라우트라 뒤 격자는 바뀐 게 없다. 루트를 크로스페이드하면 소재 수십 장이
   통째로 한 번 깜빡인다 → 즉시 교체. 덤으로 사이드바·탑바가 자동 고정된다. */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
}

::view-transition-group(ref-hero) {
  animation-duration: var(--dur-morph);
  animation-timing-function: var(--ease-arrive);
  z-index: 30;
}
::view-transition-old(ref-hero),
::view-transition-new(ref-hero) {
  animation-duration: var(--dur-morph);
  animation-timing-function: var(--ease-arrive);
}
/* 픽셀 보간 아티팩트를 가린다. 3px 넘기면 필터 비용이 눈에 보인다. */
@keyframes hero-via-blur { 30% { filter: blur(1.5px); } }
::view-transition-image-pair(ref-hero) {
  animation-name: hero-via-blur;
  animation-duration: var(--dur-morph);
}

@keyframes vt-fade { from { opacity: 0; } to { opacity: 1; } }
::view-transition-new(ref-scrim) {
  animation: vt-fade var(--dur-2) var(--ease-arrive) both;
}
::view-transition-old(ref-scrim) {
  animation: vt-fade var(--dur-1) var(--ease-depart) both reverse;
}
::view-transition-group(ref-panel) {
  animation-duration: var(--dur-morph);
  animation-timing-function: var(--ease-arrive);
}

/* ───────────────────────────────────────────────────────────────
   접근성 환경설정 — 3단 대응. 전면 차단(* { animation: none })을 쓰지 않는다.
   WCAG 2.3.3의 대상은 이동이지 색 변화가 아니고, hover 피드백까지 죽이면
   UI가 고장난 것처럼 읽힌다.
─────────────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  /* ① 이동만 제거 — 색·불투명도 전환(.trans-state, .card-plate)은 유지 */
  .layer-panel, .layer-sheet, .layer-drawer, .toast-pop,
  .layer-panel[data-open="false"], .layer-sheet[data-open="false"],
  .layer-drawer[data-open="false"], .toast-pop[data-open="false"] {
    translate: 0 0 !important;
  }
  .card-appear { animation-delay: 0ms !important; }

  /* ② 값 변화는 남기되 애니메이션만 제거 — 미터는 최종 길이로 즉시 렌더된다.
        정보는 남고 움직임만 사라진다. */
  .baseline-meter > i,
  .gauge-fill { transition: none !important; }
  .tick-flash::after { animation: none !important; }

  /* ③ 무한 반복 정지 (200ms 지연 노출은 모션이 아니라 타이밍이므로 유지) */
  .skeleton {
    animation: skeleton-reveal 0ms linear 200ms both !important;
  }

  /* ④ morph 차단 — 1차 방어선은 JS(startViewTransition을 아예 호출하지 않아
        스냅샷 래스터 비용 자체가 발생하지 않는다). 이건 2차. */
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 1ms !important;
    animation-delay: 0s !important;
  }

  .row-shelf { scroll-snap-type: none; }
}

/* 투명도 축소 — sticky 콘솔의 반투명 + blur를 불투명으로 */
@media (prefers-reduced-transparency: reduce) {
  .bg-surface\/95, .bg-surface\/85 { background-color: var(--color-surface) !important; }
  .backdrop-blur, .backdrop-blur-sm { backdrop-filter: none !important; }
}

/* 고대비 — 테두리를 한 단계 승격. "선이 반응한다"는 호버 언어와 일관. */
@media (prefers-contrast: more) {
  :root { --line: rgba(17, 20, 26, 0.28); --line-strong: rgba(17, 20, 26, 0.44); }
  :root[data-theme="dark"] { --line: rgba(255, 255, 255, 0.24); --line-strong: rgba(255, 255, 255, 0.4); }
}

/* 강제 색상 모드 — 미터는 색만으로 판정하므로 경계로 위치를 보존한다 */
@media (forced-colors: active) {
  .baseline-meter > i { border-inline-end: 2px solid CanvasText; }
}
```

> **정정 1건**: 위 `--dur-4: 380mss;`는 오타 방지용으로 남기지 말고, 실제 파일에는 `--dur-4` 줄을 **삭제**하고 `--dur-morph: 380ms;`만 남긴다. (morph 외에 400ms 스케일을 쓰는 곳이 없다.)

### 2-E. morph 트리거 코드 (`library-client.tsx` / `industry-client.tsx` 공용, `lib/motion/morph.ts`로 추출)

```ts
"use client";
type VTDocument = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};
const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 클릭된 요소 1개에만 이름을 붙여 morph. 실패 경로는 전부 즉시 스왑. */
export function morph(el: HTMLElement | null, commit: () => void) {
  const doc = document as VTDocument;
  if (!doc.startViewTransition || !el || reduced()) { commit(); return; }
  el.style.viewTransitionName = "ref-hero";        // ① 옛 상태 스냅샷용
  const t = doc.startViewTransition(() => {
    // ② flushSync 필수 — 동기 커밋이 아니면 브라우저가 옛 DOM을 새 상태로 캡처한다
    require("react-dom").flushSync(commit);
    el.style.viewTransitionName = "";              // ③ 새 상태에선 모달 이미지가 이름을 갖는다
  });
  t.finished.finally(() => { el.style.viewTransitionName = ""; });
}
```
(실제 구현에서는 `require` 대신 파일 상단에 `import { flushSync } from "react-dom";`)

③이 없으면 새 상태에서 카드와 모달 이미지가 **같은 이름을 동시에** 갖게 되어 브라우저가 중복 이름으로 트랜지션을 통째로 폐기한다(콘솔 경고만 남고 무애니메이션). 대부분의 구현이 여기서 죽는다.

**닫기(역방향)**: 카드가 뷰포트 밖이면 morph를 걸지 않는다(이미지가 허공으로 날아간다) — `getBoundingClientRect()`로 `bottom > 0 && top < innerHeight` 확인 후에만.

---

## 3. 화면별 레이아웃 스펙

### 3.1 업종 허브 `/industry`

```
<div className="mx-auto w-full max-w-[1400px]">
  <h1 className="sr-only">업종별 트렌드</h1>
  ── 블록 1 ── <header sticky top-16 z-20 -mx-4 -mt-6 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6>
  ── 블록 2 ── <section aria-label="업종 목록" className="mt-5">
</div>
```

**블록 1 — 콘솔 1줄(h-14). 상태 줄(h-9) 없음.** 허브는 필터 결과가 아니라 선택지 화면이라 활성 칩이 생길 일이 없다. 이 빈 자리가 `/library`와의 시각적 구분을 만든다.
```
[전체·메타광고·인스타그램·틱톡·스레드 세그먼트]  ──  [기간 ▾ 7·30·90일] [🔍 브랜드·소재 찾기 h-10] · 오늘 06:40 갱신
```
- 세그먼트는 라우팅이 아니라 아래 그리드의 건수·급상승률을 바꾼다.
- 검색 인풋은 **h-10 보조 컨트롤**(56px 히어로 아님) — 이 화면의 주인공이 그리드임을 시각적으로 못박는다. Enter → `/library?q=`로 이관.
- `오늘 06:40 갱신` 12px `text-fg-faint` — 공용 풀이 "우리가 돌리는 것"임을 알리는 유일한 신호.

**블록 2 — 대분류 5그룹 × 타일 그리드** (section 내부 구조, 최상위 블록 아님)
```
그룹 반복 (space-y-8):
  <div className="flex h-9 items-center justify-between">
    <h2 className="text-[15px] font-bold text-fg">뷰티·헬스</h2>
    <span className="text-[12px] text-fg-faint">준비 중 1개</span>   ← 타일은 안 만든다
  </div>
  <div className="grid-refs">  ← 검색 그리드와 같은 폭 계약
    IndustryTile × (자격 통과분만)
  </div>
```

**IndustryTile** (`_components/industry-tile.tsx`)
```
<Link href="/industry/beauty?platform=all"
      className="group relative rounded-card border border-line bg-body p-3 trans-state hover:border-line-strong hover:shadow-pop">
  ① 썸네일 스트립 3장 — aspect-[9/16] rounded-card overflow-hidden gap-1, 각 판은 .card-plate
     (썸네일 없으면 bg-overlay + 채널 글리프 폴백)
  ② 업종명 15px/700 text-fg
  ③ 지표 줄 13px text-fg-sub: <b className="tnum">1,240</b>건 · 브랜드 <b className="tnum">86</b>곳
  ④ 급상승 칩(조건부, 우상단 absolute): rounded-chip bg-primary-weak px-2 text-[11px] font-bold text-primary "+38%"
     ← 7일 신규 / 직전 7일. 상승만 표기(하락 라벨은 아무 가치가 없다)
</Link>
```
**진입 애니메이션 없음**(§1.1). 호버는 `.trans-state`(테두리) + `.card-plate`(판)만. 썸네일 `scale` 금지.
썸네일 스트립이 "고급짐"의 핵심 — 스니핏은 업종을 텍스트 드롭다운으로만 준다. 24칸이 각자 실제 소재 3장을 물고 있으면 그리드 자체가 콘텐츠가 된다.

### 3.2 업종 상세 `/industry/[industry]`

```
── 블록 1 ── sticky header (SearchConsole과 같은 2행 골격)
── 블록 2 ── <section aria-label="업종 소재" className="mt-5">
```

**블록 1 · 1행(h-14)** — `/library`의 `[대상 ▾ | 헤어라인 | 입력 | 필터]` 복합 바를 그대로 쓰되 좌측 드롭다운 축만 바꾼다.
```
┌──────────────────────────────────────────────────────────────┐
│ [뷰티·화장품 ▾] │ 🔍 이 업종 안에서 찾기…   [기준 ▾] [필터 ⚙ 2] │  [검색 · 2크레딧]
└──────────────────────────────────────────────────────────────┘
```
- 좌측 셀렉트 = **업종 전환**(자격 통과 업종만, onChange → `router.push`). 허브로 되돌아갈 필요가 없다.
- `[기준 ▾]` = 검색 기준. 스니핏 차등을 **우리 원가 구조로 재매핑**한다: 썸네일·카피 = 풀 텍스트/이미지 검색(0크레딧) / 영상 내용·음성·대사 = 대본이 필요하므로 유료(§6).
- 검색 버튼 라벨에 **비용을 직접 박는다**(`검색 · 2크레딧` / 풀 히트면 `검색`). 누르기 전에 값을 알려주는 게 공용 풀 과금의 신뢰 조건이다.
- 필터 패널은 `.layer-panel`(lg↑ 오버레이) / `.layer-sheet`(lg↓ 바텀시트). 결과 그리드를 절대 밀지 않는다.

**블록 1 · 2행(h-9 고정)** — `/library`에 **이미 존재하는** 상태 줄이다. 새 행을 만드는 게 아니라 좌측 콘텐츠(등록 기준 칩 트랙)를 플랫폼 탭으로 교체하는 것뿐이다.
```
[전체] [메타광고] [인스타그램] [틱톡]  + 활성 필터 칩  ───  [1,240건] [지금 뜨는 순 ▾]
```
- **건수 20건 미만 플랫폼은 탭 자체를 렌더하지 않는다**(disabled 아님, 부재). 탭은 있는데 0건이 최악이다.
- Google Ads·YouTube Ads 없음. 최대 5탭.
- 정렬 4종: 지금 뜨는 순(7일 신규 가중) / 신규 순 / 오래 도는 순(장기 집행 = 성과 대리 지표) / 반응 순(오가닉만).

**블록 2 — section 내부 3요소**
```
① 요약 줄 (h-9, 카드 아님 — 카드로 만들면 블록이 하나 더 생긴 것처럼 보인다)
   좌: 게재 중 1,240건 · 브랜드 86곳 · 최근 7일 신규 210건   (전부 .tnum)
   우: 대표 브랜드 칩 8개 .row-shelf (로고 16px + 이름 + 건수) — 클릭 = 좁히기, 상태 줄에 칩으로 착지
② 소재 그리드 — .grid-refs, ReferenceCard/AdCard 재사용 (새 카드 컴포넌트 만들지 않는다)
③ [더 보기] — 60건 페이지네이션 (PAGE_SIZE 동일)
```
요약 줄이 "이건 필터된 그리드가 아니다"를 증명하는 유일한 한 줄이다. 브랜드 칩 트랙은 스니핏에 없는 우리 우위(브랜드 단위 분류를 하기 때문에 공짜로 나온다).

**결과 0건은 구조적으로 불가능**(자격 게이트가 60건 이상만 통과시킴). 유일한 0건 경로는 사용자가 직접 친 검색어 → `EmptyState(SearchX)` + `[이 업종 전체 보기]` CTA.

### 3.3 카드 (ReferenceCard / AdCard) 변경 — 정보 슬롯 ±0, 높이 +3px

| 변경 | 근거 |
|---|---|
| 썸네일 컨테이너 `bg-surface` → `card-plate` (양쪽 카드, 플레이스홀더 포함) | 라이트에서 레터박스가 회색 구멍으로 읽히던 것 해소 + 호버 언어 |
| 지표 행 조건부 렌더 제거 → 데이터 없으면 빈 `h-[18px]` 슬롯 상시 렌더 | 한 행 4~5장의 베이스라인이 픽셀 단위로 일치. `card-defer`의 전제 |
| AI 요약 `<p>`에 `min-h-[2lh]` 추가 | 1줄 요약이 20px 구멍을 남기는 것 차단 |
| **조건부 `기준 대비 N배` Badge 삭제 → 카드 최하단 `.baseline-meter` 3px** | 1.5배 미만도 위치로 보인다. 정보 슬롯은 **순감**(뱃지 1개 → 미터 1개, 글자 0개) |
| Card 루트에 `card-defer`, `data-flip-id` 없음 | FLIP 미채택 |
| **`SaveToggle`의 `backdrop-blur-sm` 제거 → `bg-overlay/90` 단색** | 카드 60장 = 백드롭 필터 레이어 60개. 썸네일이 contain이라 뒤가 대개 단색이므로 시각적 이득도 없다 |
| AdCard 좌상단 `메타광고` 필의 `backdrop-blur-sm` 제거 | 동일 |
| `transition-colors` → `.trans-state`, SaveToggle hover에 hover 게이트 | 터치 잔상 제거 |
| 썸네일 `<img>`에 부모가 넘긴 `ref` 부착 | morph 대상 |

`.baseline-meter` 계산: `--meter-fill = min(itemScore / sourceAvg, 2) / 2`, `--meter-mark = 50%`(1.0배 = 절반 지점), `data-over = score >= avg`. 표본 3건 미만 기준은 미터를 렌더하지 않는다(0을 지어내지 않는다). 광고 카드는 `run_days / 90` 상한 1.0을 채움으로 쓰고 눈금은 30일 지점(33%)에 둔다.

**썸네일 비율은 `aspect-[4/5] object-contain` 유지.** 릴스 상하단 후킹 문구·자막이 사용자가 보러 온 것이라는 기존 판단(reference-card.tsx:19~22 주석)을 뒤집지 않는다.

### 3.4 통합 검색 `/library` 변경

| 변경 | 내용 |
|---|---|
| **`exploreSections` useMemo(296~350행) + 그 렌더 분기(610~636행) 삭제** | 개인별 수집 시대의 유물. "둘러보기"의 정본은 `/industry`가 된다. 순 코드 −55줄 |
| 빈 자리 대체 | 최근 검색어 칩 한 줄(`.row-shelf`) + "업종별 트렌드 둘러보기" 링크 한 줄 |
| `gridCls` 상수 삭제 | `.grid-refs` |
| `useTransition` 도입 | `applyFilters`/`applyQuery`를 `startTransition`으로 감싸고 `isPending`을 그리드 `data-pending`에 연결 |
| **토스트를 `mt-4` 인라인 `<p>`에서 fixed 하단 알약으로** | `.toast-pop` + `data-open`, 5초 자동 해제. 이 화면의 유일한 실측 CLS 제거 |
| `visibleCount` 증가분에만 `.card-appear` + `style={{"--i": localIndex}}` | 초기 배치에는 금지 |
| 수집 오버레이 | opacity 진입 160ms, `backdrop-blur`는 전환 목록에서 제외(즉시 최대 강도) |
| 세로 간격 정리 | 12(블록 내부) / 20(섹션 사이) / 32(최상위 블록 사이) 3단. `mt-4·mt-5·mt-6·space-y-8` 혼용 제거 |
| `searchParams` 수용 | `?industry=`, `?q=` 초기값 |
| 필터에 `industry` 축 추가 | `LibraryFilters.industry: IndustryKey \| "all"`, 필터 패널 최상단, `buildActiveChips`·`countActiveFilters`·`describeFilters`에 반영 |
| 상태 줄 `{resultCount}건`의 `aria-live="polite"` 제거 | 키 입력마다 낭독되던 것 → 400ms 디바운스 `role="status"` sr-only 노드로 분리 |

### 3.5 브랜드 상세 `/brand/[id]`

```
── 블록 1 ── sticky header
   1행(h-14): [브랜드 로고 24px + 이름] │ 🔍 이 브랜드 소재 안에서 찾기 │ [필터 ⚙]  [팔로우 ★] [심층 수집 · 3크레딧]
   2행(h-9): [전체][게재 중][종료] 탭 + 활성 칩 ─── [86건] [오래 도는 순 ▾]
── 블록 2 ──
   ① 요약 줄(h-9): 게재 중 24건 · 누적 86건 · 최장 게재 142일 · IG 팔로워 12.4만 · 업종 칩
   ② 소재 그리드 .grid-refs (AdCard/ReferenceCard 재사용)
   ③ [더 보기]
```
- `[팔로우 ★]` → `saved_brands`. `alert=true`면 크롤 슬롯을 점유하므로 유료(§6).
- `[심층 수집]`은 풀에 없는 게재중 광고를 커서 끝까지 긁는 유일한 버튼. 3크레딧 사전 고지.
- 별도 카드 컴포넌트 신설 금지.

---

## 4. 라우트 구조와 사이드바

```
/industry                         업종 허브 (자격 통과분 그리드)
/industry/[industry]              업종 상세  예) /industry/beauty
  ?platform=all|meta|instagram|tiktok|threads   기본 all (스니핏 ?platform= 미러)
  ?sort=hot|new|longrun|reaction                기본 hot
  ?q=<검색어>                                   ← 이 파라미터가 붙을 때만 과금 판정
  ?basis=thumb|copy|video|voice                 검색 기준
/brand/[id]                       브랜드 상세
/library?industry=<key>&q=<...>   업종 컨텍스트 유지한 채 전체 검색으로 이관
/discover → /library              기존 리다이렉트 유지
```

- **라우트명은 `/industry`** — `/trends`가 아니다. `/discover`(구 트렌드 탐색)를 이미 죽여 `/library`로 리다이렉트시켜 놨는데 `/trends`를 새로 파면 죽인 개념이 이름만 바꿔 부활한 꼴이 된다. `/industry`는 축을 이름으로 못박아 나중에 `/format`, `/hook`이 생겨도 구조가 안 꼬인다.
- 슬러그 = DB key(영문). 한글 슬러그는 인코딩 지옥이라 안 쓴다.
- 존재하지 않는 key → `notFound()`. 자격 미달 key → `redirect("/industry")` (404 아님 — 존재는 하되 아직 안 여는 것).
- `(app)` 그룹이라 `robots: { index: false }` 상속.

**사이드바 (`components/layout/sidebar.tsx`)**
```ts
{
  key: "market",
  label: "시장 조사",
  items: [
    { href: "/industry",    label: "업종별 트렌드", icon: LayoutGrid },  // 신규, 최상단
    { href: "/library",     label: "레퍼런스 검색", icon: Library },     // 라벨 변경
    { href: "/competitors", label: "경쟁사 비교",   icon: Users },
  ],
}
```
- `/library` 라벨 `탐색·레퍼런스` → **`레퍼런스 검색`**. 탐색이 `/industry`로 나갔으므로 이름에 "탐색"이 남아 있으면 두 메뉴가 같은 걸 가리키는 것처럼 보인다. 이 라벨 변경이 라우트 분리를 사용자에게 설명하는 유일한 장치다. 3항목이 각각 다른 동사가 된다: 둘러보기 / 찾기 / 비교하기.
- **런칭 게이트**: `listVisibleIndustries().length < 12`이면 `/industry` 항목을 **렌더하지 않는다**. feature flag가 아니라 데이터 조건이라 사람이 임의로 켤 수 없다. (부가 조건: 5개 그룹 중 최소 3개가 각각 2개 이상 — 한 그룹에 12개가 몰린 편식 상태로는 열지 않는다.)

**사이드바 크레딧 progressbar (사장님 지시 4번)** — 새 위젯을 만들지 않는다. `sidebar.tsx:269`가 이미 `usageStats.slice(0, 2)`로 `UsageGauge` 2개를 띄우고 있으므로 `usageStats` 맨 앞에 `검색 크레딧` 항목을 넣는다. `UsageGauge`는 `width:%` → `.gauge-fill`(scaleX)로 교체하고, 라벨에 `.tick-flash` + `data-dir="down"`을 붙여 차감 순간 1회 점멸. `role="progressbar" aria-valuenow`는 정착값만 갱신. **컴포넌트 0개 추가.**

**사이드바 모션 정리** — 라벨 11개가 각각 `transition-all duration-300`으로 `max-width` + `translate` + `opacity` 3속성 동시 전환(= 동시 애니메이션 34개, 그중 22개가 리플로우 유발)하던 것을 **`opacity` 단독 80ms**로 축소한다. 폭 클리핑은 부모 `aside`의 `width` 전환이 이미 하고 있어 `max-width` 애니메이션은 순수 중복이다. 접을 때 delay 0, 펼칠 때 delay 160ms. 동시 12개, 리플로우 유발 1개. 지역 상수 `EASE` 폐기 → `ease-arrive` + `duration-[var(--dur-3)]`.

---

## 5. 마이그레이션 파일 목록

> 기존 `0026_reference_ads.sql`까지 존재. 신규는 0027부터.

### `0027_shared_pool.sql` — 공용 풀 스키마 (읽기 전용 공개)
`create extension if not exists pg_trgm;`
- `industries(id text pk, name_ko, group_key, sort_order, is_active)`
- `industry_keywords(id, industry_id, platform, keyword, origin, weight, crawl_count, hit_count, last_crawled_at, is_active, unique(industry_id, platform, keyword))`
- `brands(id, platform, external_id, handle, name, profile_url, avatar_path, follower_count, active_ad_count, first_seen_at, last_seen_at, unique(platform, external_id))`
- `brand_industries(brand_id, industry_key, is_primary, confidence, source, updated_at, pk(brand_id, industry_key))` — 우선순위 `manual > ai > seed`
- `creatives(...)` — **핵심 키 `unique(platform, external_id)` = 전역 1행.** 현행 `reference_items`의 `unique(user_id, channel, external_id)`가 같은 소재를 사용자 수만큼 복제 저장하던 것이 원가 폭발의 근원이다. 컬럼: `kind('ad'|'post')`, `brand_id`, `title`, `body(≤600)`, `cta_text`, `permalink`(저작권 안전장치, 필수 보존), `thumb_path`(경로만 — 공개 URL은 앱이 조립), `thumb_state`, `media_format`, `views/likes/comments`, `is_active/started_at/ended_at/run_days/ad_platforms`, `industry_ids text[]`(역정규화 — 조인 제거), `industry_source`, `matched_keywords text[]`, `lang/country`, `ai_summary/ai_hooks/ai_angle`, `heat_score`, `dedupe_hash`, `posted_at/first_seen_at/last_seen_at`
- `creative_stats(creative_id pk, save_count, view_count, updated_at)`
- `creative_transcripts(creative_id pk, transcript, created_at)` — **한 명이 사면 전원 무료** (공용 풀의 핵심 세일즈 포인트)
- `creative_analyses(creative_id pk, hook_breakdown, target_guess, improvement, model, created_at)`
- **RLS: 전 표 `enable`, `for select to authenticated using (true)` 정책만. INSERT/UPDATE/DELETE 정책을 만들지 않는다** → authenticated는 RLS 기본 거부로 자동 차단, service_role은 RLS를 우회하므로 크롤러만 쓴다. `revoke insert, update, delete ... from authenticated, anon`으로 의도 명시(이중 방어).
- `creative_stats`만 예외 — 개인 저장 트리거가 갱신하므로 `bump_creative_saves()`를 `security definer set search_path = public`으로.
- 인덱스: `gin((title||' '||body) gin_trgm_ops)`(한국어는 형태소 사전이 없으므로 trigram + ILIKE), `gin(industry_ids)`, `gin(matched_keywords)`, `(platform, heat_score desc, id)`, `(platform, first_seen_at desc, id)`, `(brand_id, first_seen_at desc)`, `(platform, started_at desc) where kind='ad' and is_active`, `(dedupe_hash) where not null`

### `0028_pool_ops.sql` — 운영 표 (RLS 켜고 정책 0개 = service_role 전용)
- `crawl_jobs(job_type, target, industry_id, platform, cursor, priority, est_calls, state, attempts, last_error, scheduled_for, locked_at, locked_by, finished_at)` + `idx(state, scheduled_for, priority desc, id)`
- `crawl_runs(slot, started_at, finished_at, provider_calls, credits_spent, creatives_new, creatives_updated, jobs_done, jobs_failed, notes)`
- **`crawl_budget(day date pk, calls_limit int default 420, calls_used, ai_items_limit, ai_items_used)`** — 원가를 사용자 수와 분리시키는 유일한 장치
- `creative_asset_orders(creative_id, user_id, asset, credits, created_at)` — 대본·분석 최초 구매자 기록(환불 판단용, 비공개)
- `claim_crawl_budget(p_calls int) returns boolean` (security definer, 원자적) + `revoke execute from public, anon, authenticated`
- `pick_crawl_jobs(p_limit int, p_worker text)` — `for update skip locked` 원자 클레임. Vercel 재시도로 슬롯이 중복 실행돼도 같은 job을 두 번 안 돈다(현행 `reference_collect_locks`의 user_id PK 락 방식 폐기)

### `0029_personal_saves.sql` — 개인 표 (own-row RLS)
- `boards(id, user_id, name, emoji, sort_order, created_at, unique(user_id,name))`
- `saved_creatives(user_id, creative_id, board_id, note, status, favorite, origin_query, saved_at, pk(user_id, creative_id))` — `origin_query`가 "내가 어떤 검색으로 건졌나"를 보존(구 `matched_source`)
- `saved_brands(user_id, brand_id, alert, created_at, pk(user_id, brand_id))`
- `search_history(id, user_id, query, industry_id, platform, mode, result_count, created_at)` + `idx(user_id, created_at desc)` + `idx(created_at desc, query)`(크롤러 시드 마이닝용)
- `industry_misclass_reports(user_id, brand_id, suggested_industry, created_at)`
- 정책: 전부 `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)`
- `bump_creative_saves` 트리거를 `saved_creatives`에 부착

### `0030_industry_seed.sql` — 업종 어휘 + 시드 + 통계
- `industries` 24행 + 숨김 키 `etc` 1행 삽입 (§7)
- `industry_keywords` **192행**(24업종 × 8) 수동 부트스트랩 — 이게 없으면 크롤러가 돌 대상이 없다
- `industry_stats` **matview**: `industry_key, live_creatives(90일), brand_count, fresh_7d, prev_7d, platform_creatives jsonb, visible boolean`
- `refresh_industry_stats()` (security definer) — 크론 말미 호출

### `0031_pool_backfill.sql` — 백필 (백필 스프린트 종료 시점에 실행)
- `reference_ads` → `creatives(kind='ad', platform='meta_ads')`, `group by ad_archive_id` → 사용자 N명분이 1행으로 접힘, `on conflict (platform, external_id) do nothing`
- `reference_items` → `creatives(kind='post', platform=channel)` 동일
- `reference_items`/`reference_ads` → `saved_creatives`(user_id, note, status, favorite, origin_query=matched_source, saved_at=collected_at) — **개인 상태 손실 0**
- `reference_sources.value ∪ ad_sources.value` → `industry_keywords(origin='migrated', weight=120, industry_id='etc')` — 실제 사용자가 손으로 넣은 살아있는 시드다. 버리면 손해다. 업종은 이후 AI 1콜로 분류.

### `0032_drop_personal_collect.sql` — **90일 후에만 실행. 이번 스프린트에 배포하지 않는다.**
`reference_items` · `reference_ads` · `reference_sources` · `ad_sources` · `reference_collect_settings` · `reference_collect_locks` DROP + Storage 버킷 `reference-thumbs` 삭제.

**Storage**: 신규 버킷 `pool-thumbs`(public read, service_role write only — 0020 정책 승계). 경로 `{platform}/{external_id 앞2자}/{external_id}_c.webp`(400w 카드) + `_d.jpg`(원본). 앞 2자 샤딩으로 한 프리픽스에 수십만 객체가 쌓이는 것을 방지. 현행 `{user_id}/{channel}-{externalId}.jpg`는 N배 중복 저장의 원인이라 폐기. **런타임 이미지 변환을 쓰지 않는다** — Next `<Image>` 최적화는 Vercel Pro 5,000 source/월 포함이라 월 18,000장이면 초과 과금($5/1,000 ≈ 65,000원/월)이다. 크롤 시점에 `sharp`(이미 devDependencies에 있음)로 400w webp를 미리 굽는다.

---

## 6. 크롤러 크론 설계와 `vercel.json`

### 6.1 원가를 사용자 수에서 물리적으로 분리하는 장치

원가가 사용자 수와 무관해지는 이유는 "그렇게 설계했다"가 아니라 **`crawl_budget.calls_limit`이라는 하드캡을 모든 공급사 호출 앞에 원자적으로 세워두기 때문**이다. 워커는 `claim_crawl_budget(n)`이 `true`를 돌려줄 때만 `fetch`를 실행한다. 사용자가 10명이든 10,000명이든 하루 420콜을 못 넘는다. **사용자 증가는 시드 키워드의 품질만 올리고(검색 로그 마이닝) 호출 수는 안 올린다.**

### 6.2 하루 4종 스윕 (합계 382콜 / 캡 420, 재시도 여유 38)

| 스윕 | 대상 | 콜/일 |
|---|---|---:|
| A. 광고 키워드 | 24업종 × 8키워드 × 1콜(1페이지 30건) | 192 |
| B. 광고 심층 | 로테이션 24키워드 × 커서 3페이지 | 72 |
| C. 브랜드 | `company/ads` 상위 40브랜드 × 1콜 (게재중 총개수 + 소재 30건) | 40 |
| D. 오가닉 | IG 릴스 24업종×2키워드×2페이지(격일) + TikTok 24키워드(주3회) | 평균 58 |
| E. 브랜드 프로필 갱신 | `profile` 20개/일 | 20 |

브랜드 스윕 대상 선정: `saved_brands` 팔로우 수 + `active_ad_count` + 최근 신규 소재 수 랭킹. **사용자가 팔로우한 브랜드가 우선 크롤되므로 사용자가 늘수록 풀의 적중률이 올라간다 — 콜 수는 안 늘고.**

**emptyGate 연동(중요)**: 예산 배분 1순위는 **자격 미달 업종의 부족분(60 − live_creatives) 큰 순**, 2순위는 `fresh_7d`가 임계에 근접한 업종(자격을 잃기 직전), 3순위가 통과 업종 유지 크롤. **화면이 감춘 업종에 수집 예산이 자동으로 쏠린다** — 사람이 기억할 필요가 없다.

### 6.3 시드 키워드 5경로
1. **수동 부트스트랩 192개** (0순위, 0030에 박음). 나머지 4경로는 전부 이 위에 얹는 것이다.
2. **기존 사용자 데이터 흡수** (1회, 0031)
3. **검색 로그 마이닝** (지속) — `search_history`에서 최근 14일 2회 이상 등장 쿼리를 `origin='user_search'`로 승격
4. **AI 확장** (분기 1회) — 기존 `lib/reference/engine.ts:expandKeywords()` 재사용, Haiku 24콜
5. **브랜드 역추출** (선택)

**자동 정리**: `hit_count / crawl_count < 0.05`가 7일 연속이면 `is_active=false`. 죽은 키워드에 예산을 계속 태우지 않는다. 플래너는 업종별 `weight × decay(last_crawled_at)` 상위 8개를 뽑아 매일 다른 조합이 돌게 한다.

### 6.4 Vercel maxDuration 300초 안에서 나누는 법 — 큐 + 짧은 워커 슬롯

**한 번에 다 도는 라우트를 만들지 않는다.**

| 크론 | UTC | KST | 하는 일 |
|---|---|---|---|
| `/api/cron/pool-plan` | `5 18 * * *` | 03:05 | 예산 배분 → 그날 job 약 380건 큐잉. **공급사 호출 0.** 10초 내 종료 |
| `/api/cron/pool-work` | `*/10 18-20 * * *` | 03:10~05:50 (18회) | 큐에서 job 처리. **T+240초에 새 job 픽업 중단**, 진행분만 마무리 후 종료 |
| `/api/cron/pool-enrich` | `10 21 * * *` | 06:10 | 신규 소재 AI 요약·후킹·브랜드 업종 분류 (Haiku, 20건 배치 병렬) |
| `/api/cron/pool-finalize` | `40 21 * * *` | 06:40 | `heat_score` 재계산, 종료 광고 `is_active=false`·`run_days` 갱신, 썸네일 실패분 최대 3회 재시도, `refresh_industry_stats()`, 알림 발송 |

슬롯 18회 × 약 21 job = 378 job/일. 슬롯 하나가 통째로 실패해도 job은 `pending`으로 남아 다음 슬롯이 집는다 — **개인별 크론의 "타임아웃 나면 그 사용자는 그날 통째로 스킵" 문제가 구조적으로 사라진다.**

### 6.5 `vercel.json` 최종형
```json
{
  "crons": [
    { "path": "/api/cron/refresh-tokens",  "schedule": "0 18 * * *" },
    { "path": "/api/cron/flush-dms",       "schedule": "10 23 * * *" },
    { "path": "/api/cron/publish-scheduled","schedule": "0 21 * * *" },
    { "path": "/api/cron/pool-plan",       "schedule": "5 18 * * *" },
    { "path": "/api/cron/pool-work",       "schedule": "*/10 18-20 * * *" },
    { "path": "/api/cron/pool-enrich",     "schedule": "10 21 * * *" },
    { "path": "/api/cron/pool-finalize",   "schedule": "40 21 * * *" }
  ]
}
```
**`{ "path": "/api/cron/collect-references", "schedule": "30 21 * * *" }` 삭제.** 라우트 파일은 Phase 2 동안 남기되 즉시 `{ ok:false, reason:'deprecated' }`를 반환하게 막는다.
크론 라우트는 전부 `export const runtime = "nodejs"`, `export const maxDuration = 300`.

### 6.6 초기 재고 백필 스프린트 (필수)
런칭 2주 전, `crawl_budget.calls_limit`을 임시로 **2,000/일**로 올려 14일간 돈다. 28,000콜 × 2.59원 = **72,520원 일회성** + AI 분류 약 29,250원 = **약 101,800원**. 결과 재고 약 6만 건. 이걸 안 하면 오픈 첫날 업종 탭이 비어 보이고, 그게 제품 인상을 결정한다.

### 6.7 선행 수정 1건 (없으면 브랜드 단위 분류 자체가 불가)
`lib/reference/meta-ads.ts`의 `normalizeAd()`가 지금 `page_name`(문자열)만 뽑고 **`page_id`를 안 뽑는다**(실측 확인, 62~78행). 브랜드 동일성 키가 문자열 이름이면 "㈜아모레퍼시픽"과 "아모레퍼시픽"이 다른 브랜드가 된다. `CollectedAd`에 `pageId: string`을 추가한다.

`lib/reference/engine.ts:331`의 자유 텍스트 `category`("카테고리 한 단어 (예: 뷰티, 푸드, 커리어)")는 **제거하고 브랜드 분류로 이관**한다. 방치하면 24개 업종과 영원히 어긋나는 세 번째 어휘가 남는다.

---

## 7. 업종 분류

### 7.1 업종 24개 (대분류 5 × 하위 24) + 숨김 키 `etc`

스니핏 25개를 그대로 쓰지 않고 재편한다. 근거: (1) 스니핏은 Google/YouTube Ads까지 커버해 풀이 몇 배 크다 — 같은 세분도면 우리는 24×5=120칸 중 절반이 빈다. **버킷을 굵게 잡는 게 데이터가 적을 때의 유일한 방어다.** (2) 한국 SNS 광고 상위 버티컬인 웨딩·기념일, 문화·콘텐츠가 스니핏에 없다. (3) 생활/주방/오피스 3분할은 KR에서 같은 브랜드가 3칸에 걸려 브랜드 단위 분류를 갉아먹는다.

| 대분류 | 업종 (DB key) |
|---|---|
| 뷰티·헬스 `beauty_health` | 뷰티·화장품 `beauty` / 건강기능식품 `supplement` / 다이어트·피트니스 `fitness` / 병원·의료 `medical` |
| 푸드·리빙 `food_living` | 식품·간편식 `food` / 외식·카페 `dining` / 리빙·인테리어 `living` / 생활·주방용품 `houseware` / 반려동물 `pet` |
| 패션·라이프 `fashion_life` | 패션·잡화 `fashion` / 유아·출산 `baby` / 여행·숙박 `travel` / 스포츠·아웃도어 `sports` / 웨딩·기념일 `wedding` |
| 디지털·엔터 `digital` | 가전·디지털 `electronics` / 게임 `game` / 앱·IT서비스 `app` / 문화·콘텐츠 `culture` |
| 서비스·비즈니스 `business` | 교육·자격증 `education` / 금융·보험 `finance` / 부동산·분양 `realestate` / 창업·부업 `startup` / 자동차·모빌리티 `auto` / 통신·인터넷 `telecom` |

`etc`(기타)는 **UI에 타일로 절대 렌더하지 않는다.** 분류기가 확신 못 한 브랜드의 대피소다. 이게 없으면 저확신 소재가 실제 업종을 오염시킨다.

**대분류를 둔 진짜 이유는 emptyGate의 롤업 경로다** — 하위 업종이 물량 미달로 숨겨져도 그 소재는 대분류로 합산돼 살아남는다. 평면 24개에는 이 대피 경로가 없어서 미달 업종의 소재가 통째로 사라지거나 억지로 노출되거나 둘 중 하나가 된다.

**어휘 통합**: `TREND_CATEGORIES`(뷰티/푸드/여행/게임/재테크… 15개, `lib/mock/data.ts:798`)는 콘텐츠 장르 어휘로 업종과 축이 다르면서 80% 겹친다. 두 어휘를 유지하면 AI 프롬프트도 두 벌이 된다 → **폐기하고 INDUSTRIES 라벨에서 파생**시킨다(`/library` 씨앗 칩, `/studio:999` 아이디어 필터 둘 다 업종 어휘로 통일).

### 7.2 분류 = 브랜드 단위 3단 파이프라인 (소재 단위 AI 기각)

**기각 근거 — 소재 단위 AI는 소재 획득 원가보다 3~5배 비싸다:**
- 소재 1건 획득: `search/ads` 1콜 30건 → 2.59 ÷ 30 = **0.086원/건**. 커서 혼합 실전 = **0.173원/건**
- 소재 1건 Haiku 분류(입력 490tok + 출력 25tok): **0.85원** (본문 120자로 줄여도 0.45원)
- → **분류가 수집의 2.6~4.9배.** 데이터를 사 오는 것보다 라벨 붙이는 게 비싼 구조는 설계가 틀린 것이다.

**브랜드 단위로 붙이면**: 브랜드 1곳(브랜드명 + 소재 5건 본문 앞 80자 + CTA + IG 바이오, 700tok in / 30tok out) = **1.17원/브랜드**. 브랜드당 평균 소재 25건 → **소재 1건당 0.047원** = 획득 원가의 1/3.7. 정상 비율.

1. **시드 투표(0원)** — 우리는 어차피 업종별 시드 키워드로 크롤링한다. "어떤 시드에 걸렸나"가 곧 업종 1표. 브랜드 소재 3건 이상 + 특정 업종 득표율 ≥ 60% → 확정. 기대 해결률 55~65%.
2. **Haiku 브랜드 배치 분류(미해결분만)** — 30곳 단위, `engine.ts`의 기존 structured output 패턴 재사용, `IndustryKey` **enum 강제**. `confidence < 0.5` → `etc`로 대피. 신규 300곳/일 × 40% = 120곳 → **월 약 4,200원**.
3. **관리자 오버라이드** — `source='manual'`은 절대 덮어쓰지 않는다. 노출량 상위 500 브랜드만 수기 검수(2.5시간, 1회성). 사용자 오분류 신고 3건 누적 시 관리자 큐 상단 자동 승격.

**소재 단위 AI는 멀티카테고리 브랜드에만** (쿠팡·올리브영·마켓컬리 등, 브랜드 수 2~3% / 소재 물량 10%) → 월 약 4.1만원.

**오가닉**은 크리에이터 계정(`creator_handle`)을 브랜드 자리에 놓고 같은 파이프라인. 계정당 1회 분류, 이후 그 계정의 모든 게시물이 상속.

**총 월 분류 원가 약 4.5만원** — 소재 전량 AI(40.5만원) 대비 **89% 절감**. 그 4.5만원의 92%가 멀티카테고리 소재 재분류다.

### 7.3 emptyGate — 24칸을 다 그리는 코드가 나올 수 없게 만든다

```ts
// lib/industry/taxonomy.ts
const INDUSTRIES = [...] as const;                        // export 하지 않는다 (모듈 내부)
export type IndustryKey = (typeof INDUSTRIES)[number]["key"];
export function industryLabel(k: IndustryKey): string;    // 라벨 조회만 공개

// lib/actions/industry.ts (server)
export async function listVisibleIndustries(): Promise<IndustryStat[]>  // 화면이 목록을 얻는 유일한 경로
```
**화면은 `INDUSTRIES` 배열 자체에 손이 닿지 않는다.** 실수로 24칸을 다 그릴 방법이 코드상 없다.

노출 자격 (AND, `industry_stats`가 매일 계산):

| 조건 | 임계 | 근거 |
|---|---:|---|
| `live_creatives`(최근 90일) | ≥ 60 | 4열 그리드 15행 = 스크롤 3번. 이보다 적으면 첫 화면에서 바닥이 보인다 |
| `brand_count` | ≥ 12 | 첫 화면 12~16장에 같은 브랜드가 반복되면 트렌드가 아니라 그 브랜드 광고판이다 |
| `fresh_7d` | ≥ 5 | 주 5건 미만이면 다음 주에 와도 화면이 그대로다 = 죽은 업종 |
| `platform_creatives`(탭별) | ≥ 20 | 미달 플랫폼은 **탭 자체를 렌더하지 않는다**(disabled 아님, 부재) |

미달 업종 처리 3단: ① 숨김(타일 자체를 안 그린다) ② 대분류로 롤업(소재는 안 버린다) ③ 그룹 헤더 우측에 `준비 중 n개` 텍스트 한 줄. **타일·카드·플레이스홀더는 절대 만들지 않는다.**

타일에 `1,240건 · 브랜드 86곳`을 `.tnum`으로 늘 노출한다. 60건짜리와 4,000건짜리가 똑같아 보이면 60건짜리를 클릭한 사용자가 배신감을 느낀다. **숫자를 먼저 보여주면 기대치를 사용자가 스스로 조정한다** — 임계 60건을 방어적으로 낮게 잡을 수 있는 이유이기도 하다.

필터 패널의 모든 옵션은 현재 조합 기준 **패싯 카운트**를 달고 나오고(기존 `FacetChip` 패턴 그대로) 카운트 0은 렌더하지 않는다. **0건에 도달하는 유일한 경로는 사용자가 직접 친 검색어뿐**이고, 그건 사용자가 원인을 아는 0건이라 괜찮다.

---

## 8. 크레딧 과금 지점

### 8.1 사장님 지시와의 차이를 먼저 밝힌다

지시는 "크레딧은 검색할 때만 차감"이었다. 취지(수집 단위 과금 폐기, 과금 시점을 사용자 행동 쪽으로)는 그대로 지키되 **"풀에 없는 것을 검색할 때 차감"으로 정밀화**한다. 근거 셋:
1. **캐시 히트는 실원가 0원이다.** 크롤러가 이미 지불했다. 과금하면 우리가 안 쓴 돈을 받는 것이고, 사용자가 검색을 아낀다.
2. **검색을 아끼면 풀이 비어 보인다.** 이번 개편의 목표(스니핏급 화면 밀도)와 정면 충돌한다.
3. **스니핏도 브라우징에 과금하지 않는다.** 과금은 썸네일 1 / 카피 1 / 영상내용 3 / 음성·대사 3 — **분석 깊이**에 붙지 검색 자체에 안 붙는다.

**구현자가 막히지 않게**: `lib/actions/credits.ts`에 `export const SEARCH_CHARGE_POLICY: "miss_only" | "always" = "miss_only";` 상수를 두고 `poolSearch` 액션이 이걸 읽는다. 정책 변경은 1줄. 기본값 `miss_only`로 출고한다.

### 8.2 무료 (0크레딧) — 실원가 0원
풀 검색(키워드·업종·플랫폼·정렬·필터·무한스크롤) / 업종 탭 전체 열람 / 소재 상세(썸네일 원본·카피 전문·게재 기간·게재 플랫폼) / 브랜드 페이지 풀 보유 소재 전량 / 저장·보드·메모·확인 상태·브랜드 팔로우 / **다른 사용자가 이미 구매한 대본·AI 분석 열람**(★ 공용 풀의 핵심 세일즈 포인트 — "이미 분석됨" 배지로 노출)

### 8.3 과금 (실제 추가 원가 발생분만) — 1크레딧 = 원가 25원 기준 승계

| 행위 | 크레딧 | 실원가 | 산출 |
|---|---:|---:|---|
| **라이브 검색** — 풀에 없는 키워드 즉시 수집 | **2** | 28원 | SC 2콜(5.2원) + Haiku 분류 20건(23원) |
| **브랜드 심층 수집** — 게재중 전량(커서 끝까지) | **3** | 40원 | `company/ads` 3~5콜 |
| **영상 대본 추출** (`basis=voice`, 캐시 없을 때만) | **2** | 3원 | 최초 1인만 지불, 이후 전원 0 |
| **AI 소재 분석** (`basis=video`, 후킹 구조·타겟·개선안) | **3** | 68원 | 중급 모델 1콜. 최초 1인만 |
| **AI 대본 생성** (이 소재 기반 내 브랜드용) | **6** | 159원 | 개인화 산출물이라 공유 캐시 불가 |
| **브랜드 알림 등록** (`saved_brands.alert`) | 월 **5**/브랜드 | 크롤 슬롯 점유 | 유일한 구독형 차감 — 실제 콜 예산을 먹는다 |

→ 스니핏의 "썸네일 1 / 카피 1 / 영상 내용 3 / 음성·대사 3" 차등은 우리 구조에서 **썸네일·카피 = 풀 검색(0) / 영상 내용 = AI 분석(3) / 음성·대사 = 대본(2, 캐시 히트 0)**으로 재매핑된다. 화면의 `[기준 ▾]` 드롭다운이 이 축이다.

**0크레딧으로 두는 것**: 라이브 검색 결과 0건 / 공급사 오류 / 중복만 반환. 실패에 과금하면 CS가 폭발한다(기존 `refundGenerationCredits` 배선 그대로 재사용).

### 8.4 `lib/actions/credits.ts` 변경 (실측 현행값 기준)
```ts
export const CREDIT_COSTS = {
  cardnews: 2, diagnosis: 3,             // 현행 유지 (변경은 별건)
  poolLive: 2, poolBrandDeep: 3,
  transcript: 2, deepAnalysis: 3, scriptGen: 6,
  brandAlertMonthly: 5,
} as const;
```
`collect: 2` / `adCollect: 2` **제거**. `FREE_MONTHLY_LIMITS`의 `reference_collect` / `ad_collect` **삭제**(개인 수집이 사라지므로 무의미). 신규 `pool_live: { free: 0, creator: 30, pro: 100, agency: 300, enterprise: 1000 }`.

### 8.5 플랜별 무료 열람 범위

| | 무료 | 스타터 이상 |
|---|---|---|
| 풀 검색·업종 탐색 | 무제한 | 무제한 |
| 검색 결과 노출 | **상위 20건** | 전체 |
| 라이브 검색 | ✕ (버튼 노출 + 비활성 + "유료 플랜에서 사용") | ○ |
| 저장 | 30건 | 무제한 |
| 대본·분석 캐시 열람 | ○ | ○ |
| 브랜드 알림 | ✕ | 플랜별 개수 |

무료에게 열람을 무제한으로 열되 상위 20건으로 자른다 — 화면은 채워져 보이고("이런 게 이만큼 있구나"), 깊이 파려면 결제해야 한다.

### 8.6 남용 방어 (열람이 무료라서 필요)
인증 필수 + 사용자당 분당 60검색 rate limit / 라이브 검색은 사용자당 시간당 10회 상한(크레딧이 있어도) / 응답에 총건수 대신 페이지 커서만 / `search_history` 이상치 감지(시간당 500+ 쿼리) → 자동 일시정지 + 운영 알림.

---

## 9. 기존 개인 수집물 처리 방침 — 병존 → 백필 이관 → 90일 후 폐기

**즉시 폐기 반대.** 기존 사용자 데이터는 손실 없이 갈 수 있다. 개인 수집물은 (1) 콘텐츠 자체와 (2) 그 사용자의 개인 상태가 섞여 있는데, (1)은 공용 풀로 병합되고 (2)는 개인 표로 그대로 옮겨간다.

| Phase | 시점 | 내용 |
|---|---|---|
| **0 — 신설만** | 배포 즉시 (0027~0030) | 공용·개인·운영 표 생성 + 시드 192개. **기존 표는 손대지 않는다.** 읽기 경로 변화 0, 롤백 비용 0. 크롤러를 먼저 돌려 재고를 쌓는다(백필 스프린트 2주) |
| **1 — 백필** | 스프린트 종료 (0031) | 콘텐츠 승격(중복은 `unique(platform, external_id)`가 자동 병합) + 개인 상태 이관(손실 0) + 키워드 승격 |
| **2 — 병존** | 90일 | `/library` 읽기를 공용 풀로 전환. 개인 수집 UI(수집 기준 등록·"지금 수집")를 **라이브 검색**으로 대체. 기존 표는 **읽기 전용**으로 남기고 "내 예전 수집함(보관)" 탭으로 노출. `runCollection`/`runAdCollection`은 즉시 `{ok:false, reason:'deprecated'}` 반환 |
| **3 — 폐기** | 90일 후 (0032) | DROP + Storage 버킷 삭제 + 크론 라우트 파일 삭제 |

**왜 즉시 폐기가 아닌가 — 구체적 근거**: `lib/reference/scrapecreators.ts`의 `normalizeIgHashtagPost()`는 `str(raw.id) || str(raw.shortcode)`, `normalizeIgUserPost()`는 `str(raw.id) || str(raw.code)`로 폴백한다. **같은 게시물이 응답 경로에 따라 숫자 pk로도, shortcode로도 저장돼 있을 수 있다.** 백필 시 `unique(platform, external_id)`가 이 둘을 다른 소재로 본다. 90일 병존이면 실데이터에서 비율을 측정하고 정규화 규칙을 고쳐 재백필할 수 있다. 즉시 DROP하면 원본이 없어 복구 불가다.

**썸네일 재배치**: `{user_id}/{channel}-{externalId}.jpg` → `{platform}/{앞2자}/{external_id}_d.jpg`. 같은 소재의 N개 복사본 중 **첫 1개만 복사**. 1회성 Node 스크립트 `scripts/migrate-pool-thumbs.ts`. 실패분은 `thumb_state='pending'`으로 두면 finalize가 원본 URL에서 다시 받아온다.

**사용자가 잃는 것 하나 (정직하게)**: "내가 등록한 키워드로 **내가** 모은 수집함"이라는 소유감. `origin_query` 보존만으로는 안 되고, **키워드 구독**(내 키워드에 신규 소재가 들어오면 알림 + `/library?q=내키워드` 저장 뷰)을 같이 내야 한다. 이게 없으면 이번 전환은 사용자에게 기능 후퇴로 읽힌다. Step 8에 포함.

---

## 10. 월 원가 (참고)

| | 현행(개인별 수집) | 공용 풀 |
|---|---:|---:|
| 유료 50명 | 약 122,000원 | **50,184원** |
| 유료 200명 | 약 490,000원 | **50,184원** |
| 유료 2,000명 | 약 4,900,000원 | **50,184원** |

런치기(첫 1~2개월) 약 74,754원 = 공급사 32,634 + AI 42,120. 정상상태 약 50,184원. **손익분기는 유료 21명 근처**이고 그 위로는 격차가 선형으로 벌어진다. 이번 전환의 실질은 "레퍼런스 원가를 변동비에서 고정비로 옮기는 것"이다.

---

## 11. 검증 순서 (매 단계 종료 시)

`npm run build` → `npm run lint` → 라이트/다크 각각 375·768·1024·1440에서 lg↔xl 경계 리사이즈 시 **카드 폭 연속성** 확인 → `prefers-reduced-motion` / `prefers-reduced-transparency` / `prefers-contrast: more` 3종 토글 확인 → 터치 기기에서 탭 후 hover 잔상 없음 확인 → 카드 60장 그리드에서 정렬 축 전환 시 롱태스크 50ms 초과 0회.