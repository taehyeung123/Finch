"use client";

import Link from "next/link";
import { ArrowRight, Link2 } from "lucide-react";
import { useChannel } from "@/components/layout/channel-context";
import { PageHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { AppIconTile } from "@/components/icons/brand";
import { Sparkline } from "@/components/ui/charts";
import { InfoTip } from "@/components/ui/info-tip";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAgo, formatCompact, formatDeltaCompact, formatKRW, formatPercent } from "@/lib/format";
import { aggregateActive } from "@/lib/ads/metrics";
import { CHANNEL_LABEL } from "@/lib/channels";
import { ChannelProfilePanel } from "@/components/dashboard/channel-profile-panel";
import { PerformanceTrend } from "@/components/dashboard/performance-trend";
import { ArchiveStatus, DailyBriefHero, HomeSearch, NextActions } from "@/components/dashboard/daily-brief";
import type { PoolHomeStats } from "@/lib/pool/home-stats";
import type {
  AdCampaign,
  Channel,
  ChannelAccount,
  ChannelFilter,
  ChannelTrend,
  ContentMix,
  DashboardSummary,
  Post,
  ProfileGridPost,
} from "@/lib/types";

const POST_TYPE_LABEL: Record<string, string> = {
  reels: "릴스",
  feed: "피드",
  story: "스토리",
  video: "영상",
  carousel: "캐러셀",
  text: "텍스트",
};

/** "전체" 뷰용 채널 시계열 합산 — 길이가 다르면 짧은 쪽을 0으로 채운다 */
function sumSeries(list: number[][]): number[] {
  const len = Math.max(0, ...list.map((s) => s?.length ?? 0));
  return Array.from({ length: len }, (_, i) => list.reduce((acc, s) => acc + (s?.[i] ?? 0), 0));
}

export interface DashboardData {
  accounts: ChannelAccount[];
  summaries: Record<ChannelFilter, DashboardSummary>;
  posts: Post[];
  contentMix: Record<ChannelFilter, ContentMix[]>;
  profileGrid: Record<Channel, ProfileGridPost[]>;
  trends: Record<Channel, ChannelTrend>;
}

export function DashboardClient({
  data,
  campaigns,
  poolStats,
  isLive,
}: {
  data: DashboardData;
  campaigns: AdCampaign[];
  /** 오늘의 핀치 브리핑 — 공용 풀 수집 현황 (스니핏식 홈 상단) */
  poolStats: PoolHomeStats;
  /** true면 연동 계정의 Instagram 공식 API 실데이터 */
  isLive: boolean;
}) {
  const { channel } = useChannel();
  const { accounts, summaries, posts: allPosts, profileGrid, trends } = data;
  const summary = summaries[channel];
  const posts = channel === "all" ? allPosts : allPosts.filter((p) => p.channel === channel);
  const disconnected = accounts.filter((a) => !a.connected);
  // 진행 중 캠페인 기준 — /ads 페이지와 같은 공통 유틸로 계산 (화면 간 수치 불일치 방지)
  const activeTotals = aggregateActive(campaigns);
  // 개별 채널 선택 시 우측 프로필 미러링 패널에 쓸 계정
  const selectedAccount = channel === "all" ? null : accounts.find((a) => a.channel === channel);

  // 스탯 행에 실제 추이를 얹는다 — "전체"는 3채널 합산, 개별 채널은 해당 시계열
  const followersTrend =
    channel === "all"
      ? sumSeries([trends.instagram?.followers ?? [], trends.tiktok?.followers ?? [], trends.threads?.followers ?? []])
      : trends[channel]?.followers ?? [];
  const viewsTrend =
    channel === "all"
      ? sumSeries([trends.instagram?.views ?? [], trends.tiktok?.views ?? [], trends.threads?.views ?? []])
      : trends[channel]?.views ?? [];

  const summaryCards = (
    <>
      <StatCard
        hero
        className="col-span-2 lg:col-span-1"
        label="팔로워"
        value={formatCompact(summary.followers)}
        delta={summary.followersDelta}
        trend={followersTrend}
      />
      <StatCard
        label="이번 주 조회수"
        value={formatCompact(summary.weeklyViews)}
        delta={summary.weeklyViewsDelta}
        trend={viewsTrend}
      />
      <StatCard label="게시물 수" value={summary.postCount.toLocaleString("ko-KR")} />
      <StatCard
        label={
          <>
            평균 참여율
            <InfoTip>
              (좋아요 + 댓글 + 공유) ÷ 도달 수 기준 자체 계산 지표입니다. 플랫폼 공식 지표가 아닌 핀치
              자체 산출값이에요.
            </InfoTip>
          </>
        }
        value={formatPercent(summary.engagementRate)}
        delta={summary.engagementDelta}
        deltaUnit="%p"
      />
    </>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="홈"
        description="오늘의 브리핑과 채널 현황을 한눈에 확인하세요."
      />

      <DailyBriefHero stats={poolStats} />
      <HomeSearch stats={poolStats} />
      <ArchiveStatus stats={poolStats} />

      {disconnected.length > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-warning/40 p-4">
          <p className="flex items-center gap-2 text-[15px] text-fg-sub">
            <Link2 className="size-4 text-warning" aria-hidden />
            {disconnected.map((a) => CHANNEL_LABEL[a.channel]).join(", ")} 계정이 아직 연동되지
            않았어요. 연동하면 3채널을 함께 볼 수 있습니다.
          </p>
          <ButtonLink href="/settings" size="sm" variant="secondary">
            계정 연동 관리
          </ButtonLink>
        </Card>
      ) : null}

      {/* 요약 지표 — 개별 채널 선택 시 우측에 모바일 프로필 미러링 패널 (PART 4.1) */}
      {selectedAccount ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <section aria-label="요약 지표" className="grid grid-cols-2 gap-3">
              {summaryCards}
            </section>
            {/* 프로필(현재 상태) 옆 공백을 성과 추이(변화)로 채운다 */}
            <PerformanceTrend
              trend={trends[selectedAccount.channel]}
              viewsLabel={isLive ? "도달" : "조회수"}
            />
          </div>
          <ChannelProfilePanel
            account={selectedAccount}
            grid={profileGrid[selectedAccount.channel]}
            className="self-start lg:sticky lg:top-6"
          />
        </div>
      ) : (
        <section aria-label="요약 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          {summaryCards}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 최근 게시물 (PART 4.1) */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="최근 게시물"
            description="게시물별 핵심 지표"
            action={
              <Link href="/insights/link" className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary hover:text-primary-hover">
                링크 분석 <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <CardBody className="overflow-x-auto">
            {posts.length > 0 ? (
              <table className="w-full min-w-[540px] text-[15px]">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-faint">
                    <th className="pb-2 font-medium">게시물</th>
                    <th className="pb-2 font-medium">채널</th>
                    <th className="pb-2 text-right font-medium">조회수</th>
                    <th className="pb-2 text-right font-medium">좋아요</th>
                    <th className="pb-2 text-right font-medium">댓글</th>
                    <th className="pb-2 pl-4 font-medium">추이</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="max-w-[220px] py-3 pr-3">
                        <p className="truncate font-medium">{p.caption}</p>
                        <p className="mt-0.5 text-xs text-fg-faint">
                          {POST_TYPE_LABEL[p.type]} · {formatAgo(p.publishedAt)}
                        </p>
                      </td>
                      <td className="py-3 pr-3">
                        <ChannelBadge channel={p.channel} />
                      </td>
                      <td className="tnum py-3 text-right">{formatCompact(p.views)}</td>
                      <td className="tnum py-3 text-right">{formatCompact(p.likes)}</td>
                      <td className="tnum py-3 text-right">{formatCompact(p.comments)}</td>
                      <td className="py-3 pl-4">
                        {p.trend.length > 1 ? (
                          <Sparkline data={p.trend} width={72} height={24} />
                        ) : (
                          <span className="text-xs text-fg-faint">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-6 text-center text-[15px] text-fg-sub">
                아직 표시할 게시물이 없어요. 계정을 연동하면 최근 게시물 지표가 표시됩니다.
              </p>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          {/* 광고 요약 — 오가닉과 나란히 (PART 4.1) */}
          <Card>
            <CardHeader
              title="광고 현황"
              description="진행 중 캠페인 기준"
              action={
                <Link href="/ads" className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary hover:text-primary-hover">
                  광고 관리 <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <CardBody className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] text-fg-sub">집행 금액</span>
                <span className="tnum text-lg font-bold">{formatKRW(activeTotals.spend)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] text-fg-sub">진행 중 캠페인</span>
                <span className="tnum font-semibold">{activeTotals.count}개</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] text-fg-sub">평균 ROAS</span>
                <span className="tnum font-semibold text-positive">
                  {activeTotals.count > 0 ? `${activeTotals.roas.toFixed(1)}배` : "-"}
                </span>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* 다음에 할 것 — 홈 종결부 바로가기 */}
      <NextActions />

      {/* 내 계정 — 전체 보기일 때만 3채널 카드 (개별 선택 시엔 위 프로필 패널이 대체) */}
      {channel === "all" ? (
      <section aria-label="내 계정">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[20px] font-bold leading-snug">내 계정</h2>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-[14px] font-semibold text-primary hover:text-primary-hover"
          >
            설정에서 관리 <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {accounts.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-3">
            {accounts.map((a) => (
              <Card key={a.channel} hover className="flex flex-col p-5">
                {/* 프로필 — 실 연동 시 프로필 사진, 없으면 이니셜 아바타 + 채널 뱃지 */}
                <div className="flex items-center gap-3">
                  <span className="relative shrink-0" aria-hidden>
                    {a.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 서명 만료되는 IG CDN URL이라 이미지 최적화 프록시를 거치지 않는다
                      <img
                        src={a.avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="size-14 rounded-chip object-cover"
                      />
                    ) : (
                      <span className="flex size-14 items-center justify-center rounded-chip bg-primary-weak text-xl font-bold text-primary">
                        {(a.displayName || a.handle.replace(/^@/, "") || "?").charAt(0)}
                      </span>
                    )}
                    <AppIconTile app={a.channel} size={22} className="absolute -bottom-1 -right-1" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[15px] font-bold">
                        {a.displayName || CHANNEL_LABEL[a.channel]}
                      </p>
                      {a.connected ? (
                        <Badge tone="positive">연동됨</Badge>
                      ) : (
                        <Badge tone="neutral">미연동</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[14px] text-fg-sub">{a.handle || "—"}</p>
                  </div>
                </div>

                {/* 지표 3분할 */}
                <div className="mt-4 grid grid-cols-3 border-t border-line pt-3 text-center">
                  <div>
                    <p className="text-xs text-fg-faint">팔로워</p>
                    {a.connected ? (
                      <>
                        <p className="tnum mt-0.5 font-bold">{formatCompact(a.followers)}</p>
                        <p
                          className={`tnum text-xs font-semibold ${
                            a.followersDelta7d > 0
                              ? "text-positive"
                              : a.followersDelta7d < 0
                                ? "text-negative"
                                : "text-fg-faint"
                          }`}
                        >
                          {formatDeltaCompact(a.followersDelta7d)} <span className="font-normal text-fg-faint">7일</span>
                        </p>
                      </>
                    ) : (
                      <p className="mt-0.5 font-bold text-fg-faint">—</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-fg-faint">참여율</p>
                    {a.connected ? (
                      <p className="tnum mt-0.5 font-bold">{formatPercent(a.avgEngagementRate)}</p>
                    ) : (
                      <p className="mt-0.5 font-bold text-fg-faint">—</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-fg-faint">게시물</p>
                    {a.connected ? (
                      <p className="tnum mt-0.5 font-bold">{a.posts.toLocaleString("ko-KR")}</p>
                    ) : (
                      <p className="mt-0.5 font-bold text-fg-faint">—</p>
                    )}
                  </div>
                </div>

                {/* 하단 — 토큰 만료 경고 / 미연동 CTA */}
                {a.connected && a.tokenExpiresInDays !== null && a.tokenExpiresInDays <= 14 ? (
                  <p className="mt-3 text-xs font-medium text-warning">
                    토큰이 {a.tokenExpiresInDays}일 후 만료돼요. 설정에서 다시 연동해 주세요.
                  </p>
                ) : null}
                {!a.connected ? (
                  <div className="mt-auto pt-4">
                    <ButtonLink href="/settings" size="sm" variant="secondary" className="w-full">
                      연동하기
                    </ButtonLink>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Link2}
            title="연동된 계정이 없습니다"
            description="Instagram, TikTok, Threads 계정을 연동하면 채널별 지표를 한눈에 볼 수 있어요."
            action={
              <ButtonLink href="/settings" size="sm">
                계정 연동하기
              </ButtonLink>
            }
          />
        )}
      </section>
      ) : null}
    </div>
  );
}
