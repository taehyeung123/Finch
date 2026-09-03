import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { IS_SAMPLE_DATA } from "@/lib/data";
import { getAdsWriteContext, getCampaignTree } from "@/lib/data/ads";
import { adsetSpecFor, hasRestrictedCategory } from "@/lib/ads/adset-rules";
import { adsWriteMessage, CREATABLE_OBJECTIVES, type AdsWriteFailCode, type CreatableObjective } from "@/lib/ads/campaign-rules";
import { CAMPAIGN_BID_STRATEGY } from "@/lib/meta/ads-write";
import { createClient } from "@/lib/supabase/server";
import { BUSINESS } from "@/lib/legal/business";
import { AdWizard } from "./_components/ad-wizard";

/*
  광고 만들기 마법사 — 2단계 슬라이스 6(광고 세트 → 소재 → 미리보기·확인).
  입구 판정은 여기서(서버) 한 번 하고, 제출은 createAdTreeAction 이 **다시** 전부 검사한다(화면은 예의, 서버가 관문).
  ⚠️ 이 페이지가 호출하는 서버 액션의 체인은 Graph 왕복 6회다 — 함수 예산 60초(스펙 §2.1).
*/

export const metadata: Metadata = {
  title: "광고 만들기",
  robots: { index: false, follow: false },
};
export const maxDuration = 60;

function Blocked({ campaignId, code, title }: { campaignId: string; code: AdsWriteFailCode; title?: string }) {
  return (
    <div className="space-y-6">
      <PageHeader title="광고 만들기" />
      <Card>
        <CardBody>
          <EmptyState
            icon={AlertTriangle}
            title={title ?? "지금은 광고를 만들 수 없어요"}
            description={adsWriteMessage(code)}
            action={
              <ButtonLink href={`/ads/campaigns/${campaignId}`} size="sm" variant="secondary">
                캠페인 상세로
              </ButtonLink>
            }
          />
        </CardBody>
      </Card>
    </div>
  );
}

/** 기본 링크 — 내 프로필 링크 주소(발행된 것 우선). 없으면 빈 문자열(사용자가 직접 넣는다) */
async function defaultLinkForUser(): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "";
    const { data, error } = await supabase
      .from("link_pages")
      .select("slug, published")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(20);
    if (error || !data) return "";
    const rows = data as { slug: string | null; published: boolean | null }[];
    const pick = rows.find((r) => r.published && r.slug) ?? rows.find((r) => r.slug);
    return pick?.slug ? `${BUSINESS.siteUrl}/${pick.slug}` : "";
  } catch {
    return "";
  }
}

export default async function NewAdPage({ params }: { params: Promise<{ campaignId: string }> }) {
  if (IS_SAMPLE_DATA) redirect("/ads/campaigns");
  const { campaignId } = await params;
  if (!/^\d{1,30}$/.test(campaignId)) notFound();

  const tree = await getCampaignTree(campaignId);
  if (tree.state === "not_found") notFound();
  if (tree.state !== "ok") return <Blocked campaignId={campaignId} code="campaign_unverified" />;

  /* 쓰기 컨텍스트 — viewer·미동의·만료는 여기서 걸러 문구로 말한다(제출은 어차피 서버가 다시 막는다) */
  const ctx = await getAdsWriteContext();
  if (ctx.state === "blocked") return <Blocked campaignId={campaignId} code={ctx.code} />;

  const { campaign, adsets } = tree;
  if (campaign.status === "ACTIVE") return <Blocked campaignId={campaignId} code="campaign_active_create" />;
  const spec = adsetSpecFor(campaign.objective);
  if (!spec || !campaign.objective || !(CREATABLE_OBJECTIVES as readonly string[]).includes(campaign.objective)) {
    return <Blocked campaignId={campaignId} code="campaign_objective_unsupported" title="이 캠페인에는 광고를 만들 수 없어요" />;
  }
  /* 기존 광고 세트를 못 읽으면 goal·입찰 대조를 못 한다 — 돈 경로라 fail-closed */
  if (adsets === null) return <Blocked campaignId={campaignId} code="campaign_unverified" />;
  if (adsets.some((a) => a.optimizationGoal && a.optimizationGoal !== spec.optimizationGoal)) {
    return <Blocked campaignId={campaignId} code="campaign_mixed_goals" />;
  }
  const bidFix = Boolean(campaign.bidStrategy && campaign.bidStrategy !== CAMPAIGN_BID_STRATEGY);
  if (bidFix && adsets.length > 0) return <Blocked campaignId={campaignId} code="campaign_bid_cap" />;

  const defaultLink = await defaultLinkForUser();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href={`/ads/campaigns/${campaignId}`}
          className="trans-state -ml-1.5 inline-flex items-center gap-0.5 rounded-card py-1 pl-1 pr-2 text-[14px] font-medium text-fg-sub hover:bg-tint-hover hover:text-fg"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {campaign.name}
        </Link>
        <PageHeader title="광고 만들기" description="광고 세트 → 소재 → 미리보기 순서로 만들어요. 만든 광고는 일시중지 상태라 게재를 시작하기 전까지 비용이 발생하지 않아요." />
      </div>

      <AdWizard
        campaign={{
          id: campaign.id,
          name: campaign.name,
          objective: campaign.objective as CreatableObjective,
          specialCategories: campaign.specialAdCategories,
          restricted: hasRestrictedCategory(campaign.specialAdCategories),
          dailyBudget: campaign.dailyBudget,
          lifetimeBudget: campaign.lifetimeBudget,
          currency: ctx.currency,
        }}
        publisher={ctx.publisher ? { pageName: ctx.publisher.pageName, igUsername: ctx.publisher.igUsername } : null}
        defaultLink={defaultLink}
        adsetCount={adsets.length}
        bidFix={bidFix}
      />
    </div>
  );
}
