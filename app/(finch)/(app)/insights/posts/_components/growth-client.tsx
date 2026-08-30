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
  Users,
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
  /*
    평균 밑 한 줄 — «최고·최저»는 표에 있는 실제 값에서 뽑는다(만들어 낸 기준선이 아니다).
    posts 는 저장률 내림차순이라 저장률의 양끝은 첫·마지막 항목이고,
    참여율은 따로 훑는다(정렬 기준이 다르다).
  */
  const list = performance?.posts ?? [];
  const saveRange =
    list.length >= 2 ? `최고 ${list[0].saveRate}% · 최저 ${list[list.length - 1].saveRate}%` : undefined;
  const engageRates = list.map((x) => x.engagementRate);
  const engageRange =
    engageRates.length >= 2
      ? `최고 ${Math.max(...engageRates)}% · 최저 ${Math.min(...engageRates)}%`
      : undefined;

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

  /** 주제(+선택 지침)를 스튜디오로 넘긴다 — localStorage 대기열에 넣고 이동(Suspense/쿼리 이슈 회피) */
  function sendToStudio(topic: string, note?: string) {
    try {
      localStorage.setItem("finch:studio:pending", JSON.stringify({ topic, note }));
    } catch {
      /* noop */
    }
    router.push("/studio");
  }

  const REPURPOSE_NOTE =
    "이 주제는 내 계정에서 성과(특히 저장률)가 좋았던 게시물이야. 핵심 메시지와 각도는 유지하되, 새로운 카드뉴스 5장 형식으로 다시 구성해줘.";

  return (
    <div className="space-y-6">
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
          {/* 모바일 2열 — 짧은 숫자 카드를 1열로 쌓으면 세 장이 한 화면을 다 먹는다(홈과 같은 규칙) */}
          {/* 4열은 lg 부터 — sm(640)에서 4열이면 카드가 116px 이라 한글 라벨이 음절 단위로
              쌓이고 숫자까지 두 줄로 쪼개진다(2026-08-30 실측). 그 사이 구간은 2열로 버틴다. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <SummaryCard
              label="평균 저장률"
              value={`${performance.avgSaveRate}%`}
              hint="저장 수 ÷ 도달 수. 콘텐츠가 다시 볼 가치가 있다는 강한 신호예요."
              icon={Bookmark}
              tone="save"
              foot={saveRange}
            />
            <SummaryCard
              label="평균 참여율"
              value={`${performance.avgEngagementRate}%`}
              hint="총 상호작용(좋아요·댓글·저장·공유) ÷ 도달 수로 계산한 실측 비율이에요."
              icon={TrendingUp}
              tone="engage"
              foot={engageRange}
            />
            <SummaryCard
              label="평균 도달"
              value={formatCompact(performance.avgReach)}
              hint="게시물 하나가 평균 몇 개 계정에 닿았는지예요. 저장률·참여율의 분모가 되는 값입니다."
              icon={Users}
              tone="reach"
            />
            <SummaryCard
              label="분석 게시물"
              value={`${performance.sampleSize}개`}
              hint="최근 게시물 중 도달 데이터가 있는 게시물을 분석했어요."
              icon={Sparkles}
              tone="count"
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
                            <p className="mt-1 flex items-start gap-1.5 text-[14px] leading-relaxed text-fg-sub">
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

                    <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-fg-sub">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      강점·약점·아이디어는 위 실제 성과 수치를 근거로 한 AI 해석입니다. 실제 반응은 계정 상황에 따라 달라질 수 있어요.
                    </p>
                  </div>
                ) : (
                  <p className="rounded-card bg-warning-weak px-3 py-2.5 text-[14px] text-warning">
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
              description="저장률이 높은 순서. 플랫폼이 준 저장·도달 값에서 직접 계산한 실제 비율이에요."
            />
            <CardBody className="overflow-x-auto">
              <p className="mb-2 text-[12px] text-fg-sub sm:hidden">← 옆으로 밀면 유형·저장률·참여율·도달를 볼 수 있어요</p>
              <table className="w-full min-w-[640px] text-[15px]">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-faint">
                    <th className="w-full pb-2 pr-3 text-left font-medium">게시물</th>
                    <th className="px-3 pb-2 font-medium">유형</th>
                    <th className="px-3 pb-2 text-right font-medium">
                      저장률
                      <InfoTip>저장 수 ÷ 도달 수 × 100. 플랫폼이 준 값에서 계산한 실측 비율입니다.</InfoTip>
                    </th>
                    <th className="px-3 pb-2 text-right font-medium">참여율</th>
                    <th className="px-3 pb-2 text-right font-medium">도달</th>
                    <th className="px-3 pb-2 text-right font-medium">저장</th>
                    <th className="pb-2 pl-3 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {performance.posts.map((p) => {
                    const strong = p.saveRate >= performance.avgSaveRate;
                    return (
                      <tr key={p.id} className="border-b border-line">
                        {/* 캡션 셀을 w-full 로 — 숫자 4열이 1300px 에 흩어지던 것을
                            오른쪽에 모은다. 이미 받아온 썸네일도 함께 렌더한다. */}
                        <td className="w-full py-2.5 pr-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            {p.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- IG CDN 임시 URL
                              <img src={p.thumbnailUrl} alt="" className="size-9 shrink-0 rounded-card border border-line object-cover" />
                            ) : null}
                            {p.permalink ? (
                              <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate hover:text-primary hover:underline">
                                {p.caption}
                              </a>
                            ) : (
                              <span className="min-w-0 truncate">{p.caption}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {/* 유형은 성과를 가르는 축이라 색으로 구분한다 — 무채 글자면 표에서 스캔이 안 된다 */}
                          <span className={`inline-flex rounded-chip px-2 py-0.5 text-[12px] font-semibold ${KIND_TONE[p.kind] ?? "bg-tint-slate text-tint-slate-ink"}`}>
                            {p.kind}
                          </span>
                        </td>
                        <td className={`tnum px-3 py-2.5 text-right font-semibold ${strong ? "text-positive" : "text-fg-sub"}`}>
                          {p.saveRate}%
                        </td>
                        <td className="tnum px-3 py-2.5 text-right text-fg-sub">{p.engagementRate}%</td>
                        <td className="tnum px-3 py-2.5 text-right text-fg-sub">{formatCompact(p.reach)}</td>
                        <td className="tnum px-3 py-2.5 text-right text-fg-sub">{formatCompact(p.saved)}</td>
                        <td className="py-2.5 pl-3 text-right">
                          {p.caption && p.caption !== "(캡션 없음)" ? (
                            <button
                              type="button"
                              onClick={() => sendToStudio(p.caption, REPURPOSE_NOTE)}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-card border border-line px-2 py-1 text-[12px] font-semibold text-fg-sub trans-state hover:border-primary hover:text-primary"
                            >
                              <Sparkles className="size-3" aria-hidden />
                              재가공
                            </button>
                          ) : null}
                        </td>
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

/** 게시물 유형 색 — lib/data/growth.ts 의 PostKind 와 어휘를 공유한다 */
const KIND_TONE: Record<string, string | undefined> = {
  릴스: "bg-tint-pink text-tint-pink-ink",
  영상: "bg-tint-purple text-tint-purple-ink",
  캐러셀: "bg-tint-blue text-tint-blue-ink",
  피드: "bg-tint-teal text-tint-teal-ink",
  스토리: "bg-tint-amber text-tint-amber-ink",
};

/* 지표별 색 — 네 장이 전부 무채라 스크롤해도 같은 카드가 반복되는 인상이었다(2026-08-30).
   ⚠️ Record<string,string> 으로 두면 아래 `keyof typeof` 가 string 으로 넓어져 오타가
   컴파일에서 안 걸리고, 타일 배경이 `undefined` 로 나가 조용히 투명해진다. as const 를 유지할 것. */
const CARD_TONE = {
  save: "bg-tint-blue text-tint-blue-ink",
  engage: "bg-tint-purple text-tint-purple-ink",
  reach: "bg-tint-teal text-tint-teal-ink",
  count: "bg-tint-amber text-tint-amber-ink",
} as const;

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  foot,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  tone: keyof typeof CARD_TONE;
  /** 평균 밑에 붙는 한 줄 — 최고·최저처럼 **실제 데이터에서 계산한** 맥락만 쓴다 */
  foot?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-fg-sub">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-card ${CARD_TONE[tone] ?? "bg-tint-slate text-tint-slate-ink"}`}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="text-[14px] font-medium">{label}</span>
        <InfoTip>{hint}</InfoTip>
      </div>
      {/* 타입 7단계 준수 — text-3xl(30px)은 스케일 밖이고, 4열에선 숫자가 두 줄로 쪼개졌다 */}
      <p className="tnum mt-2.5 text-[20px] font-bold">{value}</p>
      {foot ? <p className="tnum mt-1.5 text-[12px] text-fg-sub">{foot}</p> : null}
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
      <div className={`mb-2 flex items-center gap-2 text-[15px] font-bold ${tone === "positive" ? "text-positive" : "text-warning"}`}>
        <Icon className="size-4" aria-hidden />
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="text-[14px] leading-relaxed text-fg-sub">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
