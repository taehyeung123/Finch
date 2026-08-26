"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitGuestbook } from "../actions";
import type { LpText } from "@/lib/links/i18n";

/*
  방명록 제출 폼 — 공개 페이지(리틀리 흡수 4단계). 글 목록은 서버가 그린다(block-renderer).
  색은 테마 변수(--lp-*)만. 보내면 성공 상태를 유지한 채 라우터 새로고침으로 목록만 갱신한다(전체 리로드는 스크롤·포커스를 잃는다).
*/
export function GuestbookForm({ slug, blockId, placeholder, isDemo, t, errors }: { slug: string; blockId: string; placeholder: string; isDemo: boolean; t: LpText["guestbook"]; errors: LpText["errors"] }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* 카드색 그대로면 칸이 카드에 묻힌다 — 입력칸 전용 면(themes.ts --lp-input-bg) */
  const field = "w-full rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-input-bg)] px-3 py-2.5 text-[14px] text-[var(--lp-fg)] placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-accent)] focus:outline-none";

  if (done)
    return (
      <p
        role="status"
        aria-live="polite"
        className="rounded-[calc(var(--lp-radius)/1.6)] px-3 py-2.5 text-center text-[14px] font-medium"
        style={{ backgroundColor: "var(--lp-chip-bg)", color: "var(--lp-chip-ink)" }}
      >
        {t.thanks}
      </p>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isDemo) {
          setError(t.demo);
          return;
        }
        setError(null);
        start(async () => {
          const r = await submitGuestbook({ slug, blockId, name, message });
          if (!r.ok) setError(errors[r.code] ?? t.fail);
          else {
            /* 새로고침으로 성공 상태를 날려 버리던 것 — 방금 남긴 글은 승인 뒤 보인다는 걸 말한다.
               목록 갱신은 라우터 새로고침으로(전체 리로드는 스크롤·포커스를 전부 잃는다). 2026-08-24 비평 */
            setDone(true);
            setName("");
            setMessage("");
            router.refresh();
          }
        });
      }}
      className="space-y-2"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t.name} aria-label={t.name} required className={field} />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder={placeholder}
        aria-label={t.body}
        required
        className={`${field} resize-none`}
      />
      {error ? (
        /* 문의 폼과 같은 형태의 실패 안내 — 본문과 똑같이 생겨서 실패가 안 읽히던 것(2026-08-24 비평) */
        <p
          role="alert"
          className="rounded-[calc(var(--lp-radius)/1.6)] px-3 py-2 text-[14px] font-medium"
          style={{ backgroundColor: "color-mix(in srgb, var(--lp-danger) 12%, transparent)", color: "var(--lp-danger-ink)" }}
        >
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        /* 문의 폼 제출과 같은 높이·같은 위계로(2026-08-24 비평 — 폼마다 제출 크기가 달랐다) */
        className="lp-btn flex min-h-[56px] w-full items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] text-[15px] font-semibold text-[var(--lp-on-accent)] shadow-[var(--lp-shadow)] disabled:opacity-60"
      >
        {pending ? t.sending : t.send}
      </button>
    </form>
  );
}
