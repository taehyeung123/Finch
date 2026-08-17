import { Bell, Search, TrendingUp } from "lucide-react";
import { AppIconTile } from "@/components/icons/brand";
import { FinchMark } from "@/components/logo";

/*
  히어로 제품 화면 — 2026-08-15 재구성.

  앞 버전은 히어로 **우측 절반**에 들어가는 세로 카드였다. 그래서 사이드바도 없고
  상단 바도 없는, "지표 카드 몇 장"만 보였다. 제품이 어떻게 생겼는지는 하나도
  전달되지 않는데 화면의 절반을 쓰고 있었다.

  벤치마크(스니핏·링크팜) 둘 다 히어로 아래에 **앱 화면 통짜**를 넓게 깐다.
  그게 "이거 진짜 도구구나"를 만드는 유일한 요소다. 그래서 여기도 사이드바 +
  상단 바 + 본문이 있는 **화면 한 장**으로 다시 만들었다.

  스크린샷 PNG 를 쓰지 않는 이유: ① 다크 모드에서 라이트 화면이 박힌다
  ② 화면이 바뀌면 즉시 거짓말이 된다 ③ 고해상도 PNG 는 히어로 LCP 를 잡아먹는다.
  살아있는 마크업이면 셋 다 없다.

  전체가 장식이므로 aria-hidden — 스크린리더에는 히어로 문구만 읽힌다.
*/

const NAV_MOCK = [
  { label: "홈", on: false },
  { label: "발행", on: true },
  { label: "성과 분석", on: false },
  { label: "탐색", on: false },
  { label: "만들기", on: false },
];

const HERO_STATS = [
  { label: "팔로워", value: "8.9만", delta: "+4.2%" },
  { label: "주간 조회수", value: "128.4만", delta: "+12.6%" },
  { label: "참여율", value: "4.8%", delta: "+0.6%p" },
];

/* Sparkline 데이터 [12,28,22,45,61,58,88] (380x56, pad 2) 좌표 — 경로 길이 약 383 */
const SPARK_POINTS = "2,54 64.7,43.1 127.3,47.2 190,31.4 252.7,20.5 315.3,22.5 378,2";

export function HeroVisual() {
  return (
    <div className="relative" aria-hidden>
      {/* 플로팅 채널 아이콘 — 화면 프레임 모서리에 걸쳐 부유한다.
          md 미만에서는 숨긴다(좁은 화면에서 프레임 위로 겹쳐 글자를 가린다). */}
      <div
        className="anim-float absolute -left-6 -top-7 z-20 hidden md:block"
        style={{ animationDelay: "0.2s", animationDuration: "5.4s" }}
      >
        <AppIconTile app="instagram" size={56} />
      </div>
      <div
        className="anim-float absolute -right-7 -top-5 z-20 hidden md:block"
        style={{ animationDelay: "1.1s", animationDuration: "6.2s" }}
      >
        <AppIconTile app="tiktok" size={48} />
      </div>
      <div
        className="anim-float absolute -bottom-7 left-16 z-20 hidden md:block"
        style={{ animationDelay: "1.8s", animationDuration: "5s" }}
      >
        <AppIconTile app="threads" size={44} />
      </div>
      <div
        className="anim-float absolute -bottom-6 right-14 z-20 hidden md:block"
        style={{ animationDelay: "2.4s", animationDuration: "6.8s" }}
      >
        <AppIconTile app="meta" size={44} />
      </div>

      {/* 화면 프레임 — 카드보다 한 단계 더 뜬다(card-float). 히어로에서 유일하게
          떠 있는 요소라 여기만 큰 그림자를 쓴다. */}
      <div className="card-float relative z-10 overflow-hidden rounded-chip">
        {/* min-h 는 sm 부터. 그 아래에서는 사이드바가 숨는데(hidden sm:flex) 높이만
            남아 프레임 하단에 빈 여백이 생긴다 — 콘텐츠 높이에 맡긴다. */}
        <div className="flex sm:min-h-[19rem] md:min-h-[22rem]">
          {/* 사이드바 — 실제 IA 그대로(홈/발행/성과 분석/탐색/만들기).
              여기 이름이 제품과 다르면 첫 화면부터 거짓말이 된다. */}
          <div className="hidden w-40 shrink-0 flex-col gap-1 border-r border-line bg-rail p-3 sm:flex lg:w-44">
            <div className="mb-2 flex items-center gap-1.5 px-1.5">
              <FinchMark className="size-5 text-primary" />
              <span className="text-[13px] font-bold tracking-[-0.02em]">핀치</span>
            </div>
            {NAV_MOCK.map((n) => (
              <span
                key={n.label}
                className={`rounded-card px-2.5 py-1.5 text-[12px] font-medium ${
                  n.on ? "bg-primary-weak text-primary-ink" : "text-fg-sub"
                }`}
              >
                {n.label}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            {/* 상단 바 */}
            <div className="flex h-11 items-center gap-2 border-b border-line px-3">
              <span className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-card border border-line px-2 text-[11px] text-fg-sub">
                <Search className="size-3 shrink-0" />
                계정·콘텐츠 검색
              </span>
              <span className="relative flex size-7 items-center justify-center rounded-card border border-line">
                <Bell className="size-3.5 text-fg-sub" />
                <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
              </span>
            </div>

            <div className="p-3 md:p-4">
              {/* 채널 필터 칩 */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-chip bg-primary px-2.5 py-1 text-[11px] font-semibold text-on-primary">
                    전체
                  </span>
                  <span className="rounded-chip border border-line px-2.5 py-1 text-[11px] font-semibold text-fg-sub">
                    Instagram
                  </span>
                  <span className="rounded-chip border border-line px-2.5 py-1 text-[11px] font-semibold text-fg-sub">
                    TikTok
                  </span>
                </div>
                <TrendingUp className="size-4 text-positive" />
              </div>

              {/* 지표 3장 — 3열이라 "대시보드"로 읽힌다. 2열은 카드 두 장으로만 보였다 */}
              <div className="mt-3 grid grid-cols-3 gap-2 md:gap-3">
                {HERO_STATS.map((s) => (
                  <div key={s.label} className="rounded-card border border-line bg-plate p-2.5 md:p-3">
                    <p className="truncate text-[11px] text-fg-sub">{s.label}</p>
                    <p className="tnum mt-1 text-[17px] font-bold leading-none md:text-[20px]">{s.value}</p>
                    <p className="tnum mt-1 text-[11px] font-semibold text-positive-strong">{s.delta}</p>
                  </div>
                ))}
              </div>

              <div className="mt-2.5 rounded-card border border-line bg-plate p-3 md:mt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-fg-sub">최근 게시물 추이</p>
                  <span className="anim-pulse rounded-chip bg-primary-weak px-2 py-0.5 text-[11px] font-semibold text-primary-ink">
                    NEW 광고 감지 1건
                  </span>
                </div>
                {/* 스파크라인 — stroke 드로잉 연출 (.anim-draw) */}
                <svg viewBox="0 0 380 56" className="mt-2 h-12 w-full md:h-16">
                  <polyline
                    points={SPARK_POINTS}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="anim-draw"
                    style={{ "--draw-length": "400" } as React.CSSProperties}
                  />
                  <circle cx="378" cy="2" r="3" fill="var(--color-primary)" className="anim-pulse" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
