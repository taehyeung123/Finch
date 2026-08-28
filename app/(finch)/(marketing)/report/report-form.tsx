"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { submitPageReport } from "./actions";
import { REPORT_REASONS } from "./reasons";

/* 신고 폼 — 로그인 없이 제출한다. 허니팟(웹사이트 칸)은 시각적으로 숨기되
   display:none 은 쓰지 않는다(단순 봇이 display 검사까지 하진 않지만, 화면 밖 배치가 관례). */
export function ReportForm({ prefill }: { prefill: string }) {
  const [page, setPage] = useState(prefill ? `finch.ai.kr/${prefill}` : "");
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // 허니팟
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!reason) {
      setError("신고 사유를 선택해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await submitPageReport({ page, reason, detail, contact, website });
      if (res.ok) setDone(true);
      else setError(res.error);
    } catch {
      setError("접수하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status" aria-live="polite" className="card-face mt-6 px-5 py-8 text-center">
        <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-tint-green text-tint-green-ink" aria-hidden>
          <Check className="size-5" />
        </span>
        <p className="text-[17px] font-semibold">신고가 접수됐어요</p>
        <p className="mt-1.5 text-[14px] leading-[1.7] text-fg-sub">
          확인 후 필요한 조치를 하겠습니다. 연락처를 남기셨다면 처리 결과를 알려드릴게요.
        </p>
      </div>
    );
  }

  const input =
    "trans-state w-full rounded-card border border-line bg-body px-3 py-2.5 text-[15px] text-fg outline-none placeholder:text-fg-faint focus:border-primary";

  return (
    <form onSubmit={onSubmit} className="card-face mt-6 space-y-4 p-5">
      <label className="block text-[12px] font-semibold text-fg-sub">
        신고할 페이지 주소
        <input
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="finch.ai.kr/아이디"
          required
          maxLength={160}
          className={`mt-1.5 ${input}`}
        />
      </label>

      <div>
        <p className="text-[12px] font-semibold text-fg-sub">사유</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="신고 사유">
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={cn(
                "trans-state rounded-chip border px-3 py-1.5 text-[14px]",
                reason === r ? "border-fg bg-fg font-semibold text-body" : "border-line text-fg-sub hover:border-fg hover:text-fg",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <label className="block text-[12px] font-semibold text-fg-sub">
        자세한 내용 <span className="font-normal text-fg-faint">(선택 — 어떤 부분이 문제인지 적어 주시면 빨라져요)</span>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={4}
          maxLength={2000}
          className={`mt-1.5 ${input}`}
        />
      </label>

      <label className="block text-[12px] font-semibold text-fg-sub">
        회신 받을 연락처 <span className="font-normal text-fg-faint">(선택)</span>
        <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="이메일 또는 전화번호" maxLength={160} className={`mt-1.5 ${input}`} />
      </label>

      {/* 허니팟 — 사람은 못 보고 봇은 채운다 */}
      <label className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden>
        웹사이트
        <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
      </label>

      {error ? (
        <p role="alert" className="rounded-card bg-tint-coral px-3 py-2 text-[14px] font-medium text-tint-coral-ink">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "접수하는 중…" : "신고 접수"}
      </Button>
      <p className="text-[12px] leading-[1.6] text-fg-faint">
        접수 내용(대상 주소·사유·내용·연락처)은 신고 처리 목적으로만 쓰고, 처리 후 지체 없이 파기합니다.
      </p>
    </form>
  );
}
