/* 연동 토큰으로 메타에 쓰는 모듈 — 서버 밖으로 나가면 안 된다 */
import "server-only";

/**
 * Instagram 콘텐츠 발행 어댑터 — **단계별 호출**(만들기·상태 읽기·발행·확인) (2026-09-11 영상 발행으로 재작성).
 * graph.instagram.com v25.0(Instagram Login), scope instagram_business_content_publish —
 * 연동 동의 때 함께 받는다(lib/meta/instagram-oauth.ts 의 INSTAGRAM_SCOPES). 새 권한은 필요 없다.
 *
 * 예전엔 «만들기 → 2초마다 폴링 → 발행»을 요청 하나 안에서 끝냈다. 영상은 메타가 몇 분씩 처리하므로 그 모델이 성립하지 않는다.
 * 이제 이 파일은 **한 번의 호출씩**만 제공하고, 흐름(언제 다시 볼지·두 번 올리지 않기)은 lib/publish/run.ts +
 * engine-core.ts 가 여러 번의 실행에 걸쳐 진행한다.
 *
 * 메타 규칙(IG content publishing·IG User Media 문서, 2026-09-11 확인):
 *  · 사진: media_type 을 **보내지 않는다**(문서화된 값은 CAROUSEL·REELS·STORIES 뿐). image_url 은 JPEG.
 *  · 영상 1개: media_type=REELS(피드 VIDEO 단일 게시물은 2023-11 부터 안 된다). share_to_feed 는 기본값이 문서에 없어 항상 명시.
 *    thumb_offset(ms)는 **항상** 보낸다 — 안 보내면 메타는 첫 프레임을 커버로 쓰고, 우리 목록 썸네일(1초 지점)과 달라진다.
 *  · 캐러셀 아이템: 사진 image_url / 영상 media_type=VIDEO + video_url, 둘 다 is_carousel_item=true. 아이템엔 캡션을 싣지 않는다.
 *  · 스토리: media_type=STORIES + image_url|video_url. 캡션·share_to_feed·커버 없음.
 *  · 상태: fields=status_code(IN_PROGRESS·FINISHED·PUBLISHED·ERROR·EXPIRED). 하위 코드는 ERROR 일 때만 status 필드로 따로 읽는다 —
 *    같은 요청에 모르는 필드를 섞으면 그래프가 요청 전체를 거절한다(스레드에서 한 번 겪었다, threads-publish.ts).
 *  · POST 는 폼 본문으로 보낸다 — 2,200자 한글 캡션을 쿼리에 실으면 주소가 20KB 가 되고, 토큰이 주소 로그에 남는다.
 * 메타는 image_url/video_url 을 **직접 가져간다** — 우리가 짧은 서명 URL 을 만들어 넘긴다(lib/publish/media.ts).
 */

import { GRAPH_INSTAGRAM_BASE } from "./graph";
import { extractIgSubcode } from "./publish-errors";
import type {
  ContainerCheck,
  ContainerSpec,
  ContainerStatus,
  GraphFailure,
  GraphResult,
  PublishAdapter,
  QuotaInfo,
  RecentMedia,
} from "./publish-types";

type Budget = { slice(): number | null };

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number };
}

const fail = (f: Partial<GraphFailure> & { kind: GraphFailure["kind"] }): { ok: false; failure: GraphFailure } => ({
  ok: false,
  failure: { httpStatus: null, code: null, subcode: null, message: null, ...f },
});

/** 그래프 한 번 — 예외를 던지지 않는다. 시간은 흐름 예산(Deadline)의 몫만 쓴다 */
export async function graphCall<T>(
  base: string,
  method: "GET" | "POST",
  path: string,
  token: string,
  params: Record<string, string>,
  deadline: Budget,
): Promise<GraphResult<T>> {
  const budget = deadline.slice();
  if (budget === null) return fail({ kind: "budget" });
  try {
    const q = new URLSearchParams({ ...params, access_token: token });
    const res =
      method === "POST"
        ? await fetch(`${base}${path}`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: q,
            cache: "no-store",
            signal: AbortSignal.timeout(budget),
          })
        : await fetch(`${base}${path}?${q.toString()}`, { cache: "no-store", signal: AbortSignal.timeout(budget) });
    const json = (await res.json().catch(() => null)) as (T & GraphErrorBody) | null;
    if (!res.ok) {
      const err = json?.error;
      return fail({
        kind: "http",
        httpStatus: res.status,
        code: typeof err?.code === "number" ? err.code : null,
        subcode: typeof err?.error_subcode === "number" ? err.error_subcode : null,
        message: err?.message ?? null,
      });
    }
    /* 성공 응답인데 본문을 못 읽었다 — 결과를 모르는 것이다(발행이면 올라갔을 수 있다) */
    if (json === null) return fail({ kind: "network", httpStatus: res.status, message: "unreadable_body" });
    return { ok: true, data: json };
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return fail({ kind: "timeout" });
    return fail({ kind: "network", message: e instanceof Error ? e.message : String(e) });
  }
}

const STATUS_VALUES: ReadonlySet<string> = new Set(["IN_PROGRESS", "FINISHED", "PUBLISHED", "ERROR", "EXPIRED"]);

export function toContainerStatus(v: unknown): ContainerStatus {
  const s = typeof v === "string" ? v.toUpperCase() : "";
  return STATUS_VALUES.has(s) ? (s as ContainerStatus) : "UNKNOWN";
}

/** 인스타 준비물 파라미터 — 사양이 인스타에 없는 것(글 전용 등)이면 null */
export function igContainerParams(spec: ContainerSpec): Record<string, string> | null {
  switch (spec.type) {
    case "image":
      return spec.carouselItem
        ? { image_url: spec.url, is_carousel_item: "true" }
        : { image_url: spec.url, ...(spec.caption ? { caption: spec.caption } : {}) };
    case "video":
      /* 인스타의 VIDEO 는 캐러셀 아이템에만 남았다 — 단일 영상은 reels 로 온다 */
      if (!spec.carouselItem) return null;
      return {
        media_type: "VIDEO",
        video_url: spec.url,
        is_carousel_item: "true",
        ...(spec.thumbOffsetMs !== null ? { thumb_offset: String(spec.thumbOffsetMs) } : {}),
      };
    case "reels":
      return {
        media_type: "REELS",
        video_url: spec.url,
        caption: spec.caption,
        share_to_feed: spec.shareToFeed ? "true" : "false",
        ...(spec.thumbOffsetMs !== null ? { thumb_offset: String(spec.thumbOffsetMs) } : {}),
      };
    case "story":
      return spec.mediaKind === "video"
        ? { media_type: "STORIES", video_url: spec.url }
        : { media_type: "STORIES", image_url: spec.url };
    case "carousel":
      return { media_type: "CAROUSEL", children: spec.children.join(","), ...(spec.caption ? { caption: spec.caption } : {}) };
    case "text":
      return null;
  }
}

/** 연동 한 건(인스타 사용자 id + 토큰)에 묶인 어댑터 */
export function makeInstagramAdapter(igUserId: string, token: string): PublishAdapter {
  const call = <T>(method: "GET" | "POST", path: string, params: Record<string, string>, d: Budget) =>
    graphCall<T>(GRAPH_INSTAGRAM_BASE, method, path, token, params, d);

  return {
    channel: "instagram",

    async create(spec, d) {
      const params = igContainerParams(spec);
      if (!params) return fail({ kind: "http", httpStatus: 400, message: `unsupported_spec:${spec.type}` });
      const r = await call<{ id?: string }>("POST", `/${igUserId}/media`, params, d);
      if (!r.ok) return r;
      if (!r.data.id) return fail({ kind: "network", message: "no_container_id" });
      return { ok: true, data: { id: String(r.data.id) } };
    },

    async check(containerId, d): Promise<GraphResult<ContainerCheck>> {
      const r = await call<{ status_code?: string }>("GET", `/${containerId}`, { fields: "status_code" }, d);
      if (!r.ok) return r;
      const status = toContainerStatus(r.data.status_code);
      if (status !== "ERROR") return { ok: true, data: { status, subcode: null, detail: null } };
      /* 하위 코드는 따로 읽는다 — 실패해도 ERROR 는 ERROR 다 */
      const detail = await call<{ status?: string }>("GET", `/${containerId}`, { fields: "status" }, d);
      const text = detail.ok && typeof detail.data.status === "string" ? detail.data.status : null;
      return { ok: true, data: { status, subcode: extractIgSubcode(text), detail: text } };
    },

    async publish(containerId, d) {
      const r = await call<{ id?: string }>("POST", `/${igUserId}/media_publish`, { creation_id: containerId }, d);
      if (!r.ok) return r;
      if (!r.data.id) return fail({ kind: "network", message: "no_media_id" });
      return { ok: true, data: { id: String(r.data.id) } };
    },

    async permalink(mediaId, d) {
      const r = await call<{ permalink?: string }>("GET", `/${mediaId}`, { fields: "permalink" }, d);
      return r.ok && typeof r.data.permalink === "string" ? r.data.permalink : null;
    },

    async recent(d): Promise<GraphResult<RecentMedia[]>> {
      const r = await call<{ data?: Array<{ id?: string; caption?: string; timestamp?: string; permalink?: string }> }>(
        "GET",
        `/${igUserId}/media`,
        { fields: "id,caption,timestamp,permalink", limit: "10" },
        d,
      );
      if (!r.ok) return r;
      return {
        ok: true,
        data: (r.data.data ?? [])
          .filter((m) => typeof m.id === "string")
          .map((m) => ({ id: String(m.id), caption: m.caption ?? null, timestamp: m.timestamp ?? null, permalink: m.permalink ?? null })),
      };
    },

    async quota(d): Promise<QuotaInfo | null> {
      /* 필드는 이 둘만 — 참조 문서 예시의 rate_limit_settings 는 옛 필드다 */
      const r = await call<{ data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }> }>(
        "GET",
        `/${igUserId}/content_publishing_limit`,
        { fields: "quota_usage,config" },
        d,
      );
      const row = r.ok ? r.data.data?.[0] : undefined;
      if (typeof row?.quota_usage !== "number" || typeof row.config?.quota_total !== "number") return null;
      return { usage: row.quota_usage, total: row.config.quota_total };
    },
  };
}
