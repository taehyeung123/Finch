"use client";

import { useState } from "react";
import { Heart, MessageCircle, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge, DataSourceBadge, SupportBadge } from "@/components/ui/badge";
import { MiniBars } from "@/components/ui/charts";
import { InfoTip } from "@/components/ui/info-tip";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAgo, formatCompact, formatDeltaCompact, formatPercent } from "@/lib/format";
import { audienceDaily, topEngagers } from "@/lib/data";
import { cn } from "@/lib/cn";

type Period = 7 | 14;

/**
 * 오디언스 분석 — "누가 내 프로필을 찾아오는가"를 공식 API가 허용하는 범위에서 다룬다.
 * 방문자 개인 식별은 인스타그램이 어떤 API로도 제공하지 않는다 (PRD PART 2 투명성 원칙).
 * 대신: 프로필 조회수 추이(집계) + 도달→방문 전환 + 팔로워 순증감 + 공개 상호작용 기반 팬 랭킹.
 */
export default function AudiencePage() {
  const [period, setPeriod] = useState<Period>(7);

  // 연동 전(빈 데이터) — 계산·차트를 건너뛰고 안내만 표시
  if (audienceDaily.length === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader title="팔로워 분석" description="내 프로필을 찾아오는 흐름을 공식 지표로 분석합니다." />
        <EmptyState
          icon={ShieldAlert}
          title="채널을 연동하면 팔로워 분석이 시작돼요"
          description="인스타그램 계정을 연동하면 프로필 조회수, 팔로워 증감, 자주 반응하는 팬 랭킹이 여기에 표시됩니다."
        />
      </div>
    );
  }

  const days = audienceDaily.slice(-period);
  const prevDays = audienceDaily.slice(-period * 2, -period);
  const sum = (arr: typeof days, key: "profileViews" | "reach" | "followerNet" | "linkClicks") =>
    arr.reduce((s, d) => s + d[key], 0);

  const profileViews = sum(days, "profileViews");
  const prevProfileViews = sum(prevDays, "profileViews") || 1;
  const viewsDelta = ((profileViews - prevProfileViews) / prevProfileViews) * 100;
  const reach = sum(days, "reach");
  const visitRate = (profileViews / reach) * 100;
  const followerNet = sum(days, "followerNet");
  const linkClicks = sum(days, "linkClicks");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="팔로워 분석"
        description="내 프로필을 찾아오는 흐름을 공식 지표로 분석합니다."
        action={
          <div className="flex items-center gap-2">
            <ChannelBadge channel="instagram" />
            <div className="flex rounded-chip border border-line bg-overlay p-0.5">
              {([7, 14] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-chip px-3 py-1 text-[13px] font-semibold transition-colors",
                    period === p ? "bg-primary text-on-primary" : "text-fg-sub hover:text-fg",
                  )}
                >
                  {p}일
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* 정직 고지 — 이 기능의 신뢰 기반 (PRD PART 2) */}
      <Card className="flex items-start gap-3 p-4">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <p className="text-[13px] leading-relaxed text-fg-sub">
          <span className="font-semibold text-fg">
            &ldquo;누가 내 프로필을 봤는지&rdquo;의 개인 식별은 인스타그램이 어떤 앱에도 제공하지 않는
            데이터입니다.
          </span>{" "}
          이를 알려준다고 주장하는 서비스는 모두 허위이며 계정 정지 위험이 있습니다. 핀치는 공식 API가
          제공하는 집계 지표(프로필 조회수·도달·팔로워 증감)와 공개 상호작용(댓글·좋아요)만 분석합니다.
        </p>
      </Card>

      {/* 요약 지표 */}
      <section aria-label="팔로워 분석 요약" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="프로필 조회수"
          value={formatCompact(profileViews)}
          delta={Number(viewsDelta.toFixed(1))}
          trend={days.map((d) => d.profileViews)}
        />
        <StatCard
          label={
            <>
              도달 대비 방문 전환율
              <InfoTip>
                프로필 조회수 ÷ 도달 수. 콘텐츠를 본 사람 중 프로필까지 들어온 비율로, 핀치 자체 계산
                지표입니다 (플랫폼 공식 지표 아님).
              </InfoTip>
            </>
          }
          value={formatPercent(visitRate)}
        />
        <StatCard
          label={
            <>
              팔로워 순증감
              <InfoTip>
                공식 API는 팔로워 수의 순변화만 제공합니다. 누가 팔로우를 취소했는지 개인 식별은 제공되지
                않습니다.
              </InfoTip>
            </>
          }
          value={formatDeltaCompact(followerNet)}
        />
        <StatCard label="프로필 링크 클릭" value={formatCompact(linkClicks)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 일별 프로필 조회수 */}
        <Card>
          <CardHeader
            title="일별 프로필 조회수"
            description={`최근 ${period}일`}
            action={<DataSourceBadge source="official" />}
          />
          <CardBody>
            <MiniBars data={days.map((d) => d.profileViews)} height={120} />
            <div className="mt-2 flex justify-between text-xs text-fg-faint">
              <span>{days[0].date.slice(5).replace("-", ".")}</span>
              <span>{days[days.length - 1].date.slice(5).replace("-", ".")}</span>
            </div>
            <p className="mt-3 text-[13px] text-fg-sub">
              게시물 도달이 커진 날 프로필 방문이 함께 뛰는 패턴이면, 콘텐츠가 새 오디언스를 프로필까지
              데려오고 있다는 신호예요.
            </p>
          </CardBody>
        </Card>

        {/* 일별 팔로워 순증감 */}
        <Card>
          <CardHeader
            title="일별 팔로워 순증감"
            description={`최근 ${period}일`}
            action={<DataSourceBadge source="official" />}
          />
          <CardBody>
            <div className="flex items-end gap-1" style={{ height: 120 }} aria-hidden>
              {days.map((d) => {
                const max = Math.max(...days.map((x) => Math.abs(x.followerNet)), 1);
                const h = Math.max((Math.abs(d.followerNet) / max) * 100, 3);
                return (
                  <div key={d.date} className="flex flex-1 flex-col justify-end" style={{ height: "100%" }}>
                    <div
                      className={cn(
                        "min-w-[4px] rounded-t-[2px]",
                        d.followerNet >= 0 ? "bg-positive" : "bg-negative",
                      )}
                      style={{ height: `${h}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-xs text-fg-faint">
              <span>{days[0].date.slice(5).replace("-", ".")}</span>
              <span>{days[days.length - 1].date.slice(5).replace("-", ".")}</span>
            </div>
            <p className="mt-3 text-[13px] text-fg-sub">
              이 기간 순증감 합계는{" "}
              <span className={cn("tnum font-semibold", followerNet >= 0 ? "text-positive" : "text-negative")}>
                {formatDeltaCompact(followerNet)}명
              </span>
              입니다.
            </p>
          </CardBody>
        </Card>
      </div>

      {/* 자주 반응하는 팬 랭킹 */}
      <Card>
        <CardHeader
          title="자주 반응하는 사람 Top 8"
          description={
            <>
              최근 30일 공개 댓글·좋아요 기준
              <InfoTip>
                내 게시물에 남긴 공개 댓글과 좋아요를 집계한 핀치 자체 랭킹입니다. 프로필을 조용히
                &ldquo;눈팅&rdquo;만 한 사람은 어떤 방법으로도 알 수 없어요 — 실제로 반응한 사람이 가장
                확실한 관심 신호입니다.
              </InfoTip>
            </>
          }
          action={<DataSourceBadge source="internal" />}
        />
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-faint">
                <th className="pb-2 font-medium">순위</th>
                <th className="pb-2 font-medium">계정</th>
                <th className="pb-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="size-3.5" aria-hidden />
                    댓글
                  </span>
                </th>
                <th className="pb-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="size-3.5" aria-hidden />
                    좋아요
                  </span>
                </th>
                <th className="pb-2 pl-4 font-medium">팔로워 여부</th>
                <th className="pb-2 pl-4 font-medium">최근 반응</th>
              </tr>
            </thead>
            <tbody>
              {topEngagers.map((e, i) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className="tnum py-3 pr-3 font-bold text-fg-sub">{i + 1}</td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-primary-weak text-[13px] font-bold text-primary">
                        {e.displayName[0]}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{e.displayName}</span>
                        <span className="block truncate text-xs text-fg-faint">{e.handle}</span>
                      </span>
                    </div>
                  </td>
                  <td className="tnum py-3 text-right">{e.comments30d}</td>
                  <td className="tnum py-3 text-right">{e.likes30d}</td>
                  <td className="py-3 pl-4">
                    {e.isFollower ? <Badge tone="positive">팔로워</Badge> : <Badge>미팔로우</Badge>}
                  </td>
                  <td className="py-3 pl-4 text-[13px] text-fg-faint">{formatAgo(e.lastEngagedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <DataSourceNote source="공개 상호작용 집계 · 핀치 자체 분석" />
            <p className="text-xs text-fg-faint">
              미팔로우인데 반응이 잦은 계정은 잠재 팬 또는 경쟁사일 수 있어요.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* 채널별 지원 범위 */}
      <Card className="p-5">
        <p className="text-[13px] font-semibold text-fg-sub">채널별 지원 범위</p>
        <div className="mt-3 grid gap-2 text-[13px] text-fg-sub md:grid-cols-3">
          <div className="flex items-center justify-between gap-2 rounded-card border border-line p-3">
            <ChannelBadge channel="instagram" />
            <SupportBadge level="full" />
          </div>
          <div className="flex items-center justify-between gap-2 rounded-card border border-line p-3">
            <ChannelBadge channel="tiktok" />
            <SupportBadge level="partial" />
          </div>
          <div className="flex items-center justify-between gap-2 rounded-card border border-line p-3">
            <ChannelBadge channel="threads" />
            <SupportBadge level="partial" />
          </div>
        </div>
        <p className="mt-3 text-xs text-fg-faint">
          틱톡·쓰레드는 프로필 조회수 등 일부 지표만 공식 API로 제공됩니다. 지금은 인스타그램 기준
          화면이에요.
        </p>
      </Card>
    </div>
  );
}
