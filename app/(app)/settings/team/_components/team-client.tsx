"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
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
  const [isPending, startTransition] = useTransition();

  function submitInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (demoMode) return;
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const res = await inviteMember(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEmail("");
      setRole("viewer");
      form.reset();
      router.refresh();
    });
  }

  function handleRevoke(memberId: string) {
    if (demoMode) return;
    startTransition(async () => {
      await revokeMember(memberId);
      router.refresh();
    });
  }

  function handleRoleChange(memberId: string, nextRole: Exclude<TeamRole, "owner">) {
    if (demoMode) return;
    startTransition(async () => {
      await updateMemberRole(memberId, nextRole);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {isOwner ? (
        <form onSubmit={submitInvite} className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <input
              type="email"
              name="email"
              required
              disabled={demoMode || isPending}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="초대할 이메일 주소"
              aria-label="초대할 이메일 주소"
              className="h-10 w-full rounded-card border border-line bg-body px-3 text-[14px] placeholder:text-fg-faint focus:border-primary focus:outline-none disabled:opacity-60"
            />
          </div>
          <select
            name="role"
            disabled={demoMode || isPending}
            value={role}
            onChange={(e) => setRole(e.target.value === "editor" ? "editor" : "viewer")}
            aria-label="초대할 역할"
            className="h-10 rounded-card border border-line bg-body px-3 text-[14px] focus:border-primary focus:outline-none disabled:opacity-60"
          >
            <option value="viewer">뷰어</option>
            <option value="editor">에디터</option>
          </select>
          <Button
            type="submit"
            size="md"
            disabled={demoMode || isPending}
            title={demoMode ? "데모 모드에서는 팀 초대를 사용할 수 없습니다" : undefined}
          >
            <UserPlus className="size-4" aria-hidden />
            초대 보내기
          </Button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-card bg-negative-weak p-3 text-[13px] text-negative">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-line">
        {rows.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-primary-weak text-[13px] font-bold text-primary"
                aria-hidden
              >
                {member.email.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold">
                  {member.email}
                  {member.isSelf ? <span className="ml-1.5 font-normal text-fg-faint">(나)</span> : null}
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
                  disabled={demoMode || isPending}
                  onChange={(e) =>
                    handleRoleChange(member.id, e.target.value === "editor" ? "editor" : "viewer")
                  }
                  className="h-8 rounded-card border border-line bg-body px-2 text-[13px] focus:border-primary focus:outline-none disabled:opacity-60"
                >
                  <option value="viewer">뷰어</option>
                  <option value="editor">에디터</option>
                </select>
              ) : (
                <Badge tone={member.role === "owner" ? "primary" : "neutral"}>{ROLE_LABEL[member.role]}</Badge>
              )}

              {isOwner && member.role !== "owner" ? (
                <button
                  type="button"
                  disabled={demoMode || isPending}
                  onClick={() => handleRevoke(member.id)}
                  aria-label={`${member.email} 제거`}
                  className={cn(
                    "rounded-card p-2 text-fg-faint transition-colors hover:bg-negative-weak hover:text-negative",
                    (demoMode || isPending) && "pointer-events-none opacity-40",
                  )}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
