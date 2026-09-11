"use client";

import { useMemo, useRef, useState } from "react";
import {
  ImageOff,
  MessageSquareReply,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { FinchMark } from "@/components/logo";
import { formatAgo, formatCompact } from "@/lib/format";
import { cn } from "@/lib/cn";
import { NEXT_POST_SENTINEL } from "@/lib/auto-dm/db";
import { describeCheckNow, type CheckNowMessage } from "@/lib/auto-dm/check-now-types";
import type { AutoDmRule, AutoDmStatus, Post } from "@/lib/types";
import { autoDmSummary } from "@/lib/data";
import { PageHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadFailed } from "@/components/ui/load-failed";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ConnectLink } from "@/components/ui/connect-link";
import { FinchLoader } from "@/components/ui/finch-loader";
import { NoticeBar } from "@/components/ui/notice-bar";
import { ResultModal } from "@/components/ui/result-modal";
import { actionRejectHint } from "@/lib/monitoring/action-reject";
import { RuleWizard, type RuleDraft } from "./rule-wizard";
import { checkRuleNow, createRule, deleteRule, toggleRule, updateRule } from "../actions";

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

/** 자동 DM 화면 본체 — 서버 페이지(page.tsx)가 초기 규칙·게시물(데모: 샘플, 실제: DB+실미디어)을 주입한다 */
export function AutoDmClient({
  initialRules,
  posts,
  contentLimit,
  planFailed = false,
  rulesFailed = false,
  accountHandle,
  postsFailed = false,
  accountAvatar,
  followRequestReady,
  igConnected = true,
  igScopeMissing = false,
  reconnectHref = null,
}: {
  initialRules: AutoDmRule[];
  posts: Post[];
  /** 플랜별 자동화 콘텐츠(게시물) 한도 — 2026-08-14 개편: 발송량 대신 콘텐츠 수로 게이팅 */
  contentLimit: number;
  /** 규칙 조회가 실패했다 — «규칙 0건»과 다른 화면을 그린다 */
  rulesFailed?: boolean;
  /** 플랜을 못 읽어 한도가 무료 기준으로 잠긴 상태 — 숫자를 사실처럼 말하지 않는다 */
  planFailed?: boolean;
  accountHandle: string | null;
  /** true = 게시물 목록을 못 불러왔다. «게시물 0개»와 다른 문구를 그린다 */
  postsFailed?: boolean;
  /** 연동 인스타 프로필 사진 — 위저드 DM 미리보기 아바타 (미연동 시 이니셜 폴백) */
  accountAvatar: string | null;
  /** 0052 컬럼 존재 여부 — false 면 위저드가 팔로우 요청 토글을 비활성화한다 */
  followRequestReady: boolean;
  /** 인스타 연동 여부. true=연결됨 / false=없음 / null=확인 못 함(관문을 띄우지 않는다) */
  igConnected?: boolean | null;
  /** 연결은 됐는데 댓글 권한이 **확실히** 빠졌다 — «다시 연결»을 먼저 말한다(«확인 불가»면 false) */
  igScopeMissing?: boolean;
  /** 인스타 연결 시작 주소(지금 연결을 받을 수 있을 때만) — null 이면 설정 › 채널로 보낸다 */
  reconnectHref?: string | null;
}) {
  const [rules, setRules] = useState<AutoDmRule[]>(initialRules);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AutoDmRule | null>(null);
  /* 삭제 확인을 기다리는 규칙 — window.confirm 이었다(브라우저가 대화상자를 막으면 휴지통이 조용히 아무 일도 안 했다) */
  const [removing, setRemoving] = useState<AutoDmRule | null>(null);
  /* 저장 왕복 중인 규칙 — 규칙별이다(전역이면 여러 규칙을 연달아 끄는 흐름이 통째로 줄 선다).
     ref 는 같은 틱 연타를 막는 잠금, state 는 스위치의 aria-busy 표시용. 스위치는 disabled 로 잠그지 않는다 */
  const togglingRef = useRef(new Set<string>());
  const [toggling, setToggling] = useState<ReadonlySet<string>>(() => new Set());
  /* 스위치·삭제가 실패했을 때 그 규칙 카드 안에 띄우는 한 줄(role=alert). 화면 안 저장이라 결과 모달이 아니다(CLAUDE.md) */
  const [ruleNotice, setRuleNotice] = useState<{ ruleId: string; text: string } | null>(null);
  /* «지금 확인» 중인 규칙 — 한 번에 하나(화면 전체 막이 뜨므로). ref 는 같은 틱 연타 잠금, state 는 버튼·막 표시용 */
  const checkingRef = useRef<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  /* «지금 확인» 결과 — 결과 모달로 한 번 세운다(방금 누른 일의 결과라 띠가 아니다, CLAUDE.md) */
  const [checkResult, setCheckResult] = useState<CheckNowMessage | null>(null);

  // 규칙이 연결할 수 있는 인스타그램 게시물 (연동 전이면 빈 배열 → 에디터가 안내)
  const igPosts = useMemo(() => posts.filter((p) => p.channel === "instagram"), [posts]);

  const contentUsed = useMemo(() => new Set(rules.map((r) => r.postId)).size, [rules]);

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

  function markToggling(id: string, on: boolean) {
    if (on) togglingRef.current.add(id);
    else togglingRef.current.delete(id);
    setToggling(new Set(togglingRef.current));
  }

  /* 낙관적 로컬 업데이트 후 서버 액션으로 지속(데모 모드에서는 no-op 성공).
     예전엔 try 가 없어 서버 액션이 reject 하면(망 끊김·배포 교체) 원복 줄이 안 돌았다 — 스위치는 켜져 보이는데
     DB 는 꺼진 채로 남았고, `{ok:false}` 실패도 원복만 할 뿐 알림이 0곳이라 «스위치가 혼자 도로 꺼짐»으로 보였다.
     왕복 중인 규칙의 재클릭은 무시한다(규칙별) — 되돌리기 전의 실패가 뒤 클릭의 결과를 덮어쓰지 않게. */
  async function toggleStatus(rule: AutoDmRule) {
    if (rule.status === "review") return;
    if (togglingRef.current.has(rule.id)) return;
    const prevStatus = rule.status;
    const next: AutoDmStatus = prevStatus === "active" ? "paused" : "active";
    markToggling(rule.id, true);
    setRuleNotice((n) => (n?.ruleId === rule.id ? null : n));
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, status: next } : r)));
    let failText: string | null = null;
    try {
      const res = await toggleRule(rule.id, next);
      if (!res.ok) failText = `${res.error ?? "실행 상태를 바꾸지 못했어요."} 스위치를 원래대로 돌렸어요.`;
    } catch (e) {
      const hint = actionRejectHint("auto-dm.toggle", e);
      if (hint !== null) failText = `실행 상태를 바꾸지 못해 스위치를 원래대로 돌렸어요. ${hint}`;
    } finally {
      markToggling(rule.id, false);
    }
    if (failText === null) return;
    /* 함수형 원복 — 그 규칙이 **아직 우리가 넣은 값일 때만** 되돌린다(그 사이 편집 저장 등으로 바뀌었으면 건드리지 않는다) */
    setRules((prev) => prev.map((r) => (r.id === rule.id && r.status === next ? { ...r, status: prevStatus } : r)));
    setRuleNotice({ ruleId: rule.id, text: failText });
  }

  /* deleteRule 은 하드 삭제다(actions.ts) — 규칙·문구·발송 기록이 함께 사라지고 복구 경로가 없다.
     그런데 확인창도 되돌리기도 없어서, 휴지통을 한 번 잘못 누르면 그걸로 끝이었다(실측). 확인은 아래 ConfirmDialog 가 받는다. */
  async function removeRule(rule: AutoDmRule) {
    /* 확인을 누른 **시점의** 목록에서 자리를 잰다 — 실패하면 원래 자리로 되돌린다(예전엔 맨 앞에 꽂혀 순서가 바뀌었다) */
    const at = rules.findIndex((r) => r.id === rule.id);
    if (at < 0) return; // 그 사이 이미 사라졌다
    const restore = () =>
      setRules((prev) => (prev.some((r) => r.id === rule.id) ? prev : [...prev.slice(0, at), rule, ...prev.slice(at)]));
    setRuleNotice((n) => (n?.ruleId === rule.id ? null : n));
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    /* 실패는 되돌리기만 하면 «지운 규칙이 말없이 되살아남»으로 보인다 — 되살아난 그 카드에 이유를 붙인다 */
    try {
      const res = await deleteRule(rule.id);
      if (!res.ok) {
        restore();
        setRuleNotice({ ruleId: rule.id, text: `${res.error ?? "삭제하지 못했어요."} 규칙은 그대로 남아 있어요.` });
      }
    } catch (e) {
      restore();
      const hint = actionRejectHint("auto-dm.delete", e);
      if (hint !== null) setRuleNotice({ ruleId: rule.id, text: `삭제하지 못해 규칙을 그대로 두었어요. ${hint}` });
    }
  }

  /* «지금 확인» — 이 규칙 게시물의 최근 댓글을 지금 읽어 조건에 맞으면 DM 을 보낸다(서버가 웹훅과 같은 파이프라인을 돈다).
     반응: 누르는 즉시 아이콘이 돈다 → 0.2초가 넘으면 화면 막(busy-veil-in)이 로더와 함께 덮인다 → 끝나면 결과 모달.
     서버 액션이 reject 돼도(망 끊김·배포 교체) 잠금은 finally 가 푼다 — 버튼이 «확인 중»에 굳지 않게. */
  async function checkNow(rule: AutoDmRule) {
    if (checkingRef.current) return;
    checkingRef.current = rule.id;
    setChecking(rule.id);
    setRuleNotice((n) => (n?.ruleId === rule.id ? null : n));
    let message: CheckNowMessage | null = null;
    try {
      const res = await checkRuleNow(rule.id);
      message = describeCheckNow(res);
      if (res.ok && res.counters.length > 0) {
        /* 보낸 만큼 카드 숫자를 맞춘다 — 같은 게시물에 걸린 다른 규칙이 보냈을 수도 있어 게시물의 규칙 전부를 받는다 */
        const byId = new Map(res.counters.map((c) => [c.id, c]));
        setRules((prev) =>
          prev.map((r) => {
            const c = byId.get(r.id);
            return c ? { ...r, sentTotal: c.sentTotal, sentToday: c.sentToday, failedTotal: c.failedTotal, lastSentAt: c.lastSentAt } : r;
          }),
        );
      }
    } catch (e) {
      const hint = actionRejectHint("auto-dm.check-now", e);
      if (hint !== null) {
        message = { tone: "negative", title: "댓글을 확인하지 못했어요", description: hint, lines: [], reconnect: null };
      }
    } finally {
      checkingRef.current = null;
      setChecking(null);
    }
    if (message) setCheckResult(message);
  }

  /* 연결·다시 연결 버튼 — 인가 화면으로 나가는 이동이라 ConnectLink(누르는 즉시 «이동하고 있어요» 모달).
     지금 연결을 받을 수 없는 배포면(reconnectHref=null) 설정 › 채널로 보낸다 — 거기서 사정을 말한다 */
  function connectAction(kind: "connect" | "reconnect") {
    const label = kind === "connect" ? "인스타그램 연결하기" : "다시 연결하기";
    return reconnectHref ? (
      <ConnectLink href={reconnectHref} variant="primary" label="인스타그램">
        {label}
      </ConnectLink>
    ) : (
      <ButtonLink href="/settings/channels" size="sm">
        {label}
      </ButtonLink>
    );
  }

  // 저장은 서버 확정 후 반영 — 실제 모드에서 DB가 생성한 id·타임스탬프를 그대로 쓴다
  async function saveRule(draft: RuleDraft): Promise<string | null> {
    const exists = rules.some((r) => r.id === draft.id);
    const res = await (exists ? updateRule(draft) : createRule(draft));
    if (!res.ok) {
      /* 모달 유지 — 사용자가 재시도/수정 가능. 문장은 위저드가 CTA 위에 띄운다(role=alert).
         예전엔 window.alert 였다 — 브라우저가 대화상자를 막으면 실패가 통째로 안 보였다. */
      return res.error ?? "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
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
    return null;
  }

  /* 조회가 실패했으면 «0» 이 아니라 «—» 다. 0 은 "안 돌고 있다"는 사실 주장이고,
     실패는 "모른다"이다 — 이 화면에서 그 둘을 같은 숫자로 그리면 자동화가 멈춘 줄 안다. */
  const nv = (v: string) => (rulesFailed ? "—" : v);
  const stats = [
    { label: "실행 중 규칙", value: nv(String(derived.active)) },
    { label: "오늘 발송", value: nv(formatCompact(derived.sentToday)) },
    { label: "누적 발송", value: nv(formatCompact(derived.sentTotal)) },
    { label: "발송 성공률", value: nv(`${derived.deliveryRate.toFixed(1)}%`) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="자동 DM"
        description="인스타그램 게시물에 특정 댓글이 달리면 자동으로 다이렉트 메시지를 보냅니다."
        action={
          /* 인스타 연동이 없으면 만들 수 없다 — 댓글이 도착할 경로가 없어 한 통도 안 나간다.
             누르면 막히는 버튼 대신 연결하러 가는 길을 준다(발행 화면의 관문과 같은 규칙). */
          igConnected === false ? (
            <ButtonLink href="/settings/channels">인스타그램 연결하기</ButtonLink>
          ) : igScopeMissing ? null : (
            /* 댓글 권한이 빠진 연동이면 만들기를 내리고 아래 안내의 「다시 연결하기」 하나만 둔다 —
               5단계를 다 채운 뒤 저장에서 막히는 길을 열어 두지 않는다(서버 createRule 도 같은 이유로 막는다) */
            <Button onClick={openNew}>
              <Plus className="size-4" aria-hidden /> 자동화 만들기
            </Button>
          )
        }
      />

      {contentLimit < 1000000 ? (
        <p className="-mt-3 text-[14px] text-fg-sub">
          자동화 콘텐츠{" "}
          <span className="tnum font-semibold text-fg">
            {contentUsed}/{contentLimit}
          </span>
          개 사용 중
          <InfoTip>
            자동화를 걸 수 있는 게시물 개수는 플랜에 따라 다릅니다. 발송 건수에는 제한이 없어요. 같은 게시물에 규칙을
            여러 개 만들어도 콘텐츠 1개로 셉니다.
          </InfoTip>
          {planFailed ? (
            <span className="ml-2 text-warning">
              플랜을 확인하지 못해 무료 기준으로 잠시 제한했어요 — 새로고침하면 정상 한도로 돌아옵니다.
            </span>
          ) : null}
        </p>
      ) : null}

      {igConnected !== false && igScopeMissing ? (
        /* 권한이 확실히 빠졌을 때만 뜬다(«확인 불가»면 안 뜬다). 규칙이 조용히 실패하는 대신 이유와 할 일을 먼저 말한다.
           위 「자동화 콘텐츠」 줄은 -mt-3 으로 제목에 붙어 있어야 해서 그 아래에 둔다 */
        <NoticeBar tone="warning" action={connectAction("reconnect")}>
          인스타그램을 다시 연결해야 자동 DM이 나가요. 댓글에 답장하는 권한이 빠진 채 연결돼 있어서, 지금은 댓글이
          달려도 DM을 보낼 수 없어요. 다시 연결할 때 모든 항목을 허용해 주세요.
        </NoticeBar>
      ) : null}

      {/* 요약 지표 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-[14px] text-fg-sub">{s.label}</p>
            <p className="tnum mt-1 text-2xl font-bold leading-none">{s.value}</p>
          </Card>
        ))}
      </div>
      {/* 규칙이 하나도 없으면 이 줄을 그리지 않는다 — 지표 카드가 「누적 발송 0」이라고 말하는
          바로 아래에서 「최근 30일 2,587건 발송」이 떴다(실측). 두 숫자가 서로를 반박하면
          어느 쪽도 못 믿는다. 캡션은 rules 에서 파생되지 않는 정적 집계라 이렇게 가른다. */}
      {rules.length > 0 && !rulesFailed ? (
      <p className="-mt-3 flex items-center gap-1.5 text-[12px] text-fg-faint">
        최근 30일 {formatCompact(autoDmSummary.sent30d)}건 발송 · 평균 응답률 {autoDmSummary.replyRate}%
        <InfoTip>
          발송 성공률·응답률은 인스타그램이 돌려주는 실제 발송·대화 결과 기준이며 자체 추정치가 아닙니다.
          연동 전에는 예시 데이터로 표시됩니다.
        </InfoTip>
      </p>
      ) : null}

      {/* 규칙 목록 — **실패 분기가 빈 상태보다 앞이다.** 순서가 바뀌면 조회 실패가
          「아직 규칙이 없어요」로 나가고, 사용자는 없는 규칙을 다시 만든다. */}
      {rulesFailed ? (
        <LoadFailed
          title="자동화 규칙을 불러오지 못했어요"
          description="규칙이 없는 게 아니라 목록을 못 읽은 것이에요. 지금 만들면 겹칠 수 있으니 새로고침 후 확인해 주세요."
        />
      ) : igConnected === false ? (
        /* 연동이 없으면 규칙을 만들어 봐야 댓글이 도착할 경로가 없어 한 통도 안 나간다 —
           만들게 두고 초록 「실행 중」을 보여 주는 것이 가장 나쁜 선택이다(2026-09-07 감사) */
        <EmptyState
          icon={MessageSquareReply}
          title="인스타그램을 연결하면 시작할 수 있어요"
          description="자동 DM은 인스타그램에 달린 댓글을 보고 움직여요. 계정을 연결해야 댓글이 도착하고, 그때부터 자동으로 메시지가 나갑니다."
          action={<ButtonLink href="/settings/channels">인스타그램 연결하기</ButtonLink>}
        />
      ) : rules.length === 0 ? (
        <EmptyState
          icon={MessageSquareReply}
          title="아직 자동 DM 규칙이 없어요"
          description="게시물을 고르고 어떤 댓글에 어떤 DM을 보낼지 설정하면, 관심 있는 사람에게 자동으로 메시지가 나갑니다."
          action={
            igScopeMissing ? (
              connectAction("reconnect")
            ) : (
              <Button onClick={openNew}>
                <Plus className="size-4" aria-hidden /> 첫 자동화 만들기
              </Button>
            )
          }
        />
      ) : (
        /* 규칙 카드 2열(xl+) — 세로 1열이라 카드 하나가 폭 1600px 을 쓰고 캡션이
           한 줄로 길게 뻗었다. 카드마다 ~600px 는 필요해 xl 부터 2열로. */
        <ul className="grid gap-3 xl:grid-cols-2">
          {rules.map((rule) => {
            const status = STATUS_META[rule.status];
            const capPct = rule.dailyCap > 0 ? Math.min(100, Math.round((rule.sentToday / rule.dailyCap) * 100)) : 0;
            return (
              <li key={rule.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    {rule.postThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 인스타 CDN 임시 URL이라 next/image 도메인 고정 불가
                      <img
                        src={rule.postThumb}
                        alt=""
                        className="size-14 shrink-0 rounded-card border border-line object-cover"
                      />
                    ) : rule.postId === NEXT_POST_SENTINEL ? (
                      /* 게시물을 지정하지 않은 예약 규칙 — 핀치 로고가 그 자리다(스딩의
                         "다음에 올릴 게시물" 표시에 해당, 2026-08-19 사장님 지시) */
                      <span
                        className="flex size-14 shrink-0 items-center justify-center rounded-card border border-line bg-plate"
                        aria-hidden
                      >
                        <FinchMark className="size-7" />
                      </span>
                    ) : (
                      <span
                        className="flex size-14 shrink-0 items-center justify-center rounded-card border border-line bg-plate text-fg-faint"
                        aria-hidden
                      >
                        <ImageOff className="size-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {rule.postId === NEXT_POST_SENTINEL ? (
                          <Badge tone="primary">다음 게시물 예약</Badge>
                        ) : (
                          <Badge tone="neutral">{POST_TYPE_LABEL[rule.postType]}</Badge>
                        )}
                        <Badge tone={status.tone}>
                          <span className="size-1.5 rounded-full bg-current" aria-hidden />
                          {status.label}
                        </Badge>
                        {rule.isAdvertising ? <Badge tone="warning">광고</Badge> : null}
                      </div>
                      <p className="mt-2 line-clamp-1 text-[15px] font-semibold">{rule.postCaption}</p>

                      {/* 설정 요약 — 스딩 실측(2026-08-19) 형식: 라벨 : 값 줄들.
                          목록만 보고 "이 규칙이 뭘 하는지"를 카드 하나로 다 읽게 한다 */}
                      <dl className="mt-2 space-y-1 text-[14px] leading-relaxed">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <dt className="shrink-0 text-fg-faint">키워드 :</dt>
                          {rule.trigger === "all" ? (
                            <dd className="text-fg-sub">모든 댓글</dd>
                          ) : rule.keywords.length > 0 ? (
                            <dd className="flex flex-wrap gap-1">
                              {rule.keywords.map((k) => (
                                <span
                                  key={k}
                                  className="rounded-chip border border-line bg-body px-2 py-0.5 text-[12px] font-medium"
                                >
                                  {k}
                                </span>
                              ))}
                            </dd>
                          ) : (
                            <dd className="text-fg-faint">키워드 없음</dd>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <dt className="shrink-0 text-fg-faint">DM :</dt>
                          <dd className="line-clamp-2 min-w-0 text-fg-sub">{rule.dmMessage}</dd>
                        </div>
                        {rule.buttons.length > 0 ? (
                          <div className="flex gap-1.5">
                            <dt className="shrink-0 text-fg-faint">연결 링크 :</dt>
                            <dd className="tnum min-w-0 truncate text-fg-sub">
                              {rule.buttons[0].url}
                              {rule.buttons.length > 1 ? ` 외 ${rule.buttons.length - 1}개` : ""}
                            </dd>
                          </div>
                        ) : null}
                        {/* dl 의 div 래퍼는 dt/dd 를 **직접** 담아야 명세에 맞는다 —
                            중첩 div 로 한 단계 더 감싸면 콘텐츠 모델 위반이다 */}
                        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                          <dt className="text-fg-faint">자동 답글 :</dt>
                          <dd className={rule.publicReplies.length > 0 ? "font-semibold text-positive" : "text-fg-sub"}>
                            {rule.publicReplies.length > 0 ? "ON" : "OFF"}
                          </dd>
                          {/* 「팔로우 요청」 표시는 뺐다 — 발송 경로가 이 옵션을 읽지 않아 ON 이어도 아무 일이 없다(2026-09-09, rule-wizard 참조) */}
                        </div>
                      </dl>

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

                    {/* 액션 — 좁은 화면에서는 **아래 줄로 내린다.** 같은 행에 남으면 112px 를 먹어
                        본문 컬럼이 132px 가 되고, 제목·링크·DM 본문이 한 줄에 한글 6~7자로 잘렸다(실측 390px). */}
                    <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto sm:justify-start">
                      {/* «지금 확인» — 실행 중이고 게시물이 정해진 규칙만(«다음 게시물» 예약은 게시물이 정해진 뒤에).
                          누르면 게시물의 최근 댓글을 읽어 조건에 맞는 댓글에 DM 을 보내고, 결과를 모달로 알린다 */}
                      {rule.status === "active" && rule.postId !== NEXT_POST_SENTINEL ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => void checkNow(rule)}
                          aria-busy={checking === rule.id}
                          title="이 게시물의 최근 댓글을 지금 확인해, 조건에 맞는 댓글에 DM을 보내요"
                          className="mr-1"
                        >
                          <RefreshCw className={cn("size-4", checking === rule.id && "animate-spin")} aria-hidden />
                          지금 확인
                        </Button>
                      ) : null}
                      <Switch
                        checked={rule.status === "active"}
                        onChange={() => void toggleStatus(rule)}
                        disabled={rule.status === "review"}
                        busy={toggling.has(rule.id)}
                        label={rule.status === "active" ? "일시중지" : "실행"}
                      />
                      <button
                        type="button"
                        aria-label="편집"
                        onClick={() => openEdit(rule)}
                        /* hover:bg-overlay 는 라이트에서 카드와 같은 흰색이라 반응이 안 보였다 — 호버 틴트 토큰으로 */
                        className="rounded-card p-2 text-fg-sub hover:bg-tint-hover hover:text-fg"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="삭제"
                        onClick={() => setRemoving(rule)}
                        className="rounded-card p-2 text-fg-sub hover:bg-negative-weak hover:text-negative"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  {ruleNotice?.ruleId === rule.id ? (
                    <p role="alert" className="mt-3 border-t border-line pt-3 text-[14px] text-negative-strong">
                      {ruleNotice.text}
                    </p>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {editorOpen ? (
        <RuleWizard
          initial={editing}
          posts={igPosts}
          existingRules={rules}
          contentLimit={contentLimit}
          accountHandle={accountHandle}
          postsFailed={postsFailed}
          accountAvatar={accountAvatar}
          followRequestReady={followRequestReady}
          onSave={saveRule}
          onClose={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title="이 자동화를 지울까요?"
          description="규칙과 문구가 함께 사라지고 되돌릴 수 없어요."
          confirmLabel="삭제"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const rule = removing;
            setRemoving(null);
            void removeRule(rule);
          }}
        />
      ) : null}

      {/* «지금 확인» 막 — 0.2초(--loading-delay) 안에 끝나면 끝내 안 보이고(번쩍임 없음), 넘으면 로더와 함께 덮인다.
          댓글 수십 개를 읽고 보내는 데 수십 초가 걸릴 수 있어 그동안 다른 스위치를 건드리지 못하게 한다(편집기 작업 막과 같은 모양) */}
      {checking ? (
        <div className="busy-veil-in fixed inset-0 z-[60] m-0! flex items-center justify-center bg-surface/70 backdrop-blur-[2px]">
          <FinchLoader label="댓글을 확인하고 있어요…" />
        </div>
      ) : null}

      <ResultModal
        result={
          checkResult
            ? { tone: checkResult.tone, title: checkResult.title, description: checkResult.description, lines: checkResult.lines }
            : null
        }
        onClose={() => setCheckResult(null)}
        action={checkResult?.reconnect ? connectAction(checkResult.reconnect) : null}
      />
    </div>
  );
}
