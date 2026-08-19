"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Layers,
  Link2,
  Palette,
  Plus,
  Rocket,
  Settings,
  Trash2,
  User,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DualLineChart } from "@/components/ui/charts";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { publicLinkUrl, stableJson } from "@/lib/links";
import { BLOCK_CATALOG, blockSummary, hiddenReason, type BlockType, type LinkBlock } from "@/lib/links/blocks";
import { LAYOUTS, LINK_THEMES, SNS_KINDS } from "@/lib/links/themes";
import { LINK_TEMPLATES } from "@/lib/links/templates";
import {
  addBlock,
  addBlocksBulk,
  applyTemplate,
  createLinkPage,
  deleteBlock,
  deleteLinkPage,
  moveBlock,
  publishLinkPage,
  setLinkPublished,
  updateBlock,
  updateLinkImages,
  updateLinkProfile,
  updateLinkTheme,
} from "../actions";
import type { LinkLead, LinkPageView, LinkSnapshotView, LinkStats } from "@/lib/links/types";
import { BlockEditor, EDITOR_TITLE_ID } from "./block-editor";
import { ImageField } from "./image-field";
import { ImportLinks } from "./import-links";
import { PhonePreview } from "./phone-preview";

/*
  프로필 링크 편집기 — 링크팜 빌더 구조를 실측 조사해 재구성(2026-08-17),
  링크팜과 대조 점검한 결함을 반영(2026-08-19).

  좌: **라이브 미리보기**(공개 페이지와 같은 숨김 규칙을 따른다)
  우: **5탭 패널** 프로필 / 테마 / 블록 / 통계 / 설정
  상단: 주소·복사·열기 + **라이브 반영**(초안 → 공개 스냅샷)

  링크팜과 다르게 간 것:
   · 링크팜은 미리보기 안에서 직접 편집(호버 툴바)한다. 우리는 **목록에서 편집**하되
     미리보기 블록을 누르면 그 블록의 편집기가 열린다 — 블록이 15종이라 인라인으로는
     필드를 다 못 넣고, 무엇보다 키보드로 조작할 수 있어야 한다.
   · 드래그 정렬 대신 ↑↓ 버튼. 모바일에서 드래그는 스크롤과 싸운다.

  서버 액션만 쓴다. 서버 액션이 revalidatePath 를 부르므로 **router.refresh 를 따로
  부르지 않는다** — 부르면 같은 집계 질의가 한 조작에 두 번 돈다.
*/

type Tab = "profile" | "theme" | "blocks" | "stats" | "settings";

const TABS: Array<{ key: Tab; label: string; icon: typeof User }> = [
  { key: "profile", label: "프로필", icon: User },
  { key: "theme", label: "테마", icon: Palette },
  { key: "blocks", label: "블록", icon: Layers },
  { key: "stats", label: "통계", icon: BarChart3 },
  { key: "settings", label: "설정", icon: Settings },
];

const LEAVE_WARNING = "저장하지 않은 편집 내용이 사라져요. 그래도 나갈까요?";

export function LinksClient({
  page,
  blocks,
  snapshot,
  origin,
  stats,
  leads,
  isDemo,
}: {
  page: LinkPageView | null;
  blocks: LinkBlock[];
  snapshot: LinkSnapshotView | null;
  origin: string;
  stats: LinkStats;
  leads: LinkLead[];
  isDemo: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("blocks");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  /* 미리보기가 그리는 것: 초안(편집 중) / 라이브(마지막 발행본).
     링크팜은 이 둘을 나란히 두 판으로 보여주는데, 우리 지면에는 한 판 자리라
     토글로 간다 — 목적(초안과 라이브를 눈으로 비교)은 같다. */
  const [previewMode, setPreviewMode] = useState<"draft" | "live">("draft");

  /* 편집 중인 블록 값은 **여기서** 들고 있다 — 편집기 안에 가둬 두면 탭을 누르는
     시점에 부모가 "미저장인가"를 알 수 없다. baseline 은 마지막으로 서버에 반영된 값. */
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [baseline, setBaseline] = useState("");
  const editorDirty = editingId !== null && stableJson(draft) !== baseline;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    if (busy) {
      /* 앞선 작업이 끝날 때까지 조용히 삼킨다. **삼켰다는 사실은 알려야 한다** —
         ↑↓ 는 포커스가 튀지 않게 일부러 비활성화하지 않으므로, 눌렀는데 아무 일도
         안 일어나는 게 화면상 구분되지 않는다. */
      setNotice("앞선 작업을 처리하는 중이에요. 잠시 후 다시 눌러 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) setError(res.error ?? "처리하지 못했어요.");
        else onOk?.();
      } finally {
        setBusy(false);
      }
    });
  }

  function openEditor(id: string) {
    if (!leaveEditor()) return;
    const data = blocks.find((b) => b.id === id)?.data ?? {};
    setDraft(data);
    setBaseline(stableJson(data));
    setEditingId(id);
    /* 앞선 조작의 실패 문구를 들고 들어가지 않는다 — 안 누른 폼이 실패한 것처럼 읽힌다 */
    setError(null);
    /* 새로 열린 패널의 제목으로 포커스를 옮긴다 — 목록에 남겨두면 키보드·스크린리더
       사용자는 화면이 바뀐 걸 모른다. 닫을 때 closeEditor 가 원래 행으로 되돌린다. */
    requestAnimationFrame(() => document.getElementById(EDITOR_TITLE_ID)?.focus());
  }

  /**
   * 편집기를 벗어나기 전 관문.
   *
   * 탭 버튼이 편집 필드 바로 위에 있다. "테마가 뭐였지" 하고 한 번 누르면 그리드
   * 항목 12개의 제목·주소·업로드까지 끝낸 이미지 경로가 경고 없이 날아갔다.
   */
  function leaveEditor(): boolean {
    if (!editorDirty) return true;
    return window.confirm(LEAVE_WARNING);
  }

  /** 편집기를 닫고 **원래 눌렀던 목록 행으로 포커스를 되돌린다** */
  function closeEditor(focusBackTo?: string | null) {
    if (!leaveEditor()) return;
    setEditingId(null);
    setError(null);
    if (focusBackTo) {
      requestAnimationFrame(() => document.getElementById(`blk-${focusBackTo}`)?.focus());
    }
  }

  if (!page) {
    return (
      <CreateForm
        onCreate={(slug, title) => run(() => createLinkPage(slug, title))}
        error={error}
        busy={busy}
        isDemo={isDemo}
      />
    );
  }

  const editing = blocks.find((b) => b.id === editingId) ?? null;

  return (
    <div className="space-y-4">
      {/* 데모 모드는 **눌러보기 전에** 알린다 — 저장은 서버 액션이 막는다 */}
      {isDemo ? (
        <p className="card-face px-4 py-3 text-[14px] leading-[1.6] text-fg-sub">
          <strong className="font-semibold text-fg">예시 페이지</strong>예요. 편집기를 둘러볼 수 있지만 저장은 되지
          않아요. 로그인하면 내 프로필 링크를 만들 수 있습니다.
        </p>
      ) : null}

      {/* 상단 바 — 주소·복사·열기 + 라이브 반영 */}
      <TopBar page={page} origin={origin} busy={busy} onPublish={() => run(() => publishLinkPage())} />

      {error ? (
        <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak p-4 text-[15px] text-negative-strong">
          {error}
        </p>
      ) : null}

      {/* 순서 이동 결과를 스크린리더에 알린다 — 화면에서는 목록이 바뀌는 게 보이지만
          목록 밖에 포커스가 있으면 아무 일도 안 일어난 것과 같다 */}
      <p aria-live="polite" className="sr-only">
        {notice}
      </p>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        {/* 좌 — 미리보기. 초안/라이브를 토글로 오간다(링크팜은 두 판을 나란히 두는데,
            우리 지면은 한 판 자리다 — 목적은 같다: 초안과 발행본을 눈으로 비교). */}
        <Card className="xl:sticky xl:top-6">
          <CardHeader
            title="미리보기"
            description={
              previewMode === "live"
                ? "지금 공개 주소에 걸려 있는 모습이에요."
                : page.publishedAt
                  ? page.dirty
                    ? "지금 화면은 초안이에요. 「라이브 반영」을 눌러야 공개 주소에 나갑니다."
                    : "공개 주소와 같은 상태예요."
                  : "아직 발행하지 않았어요. 「라이브 반영」을 누르면 공개 주소가 살아납니다."
            }
          />
          <CardBody className="space-y-3">
            <div role="group" aria-label="미리보기 대상" className="flex justify-center gap-1">
              {(
                [
                  { key: "draft", label: "초안" },
                  { key: "live", label: "라이브" },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={previewMode === m.key}
                  disabled={m.key === "live" && !snapshot}
                  onClick={() => setPreviewMode(m.key)}
                  className={cn(
                    "trans-state rounded-chip px-3 py-1 text-[12px] font-semibold disabled:opacity-40",
                    previewMode === m.key
                      ? "bg-primary text-on-primary"
                      : "border border-line text-fg-sub hover:bg-tint-hover hover:text-fg",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {previewMode === "live" && snapshot ? (
              <PhonePreview
                /* 발행본은 프로필·테마까지 초안과 다를 수 있다 — 스냅샷의 값으로 통째로
                   바꿔 그린다. 초안 테마로 그리면 "라이브 모습"이라는 약속이 거짓이 된다. */
                page={{
                  ...page,
                  title: snapshot.title,
                  bio: snapshot.bio,
                  layout: snapshot.layout,
                  theme: snapshot.theme,
                  align: snapshot.align,
                  avatarPath: snapshot.avatarPath,
                  coverPath: snapshot.coverPath,
                  snsLinks: snapshot.snsLinks,
                  snsPlacement: snapshot.snsPlacement ?? "profile",
                  titleSize: snapshot.titleSize ?? "md",
                }}
                blocks={snapshot.blocks.map((b, i) => ({
                  id: b.id,
                  type: b.type as LinkBlock["type"],
                  data: b.data ?? {},
                  sortOrder: i,
                  active: true,
                }))}
                mode="live"
                selectedId={null}
              />
            ) : (
              <PhonePreview
                page={page}
                blocks={blocks.filter((b) => b.active)}
                selectedId={editingId}
                onPick={(id) => {
                  setTab("blocks");
                  openEditor(id);
                }}
              />
            )}
          </CardBody>
        </Card>

        {/* 우 — 5탭 패널 */}
        <Card className="xl:sticky xl:top-6">
          <CardBody className="space-y-4">
            <div role="tablist" aria-label="편집 도구" className="grid grid-cols-5 gap-1.5">
              {TABS.map((t) => {
                const on = tab === t.key && !editing;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      if (!leaveEditor()) return;
                      setTab(t.key);
                      setEditingId(null);
                      /* 오류는 그 조작에 붙은 것이다 — 탭을 옮기면 함께 사라져야 한다.
                         안 그러면 프로필 「저장」 버튼 위에 방금 블록에서 난 URL 오류가
                         role="alert" 로 떠서, 누른 적도 없는 폼이 실패한 것처럼 읽힌다. */
                      setError(null);
                    }}
                    className={cn(
                      "trans-state flex flex-col items-center gap-1 rounded-card px-1.5 py-2 text-[11px] font-semibold",
                      on ? "bg-primary text-on-primary" : "border border-line text-fg-sub hover:bg-tint-hover hover:text-fg",
                    )}
                  >
                    <t.icon className="size-4" aria-hidden />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {editing ? (
              <BlockEditor
                block={editing}
                value={draft}
                onChange={setDraft}
                busy={busy}
                error={error}
                dirty={editorDirty}
                onClose={() => closeEditor(editing.id)}
                onRevert={() => {
                  const data = editing.data ?? {};
                  setDraft(data);
                  setBaseline(stableJson(data));
                }}
                /* 저장이 성공해야 기준선을 옮긴다 — 실패하면 「저장 안 됨」이 남고
                   탭을 눌러 나갈 때 확인을 받는다(그게 맞다). */
                onSave={(data) => run(() => updateBlock(editing.id, { data }), () => setBaseline(stableJson(data)))}
              />
            ) : tab === "profile" ? (
              <ProfilePanel
                page={page}
                busy={busy}
                error={error}
                onSave={(v) => run(() => updateLinkProfile(v))}
                onImages={(v) => run(() => updateLinkImages(v))}
              />
            ) : tab === "theme" ? (
              <ThemePanel current={page.theme} busy={busy} onPick={(k) => run(() => updateLinkTheme(k))} />
            ) : tab === "blocks" ? (
              <BlocksPanel
                blocks={blocks}
                busy={busy}
                onAdd={(t) => run(() => addBlock(t))}
                onApplyTemplate={(k) => run(() => applyTemplate(k))}
                onImport={(items) =>
                  run(
                    () => addBlocksBulk(items),
                    () => setNotice(`링크 ${items.length}개를 추가했어요.`),
                  )
                }
                onEdit={openEditor}
                onToggle={(id, active) => run(() => updateBlock(id, { active }))}
                /* 안내는 **성공했을 때만** 나간다. 앞서는 run() 밖에서 동기로 불러서,
                   연타로 무시된 클릭이나 서버 실패에도 「옮겼어요」가 읽혔다 —
                   목록을 눈으로 못 보는 사용자에게는 그게 확정이다. */
                onMove={(id, dir, label) =>
                  run(
                    () => moveBlock(id, dir),
                    () => setNotice(`${label} 블록을 ${dir === "up" ? "위로" : "아래로"} 옮겼어요.`),
                  )
                }
                onDelete={(id) => run(() => deleteBlock(id))}
              />
            ) : tab === "stats" ? (
              <StatsPanel
                stats={stats}
                onRange={(d) => router.push(`/links?days=${d}`, { scroll: false })}
                busy={busy}
              />
            ) : (
              <SettingsPanel
                page={page}
                leads={leads}
                busy={busy}
                onPublishToggle={(v) => run(() => setLinkPublished(v))}
                onDelete={() => run(() => deleteLinkPage())}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   상단 바
   ══════════════════════════════════════════════════════════════════ */

function TopBar({
  page,
  origin,
  busy,
  onPublish,
}: {
  page: LinkPageView;
  origin: string;
  busy: boolean;
  onPublish: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = publicLinkUrl(page.slug, origin);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 권한 거부·비보안 컨텍스트 — 주소가 화면에 보이니 손으로 복사하면 된다 */
    }
  }

  return (
    /* card-face — 바로 아래 카드들과 같은 높이로 떠야 한다. bg-body 만 주면
       라이트에서 이 줄만 그림자가 빠져 지면에 눌어붙어 보인다. */
    <div className="card-face flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <code className="min-w-0 flex-1 truncate text-[12px] text-fg-sub">{url}</code>

      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-chip px-2.5 py-1 text-[12px] font-semibold",
          page.published ? "bg-positive-weak text-positive-strong" : "bg-plate text-fg-sub",
        )}
      >
        {page.published ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
        {page.published ? "공개" : "비공개"}
      </span>

      <Button variant="secondary" size="sm" onClick={copy}>
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {copied ? "복사됨" : "복사"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
        <ExternalLink className="size-3.5" aria-hidden />
        열기
      </Button>

      {/* 발행 상태는 **버튼 라벨이 아니라 칩**으로 보여준다(링크팜 실측 반영).
          버튼 글자가 「반영됨」으로 바뀌는 방식은 상태와 액션이 한 몸이라,
          "지금 라이브가 최신인가"를 버튼이 비활성화된 이유에서 역산해야 했다. */}
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-chip px-2.5 py-1 text-[12px] font-semibold",
          !page.publishedAt
            ? "bg-plate text-fg-sub"
            : page.dirty
              ? "bg-warning-weak text-warning-strong"
              : "bg-positive-weak text-positive-strong",
        )}
      >
        {!page.publishedAt ? (
          "발행 전"
        ) : page.dirty ? (
          "초안 수정됨"
        ) : (
          <>
            <Check className="size-3" aria-hidden />
            최신
          </>
        )}
      </span>

      {/* 라이브 반영 — 초안을 공개 스냅샷으로. 바뀐 게 없으면 눌러도 의미가 없다 */}
      <Button size="sm" onClick={onPublish} disabled={busy || (!page.dirty && !!page.publishedAt)}>
        <Rocket className="size-3.5" aria-hidden />
        {busy ? "반영 중…" : "라이브 반영"}
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   블록 패널
   ══════════════════════════════════════════════════════════════════ */

function BlocksPanel({
  blocks,
  busy,
  onAdd,
  onApplyTemplate,
  onImport,
  onEdit,
  onToggle,
  onMove,
  onDelete,
}: {
  blocks: LinkBlock[];
  busy: boolean;
  onAdd: (t: BlockType) => void;
  onApplyTemplate: (key: string) => void;
  onImport: (items: Array<{ label: string; url: string }>) => void;
  onEdit: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onMove: (id: string, dir: "up" | "down", label: string) => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, typeof BLOCK_CATALOG>();
    for (const c of BLOCK_CATALOG) {
      const list = m.get(c.group) ?? [];
      list.push(c);
      m.set(c.group, list);
    }
    return [...m.entries()];
  }, []);

  if (adding) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-bold">블록 추가</h3>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
            닫기
          </Button>
        </div>
        {groups.map(([group, list]) => (
          <div key={group}>
            <p className="text-[12px] font-semibold text-fg-sub">{group}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {list.map((c) => (
                <button
                  key={c.type}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onAdd(c.type);
                    setAdding(false);
                  }}
                  className="trans-state rounded-card border border-line px-3 py-2.5 text-left hover:border-primary hover:bg-tint-hover disabled:opacity-50"
                >
                  <span className="block text-[14px] font-semibold">{c.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-fg-sub">{c.hint}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold">
          블록 <span className="tnum text-fg-sub">{blocks.length}</span>
        </h3>
        <Button size="sm" onClick={() => setAdding(true)} disabled={busy}>
          <Plus className="size-3.5" aria-hidden />
          추가
        </Button>
      </div>

      {/* 템플릿 — 빈 캔버스에서 "뭘 만들지"에 멈추는 지점을 넘긴다.
          적용은 기존 블록을 덮으므로 확인을 받는다. */}
      <details className="rounded-card border border-line">
        <summary className="cursor-pointer px-3 py-2 text-[14px] font-semibold">✨ 템플릿으로 시작</summary>
        <div className="space-y-1.5 px-3 pb-3">
          {LINK_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={busy}
              onClick={() => {
                if (blocks.length > 0 && !window.confirm("지금 블록이 모두 지워지고 템플릿으로 바뀝니다. 계속할까요?")) return;
                onApplyTemplate(t.key);
              }}
              className="trans-state w-full rounded-card border border-line px-3 py-2 text-left hover:border-primary hover:bg-tint-hover disabled:opacity-50"
            >
              <span className="block text-[14px] font-semibold">
                {t.name} <span className="tnum font-normal text-fg-sub">{t.blocks.length}블록</span>
              </span>
              <span className="mt-0.5 block text-[12px] text-fg-sub">{t.hint}</span>
            </button>
          ))}
        </div>
      </details>

      {/* 다른 서비스에서 옮겨오기 — 템플릿과 같은 격의 접이식.
          생성 폼에 두면 이미 페이지가 있는 사용자가 영원히 못 본다. */}
      <ImportLinks busy={busy} onImport={onImport} />

      {blocks.length === 0 ? (
        <p className="text-[14px] text-fg-sub">「추가」를 눌러 첫 블록을 만들거나, 위 템플릿으로 시작해 보세요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {blocks.map((b, i) => {
            const label = blockSummary(b.type, b.data);
            const hidden = hiddenReason(b.type, b.data);
            return (
              <li key={b.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
                {/* ↑↓ 는 p-1.5(28px)·사이 간격 — 앞서 18px 로 맞붙어 있어 WCAG 24px 미달이었고
                    같은 행의 삭제 버튼(28px)과도 크기가 달랐다.
                    ⚠️ busy 로 **비활성화하지 않는다.** 누른 버튼이 눌리는 순간 disabled 가 되면
                    포커스가 문서 맨 위로 튄다(연타 방지는 run() 이 이미 한다). */}
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => onMove(b.id, "up", label)}
                    disabled={i === 0}
                    aria-label={`${label} 위로`}
                    className="trans-state rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-fg disabled:opacity-30"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(b.id, "down", label)}
                    disabled={i === blocks.length - 1}
                    aria-label={`${label} 아래로`}
                    className="trans-state rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-fg disabled:opacity-30"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>

                <button
                  type="button"
                  id={`blk-${b.id}`}
                  onClick={() => onEdit(b.id)}
                  className={cn("min-w-0 flex-1 text-left", !b.active && "opacity-50")}
                >
                  <span className="block text-[12px] font-medium text-fg-sub">
                    {BLOCK_CATALOG.find((c) => c.type === b.type)?.label ?? b.type}
                  </span>
                  <span className="block truncate text-[14px] font-semibold">{label}</span>
                  {/* 발행해도 안 나오는 블록은 **여기서** 알려야 한다 — 안 그러면
                      "분명 만들었는데 공개 페이지에 없다"를 방문자 제보로 알게 된다 */}
                  {b.active && hidden ? (
                    <span className="mt-0.5 block text-[12px] text-negative-strong">{hidden}</span>
                  ) : null}
                </button>

                {/* 접근성 이름에 블록 요약을 넣는다 — "노출" 고정이면 6개가 전부 같은 이름이다.
                    disabled={busy} 는 안 건다: 누르는 순간 비활성화되면 포커스가 문서 맨 위로
                    튄다(↑↓ 와 같은 이유). 연타는 run() 의 busy 가드가 막는다. */}
                <Switch checked={b.active} onChange={(v) => onToggle(b.id, v)} label={`${label} 노출`} />

                {/* 삭제는 되돌릴 수 없다(DB 물리 삭제). 항목 8개를 손으로 채운 그리드를
                    잘못 누르면 끝이다 — 덜 파괴적인 템플릿 적용에도 확인이 있다. */}
                {confirmId === b.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <Button variant="danger" size="sm" disabled={busy} onClick={() => onDelete(b.id)}>
                      삭제
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                      취소
                    </Button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(b.id)}
                    aria-label={`${label} 삭제`}
                    className="trans-state shrink-0 rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-negative"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   프로필 패널
   ══════════════════════════════════════════════════════════════════ */

function ProfilePanel({
  page,
  busy,
  error,
  onSave,
  onImages,
}: {
  page: LinkPageView;
  busy: boolean;
  error: string | null;
  onImages: (v: { avatarPath?: string | null; coverPath?: string | null }) => void;
  onSave: (v: {
    slug: string;
    title: string;
    bio: string;
    layout: string;
    align: string;
    snsLinks: Array<{ kind: string; url: string }>;
    snsPlacement: string;
    titleSize: string;
    seoTitle: string;
    seoDesc: string;
  }) => void;
}) {
  const [slug, setSlug] = useState(page.slug);
  const [title, setTitle] = useState(page.title);
  const [bio, setBio] = useState(page.bio);
  const [layout, setLayout] = useState(page.layout);
  const [align, setAlign] = useState(page.align);
  const [sns, setSns] = useState(page.snsLinks);
  const [snsPlacement, setSnsPlacement] = useState(page.snsPlacement);
  const [titleSize, setTitleSize] = useState(page.titleSize);
  const [seoTitle, setSeoTitle] = useState(page.seoTitle);
  const [seoDesc, setSeoDesc] = useState(page.seoDesc);

  /* 서버가 새 값을 주면 입력창을 맞춘다 — 저장 시 서버가 slug 를 소문자화하고
     제목·소개를 자른다. 동기화가 없으면 저장 후에도 옛 값이 남아 되돌려 쓴다.
     effect 대신 렌더 시점 조정(레포 관례).

     ⚠️ **객체 동일성(page !== prev)으로 판정하면 안 된다.** page 는 서버 렌더마다
     새로 만들어지는 객체 리터럴이라(links/page.tsx) 값이 하나도 안 바뀌어도 항상 다르다.
     그러면 이 패널이 떠 있는 동안 일어나는 **아무 서버 액션**(상단 「라이브 반영」,
     프로필 사진 업로드 — 이건 설계상 즉시 저장이다)이 revalidatePath 로 새 props 를
     내려보내는 순간, 아직 저장 안 한 설명·주소·SNS 가 경고 없이 서버 값으로 덮인다.
     블록 편집기는 draft/baseline 으로 막아뒀는데 이 폼만 무방비였다.
     값으로 비교하면 서버가 **실제로 정규화했을 때만** 입력창을 맞춘다. */
  const serverKey = stableJson({
    slug: page.slug,
    title: page.title,
    bio: page.bio,
    layout: page.layout,
    align: page.align,
    snsLinks: page.snsLinks,
    snsPlacement: page.snsPlacement,
    titleSize: page.titleSize,
    seoTitle: page.seoTitle,
    seoDesc: page.seoDesc,
  });
  const [prevKey, setPrevKey] = useState(serverKey);
  if (serverKey !== prevKey) {
    setPrevKey(serverKey);
    setSlug(page.slug);
    setTitle(page.title);
    setBio(page.bio);
    setLayout(page.layout);
    setAlign(page.align);
    setSns(page.snsLinks);
    setSnsPlacement(page.snsPlacement);
    setTitleSize(page.titleSize);
    setSeoTitle(page.seoTitle);
    setSeoDesc(page.seoDesc);
  }

  const input =
    "h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";

  return (
    <div className="space-y-4">
      <h3 className="text-[15px] font-bold">프로필</h3>

      <div>
        <p className="text-[12px] font-medium text-fg-sub">레이아웃</p>
        {/* 글자 대신 **그림**으로 고른다(링크팜 실측 반영) — "커버+프로필"이라는 말보다
            배너 위에 원이 얹힌 그림이 한눈에 들어온다. 그림은 순수 CSS. */}
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setLayout(l.key)}
              aria-pressed={layout === l.key}
              className={cn(
                "trans-state rounded-card border p-2 text-[12px] font-semibold",
                layout === l.key ? "border-2 border-primary" : "border border-line hover:bg-tint-hover",
              )}
            >
              <span
                className="relative flex h-12 flex-col items-center overflow-hidden rounded-[8px] bg-plate pt-1.5"
                aria-hidden
              >
                {l.key !== "profile" ? <span className="absolute inset-x-0 top-0 h-4 bg-fg/20" /> : null}
                {l.key !== "cover" ? (
                  <span className={cn("relative z-10 size-4 rounded-full bg-fg/40", l.key === "cover_profile" && "mt-1")} />
                ) : (
                  <span className="mt-4 h-1.5 w-8 rounded-full bg-fg/30" />
                )}
                <span className="mt-1 h-1 w-10 rounded-full bg-fg/20" />
                <span className="mt-0.5 h-1 w-7 rounded-full bg-fg/15" />
              </span>
              <span className="mt-1 block">{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 이미지는 **고르는 즉시 저장**한다 — 업로드가 이미 서버 왕복이라, 여기서 또
          「저장」을 누르게 하면 올렸는데 반영이 안 되는 것처럼 보인다. */}
      {layout !== "cover" ? (
        <ImageField
          label="프로필 사진"
          value={page.avatarPath ?? ""}
          onChange={(v) => onImages({ avatarPath: v || null })}
          aspect="aspect-square"
        />
      ) : null}
      {layout === "cover" || layout === "cover_profile" ? (
        <ImageField
          label="커버 이미지"
          value={page.coverPath ?? ""}
          onChange={(v) => onImages({ coverPath: v || null })}
          aspect="aspect-[3/1]"
        />
      ) : null}

      <div>
        <label htmlFor="p-slug" className="block text-[12px] font-medium text-fg-sub">
          주소 (/p/…)
        </label>
        <input id="p-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={30} className={`mt-1.5 ${input}`} />
      </div>

      <div>
        <label htmlFor="p-title" className="block text-[12px] font-medium text-fg-sub">
          타이틀
        </label>
        <input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} className={`mt-1.5 ${input}`} />
      </div>

      <div>
        <label htmlFor="p-bio" className="block text-[12px] font-medium text-fg-sub">
          설명
        </label>
        <textarea
          id="p-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={2}
          maxLength={160}
          placeholder="한 줄 소개"
          className="mt-1.5 w-full rounded-card border border-line bg-body px-3 py-2 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <p className="text-[12px] font-medium text-fg-sub">정렬</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {(["left", "center", "right"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAlign(a)}
              aria-pressed={align === a}
              className={cn(
                "trans-state rounded-card border px-2 py-1.5 text-[12px] font-semibold",
                align === a ? "border-2 border-primary" : "border border-line hover:bg-tint-hover",
              )}
            >
              {a === "left" ? "왼쪽" : a === "center" ? "가운데" : "오른쪽"}
            </button>
          ))}
        </div>
      </div>

      {/* 타이틀 크기·SNS 위치 — 링크팜 프로필 설정 실측(2026-08-19)에서 가져온 둘.
          링크팜의 「드래그」 배치는 안 가져온다 — 우리는 드래그 정렬 자체를 뺐다.
          ⚠️ 0051 컬럼이 아직 없으면 **비활성화한다** — 저장이 조용히 버려지는데
          성공으로 보이는 컨트롤은 없느니만 못하다. */}
      <div>
        <p className="text-[12px] font-medium text-fg-sub">타이틀 크기</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {(
            [
              { key: "sm", label: "작게" },
              { key: "md", label: "보통" },
              { key: "lg", label: "크게" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={!page.optionsReady}
              onClick={() => setTitleSize(t.key)}
              aria-pressed={titleSize === t.key}
              className={cn(
                "trans-state rounded-card border px-2 py-1.5 font-semibold disabled:opacity-40",
                t.key === "sm" ? "text-[12px]" : t.key === "md" ? "text-[14px]" : "text-[17px]",
                titleSize === t.key ? "border-2 border-primary" : "border border-line hover:bg-tint-hover",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[12px] font-medium text-fg-sub">SNS 아이콘 위치</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(
            [
              { key: "profile", label: "소개 아래" },
              { key: "links", label: "링크 위" },
            ] as const
          ).map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={!page.optionsReady}
              onClick={() => setSnsPlacement(o.key)}
              aria-pressed={snsPlacement === o.key}
              className={cn(
                "trans-state rounded-card border px-2 py-1.5 text-[12px] font-semibold disabled:opacity-40",
                snsPlacement === o.key ? "border-2 border-primary" : "border border-line hover:bg-tint-hover",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {!page.optionsReady ? (
        <p className="text-[12px] leading-relaxed text-fg-sub">
          타이틀 크기·SNS 위치는 서버 업데이트(0051) 적용 후 쓸 수 있어요.
        </p>
      ) : null}

      <div>
        <p className="text-[12px] font-medium text-fg-sub">SNS 링크</p>
        <div className="mt-1.5 space-y-2">
          {sns.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                value={s.kind}
                onChange={(e) => setSns((v) => v.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}
                aria-label={`SNS ${i + 1} 종류`}
                className="h-10 shrink-0 rounded-card border border-line bg-body px-2 text-[14px] text-fg focus:border-primary focus:outline-none"
              >
                {SNS_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
              <input
                value={s.url}
                onChange={(e) => setSns((v) => v.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                placeholder="https://…"
                aria-label={`SNS ${i + 1} 주소`}
                className="h-10 min-w-0 flex-1 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setSns((v) => v.filter((_, j) => j !== i))}
                aria-label="SNS 링크 삭제"
                className="trans-state rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-negative"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {sns.length < 8 ? (
            <Button variant="secondary" size="sm" onClick={() => setSns((v) => [...v, { kind: "instagram", url: "" }])}>
              <Plus className="size-3.5" aria-hidden />
              SNS 추가
            </Button>
          ) : null}
        </div>
      </div>

      {/* 검색·공유 — 컬럼·저장·스냅샷·메타데이터까지 배선이 다 돼 있는데 입력칸 두 개가
          없어서 값이 영구히 비어 있었다. 카톡·DM 에 붙여넣을 때 보이는 글이 이거다. */}
      <details className="rounded-card border border-line">
        <summary className="cursor-pointer px-3 py-2 text-[14px] font-semibold">검색·공유에 보이는 글</summary>
        <div className="space-y-3 px-3 pb-3">
          <p className="text-[12px] leading-snug text-fg-sub">
            카카오톡·인스타 DM 에 주소를 붙여넣으면 뜨는 미리보기 문구예요. 비워두면 타이틀과 설명을 그대로 씁니다.
          </p>
          <div>
            <label htmlFor="p-seot" className="block text-[12px] font-medium text-fg-sub">
              공유 제목 <span className="tnum text-fg-faint">{seoTitle.length}/60</span>
            </label>
            <input id="p-seot" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={60} placeholder={page.title || "브랜드 이름"} className={`mt-1.5 ${input}`} />
          </div>
          <div>
            <label htmlFor="p-seod" className="block text-[12px] font-medium text-fg-sub">
              공유 설명 <span className="tnum text-fg-faint">{seoDesc.length}/160</span>
            </label>
            <textarea
              id="p-seod"
              value={seoDesc}
              onChange={(e) => setSeoDesc(e.target.value)}
              rows={2}
              maxLength={160}
              placeholder={page.bio || "한 줄 소개"}
              className="mt-1.5 w-full rounded-card border border-line bg-body px-3 py-2 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </details>

      {/* 실패 메시지를 **누른 버튼 옆에도** 둔다. 화면 맨 위 배너만 있으면 패널 아래쪽에서
          저장한 사용자는 "저장 중…"이 끝난 것만 보고 저장된 줄 안다. */}
      {error ? (
        <p role="alert" className="text-[14px] text-negative-strong">
          {error}
        </p>
      ) : null}

      <Button
        variant="secondary"
        disabled={busy}
        onClick={() =>
          onSave({ slug, title, bio, layout, align, snsLinks: sns, snsPlacement, titleSize, seoTitle, seoDesc })
        }
      >
        {busy ? "저장 중…" : "저장"}
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   테마 패널
   ══════════════════════════════════════════════════════════════════ */

function ThemePanel({ current, busy, onPick }: { current: string; busy: boolean; onPick: (k: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, typeof LINK_THEMES>();
    for (const t of LINK_THEMES) {
      const list = m.get(t.group) ?? [];
      list.push(t);
      m.set(t.group, list);
    }
    return [...m.entries()];
  }, []);

  return (
    <div className="space-y-4">
      <h3 className="text-[15px] font-bold">테마</h3>
      {groups.map(([group, list]) => (
        <div key={group}>
          <p className="text-[11px] font-bold tracking-[0.08em] text-fg-sub">{group}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {list.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={busy}
                onClick={() => onPick(t.key)}
                aria-pressed={current === t.key}
                className={cn(
                  "trans-state overflow-hidden rounded-card border text-left disabled:opacity-50",
                  current === t.key ? "border-2 border-primary" : "border border-line hover:border-line-strong",
                )}
              >
                {/* 테마 미니 미리보기 — 실제 색으로 칠한다 */}
                <span className="block h-16 p-2.5" style={{ background: t.bg }}>
                  <span className="block h-4 w-full rounded-full" style={{ background: t.accent }} aria-hidden />
                  <span
                    className="mt-1.5 block h-4 w-full rounded-full border"
                    style={{ background: t.card, borderColor: t.border }}
                    aria-hidden
                  />
                </span>
                <span className="block px-2.5 py-1.5 text-[14px] font-semibold">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   통계 패널
   ══════════════════════════════════════════════════════════════════ */

function StatsPanel({
  stats,
  onRange,
  busy,
}: {
  stats: LinkStats;
  onRange: (days: number) => void;
  busy: boolean;
}) {
  /* 분모가 0이면 비율은 "0%"가 아니라 **모름**이다. 0% 로 찍으면 성과가 나쁜 것처럼 읽힌다 */
  const ratio = (v: number, denom: number) => (denom > 0 ? `${v}%` : "—");
  const maxBlock = Math.max(1, ...stats.blocks.map((b) => b.clicks));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold">통계</h3>
        <div className="flex gap-1" role="group" aria-label="조회 기간">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              disabled={busy}
              onClick={() => onRange(d)}
              aria-pressed={stats.days === d}
              className={cn(
                "trans-state tnum rounded-chip px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50",
                stats.days === d ? "bg-primary text-on-primary" : "border border-line text-fg-sub hover:bg-tint-hover hover:text-fg",
              )}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {/* 집계 실패를 0 으로 뭉개면 "성과 0" 으로 읽힌다 — 멀쩡한 페이지를 갈아엎게 만든다 */}
      {stats.failed ? (
        <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak p-3 text-[14px] text-negative-strong">
          통계를 불러오지 못했어요. 아래 숫자는 실제 성과가 아닙니다 — 잠시 후 다시 열어 주세요.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "조회수", value: stats.views.toLocaleString("ko-KR") },
          { label: "방문자", value: stats.uniques.toLocaleString("ko-KR") },
          { label: "클릭", value: stats.clicks.toLocaleString("ko-KR") },
          /* 「클릭률」이 아니라 「조회당 클릭」이다. 분자·분모의 세는 규칙이 다르다 —
             같은 사람이 30분 안에 다시 오면 조회는 1로 묶지만 클릭은 전부 센다.
             그래서 100% 를 넘을 수 있고, 실제로 주인이 자기 페이지를 열어 블록마다
             눌러보면 첫 화면이 800% 가 된다. 「클릭률」이라는 이름이 그걸 오류로 보이게 한다. */
          { label: "조회당 클릭", value: ratio(stats.ctr, stats.views) },
        ].map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-plate px-3 py-2.5">
            <p className="text-[12px] text-fg-sub">{s.label}</p>
            <p className="tnum mt-1 text-[20px] font-bold leading-none">{s.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[12px] leading-relaxed text-fg-sub">
        재방문율 <span className="tnum font-semibold text-fg">{ratio(stats.returning, stats.uniques)}</span> · 같은
        사람이 30분 안에 다시 와도 조회는 1로 세고 클릭은 전부 세요 — 그래서 「조회당 클릭」은 100%를 넘을 수 있어요.
        쿠키를 지운 방문은 사람 수를 셀 수 없어 방문자 집계에서 빠집니다.
      </p>

      {/* 추이 */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-fg-sub">조회수 · 클릭 추이</p>
          <span className="flex items-center gap-2.5 text-[11px] text-fg-sub">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-primary" aria-hidden />
              조회수
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-positive" aria-hidden />
              클릭
            </span>
          </span>
        </div>
        {/* daily 는 항상 days+1 행이라 length 만 보면 빈 상태에 도달하지 못한다 —
            "아직 데이터가 없어요" 자리에 바닥 직선 한 줄이 그려지고 그 밑에
            "모양(추세)을 보세요" 가 붙었다. 값의 합으로 판정한다. */}
        {stats.daily.some((d) => d.views > 0 || d.clicks > 0) ? (
          <>
            <DualLineChart
              className="mt-2"
              height={140}
              series={[
                { data: stats.daily.map((d) => d.views), stroke: "var(--color-primary)" },
                { data: stats.daily.map((d) => d.clicks), stroke: "var(--color-positive)" },
              ]}
            />
            {/* 두 계열을 각자 min/max 로 정규화해 그린다 — 높이를 서로 비교하면 안 된다 */}
            <p className="mt-1 text-[12px] text-fg-sub">두 선은 각자의 범위로 그려요. 모양(추세)을 보세요.</p>
          </>
        ) : (
          <p className="mt-2 text-[14px] text-fg-sub">아직 데이터가 없어요.</p>
        )}
      </div>

      {/* 블록별 클릭 — "총 클릭 320" 이 아니라 "어느 링크가 320 중 몇을 가져갔나"가
          이 화면의 존재 이유다. 성과 없는 블록을 찾아야 페이지를 고칠 수 있다. */}
      <div>
        <p className="text-[12px] font-medium text-fg-sub">블록별 클릭</p>
        {stats.blocks.length === 0 ? (
          <p className="mt-1.5 text-[14px] text-fg-sub">아직 클릭이 없어요.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {stats.blocks.slice(0, 12).map((b) => (
              <li key={b.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("min-w-0 truncate text-[14px]", b.removed && "text-fg-faint line-through")}>
                    {b.label}
                  </span>
                  <span className="tnum shrink-0 text-[14px] font-semibold">{b.clicks.toLocaleString("ko-KR")}</span>
                </div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-plate" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((b.clicks / maxBlock) * 100)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 지역 — 0048 이 쌓기만 하고 아무도 안 읽던 값이다 */}
      <div>
        <p className="text-[12px] font-medium text-fg-sub">지역</p>
        {stats.regions.length === 0 ? (
          <p className="mt-1.5 text-[14px] text-fg-sub">아직 지역 정보가 없어요.</p>
        ) : (
          <ul className="mt-1.5 divide-y divide-line">
            {stats.regions.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate text-[14px]">{[r.region, r.country].filter(Boolean).join(", ")}</span>
                <span className="tnum shrink-0 text-[14px] font-semibold">{r.views.toLocaleString("ko-KR")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   설정 패널
   ══════════════════════════════════════════════════════════════════ */

function SettingsPanel({
  page,
  leads,
  busy,
  onPublishToggle,
  onDelete,
}: {
  page: LinkPageView;
  leads: LinkLead[];
  busy: boolean;
  onPublishToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-4">
      <h3 className="text-[15px] font-bold">설정</h3>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-plate px-4 py-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">{page.published ? "공개 중" : "비공개"}</p>
          <p className="mt-0.5 text-[12px] text-fg-sub">
            {page.published ? "누구나 주소로 볼 수 있어요." : "지금은 나만 볼 수 있어요."}
          </p>
        </div>
        <Switch checked={page.published} onChange={onPublishToggle} label="공개" disabled={busy} />
      </div>

      {/* 받은 내용 — 문의받기·구독신청 블록이 약속한 자리.
          이게 없으면 방문자가 남긴 게 어디로 갔는지 알 수 없다(편집기가 여기를 가리킨다). */}
      <div>
        <p className="text-[12px] font-medium text-fg-sub">받은 내용</p>
        {leads.length === 0 ? (
          <p className="mt-1.5 text-[14px] text-fg-sub">문의받기·구독신청 블록으로 들어온 내용이 여기에 쌓여요.</p>
        ) : (
          <ul className="mt-1.5 max-h-64 divide-y divide-line overflow-y-auto">
            {leads.map((l) => (
              <li key={l.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-chip bg-plate px-2 py-0.5 text-[11px] font-semibold text-fg-sub">
                    {l.kind === "subscribe" ? "구독" : "문의"}
                  </span>
                  <span className="text-[14px] font-semibold">{l.name || l.email || l.phone || "(이름 없음)"}</span>
                  <span className="tnum ml-auto text-[12px] text-fg-sub">{l.createdAt.slice(0, 10)}</span>
                </div>
                {l.email || l.phone ? (
                  <p className="mt-0.5 text-[12px] text-fg-sub">{[l.email, l.phone].filter(Boolean).join(" · ")}</p>
                ) : null}
                {l.message ? <p className="mt-1 line-clamp-2 text-[14px]">{l.message}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {confirmDelete ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-negative-strong">블록·클릭 기록이 모두 사라져요.</span>
            <Button variant="danger" size="sm" disabled={busy} onClick={onDelete}>
              삭제
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              취소
            </Button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="trans-state text-[12px] text-fg-sub underline underline-offset-2 hover:text-negative-strong"
          >
            프로필 링크 삭제
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   생성 폼
   ══════════════════════════════════════════════════════════════════ */

function CreateForm({
  onCreate,
  error,
  busy,
  isDemo,
}: {
  onCreate: (slug: string, title: string) => void;
  error: string | null;
  busy: boolean;
  isDemo: boolean;
}) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");

  return (
    <Card>
      <CardBody>
        <EmptyState
          icon={Link2}
          title="프로필 링크를 만들어 보세요"
          description="SNS 프로필에 거는 링크 한 장이에요. 주소를 정하면 바로 만들 수 있어요."
        />

        {/* 데모 모드는 **누르기 전에** 알린다. 앞서는 주소·제목을 다 채워 누른 뒤에야
            "데모 모드에서는 저장할 수 없어요"가 떴다 — 항상 실패하는 폼 하나였다. */}
        {isDemo ? (
          <p className="mt-6 max-w-md rounded-card border border-line bg-plate px-4 py-3 text-[14px] leading-[1.6] text-fg-sub">
            지금은 <strong className="font-semibold text-fg">데모 모드</strong>예요. 화면은 둘러볼 수 있지만
            저장은 되지 않아요. 로그인하면 실제 프로필 링크를 만들 수 있습니다.
          </p>
        ) : null}

        {/* 좌측 정렬 — 폼은 좁아야 맞지만 가운데로 몰면 양옆이 통째로 빈다 */}
        <div className="mt-6 max-w-md space-y-3">
          <div>
            <label htmlFor="slug" className="block text-[12px] font-medium text-fg-sub">
              주소
            </label>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="shrink-0 text-[14px] text-fg-sub">/p/</span>
              <input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="my-brand"
                maxLength={30}
                disabled={isDemo}
                className="h-10 min-w-0 flex-1 rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>
          <div>
            <label htmlFor="title" className="block text-[12px] font-medium text-fg-sub">
              제목
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="브랜드 이름"
              maxLength={40}
              disabled={isDemo}
              className="mt-1.5 h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none disabled:opacity-50"
            />
          </div>
          {error ? (
            <p role="alert" className="text-[14px] text-negative-strong">
              {error}
            </p>
          ) : null}
          <Button onClick={() => onCreate(slug, title)} disabled={isDemo || !slug.trim() || busy} className="w-full">
            {busy ? "만드는 중…" : "프로필 링크 만들기"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
