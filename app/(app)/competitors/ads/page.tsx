import type { LucideIcon } from "lucide-react";
import { BellRing, Image as ImageIcon, Images, Info, Video } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, DataSourceBadge } from "@/components/ui/badge";
import { DataSourceNote } from "@/components/ui/data-source-note";
import { cn } from "@/lib/cn";
import { formatAgo, formatDate } from "@/lib/format";
import { competitorAds } from "@/lib/mock/data";
import type { CompetitorAd } from "@/lib/types";
import { CompetitorTabs } from "../tabs";

const MEDIA_ICON: Record<CompetitorAd["mediaType"], LucideIcon> = {
  image: ImageIcon,
  video: Video,
  carousel: Images,
};

const MEDIA_LABEL: Record<CompetitorAd["mediaType"], string> = {
  image: "이미지 소재",
  video: "영상 소재",
  carousel: "캐러셀 소재",
};

/* 노출 플랫폼 배지 — 점 컬러는 채널 배지 컬러 체계와 동일하게 분리 관리 (PART 7.5) */
const PLATFORM_META: Record<CompetitorAd["platforms"][number], { label: string; dot: string }> = {
  facebook: { label: "Facebook", dot: "bg-meta" },
  instagram: { label: "Instagram", dot: "bg-ig" },
};

export default function CompetitorAdsPage() {
  const monitoredPages = Array.from(new Set(competitorAds.map((ad) => ad.pageName)));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="경쟁사 광고 모니터링"
        description="Meta 광고 라이브러리 공식 API 기반으로 등록한 페이지의 새 광고를 자동 감지합니다."
        action={<DataSourceBadge source="official" />}
      />

      <CompetitorTabs current="ads" />

      {/* 모니터링 중인 페이지 요약 (PART 4.6) */}
      <Card>
        <CardHeader
          title="모니터링 중인 페이지"
          description={
            <>
              등록한 경쟁사와 연결된 Meta 페이지 <span className="tnum">{monitoredPages.length}</span>개를
              추적하고 있습니다.
            </>
          }
          action={<DataSourceNote source="Meta 광고 라이브러리 공식 API" />}
        />
        <CardBody className="flex flex-wrap gap-1.5">
          {monitoredPages.map((page) => (
            <span
              key={page}
              className="rounded-chip border border-line bg-overlay px-3.5 py-1.5 text-[13px] font-semibold text-fg-sub"
            >
              {page}
            </span>
          ))}
        </CardBody>
      </Card>

      {/* 광고 피드 */}
      <section aria-label="경쟁사 광고 피드" className="space-y-3">
        <div>
          <h3 className="text-[19px] font-bold leading-snug">광고 피드</h3>
          <p className="mt-0.5 text-[13px] text-fg-sub">
            게재 기간이 길수록 성과가 검증된 소재일 가능성이 높습니다.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {competitorAds.map((ad) => {
            const MediaIcon = MEDIA_ICON[ad.mediaType];
            return (
              <Card key={ad.id} hover className="flex flex-col overflow-hidden">
                {/* 소재 미리보기 자리 */}
                <div className="flex aspect-video items-center justify-center border-b border-line bg-overlay">
                  <div className="flex flex-col items-center gap-1.5 text-fg-faint">
                    <MediaIcon className="size-7" aria-hidden />
                    <span className="text-xs">{MEDIA_LABEL[ad.mediaType]}</span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col gap-2 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-fg-sub">{ad.pageName}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {ad.isNew ? <Badge tone="primary">NEW</Badge> : null}
                      <span className="text-xs text-fg-faint">{formatAgo(ad.detectedAt)} 감지</span>
                    </span>
                  </div>

                  <p className="text-[15px] font-semibold leading-snug">{ad.headline}</p>
                  <p className="text-[13px] leading-relaxed text-fg-sub">{ad.bodyPreview}</p>

                  <div className="mt-auto space-y-3 pt-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={ad.runningDays >= 14 ? "positive" : "neutral"}>
                        <span className="tnum">{ad.runningDays}일째</span> 운영 중
                      </Badge>
                      {ad.platforms.map((p) => (
                        <Badge key={p}>
                          <span className={cn("size-1.5 rounded-full", PLATFORM_META[p].dot)} aria-hidden />
                          {PLATFORM_META[p].label}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between border-t border-line pt-3 text-xs text-fg-faint">
                      <span>
                        게재 시작 <span className="tnum">{formatDate(ad.startedAt)}</span>
                      </span>
                      <span>
                        노출 <span className="tnum font-semibold text-fg-sub">{ad.impressionRange}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* 정책·동작 안내 (PART 4.6) */}
      <section aria-label="모니터링 안내" className="grid gap-4 md:grid-cols-2">
        <Card className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-card bg-overlay text-fg-sub">
            <Info className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-[14px] font-semibold">광고비(스펜드)는 표시되지 않습니다</p>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-sub">
              Meta 광고 라이브러리는 한국 지역 광고의 집행 금액을 비공개 정책으로 제공하지 않습니다. 노출수
              구간, 게재 기간, 노출 플랫폼 등 공개 지표만 표시합니다.
            </p>
          </div>
        </Card>
        <Card className="flex items-start gap-3 p-5">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-card bg-primary-weak text-primary">
            <BellRing className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-[14px] font-semibold">하루 4회 새 광고를 감지합니다</p>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-sub">
              등록된 페이지를 하루 4회 확인해 새로 시작된 광고를 감지합니다. 새 광고가 감지되면 인앱·이메일
              알림으로 바로 알려드립니다.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
