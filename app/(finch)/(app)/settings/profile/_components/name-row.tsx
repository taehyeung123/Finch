"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { FieldLabel, inputClass } from "@/components/ui/field";
import { FieldRow } from "../../_components/field-row";
import { updateDisplayName } from "../actions";

/*
  이름 행 — 보기 상태에서는 값 + «변경», 펼치면 그 자리에서 편집 폼(설정 사실 행의 인라인 편집 문법).
  ⚠️ profileFailed(이름을 못 읽음)면 폼을 **그리지 않는다** — 빈 이름으로 저장되는 길을 막는다(«다시 시도»만).
  서버 액션(updateDisplayName)·40자 상한은 재설계 전과 같다.
*/
export function NameRow({ displayName, failed, demo }: { displayName: string; failed: boolean; demo: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const inputId = useId();
  /* 훅은 아래 early return 보다 위 — failed 가 바뀌어도 key(page.tsx 의 displayName)가 "" 로 같으면 같은 인스턴스라
     훅 수가 달라지면 React 가 깨진다 */
  const [retrying, startRetry] = useTransition();

  if (failed) {
    return (
      <FieldRow
        label="이름"
        value={<span className="text-warning-strong">이름을 불러오지 못했어요</span>}
        hint="잠시 못 읽은 것이라 변경을 막아 두었어요"
        action={
          /* 맨 router.refresh() 는 서버 트리를 통째로 다시 받는 1~3초 동안 아무 티가 없었다(연타는 새로고침을 줄 세웠다).
             LoadFailed 와 같은 문법 — 잠그고 「다시 시도하는 중…」. secondary 인 이유: ghost(fg-sub)에 disabled
             opacity-40 이 겹치면 대비가 약 1.8:1 이라 바뀐 글자가 안 보인다(같은 자리 「변경」도 secondary 다). */
          <Button
            variant="secondary"
            size="sm"
            disabled={retrying}
            aria-busy={retrying}
            onClick={() => startRetry(() => router.refresh())}
          >
            {retrying ? "다시 시도하는 중…" : "다시 시도"}
          </Button>
        }
      />
    );
  }

  return (
    <FieldRow
      label="이름"
      value={displayName || undefined}
      empty="이름을 설정해 주세요"
      action={
        demo || editing ? null : (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            변경
          </Button>
        )
      }
    >
      {editing ? (
        <form action={updateDisplayName} className="space-y-2">
          <FieldLabel htmlFor={inputId} srOnly>
            이름
          </FieldLabel>
          <input
            id={inputId}
            name="displayName"
            defaultValue={displayName}
            maxLength={40}
            autoFocus
            placeholder="핀치"
            onChange={(e) => setDirty(e.target.value.trim() !== displayName)}
            className={inputClass("md", "sm:max-w-sm")}
          />
          <p className="text-[12px] text-fg-sub">화면과 리포트에 이 이름으로 표시돼요 · 40자까지</p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="primary" size="sm" disabled={!dirty} pendingLabel="저장 중…">
              저장
            </SubmitButton>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setDirty(false);
              }}
            >
              취소
            </Button>
          </div>
        </form>
      ) : null}
    </FieldRow>
  );
}
