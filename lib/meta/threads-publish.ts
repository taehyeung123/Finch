/**
 * Threads 콘텐츠 발행 어댑터 — 예약 발행.
 * graph.threads.net v1.0, scope threads_content_publish 필요 —
 * 연동 동의 때 함께 받는다(lib/meta/threads-oauth.ts 의 THREADS_SCOPES).
 * 근거·전체 스펙: docs/REAL_API_SPEC.md 5절.
 *
 * 흐름은 인스타그램(instagram-publish.ts)과 같은 2단계다:
 *   컨테이너 생성 → 상태 폴링 → 발행(threads_publish).
 * 캐러셀이면 아이템 컨테이너를 먼저 만들고 children 으로 묶는 것도 같다.
 *
 * **인스타그램과 다른 점 셋** — 이걸 놓치면 컨테이너 생성 단계에서 조용히 거절당한다:
 *  1. 파라미터 이름이 `caption` 이 아니라 **`text`** 이고 상한이 500자다(인스타는 2200).
 *  2. **글만 있는 게시물이 정상**이다 — media_type=TEXT, 이미지 없이 발행된다.
 *     인스타는 이미지가 반드시 있어야 한다.
 *  3. 단일 이미지도 `media_type=IMAGE` 를 **명시**해야 한다(인스타는 image_url 만 주면 된다).
 *
 * Meta 가 image_url 을 직접 크롤링하므로 공개 접근 가능한 URL 이어야 한다(Supabase Storage 공개 버킷).
 */

import { GRAPH_THREADS_BASE } from "./graph";
import type { PublishResult } from "./instagram-publish";

/** Threads 글자 상한 — 스펙 5절. 인스타(2200)와 다르므로 화면·서버가 같이 참조한다. */
export const THREADS_TEXT_MAX = 500;
/** 캐러셀 하한·상한 — 스펙상 2~20. 실제 상한은 업로드 본문 크기라 호출측이 더 좁힐 수 있다. */
export const THREADS_CAROUSEL_MIN = 2;
export const THREADS_CAROUSEL_MAX = 20;

interface GraphErrorBody {
  error?: { message?: string; code?: number };
}

async function threadsCall<T>(
  path: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const q = new URLSearchParams({ ...params, access_token: accessToken });
  try {
    const res = await fetch(`${GRAPH_THREADS_BASE}${path}?${q.toString()}`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
    if (!res.ok) {
      return { ok: false, error: json.error?.message ?? `http_${res.status}` };
    }
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 컨테이너 상태 조회 필드 이름이 **실 계정으로 확정되지 않았다.**
 * 인스타는 `status_code`(instagram-publish.ts), Threads 문서는 `status` 로 보이지만
 * docs/REAL_API_SPEC.md 5절에 컨테이너 상태 조회 자체가 기술돼 있지 않다.
 * 그래서 두 이름을 모두 읽는다 — 실 테스터 계정으로 확인한 뒤 하나로 줄일 것.
 */
const STATUS_FIELDS = "status,status_code,error_message";

/** 상태를 못 읽을 때 최소한 기다리는 시간 — 스펙 권고 «평균 30초» 근거 */
const BLIND_WAIT_MS = 30_000;

/**
 * 컨테이너 상태 폴링. 스펙이 "처리 대기 권장(평균 30초)" 이라고 안내한다.
 * 인스타(60초)보다 넉넉히 잡는다: 30초가 평균이면 상한은 그보다 위여야 한다.
 *
 * ⚠️ **상태를 못 읽는다고 바로 발행으로 넘어가면 안 된다.**
 * 처음엔 «필드가 없으면 성공» 으로 뒀는데, 그러면 필드 이름이 틀렸을 때 컨테이너 생성 직후
 * 수 ms 만에 발행을 때린다 — Meta 가 아직 image_url 을 크롤링하기도 전이라
 * **이미지가 붙은 스레드 예약은 사실상 전부 실패**한다(2026-08-31 점검 적발).
 * 상태를 못 읽으면 실패로 단정하지도 않되, 스펙 권고치만큼은 **기다린 뒤** 넘어간다.
 */
async function pollContainerStatus(
  containerId: string,
  accessToken: string,
  maxWaitMs = 90_000,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const start = Date.now();
  let sawStatusField = false;
  /* 예산이 권고 대기(30초)보다 짧을 수 있다 — 그때는 예산 안에서 최대한 기다린다.
     상한을 넘겨 기다리면 함수가 죽고 행이 굳는다. */
  const blindWait = Math.min(BLIND_WAIT_MS, Math.max(0, maxWaitMs - 3_000));

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(
      `${GRAPH_THREADS_BASE}/${containerId}?fields=${STATUS_FIELDS}&access_token=${encodeURIComponent(accessToken)}`,
    );
    const json = (await res.json().catch(() => ({}))) as {
      status?: string;
      status_code?: string;
      error_message?: string;
      error?: { message?: string };
    };
    /* 필드 이름이 틀리면 Graph 는 400 을 낸다 — 그걸 «발행 실패» 로 확정하면 안 된다.
       모르는 것이지 실패한 것이 아니므로, 아래 무지(無知) 대기 경로로 떨어뜨린다. */
    if (!res.ok) {
      if (Date.now() - start >= blindWait) return { ok: true };
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    const status = (json.status ?? json.status_code)?.toUpperCase();
    if (status) {
      sawStatusField = true;
      if (status === "FINISHED" || status === "PUBLISHED") return { ok: true };
      if (status === "ERROR" || status === "EXPIRED") {
        return { ok: false, error: json.error_message ?? `container_${status.toLowerCase()}` };
      }
      // IN_PROGRESS
    } else if (Date.now() - start >= blindWait) {
      // 상태를 한 번도 못 읽었지만 권고 시간은 채웠다 — 발행 호출이 진짜 관문이다
      return { ok: true };
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
  /* 상태 필드를 읽고 있었는데 시간이 다 됐으면 진짜 타임아웃이다.
     한 번도 못 읽었다면 위 BLIND_WAIT_MS 에서 이미 나갔어야 하므로 여기 오지 않는다. */
  return { ok: false, error: sawStatusField ? "container_timeout" : "container_status_unreadable" };
}

/**
 * 스레드 게시물 발행.
 * 이미지 0장 = 글 전용(TEXT), 1장 = IMAGE, 2장 이상 = CAROUSEL.
 * 각 단계 실패는 사유와 함께 즉시 중단한다(부분 상태로 남기지 않는다).
 */
export async function publishThreadsPost(params: {
  threadsUserId: string;
  accessToken: string;
  text: string;
  imageUrls: string[];
  /**
   * 컨테이너 처리를 기다릴 상한. **호출측이 자기 실행시간 예산에 맞춰 줄여야 한다** —
   * 크론 함수의 maxDuration 보다 길게 기다리면 플랫폼이 함수를 죽이고,
   * 그러면 예약 행이 'publishing' 인 채로 굳는다(2026-08-31 점검 적발).
   */
  maxWaitMs?: number;
}): Promise<PublishResult> {
  const { threadsUserId, accessToken, text, imageUrls } = params;

  const body = text.trim();
  if (!body && imageUrls.length === 0) {
    return { ok: false, error: "내용이 없습니다." };
  }
  if (body.length > THREADS_TEXT_MAX) {
    return { ok: false, error: `글은 ${THREADS_TEXT_MAX}자까지예요.` };
  }
  if (imageUrls.length > THREADS_CAROUSEL_MAX) {
    return { ok: false, error: `이미지는 ${THREADS_CAROUSEL_MAX}장까지예요.` };
  }

  let containerId: string;

  if (imageUrls.length === 0) {
    const t = await threadsCall<{ id: string }>(`/${threadsUserId}/threads`, accessToken, {
      media_type: "TEXT",
      text: body,
    });
    if (!t.ok) return { ok: false, error: `글 준비 실패: ${t.error}` };
    containerId = t.data.id;
  } else if (imageUrls.length === 1) {
    /* 단일 이미지도 media_type 을 명시한다 — 인스타처럼 image_url 만 주면 Threads 는 거절한다 */
    /* 빈 text 를 실어 보내지 않는다 — 스펙이 빈 값 허용을 말하지 않아,
       거절당하면 「이미지 준비 실패」로만 보여 사용자가 원인을 알 수 없다 */
    const single = await threadsCall<{ id: string }>(`/${threadsUserId}/threads`, accessToken, {
      media_type: "IMAGE",
      image_url: imageUrls[0],
      ...(body ? { text: body } : {}),
    });
    if (!single.ok) return { ok: false, error: `이미지 준비 실패: ${single.error}` };
    containerId = single.data.id;
  } else {
    /* 상수를 실제 관문에 건다 — 선언만 해 두면 «막고 있다»는 착시가 된다.
       지금 분기 구조상 도달하지 않지만, 분기를 바꾸는 날 여기가 잡아 준다. */
    if (imageUrls.length < THREADS_CAROUSEL_MIN) {
      return { ok: false, error: `캐러셀은 이미지가 ${THREADS_CAROUSEL_MIN}장 이상이어야 해요.` };
    }
    const childIds: string[] = [];
    for (const url of imageUrls) {
      /* 아이템 컨테이너에는 text 를 넣지 않는다 — 본문은 캐러셀 컨테이너 하나가 갖는다 */
      const item = await threadsCall<{ id: string }>(`/${threadsUserId}/threads`, accessToken, {
        media_type: "IMAGE",
        image_url: url,
        is_carousel_item: "true",
      });
      if (!item.ok) return { ok: false, error: `슬라이드 준비 실패: ${item.error}` };
      childIds.push(item.data.id);
    }
    const carousel = await threadsCall<{ id: string }>(`/${threadsUserId}/threads`, accessToken, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      ...(body ? { text: body } : {}),
    });
    if (!carousel.ok) return { ok: false, error: `캐러셀 준비 실패: ${carousel.error}` };
    containerId = carousel.data.id;
  }

  const status = await pollContainerStatus(containerId, accessToken, params.maxWaitMs);
  if (!status.ok) return { ok: false, error: `콘텐츠 처리 실패: ${status.error}` };

  const published = await threadsCall<{ id: string }>(`/${threadsUserId}/threads_publish`, accessToken, {
    creation_id: containerId,
  });
  if (!published.ok) return { ok: false, error: `발행 실패: ${published.error}` };

  return { ok: true, mediaId: published.data.id };
}
