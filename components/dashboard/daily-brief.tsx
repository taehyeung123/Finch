import Link from "next/link";
import { ArrowRight, ImageOff, MessageSquareReply, Sparkles, TrendingUp } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { formatCompact, formatDate } from "@/lib/format";
import type { PoolHomeStats } from "@/lib/pool/home-stats";

/*
  오늘의 핀치 — 홈 상단 브리핑 (2026-08-14 개편, 같은 날 쏘넷 크로스 리뷰 반영 2차).
  스니핏 홈 구조를 따르되 1차의 "한 카드에 헤드라인+타일+칩 동거" 문제를 세 섹션으로
  분리했다: ① 히어로 브리핑(헤드라인+썸네일 프리뷰, shadow-pop 위계) ② 추천 검색 칩
  ③ 아카이빙 현황(지표 2타일 + 활발한 브랜드 Top3 리스트). 코랄 포인트는 모듈당
  1곳만(히어로는 CTA에만) — 벤치마크의 절제된 포인트 컬러 사용을 따른다.
*/

/** ① 히어로 브리핑 — 오늘 뭐가 들어왔는지 + 실제 콘텐츠 프리뷰 */
export function DailyBriefHero({ stats }: { stats: PoolHomeStats }) {
  const hasNew = stats.newCreatives3d > 0;
  const thumbs = stats.recentThumbs.slice(0, 4);

  return (
    <section aria-label="오늘의 핀치">
      <Card className="shadow-pop overflow-hidden p-0">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12px] font-semibold text-fg-sub">
              오늘의 핀치
              <span className="tnum font-medium text-fg-sub">{formatDate(new Date().toISOString())}</span>
            </p>
            <h2 className="mt-2 text-[22px] font-bold leading-snug">
              {hasNew ? (
                <>새 레퍼런스 {formatCompact(stats.newCreatives3d)}건이 들어왔어요</>
              ) : (
                "오늘의 레퍼런스를 탐색해 보세요"
              )}
            </h2>
            <p className="mt-2 text-[14px] text-fg-sub">
              {hasNew
                ? "최근 3일 동안 공용 풀에 새로 쌓인 소재예요. 우리 업종에서 뭐가 뜨는지 확인해 보세요."
                : "매일 자동 수집이 돌며 새 소재가 쌓입니다. 탐색에서 업종별 레퍼런스를 둘러보세요."}
            </p>
            <ButtonLink href="/library" size="sm" className="mt-5">
              레퍼런스 탐색하기 <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
          </div>

          {/* 신규 소재 프리뷰 — 숫자만이 아니라 "뭐가 들어왔는지"를 보여준다 */}
          <div className="grid shrink-0 grid-cols-4 gap-1.5 sm:pt-1" aria-hidden>
            {Array.from({ length: 4 }, (_, i) => {
              const src = thumbs[i];
              return src ? (
                // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage 공개 URL(도메인 고정이나 목록이 동적)
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="size-16 rounded-card border border-line object-cover sm:size-[72px]"
                />
              ) : (
                <span
                  key={i}
                  className="flex size-16 items-center justify-center rounded-card border border-line bg-body text-fg-faint sm:size-[72px]"
                >
                  <ImageOff className="size-4" aria-hidden />
                </span>
              );
            })}
          </div>
        </div>
      </Card>
    </section>
  );
}

/** ② 추천 검색 칩 — 독립 섹션 (칩을 누르면 탐색에 검색어가 채워진 채 열린다) */
export function DailyBriefChips({ stats }: { stats: PoolHomeStats }) {
  if (stats.searchChips.length === 0) return null;
  return (
    <section aria-label="추천 검색" className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-medium text-fg-sub">추천 검색</span>
      {stats.searchChips.map((chip) => (
        <Link
          key={chip}
          href={`/library?q=${encodeURIComponent(chip)}`}
          className="rounded-chip border border-line bg-overlay px-3.5 py-2 text-[13px] font-medium text-fg-sub transition-colors hover:border-primary hover:text-primary"
        >
          {chip}
        </Link>
      ))}
    </section>
  );
}

/** ③ 아카이빙 현황 — 수집 지표 + 이번 주 활발한 브랜드 Top3 */
export function ArchiveStatus({ stats }: { stats: PoolHomeStats }) {
  return (
    <Card>
      <CardHeader
        title="아카이빙 현황"
        description="공용 풀에 쌓이는 수집 흐름"
        action={
          <Link
            href="/library"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-hover"
          >
            탐색으로 이동 <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      <CardBody className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-body p-4">
          <p className="text-[12px] text-fg-sub">신규 수집 소재 · 최근 3일</p>
          <p className="tnum mt-2 text-2xl font-bold leading-none">{formatCompact(stats.newCreatives3d)}</p>
        </div>
        <div className="rounded-card border border-line bg-body p-4">
          <p className="text-[12px] text-fg-sub">수집 중인 브랜드</p>
          <p className="tnum mt-2 text-2xl font-bold leading-none">{formatCompact(stats.totalBrands)}</p>
        </div>
        <div className="rounded-card border border-line bg-body p-4">
          <p className="flex items-center gap-1 text-[12px] text-fg-sub">
            <TrendingUp className="size-3.5 text-warning" aria-hidden /> 이번 주 활발한 브랜드
          </p>
          {stats.topBrands.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {stats.topBrands.map((b) => (
                <li key={b.name} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate font-semibold">{b.name}</span>
                  <span className="tnum shrink-0 text-fg-sub">{b.count}건</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-fg-sub">이번 주 수집이 시작되면 표시돼요.</p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

/** ④ 다음에 할 것 — 홈의 종결부. 오늘 볼 것(위)과 다음 행동(여기)을 구분한다 */
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
