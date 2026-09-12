import { AlertTriangle, CheckCircle2, Clock3, HelpCircle, SearchX } from "lucide-react";
import { FinchLogo } from "@/components/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumnError } from "@/lib/publish-rules";
import { isMissingTableError } from "@/lib/supabase/errors";
import { BUSINESS } from "@/lib/legal/business";

/*
  데이터 삭제 요청 상태 확인 — 인스타그램·스레드·메타 광고가 같은 화면을 쓴다.

  ⚠️ 예전엔 **조회 없이** «데이터 삭제가 완료되었어요» 를 무조건 띄웠다.
  확인 코드를 아무 문자열로 넣어도, 아예 없어도 완료 화면이 나왔다(2026-08-31 적발).
  Meta 가 요구하는 건 «사용자가 자기 요청의 상태를 확인할 수 있는 페이지» 이고,
  이건 심사관이 실제로 열어 보는 URL 이다 — 사실이 아닌 것을 확언하면 안 된다.

  이제 0076 의 data_deletion_requests 를 confirmation_code 로 조회한다.
  익명 SELECT 정책을 열지 않고 **service_role 로 서버에서만** 조회한다 —
  코드를 무차별 대입해 남의 요청을 확인하는 길을 만들지 않기 위해서다.

  2026-09-12(방침 제9조①4 «남은 정보도 요청일부터 10일 안에»): 연결·토큰은 요청 순간 지우지만 남은 정보(자동 DM 기록·알림 등)는
  후속 삭제(data_deletion_followups, 0095)가 끝나야 없어진다. 그래서 확언을 둘로 나눴다:
   · 후속 삭제가 남아 있으면 «완료»라 하지 않고 기한(요청일 + 10일)을 보여 준다.
   · 연결이 이미 없던 요청은 «지금도 저장된 정보는 없다»고 확언하지 않는다 — 설정에서 먼저 해제한 경우 규칙·발행 글이 남아 있을 수 있다.
  확인 코드는 주소(?id=)에 실리므로 이 화면은 이용 통계를 수집하지 않는다(components/analytics/google-analytics.tsx ③).
*/

const CHANNEL_LABEL = { instagram: "Instagram", threads: "Threads", meta_ads: "Meta 광고" } as const;

type Channel = keyof typeof CHANNEL_LABEL;

/** 사용자가 삭제를 요청한 «자리» — 채널마다 메뉴가 다르다. 안내가 틀리면 찾아갈 수가 없다. */
const REQUEST_PLACE: Record<Channel, string> = {
  instagram: "Instagram 앱 설정",
  threads: "Threads 앱 설정",
  meta_ads: "페이스북 설정의 비즈니스 통합",
};

/** 남은 정보 삭제 기한 — 방침 제9조①4 */
const FOLLOWUP_DAYS = 10;
const DAY = 86_400_000;

const MAIL = BUSINESS.privacyEmail;

/** 후속 삭제 상태 — pending: 남은 정보를 지울 회원이 남아 있다 · none: 남은 대상 없음 · unknown: 조회 불가(0095 미적용 등) */
type Followup = { kind: "pending"; due: string } | { kind: "none" } | { kind: "unknown" };

type Status =
  | { kind: "done"; deletedRows: number; at: string; followup: Followup }
  /** 삭제 쿼리가 실패했다 — «지울 것이 없었다»(deleted_rows=0)와 절대 같은 화면을 쓰면 안 된다 */
  | { kind: "failed"; at: string }
  | { kind: "not_found" }
  | { kind: "no_code" }
  /** 0076 미적용이거나 DB 조회 실패 — «없음» 으로 단정하지 않는다 */
  | { kind: "unknown" };

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function lookupFollowup(admin: Admin, code: string, requestedAt: string): Promise<Followup> {
  const { count, error } = await admin
    .from("data_deletion_followups")
    .select("id", { count: "exact", head: true })
    .eq("confirmation_code", code);
  if (error) {
    if (!isMissingTableError(error)) console.error("[deletion-status] 후속 삭제 조회 실패:", error.message);
    return { kind: "unknown" };
  }
  if ((count ?? 0) === 0) return { kind: "none" };
  return { kind: "pending", due: new Date(new Date(requestedAt).getTime() + FOLLOWUP_DAYS * DAY).toISOString() };
}

async function lookup(code: string | undefined, channel: Channel): Promise<Status> {
  if (!code) return { kind: "no_code" };
  const admin = createAdminClient();
  if (!admin) return { kind: "unknown" };

  let { data, error } = await admin
    .from("data_deletion_requests")
    .select("deleted_rows, created_at, status")
    .eq("confirmation_code", code)
    .eq("channel", channel)
    .maybeSingle();

  /* 0077 미적용 DB 에는 status 컬럼이 없다 — 조회를 통째로 실패시키지 않고 예전 모양으로 재시도한다 */
  if (error && isMissingColumnError(error, /status/i)) {
    ({ data, error } = await admin
      .from("data_deletion_requests")
      .select("deleted_rows, created_at")
      .eq("confirmation_code", code)
      .eq("channel", channel)
      .maybeSingle());
  }

  if (error) {
    console.error("[deletion-status] 조회 실패:", error.message);
    return { kind: "unknown" };
  }
  if (!data) return { kind: "not_found" };
  const row = data as { deleted_rows?: number; created_at: string; status?: string };
  if (row.status === "failed") return { kind: "failed", at: row.created_at };
  return {
    kind: "done",
    deletedRows: row.deleted_rows ?? 0,
    at: row.created_at,
    followup: await lookupFollowup(admin, code, row.created_at),
  };
}

function formatKst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

function formatKstDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(iso));
}

export async function DeletionStatus({ channel, code }: { channel: Channel; code?: string }) {
  const status = await lookup(code, channel);
  const label = CHANNEL_LABEL[channel];

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <FinchLogo />

      {status.kind === "done" && status.deletedRows > 0 && status.followup.kind === "pending" ? (
        <>
          <Clock3 className="size-10 text-positive" aria-hidden />
          <h1 className="text-xl font-bold">연동 정보를 삭제했어요</h1>
          <p className="text-[14px] leading-relaxed text-fg-sub">
            {label} 연동 해제에 따라 핀치에 저장돼 있던 계정 연결 정보(액세스 토큰 포함)를 삭제했습니다. 그 계정과 관련해 남아 있는
            정보(자동 DM 기록·알림 등)는 {formatKstDate(status.followup.due)}까지 삭제합니다.
          </p>
          <p className="text-[12px] text-fg-sub">접수 시각: {formatKst(status.at)}</p>
        </>
      ) : status.kind === "done" && status.deletedRows > 0 ? (
        <>
          <CheckCircle2 className="size-10 text-positive" aria-hidden />
          <h1 className="text-xl font-bold">데이터 삭제가 완료되었어요</h1>
          <p className="text-[14px] leading-relaxed text-fg-sub">
            {label} 연동 해제에 따라 핀치에 저장돼 있던 관련 계정 정보(액세스 토큰 포함)가 삭제되었습니다.
          </p>
          <p className="text-[12px] text-fg-sub">처리 시각: {formatKst(status.at)}</p>
        </>
      ) : status.kind === "done" ? (
        /* 요청 순간 연결된 계정이 없었다 — 연동한 적이 없거나, 핀치 설정에서 먼저 해제한 경우.
           뒤의 경우 규칙·발행 글이 남아 있을 수 있어 «지금도 없다»고 확언하지 않는다(2026-09-12 점검) */
        <>
          <CheckCircle2 className="size-10 text-positive" aria-hidden />
          <h1 className="text-xl font-bold">삭제 요청을 접수했어요</h1>
          <p className="text-[14px] leading-relaxed text-fg-sub">
            요청을 받았을 때 핀치에 연결된 {label} 계정은 없었습니다(이미 연결을 해제했거나 연동한 적이 없는 경우).
            {status.followup.kind === "pending"
              ? ` 이전에 연결했을 때 남은 정보는 ${formatKstDate(status.followup.due)}까지 삭제합니다.`
              : ` 그 계정과 관련해 남은 정보가 있다고 생각되면 이 확인 코드와 함께 ${MAIL}로 알려 주세요. 확인한 뒤 지체 없이 삭제합니다.`}
          </p>
          <p className="text-[12px] text-fg-sub">접수 시각: {formatKst(status.at)}</p>
        </>
      ) : status.kind === "failed" ? (
        <>
          <AlertTriangle className="size-10 text-warning" aria-hidden />
          <h1 className="text-xl font-bold">삭제를 마치지 못했어요</h1>
          <p className="text-[14px] leading-relaxed text-fg-sub">
            요청은 접수됐지만 처리 중 문제가 생겨 {label} 관련 정보가 아직 삭제되지 않았을 수 있습니다. 확인 후
            처리하겠습니다. 아래 확인 코드와 함께 고객센터로 알려 주시면 더 빠르게 확인해 드릴게요.
          </p>
          <p className="text-[12px] text-fg-sub">접수 시각: {formatKst(status.at)}</p>
        </>
      ) : status.kind === "not_found" ? (
        <>
          <SearchX className="size-10 text-fg-faint" aria-hidden />
          <h1 className="text-xl font-bold">확인 코드를 찾을 수 없어요</h1>
          <p className="text-[14px] leading-relaxed text-fg-sub">
            주소가 잘못됐거나 이 코드로 접수된 요청이 없습니다. {REQUEST_PLACE[channel]}에서 받은 링크를 그대로
            열어 주세요. 삭제 요청 기록은 요청일부터 1년 동안 보관한 뒤 파기하므로, 그보다 오래된 코드는 조회되지 않습니다.
          </p>
        </>
      ) : status.kind === "no_code" ? (
        <>
          <HelpCircle className="size-10 text-fg-faint" aria-hidden />
          <h1 className="text-xl font-bold">확인 코드가 필요해요</h1>
          <p className="text-[14px] leading-relaxed text-fg-sub">
            {REQUEST_PLACE[channel]}에서 데이터 삭제를 요청하시면 확인 코드가 담긴 링크를 받게 됩니다. 그 링크로
            들어오시면 처리 상태를 보여드려요.
          </p>
        </>
      ) : (
        <>
          <HelpCircle className="size-10 text-fg-faint" aria-hidden />
          <h1 className="text-xl font-bold">지금은 확인할 수 없어요</h1>
          <p className="text-[14px] leading-relaxed text-fg-sub">
            일시적인 문제로 처리 상태를 조회하지 못했습니다. 잠시 후 다시 열어 주세요.
          </p>
        </>
      )}

      {code ? <p className="text-[12px] text-fg-sub">확인 코드: {code}</p> : null}
    </div>
  );
}
