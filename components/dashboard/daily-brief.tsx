"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronRight,
  MessageSquareReply,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { AppIconTile } from "@/components/icons/brand";
import { formatCompact, formatDate } from "@/lib/format";
import type { PoolHomeStats } from "@/lib/pool/home-stats";

/*
  홈 상단 — 스니핏 홈 실캡처 대조 3차 개편 (2026-08-15).
  1·2차는 텍스트 구조만 옮겨 "밋밋한 회색 대시보드"였다(사장님 지적). 실화면 기준 차이:
  스니핏은 ① 이미지/그라데이션 히어로 + 우측 소식 리스트 ② 중앙 대형 검색바(홈의 주인공)
  ③ 아카이빙 현황에 플랫폼 아이콘·브랜드 아바타 등 시각 요소가 밀도 있게 배치된다.
  전부 우리 토큰(코랄 계열)로 재구성 — hex 하드코딩 없음, 그라데이션은 토큰+투명도 조합.
*/

/** 핀치 소식 — 실제 릴리스 노트 기반 정적 큐레이션 (스니핏 '오늘의 스니핏' 공지 리스트 대응) */
const FINCH_NEWS = [
  { date: "2026. 08. 15", title: "자동 DM이 새로워졌어요 — 5단계 자동화 위저드 출시" },
  { date: "2026. 08. 14", title: "다음에 올릴 게시물 예약 자동화가 추가됐어요" },
  { date: "2026. 08. 12", title: "레퍼런스 의미 검색 도입 — 문장으로 찾아보세요" },
];

/** ① 히어로 — 그라데이션 브리핑 카드 + 핀치 소식 리스트 */
export function DailyBriefHero({ stats }: { stats: PoolHomeStats }) {
  const hasNew = stats.newCreatives3d > 0;

  return (
    <section aria-label="오늘의 핀치" className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      {/* 그라데이션 히어로 — 스니핏의 이미지 히어로 대응 (브랜드 코랄 그라데이션) */}
      <div className="shadow-pop relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-card border border-line bg-gradient-to-br from-primary via-primary/80 to-warning/70 p-6">
        {/* 장식 패턴 — 큰 원형 글로우 2개 (토큰 기반, 이미지 없이 깊이감) */}
        <span
          aria-hidden
          className="absolute -right-16 -top-24 size-64 rounded-full bg-on-primary/10 blur-2xl"
        />
        <span aria-hidden className="absolute -left-10 top-6 size-40 rounded-full bg-on-primary/10 blur-xl" />

        <span className="absolute left-5 top-5 inline-flex items-center gap-2">
          <span className="rounded-chip bg-on-primary/90 px-2.5 py-1 text-[11px] font-bold text-primary">
            오늘의 핀치
          </span>
          <span className="tnum text-[12px] font-medium text-on-primary/80">
            {formatDate(new Date().toISOString())}
          </span>
        </span>

        <div className="relative">
          <h2 className="text-[26px] font-bold leading-tight text-on-primary">
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
          <p className="mt-2 max-w-[420px] text-[13px] leading-relaxed text-on-primary/85">
            {hasNew
              ? "최근 3일 동안 공용 풀에 새로 쌓인 소재예요. 우리 업종에서 뭐가 뜨는지 확인해 보세요."
              : "매일 자동 수집이 돌며 새 소재가 쌓입니다. 업종별 레퍼런스를 둘러보세요."}
          </p>
        </div>
      </div>

      {/* 핀치 소식 리스트 — 스니핏 우측 공지 카드 대응 */}
      <Card className="flex flex-col justify-center gap-1 p-2">
        {FINCH_NEWS.map((n) => (
          <Link
            key={n.title}
            href="/notifications"
            className="group rounded-card px-3.5 py-2.5 transition-colors hover:bg-body"
          >
            <p className="tnum text-[11px] font-medium text-fg-faint">{n.date}</p>
            <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug group-hover:text-primary">
              {n.title}
            </p>
          </Link>
        ))}
      </Card>
    </section>
  );
}

/** ② 중앙 대형 검색바 — 스니핏 홈의 주인공. 제출하면 탐색에 검색어가 채워진 채 열린다 */
export function HomeSearch({ stats }: { stats: PoolHomeStats }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    router.push(v ? `/library?q=${encodeURIComponent(v)}` : "/library");
  }

  return (
    <section aria-label="레퍼런스 검색" className="mx-auto w-full max-w-2xl py-2">
      <form onSubmit={submit} className="shadow-pop flex h-14 items-center gap-2 rounded-card border border-line bg-overlay pl-5 pr-2 transition-colors focus-within:border-primary">
        <Search className="size-5 shrink-0 text-fg-faint" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="생각나는 레퍼런스를 문장으로 검색해 보세요"
          aria-label="레퍼런스 검색"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-faint"
        />
        <button
          type="submit"
          className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-card bg-primary px-4 text-[14px] font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          검색
        </button>
      </form>

      {stats.searchChips.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {stats.searchChips.map((chip) => (
            <Link
              key={chip}
              href={`/library?q=${encodeURIComponent(chip)}`}
              className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-overlay px-3.5 py-2 text-[13px] font-medium text-fg-sub transition-colors hover:border-primary hover:text-primary"
            >
              <Search className="size-3 text-fg-faint" aria-hidden />
              {chip}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** 브랜드 아바타 — 로고가 없어도 이니셜+브랜드 톤 원형으로 시각 밀도를 만든다 */
function BrandAvatar({ name, index }: { name: string; index: number }) {
  const tones = ["bg-primary-weak text-primary", "bg-positive-weak text-positive", "bg-warning-weak text-warning"];
  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${tones[index % tones.length]}`}
      aria-hidden
    >
      {name.replace(/^@/, "").charAt(0)}
    </span>
  );
}

/** ③ 아카이빙 현황 — 채널 아이콘 + 큰 숫자 + 브랜드 아바타 리스트 (스니핏 BRAND ARCHIVE 대응) */
export function ArchiveStatus({ stats }: { stats: PoolHomeStats }) {
  return (
    <section aria-label="아카이빙 현황">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-wide text-primary">BRAND ARCHIVE</p>
          <h2 className="mt-1 text-[19px] font-bold leading-snug">오늘의 아카이빙 현황</h2>
          <p className="mt-0.5 text-[13px] text-fg-sub">최근 수집된 소재와 브랜드 흐름을 한눈에 확인하세요.</p>
        </div>
        <ButtonLink href="/library" size="sm">
          탐색으로 이동 <ArrowRight className="size-3.5" aria-hidden />
        </ButtonLink>
      </div>

      {/* 지원 채널 아이콘 행 — 수집 대상 플랫폼 시각화 */}
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-chip border border-primary bg-primary-weak px-3 py-1 text-[12px] font-semibold text-primary">
          전체
        </span>
        <AppIconTile app="instagram" size={26} />
        <AppIconTile app="tiktok" size={26} />
        <AppIconTile app="threads" size={26} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-fg-sub">신규 수집 소재</p>
            <span className="rounded-chip bg-primary-weak px-2 py-0.5 text-[11px] font-semibold text-primary">
              최근 3일
            </span>
          </div>
          <p className="tnum mt-3 text-[34px] font-bold leading-none">
            {formatCompact(stats.newCreatives3d)}
            <span className="ml-1 text-[15px] font-medium text-fg-sub">개</span>
          </p>
          <p className="mt-2 text-[12px] text-fg-sub">공용 풀에 새로 수집된 소재예요</p>
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[13px] font-semibold text-fg-sub">수집 중인 브랜드</p>
            <p className="tnum mt-1.5 text-[22px] font-bold leading-none">
              {formatCompact(stats.totalBrands)}
              <span className="ml-1 text-[13px] font-medium text-fg-sub">개</span>
            </p>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-fg-sub">
              <TrendingUp className="size-3.5 text-primary" aria-hidden /> 콘텐츠가 많이 게재된 브랜드
            </p>
            <span className="rounded-chip bg-primary-weak px-2 py-0.5 text-[11px] font-semibold text-primary">
              최근 7일
            </span>
          </div>
          {stats.topBrands.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {stats.topBrands.map((b, i) => (
                <li key={b.name}>
                  <Link
                    href={`/library?q=${encodeURIComponent(b.name)}`}
                    className="group flex items-center gap-3 rounded-card px-2 py-2 transition-colors hover:bg-body"
                  >
                    <BrandAvatar name={b.name} index={i} />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold group-hover:text-primary">
                      {b.name}
                    </span>
                    <span className="tnum shrink-0 text-[13px] font-semibold text-fg-sub">{b.count}개</span>
                    <ChevronRight className="size-4 shrink-0 text-fg-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-fg-sub">이번 주 수집이 시작되면 브랜드가 표시돼요.</p>
          )}
        </Card>
      </div>
    </section>
  );
}

/** ④ 다음에 할 것 — 홈 종결부 바로가기 */
export function NextActions() {
  const actions = [
    { href: "/auto-dm", icon: MessageSquareReply, label: "자동 DM 만들기", desc: "댓글에 자동으로 DM 발송" },
    { href: "/studio", icon: Sparkles, label: "AI 스튜디오", desc: "카드뉴스·아이디어 생성" },
    { href: "/growth", icon: TrendingUp, label: "성장 진단", desc: "내 계정 성과 분석" },
  ];
  return (
    <section aria-label="바로가기" className="grid gap-3 sm:grid-cols-3">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group flex items-center gap-3 rounded-card border border-line bg-overlay p-4 transition-colors hover:border-primary"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-primary-weak text-primary">
            <a.icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold group-hover:text-primary">{a.label}</span>
            <span className="mt-0.5 block truncate text-[12px] text-fg-sub">{a.desc}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
