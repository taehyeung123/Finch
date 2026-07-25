"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Rocket,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Bookmark,
  ArrowUpRight,
  Info,
  Lightbulb,
} from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCompact } from "@/lib/format";
import type { GrowthPerformance } from "@/lib/data/growth";
import { diagnoseAccount, type DiagnosisResult } from "../actions";

/** 성장 진단 UI — 실측 성과 표(즉시) + AI 진단(버튼 호출) + 아이디어→스튜디오 핸드오프 */
export function GrowthClient({ performance }: { performance: GrowthPerformance | null }) {
  const router = useRouter();
  const [diag, setDiag] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(false);

  const connected = performance !== null;
  const hasData = connected && performance.sampleSize >= 3;

  async function runDiagnosis() {
    if (loading) return;
    setLoading(true);
    setDiag(null);
    try {
      setDiag(await diagnoseAccount());
    } catch {
      setDiag({ ok: false, reason: "error", message: "진단 중 오류가 발생했어요." });
    } finally {
      setLoading(false);
    }
  }

  /** 아이디어 주제를 스튜디오로 넘긴다 — localStorage 대기열에 넣고 이동(Suspense/쿼리 이슈 회피) */
  function sendToStudio(topic: string) {
    try {
      localStorage.setItem("finch:studio:pending-topic", topic);
    } catch {
      /* noop */
    }
    router.push("/studio");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="성장 진단"
        description="내 계정의 실제 성과를 분석해 강점·약점을 짚고, 다음에 만들 콘텐츠를 제안해요."
      />

      {!connected ? (
        <EmptyState
          icon={Rocket}
          title="먼저 인스타그램을 연동해 주세요"
          description="설정에서 계정을 연동하면 실제 게시물 성과로 진단을 시작할 수 있어요."
        />
      ) : !hasData ? (
        <EmptyState
          icon={TrendingUp}
          title="진단할 게시물이 아직 부족해요"
          description="도달·저장 데이터가 쌓인 게시물이 3개 이상 있으면 진단을 시작할 수 있어요. 꾸준히 올려보세요."
        />
      ) : (
        <>
          {/* 계정 평균 요약 (실측) */}
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label="평균 저장률"
              value={`${performance.avgSaveRate}%`}
              hint="저장 수 ÷ 도달 수. 콘텐츠가 다시 볼 가치가 있다는 강한 신호예요."
              icon={Bookmark}
            />
            <SummaryCard
              label="평균 참여율"
              value={`${performance.avgEngagementRate}%`}
              hint="총 상호작용 ÷ 도달 수. 공식 인사이트 값에서 계산했어요."
              icon={TrendingUp}
            />
            <SummaryCard
              label="분석 게시물"
              value={`${performance.sampleSize}개`}
              hint="최근 게시물 중 도달 데이터가 있는 게시물을 분석했어요."
              icon={Sparkles}
            />
          </div>

          {/* AI 진단 실행 */}
          <Card>
            <CardHeader
              title="AI 성장 진단"
              description="위 실제 성과를 근거로 강점·약점과 다음 콘텐츠 아이디어를 제안해요."
              action={
                <Button onClick={runDiagnosis} disabled={loading}>
                  <Sparkles className="size-4" aria-hidden />
                  {loading ? "진단 중…" : diag ? "다시 진단" : "AI 진단 받기"}
                </Button>
              }
            />
            {diag ? (
              <CardBody>
                {diag.ok ? (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <DiagList title="잘 되고 있어요" tone="positive" icon={TrendingUp} items={diag.strengths} />
                      <DiagList title="이런 점을 보완하면 좋아요" tone="warning" icon={TriangleAlert} items={diag.weaknesses} />
                    </div>

                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <Lightbulb className="size-4 text-primary" aria-hidden />
                        <h3 className="text-[15px] font-bold">추천 콘텐츠 아이디어</h3>
                        <Badge tone="primary">AI 생성</Badge>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {diag.ideas.map((idea, i) => (
                          <Card key={i} className="flex flex-col p-4">
                            <Badge tone="neutral">{idea.basedOn}</Badge>
                            <p className="mt-2 text-[15px] font-semibold leading-snug">{idea.topic}</p>
                            <p className="mt-1 flex items-start gap-1.5 text-[13px] leading-relaxed text-fg-sub">
                              <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />
                              {idea.reason}
                            </p>
                            <div className="mt-auto pt-3">
                              <Button size="sm" variant="secondary" className="w-full" onClick={() => sendToStudio(idea.topic)}>
                                <ArrowUpRight className="size-4" aria-hidden />
                                이 주제로 카드뉴스 만들기
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>

                    <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-fg-faint">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      강점·약점·아이디어는 위 실제 성과 수치를 근거로 한 AI 해석입니다. 실제 반응은 계정 상황에 따라 달라질 수 있어요.
                    </p>
                  </div>
                ) : (
                  <p className="rounded-card bg-warning-weak px-3 py-2.5 text-[13px] text-warning">
                    {diag.reason === "fallback"
                      ? "AI 진단은 현재 준비 중이에요(크레딧/설정 확인 필요). 위 실제 성과 표는 그대로 확인할 수 있어요."
                      : diag.reason === "not_connected"
                        ? "인스타그램 연동이 필요해요."
                        : diag.reason === "insufficient_data"
                          ? "진단할 게시물이 아직 부족해요."
                          : (diag.message ?? "진단에 실패했어요. 다시 시도해 주세요.")}
                  </p>
                )}
              </CardBody>
            ) : null}
          </Card>

          {/* 게시물별 성과 (실측) */}
          <Card>
            <CardHeader
              title="게시물별 성과"
              description="저장률이 높은 순서. 공식 인사이트(저장·도달)에서 직접 계산한 실제 값이에요."
            />
            <CardBody className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-faint">
                    <th className="pb-2 pr-3 font-medium">게시물</th>
                    <th className="px-3 pb-2 font-medium">유형</th>
                    <th className="px-3 pb-2 text-right font-medium">
                      저장률
                      <InfoTip>저장 수 ÷ 도달 수 × 100. 공식 API 값에서 계산한 실측 비율입니다.</InfoTip>
                    </th>
                    <th className="px-3 pb-2 text-right font-medium">참여율</th>
                    <th className="px-3 pb-2 text-right font-medium">도달</th>
                    <th className="px-3 pb-2 text-right font-medium">저장</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.posts.map((p) => {
                    const strong = p.saveRate >= performance.avgSaveRate;
                    return (
                      <tr key={p.id} className="border-b border-line">
                        <td className="max-w-[280px] truncate py-2.5 pr-3">
                          {p.permalink ? (
                            <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
                              {p.caption}
                            </a>
                          ) : (
                            p.caption
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-fg-sub">{p.kind}</td>
                        <td className={`tnum px-3 py-2.5 text-right font-semibold ${strong ? "text-positive" : "text-fg-sub"}`}>
                          {p.saveRate}%
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-fg-sub">{p.engagementRate}%</td>
                        <td className="tnum px-3 py-2.5 text-right text-fg-sub">{formatCompact(p.reach)}</td>
                        <td className="tnum px-3 py-2.5 text-right text-fg-sub">{formatCompact(p.saved)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-fg-sub">
        <Icon className="size-4" aria-hidden />
        <span className="text-[13px] font-medium">{label}</span>
        <InfoTip>{hint}</InfoTip>
      </div>
      <p className="tnum mt-2 text-3xl font-bold">{value}</p>
    </Card>
  );
}

function DiagList({
  title,
  tone,
  icon: Icon,
  items,
}: {
  title: string;
  tone: "positive" | "warning";
  icon: React.ElementType;
  items: string[];
}) {
  return (
    <div className={`rounded-card border p-4 ${tone === "positive" ? "border-positive/30 bg-positive-weak" : "border-warning/30 bg-warning-weak"}`}>
      <div className={`mb-2 flex items-center gap-2 text-[14px] font-bold ${tone === "positive" ? "text-positive" : "text-warning"}`}>
        <Icon className="size-4" aria-hidden />
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="text-[13px] leading-relaxed text-fg-sub">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
