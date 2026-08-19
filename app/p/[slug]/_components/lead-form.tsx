"use client";

import { useState } from "react";
import { submitLead } from "../actions";

/*
  문의받기 / 구독신청 폼 — 공개 페이지의 유일한 입력 지점.

  블록 렌더러(서버 컴포넌트)에서 분리한 이유: 폼은 상태·제출이 필요해 클라이언트
  컴포넌트여야 하는데, 렌더러에 섞으면 렌더러 전체가 클라이언트 번들로 끌려간다
  (방문자 페이지라 번들 크기가 곧 이탈률이다).

  색은 전부 테마 변수(--lp-*) — 이 화면은 방문자의 브랜드 화면이다.
*/
const FIELD_LABEL: Record<string, string> = {
  name: "이름",
  email: "이메일",
  phone: "연락처",
  message: "문의 내용",
};

export function LeadForm({
  slug,
  blockId,
  kind,
  data,
}: {
  slug: string;
  blockId: string;
  kind: "contact" | "subscribe";
  data: Record<string, unknown>;
}) {
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
  /* 표시 순서는 **항상 이름·이메일·연락처·내용**이다. 저장된 배열 순서는 사장님이
     체크박스를 누른 순서라, 그대로 쓰면 폼 순서가 페이지마다 제멋대로가 된다. */
  const ORDER = ["name", "email", "phone", "message"];
  const fields =
    kind === "subscribe"
      ? ["email"]
      : Array.isArray(data.fields) && data.fields.length > 0
        ? ORDER.filter((f) => (data.fields as string[]).includes(f))
        : ["name", "email", "message"];

  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitLead({ slug, blockId, kind, ...values });
      if (!res.ok) setError(res.error ?? "접수하지 못했어요.");
      else setDone(true);
    } catch {
      setError("접수하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const box =
    "rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] shadow-[var(--lp-shadow)]";

  if (done) {
    return (
      <div className={`${box} px-4 py-5 text-center`}>
        <p className="text-[15px] font-semibold">
          {kind === "subscribe" ? "구독 신청이 접수됐어요" : "문의가 접수됐어요"}
        </p>
        <p className="mt-1 text-[14px] text-[var(--lp-muted)]">확인 후 연락드릴게요. 고맙습니다!</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`${box} space-y-2.5 p-4`}>
      <p className="text-[15px] font-semibold">
        {s("title") || (kind === "subscribe" ? "새 소식 받기" : "문의하기")}
      </p>
      {s("description") ? (
        <p className="text-[14px] leading-[1.6] text-[var(--lp-muted)]">{s("description")}</p>
      ) : null}

      {fields.map((f) =>
        f === "message" ? (
          <textarea
            key={f}
            value={values[f] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
            placeholder={FIELD_LABEL[f]}
            aria-label={FIELD_LABEL[f]}
            rows={3}
            maxLength={2000}
            className="w-full rounded-[calc(var(--lp-radius)/1.6)] border border-[var(--lp-border)] bg-[var(--lp-bg)] px-3 py-2 text-[15px] text-[var(--lp-fg)] outline-none focus:border-[var(--lp-accent)]"
          />
        ) : (
          <input
            key={f}
            type={f === "email" ? "email" : f === "phone" ? "tel" : "text"}
            value={values[f] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
            placeholder={FIELD_LABEL[f]}
            aria-label={FIELD_LABEL[f]}
            maxLength={160}
            className="h-11 w-full rounded-[calc(var(--lp-radius)/1.6)] border border-[var(--lp-border)] bg-[var(--lp-bg)] px-3 text-[15px] text-[var(--lp-fg)] outline-none focus:border-[var(--lp-accent)]"
          />
        ),
      )}

      {error ? (
        <p role="alert" className="text-[13px] text-[var(--lp-fg)]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="min-h-11 w-full rounded-[var(--lp-radius)] bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--lp-on-accent)] transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {busy ? "보내는 중…" : s("buttonLabel") || (kind === "subscribe" ? "구독하기" : "보내기")}
      </button>
    </form>
  );
}
