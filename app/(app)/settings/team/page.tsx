import { FolderKanban, Link2 } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isDemoMode } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceOwnerId } from "@/lib/team";
import { SettingsNav } from "../_components/settings-nav";
import { TeamClient, type TeamRowVM } from "./_components/team-client";

/*
  팀 워크스페이스 (PRD PART 4.10)
  - team_members 테이블(0012_team.sql)에서 실제 초대중·활성 멤버를 조회한다.
  - 소유자(로그인 유저 == getWorkspaceOwnerId 결과)만 초대 폼·역할변경·제거 버튼을 본다.
  - 멤버로 보는 경우 RLS("member reads own membership")가 자기 자신의 멤버십 행만 돌려주므로,
    다른 팀원 명단은 보이지 않는다(v1 단순화) — 소유자 개인정보(이름 등)도 별도로 조회하지 않는다.
  - 데모 모드: 샘플 멤버로 화면 미리보기, 모든 액션은 비활성.
*/

const SAMPLE_MEMBERS: TeamRowVM[] = [
  { id: "sample-owner", email: "minji@finch.ai.kr", role: "owner", status: "active", isSelf: true },
  { id: "sample-editor", email: "jaehyun@finch.ai.kr", role: "editor", status: "active", isSelf: false },
  { id: "sample-viewer", email: "soyeon@finch.ai.kr", role: "viewer", status: "invited", isSelf: false },
];

async function loadTeamData(): Promise<{ isOwner: boolean; rows: TeamRowVM[] }> {
  if (isDemoMode()) return { isOwner: true, rows: SAMPLE_MEMBERS };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { isOwner: false, rows: [] };

  const ownerId = await getWorkspaceOwnerId(supabase, user.id);
  const isOwner = ownerId === user.id;

  const { data, error } = await supabase
    .from("team_members")
    .select("id, email, role, status, member_user_id")
    .eq("owner_user_id", ownerId)
    .in("status", ["invited", "active"])
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[team] 팀 멤버 조회 실패:", error.message);
  }

  const rows: TeamRowVM[] = (data ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role === "editor" ? "editor" : "viewer",
    status: r.status === "active" ? "active" : "invited",
    isSelf: r.member_user_id === user.id,
  }));

  // 소유자 본인은 team_members에 행이 없으므로(초대받은 게 아니라 그냥 본인) 목록 맨 앞에 합성해 넣는다.
  if (isOwner) {
    rows.unshift({ id: "self-owner", email: user.email ?? "", role: "owner", status: "active", isSelf: true });
  }

  return { isOwner, rows };
}

export default async function TeamSettingsPage() {
  const { isOwner, rows } = await loadTeamData();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="설정"
        description="팀 멤버와 역할을 관리하고 클라이언트와 협업하세요."
      />
      <SettingsNav />

      <Card>
        <CardHeader
          title="팀 멤버"
          description={
            rows.length > 0
              ? `${rows.length}명이 이 워크스페이스에 참여 중`
              : "이 워크스페이스에 소속된 멤버가 없어요"
          }
        />
        <CardBody>
          <TeamClient initialRows={rows} isOwner={isOwner} demoMode={isDemoMode()} />
          {!isOwner && !isDemoMode() ? (
            <p className="mt-4 text-[13px] text-fg-faint">
              멤버 초대·역할 관리는 워크스페이스 소유자만 할 수 있어요.
            </p>
          ) : null}
        </CardBody>
      </Card>

      {/* 예정 기능 소개 (PART 4.10) */}
      <section aria-label="팀 예정 기능" className="grid gap-3 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-primary-weak text-primary">
              <FolderKanban className="size-4" aria-hidden />
            </span>
            <Badge tone="neutral">Pro·Agency 플랜 예정</Badge>
          </div>
          <h3 className="mt-3 text-[15px] font-bold">클라이언트별 프로젝트 분리</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-sub">
            클라이언트마다 채널·경쟁사·리포트를 독립된 프로젝트로 나눠 관리하고, 멤버별 접근 권한을
            프로젝트 단위로 지정할 수 있어요.
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-primary-weak text-primary">
              <Link2 className="size-4" aria-hidden />
            </span>
            <Badge tone="neutral">Pro·Agency 플랜 예정</Badge>
          </div>
          <h3 className="mt-3 text-[15px] font-bold">클라이언트 공유용 뷰어 링크</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-sub">
            로그인 없이 성과를 열람할 수 있는 만료시간 있는 보안 URL을 발급해 클라이언트에게
            리포트 화면을 그대로 공유할 수 있어요.
          </p>
        </Card>
      </section>
    </div>
  );
}
