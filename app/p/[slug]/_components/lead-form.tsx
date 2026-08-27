"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { submitLead } from "../actions";
import type { LpText } from "@/lib/links/i18n";

/*
  문의받기 / 구독신청 폼 — 공개 페이지의 유일한 입력 지점.

  블록 렌더러(서버 컴포넌트)에서 분리한 이유: 폼은 상태·제출이 필요해 클라이언트
  컴포넌트여야 하는데, 렌더러에 섞으면 렌더러 전체가 클라이언트 번들로 끌려간다
  (방문자 페이지라 번들 크기가 곧 이탈률이다).

  색은 전부 테마 변수(--lp-*) — 이 화면은 방문자의 브랜드 화면이다.
*/
export function LeadForm({
  slug,
  blockId,
  kind,
  data,
  isDemo = false,
  t,
  errors,
}: {
  slug: string;
  blockId: string;
  kind: "contact" | "subscribe";
  data: Record<string, unknown>;
  /** 예시 페이지인가 — 제출이 저장되지 않는다는 걸 **채워 넣기 전에** 알린다 */
  isDemo?: boolean;
  /** 페이지 언어 문구(0058) — lib/links/i18n */
  t: LpText["lead"];
  /** 서버 실패 코드 → 문구(감사 C8) */
  errors: LpText["errors"];
}) {
  const FIELD_LABEL: Record<string, string> = { name: t.name, email: t.email, phone: t.phone, message: t.message };
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
  /* 데모에서 「보내기」를 누른 표시 — 붉은 오류 대신 상시 칩을 잠깐 도드라지게 한다 */
  const [demoPing, setDemoPing] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    /* 데모는 **버튼을 죽이지 않는다** — 회색 비활성 버튼이 샘플 페이지를 고장난 화면으로 보이게 했다.
       방명록과 같은 규칙으로 눌렀을 때 안내한다(2026-08-24 비평) */
    if (isDemo) {
      /* 예전엔 여기서 setError(t.demo) 를 했다 — 폼 아래 상시 칩이 이미 **같은 문장**을 들고 있어서
         누르면 같은 말이 두 번, 그중 하나는 붉은 «오류» 띠로 떴다(실측). 예시라서 안 보내지는 것은
         고장이 아니므로 붉은 띠로 말하지 않는다. 칩을 잠깐 도드라지게 해 눌린 것만 알린다. */
      setDemoPing(true);
      window.setTimeout(() => setDemoPing(false), 1200);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await submitLead({ slug, blockId, kind, ...values });
      if (!res.ok) setError(errors[res.code] ?? t.fail);
      else setDone(true);
    } catch {
      setError(t.failRetry);
    } finally {
      setBusy(false);
    }
  }

  const box =
    "rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] shadow-[var(--lp-shadow)]";

  if (done) {
    return (
      /* 성공 상태에 아이콘도 live region 도 없었다 — 스크린리더는 아무 일도 안 일어난 것으로 읽었다 */
      <div role="status" aria-live="polite" className={`${box} px-4 py-6 text-center`}>
        <span
          className="mx-auto mb-2 flex size-11 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--lp-chip-bg)", color: "var(--lp-chip-ink)" }}
          aria-hidden
        >
          <Check className="size-5" />
        </span>
        <p className="text-[15px] font-semibold">
          {kind === "subscribe" ? t.doneSubscribe : t.doneContact}
        </p>
        <p className="mt-1 text-[14px] text-[var(--lp-muted)]">{t.doneNote}</p>
      </div>
    );
  }

  return (
    /* 균일 간격 하나로 쌓여 제목·필드·버튼의 위계가 없던 것 → 제목 묶음 / 필드 묶음 / 제출을 나눈다(2026-08-24 비평) */
    <form onSubmit={submit} className={`${box} space-y-4 p-4`}>
      <div className="space-y-1">
        <p className="text-[15px] font-semibold">
          {s("title") || (kind === "subscribe" ? t.titleSubscribe : t.titleContact)}
        </p>
        {s("description") ? (
          <p className="text-[14px] leading-[1.6] text-[var(--lp-muted)]">{s("description")}</p>
        ) : null}
      </div>

      <div className="space-y-2">
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
            /* 포커스 표시가 테두리 색 하나뿐이라 어느 칸인지 안 보였다 → 링을 함께(2026-08-24 비평) */
            /* 입력칸 면은 지면색이 아니라 전용 토큰 — 어두운 테마에서 칸이 묻혔다(themes.ts --lp-input-bg) */
            className="w-full rounded-[calc(var(--lp-radius)/1.6)] border border-[var(--lp-border)] bg-[var(--lp-input-bg)] px-3 py-2 text-[15px] text-[var(--lp-fg)] outline-none placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-accent)] focus:ring-2 focus:ring-[var(--lp-accent)]/25"
          />
        ) : (
          <input
            key={f}
            type={f === "email" ? "email" : f === "phone" ? "tel" : "text"}
            value={values[f] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
            placeholder={FIELD_LABEL[f]}
            aria-label={FIELD_LABEL[f]}
            /* 구독은 이메일 하나뿐 — 빈 제출은 브라우저의 현지어 안내로 먼저 막는다(감사 C8) */
            required={kind === "subscribe" || (fields.length === 1 && f !== "name")}
            maxLength={160}
            className="h-12 w-full rounded-[calc(var(--lp-radius)/1.6)] border border-[var(--lp-border)] bg-[var(--lp-input-bg)] px-3 text-[15px] text-[var(--lp-fg)] outline-none placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-accent)] focus:ring-2 focus:ring-[var(--lp-accent)]/25"
          />
        ),
      )}

      </div>

      {error ? (
        /* 본문과 똑같이 생겨서 실패한 줄 몰랐다 → 붉은 띠로(2026-08-24 비평) */
        <p
          role="alert"
          className="rounded-[calc(var(--lp-radius)/1.6)] px-3 py-2 text-[14px] font-medium"
          style={{ backgroundColor: "color-mix(in srgb, var(--lp-danger) 12%, transparent)", color: "var(--lp-danger-ink)" }}
        >
          {error}
        </p>
      ) : null}

      {isDemo ? (
        <p
          className={`trans-state rounded-[calc(var(--lp-radius)/1.6)] px-3 py-2 text-[13px] leading-[1.6] ${
            demoPing ? "ring-2 ring-[var(--lp-accent)]" : ""
          }`}
          style={{ backgroundColor: "var(--lp-chip-bg)", color: "var(--lp-chip-ink)" }}
          aria-live="polite"
        >
          {t.demo}
        </p>
      ) : null}

      {/* 개인정보 수집·이용 동의(2026-08-27, 쏘넷 점검 반영) — required 라 미체크 제출은 브라우저가 먼저 막는다.
          항목 열거는 실제 폼 구성(fields)에서 파생하고 문구는 페이지 언어(i18n)를 따른다 — 고정 리터럴이면
          구독 폼(이메일만 받음)에 «이름·연락처»를 수집한다는 허위 고지가 된다. */}
      <label className="flex items-start gap-2 text-[13px] leading-[1.6] text-[var(--lp-muted)]">
        <input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-[var(--lp-accent)]" />
        <span>
          {t.consent}{" "}
          <span className="opacity-80">
            {t.consentSpec
              .replace("{items}", fields.map((f) => FIELD_LABEL[f]).join(" · "))
              .replace("{purpose}", kind === "subscribe" ? t.consentPurposeSubscribe : t.consentPurposeContact)}
          </span>
        </span>
      </label>

      <button
        type="submit"
        disabled={busy}
        /* 제출이 페이지에서 가장 작은 버튼이었다 — 본문 링크 버튼과 같은 56px 로(2026-08-24 비평) */
        className="lp-btn min-h-[56px] w-full rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] px-5 text-[15px] font-semibold text-[var(--lp-on-accent)] shadow-[var(--lp-shadow)] disabled:opacity-50"
      >
        {busy ? t.sending : s("buttonLabel") || (kind === "subscribe" ? t.subscribe : t.send)}
      </button>
    </form>
  );
}
