import { CheckCircle2, HelpCircle, SearchX } from "lucide-react";
import { FinchLogo } from "@/components/logo";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  데이터 삭제 요청 상태 확인 — 인스타그램·스레드가 같은 화면을 쓴다.

  ⚠️ 예전엔 **조회 없이** «데이터 삭제가 완료되었어요» 를 무조건 띄웠다.
  확인 코드를 아무 문자열로 넣어도, 아예 없어도 완료 화면이 나왔다(2026-08-31 적발).
  Meta 가 요구하는 건 «사용자가 자기 요청의 상태를 확인할 수 있는 페이지» 이고,
  이건 심사관이 실제로 열어 보는 URL 이다 — 사실이 아닌 것을 확언하면 안 된다.

  이제 0076 의 data_deletion_requests 를 confirmation_code 로 조회한다.
  익명 SELECT 정책을 열지 않고 **service_role 로 서버에서만** 조회한다 —
  코드를 무차별 대입해 남의 요청을 확인하는 길을 만들지 않기 위해서다.
*/

const CHANNEL_LABEL = { instagram: "Instagram", threads: "Threads" } as const;

type Channel = keyof typeof CHANNEL_LABEL;

type Status =
  | { kind: "done"; deletedRows: number; at: string }
  | { kind: "not_found" }
  | { kind: "no_code" }
  /** 0076 미적용이거나 DB 조회 실패 — «없음» 으로 단정하지 않는다 */
  | { kind: "unknown" };

async function lookup(code: string | undefined, channel: Channel): Promise<Status> {
  if (!code) return { kind: "no_code" };
  const admin = createAdminClient();
  if (!admin) return { kind: "unknown" };

  const { data, error } = await admin
    .from("data_deletion_requests")
    .select("deleted_rows, created_at")
    .eq("confirmation_code", code)
    .eq("channel", channel)
    .maybeSingle();

  if (error) {
    console.error("[deletion-status] 조회 실패:", error.message);
    return { kind: "unknown" };
  }
  if (!data) return { kind: "not_found" };
  return {
    kind: "done",
    deletedRows: (data as { deleted_rows: number }).deleted_rows ?? 0,
    at: (data as { created_at: string }).created_at,
  };
}

function formatKst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

export async function DeletionStatus({ channel, code }: { channel: Channel; code?: string }) {
  const status = await lookup(code, channel);
  const label = CHANNEL_LABEL[channel];

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <FinchLogo />

      {status.kind === "done" ? (
        <>
          <CheckCircle2 className="size-10 text-positive" aria-hidden />
          <h1 className="text-xl font-bold">데이터 삭제가 완료되었어요</h1>
          <p className="text-[14px] leading-relaxed text-fg-sub">
            {status.deletedRows > 0
              ? `${label} 연동 해제에 따라 핀치에 저장돼 있던 관련 계정 정보(액세스 토큰 포함)가 삭제되었습니다.`
              : `요청을 접수했을 때 핀치에 남아 있던 ${label} 계정 정보가 없었습니다. 지금도 저장된 정보는 없습니다.`}
          </p>
          <p className="text-[12px] text-fg-sub">처리 시각: {formatKst(status.at)}</p>
        </>
      ) : status.kind === "not_found" ? (
        <>
          <SearchX className="size-10 text-fg-faint" aria-hidden />
          <h1 className="text-xl font-bold">확인 코드를 찾을 수 없어요</h1>
          <p className="text-[14px] leading-relaxed text-fg-sub">
            주소가 잘못됐거나 이 코드로 접수된 요청이 없습니다. {label} 앱 설정에서 받은 링크를 그대로 열어
            주세요.
          </p>
        </>
      ) : status.kind === "no_code" ? (
        <>
          <HelpCircle className="size-10 text-fg-faint" aria-hidden />
          <h1 className="text-xl font-bold">확인 코드가 필요해요</h1>
          <p className="text-[14px] leading-relaxed text-fg-sub">
            {label} 앱 설정에서 데이터 삭제를 요청하시면 확인 코드가 담긴 링크를 받게 됩니다. 그 링크로 들어오시면
            처리 상태를 보여드려요.
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
