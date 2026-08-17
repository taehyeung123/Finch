import type { Metadata } from "next";
import { MessageCircleQuestion } from "lucide-react";
import { PageHeader } from "@/components/ui/section-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/supabase/config";
import { InquiryForm } from "./_components/inquiry-form";

/*
  문의하기 — 접수 + 내 문의/답변 열람 (마이그레이션 0017_inquiries.sql)

  핀치에는 지금까지 문의 창구가 없어서, 딥레드 HQ 고객센터에서 핀치 문의가 항상
  비어 있었다. 이 화면이 그 입구다. 답변은 HQ(service role)에서만 작성되고 이
  앱에는 답변을 쓰는 경로가 없다 — 사용자는 자기 문의를 접수하고 읽기만 한다.
*/

export const metadata: Metadata = {
  title: "문의하기",
  description: "핀치 이용 중 궁금한 점을 문의하고 답변을 확인하세요.",
  robots: { index: false, follow: false },
};

interface InquiryRow {
  id: number;
  type: string;
  subject: string;
  message: string;
  status: string;
  reply_body: string | null;
  created_at: string;
  replied_at: string | null;
}

const STATUS_LABEL: Record<string, { label: string; tone: "neutral" | "primary" | "positive" }> = {
  pending: { label: "답변 대기", tone: "neutral" },
  in_progress: { label: "확인 중", tone: "primary" },
  replied: { label: "답변 완료", tone: "positive" },
  closed: { label: "종료", tone: "neutral" },
};

function fmtDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, ".");
}

async function loadInquiries(): Promise<{ rows: InquiryRow[]; notice: string | null }> {
  if (isDemoMode()) {
    return { rows: [], notice: "데모 모드에서는 문의 내역이 표시되지 않습니다." };
  }
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { rows: [], notice: null };

  const { data, error } = await supabase
    .from("inquiries")
    .select("id, type, subject, message, status, reply_body, created_at, replied_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    // 조용히 빈 목록으로 위장하지 않는다 — "문의가 없음"과 "불러오지 못함"은 다르다
    console.error("[support] 문의 조회 실패:", error.message);
    return { rows: [], notice: "문의 내역을 불러오지 못했습니다. 잠시 후 다시 시도해주세요." };
  }
  return { rows: (data || []) as InquiryRow[], notice: null };
}

export default async function SupportPage() {
  const { rows, notice } = await loadInquiries();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="문의하기"
        description="이용 중 문제가 있거나 궁금한 점이 있으면 남겨주세요. 답변은 이 화면에서 확인할 수 있습니다."
      />

      <Card>
        <CardHeader title="새 문의" description="유형을 고르고 내용을 적어주세요." />
        <CardBody>
          <InquiryForm />
        </CardBody>
      </Card>

      <section className="flex flex-col gap-3">
        <h3 className="text-[20px] font-bold leading-snug">내 문의 내역</h3>

        {notice ? (
          <Card>
            <CardBody>
              <p className="text-[15px] text-fg-sub">{notice}</p>
            </CardBody>
          </Card>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={MessageCircleQuestion}
            title="아직 접수한 문의가 없습니다"
            description="위에서 문의를 남기시면 여기에 표시되고, 답변이 등록되면 함께 보입니다."
          />
        ) : (
          rows.map((q) => {
            const status = STATUS_LABEL[q.status] ?? STATUS_LABEL.pending;
            return (
              <Card key={q.id}>
                <CardBody className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <Badge>{q.type}</Badge>
                    <span className="text-[12px] text-fg-faint">{fmtDate(q.created_at)}</span>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-snug">{q.subject}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-fg-sub">
                      {q.message}
                    </p>
                  </div>

                  {q.reply_body ? (
                    <div className="rounded-card border border-line bg-overlay p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-primary">핀치 답변</span>
                        {q.replied_at ? (
                          <span className="text-[12px] text-fg-faint">{fmtDate(q.replied_at)}</span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed">
                        {q.reply_body}
                      </p>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
