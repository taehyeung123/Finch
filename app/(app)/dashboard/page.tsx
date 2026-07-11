"use client";

import Link from "next/link";
import { ArrowRight, Link2, Megaphone } from "lucide-react";
import { useChannel } from "@/components/layout/channel-context";
import { PageHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { RatioBar, Sparkline } from "@/components/ui/charts";
import { InfoTip } from "@/components/ui/info-tip";
import { ButtonLink } from "@/components/ui/button";
import { formatAgo, formatCompact, formatDeltaCompact, formatKRW, formatPercent } from "@/lib/format";
import {
  accounts,
  campaigns,
  competitorAds,
  contentMix,
  dashboardSummaries,
  recentPosts,
} from "@/lib/mock/data";

const MIX_COLORS = ["var(--color-primary)", "var(--color-tiktok-cyan)", "var(--color-warning)", "var(--color-positive)"];

const POST_TYPE_LABEL: Record<string, string> = {
  reels: "릴스",
  feed: "피드",
  story: "스토리",
  video: "영상",
  carousel: "캐러셀",
  text: "텍스트",
};

export default function DashboardPage() {
  const { channel } = useChannel();
  const summary = dashboardSummaries[channel];
  const posts = channel === "all" ? recentPosts : recentPosts.filter((p) => p.channel === channel);
  const mix = contentMix[channel];
  const disconnected = accounts.filter((a) => !a.connected);
  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const monthSpend = activeCampaigns.reduce((sum, c) => sum + c.spend, 0);
  const newAds = competitorAds.filter((a) => a.isNew);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="대시보드"
        description="연동한 채널의 핵심 지표를 한눈에 확인하세요."
      />

      {disconnected.length > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-warning/40 p-4">
          <p className="flex items-center gap-2 text-[14px] text-fg-sub">
            <Link2 className="size-4 text-warning" aria-hidden />
            {disconnected.map((a) => a.channel === "threads" && "Threads").filter(Boolean).join(", ")} 계정이 아직
            연동되지 않았어요. 연동하면 3채널을 함께 볼 수 있습니다.
          </p>
          <ButtonLink href="/settings" size="sm" variant="secondary">
            계정 연동 관리
          </ButtonLink>
        </Card>
      ) : null}

      {/* 요약 지표 (PART 4.1) */}
      <section aria-label="요약 지표" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="팔로워" value={formatCompact(summary.followers)} delta={summary.followersDelta} />
        <StatCard label="이번 주 조회수" value={formatCompact(summary.weeklyViews)} delta={summary.weeklyViewsDelta} />
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
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 최근 게시물 (PART 4.1) */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="최근 게시물"
            description="게시물별 핵심 지표와 7일 추이"
            action={
              <Link href="/analyze" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-hover">
                콘텐츠 분석 <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <CardBody className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-[14px]">
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
                      <Sparkline data={p.trend} width={72} height={24} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <div className="space-y-6">
          {/* 채널 스타일 분석 (PART 4.1) */}
          <Card>
            <CardHeader title="콘텐츠 유형 비중" description="최근 30일 발행 기준" />
            <CardBody>
              <RatioBar
                segments={mix.map((m, i) => ({ ...m, color: MIX_COLORS[i % MIX_COLORS.length] }))}
              />
            </CardBody>
          </Card>

          {/* 광고 요약 — 오가닉과 나란히 (PART 4.1) */}
          <Card>
            <CardHeader
              title="이번 달 광고"
              description="Meta 광고 계정"
              action={
                <Link href="/ads" className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary-hover">
                  광고 관리 <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <CardBody className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-fg-sub">집행 금액</span>
                <span className="tnum text-lg font-bold">{formatKRW(monthSpend)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-fg-sub">진행 중 캠페인</span>
                <span className="tnum font-semibold">{activeCampaigns.length}개</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-fg-sub">평균 ROAS</span>
                <span className="tnum font-semibold text-positive">
                  {(activeCampaigns.reduce((s, c) => s + c.roas, 0) / activeCampaigns.length).toFixed(1)}배
                </span>
              </div>
            </CardBody>
          </Card>

          {/* 경쟁사 신규 광고 알림 (PART 4.6 연결) */}
          <Card>
            <CardHeader title="경쟁사 새 광고" description="Meta 광고 라이브러리 기준" />
            <CardBody className="space-y-3">
              {newAds.length > 0 ? (
                newAds.map((ad) => (
                  <Link
                    key={ad.id}
                    href="/competitors/ads"
                    className="flex items-start gap-3 rounded-card border border-line p-3 transition-colors hover:border-line-strong"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-card bg-primary-weak text-primary">
                      <Megaphone className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold">{ad.pageName}</span>
                        <Badge tone="primary">NEW</Badge>
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-fg-sub">{ad.headline}</span>
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-[13px] text-fg-faint">새로 감지된 광고가 없습니다.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* 팔로워 증감 상세 */}
      <section aria-label="채널별 현황" className="grid gap-3 md:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.channel} hover className="p-5">
            <div className="flex items-center justify-between">
              <ChannelBadge channel={a.channel} />
              {a.connected ? (
                <Badge tone="positive">연동됨</Badge>
              ) : (
                <Badge tone="neutral">미연동</Badge>
              )}
            </div>
            <p className="mt-3 text-[13px] text-fg-sub">{a.handle}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="tnum text-xl font-bold">{formatCompact(a.followers)}</span>
              <span
                className={`tnum text-[13px] font-semibold ${
                  a.followersDelta7d > 0 ? "text-positive" : a.followersDelta7d < 0 ? "text-negative" : "text-fg-faint"
                }`}
              >
                {formatDeltaCompact(a.followersDelta7d)}
              </span>
              <span className="text-xs text-fg-faint">7일</span>
            </div>
            <p className="mt-2 text-xs text-fg-faint">
              게시물 {a.posts.toLocaleString("ko-KR")}개 · 참여율 {formatPercent(a.avgEngagementRate)}
              {a.tokenExpiresInDays !== null && a.tokenExpiresInDays <= 14 ? (
                <span className="ml-2 text-warning">토큰 {a.tokenExpiresInDays}일 후 만료</span>
              ) : null}
            </p>
          </Card>
        ))}
      </section>
    </div>
  );
}
