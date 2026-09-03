import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Layers, Megaphone, Plus, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadFailed } from "@/components/ui/load-failed";
import { ButtonLink } from "@/components/ui/button";
import { IS_SAMPLE_DATA } from "@/lib/data";
import { getAdsWriteContext, getCampaignTree, type CampaignTreeState } from "@/lib/data/ads";
import { getFinchCreatedChildren } from "@/lib/ads/finch-children";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { pauseCampaignFromDetailAction } from "@/app/(finch)/(app)/ads/tree-status-actions";
import { ActivateTreeModal } from "./_components/activate-tree-modal";
import { ChildStatusButton } from "./_components/child-status-button";
import type { FbAd, FbAdSet, FbAdSetTargetingSummary } from "@/lib/meta/ads-tree";
import {
  bidStrategyLabel,
  billingEventLabel,
  destinationTypeLabel,
  genderLabel,
  objectiveLabel,
  optimizationGoalLabel,
  statusLabel,
} from "@/lib/ads/meta-labels";
import { adsWriteMessage, SPECIAL_AD_CATEGORY_LABELS } from "@/lib/ads/campaign-rules";
import { adsetSpecFor } from "@/lib/ads/adset-rules";
import { formatDate, formatMoney } from "@/lib/format";

/*
  캠페인 상세 — 광고 세트·광고 목록 (2단계 슬라이스 1, **읽기 전용**).
  광고 만들기·하위 게재 제어는 다음 슬라이스가 이 화면에 붙는다(docs/ADS_STAGE2_SPEC.md §10).

  ⚠️ 읽기에도 소유 대조 — getCampaignTree 가 campaign.account_id 를 선택 계정과 대조해
  다른 계정의 캠페인이면 not_found 를 돌려주고 여기서 404 로 보낸다(설계 검토 major).
  ⚠️ «없음»과 «못 읽음»을 가른다 — adsets/ads 가 null 이면 LoadFailed, [] 이면 EmptyState.
  ⚠️ 심사 거부 사유 원문은 내지 않는다 — «거부됨 — 사유는 메타 광고 관리자에서» 까지만(스펙 §13-16).
*/

export const metadata: Metadata = {
  title: "캠페인 상세",
  robots: { index: false, follow: false },
};

const COUNTRY_NAME = new Intl.DisplayNames(["ko"], { type: "region" });

function countryName(code: string): string {
  try {
    return COUNTRY_NAME.of(code) ?? code;
  } catch {
    return code;
  }
}

/** 타겟 한 줄 — «대한민국 · 25~44세 · 여성 · 관심사 3개 · Instagram» */
function targetingText(t: FbAdSetTargetingSummary | null): string {
  if (!t) return "—";
  const parts: string[] = [];
  if (t.regions.length > 0) parts.push(t.regions.slice(0, 3).join("·") + (t.regions.length > 3 ? ` 외 ${t.regions.length - 3}곳` : ""));
  else if (t.countries.length > 0) parts.push(t.countries.map(countryName).join("·"));
  if (t.ageMin !== null || t.ageMax !== null) {
    const max = t.ageMax === null || t.ageMax >= 65 ? "65+" : String(t.ageMax);
    parts.push(`${t.ageMin ?? 18}~${max}세`);
  }
  parts.push(genderLabel(t.genders));
  if (t.interests.length > 0) parts.push(`관심사 ${t.interests.length}개`);
  parts.push(t.platforms.length === 0 ? "자동 노출 위치" : t.platforms.map((p) => (p === "instagram" ? "Instagram" : p === "facebook" ? "Facebook" : p)).join("·"));
  if (t.advantageAudience === true) parts.push("타겟 자동 확장");
  return parts.join(" · ");
}

function scheduleText(a: FbAdSet): string {
  const start = a.startTime ? formatDate(a.startTime) : "—";
  const end = a.endTime ? formatDate(a.endTime) : "종료 없음";
  return `${start} ~ ${end}`;
}

function NotOk({ tree }: { tree: Exclude<CampaignTreeState, { state: "ok" | "not_found" }> }) {
  const back = (
    <ButtonLink href="/ads/campaigns" size="sm" variant="secondary">
      캠페인 목록으로
    </ButtonLink>
  );
  if (tree.state === "unconfigured") {
    return <EmptyState icon={Megaphone} title="광고 연동을 준비하고 있어요" description="곧 메타 광고 계정을 연결해 캠페인을 볼 수 있게 됩니다." action={back} />;
  }
  if (tree.state === "expired") {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="광고 계정 연결이 만료됐어요"
        description="설정에서 다시 연결하면 캠페인 내용이 이어져요."
        action={
          <ButtonLink href="/settings/channels" size="sm" variant="secondary">
            다시 연결하기
          </ButtonLink>
        }
      />
    );
  }
  if (tree.state === "no_accounts") {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="이 계정으로 볼 수 있는 광고 계정이 없어요"
        description="메타 비즈니스 설정에서 광고 계정 권한을 받은 뒤 다시 연결해 주세요."
        action={back}
      />
    );
  }
  if (tree.state === "error") {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="캠페인 정보를 확인하지 못했어요"
        description="일시적인 문제일 수 있어요. 잠시 후 새로고침해 주세요."
        action={back}
      />
    );
  }
  return <EmptyState icon={Megaphone} title="아직 연결한 광고 계정이 없어요" description="메타 광고 계정을 연결하면 캠페인 내용을 볼 수 있어요." action={back} />;
}

/** 행의 켜기/끄기에 필요한 것 — 쓰기 권한이 없으면(viewer·데모) 열이 아예 안 나온다 */
interface RowControl {
  campaignId: string;
  campaignActive: boolean;
}

function AdSetsCard({ adsets, currency, control }: { adsets: FbAdSet[] | null; currency: string | null; control: RowControl | null }) {
  return (
    <Card>
      <CardHeader
        title="광고 세트"
        description={adsets === null ? "불러오지 못했어요" : adsets.length > 0 ? `${adsets.length}개 · 타겟·일정·최적화` : "이 캠페인에는 아직 광고 세트가 없어요"}
      />
      <CardBody className="overflow-x-auto">
        {adsets === null ? (
          <LoadFailed title="광고 세트를 불러오지 못했어요" />
        ) : adsets.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="아직 광고 세트가 없어요"
            description="광고 세트·소재 만들기는 준비 중이에요 — 지금은 메타 광고 관리자에서 만들 수 있어요."
          />
        ) : (
          <>
          {/* 좁은 화면에서 오른쪽 열이 화면 밖이다 — 밀 수 있다는 걸 말해 준다(캠페인 표 공통 관행) */}
          <p className="mb-2 text-[12px] text-fg-faint sm:hidden">← 옆으로 밀면 최적화·타겟·일정·예산을 볼 수 있어요</p>
          <table className="w-full min-w-[720px] text-[15px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-faint">
                <th className="pb-2 font-medium">광고 세트</th>
                <th className="pb-2 font-medium">상태</th>
                <th className="pb-2 font-medium">최적화</th>
                <th className="pb-2 font-medium">타겟</th>
                <th className="pb-2 font-medium">일정</th>
                <th className="pb-2 text-right font-medium">예산</th>
              </tr>
            </thead>
            <tbody>
              {adsets.map((a) => {
                const st = statusLabel(a.effectiveStatus, a.status);
                return (
                  <tr key={a.id} className="border-b border-line align-top last:border-0">
                    <td className="min-w-[160px] max-w-[260px] py-3 pr-3">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="mt-0.5 text-[12px] text-fg-sub">{destinationTypeLabel(a.destinationType)}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge tone={st.tone}>
                        <span className="size-1.5 rounded-full bg-current" aria-hidden />
                        {st.label}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3 text-fg-sub">
                      <p>{optimizationGoalLabel(a.optimizationGoal)}</p>
                      <p className="mt-0.5 text-[12px]">{billingEventLabel(a.billingEvent)}</p>
                    </td>
                    <td className="max-w-[320px] py-3 pr-3 text-[14px] text-fg-sub">{targetingText(a.targeting)}</td>
                    <td className="tnum whitespace-nowrap py-3 pr-3 text-[14px] text-fg-sub">{scheduleText(a)}</td>
                    <td className="tnum whitespace-nowrap py-3 text-right">
                      {a.dailyBudget !== null
                        ? `${formatMoney(a.dailyBudget, currency)}/일`
                        : a.lifetimeBudget !== null
                          ? `총 ${formatMoney(a.lifetimeBudget, currency)}`
                          : <span className="text-fg-sub">캠페인 예산</span>}
                    </td>
                    {control ? (
                      <td className="whitespace-nowrap py-3 pl-3 text-right">
                        <ChildStatusButton kind="adset" objectId={a.id} campaignId={control.campaignId} name={a.name} status={a.status} campaignActive={control.campaignActive} />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function AdsCard({ ads, adsets, control }: { ads: FbAd[] | null; adsets: FbAdSet[] | null; control: RowControl | null }) {
  const adsetName = new Map((adsets ?? []).map((a) => [a.id, a.name]));
  const pending = (ads ?? []).filter((a) => a.effectiveStatus === "PENDING_REVIEW").length;
  const disapproved = (ads ?? []).filter((a) => a.effectiveStatus === "DISAPPROVED").length;
  return (
    <Card>
      <CardHeader
        title="광고"
        description={
          ads === null
            ? "불러오지 못했어요"
            : ads.length > 0
              ? `${ads.length}개${pending > 0 ? ` · 심사 중 ${pending}` : ""}${disapproved > 0 ? ` · 거부 ${disapproved}` : ""}`
              : "이 캠페인에는 아직 광고가 없어요"
        }
      />
      <CardBody className="overflow-x-auto">
        {ads === null ? (
          <LoadFailed title="광고를 불러오지 못했어요" />
        ) : ads.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="아직 광고가 없어요"
            description="광고가 없는 캠페인은 게재를 시작해도 노출되지 않고 비용도 발생하지 않아요."
          />
        ) : (
          <>
          <p className="mb-2 text-[12px] text-fg-faint sm:hidden">← 옆으로 밀면 광고 세트·만든 날을 볼 수 있어요</p>
          <table className="w-full min-w-[640px] text-[15px]">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-faint">
                <th className="pb-2 font-medium">광고</th>
                <th className="pb-2 font-medium">상태</th>
                <th className="pb-2 font-medium">광고 세트</th>
                <th className="pb-2 font-medium">만든 날</th>
              </tr>
            </thead>
            <tbody>
              {ads.map((ad) => {
                const st = statusLabel(ad.effectiveStatus, ad.status);
                return (
                  <tr key={ad.id} className="border-b border-line align-top last:border-0">
                    <td className="min-w-[200px] py-3 pr-3">
                      <div className="flex items-start gap-3">
                        {ad.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 메타 소재 썸네일(서명 URL)이라 이미지 최적화 프록시를 거치지 않는다
                          <img
                            src={ad.thumbnailUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="size-10 shrink-0 rounded-card bg-plate object-cover"
                          />
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
                            <Megaphone className="size-4" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{ad.name}</p>
                          {ad.creativeName ? <p className="mt-0.5 truncate text-[12px] text-fg-sub">{ad.creativeName}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge tone={st.tone}>
                        <span className="size-1.5 rounded-full bg-current" aria-hidden />
                        {st.label}
                      </Badge>
                      {/* 사유 원문은 내지 않는다 — key 는 로그로만 모은다(스펙 §13-16) */}
                      {ad.effectiveStatus === "DISAPPROVED" ? (
                        <p className="mt-1 text-[12px] text-fg-sub">사유는 메타 광고 관리자에서 확인할 수 있어요</p>
                      ) : ad.effectiveStatus === "WITH_ISSUES" && ad.issueCount > 0 ? (
                        <p className="mt-1 text-[12px] text-fg-sub">문제 {ad.issueCount}건 — 메타 광고 관리자에서 확인</p>
                      ) : null}
                    </td>
                    <td className="max-w-[220px] py-3 pr-3 text-[14px] text-fg-sub">
                      <p className="truncate">{(ad.adsetId && adsetName.get(ad.adsetId)) ?? "—"}</p>
                    </td>
                    <td className="tnum whitespace-nowrap py-3 text-[14px] text-fg-sub">
                      {ad.createdTime ? formatDate(ad.createdTime) : "—"}
                    </td>
                    {control ? (
                      <td className="whitespace-nowrap py-3 pl-3 text-right">
                        {/* 거부된 광고는 켜도 노출되지 않는다 — 버튼을 주지 않는다(사유는 광고 관리자에서) */}
                        {ad.effectiveStatus === "DISAPPROVED" ? null : (
                          <ChildStatusButton kind="ad" objectId={ad.id} campaignId={control.campaignId} name={ad.name} status={ad.status} campaignActive={control.campaignActive} />
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** 마법사가 돌아올 때 붙이는 결과 배너 — 코드만 URL 로 나른다(문구는 ADS_WRITE_MESSAGES 단일 출처) */
function ResultBanner({ created, write, code }: { created?: string; write?: string; code?: string }) {
  if (created === "ad") {
    return (
      <p role="status" className="flex items-start gap-2 rounded-card bg-positive-weak p-3 text-[14px] text-positive-strong">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          광고 세트와 광고가 일시중지 상태로 만들어졌어요. 심사는 바로 시작돼요(보통 24시간 안). 노출을 시작하려면 캠페인 목록에서 «게재 시작»을 눌러 주세요.
        </span>
      </p>
    );
  }
  if (created === "partial_created" || created === "create_unverified") {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-card bg-warning-weak p-3 text-[14px] text-warning-strong">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{adsWriteMessage(created)}</span>
      </p>
    );
  }
  if (write === "error") {
    return (
      <p role="alert" className="rounded-card bg-negative-weak p-3 text-[14px] text-negative-strong">
        {adsWriteMessage(code)}
      </p>
    );
  }
  const done: Record<string, string> = {
    activated: "캠페인 게재를 시작했어요. 승인된 광고부터 노출이 시작되고 비용이 발생해요.",
    paused: "캠페인을 일시중지했어요. 하위 광고 세트·광고도 함께 멈춰요.",
    child_activated: "켰어요. 캠페인이 게재 중이면 바로 노출돼요.",
    child_paused: "일시중지했어요.",
  };
  if (write && done[write]) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-card bg-positive-weak p-3 text-[14px] text-positive-strong">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{done[write]}</span>
      </p>
    );
  }
  return null;
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ created?: string; write?: string; code?: string }>;
}) {
  /* 데모에는 «진짜 캠페인»이 없다 — 목록(마법사)로 돌려보낸다 */
  if (IS_SAMPLE_DATA) redirect("/ads/campaigns");

  const { campaignId } = await params;
  const sp = await searchParams;
  /* URL 조각을 그대로 Graph 경로에 보간하지 않는다 — 숫자만(캠페인 상태 액션과 같은 규칙) */
  if (!/^\d{1,30}$/.test(campaignId)) notFound();

  const tree = await getCampaignTree(campaignId);
  if (tree.state === "not_found") notFound();

  if (tree.state !== "ok") {
    return (
      <div className="space-y-6">
        <PageHeader title="캠페인 상세" />
        <Card>
          <CardBody>
            <NotOk tree={tree} />
          </CardBody>
        </Card>
      </div>
    );
  }

  const { campaign, adsets, ads, selected } = tree;
  const currency = selected.currency;
  const st = statusLabel(campaign.effectiveStatus, campaign.status);

  /* 쓰기 권한 — viewer·미동의·만료면 제어 버튼을 그리지 않는다(예의). 관문은 서버 액션이다(§1.1) */
  const wctx = await getAdsWriteContext();
  const canWrite = wctx.state === "ok";
  const control: RowControl | null = canWrite ? { campaignId: campaign.id, campaignActive: campaign.status === "ACTIVE" } : null;
  /* 게재 시작 모달 — 하위를 못 읽었으면(null) 그리지 않는다: 돈 경로는 fail-closed(§1.5) */
  const finch = canWrite && adsets !== null && ads !== null ? await getFinchCreatedChildren(wctx.ownerId, wctx.adAccountId, campaign.id) : null;
  const adCountByAdset = new Map<string, number>();
  for (const a of ads ?? []) if (a.adsetId) adCountByAdset.set(a.adsetId, (adCountByAdset.get(a.adsetId) ?? 0) + 1);
  const categories = campaign.specialAdCategories.map(
    (c) => (SPECIAL_AD_CATEGORY_LABELS as Record<string, string>)[c] ?? c,
  );
  /* «광고 만들기» — 일시중지 캠페인 + 핀치가 만들 수 있는 목표일 때만(§1.1). 게재 중 캠페인에 덧붙이기는 2차.
     viewer 도 버튼은 본다 — 서버 액션이 유일한 관문이고, 마법사 입구가 역할을 문구로 말한다 */
  const canCreateAd = campaign.status !== "ACTIVE" && adsetSpecFor(campaign.objective) !== null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/ads/campaigns"
          className="trans-state -ml-1.5 inline-flex items-center gap-0.5 rounded-card py-1 pl-1 pr-2 text-[14px] font-medium text-fg-sub hover:bg-tint-hover hover:text-fg"
        >
          <ArrowLeft className="size-4" aria-hidden />
          캠페인 관리
        </Link>
        <PageHeader
          title={campaign.name}
          description={`${objectiveLabel(campaign.objective)} · ${selected.name ?? "광고 계정"}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={st.tone}>
                <span className="size-1.5 rounded-full bg-current" aria-hidden />
                {st.label}
              </Badge>
              {canCreateAd ? (
                <ButtonLink href={`/ads/campaigns/${campaign.id}/ads/new`} size="sm" variant="secondary">
                  <Plus className="size-4" aria-hidden />
                  광고 만들기
                </ButtonLink>
              ) : adsetSpecFor(campaign.objective) === null ? (
                <span className="text-[12px] text-fg-sub">{adsWriteMessage("campaign_objective_unsupported")}</span>
              ) : null}
              {control && campaign.status === "ACTIVE" ? (
                <ConfirmSubmit
                  action={pauseCampaignFromDetailAction}
                  hiddenFields={{ campaignId: campaign.id }}
                  title="캠페인 일시중지"
                  description={`«${campaign.name}» 캠페인의 게재를 멈춰요. 하위 광고 세트·광고도 함께 멈추고, 언제든 다시 시작할 수 있어요.`}
                  confirmLabel="일시중지"
                  confirmVariant="primary"
                  pendingLabel="중지 중…"
                  trigger="일시중지"
                  triggerVariant="secondary"
                />
              ) : null}
              {control && campaign.status === "PAUSED" && finch && adsets !== null && ads !== null ? (
                <ActivateTreeModal
                  campaignId={campaign.id}
                  campaignName={campaign.name}
                  dailyBudget={campaign.dailyBudget}
                  currency={currency}
                  adsets={adsets
                    .filter((a) => (adCountByAdset.get(a.id) ?? 0) > 0)
                    .map((a) => ({ id: a.id, name: a.name, status: a.status, effectiveStatus: a.effectiveStatus }))}
                  ads={ads.map((a) => ({ id: a.id, name: a.name, status: a.status, effectiveStatus: a.effectiveStatus, adsetId: a.adsetId }))}
                  finchAdsetIds={[...finch.adsetIds]}
                  finchAdIds={[...finch.adIds]}
                />
              ) : control && campaign.status === "PAUSED" ? (
                <span className="text-[12px] text-fg-sub">{adsWriteMessage("campaign_unverified")}</span>
              ) : null}
            </div>
          }
        />
      </div>

      <ResultBanner created={sp.created} write={sp.write} code={sp.code} />

      {/* 요약 — 예산·입찰·카테고리·만든 날. 상태 전환은 목록의 행 버튼이 맡는다(다음 슬라이스에서 여기로 온다) */}
      <Card>
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[12px] font-medium text-fg-sub">예산</dt>
              <dd className="tnum mt-1 text-[15px]">
                {campaign.dailyBudget !== null
                  ? `${formatMoney(campaign.dailyBudget, currency)}/일 (캠페인 예산)`
                  : campaign.lifetimeBudget !== null
                    ? `총 ${formatMoney(campaign.lifetimeBudget, currency)} (캠페인 예산)`
                    : "광고 세트별 예산"}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-fg-sub">입찰</dt>
              <dd className="mt-1 text-[15px]">{bidStrategyLabel(campaign.bidStrategy)}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-fg-sub">특별 광고 카테고리</dt>
              <dd className="mt-1 text-[15px]">{categories.length > 0 ? categories.join(", ") : "해당 없음"}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-medium text-fg-sub">만든 날</dt>
              <dd className="tnum mt-1 text-[15px]">{campaign.createdTime ? formatDate(campaign.createdTime) : "—"}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <AdSetsCard adsets={adsets} currency={currency} control={control} />
      <AdsCard ads={ads} adsets={adsets} control={control} />
    </div>
  );
}
