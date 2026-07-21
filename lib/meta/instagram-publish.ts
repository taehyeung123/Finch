/**
 * Instagram 콘텐츠 발행 어댑터 — 캐러셀(카드뉴스) 자동 게시.
 * graph.instagram.com v25.0(Instagram Login), scope instagram_business_content_publish 필요
 * (docs/REAL_API_SPEC.md 1절 — 이미 OAuth 스코프에 포함되어 있어 추가 동의 불필요).
 *
 * 흐름: 이미지별 아이템 컨테이너 생성 → 캐러셀 컨테이너 생성(children) → 상태 폴링 → 발행.
 * Meta가 image_url을 직접 크롤링하므로 공개 접근 가능한 URL이어야 한다(Supabase Storage 공개 버킷).
 */

import { GRAPH_INSTAGRAM_BASE } from "./graph";

export type PublishResult = { ok: true; mediaId: string } | { ok: false; error: string };

interface GraphErrorBody {
  error?: { message?: string; code?: number };
}

async function graphCall<T>(path: string, accessToken: string, params: Record<string, string>): Promise<
  { ok: true; data: T } | { ok: false; error: string }
> {
  const q = new URLSearchParams({ ...params, access_token: accessToken });
  try {
    const res = await fetch(`${GRAPH_INSTAGRAM_BASE}${path}?${q.toString()}`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
    if (!res.ok) {
      return { ok: false, error: json.error?.message ?? `http_${res.status}` };
    }
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function createCarouselItem(igUserId: string, accessToken: string, imageUrl: string) {
  return graphCall<{ id: string }>(`/${igUserId}/media`, accessToken, {
    image_url: imageUrl,
    is_carousel_item: "true",
  });
}

async function createCarouselContainer(igUserId: string, accessToken: string, caption: string, childrenIds: string[]) {
  return graphCall<{ id: string }>(`/${igUserId}/media`, accessToken, {
    media_type: "CAROUSEL",
    caption,
    children: childrenIds.join(","),
  });
}

/** 단일 이미지(1장짜리 카드뉴스)는 캐러셀이 아니라 일반 IMAGE 컨테이너로 만든다 */
async function createSingleImageContainer(igUserId: string, accessToken: string, caption: string, imageUrl: string) {
  return graphCall<{ id: string }>(`/${igUserId}/media`, accessToken, { image_url: imageUrl, caption });
}

async function pollContainerStatus(
  containerId: string,
  accessToken: string,
  maxWaitMs = 60_000,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(
      `${GRAPH_INSTAGRAM_BASE}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
    );
    const json = (await res.json().catch(() => ({}))) as { status_code?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `http_${res.status}` };
    if (json.status_code === "FINISHED") return { ok: true };
    if (json.status_code === "ERROR" || json.status_code === "EXPIRED") {
      return { ok: false, error: `container_${json.status_code.toLowerCase()}` };
    }
    // IN_PROGRESS — 2초 대기 후 재확인
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ok: false, error: "container_timeout" };
}

async function publishContainer(igUserId: string, accessToken: string, containerId: string) {
  return graphCall<{ id: string }>(`/${igUserId}/media_publish`, accessToken, { creation_id: containerId });
}

/**
 * 카드뉴스 게시 — 이미지 1장이면 단일 이미지, 2장 이상이면 캐러셀로 발행한다.
 * 각 단계 실패는 명확한 사유와 함께 즉시 중단(부분 상태로 남기지 않음).
 */
export async function publishCardNews(params: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrls: string[];
}): Promise<PublishResult> {
  const { igUserId, accessToken, caption, imageUrls } = params;
  if (imageUrls.length === 0) return { ok: false, error: "이미지가 없습니다." };

  let containerId: string;

  if (imageUrls.length === 1) {
    const single = await createSingleImageContainer(igUserId, accessToken, caption, imageUrls[0]);
    if (!single.ok) return { ok: false, error: `이미지 준비 실패: ${single.error}` };
    containerId = single.data.id;
  } else {
    const childIds: string[] = [];
    for (const url of imageUrls) {
      const item = await createCarouselItem(igUserId, accessToken, url);
      if (!item.ok) return { ok: false, error: `슬라이드 준비 실패: ${item.error}` };
      childIds.push(item.data.id);
    }
    const carousel = await createCarouselContainer(igUserId, accessToken, caption, childIds);
    if (!carousel.ok) return { ok: false, error: `캐러셀 준비 실패: ${carousel.error}` };
    containerId = carousel.data.id;
  }

  const status = await pollContainerStatus(containerId, accessToken);
  if (!status.ok) return { ok: false, error: `콘텐츠 처리 실패: ${status.error}` };

  const published = await publishContainer(igUserId, accessToken, containerId);
  if (!published.ok) return { ok: false, error: `발행 실패: ${published.error}` };

  return { ok: true, mediaId: published.data.id };
}
