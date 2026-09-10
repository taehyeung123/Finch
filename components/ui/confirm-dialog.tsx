"use client";

import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";

/*
  되돌릴 수 없는 조작의 확인 — **`window.confirm` 을 쓰지 않는다.**

  왜 네이티브 대화상자가 아닌가:
  · 크롬은 같은 문서에서 대화상자가 두 번째로 뜰 때부터 «이 페이지에서 추가 대화상자를 표시하지 않음»을 붙인다.
    그걸 한 번 켜면 `confirm()` 은 창 없이 즉시 false 를 돌려준다 — `if (!confirm(…)) return` 인 버튼은
    **조용히 아무 일도 안 한다.** App Router 는 문서를 새로 만들지 않고 이동하므로 새로고침 전까지 앱 전체에서 그렇다.
  · 「닫을까요?」 자리(작성 모달의 X·Esc·바깥 클릭)에서는 더 나쁘다 — 세 출구가 전부 막혀 모달에 갇힌다.
  · OS 대화상자는 테마·글꼴·문구 위계가 없고, «무엇이 어떻게 사라지는지»를 말할 자리가 없다.

  콜백형이다(`onConfirm`). 서버 액션 폼 제출의 확인은 `confirm-submit.tsx`(ConfirmSubmit)가 따로 맡는다 — 섞지 말 것.
  모달 껍데기는 ModalShell 이다(새로 짜지 않는다). 프로필 링크 편집기에 있던 것을 그대로 꺼내 공용으로 올렸다(2026-09-11).

  ⚠️ 손으로 짠 모달(스크림에 role="dialog" 를 직접 단 것) 위에 띄울 때:
  · 그 모달의 **안쪽이 아니라 형제로** 렌더한다 — 안쪽이면 바깥 모달의 onKeyDown(포커스 트랩)이 확인 모달의 Tab 까지 가로챈다.
    DOM 순서가 곧 쌓임 순서다(둘 다 z-50). 뒤에 둬야 위에 선다.
  · 바깥 모달의 Esc 리스너는 `isTopmostDialog()`(trap-focus.ts)로 «맨 위일 때만» 닫아야 한다 —
    아니면 Esc 한 번에 확인 모달과 바깥 모달이 같이 닫혀, 사라진다고 경고하던 내용이 그대로 사라진다.
*/
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "취소",
  tone = "danger",
  busy = false,
  onCancel,
  onConfirm,
}: {
  /** 질문 한 문장 — 모달의 접근성 이름도 겸한다 */
  title: string;
  /** 무엇이 어떻게 되는지(되돌릴 수 있는지) */
  description: React.ReactNode;
  confirmLabel: string;
  /** 「예약 취소」처럼 확인 버튼에 «취소»가 들어가면 헷갈린다 — 그때만 바꾼다 */
  cancelLabel?: string;
  /** danger = 지우기·취소처럼 잃는 조작 / primary = 발행처럼 내보내는 조작 */
  tone?: "danger" | "primary";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell label={title} title={title} size="sm" busy={busy} onClose={onCancel}>
      <div className="space-y-3">
        <p className="text-[14px] leading-[1.7] text-fg-sub">{description}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone} size="sm" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
