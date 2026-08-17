"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge } from "@/components/ui/badge";
import { inviteMember, revokeMember, updateMemberRole } from "../actions";

export type TeamRole = "owner" | "editor" | "viewer";
export type TeamStatus = "invited" | "active";

export interface TeamRowVM {
  id: string;
  email: string;
  role: TeamRole;
  status: TeamStatus;
  isSelf: boolean;
}

const ROLE_LABEL: Record<TeamRole, string> = { owner: "소유자", editor: "에디터", viewer: "뷰어" };
const STATUS_TONE: Record<TeamStatus, "positive" | "warning"> = { active: "positive", invited: "warning" };
const STATUS_LABEL: Record<TeamStatus, string> = { active: "참여중", invited: "초대중" };

/* 인풋·셀렉트 공통 스타일 — 포커스는 공용 Button과 동일한 outline 링으로 통일
   (2026-08 감사: focus:outline-none + 1px 보더 색 변경만 남기던 약한 포커스 표시 수리). */
const fieldClass =
  "h-10 rounded-card border border-line bg-body px-3 text-[15px] focus:border-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:opacity-60";

/* 초대 폼 필드 — <form action> 컨텍스트의 useFormStatus로 제출 중에만 비활성.
   행 액션과 pending 상태를 분리해, 초대 전송이 멤버 행 조작을 막지 않는다. */
function InviteFields({
  demoMode,
  email,
  onEmailChange,
  role,
  onRoleChange,
}: {
  demoMode: boolean;
  email: string;
  onEmailChange: (value: string) => void;
  role: Exclude<TeamRole, "owner">;
  onRoleChange: (value: Exclude<TeamRole, "owner">) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <div className="flex-1">
        <input
          type="email"
          name="email"
          required
          disabled={demoMode || pending}
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="초대할 이메일 주소"
          aria-label="초대할 이메일 주소"
          className={`w-full placeholder:text-fg-faint ${fieldClass}`}
        />
      </div>
      <select
        name="role"
        disabled={demoMode || pending}
        value={role}
        onChange={(e) => onRoleChange(e.target.value === "editor" ? "editor" : "viewer")}
        aria-label="초대할 역할"
        className={fieldClass}
      >
        <option value="viewer">뷰어</option>
        <option value="editor">에디터</option>
      </select>
      <SubmitButton type="submit" size="md" disabled={demoMode} pendingLabel="보내는 중…">
        <UserPlus className="size-4" aria-hidden />
        초대 보내기
      </SubmitButton>
    </>
  );
}

export function TeamClient({
  initialRows,
  isOwner,
  demoMode,
}: {
  initialRows: TeamRowVM[];
  isOwner: boolean;
  demoMode: boolean;
}) {
  const router = useRouter();
  // 로컬 사본을 따로 들지 않는다 — 서버 액션 후 router.refresh()가 이 컴포넌트를 새 initialRows로
  // 다시 렌더링해 주므로, prop을 그대로 원천 데이터로 쓴다(별도 상태 동기화 useEffect가 필요 없다).
  const rows = initialRows;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("viewer");
  const [error, setError] = useState<string | null>(null);
  // 진행 중인 행 id — 전역 isPending이 모든 행을 일괄 비활성하던 문제(감사) 대신,
  // 해당 행만 비활성하고 나머지 행은 계속 조작할 수 있게 한다.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startRowTransition] = useTransition();

  async function submitInvite(formData: FormData) {
    if (demoMode) return;
    setError(null);
    const res = await inviteMember(formData);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEmail("");
    setRole("viewer");
    router.refresh();
  }

  async function handleRevoke(memberId: string) {
    if (demoMode) return;
    setError(null);
    setPendingId(memberId);
    const res = await revokeMember(memberId);
    if (!res.ok) setError(res.error);
    else router.refresh();
    setPendingId(null);
  }

  function handleRoleChange(memberId: string, nextRole: Exclude<TeamRole, "owner">) {
    if (demoMode) return;
    setError(null);
    setPendingId(memberId);
    startRowTransition(async () => {
      const res = await updateMemberRole(memberId, nextRole);
      if (!res.ok) setError(res.error);
      // 실패 시에도 refresh로 서버 상태(원래 역할)를 다시 그려 화면과 DB를 일치시킨다.
      router.refresh();
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-5">
      {isOwner ? (
        <div className="space-y-2">
          <form action={submitInvite} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <InviteFields
              demoMode={demoMode}
              email={email}
              onEmailChange={setEmail}
              role={role}
              onRoleChange={setRole}
            />
          </form>
          {demoMode ? (
            <p className="text-[14px] text-fg-sub">
              데모 모드에서는 팀 초대·관리 기능을 사용할 수 없어요. 실제 워크스페이스에서 이용할 수
              있습니다.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-card bg-negative-weak p-3 text-[14px] text-negative-strong">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-line">
        {rows.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-primary-weak text-[14px] font-bold text-primary"
                aria-hidden
              >
                {member.email.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">
                  {member.email}
                  {member.isSelf ? <span className="ml-1.5 font-normal text-fg-sub">(나)</span> : null}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Badge tone={STATUS_TONE[member.status]}>{STATUS_LABEL[member.status]}</Badge>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {isOwner && member.role !== "owner" ? (
                <select
                  aria-label={`${member.email} 역할`}
                  value={member.role}
                  disabled={demoMode || pendingId === member.id}
                  onChange={(e) =>
                    handleRoleChange(member.id, e.target.value === "editor" ? "editor" : "viewer")
                  }
                  className={fieldClass}
                >
                  <option value="viewer">뷰어</option>
                  <option value="editor">에디터</option>
                </select>
              ) : (
                <Badge tone={member.role === "owner" ? "primary" : "neutral"}>{ROLE_LABEL[member.role]}</Badge>
              )}

              {isOwner && member.role !== "owner" ? (
                demoMode ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled
                    aria-label={`${member.email} 제거`}
                    className="h-10 w-10 shrink-0 px-0"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : (
                  <ConfirmSubmit
                    action={() => handleRevoke(member.id)}
                    title="멤버를 제거할까요?"
                    description={`${member.email}님의 워크스페이스 접근 권한이 바로 해제돼요. 다시 참여하려면 초대를 새로 보내 상대가 수락해야 해요.`}
                    confirmLabel="정말 제거"
                    pendingLabel="제거 중…"
                    trigger={
                      <>
                        <Trash2 className="size-4" aria-hidden />
                        <span className="sr-only">{member.email} 제거</span>
                      </>
                    }
                    triggerVariant="danger"
                    triggerSize="sm"
                    triggerClassName="h-10 w-10 shrink-0 px-0"
                  />
                )
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
