"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
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
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { publicLinkUrl } from "@/lib/links";
import { BLOCK_CATALOG, blockSummary, type BlockType, type LinkBlock } from "@/lib/links/blocks";
import { LAYOUTS, LINK_THEMES, SNS_KINDS } from "@/lib/links/themes";
import {
  addBlock,
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
import type { LinkLead } from "../page";
import { BlockEditor } from "./block-editor";
import { ImageField } from "./image-field";
import { PhonePreview } from "./phone-preview";

export interface LinkPageView {
  id: string;
  slug: string;
  title: string;
  bio: string;
  published: boolean;
  layout: string;
  theme: string;
  align: string;
  avatarPath: string | null;
  coverPath: string | null;
  snsLinks: Array<{ kind: string; url: string }>;
  seoTitle: string;
  seoDesc: string;
  /** 마지막 라이브 반영 시각. null 이면 한 번도 발행 안 함 */
  publishedAt: string | null;
  /** 초안이 마지막 발행본과 다른가 — "라이브 반영" 버튼의 상태를 정한다 */
  dirty: boolean;
}

/*
  프로필 링크 편집기 — 링크팜 빌더 구조를 실측 조사해 재구성(2026-08-17).

  좌: **라이브 미리보기**(실제 공개 페이지와 같은 렌더)
  우: **4탭 패널** 프로필 / 테마 / 블록 / 설정
  상단: 주소·복사·열기 + **라이브 반영**(초안 → 공개 스냅샷)

  링크팜과 다르게 간 것:
   · 링크팜은 미리보기 안에서 직접 편집(호버 툴바)한다. 우리는 **목록에서 편집**한다 —
     블록이 15종이라 인라인 편집으로는 필드를 다 못 넣고, 무엇보다 키보드로 조작할 수 있다.
   · 드래그 정렬 대신 ↑↓ 버튼. 모바일에서 드래그는 스크롤과 싸운다.

  서버 액션만 쓴다. 저장 후 router.refresh 로 서버 값을 다시 읽는다 —
  slug 중복처럼 **DB 만 아는 실패**가 있어서 화면에서 낙관적으로 재구성하면
  실패한 값이 성공한 것처럼 남는다.
*/

type Tab = "profile" | "theme" | "blocks" | "settings";

const TABS: Array<{ key: Tab; label: string; icon: typeof User }> = [
  { key: "profile", label: "프로필", icon: User },
  { key: "theme", label: "테마", icon: Palette },
  { key: "blocks", label: "블록", icon: Layers },
  { key: "settings", label: "설정", icon: Settings },
];

export function LinksClient({
  page,
  blocks,
  origin,
  stats,
  leads,
}: {
  page: LinkPageView | null;
  blocks: LinkBlock[];
  origin: string;
  stats: { views: number; clicks: number; ctr: number; returning: number };
  leads: LinkLead[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("blocks");
  const [editingId, setEditingId] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) setError(res.error ?? "처리하지 못했어요.");
        else router.refresh();
      } finally {
        setBusy(false);
      }
    });
  }

  if (!page) {
    return <CreateForm onCreate={(slug, title) => run(() => createLinkPage(slug, title))} error={error} busy={busy} />;
  }

  const editing = blocks.find((b) => b.id === editingId) ?? null;

  return (
    <div className="space-y-4">
      {/* 상단 바 — 주소·복사·열기 + 라이브 반영 */}
      <TopBar
        page={page}
        origin={origin}
        busy={busy}
        onPublish={() => run(() => publishLinkPage())}
      />

      {error ? (
        <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak p-4 text-[15px] text-negative-strong">
          {error}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        {/* 좌 — 라이브 미리보기 */}
        <Card className="xl:sticky xl:top-6">
          <CardHeader
            title="미리보기"
            description={
              page.publishedAt
                ? page.dirty
                  ? "지금 화면은 초안이에요. 「라이브 반영」을 눌러야 공개 주소에 나갑니다."
                  : "공개 주소와 같은 상태예요."
                : "아직 발행하지 않았어요. 「라이브 반영」을 누르면 공개 주소가 살아납니다."
            }
          />
          <CardBody>
            <PhonePreview page={page} blocks={blocks.filter((b) => b.active)} />
          </CardBody>
        </Card>

        {/* 우 — 4탭 패널 */}
        <Card className="xl:sticky xl:top-6">
          <CardBody className="space-y-4">
            <div role="tablist" aria-label="편집 도구" className="grid grid-cols-4 gap-1.5">
              {TABS.map((t) => {
                const on = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      setTab(t.key);
                      setEditingId(null);
                    }}
                    className={cn(
                      "trans-state flex flex-col items-center gap-1 rounded-card px-2 py-2 text-[12px] font-semibold",
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
                busy={busy}
                onClose={() => setEditingId(null)}
                onSave={(data) => run(() => updateBlock(editing.id, { data }))}
              />
            ) : tab === "profile" ? (
              <ProfilePanel
                page={page}
                busy={busy}
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
                onEdit={setEditingId}
                onToggle={(id, active) => run(() => updateBlock(id, { active }))}
                onMove={(id, dir) => run(() => moveBlock(id, dir))}
                onDelete={(id) => run(() => deleteBlock(id))}
              />
            ) : (
              <SettingsPanel
                page={page}
                stats={stats}
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-body px-4 py-3">
      <code className="min-w-0 flex-1 truncate text-[13px] text-fg-sub">{url}</code>

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

      {/* 라이브 반영 — 초안을 공개 스냅샷으로. 바뀐 게 없으면 눌러도 의미가 없다 */}
      <Button size="sm" onClick={onPublish} disabled={busy || (!page.dirty && !!page.publishedAt)}>
        <Rocket className="size-3.5" aria-hidden />
        {busy ? "반영 중…" : page.dirty || !page.publishedAt ? "라이브 반영" : "반영됨"}
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
  onEdit,
  onToggle,
  onMove,
  onDelete,
}: {
  blocks: LinkBlock[];
  busy: boolean;
  onAdd: (t: BlockType) => void;
  onEdit: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onDelete: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);

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

      {blocks.length === 0 ? (
        <p className="text-[14px] text-fg-sub">「추가」를 눌러 첫 블록을 만들어 보세요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {blocks.map((b, i) => (
            <li key={b.id} className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => onMove(b.id, "up")}
                  disabled={i === 0 || busy}
                  aria-label="위로"
                  className="trans-state rounded-card p-0.5 text-fg-faint hover:bg-tint-hover hover:text-fg disabled:opacity-30"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(b.id, "down")}
                  disabled={i === blocks.length - 1 || busy}
                  aria-label="아래로"
                  className="trans-state rounded-card p-0.5 text-fg-faint hover:bg-tint-hover hover:text-fg disabled:opacity-30"
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => onEdit(b.id)}
                className={cn("min-w-0 flex-1 text-left", !b.active && "opacity-50")}
              >
                <span className="block text-[12px] font-medium text-fg-sub">
                  {BLOCK_CATALOG.find((c) => c.type === b.type)?.label ?? b.type}
                </span>
                <span className="block truncate text-[14px] font-semibold">{blockSummary(b.type, b.data)}</span>
              </button>

              <Switch checked={b.active} onChange={(v) => onToggle(b.id, v)} label="노출" disabled={busy} />
              <button
                type="button"
                onClick={() => onDelete(b.id)}
                disabled={busy}
                aria-label="블록 삭제"
                className="trans-state shrink-0 rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-negative disabled:opacity-40"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
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
  onSave,
  onImages,
}: {
  page: LinkPageView;
  busy: boolean;
  onImages: (v: { avatarPath?: string | null; coverPath?: string | null }) => void;
  onSave: (v: {
    slug: string;
    title: string;
    bio: string;
    layout: string;
    align: string;
    snsLinks: Array<{ kind: string; url: string }>;
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

  /* 서버가 새 값을 주면 입력창을 맞춘다 — 저장 시 서버가 slug 를 소문자화하고
     제목·소개를 자른다. 동기화가 없으면 저장 후에도 옛 값이 남아 되돌려 쓴다.
     effect 대신 렌더 시점 조정(레포 관례). */
  const [prev, setPrev] = useState(page);
  if (page !== prev) {
    setPrev(page);
    setSlug(page.slug);
    setTitle(page.title);
    setBio(page.bio);
    setLayout(page.layout);
    setAlign(page.align);
    setSns(page.snsLinks);
  }

  const input =
    "h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";

  return (
    <div className="space-y-4">
      <h3 className="text-[15px] font-bold">프로필</h3>

      <div>
        <p className="text-[12px] font-medium text-fg-sub">레이아웃</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setLayout(l.key)}
              className={cn(
                "trans-state rounded-card border px-2 py-2 text-[12px] font-semibold",
                layout === l.key ? "border-2 border-primary" : "border border-line hover:bg-tint-hover",
              )}
            >
              {l.label}
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

      <div>
        <p className="text-[12px] font-medium text-fg-sub">SNS 링크</p>
        <div className="mt-1.5 space-y-2">
          {sns.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                value={s.kind}
                onChange={(e) => setSns((v) => v.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}
                className="h-10 shrink-0 rounded-card border border-line bg-body px-2 text-[13px] text-fg focus:border-primary focus:outline-none"
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSns((v) => [...v, { kind: "instagram", url: "" }])}
            >
              <Plus className="size-3.5" aria-hidden />
              SNS 추가
            </Button>
          ) : null}
        </div>
      </div>

      <Button
        variant="secondary"
        disabled={busy}
        onClick={() =>
          onSave({ slug, title, bio, layout, align, snsLinks: sns, seoTitle: page.seoTitle, seoDesc: page.seoDesc })
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
                className={cn(
                  "trans-state overflow-hidden rounded-card border text-left disabled:opacity-50",
                  current === t.key ? "border-2 border-primary" : "border border-line hover:border-line-strong",
                )}
              >
                {/* 테마 미니 미리보기 — 실제 색으로 칠한다 */}
                <span className="block h-16 p-2.5" style={{ background: t.bg }}>
                  <span
                    className="block h-4 w-full rounded-full"
                    style={{ background: t.accent }}
                    aria-hidden
                  />
                  <span
                    className="mt-1.5 block h-4 w-full rounded-full border"
                    style={{ background: t.card, borderColor: t.border }}
                    aria-hidden
                  />
                </span>
                <span className="block px-2.5 py-1.5 text-[13px] font-semibold">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   설정 패널
   ══════════════════════════════════════════════════════════════════ */

function SettingsPanel({
  page,
  stats,
  leads,
  busy,
  onPublishToggle,
  onDelete,
}: {
  page: LinkPageView;
  stats: { views: number; clicks: number; ctr: number; returning: number };
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

      {/* 통계 — 링크팜의 총방문자·총클릭·CTR·재방문율 4칸 */}
      <div>
        <p className="text-[12px] font-medium text-fg-sub">최근 30일</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {[
            { label: "방문자", value: stats.views.toLocaleString("ko-KR") },
            { label: "클릭", value: stats.clicks.toLocaleString("ko-KR") },
            { label: "클릭률", value: `${stats.ctr}%` },
            { label: "재방문율", value: `${stats.returning}%` },
          ].map((s) => (
            <div key={s.label} className="rounded-card border border-line bg-plate px-3 py-2.5">
              <p className="text-[12px] text-fg-sub">{s.label}</p>
              <p className="tnum mt-1 text-[20px] font-bold leading-none">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 받은 내용 — 문의받기·구독신청 블록이 약속한 자리.
          이게 없으면 방문자가 남긴 게 어디로 갔는지 알 수 없다(편집기가 여기를 가리킨다). */}
      <div>
        <p className="text-[12px] font-medium text-fg-sub">받은 내용</p>
        {leads.length === 0 ? (
          <p className="mt-1.5 text-[14px] text-fg-sub">
            문의받기·구독신청 블록으로 들어온 내용이 여기에 쌓여요.
          </p>
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
}: {
  onCreate: (slug: string, title: string) => void;
  error: string | null;
  busy: boolean;
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
                className="h-10 min-w-0 flex-1 rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
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
              className="mt-1.5 h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
            />
          </div>
          {error ? (
            <p role="alert" className="text-[14px] text-negative-strong">
              {error}
            </p>
          ) : null}
          <Button onClick={() => onCreate(slug, title)} disabled={!slug.trim() || busy} className="w-full">
            {busy ? "만드는 중…" : "프로필 링크 만들기"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
