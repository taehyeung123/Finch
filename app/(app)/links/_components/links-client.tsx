"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Copy, ExternalLink, Link2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { publicLinkUrl } from "@/lib/links";
import {
  addLinkItem,
  createLinkPage,
  deleteLinkItem,
  deleteLinkPage,
  moveLinkItem,
  setLinkPublished,
  updateLinkItem,
  updateLinkPage,
} from "../actions";

export interface LinkPage {
  id: string;
  slug: string;
  title: string;
  bio: string;
  published: boolean;
}

export interface LinkItem {
  id: string;
  label: string;
  url: string;
  active: boolean;
  clicks: number;
}

/*
  프로필 링크 편집기.

  서버 액션만 쓴다(별도 API 없음). 저장 후에는 router.refresh 로 서버 값을 다시
  읽는다 — slug 중복처럼 **DB 만 아는 실패**가 있어서, 화면에서 낙관적으로
  재구성하면 실패한 값이 성공한 것처럼 남는다.

  드래그 정렬 대신 ↑↓ 버튼이다: 항목이 대개 3~8개고, 드래그는 모바일에서 스크롤과
  싸운다. 무엇보다 키보드로 조작할 수 있다.
*/
export function LinksClient({
  page,
  items,
  totalClicks,
  clicksTruncated,
  origin,
}: {
  page: LinkPage | null;
  items: LinkItem[];
  totalClicks: number;
  /** 집계가 상한에서 잘렸다 — 숫자가 실제보다 작다는 걸 화면이 말해야 한다 */
  clicksTruncated: boolean;
  /** 실제 접속 도메인 — 하드코딩하면 로컬·프리뷰에서 복사한 주소가 안 열린다 */
  origin: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  if (!page) return <CreateForm onCreate={(slug, title) => run(() => createLinkPage(slug, title))} error={error} busy={busy} />;

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak p-4 text-[15px] text-negative-strong">
          {error}
        </p>
      ) : null}

      <PageSettings
        page={page}
        origin={origin}
        busy={busy}
        onSave={(v) => run(() => updateLinkPage(v))}
        onPublish={(v) => run(() => setLinkPublished(v))}
        onDelete={() => run(() => deleteLinkPage())}
      />

      <Card>
        <CardHeader
          title="링크"
          description={
            totalClicks > 0
              ? `전체 ${totalClicks.toLocaleString("ko-KR")}회${
                  clicksTruncated ? "(최근 50,000건 기준)" : ""
                } 클릭됐어요. 삭제한 링크의 클릭도 전체에는 포함돼요.`
              : "아직 클릭 기록이 없어요"
          }
        />
        <CardBody className="space-y-4">
          {items.length === 0 ? (
            <p className="text-[14px] text-fg-sub">아래에서 첫 링크를 추가해 보세요.</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((it, i) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  first={i === 0}
                  last={i === items.length - 1}
                  busy={busy}
                  onMove={(dir) => run(() => moveLinkItem(it.id, dir))}
                  onToggle={(active) => run(() => updateLinkItem(it.id, { active }))}
                  onSave={(label, url) => run(() => updateLinkItem(it.id, { label, url }))}
                  onDelete={() => run(() => deleteLinkItem(it.id))}
                />
              ))}
            </ul>
          )}

          <AddForm busy={busy} onAdd={(label, url) => run(() => addLinkItem(label, url))} />
        </CardBody>
      </Card>
    </div>
  );
}

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
        {/* 좌측 정렬. 폼 자체는 좁아야 맞지만(입력 하나에 1300px 은 못 읽는다)
            가운데로 몰면 양옆이 통째로 빈다 — 좁게 두되 왼쪽에 붙인다. */}
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

function PageSettings({
  page,
  origin,
  busy,
  onSave,
  onPublish,
  onDelete,
}: {
  page: LinkPage;
  origin: string;
  busy: boolean;
  onSave: (v: { slug: string; title: string; bio: string; published: boolean }) => void;
  onPublish: (v: boolean) => void;
  onDelete: () => void;
}) {
  const [slug, setSlug] = useState(page.slug);
  const [title, setTitle] = useState(page.title);
  const [bio, setBio] = useState(page.bio);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const url = publicLinkUrl(page.slug, origin);

  /* 서버가 새 값을 주면 입력창을 맞춘다 — 저장 시 서버가 slug 를 소문자화하고
     제목·소개를 자른다. 동기화가 없으면 저장 후에도 화면 값이 옛것으로 남아
     다음 저장에서 되돌려 쓴다. effect 대신 렌더 시점 조정(레포 관례). */
  const [prev, setPrev] = useState(page);
  if (page !== prev) {
    setPrev(page);
    setSlug(page.slug);
    setTitle(page.title);
    setBio(page.bio);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 권한 거부·비보안 컨텍스트 — 주소가 화면에 그대로 보이니 손으로 복사하면 된다 */
    }
  }

  return (
    <Card>
      <CardHeader title="페이지" description="SNS 프로필에 이 주소를 걸어 두세요" />
      <CardBody className="space-y-5">
        {/* 공개 상태 — 이 화면에서 가장 중요한 스위치다. 꺼져 있으면 주소를 알아도 안 열린다 */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-plate px-4 py-3">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold">{page.published ? "공개 중" : "비공개"}</p>
            <p className="mt-0.5 text-[12px] text-fg-sub">
              {page.published ? "누구나 아래 주소로 볼 수 있어요." : "지금은 나만 볼 수 있어요."}
            </p>
          </div>
          {/* published **만** 바꾸는 전용 액션. 앞서는 updateLinkPage 를 불러 입력창의
              미저장 값(주소·제목·소개)까지 함께 커밋했다 — 주소를 고치던 중에 공개만
              눌렀는데 검증 안 된 주소가 저장되는 문제가 있었다. */}
          <Switch checked={page.published} onChange={onPublish} label="공개" disabled={busy} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-card border border-line bg-plate px-3 py-2 text-[12px]">
            {url}
          </code>
          <Button variant="secondary" size="sm" onClick={copy}>
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? "복사됨" : "복사"}
          </Button>
          {page.published ? (
            <Button variant="ghost" size="sm" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="size-3.5" aria-hidden />
              열기
            </Button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="p-slug" className="block text-[12px] font-medium text-fg-sub">
              주소 (/p/…)
            </label>
            <input
              id="p-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              maxLength={30}
              className="mt-1.5 h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="p-title" className="block text-[12px] font-medium text-fg-sub">
              제목
            </label>
            <input
              id="p-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={40}
              className="mt-1.5 h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="p-bio" className="block text-[12px] font-medium text-fg-sub">
            소개 (선택)
          </label>
          <textarea
            id="p-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            maxLength={160}
            className="mt-1.5 w-full rounded-card border border-line bg-body px-3 py-2 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
            placeholder="한 줄 소개"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onSave({ slug, title, bio, published: page.published })}
          >
            {busy ? "저장 중…" : "저장"}
          </Button>

          {/* 삭제 — 사용자당 1페이지라 삭제가 없으면 실수로 정한 주소를 영구히 떠안는다 */}
          {confirmDelete ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-negative-strong">링크와 클릭 기록이 모두 사라져요.</span>
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
      </CardBody>
    </Card>
  );
}

function ItemRow({
  item,
  first,
  last,
  busy,
  onMove,
  onToggle,
  onSave,
  onDelete,
}: {
  item: LinkItem;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (dir: "up" | "down") => void;
  onToggle: (active: boolean) => void;
  onSave: (label: string, url: string) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [url, setUrl] = useState(item.url);

  /* 저장하면 서버가 URL 을 정규화한다("example.com" -> "https://example.com/").
     그 값을 입력창에 다시 반영하지 않으면 dirty 가 영영 true 로 남아 "저장/되돌리기"
     버튼이 사라지지 않는다 — 저장이 안 된 것처럼 보인다.
     effect 대신 렌더 시점 조정(레포 관례). */
  const [prev, setPrev] = useState(item);
  if (item !== prev) {
    setPrev(item);
    setLabel(item.label);
    setUrl(item.url);
  }

  const dirty = label !== item.label || url !== item.url;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={first || busy}
            aria-label="위로"
            className="trans-state rounded-card p-0.5 text-fg-faint hover:bg-tint-hover hover:text-fg disabled:opacity-30"
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={last || busy}
            aria-label="아래로"
            className="trans-state rounded-card p-0.5 text-fg-faint hover:bg-tint-hover hover:text-fg disabled:opacity-30"
          >
            <ArrowDown className="size-3.5" />
          </button>
        </div>

        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            aria-label="링크 이름"
            className={cn(
              "h-9 min-w-0 rounded-card border bg-body px-2.5 text-[14px] text-fg focus:border-primary focus:outline-none",
              item.active ? "border-line" : "border-line text-fg-sub",
            )}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="링크 주소"
            className="h-9 min-w-0 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg focus:border-primary focus:outline-none"
          />
        </div>

        <span className="tnum w-14 shrink-0 text-right text-[12px] text-fg-sub">
          {item.clicks.toLocaleString("ko-KR")}회
        </span>

        <Switch checked={item.active} onChange={onToggle} label="노출" disabled={busy} />

        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label="링크 삭제"
          className="trans-state shrink-0 rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-negative disabled:opacity-40"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {dirty ? (
        <div className="mt-2 flex gap-2 pl-7">
          <Button size="sm" disabled={busy} onClick={() => onSave(label, url)}>
            저장
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLabel(item.label);
              setUrl(item.url);
            }}
          >
            되돌리기
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function AddForm({ busy, onAdd }: { busy: boolean; onAdd: (label: string, url: string) => void }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  function submit() {
    onAdd(label, url);
    setLabel("");
    setUrl("");
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="링크 이름"
          maxLength={40}
          aria-label="새 링크 이름"
          className="h-10 min-w-0 rounded-card border border-line bg-body px-3 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          aria-label="새 링크 주소"
          className="h-10 min-w-0 rounded-card border border-line bg-body px-3 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
        />
      </div>
      <Button variant="secondary" onClick={submit} disabled={!label.trim() || !url.trim() || busy}>
        <Plus className="size-4" aria-hidden />
        추가
      </Button>
    </div>
  );
}
