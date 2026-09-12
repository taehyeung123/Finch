/**
 * 발행 어댑터 공통 타입 — 인스타(instagram-publish.ts)·스레드(threads-publish.ts)가 같은 모양을 돌려주고,
 * 발행 엔진(lib/publish/run.ts)은 채널을 모른 채 이 모양만 다룬다.
 *
 * 이 파일은 타입뿐이다(런타임 import 없음) — Node 검사가 그대로 읽는다.
 */

/** 메타 컨테이너 상태. UNKNOWN = 이번에 읽지 못했다(네트워크·일시 오류) — «실패»가 아니다 */
export type ContainerStatus = "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED" | "UNKNOWN";

/** 그래프 호출 실패 원문 — 로그용. 고객 문구는 publish-errors.ts 가 만든다 */
export interface GraphFailure {
  /** http = 메타가 오류로 답했다 / network·timeout = 답을 못 받았다 / budget = 시간 예산이 없어 부르지 않았다 */
  kind: "http" | "network" | "timeout" | "budget";
  httpStatus: number | null;
  code: number | null;
  subcode: number | null;
  /** 메타 원문(영문) — 로그에만 쓴다, 토큰은 가린다 */
  message: string | null;
}

export type GraphResult<T> = { ok: true; data: T } | { ok: false; failure: GraphFailure };

export interface ContainerCheck {
  status: ContainerStatus;
  /** 인스타 ERROR 때 status 필드에서 뽑은 2207xxx — 없으면 null */
  subcode: number | null;
  /** 스레드 error_message(FAILED_DOWNLOADING_VIDEO …) 또는 인스타 status 원문 */
  detail: string | null;
}

export interface RecentMedia {
  id: string;
  caption: string | null;
  timestamp: string | null;
  permalink: string | null;
}

export interface QuotaInfo {
  usage: number;
  total: number;
}

/**
 * 컨테이너 한 개의 사양 — 채널 어댑터가 파라미터로 바꾼다.
 * 인스타 전용: reels·story. 스레드 전용: text. 공통: image·video(캐러셀 아이템/스레드 단일)·carousel.
 */
export type ContainerSpec =
  | { type: "text"; caption: string }
  | { type: "image"; url: string; caption: string | null; carouselItem: boolean }
  | { type: "video"; url: string; caption: string | null; carouselItem: boolean; thumbOffsetMs: number | null }
  | { type: "reels"; url: string; caption: string; shareToFeed: boolean; thumbOffsetMs: number | null }
  | { type: "story"; url: string; mediaKind: "image" | "video" }
  | { type: "carousel"; children: string[]; caption: string | null };

/** 엔진이 부르는 채널 어댑터 — 한 게시물·한 토큰에 묶인다 */
export interface PublishAdapter {
  readonly channel: "instagram" | "threads";
  create(spec: ContainerSpec, deadline: { slice(): number | null }): Promise<GraphResult<{ id: string }>>;
  check(containerId: string, deadline: { slice(): number | null }): Promise<GraphResult<ContainerCheck>>;
  publish(containerId: string, deadline: { slice(): number | null }): Promise<GraphResult<{ id: string }>>;
  /** 실패는 null — 링크는 있으면 좋은 것이지 발행 기록을 막을 이유가 아니다 */
  permalink(mediaId: string, deadline: { slice(): number | null }): Promise<string | null>;
  recent(deadline: { slice(): number | null }): Promise<GraphResult<RecentMedia[]>>;
  /** 실패는 null — 한도를 못 읽었다고 발행을 막지 않는다(메타가 2207042 로 최종 판정) */
  quota(deadline: { slice(): number | null }): Promise<QuotaInfo | null>;
}
