"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { INQUIRY_TYPES, submitInquiry, type InquiryType } from "../actions";

/** 문의 접수 폼 — 성공하면 목록이 갱신되도록 새로고침한다 */
export function InquiryForm() {
  const [type, setType] = useState<InquiryType>("기타");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const res = await submitInquiry(formData);
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form
      action={onSubmit}
      className="flex flex-col gap-4"
      onChange={() => {
        if (done) setDone(false);
      }}
    >
      <input type="hidden" name="type" value={type} />

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-fg-sub">문의 유형</span>
        <div className="flex flex-wrap gap-1.5">
          {INQUIRY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={cn(
                "rounded-chip px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                type === t
                  ? "bg-primary text-on-primary"
                  : "bg-overlay text-fg-sub border border-line hover:border-line-strong hover:text-fg",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-fg-sub">제목</span>
        <input
          name="subject"
          required
          minLength={2}
          maxLength={120}
          placeholder="무엇이 궁금하신가요?"
          className="h-10 rounded-card border border-line bg-body px-3 text-[14px] placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-fg-sub">내용</span>
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={7}
          placeholder="상황을 자세히 적어주시면 더 빠르게 도와드릴 수 있어요."
          className="resize-y rounded-card border border-line bg-body px-3 py-2.5 text-[14px] leading-relaxed placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />
      </label>

      {error ? <p className="text-[13px] text-negative">{error}</p> : null}
      {done ? (
        <p className="text-[13px] text-positive">
          문의가 접수됐습니다. 답변이 등록되면 아래 목록에서 확인하실 수 있어요.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "접수 중" : "문의 접수"}
        </Button>
        <span className="text-[12px] text-fg-faint">
          답변은 보통 영업일 기준 1~2일 안에 등록됩니다.
        </span>
      </div>
    </form>
  );
}
