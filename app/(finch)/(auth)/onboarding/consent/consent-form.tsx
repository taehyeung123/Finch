"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { saveConsent, type ConsentFormState } from "./actions";

/*
  가입 필수 동의 폼 — 첫 로그인 직후 (app) 레이아웃 게이트가 여기로 보낸다.

  항목을 **구분해서** 각각 받는다(개인정보보호법 §22 — 묶음 문구 한 줄은 동의가 아니다).
  마케팅 수신은 선택임을 표기하고, 미동의로 가입을 막지 않는다(정보통신망법 §50).
*/

type Key = "over14" | "terms" | "privacy" | "marketing";

const ITEMS: { key: Key; required: boolean; label: React.ReactNode }[] = [
  { key: "over14", required: true, label: "만 14세 이상입니다" },
  {
    key: "terms",
    required: true,
    label: (
      <>
        <Link
          href="/terms"
          target="_blank"
          className="underline underline-offset-2 hover:text-fg"
        >
          이용약관
        </Link>
        에 동의합니다
      </>
    ),
  },
  {
    key: "privacy",
    required: true,
    label: (
      <>
        <Link
          href="/privacy"
          target="_blank"
          className="underline underline-offset-2 hover:text-fg"
        >
          개인정보 수집·이용
        </Link>
        에 동의합니다
      </>
    ),
  },
  {
    key: "marketing",
    required: false,
    label: "새 기능·혜택 소식을 이메일로 받아볼게요",
  },
];

const INITIAL: ConsentFormState = { error: null };

export function ConsentForm() {
  const [checked, setChecked] = useState<Record<Key, boolean>>({
    over14: false,
    terms: false,
    privacy: false,
    marketing: false,
  });
  const [state, formAction, pending] = useActionState(saveConsent, INITIAL);

  const allChecked = ITEMS.every((i) => checked[i.key]);
  const requiredOk = ITEMS.filter((i) => i.required).every((i) => checked[i.key]);

  function toggleAll() {
    const next = !allChecked;
    setChecked({ over14: next, terms: next, privacy: next, marketing: next });
  }

  return (
    <form action={formAction} className="rounded-card border border-line bg-body p-8">
      <h1 className="text-2xl font-bold leading-tight">서비스 이용 동의</h1>
      <p className="mt-1 text-[15px] text-fg-sub">
        핀치를 시작하려면 아래 필수 항목에 동의가 필요해요.
      </p>

      {/* 전체 동의 — 관행상 편의 스위치일 뿐, 실제 제출값은 개별 체크박스다 */}
      <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-card border border-line bg-overlay px-4 py-3.5">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          className="size-5 shrink-0 accent-primary"
        />
        <span className="text-[15px] font-semibold">전체 동의 (선택 항목 포함)</span>
      </label>

      <div className="mt-2 space-y-1">
        {ITEMS.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-center gap-3 rounded-card px-4 py-2.5 trans-state hover:bg-tint-hover"
          >
            <input
              type="checkbox"
              name={item.key}
              checked={checked[item.key]}
              onChange={(e) => setChecked((c) => ({ ...c, [item.key]: e.target.checked }))}
              className="size-5 shrink-0 accent-primary"
            />
            <span className="text-[15px] text-fg-sub">
              <span className={item.required ? "font-semibold text-primary" : "text-fg-faint"}>
                [{item.required ? "필수" : "선택"}]
              </span>{" "}
              {item.label}
            </span>
          </label>
        ))}
      </div>

      {state.error ? (
        <p role="alert" className="mt-4 rounded-card bg-negative-weak p-3 text-[14px] text-negative">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={!requiredOk || pending} className="mt-6 w-full" size="lg">
        {pending ? "저장 중…" : "동의하고 시작하기"}
      </Button>

      <p className="mt-3 text-center text-xs text-fg-sub">
        선택 항목은 동의하지 않아도 모든 기능을 쓸 수 있어요. 수신 동의는 언제든 철회할 수 있습니다.
      </p>
    </form>
  );
}
