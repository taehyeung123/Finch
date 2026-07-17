/**
 * Meta(Instagram) Graph API 어댑터 — 자동 DM 발송용.
 *
 * 모든 Meta 호출은 반드시 이 파일을 거친다 (엔드포인트/버전 변경 시 한 파일 마이그레이션 —
 * Meta는 Basic Display API를 90일 통보로 종료한 전례가 있다, docs/AUTO_DM_COST_RISK.md 2-7).
 *
 * 규칙 (docs/AUTO_DM_COST_RISK.md):
 * - Private Reply는 댓글당 1회·7일 이내만 — 재시도 여지가 없으므로 호출 전 멱등 예약(reserve_dm_send) 필수.
 * - 서버 전용: 액세스 토큰을 클라이언트로 절대 노출하지 않는다.
 */

/**
 * 그래프 API 버전 고정 — 업그레이드는 변경로그 확인 후 이 상수만 수정.
 * 핀치는 "Instagram API with Instagram Login" 경로를 쓰므로 호스트는 graph.instagram.com이다
 * (docs/REAL_API_SPEC.md 1절). Instagram Login으로 발급한 토큰은 graph.facebook.com에서 동작하지
 * 않으므로 읽기·메시징 전부 이 베이스를 공유해야 한다.
 */
export const GRAPH_VERSION = "v25.0";
export const GRAPH_INSTAGRAM_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;
const GRAPH_BASE = GRAPH_INSTAGRAM_BASE;

/** 발송 결과 — dm_sends.status 값과 1:1 매핑 */
export type SendOutcome =
  | { ok: true; igMessageId: string | null }
  | { ok: false; status: "failed_unavailable" | "failed_permission" | "failed_window_expired" | "skipped_comment_gone"; error: string; retryable: false }
  | { ok: false; status: "pending"; error: string; retryable: true }; // 레이트리밋 등 일시 오류 — 상태 유지 후 재시도

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number };
}

/**
 * Meta 에러 코드 → 발송 상태 매핑.
 * 551: 수신 불가(프라이버시/차단) · 100+33: 대상 없음(댓글 삭제) · 190: 토큰 무효
 * 613/4/17/32/80002: 레이트리밋(일시) · 1/2/5xx: 일시 서버 오류(재시도)
 * 10 + 2534022(IG)/2018278(Messenger): 메시징 창 밖
 */
function mapGraphError(
  code: number | undefined,
  subcode: number | undefined,
  message: string,
  httpStatus: number,
): Exclude<SendOutcome, { ok: true }> {
  if (code === 551) return { ok: false, status: "failed_unavailable", error: message, retryable: false };
  if (code === 100) {
    // 100은 범용 invalid-parameter — 대상 소멸(subcode 33)만 댓글 삭제로 분류, 나머지는 설정 오류
    if (subcode === 33 || /does not exist|cannot be loaded/i.test(message))
      return { ok: false, status: "skipped_comment_gone", error: message, retryable: false };
    return { ok: false, status: "failed_permission", error: `invalid_parameter: ${message}`, retryable: false };
  }
  if (code === 190) return { ok: false, status: "failed_permission", error: `token_invalid: ${message}`, retryable: false };
  if (code === 10) {
    if (subcode === 2534022 || subcode === 2018278 || /outside of allowed window/i.test(message))
      return { ok: false, status: "failed_window_expired", error: message, retryable: false };
    return { ok: false, status: "failed_permission", error: message, retryable: false };
  }
  if (code === 613 || code === 4 || code === 17 || code === 32 || code === 80002)
    return { ok: false, status: "pending", error: `rate_limited: ${message}`, retryable: true };
  // 일시 서버 오류 — 7일 창 안에서 재시도 여지를 남긴다 (1회 발송 기회를 태우지 않음)
  if (code === 1 || code === 2 || (code === undefined && httpStatus >= 500))
    return { ok: false, status: "pending", error: `transient_server: ${message}`, retryable: true };
  return { ok: false, status: "failed_permission", error: `graph_error_${code ?? "unknown"}: ${message}`, retryable: false };
}

async function graphPost(path: string, accessToken: string, body: Record<string, unknown>): Promise<{ res: Response; json: GraphErrorBody & Record<string, unknown> }> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as GraphErrorBody & Record<string, unknown>;
  return { res, json };
}

/**
 * Private Reply — 댓글에 대한 1회성 비공개 DM.
 * recipient를 comment_id로 지정하면 Meta가 댓글 작성자에게 DM을 보낸다.
 * buttonLabel/buttonUrl이 있으면 CTA 버튼 템플릿으로 전송한다.
 */
export async function sendPrivateReply(params: {
  igUserId: string; // 연동된 IG 비즈니스 계정 id
  commentId: string;
  message: string;
  buttonLabel?: string | null;
  buttonUrl?: string | null;
  accessToken: string;
}): Promise<SendOutcome> {
  const { igUserId, commentId, message, buttonLabel, buttonUrl, accessToken } = params;

  const messagePayload =
    buttonLabel && buttonUrl
      ? {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: message,
              buttons: [{ type: "web_url", url: buttonUrl, title: buttonLabel.slice(0, 20) }],
            },
          },
        }
      : { text: message };

  try {
    const { res, json } = await graphPost(`/${igUserId}/messages`, accessToken, {
      recipient: { comment_id: commentId },
      message: messagePayload,
    });
    if (res.ok) {
      return { ok: true, igMessageId: typeof json.message_id === "string" ? json.message_id : null };
    }
    return mapGraphError(json.error?.code, json.error?.error_subcode, json.error?.message ?? `http_${res.status}`, res.status);
  } catch (e) {
    // 네트워크 오류 — 일시 실패로 두고 재시도 여지 유지 (7일 창 내)
    return { ok: false, status: "pending", error: `network: ${e instanceof Error ? e.message : String(e)}`, retryable: true };
  }
}

/** 댓글 공개 답글 — Private Reply 1회 제한을 보완하는 부가 동작. 실패해도 DM 결과에 영향 없음. */
export async function replyToComment(params: {
  commentId: string;
  message: string;
  accessToken: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { res, json } = await graphPost(`/${params.commentId}/replies`, params.accessToken, {
      message: params.message,
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: json.error?.message ?? `http_${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
