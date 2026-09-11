/**
 * Instagram 콘텐츠 발행 어댑터 — 캐러셀(카드뉴스) 자동 게시.
 * graph.instagram.com v25.0(Instagram Login), scope instagram_business_content_publish 필요 —
 * 연동 동의 때 함께 받는다(lib/meta/instagram-oauth.ts 의 INSTAGRAM_SCOPES).
 * 그 배열에서 빠지면 여기서는 아무 신호도 없고, 발행 시각에야 권한 오류로 실패한다.
 *
 * 흐름: 이미지별 아이템 컨테이너 생성 → 캐러셀 컨테이너 생성(children) → 상태 폴링 → 발행.
 * Meta가 image_url을 직접 크롤링하므로 공개 접근 가능한 URL이어야 한다(Supabase Storage 공개 버킷).
 * 이미지는 **JPEG 만** 받는다(«JPEG is the only image format supported») — 컴포저·스튜디오가 JPEG 로 굽는다.
 *
 * ⚠️ 시간 예산은 **전체 흐름**에 건다(2026-09-09 점검). 예전엔 마지막 폴링에만 상한이 있고 아이템 컨테이너 생성
 * 루프(최대 10회 순차 Graph 왕복)는 타임아웃이 없어, 메타가 느리면 함수 maxDuration 을 넘겨 플랫폼이 죽이고
 * 행이 'publishing' 으로 굳었다. 이제 호출마다 남은 예산만큼만 기다리고, 예산이 다하면 실패로 돌려준다.
 */

import { GRAPH_INSTAGRAM_BASE } from "./graph";

export type PublishResult = { ok: true; mediaId: string } | { ok: false; error: string };

interface GraphErrorBody {
  error?: { message?: string; code?: number };
}

/** 호출 하나가 기다릴 상한 — 예산이 더 남아 있어도 한 호출을 이 이상 붙들지 않는다 */
const PER_CALL_TIMEOUT_MS = 15_000;
/** 이보다 적게 남았으면 새 호출을 시작하지 않는다(응답을 받아도 처리할 시간이 없다) */
const MIN_CALL_BUDGET_MS = 1_500;

/** 전체 흐름의 시간 예산 — 스레드 어댑터도 같은 것을 쓴다(threads-publish.ts) */
export class Deadline {
  private readonly at: number;
  constructor(totalMs: number) {
    this.at = Date.now() + totalMs;
  }
  remaining(): number {
    return this.at - Date.now();
  }
  /** 다음 호출에 줄 시간 — 없으면 null(예산 소진) */
  slice(): number | null {
    const r = this.remaining();
    return r < MIN_CALL_BUDGET_MS ? null : Math.min(PER_CALL_TIMEOUT_MS, r);
  }
}

async function graphCall<T>(
  path: string,
  accessToken: string,
  params: Record<string, string>,
  deadline: Deadline,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const budget = deadline.slice();
  if (budget === null) return { ok: false, error: "publish_timeout" };
  const q = new URLSearchParams({ ...params, access_token: accessToken });
  try {
    const res = await fetch(`${GRAPH_INSTAGRAM_BASE}${path}?${q.toString()}`, {
      method: "POST",
      signal: AbortSignal.timeout(budget),
    });
    const json = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
    if (!res.ok) {
      return { ok: false, error: json.error?.message ?? `http_${res.status}` };
    }
    return { ok: true, data: json };
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") return { ok: false, error: "publish_timeout" };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function createCarouselItem(igUserId: string, accessToken: string, imageUrl: string, deadline: Deadline) {
  return graphCall<{ id: string }>(`/${igUserId}/media`, accessToken, { image_url: imageUrl, is_carousel_item: "true" }, deadline);
}

async function createCarouselContainer(
  igUserId: string,
  accessToken: string,
  caption: string,
  childrenIds: string[],
  deadline: Deadline,
) {
  return graphCall<{ id: string }>(
    `/${igUserId}/media`,
    accessToken,
    { media_type: "CAROUSEL", caption, children: childrenIds.join(",") },
    deadline,
  );
}

/** 단일 이미지(1장짜리 카드뉴스)는 캐러셀이 아니라 일반 IMAGE 컨테이너로 만든다 */
async function createSingleImageContainer(igUserId: string, accessToken: string, caption: string, imageUrl: string, deadline: Deadline) {
  return graphCall<{ id: string }>(`/${igUserId}/media`, accessToken, { image_url: imageUrl, caption }, deadline);
}

async function pollContainerStatus(
  containerId: string,
  accessToken: string,
  deadline: Deadline,
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (;;) {
    const budget = deadline.slice();
    if (budget === null) return { ok: false, error: "container_timeout" };
    let json: { status_code?: string; error?: { message?: string } };
    try {
      const res = await fetch(
        `${GRAPH_INSTAGRAM_BASE}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`,
        { signal: AbortSignal.timeout(budget) },
      );
      json = (await res.json().catch(() => ({}))) as typeof json;
      if (!res.ok) return { ok: false, error: json.error?.message ?? `http_${res.status}` };
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") return { ok: false, error: "container_timeout" };
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (json.status_code === "FINISHED") return { ok: true };
    if (json.status_code === "ERROR" || json.status_code === "EXPIRED") {
      return { ok: false, error: `container_${json.status_code.toLowerCase()}` };
    }
    // IN_PROGRESS — 2초 대기 후 재확인(남은 예산 안에서)
    if (deadline.remaining() < 2_000 + MIN_CALL_BUDGET_MS) return { ok: false, error: "container_timeout" };
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function publishContainer(igUserId: string, accessToken: string, containerId: string, deadline: Deadline) {
  return graphCall<{ id: string }>(`/${igUserId}/media_publish`, accessToken, { creation_id: containerId }, deadline);
}

/**
 * 카드뉴스 게시 — 이미지 1장이면 단일 이미지, 2장 이상이면 캐러셀로 발행한다.
 * 각 단계 실패는 명확한 사유와 함께 즉시 중단(부분 상태로 남기지 않음).
 *
 * @param maxWaitMs **전체 흐름**의 시간 상한(아이템 생성·컨테이너·폴링·발행 합계). 호출측이 자기 실행시간 예산에
 *   맞춰 줘야 한다 — 함수 maxDuration 보다 길면 플랫폼이 함수를 먼저 죽이고 행이 'publishing' 으로 굳는다.
 *   ⚠️ 마지막 media_publish 가 성공한 뒤 예산이 다해도 결과는 그대로 돌려준다 — 올라간 글은 기록해야 한다.
 */
export async function publishCardNews(params: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrls: string[];
  maxWaitMs?: number;
}): Promise<PublishResult> {
  const { igUserId, accessToken, caption, imageUrls, maxWaitMs = 60_000 } = params;
  if (imageUrls.length === 0) return { ok: false, error: "이미지가 없습니다." };
  const deadline = new Deadline(maxWaitMs);

  let containerId: string;

  if (imageUrls.length === 1) {
    const single = await createSingleImageContainer(igUserId, accessToken, caption, imageUrls[0], deadline);
    if (!single.ok) return { ok: false, error: `이미지 준비 실패: ${single.error}` };
    containerId = single.data.id;
  } else {
    const childIds: string[] = [];
    for (const url of imageUrls) {
      const item = await createCarouselItem(igUserId, accessToken, url, deadline);
      if (!item.ok) return { ok: false, error: `슬라이드 준비 실패: ${item.error}` };
      childIds.push(item.data.id);
    }
    const carousel = await createCarouselContainer(igUserId, accessToken, caption, childIds, deadline);
    if (!carousel.ok) return { ok: false, error: `캐러셀 준비 실패: ${carousel.error}` };
    containerId = carousel.data.id;
  }

  const status = await pollContainerStatus(containerId, accessToken, deadline);
  if (!status.ok) return { ok: false, error: `콘텐츠 처리 실패: ${status.error}` };

  const published = await publishContainer(igUserId, accessToken, containerId, deadline);
  if (!published.ok) return { ok: false, error: `발행 실패: ${published.error}` };

  return { ok: true, mediaId: published.data.id };
}
