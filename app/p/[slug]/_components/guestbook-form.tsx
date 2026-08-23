"use client";

import { useState, useTransition } from "react";
import { submitGuestbook } from "../actions";
import type { LpText } from "@/lib/links/i18n";

/*
  방명록 제출 폼 — 공개 페이지(리틀리 흡수 4단계). 글 목록은 서버가 그린다(block-renderer).
  색은 테마 변수(--lp-*)만. 보내면 페이지를 새로고침해 방금 쓴 글이 목록에 보인다.
*/
export function GuestbookForm({ slug, blockId, placeholder, isDemo, t, errors }: { slug: string; blockId: string; placeholder: string; isDemo: boolean; t: LpText["guestbook"]; errors: LpText["errors"] }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = "w-full rounded-[var(--lp-radius)] border border-[var(--lp-border)] bg-[var(--lp-card)] px-3 py-2.5 text-[14px] text-[var(--lp-fg)] placeholder:text-[var(--lp-muted)] focus:border-[var(--lp-accent)] focus:outline-none";

  if (done) return <p className="text-center text-[14px] text-[var(--lp-muted)]">{t.thanks}</p>;
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
            setDone(true);
            window.location.reload();
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
        <p role="alert" className="text-[13px] text-[var(--lp-fg)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="flex min-h-[44px] w-full items-center justify-center rounded-[var(--lp-radius-btn)] bg-[var(--lp-accent)] text-[14px] font-semibold text-[var(--lp-on-accent)] transition-opacity hover:opacity-85 disabled:opacity-60"
      >
        {pending ? t.sending : t.send}
      </button>
    </form>
  );
}
