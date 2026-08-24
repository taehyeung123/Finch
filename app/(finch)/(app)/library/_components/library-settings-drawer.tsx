"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign, Hash, Info, Megaphone, Type, X } from "lucide-react";
import { InstagramGlyph, ThreadsGlyph, TiktokGlyph } from "@/components/icons/brand";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";
import type { AdSource, Channel, CollectSettings, ReferenceSource } from "@/lib/types";

/*
  수집 설정 드로어 — 기존 /library 본문에 세로로 쌓여 있던 카드 3장
  (수집 기준 관리 · 메타광고 검색 키워드 · 수집 필터)의 착지점.

  이 셋은 전부 "설정" 성격이라 매번 보일 이유가 없는데도 결과 그리드를 화면 밖으로
  밀어내고 있었다. 문서 흐름 밖(오버레이)으로 옮기면 본 화면은 검색 + 결과 2블록이 된다.

  "기준별 수집 성적" 카드도 여기 [수집 기준] 탭의 각 기준 행 보조 텍스트로 흡수했다 —
  세로 한 칸을 따로 쓸 정보가 아니다.
*/

export type DrawerTab = "sources" | "ads" | "options";

type SourceKind = ReferenceSource["kind"];
type FormMessage = { tone: "error" | "notice"; text: string };

const CHANNEL_OPTIONS: { value: Channel; label: string }[] = [
  { value: "instagram", label: "인스타그램" },
  { value: "tiktok", label: "틱톡" },
  { value: "threads", label: "스레드" },
];

const KIND_OPTIONS: { value: SourceKind; label: string }[] = [
  { value: "keyword", label: "키워드" },
  { value: "account", label: "계정" },
  { value: "hashtag", label: "해시태그" },
];

const KIND_PLACEHOLDER: Record<SourceKind, string> = {
  keyword: "예: 여름 스킨케어",
  account: "@handle 또는 프로필 주소",
  hashtag: "#해시태그 (예: #단백질간식)",
};

const PERIOD_OPTIONS: { value: CollectSettings["period"]; label: string }[] = [
  { value: "7d", label: "최근 1주" },
  { value: "1m", label: "최근 1개월" },
  { value: "3m", label: "최근 3개월" },
  { value: "6m", label: "최근 6개월 (추천)" },
  { value: "1y", label: "최근 1년" },
  { value: "all", label: "기간 상관없음" },
];

const FORMAT_OPTIONS: { value: CollectSettings["mediaFormat"]; label: string }[] = [
  { value: "all", label: "전체 형식" },
  { value: "video", label: "영상·릴스만" },
  { value: "photo", label: "사진만" },
  { value: "carousel", label: "카드뉴스(캐러셀)만" },
];

const TABS: { key: DrawerTab; label: string }[] = [
  { key: "sources", label: "수집 기준" },
  { key: "ads", label: "메타광고 검색어" },
  { key: "options", label: "수집 옵션" },
];

function KindGlyph({ kind }: { kind: string }) {
  const cls = "size-3.5 shrink-0 text-fg-faint";
  if (kind === "account") return <AtSign className={cls} aria-hidden />;
  if (kind === "hashtag") return <Hash className={cls} aria-hidden />;
  return <Type className={cls} aria-hidden />;
}

const CHANNEL_GLYPH: Record<Channel, React.ReactNode> = {
  instagram: <InstagramGlyph className="size-3.5 text-ig" />,
  tiktok: <TiktokGlyph className="size-3.5 text-fg" />,
  threads: <ThreadsGlyph className="size-3.5 text-fg" />,
};

/** 기준별 지금까지의 수집 성적 — 구 "기준별 수집 성적" 카드의 착지점 */
export interface SourceBaseline {
  count: number;
  medianViews: number;
  maxViews: number;
}

function Message({ msg }: { msg: FormMessage }) {
  if (msg.tone === "error") {
    return (
      <p role="alert" className="text-[14px] text-negative">
        {msg.text}
      </p>
    );
  }
  return (
    <p role="status" className="flex items-start gap-1.5 text-[14px] text-fg-sub">
      <Info className="mt-0.5 size-3.5 shrink-0 text-fg-faint" aria-hidden />
      {msg.text}
    </p>
  );
}

export function LibrarySettingsDrawer({
  open,
  tab,
  onTabChange,
  onClose,
  sources,
  adSources,
  baselines,
  settings,
  isDemo,
  value,
  onValueChange,
  onAddSource,
  onRemoveSource,
  onAddAdSource,
  onRemoveAdSource,
  onUpdateSettings,
}: {
  open: boolean;
  tab: DrawerTab;
  onTabChange: (t: DrawerTab) => void;
  onClose: () => void;
  sources: ReferenceSource[];
  adSources: AdSource[];
  baselines: Map<string, SourceBaseline>;
  settings: CollectSettings;
  isDemo: boolean;
  /** 수집 기준 입력값 — 빈 상태 씨앗 칩이 값을 채운 채 드로어를 열 수 있어야 해서
      드로어 안이 아니라 부모가 들고 있다(effect로 동기화하면 캐스케이딩 렌더가 난다) */
  value: string;
  onValueChange: (v: string) => void;
  onAddSource: (input: { channel: Channel; kind: SourceKind; value: string }) => Promise<{ ok: boolean; error?: string }>;
  onRemoveSource: (id: string) => Promise<{ ok: boolean }>;
  onAddAdSource: (value: string) => Promise<{ ok: boolean; error?: string }>;
  onRemoveAdSource: (id: string) => Promise<{ ok: boolean }>;
  onUpdateSettings: (next: CollectSettings) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const [channel, setChannel] = useState<Channel>("instagram");
  const [kind, setKind] = useState<SourceKind>("keyword");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<FormMessage | null>(null);

  const [adValue, setAdValue] = useState("");
  const [adSubmitting, setAdSubmitting] = useState(false);
  const [adMsg, setAdMsg] = useState<FormMessage | null>(null);

  const [excludeInput, setExcludeInput] = useState("");
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  /* Escape 닫기 + 포커스 이동. 열릴 때 닫기 버튼으로 포커스를 옮겨 스크린리더가 맥락을 잡게 한다 */
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panelRef.current) return;
      /* 포커스 트랩 — 모달이므로 뒤 화면으로 탭이 새어나가지 않게 한다 */
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function submitSource(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setMsg(null);
    setSubmitting(true);
    const result = await onAddSource({ channel, kind, value });
    setSubmitting(false);
    if (result.ok) {
      onValueChange("");
      return;
    }
    setMsg(
      isDemo && result.error?.startsWith("데모")
        ? { tone: "notice", text: "데모 모드에서는 등록할 수 없어요 — 실제 계정으로 로그인하면 저장됩니다" }
        : { tone: "error", text: result.error ?? "등록에 실패했습니다." },
    );
  }

  async function submitAdSource(e: React.FormEvent) {
    e.preventDefault();
    if (adSubmitting) return;
    setAdMsg(null);
    setAdSubmitting(true);
    const result = await onAddAdSource(adValue);
    setAdSubmitting(false);
    if (result.ok) {
      setAdValue("");
      return;
    }
    setAdMsg(
      isDemo && result.error?.startsWith("데모")
        ? { tone: "notice", text: "데모 모드에서는 등록할 수 없어요 — 실제 계정으로 로그인하면 저장됩니다" }
        : { tone: "error", text: result.error ?? "등록에 실패했습니다." },
    );
  }

  function addExcludeKeyword() {
    const k = excludeInput.trim();
    if (!k) return;
    if (settings.excludeKeywords.includes(k)) {
      setExcludeInput("");
      return;
    }
    if (settings.excludeKeywords.length >= 10) {
      setSettingsMsg("제외 키워드는 최대 10개까지예요.");
      return;
    }
    setExcludeInput("");
    setSettingsMsg(null);
    onUpdateSettings({ ...settings, excludeKeywords: [...settings.excludeKeywords, k] });
  }

  const inputCls =
    "h-10 min-w-0 flex-1 rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";
  const selectCls =
    "h-10 shrink-0 cursor-pointer rounded-card border border-line bg-body px-2.5 text-[14px] font-medium text-fg outline-none trans-state hover:border-line-strong focus-visible:outline-2 focus-visible:outline-primary";

  return (
    <>
      <div className="modal-scrim-in fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="수집 설정"
        className="drawer-in-right fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-line-strong bg-overlay"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-[17px] font-bold text-fg">수집 설정</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex size-9 cursor-pointer items-center justify-center rounded-card text-fg-faint trans-state hover:bg-body hover:text-fg"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex shrink-0 gap-1.5 border-b border-line px-5 py-3" role="tablist" aria-label="설정 종류">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => onTabChange(t.key)}
              className={cn(
                "cursor-pointer rounded-chip px-3 py-1.5 text-[14px] font-semibold trans-state",
                tab === t.key ? "bg-primary-weak text-primary" : "text-fg-sub hover:bg-body hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* ── 수집 기준 ── */}
          {tab === "sources" ? (
            <div className="space-y-4">
              <p className="text-[14px] text-fg-sub">
                등록한 기준에 걸리는 콘텐츠를 매일 아침 자동으로 모아드려요.
              </p>
              <form onSubmit={submitSource} className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as Channel)}
                    aria-label="채널"
                    className={cn(selectCls, "flex-1")}
                  >
                    {CHANNEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as SourceKind)}
                    aria-label="기준 종류"
                    className={cn(selectCls, "flex-1")}
                  >
                    {KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => onValueChange(e.target.value)}
                    placeholder={KIND_PLACEHOLDER[kind]}
                    aria-label="수집 값"
                    className={inputCls}
                  />
                  <Button type="submit" disabled={submitting} className="shrink-0">
                    등록
                  </Button>
                </div>
              </form>

              {msg ? <Message msg={msg} /> : null}

              {sources.length > 0 ? (
                <ul className="space-y-1.5" aria-label="등록된 수집 기준">
                  {sources.map((s) => {
                    const b = baselines.get(s.value);
                    return (
                      <li
                        key={s.id}
                        className="flex items-start gap-2 rounded-card border border-line bg-body px-3 py-2.5"
                      >
                        <span className="mt-0.5 flex items-center gap-1" aria-hidden>
                          {CHANNEL_GLYPH[s.channel]}
                          <KindGlyph kind={s.kind} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-fg">{s.value}</span>
                          {/* 기준별 수집 성적 — 데이터가 없으면 줄 자체를 렌더하지 않는다 */}
                          {b && b.count > 0 ? (
                            <span className="tnum mt-0.5 block text-[12px] text-fg-faint">
                              {b.count}건
                              {b.medianViews > 0 ? ` · 보통 ${formatCompact(b.medianViews)}` : ""}
                              {b.maxViews > 0 ? ` · 최고 ${formatCompact(b.maxViews)}` : ""}
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          aria-label={`${s.value} 기준 삭제`}
                          onClick={() => onRemoveSource(s.id)}
                          className="mt-0.5 shrink-0 cursor-pointer text-fg-faint trans-state hover:text-negative"
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-[14px] text-fg-sub">아직 등록한 기준이 없어요 — 위에서 첫 기준을 추가해보세요.</p>
              )}
            </div>
          ) : null}

          {/* ── 메타광고 검색어 ── */}
          {tab === "ads" ? (
            <div className="space-y-4">
              <p className="text-[14px] text-fg-sub">
                Meta 광고 라이브러리에서 이 검색어로 걸리는 국내 게재 중인 광고를 함께 모아드려요.
              </p>
              <form onSubmit={submitAdSource} className="flex gap-2">
                <input
                  type="text"
                  value={adValue}
                  onChange={(e) => setAdValue(e.target.value)}
                  placeholder="예: 단백질 간식, 여름 스킨케어"
                  aria-label="메타광고 검색 키워드"
                  className={inputCls}
                />
                <Button type="submit" disabled={adSubmitting} className="shrink-0">
                  등록
                </Button>
              </form>

              {adMsg ? <Message msg={adMsg} /> : null}

              {adSources.length > 0 ? (
                <ul className="space-y-1.5" aria-label="등록된 메타광고 검색어">
                  {adSources.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 rounded-card border border-line bg-body px-3 py-2.5"
                    >
                      <Megaphone className="size-3.5 shrink-0 text-fg-faint" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-fg">{s.value}</span>
                      <button
                        type="button"
                        aria-label={`${s.value} 검색어 삭제`}
                        onClick={() => onRemoveAdSource(s.id)}
                        className="shrink-0 cursor-pointer text-fg-faint trans-state hover:text-negative"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-fg-sub">아직 등록한 검색어가 없어요.</p>
              )}
            </div>
          ) : null}

          {/* ── 수집 옵션 ── (이름이 "수집 필터"가 아닌 이유: 검색 필터와 어휘를 분리해야 혼동이 없다) */}
          {tab === "options" ? (
            <div className="space-y-4">
              <p className="text-[14px] text-fg-sub">
                다음 수집부터 적용돼요. 이미 모인 레퍼런스에는 영향을 주지 않습니다.
              </p>

              <div className="space-y-2">
                <label className="block text-[14px] font-semibold text-fg-sub" htmlFor="collect-period">
                  발행 기간
                </label>
                <select
                  id="collect-period"
                  value={settings.period}
                  onChange={(e) => onUpdateSettings({ ...settings, period: e.target.value as CollectSettings["period"] })}
                  className={cn(selectCls, "w-full")}
                >
                  {PERIOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-[14px] font-semibold text-fg-sub" htmlFor="collect-format">
                  콘텐츠 형식
                </label>
                <select
                  id="collect-format"
                  value={settings.mediaFormat}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, mediaFormat: e.target.value as CollectSettings["mediaFormat"] })
                  }
                  className={cn(selectCls, "w-full")}
                >
                  {FORMAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-pressed={settings.krOnly}
                  onClick={() => onUpdateSettings({ ...settings, krOnly: !settings.krOnly })}
                  className={cn(
                    "inline-flex cursor-pointer items-center rounded-chip px-3.5 py-1.5 text-[14px] font-semibold trans-state",
                    settings.krOnly
                      ? "bg-primary text-on-primary"
                      : "border border-line bg-body text-fg-sub hover:border-line-strong hover:text-fg",
                  )}
                >
                  한국 콘텐츠만
                </button>
                <InfoTip>
                  틱톡은 게시물의 국가 정보로, 인스타그램·스레드는 국가 정보가 제공되지 않아 한글 포함 여부로
                  판단합니다. 형식 필터는 채널 특성상 틱톡은 전부 영상, 카드뉴스(캐러셀)는 인스타그램에서만
                  걸러져요.
                </InfoTip>
              </div>

              <div className="space-y-2">
                <span className="block text-[14px] font-semibold text-fg-sub">제외 키워드</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={excludeInput}
                    onChange={(e) => setExcludeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addExcludeKeyword();
                      }
                    }}
                    placeholder="예: 광고, 협찬"
                    aria-label="제외 키워드"
                    className={inputCls}
                  />
                  <Button type="button" variant="secondary" onClick={addExcludeKeyword} className="shrink-0">
                    추가
                  </Button>
                </div>
                {settings.excludeKeywords.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {settings.excludeKeywords.map((k) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1.5 rounded-chip border border-line bg-body px-3 py-1 text-[14px] text-fg-sub"
                      >
                        {k}
                        <button
                          type="button"
                          aria-label={`제외 키워드 ${k} 삭제`}
                          onClick={() =>
                            onUpdateSettings({
                              ...settings,
                              excludeKeywords: settings.excludeKeywords.filter((x) => x !== k),
                            })
                          }
                          className="cursor-pointer text-fg-faint trans-state hover:text-negative"
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {settingsMsg ? (
                <p role="alert" className="text-[14px] text-negative">
                  {settingsMsg}
                </p>
              ) : null}
              {isDemo ? (
                <p className="text-[12px] text-fg-faint">
                  데모 모드에서는 설정이 저장되지 않아요 — 실제 계정에서는 자동 저장됩니다.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
