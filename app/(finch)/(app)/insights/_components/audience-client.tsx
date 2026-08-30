"use client";

import { useState } from "react";
import { Heart, MessageCircle, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, ChannelBadge } from "@/components/ui/badge";
import { MiniBars } from "@/components/ui/charts";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/ui/empty-state";
import { formatAgo, formatCompact, formatDeltaCompact } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { TopEngager } from "@/lib/types";

type Period = 7 | 14;

export interface AudienceTotals {
  accountsEngaged: number;
  totalInteractions: number;
  profileLinksTaps: number;
}

export interface AudienceView {
  /** 최근 14일 일별 도달·팔로워 순증감 */
  daily: { date: string; reach: number; followerNet: number }[];
  totals7: AudienceTotals;
  totals14: AudienceTotals;
  topEngagers: TopEngager[];
  isLive: boolean;
}

/**
 * 팔로워 분석 — "누가 내 프로필을 찾아오는가"를 공식 API가 허용하는 범위에서 다룬다.
 * 방문자 개인 식별은 인스타그램이 어떤 API로도 제공하지 않는다 (PRD PART 2 투명성 원칙).
 * 2025년 프로필 조회수(profile_views) 지표 폐기 반영: 도달·참여 계정·팔로워 순증감·
 * 프로필 링크 클릭(profile_links_taps)으로 구성한다.
 */
export function AudienceClient({ view }: { view: AudienceView | null }) {
  const [period, setPeriod] = useState<Period>(7);

  // 연동 전(빈 데이터) — 계산·차트를 건너뛰고 안내만 표시
  if (!view || view.daily.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="팔로워 분석" description="내 프로필을 찾아오는 흐름을 확인할 수 있는 지표로 분석합니다." />
        <EmptyState
          icon={ShieldAlert}
          title="채널을 연동하면 팔로워 분석이 시작돼요"
          description="인스타그램 계정을 연동하면 도달·팔로워 증감·참여 지표가 여기에 표시됩니다. 연동 직후에는 데이터가 쌓일 때까지 하루 이틀 걸릴 수 있어요."
        />
      </div>
    );
  }

  const days = view.daily.slice(-period);
  const prevDays = view.daily.slice(-period * 2, -period);
  const sum = (arr: typeof days, key: "reach" | "followerNet") => arr.reduce((s, d) => s + d[key], 0);

  const reach = sum(days, "reach");
  const prevReach = sum(prevDays, "reach");
  /* 비교 구간 표본이 **없으면** 증감을 계산하지 않는다(undefined).
     daily 가 14일치뿐이라 period=14 면 prevDays 가 늘 빈 배열이고, 예전엔 그걸 0 으로 눌러
     「0% 지난주 대비」= «변화 없음» 이라고 단정했다. 비교할 게 없는 것과 변화가 없는 것은 다르다.
     실제 모드도 같다 — live.ts 가 14일 창만 조회하므로 연동 계정에서도 14일 탭은 늘 0% 였다.
     StatCard 는 delta 가 undefined 면 증감 줄 자체를 그리지 않는다. */
  const reachDelta =
    prevDays.length > 0 && prevReach > 0 ? ((reach - prevReach) / prevReach) * 100 : undefined;
  const followerNet = sum(days, "followerNet");
  const totals = period === 7 ? view.totals7 : view.totals14;
  /*
    합산 지표(참여 계정·프로필 링크 클릭)에는 일별 시계열이 없어 추이선을 못 그린다.
    대신 **직전 구간과의 비교**는 낼 수 있다 — totals14 는 최근 14일, totals7 은 최근 7일이라
    그 차가 정확히 «직전 7일»이다(live.ts 의 since7/since14). 7일 탭에서만 성립한다:
    14일 탭은 비교할 직전 14일 표본이 없다(도달 증감과 같은 이유로 undefined 로 둔다 —
    «비교할 게 없는 것»과 «변화가 없는 것»은 다르다).
  */
  const pct = (cur: number, prev: number) =>
    period === 7 && prev > 0 ? Number((((cur - prev) / prev) * 100).toFixed(1)) : undefined;
  const prevTotals = {
    accountsEngaged: view.totals14.accountsEngaged - view.totals7.accountsEngaged,
    profileLinksTaps: view.totals14.profileLinksTaps - view.totals7.profileLinksTaps,
  };
  const engagedDelta = pct(view.totals7.accountsEngaged, prevTotals.accountsEngaged);
  const tapsDelta = pct(view.totals7.profileLinksTaps, prevTotals.profileLinksTaps);
  const prevFollowerNet = sum(prevDays, "followerNet");
  const followerDelta =
    prevDays.length > 0 && prevFollowerNet > 0
      ? Number((((followerNet - prevFollowerNet) / prevFollowerNet) * 100).toFixed(1))
      : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="팔로워 분석"
        description="내 프로필을 찾아오는 흐름을 확인할 수 있는 지표로 분석합니다."
        action={
          <div className="flex items-center gap-2">
            <ChannelBadge channel="instagram" />
            <div className="flex rounded-chip border border-line bg-body p-0.5">
              {([7, 14] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-chip px-3 py-1 text-[14px] font-semibold trans-state",
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

      {/* 요약 지표 */}
      <section aria-label="팔로워 분석 요약" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="도달"
          value={formatCompact(reach)}
          delta={reachDelta === undefined ? undefined : Number(reachDelta.toFixed(1))}
          deltaLabel={`지난 ${period}일 대비`}
          trend={days.map((d) => d.reach)}
        />
        <StatCard
          label={
            <>
              참여 계정
              <InfoTip>
                이 기간 내 콘텐츠에 좋아요·댓글·저장 등으로 반응한 순 계정 수입니다.
                같은 사람이 여러 번 반응해도 한 명으로 셉니다.
              </InfoTip>
            </>
          }
          value={formatCompact(totals.accountsEngaged)}
          delta={engagedDelta}
          deltaLabel="직전 7일 대비"
        />
        <StatCard
          label={
            <>
              팔로워 순증감
              <InfoTip>
                인스타그램은 팔로워 수의 순변화만 알려 줍니다. 누가 팔로우를 취소했는지는 밖으로 내주지
                않습니다.
              </InfoTip>
            </>
          }
          value={formatDeltaCompact(followerNet)}
          delta={followerDelta}
          deltaLabel={`지난 ${period}일 대비`}
          trend={days.map((d) => d.followerNet)}
        />
        <StatCard
          label={
            <>
              프로필 링크 클릭
              <InfoTip>
                프로필의 웹사이트·연락 버튼 등 링크가 눌린 횟수입니다.
                프로필 링크를 쓰고 있다면 이 숫자가 그 페이지 방문의 출발점이에요.
              </InfoTip>
            </>
          }
          value={formatCompact(totals.profileLinksTaps)}
          delta={tapsDelta}
          deltaLabel="직전 7일 대비"
        />
      </section>

      {/* 정직 고지 — 지표 뒤로 내렸다(위계: 숫자가 먼저다). 읽기 폭도 제한한다. */}
      <Card className="flex items-start gap-3 p-4">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <p className="max-w-[80ch] text-[14px] leading-relaxed text-fg-sub">
          <span className="font-semibold text-fg">
            &ldquo;누가 내 프로필을 봤는지&rdquo;의 개인 식별은 인스타그램이 어떤 앱에도 제공하지 않는
            데이터입니다.
          </span>{" "}
          이를 알려준다고 주장하는 서비스는 모두 허위이며 계정 정지 위험이 있습니다. 핀치는 인스타그램이
          제공하는 집계 지표(도달·참여 계정·팔로워 증감)와 공개 상호작용(댓글·좋아요)만 분석합니다.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 일별 도달 */}
        <Card>
          <CardHeader
            title="일별 도달"
            description={`최근 ${period}일`}
          />
          <CardBody>
            <MiniBars data={days.map((d) => d.reach)} height={120} />
            <div className="mt-2 flex justify-between text-xs text-fg-faint">
              <span>{days[0]?.date.slice(5).replace("-", ".")}</span>
              <span>{days[days.length - 1]?.date.slice(5).replace("-", ".")}</span>
            </div>
            <p className="mt-3 text-[14px] text-fg-sub">
              도달이 커진 날 팔로워 증가가 함께 뛰는 패턴이면, 콘텐츠가 새 오디언스를 프로필까지
              데려오고 있다는 신호예요.
            </p>
          </CardBody>
        </Card>

        {/* 일별 팔로워 순증감 */}
        <Card>
          <CardHeader
            title="일별 팔로워 순증감"
            description={`최근 ${period}일`}
          />
          <CardBody>
            {/* 발산형 막대 — 0 기준선을 가운데 두고 양수는 위, 음수는 아래로 그린다.
                앞서는 전부 justify-end + Math.abs 라 -80 과 +80 이 **같은 방향·같은 높이**로
                올라가고 색만 달랐다(방향이 안 읽혔다). 각 반쪽이 전체 높이의 50%다. */}
            <div className="relative flex items-stretch gap-1" style={{ height: 120 }} aria-hidden>
              {days.map((d) => {
                const max = Math.max(...days.map((x) => Math.abs(x.followerNet)), 1);
                const pct = d.followerNet === 0 ? 0 : Math.max((Math.abs(d.followerNet) / max) * 100, 6);
                const positive = d.followerNet >= 0;
                return (
                  <div key={d.date} className="flex flex-1 flex-col">
                    {/* 위(양수) 반쪽 — 가운데 기준선에서 위로 자란다 */}
                    <div className="flex flex-1 flex-col justify-end">
                      {positive && pct > 0 ? (
                        <div className="min-w-[4px] rounded-t-[2px] bg-positive" style={{ height: `${pct}%` }} />
                      ) : null}
                    </div>
                    {/* 아래(음수) 반쪽 — 가운데 기준선에서 아래로 자란다 */}
                    <div className="flex flex-1 flex-col justify-start">
                      {!positive ? (
                        <div className="min-w-[4px] rounded-b-[2px] bg-negative" style={{ height: `${pct}%` }} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {/* 0 기준선 */}
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
            </div>
            <div className="mt-2 flex justify-between text-xs text-fg-faint">
              <span>{days[0]?.date.slice(5).replace("-", ".")}</span>
              <span>{days[days.length - 1]?.date.slice(5).replace("-", ".")}</span>
            </div>
            <p className="mt-3 text-[14px] text-fg-sub">
              이 기간 순증감 합계는{" "}
              <span className={cn("tnum font-semibold", followerNet >= 0 ? "text-positive" : "text-negative")}>
                {formatDeltaCompact(followerNet)}명
              </span>
              입니다.
              {view.isLive && followerNet === 0 ? (
                <span className="text-fg-sub"> (팔로워 100명 미만 계정은 이 지표가 제공되지 않을 수 있어요.)</span>
              ) : null}
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
        />
        <CardBody className="overflow-x-auto">
          <p className="mb-2 text-[12px] text-fg-faint sm:hidden">← 옆으로 밀면 댓글·좋아요·최근 반응를 볼 수 있어요</p>
          {view.topEngagers.length > 0 ? (
            <>
              <table className="w-full min-w-[560px] text-[15px]">
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
                  {view.topEngagers.map((e, i) => (
                    <tr key={e.id} className="border-b border-line last:border-0">
                      <td className="tnum py-3 pr-3 font-bold text-fg-sub">{i + 1}</td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-primary-weak text-[14px] font-bold text-primary">
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
                      <td className="py-3 pl-4 text-[14px] text-fg-sub">{formatAgo(e.lastEngagedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-xs text-fg-faint">
                미팔로우인데 반응이 잦은 계정은 잠재 팬 또는 경쟁사일 수 있어요.
              </p>
            </>
          ) : (
            <p className="py-6 text-center text-[15px] text-fg-sub">
              댓글·좋아요 반응 데이터가 쌓이면 랭킹이 표시됩니다. (자동 DM 웹훅이 켜져 있으면 댓글이
              수집되기 시작해요.)
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
