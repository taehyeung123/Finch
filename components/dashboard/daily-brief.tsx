"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  MessageSquareReply,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { FinchMark } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";
import { AppIconTile } from "@/components/icons/brand";
import { formatCompact, formatDate } from "@/lib/format";
import type { PoolHomeStats } from "@/lib/pool/home-stats";

/*
  홈 상단 — 스니핏 실캡처 대조 4차: "프리미엄 질감" 패스 (2026-08-15).
  3차까지 구조는 맞췄지만 각진 라운드·테두리-온리 카드·풀채도 단색 히어로가
  와이어프레임 인상을 만들었다(사장님 지적). 이번 패스:
  - 전역 radius-card 8→12px(globals) + 홈 카드 전부 shadow-panel(스니핏 실측 그림자)
    + 테두리 미미화(border-line/60) — "선으로 구분"에서 "빛으로 구분"으로
  - 히어로: 딥 코랄 그라데이션(primary→pressed) + 유리 칩 + 대형 로고 워터마크
  - 검색바·버튼·칩: rounded-chip 필 형태(스니핏의 둥근 검색바 대응), 칩은 채움형+컬러 아이콘
  - 카드 hover 리프트, 숫자 40px 스케일, 자간 타이트닝
*/

const FINCH_NEWS = [
  { date: "2026. 08. 15", title: "자동 DM이 새로워졌어요 — 5단계 자동화 위저드 출시" },
  { date: "2026. 08. 14", title: "다음에 올릴 게시물 예약 자동화가 추가됐어요" },
  { date: "2026. 08. 12", title: "레퍼런스 의미 검색 도입 — 문장으로 찾아보세요" },
];

/** 홈 공용 카드 스킨 — 부드러운 그림자 + 옅은 테두리 (스니핏 질감) */
const panel = "rounded-card border border-line/60 bg-overlay shadow-panel";

/** ① 히어로 — 딥 그라데이션 브리핑 + 핀치 소식 리스트 */
export function DailyBriefHero({ stats }: { stats: PoolHomeStats }) {
  const hasNew = stats.newCreatives3d > 0;

  return (
    <section aria-label="오늘의 핀치" className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="shadow-panel relative flex min-h-[228px] flex-col justify-end overflow-hidden rounded-card bg-gradient-to-br from-primary via-primary-hover to-primary-pressed p-7">
        {/* 빛 번짐 + 대형 로고 워터마크 — 이미지 없이 깊이감 */}
        <span aria-hidden className="absolute -right-14 -top-28 size-72 rounded-full bg-on-primary/[0.14] blur-3xl" />
        <span aria-hidden className="absolute -left-12 bottom-2 size-44 rounded-full bg-warning/25 blur-2xl" />
        <FinchMark
          aria-hidden
          className="absolute -bottom-8 -right-6 size-44 rotate-[-8deg] text-on-primary opacity-[0.08]"
        />

        <span className="absolute left-6 top-6 inline-flex items-center gap-2">
          <span className="rounded-chip bg-on-primary/15 px-3 py-1 text-[11px] font-bold tracking-wide text-on-primary backdrop-blur-sm">
            오늘의 핀치
          </span>
          <span className="tnum text-[12px] font-medium text-on-primary/70">
            {formatDate(new Date().toISOString())}
          </span>
        </span>

        <div className="relative">
          <h2 className="text-[28px] font-bold leading-[1.25] tracking-[-0.02em] text-on-primary">
            {hasNew ? (
              <>
                새 레퍼런스 <span className="tnum">{formatCompact(stats.newCreatives3d)}건</span>이<br />
                들어왔어요
              </>
            ) : (
              <>
                오늘의 레퍼런스를
                <br />
                탐색해 보세요
              </>
            )}
          </h2>
          <p className="mt-2.5 max-w-[400px] text-[14px] leading-relaxed text-on-primary/80">
            {hasNew
              ? "최근 3일 동안 공용 풀에 쌓인 소재예요. 우리 업종에서 뭐가 뜨는지 확인해 보세요."
              : "매일 자동 수집이 돌며 새 소재가 쌓입니다. 업종별 레퍼런스를 둘러보세요."}
          </p>
        </div>
      </div>

      {/* 핀치 소식 — 옅은 구분선 리스트 */}
      <div className={cn(panel, "flex flex-col justify-center p-3")}>
        {FINCH_NEWS.map((n, i) => (
          <Link
            key={n.title}
            href="/notifications"
            className={cn(
              "group rounded-card px-3.5 py-3 trans-state hover:bg-body",
              i > 0 && "border-t border-line/50",
            )}
          >
            <p className="tnum text-[11px] font-medium text-fg-faint">{n.date}</p>
            <p className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug trans-state group-hover:text-primary">
              {n.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** 추천 칩 아이콘 컬러 로테이션 — 컬러 밀도(스니핏의 컬러풀 칩 대응) */
const CHIP_TONES = ["text-primary", "text-positive", "text-warning", "text-ig", "text-tiktok-cyan"];

/** 검색 대상 세그먼트 — 스니핏 검색바의 [썸네일 ▾] 드롭다운 대응 (탐색 target 필터 딥링크) */
const SEARCH_TARGETS = [
  { value: "all", label: "전체" },
  { value: "instagram", label: "인스타그램" },
  { value: "tiktok", label: "틱톡" },
  { value: "ads", label: "메타광고" },
] as const;

/** ② 중앙 대형 검색바 — 세그먼트 + 필 형태 + 포커스 글로우 */
export function HomeSearch({ stats }: { stats: PoolHomeStats }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<(typeof SEARCH_TARGETS)[number]["value"]>("all");

  function push(v: string) {
    const params = new URLSearchParams();
    if (v) params.set("q", v);
    if (target !== "all") params.set("target", target);
    const qs = params.toString();
    router.push(qs ? `/library?${qs}` : "/library");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    push(q.trim());
  }

  return (
    <section aria-label="레퍼런스 검색" className="mx-auto w-full max-w-2xl py-3">
      <form
        onSubmit={submit}
        className="shadow-panel flex h-16 items-center rounded-chip border border-line/60 bg-overlay pl-2.5 pr-2 transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[0_0_0_4px_var(--color-primary-weak),0_0_16px_rgba(107,110,116,0.16)]"
      >
        {/* 검색 대상 세그먼트 — 스니핏의 드롭다운 자리 */}
        <label className="relative flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-chip bg-body pl-4 pr-8 text-[15px] font-semibold text-fg-sub trans-state hover:text-fg">
          <span className="sr-only">검색 대상</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as typeof target)}
            className="absolute inset-0 cursor-pointer appearance-none opacity-0"
          >
            {SEARCH_TARGETS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {SEARCH_TARGETS.find((t) => t.value === target)?.label}
          <ChevronRight className="pointer-events-none absolute right-3 size-3.5 rotate-90 text-fg-faint" aria-hidden />
        </label>

        <span aria-hidden className="mx-3 h-6 w-px shrink-0 bg-line" />

        <Search className="mr-2 size-5 shrink-0 text-fg-faint" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="생각나는 레퍼런스를 문장으로 검색해 보세요"
          aria-label="레퍼런스 검색"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-faint"
        />
        <button
          type="submit"
          className="flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-chip bg-primary px-6 text-[15px] font-semibold text-on-primary trans-state hover:bg-primary-hover"
        >
          <Search className="size-4" aria-hidden />
          검색
        </button>
      </form>

      {stats.searchChips.length > 0 ? (
        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
          {stats.searchChips.map((chip, i) => (
            <Link
              key={chip}
              href={`/library?q=${encodeURIComponent(chip)}`}
              className="shadow-panel inline-flex items-center gap-1.5 rounded-chip border border-line/50 bg-overlay px-3.5 py-2 text-[14px] font-medium text-fg-sub transition-all hover:-translate-y-0.5 hover:border-primary hover:text-primary"
            >
              <Search className={cn("size-3", CHIP_TONES[i % CHIP_TONES.length])} aria-hidden />
              {chip}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** 브랜드 아바타 — 이니셜 + 토큰 톤 로테이션 */
function BrandAvatar({ name, index }: { name: string; index: number }) {
  const tones = ["bg-primary-weak text-primary", "bg-positive-weak text-positive", "bg-warning-weak text-warning"];
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ring-1 ring-line/60",
        tones[index % tones.length],
      )}
      aria-hidden
    >
      {name.replace(/^@/, "").charAt(0)}
    </span>
  );
}

/** ③ 아카이빙 현황 — BRAND ARCHIVE (스니핏 대응, 카드 리프트·그림자 질감) */
export function ArchiveStatus({ stats }: { stats: PoolHomeStats }) {
  return (
    <section aria-label="아카이빙 현황">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.08em] text-primary">BRAND ARCHIVE</p>
          <h2 className="mt-1 text-[20px] font-bold leading-snug tracking-[-0.01em]">오늘의 아카이빙 현황</h2>
          <p className="mt-1 text-[14px] text-fg-sub">최근 수집된 소재와 브랜드 흐름을 한눈에 확인하세요.</p>
        </div>
        <ButtonLink href="/library" size="sm" className="rounded-chip px-4">
          탐색으로 이동 <ArrowRight className="size-3.5" aria-hidden />
        </ButtonLink>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span className="shadow-panel rounded-chip border border-primary/60 bg-primary-weak px-3.5 py-1.5 text-[12px] font-semibold text-primary">
          전체
        </span>
        <AppIconTile app="instagram" size={28} />
        <AppIconTile app="tiktok" size={28} />
        <AppIconTile app="threads" size={28} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={cn(panel, "p-6 transition-transform hover:-translate-y-0.5")}>
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold text-fg-sub">신규 수집 소재</p>
            <span className="rounded-chip bg-primary-weak px-2.5 py-1 text-[11px] font-semibold text-primary">
              최근 3일
            </span>
          </div>
          <p className="tnum mt-4 text-[40px] font-bold leading-none tracking-[-0.02em]">
            {formatCompact(stats.newCreatives3d)}
            <span className="ml-1.5 text-[15px] font-medium tracking-normal text-fg-sub">개</span>
          </p>
          <p className="mt-2.5 text-[12px] text-fg-sub">공용 풀에 새로 수집된 소재예요</p>
          <div className="mt-5 border-t border-line/60 pt-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[14px] font-semibold text-fg-sub">수집 중인 브랜드</p>
              <p className="tnum text-[28px] font-bold leading-none tracking-[-0.01em]">
                {formatCompact(stats.totalBrands)}
                <span className="ml-1 text-[14px] font-medium tracking-normal text-fg-sub">개</span>
              </p>
            </div>
          </div>
        </div>

        <div className={cn(panel, "p-6 transition-transform hover:-translate-y-0.5")}>
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[14px] font-semibold text-fg-sub">
              <TrendingUp className="size-3.5 text-primary" aria-hidden /> 콘텐츠가 많이 게재된 브랜드
            </p>
            <span className="rounded-chip bg-primary-weak px-2.5 py-1 text-[11px] font-semibold text-primary">
              최근 7일
            </span>
          </div>
          {stats.topBrands.length > 0 ? (
            <ul className="mt-3.5 space-y-0.5">
              {stats.topBrands.map((b, i) => (
                <li key={b.name}>
                  <Link
                    href={`/library?q=${encodeURIComponent(b.name)}`}
                    className="group flex items-center gap-3 rounded-card px-2.5 py-2.5 trans-state hover:bg-body"
                  >
                    <BrandAvatar name={b.name} index={i} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold trans-state group-hover:text-primary">
                      {b.name}
                    </span>
                    <span className="tnum shrink-0 text-[14px] font-semibold text-fg-sub">{b.count}개</span>
                    <ChevronRight
                      className="size-4 shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3.5 text-[14px] text-fg-sub">이번 주 수집이 시작되면 브랜드가 표시돼요.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** ④ 다음에 할 것 — 홈 종결부 바로가기 */
export function NextActions() {
  const actions = [
    { href: "/auto-dm", icon: MessageSquareReply, label: "자동 DM 만들기", desc: "댓글에 자동으로 DM 발송" },
    { href: "/studio", icon: Sparkles, label: "AI 스튜디오", desc: "카드뉴스·아이디어 생성" },
    { href: "/publish", icon: CalendarClock, label: "발행", desc: "예약한 게시물 확인" },
  ];
  return (
    <section aria-label="바로가기" className="grid gap-4 sm:grid-cols-3">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={cn(panel, "group flex items-center gap-3.5 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/60")}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-card bg-gradient-to-br from-primary-weak to-warning-weak text-primary">
            <a.icon className="size-[18px]" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold trans-state group-hover:text-primary">{a.label}</span>
            <span className="mt-0.5 block truncate text-[12px] text-fg-sub">{a.desc}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
