"use client";

import { useMemo, useState } from "react";
import {
  Info,
  MessageSquareReply,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatAgo, formatCompact } from "@/lib/format";
import type { AutoDmRule, AutoDmStatus, Post } from "@/lib/types";
import { autoDmSummary, recentPosts } from "@/lib/data";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/ui/empty-state";
import { InstagramGlyph } from "@/components/icons/brand";
import { RuleEditor, type RuleDraft } from "./rule-editor";
import { createRule, deleteRule, toggleRule, updateRule } from "../actions";

const POST_TYPE_LABEL: Record<Post["type"], string> = {
  reels: "릴스",
  feed: "피드",
  story: "스토리",
  video: "동영상",
  carousel: "캐러셀",
  text: "텍스트",
};

const STATUS_META: Record<AutoDmRule["status"], { label: string; tone: "positive" | "neutral" | "warning" }> = {
  active: { label: "실행 중", tone: "positive" },
  paused: { label: "일시중지", tone: "neutral" },
  review: { label: "검수 중", tone: "warning" },
};

/** 자동 DM 화면 본체 — 서버 페이지(page.tsx)가 초기 규칙(데모: 샘플, 실제: DB)을 주입한다 */
export function AutoDmClient({ initialRules }: { initialRules: AutoDmRule[] }) {
  const [rules, setRules] = useState<AutoDmRule[]>(initialRules);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AutoDmRule | null>(null);

  // 규칙이 연결할 수 있는 인스타그램 게시물 (연동 전이면 빈 배열 → 에디터가 안내)
  const igPosts = useMemo(() => recentPosts.filter((p) => p.channel === "instagram"), []);

  const derived = useMemo(() => {
    const active = rules.filter((r) => r.status === "active").length;
    const sentToday = rules.reduce((s, r) => s + r.sentToday, 0);
    const sentTotal = rules.reduce((s, r) => s + r.sentTotal, 0);
    const failed = rules.reduce((s, r) => s + r.failedTotal, 0);
    const deliveryRate = sentTotal + failed > 0 ? (sentTotal / (sentTotal + failed)) * 100 : 0;
    return { active, sentToday, sentTotal, deliveryRate };
  }, [rules]);

  function openNew() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(rule: AutoDmRule) {
    setEditing(rule);
    setEditorOpen(true);
  }

  // 낙관적 로컬 업데이트 후 서버 액션으로 지속(데모 모드에서는 no-op 성공)
  async function toggleStatus(rule: AutoDmRule) {
    if (rule.status === "review") return;
    const next: AutoDmStatus = rule.status === "active" ? "paused" : "active";
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, status: next } : r)));
    const res = await toggleRule(rule.id, next);
    if (!res.ok) {
      // 실패 시 원복
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, status: rule.status } : r)));
    }
  }

  async function removeRule(rule: AutoDmRule) {
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    const res = await deleteRule(rule.id);
    if (!res.ok) {
      setRules((prev) => [rule, ...prev]);
    }
  }

  // 저장은 서버 확정 후 반영 — 실제 모드에서 DB가 생성한 id·타임스탬프를 그대로 쓴다
  async function saveRule(draft: RuleDraft) {
    const exists = rules.some((r) => r.id === draft.id);
    const res = await (exists ? updateRule(draft) : createRule(draft));
    if (!res.ok) {
      alert(res.error ?? "저장에 실패했습니다.");
      return; // 모달 유지 — 사용자가 재시도/수정 가능
    }
    setRules((prev) => {
      if (exists) {
        const merged = res.rule ?? null;
        return prev.map((r) =>
          r.id === draft.id ? (merged ?? { ...r, ...draft, createdAt: r.createdAt }) : r,
        );
      }
      const created: AutoDmRule =
        res.rule ?? {
          ...draft,
          sentTotal: 0,
          sentToday: 0,
          failedTotal: 0,
          lastSentAt: null,
          createdAt: draft.createdAt ?? new Date().toISOString(),
        };
      return [created, ...prev];
    });
    setEditorOpen(false);
    setEditing(null);
  }

  const stats = [
    { label: "실행 중 규칙", value: String(derived.active) },
    { label: "오늘 발송", value: formatCompact(derived.sentToday) },
    { label: "누적 발송", value: formatCompact(derived.sentTotal) },
    { label: "발송 성공률", value: `${derived.deliveryRate.toFixed(1)}%` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="자동 DM"
        description="인스타그램 게시물에 특정 댓글이 달리면 자동으로 다이렉트 메시지를 보냅니다."
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" aria-hidden /> 새 규칙
          </Button>
        }
      />

      {/* 인스타 전용 · 연동 상태 고지 (정직) */}
      <div className="flex items-start gap-2.5 rounded-card border border-line bg-overlay p-3.5 text-[13px] leading-relaxed text-fg-sub">
        <Info className="mt-0.5 size-4 shrink-0 text-fg-faint" aria-hidden />
        <p>
          <span className="inline-flex items-center gap-1 font-semibold text-fg">
            <InstagramGlyph className="size-3.5 text-ig" aria-hidden />
            인스타그램 전용
          </span>{" "}
          기능입니다. 스레드·틱톡은 다이렉트 메시지 발송 API가 없어 지원되지 않습니다. 실제 발송은 인스타그램
          메시지 연동과 메타 앱 심사(instagram_manage_messages)가 완료되면 활성화되며, 지금은 규칙 설정과
          미리보기를 준비할 수 있습니다.
        </p>
      </div>

      {/* 요약 지표 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-[13px] text-fg-sub">{s.label}</p>
            <p className="tnum mt-1 text-2xl font-bold leading-none">{s.value}</p>
          </Card>
        ))}
      </div>
      <p className="-mt-3 flex items-center gap-1.5 text-[12px] text-fg-faint">
        최근 30일 {formatCompact(autoDmSummary.sent30d)}건 발송 · 평균 응답률 {autoDmSummary.replyRate}%
        <InfoTip>
          발송 성공률·응답률은 인스타그램이 돌려주는 실제 발송·대화 결과 기준이며 자체 추정치가 아닙니다.
          연동 전에는 예시 데이터로 표시됩니다.
        </InfoTip>
      </p>

      {/* 규칙 목록 */}
      {rules.length === 0 ? (
        <EmptyState
          icon={MessageSquareReply}
          title="아직 자동 DM 규칙이 없어요"
          description="게시물을 고르고 어떤 댓글에 어떤 DM을 보낼지 설정하면, 관심 있는 사람에게 자동으로 메시지가 나갑니다."
          action={
            <Button onClick={openNew}>
              <Plus className="size-4" aria-hidden /> 첫 규칙 만들기
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => {
            const status = STATUS_META[rule.status];
            const capPct = rule.dailyCap > 0 ? Math.min(100, Math.round((rule.sentToday / rule.dailyCap) * 100)) : 0;
            return (
              <li key={rule.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{POST_TYPE_LABEL[rule.postType]}</Badge>
                        <Badge tone={status.tone}>
                          <span className="size-1.5 rounded-full bg-current" aria-hidden />
                          {status.label}
                        </Badge>
                        {rule.isAdvertising ? <Badge tone="warning">광고</Badge> : null}
                      </div>
                      <p className="mt-2 line-clamp-1 text-[15px] font-semibold">{rule.postCaption}</p>

                      {/* 트리거 */}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-fg-sub">
                        <span className="text-fg-faint">트리거</span>
                        {rule.trigger === "all" ? (
                          <span>모든 댓글</span>
                        ) : rule.keywords.length > 0 ? (
                          rule.keywords.map((k) => (
                            <span
                              key={k}
                              className="rounded-chip border border-line bg-overlay px-2 py-0.5 text-[12px] font-medium"
                            >
                              {k}
                            </span>
                          ))
                        ) : (
                          <span className="text-fg-faint">키워드 없음</span>
                        )}
                      </div>

                      {/* DM 미리보기 */}
                      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-fg-sub">{rule.dmMessage}</p>

                      {/* 발송 통계 */}
                      <div className="tnum mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-faint">
                        <span>누적 {formatCompact(rule.sentTotal)}건</span>
                        <span>
                          오늘 {rule.sentToday}/{rule.dailyCap}
                          {capPct >= 100 ? <span className="ml-1 text-warning">상한 도달</span> : null}
                        </span>
                        {rule.failedTotal > 0 ? <span>실패 {rule.failedTotal}건</span> : null}
                        <span>{rule.lastSentAt ? `${formatAgo(rule.lastSentAt)} 발송` : "발송 전"}</span>
                      </div>
                    </div>

                    {/* 액션 */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rule.status === "active"}
                        aria-label={rule.status === "active" ? "일시중지" : "실행"}
                        disabled={rule.status === "review"}
                        onClick={() => toggleStatus(rule)}
                        className={cn(
                          "relative h-5 w-9 shrink-0 rounded-chip transition-colors disabled:opacity-40",
                          rule.status === "active" ? "bg-primary" : "bg-line-strong",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 size-4 rounded-full bg-body transition-all",
                            rule.status === "active" ? "left-[18px]" : "left-0.5",
                          )}
                          aria-hidden
                        />
                      </button>
                      <button
                        type="button"
                        aria-label="편집"
                        onClick={() => openEdit(rule)}
                        className="rounded-card p-2 text-fg-sub hover:bg-overlay hover:text-fg"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="삭제"
                        onClick={() => removeRule(rule)}
                        className="rounded-card p-2 text-fg-sub hover:bg-negative-weak hover:text-negative"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {editorOpen ? (
        <RuleEditor
          initial={editing}
          posts={igPosts}
          existingRules={rules}
          onSave={saveRule}
          onClose={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
