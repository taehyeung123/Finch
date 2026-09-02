import { AlertTriangle, ArrowLeft, CheckCircle2, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { IS_SAMPLE_DATA } from "@/lib/data";
import { datePresetLabel, getLiveAds } from "@/lib/data/ads";
import { objectiveLabel, statusLabel } from "@/lib/ads/meta-labels";
import { adsWriteMessage } from "@/lib/ads/campaign-rules";
import { formatMoney } from "@/lib/format";
import { DemoWizard } from "./_components/demo-wizard";
import { CampaignForm } from "./_components/campaign-form";
import { CampaignRowActions } from "./_components/campaign-row-actions";

/*
  캠페인 관리 — 실 모드는 **진짜 캠페인**이다: 생성(항상 일시중지로) · 게재 시작/일시중지.
  데모 모드는 기존 5단계 마법사(_components/demo-wizard.tsx)를 그대로 보여준다.

  ⚠️ 예전엔 이 라우트가 실 모드에서도 목 마법사를 그렸다 — 광고 계정을 이미 연동한
  사람이 들어오면 «Meta 광고 계정을 연동하면…»(연동한 사람에게 연동하라는) 빈 화면이 나왔다.
*/

const WRITE_BANNERS: Record<string, { tone: "positive" | "negative"; text: string }> = {
  activated: { tone: "positive", text: "게재를 시작했어요. 노출까지 몇 분 걸릴 수 있어요." },
  paused: { tone: "positive", text: "캠페인을 일시중지했어요." },
  error: { tone: "negative", text: "" }, // 문구는 code → ADS_WRITE_MESSAGES 에서 찾는다
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ write?: string; code?: string }>;
}) {
  if (IS_SAMPLE_DATA) {
    return <DemoWizard />;
  }

  const sp = await searchParams;
  const banner = sp.write ? WRITE_BANNERS[sp.write] : undefined;
  /* 실패 사유는 **코드**로만 받는다 — 문구를 URL 로 나르면 링크 하나로 신뢰된 배너에
     임의 카피를 주입할 수 있다(감사 적발). 모르는 코드는 generic 으로 떨어진다. */
  const errorText = sp.write === "error" ? adsWriteMessage(sp.code) : null;

  const live = await getLiveAds();
  const liveOk = live.state === "ok" ? live : null;
  const currency = liveOk?.selected.currency ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="캠페인 관리"
        description={
          liveOk ? `${liveOk.selected.name ?? "광고 계정"} · 캠페인 생성과 게재 관리` : "캠페인 생성과 게재 관리"
        }
        action={
          <ButtonLink href="/ads" size="sm" variant="secondary">
            <ArrowLeft className="size-4" aria-hidden />
            성과 보기
          </ButtonLink>
        }
      />

      {banner ? (
        <div
          role={banner.tone === "negative" ? "alert" : "status"}
          className={
            banner.tone === "negative"
              ? "flex items-start gap-2.5 rounded-card border border-line bg-negative-weak p-3 text-[14px] text-negative-strong"
              : "flex items-start gap-2.5 rounded-card border border-line bg-positive-weak p-3 text-[14px] text-positive-strong"
          }
        >
          {banner.tone === "negative" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <p>{errorText ?? banner.text}</p>
        </div>
      ) : null}

      {!liveOk ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Megaphone}
              title={
                live.state === "unconfigured"
                  ? "광고 연동을 준비하고 있어요"
                  : live.state === "expired"
                    ? "광고 계정 연결이 만료됐어요"
                    : live.state === "no_accounts"
                      ? "이 계정으로 볼 수 있는 광고 계정이 없어요"
                      : live.state === "error"
                        ? "지금은 캠페인을 불러오지 못했어요"
                        : "아직 연결한 광고 계정이 없어요"
              }
              description={
                live.state === "unconfigured"
                  ? "곧 메타 광고 계정을 연결해 캠페인을 만들 수 있게 됩니다."
                  : live.state === "expired"
                    ? "설정에서 다시 연결하면 캠페인 관리가 이어져요."
                    : live.state === "no_accounts"
                      ? "메타 비즈니스 설정에서 광고 계정 권한을 받은 뒤 다시 연결해 주세요."
                      : live.state === "error"
                        ? "일시적인 문제일 수 있어요. 잠시 후 새로고침해 주세요."
                        : "메타 광고 계정을 연결하면 여기서 캠페인을 만들고 관리할 수 있어요."
              }
              action={
                /* 준비 전(unconfigured)에는 설정에도 버튼이 없다 — 막다른 링크를 주지 않는다 */
                live.state === "unconfigured" ? undefined : (
                  <ButtonLink href="/settings" size="sm" variant="secondary">
                    연결 상태 확인
                  </ButtonLink>
                )
              }
            />
          </CardBody>
        </Card>
      ) : (
        <>
          {/* 캠페인 목록 + 게재 제어 */}
          <Card>
            <CardHeader
              title="캠페인"
              description={`게재 시작·일시중지 (성과 수치는 ${datePresetLabel(liveOk.datePreset)})`}
            />
            <CardBody className="overflow-x-auto">
              {liveOk.campaigns.length === 0 ? (
                <EmptyState
                  icon={Megaphone}
                  title="아직 캠페인이 없어요"
                  description="아래에서 첫 캠페인을 만들어 보세요 — 일시중지 상태로 만들어져 비용 걱정 없이 준비할 수 있어요."
                />
              ) : (
                <>
                {/* 좁은 화면에서 동작 열이 화면 밖이다 — 밀 수 있다는 걸 말해 준다(캠페인 표 공통 관행) */}
                <p className="mb-2 text-[12px] text-fg-faint sm:hidden">← 옆으로 밀면 예산·집행액과 게재 버튼을 볼 수 있어요</p>
                <table className="w-full min-w-[720px] text-[15px]">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-fg-faint">
                      <th className="pb-2 font-medium">캠페인</th>
                      <th className="pb-2 font-medium">목표</th>
                      <th className="pb-2 font-medium">상태</th>
                      <th className="pb-2 text-right font-medium">일 예산</th>
                      <th className="pb-2 text-right font-medium">집행액</th>
                      <th className="pb-2 text-right font-medium">동작</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveOk.campaigns.map((c) => {
                      const status = statusLabel(c.effectiveStatus, c.status);
                      return (
                        <tr key={c.id} className="border-b border-line last:border-0">
                          <td className="min-w-[180px] max-w-[280px] py-3 pr-3">
                            <p className="truncate font-medium">{c.name}</p>
                          </td>
                          <td className="py-3 pr-3 text-fg-sub">{objectiveLabel(c.objective)}</td>
                          <td className="py-3 pr-3">
                            <Badge tone={status.tone}>
                              <span className="size-1.5 rounded-full bg-current" aria-hidden />
                              {status.label}
                            </Badge>
                          </td>
                          <td className="tnum py-3 text-right">
                            {c.dailyBudget === null ? (
                              <span className="text-fg-faint">세트별</span>
                            ) : (
                              formatMoney(c.dailyBudget, currency)
                            )}
                          </td>
                          <td className="tnum py-3 text-right">
                            {c.spend === null ? "—" : formatMoney(c.spend, currency)}
                          </td>
                          <td className="py-3 pl-3 text-right">
                            <CampaignRowActions
                              campaignId={c.id}
                              name={c.name}
                              status={c.status}
                              dailyBudget={c.dailyBudget}
                              currency={currency}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </>
              )}
            </CardBody>
          </Card>

          {/* 새 캠페인 */}
          <Card>
            <CardHeader
              title="새 캠페인"
              description="일시중지 상태로 만들어져요 — 광고 세트·소재를 붙인 뒤 게재를 시작하세요"
            />
            <CardBody>
              {/* 통화를 모르면 폼을 열지 않는다 — «원»으로 가정해 보여주는 순간 금액 표기가 거짓이 된다 */}
              {currency ? (
                <CampaignForm currency={currency} minDailyBudget={null} />
              ) : (
                <p className="text-[14px] text-fg-sub">
                  광고 계정 통화를 확인하지 못해 캠페인을 만들 수 없어요. 설정에서 다시 연결해 주세요.
                </p>
              )}
            </CardBody>
          </Card>

          <p className="text-[12px] text-fg-sub">
            타겟팅·소재 설정은 준비 중이에요 — 지금은 메타 광고 관리자에서 이어서 설정할 수 있어요.
          </p>
        </>
      )}
    </div>
  );
}
