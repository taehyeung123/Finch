"use client";

import { useId, useState } from "react";
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

  if (failed) {
    return (
      <FieldRow
        label="이름"
        value={<span className="text-warning-strong">이름을 불러오지 못했어요</span>}
        hint="잠시 못 읽은 것이라 변경을 막아 두었어요"
        action={
          <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
            다시 시도
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
