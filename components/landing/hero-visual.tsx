import { TrendingUp } from "lucide-react";
import { AppIconTile } from "@/components/icons/brand";

/*
  히어로 우측 비주얼 — 대시보드 목업 카드 + 플로팅 채널 앱 아이콘.
  그라디언트 대신 border-line 동심원으로 배경 깊이를 만든다 (PART 7 그림자·그라디언트 금지).
  전체가 장식이므로 aria-hidden.
*/

const HERO_STATS = [
  { label: "팔로워", value: "8.9만", delta: "+4.2%" },
  { label: "주간 조회수", value: "128.4만", delta: "+12.6%" },
];

/* Sparkline 데이터 [12,28,22,45,61,58,88] (380x56, pad 2) 좌표 — 경로 길이 약 383 */
const SPARK_POINTS = "2,54 64.7,43.1 127.3,47.2 190,31.4 252.7,20.5 315.3,22.5 378,2";

export function HeroVisual() {
  return (
    <div className="relative" aria-hidden>
      {/* 배경 장식 — 은은한 동심원 (md 이상에서만) */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 hidden size-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-line md:block lg:size-[26rem]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 hidden size-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-line/50 md:block lg:size-[33rem]" />

      {/* 플로팅 앱 아이콘 — 카드와 살짝 겹치게, 서로 다른 리듬으로 부유 */}
      <div
        className="anim-float absolute -right-4 -top-9 z-20 hidden md:block"
        style={{ animationDelay: "0.2s", animationDuration: "5.4s" }}
      >
        <AppIconTile app="instagram" size={64} />
      </div>
      <div
        className="anim-float absolute -left-10 top-20 z-20 hidden md:block"
        style={{ animationDelay: "1.1s", animationDuration: "6.2s" }}
      >
        <AppIconTile app="tiktok" size={56} />
      </div>
      <div
        className="anim-float absolute -right-9 bottom-14 z-20 hidden md:block"
        style={{ animationDelay: "1.8s", animationDuration: "5s" }}
      >
        <AppIconTile app="threads" size={50} />
      </div>
      {/* 메타 — 카드 앞(z-20), 좌하단 모서리에 확실히 보이게 */}
      <div
        className="anim-float absolute -bottom-9 left-6 z-20 hidden md:block"
        style={{ animationDelay: "2.4s", animationDuration: "6.8s" }}
      >
        <AppIconTile app="meta" size={48} />
      </div>

      {/* 대시보드 목업 카드 */}
      <div className="relative z-10 rounded-card border border-line bg-body p-5">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            <span className="rounded-chip bg-primary px-3 py-1 text-xs font-semibold text-on-primary">전체</span>
            <span className="rounded-chip border border-line bg-overlay px-3 py-1 text-xs font-semibold text-fg-sub">
              Instagram
            </span>
            <span className="rounded-chip border border-line bg-overlay px-3 py-1 text-xs font-semibold text-fg-sub">
              TikTok
            </span>
          </div>
          <TrendingUp className="size-4 text-positive" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {HERO_STATS.map((s) => (
            <div key={s.label} className="rounded-card border border-line bg-surface p-4">
              <p className="text-xs text-fg-sub">{s.label}</p>
              <p className="tnum mt-1 text-xl font-bold">{s.value}</p>
              <p className="tnum mt-0.5 text-xs font-semibold text-positive">{s.delta}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-card border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-fg-sub">최근 게시물 추이</p>
            <span className="anim-pulse rounded-chip bg-primary-weak px-2 py-0.5 text-[11px] font-semibold text-primary">
              NEW 광고 감지 1건
            </span>
          </div>
          {/* 스파크라인 — stroke 드로잉 연출 (.anim-draw) */}
          <svg viewBox="0 0 380 56" className="mt-2 h-14 w-full">
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
  );
}
