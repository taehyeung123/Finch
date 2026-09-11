/* 연동 토큰으로 메타에 쓰는 모듈 — 서버 밖으로 나가면 안 된다 */
import "server-only";

/**
 * Threads 콘텐츠 발행 어댑터 — **단계별 호출**(만들기·상태 읽기·발행·확인) (2026-09-11 영상 발행으로 재작성).
 * graph.threads.net v1.0, scope threads_content_publish(VIDEO 까지 덮는다 — 새 권한 없음).
 * 근거·전체 스펙: docs/REAL_API_SPEC.md 5절, Threads posts·troubleshooting 문서(2026-09-11 확인).
 *
 * **인스타그램과 다른 점** — 이걸 놓치면 만들기 단계에서 조용히 거절당한다:
 *  1. 파라미터 이름이 `caption` 이 아니라 **`text`** 이고 상한이 500자다(인스타는 2200).
 *  2. **글만 있는 게시물이 정상**이다 — media_type=TEXT.
 *  3. 모든 준비물에 media_type 을 **명시**한다(TEXT·IMAGE·VIDEO·CAROUSEL). 캐러셀 아이템은 IMAGE·VIDEO + is_carousel_item, 2~20개.
 *     글은 캐러셀 부모에만 싣는다.
 *  4. 상태 필드는 `status`·`error_message` 다(인스타 이름 status_code 를 섞으면 요청 전체가 400 — 2026-09-09 감사).
 *
 * 예전의 «상태를 못 읽으면 30초 기다렸다 발행 강행»(blind wait)은 없앴다. 상태를 못 읽으면 UNKNOWN 으로 돌려주고
 * 엔진이 다음 확인(매분 크론)에서 다시 읽는다 — 준비 안 된 준비물을 발행으로 두들기지 않는다.
 */

import { GRAPH_THREADS_BASE } from "./graph";
import { graphCall, toContainerStatus } from "./instagram-publish";
import type { ContainerCheck, ContainerSpec, GraphFailure, GraphResult, PublishAdapter, QuotaInfo, RecentMedia } from "./publish-types";

/** Threads 글자 상한 — 스펙 5절. 인스타(2200)와 다르므로 화면·서버가 같이 참조한다(lib/publish-rules.ts 도 500). */
export const THREADS_TEXT_MAX = 500;
/** 캐러셀 하한·상한 — 스펙상 2~20. */
export const THREADS_CAROUSEL_MIN = 2;
export const THREADS_CAROUSEL_MAX = 20;

type Budget = { slice(): number | null };

const fail = (f: Partial<GraphFailure> & { kind: GraphFailure["kind"] }): { ok: false; failure: GraphFailure } => ({
  ok: false,
  failure: { httpStatus: null, code: null, subcode: null, message: null, ...f },
});

/** 스레드 준비물 파라미터 — 사양이 스레드에 없는 것(릴스·스토리)이면 null */
export function threadsContainerParams(spec: ContainerSpec): Record<string, string> | null {
  switch (spec.type) {
    case "text":
      return { media_type: "TEXT", text: spec.caption };
    case "image":
      return {
        media_type: "IMAGE",
        image_url: spec.url,
        ...(spec.carouselItem ? { is_carousel_item: "true" } : spec.caption ? { text: spec.caption } : {}),
      };
    case "video":
      return {
        media_type: "VIDEO",
        video_url: spec.url,
        ...(spec.carouselItem ? { is_carousel_item: "true" } : spec.caption ? { text: spec.caption } : {}),
      };
    case "carousel":
      return { media_type: "CAROUSEL", children: spec.children.join(","), ...(spec.caption ? { text: spec.caption } : {}) };
    case "reels":
    case "story":
      return null;
  }
}

/** 연동 한 건(스레드 사용자 id + 토큰)에 묶인 어댑터 */
export function makeThreadsAdapter(threadsUserId: string, token: string): PublishAdapter {
  const call = <T>(method: "GET" | "POST", path: string, params: Record<string, string>, d: Budget) =>
    graphCall<T>(GRAPH_THREADS_BASE, method, path, token, params, d);

  return {
    channel: "threads",

    async create(spec, d) {
      const params = threadsContainerParams(spec);
      if (!params) return fail({ kind: "http", httpStatus: 400, message: `unsupported_spec:${spec.type}` });
      if (spec.type === "carousel" && (spec.children.length < THREADS_CAROUSEL_MIN || spec.children.length > THREADS_CAROUSEL_MAX)) {
        return fail({ kind: "http", httpStatus: 400, message: "carousel_count" });
      }
      const r = await call<{ id?: string }>("POST", `/${threadsUserId}/threads`, params, d);
      if (!r.ok) return r;
      if (!r.data.id) return fail({ kind: "network", message: "no_container_id" });
      return { ok: true, data: { id: String(r.data.id) } };
    },

    async check(containerId, d): Promise<GraphResult<ContainerCheck>> {
      const r = await call<{ status?: string; error_message?: string }>("GET", `/${containerId}`, { fields: "status,error_message" }, d);
      if (!r.ok) return r;
      const status = toContainerStatus(r.data.status);
      return { ok: true, data: { status, subcode: null, detail: typeof r.data.error_message === "string" ? r.data.error_message : null } };
    },

    async publish(containerId, d) {
      const r = await call<{ id?: string }>("POST", `/${threadsUserId}/threads_publish`, { creation_id: containerId }, d);
      if (!r.ok) return r;
      if (!r.data.id) return fail({ kind: "network", message: "no_media_id" });
      return { ok: true, data: { id: String(r.data.id) } };
    },

    async permalink(mediaId, d) {
      const r = await call<{ permalink?: string }>("GET", `/${mediaId}`, { fields: "permalink" }, d);
      return r.ok && typeof r.data.permalink === "string" ? r.data.permalink : null;
    },

    async recent(d): Promise<GraphResult<RecentMedia[]>> {
      const r = await call<{ data?: Array<{ id?: string; text?: string; timestamp?: string; permalink?: string }> }>(
        "GET",
        `/${threadsUserId}/threads`,
        { fields: "id,text,timestamp,permalink", limit: "10" },
        d,
      );
      if (!r.ok) return r;
      return {
        ok: true,
        data: (r.data.data ?? [])
          .filter((m) => typeof m.id === "string")
          .map((m) => ({ id: String(m.id), caption: m.text ?? null, timestamp: m.timestamp ?? null, permalink: m.permalink ?? null })),
      };
    },

    async quota(d): Promise<QuotaInfo | null> {
      const r = await call<{ data?: Array<{ quota_usage?: number; config?: { quota_total?: number } }> }>(
        "GET",
        `/${threadsUserId}/threads_publishing_limit`,
        { fields: "quota_usage,config" },
        d,
      );
      const row = r.ok ? r.data.data?.[0] : undefined;
      if (typeof row?.quota_usage !== "number" || typeof row.config?.quota_total !== "number") return null;
      return { usage: row.quota_usage, total: row.config.quota_total };
    },
  };
}
