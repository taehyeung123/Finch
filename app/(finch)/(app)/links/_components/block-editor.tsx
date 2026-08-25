"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sliceChars } from "@/lib/links";
import { BLOCK_CATALOG, COLLAPSE_OPTIONS, CONTACT_FIELDS, COUPANG_DISCLOSURE, LINK_LAYOUTS, LINK_TEXT_COLORS, type LinkBlock } from "@/lib/links/blocks";
import { ImageField } from "./image-field";
import { FileField } from "./file-field";
import { fetchLinkMeta } from "../actions";

/*
  블록 편집기 — 블록 타입마다 다른 필드를 그린다.

  링크팜은 미리보기 안에서 인라인 편집(호버 툴바)하지만 우리는 패널에서 편집한다.
  블록이 15종이라 인라인으로는 필드를 다 못 넣고, 무엇보다 키보드로 조작할 수 있다.

  저장은 **명시적**이다(자동 저장 아님). 자동 저장이면 타이핑 중간값이 서버로 계속
  날아가고, URL 처럼 "치는 도중에는 반드시 무효"인 필드에서 오류가 계속 뜬다.
*/

const input =
  "h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";
const area =
  "w-full rounded-card border border-line bg-body px-3 py-2 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";
const label = "block text-[14px] font-medium text-fg";

/** 편집기가 열릴 때 부모가 포커스를 옮길 자리 */
export const EDITOR_TITLE_ID = "block-editor-title";

/**
 * 편집 중인 값(`value`)은 **부모가 들고 있다.**
 *
 * 이유: 탭 버튼이 편집 필드 바로 위에 있어서, "테마가 뭐였지" 하고 한 번 누르면 항목
 * 12개의 제목·주소·업로드까지 끝낸 이미지 경로가 경고 없이 날아갔다. 부모가 탭 전환·
 * 닫기 전에 "미저장인가"를 알아야 확인을 받을 수 있는데, 그 값이 여기 state 로 갇혀
 * 있으면 알 방법이 없다(렌더 중 부모 state 를 건드릴 수도, ref 를 읽을 수도 없다).
 * 값을 위로 올리면 미저장 판정이 **순수 파생값**이 된다.
 */
export function BlockEditor({
  block,
  value,
  onChange,
  busy,
  error,
  dirty,
  onSave,
  onRevert,
  onClose,
  embedded = false,
}: {
  block: LinkBlock;
  /** 블록 목록 행 안에 펼쳐진 경우 — 행 헤더가 제목·닫기 역할을 하므로 자체 헤더를 숨긴다 */
  embedded?: boolean;
  value: Record<string, unknown>;
  /** 함수형 갱신을 받는다 — 업로드·불러오기처럼 몇 초 뒤에 끝나는 갱신이 그 사이의 입력을 덮지 않게(감사 C6) */
  onChange: (next: Record<string, unknown> | ((cur: Record<string, unknown>) => Record<string, unknown>)) => void;
  busy: boolean;
  /** 저장 실패 사유 — 화면 맨 위 배너만으로는 여기까지 스크롤한 사용자가 못 본다 */
  error: string | null;
  dirty: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onRevert: () => void;
  onClose: () => void;
}) {
  const d = value;
  const set = (k: string, v: unknown) => onChange((cur) => ({ ...cur, [k]: v }));
  /* 이미지 교체는 치수(imgW/imgH)를 함께 갱신한다 — 공개 페이지가 로드 전 자리를 확보(CLS).
     업로드가 아닌 경로(주소 붙여넣기·지우기)는 dims 가 없으므로 이전 치수를 지운다 */
  const setImage = (url: string, dims?: { w: number; h: number }) =>
    onChange((cur) => {
      const next: Record<string, unknown> = { ...cur, imagePath: url };
      if (url && dims) {
        next.imgW = dims.w;
        next.imgH = dims.h;
      } else {
        delete next.imgW;
        delete next.imgH;
      }
      return next;
    });
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const num = (k: string, fb: number) => (typeof d[k] === "number" ? (d[k] as number) : fb);
  const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];
  const fields = Array.isArray(d.fields) ? (d.fields as string[]) : [];

  const setItem = (i: number, k: string, v: unknown) =>
    onChange((cur) => {
      const its = Array.isArray(cur.items) ? (cur.items as Record<string, unknown>[]) : [];
      return { ...cur, items: its.map((it, j) => (j === i ? { ...it, [k]: v } : it)) };
    });

  const meta = BLOCK_CATALOG.find((c) => c.type === block.type);
  const tags = Array.isArray(d.tags) ? (d.tags as string[]).filter((t) => typeof t === "string") : [];
  const [tagDraft, setTagDraft] = useState("");
  /* 주소로 제목·이미지 불러오기 — 어느 칸(블록 자체 = -1, 항목 = i)이 도는 중인가 */
  const [fetching, setFetching] = useState<number | null>(null);
  const [fetchMsg, setFetchMsg] = useState<{ slot: number; text: string } | null>(null);
  /* 불러오기는 몇 초 걸린다 — 끝났을 때 이 편집기가 이미 닫혔거나 다른 블록으로 바뀌었으면 결과를 버린다.
     안 버리면 A 블록의 결과가 B 블록의 초안에 들어간다(감사 C5). 같은 블록의 그 사이 입력은 함수형 갱신이 지킨다. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function pullMeta(
    url: string,
    apply: (cur: Record<string, unknown>, m: { title?: string; image?: string; description?: string }) => Record<string, unknown>,
    slot: number,
  ) {
    if (!url.trim()) {
      setFetchMsg({ slot, text: "먼저 주소를 넣어 주세요." });
      return;
    }
    setFetching(slot);
    setFetchMsg(null);
    try {
      const r = await fetchLinkMeta(url);
      if (!alive.current) return;
      if (!r.ok) setFetchMsg({ slot, text: r.error ?? "불러오지 못했어요." });
      else {
        onChange((cur) => apply(cur, r));
        setFetchMsg({ slot, text: r.title || r.image ? "제목·이미지를 채웠어요 — 마음에 안 들면 고치세요." : "찾은 정보가 없어요." });
      }
    } catch {
      if (alive.current) setFetchMsg({ slot, text: "불러오지 못했어요." });
    } finally {
      if (alive.current) setFetching(null);
    }
  }
  function addTag(raw: string) {
    const t = raw.replace(/^#/, "").trim().slice(0, 16);
    if (!t || tags.includes(t) || tags.length >= 3) return;
    set("tags", [...tags, t]);
    setTagDraft("");
  }
  const fetchBtn = "trans-state shrink-0 rounded-card border border-line px-2.5 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg disabled:opacity-50";

  return (
    <div className="space-y-3">
      {embedded ? (
        /* 포커스 목적지는 남긴다 — 부모가 EDITOR_TITLE_ID 로 포커스를 옮겨 화면이 바뀐 걸 알린다 */
        <h3 id={EDITOR_TITLE_ID} tabIndex={-1} className="sr-only outline-none">
          {meta?.label ?? block.type} 편집
        </h3>
      ) : (
      <div className="flex items-center justify-between gap-2">
        {/* 편집기가 열리면 부모가 이 제목으로 포커스를 옮긴다(id 로 찾는다) — 목록에서
            엔터를 눌렀는데 포커스가 그 자리에 남아 있으면 키보드·스크린리더 사용자는
            화면이 바뀐 걸 모른다. 닫을 때는 부모가 원래 행으로 되돌린다.
            autoFocus 는 안 된다: 그 속성은 파싱 시점에만 동작해서, 클라이언트에서
            새로 끼워 넣은 비폼 요소에는 적용되지 않는다(실제로 포커스가 body 에 남았다). */}
        <h3 id={EDITOR_TITLE_ID} tabIndex={-1} className="text-[15px] font-bold outline-none">
          {meta?.label ?? block.type}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="편집 닫기"
          className="trans-state rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>
      )}

      {/* ── 링크 버튼 ── */}
      {block.type === "link" ? (
        <>
          <div>
            <label className={label} htmlFor="b-label">
              버튼 이름
            </label>
            <input id="b-label" value={str("label")} onChange={(e) => set("label", e.target.value)} maxLength={40} className={`mt-1.5 ${input}`} />
          </div>
          <div>
            <label className={label} htmlFor="b-url">
              링크 주소
            </label>
            <div className="mt-1.5 flex gap-1.5">
              <input id="b-url" value={str("url")} onChange={(e) => set("url", e.target.value)} placeholder="https://example.com" className={input} />
              {/* 리틀리 카피 — 주소를 넣으면 제목·썸네일을 OG 로 채운다(비어 있는 칸만) */}
              <button
                type="button"
                disabled={fetching !== null}
                onClick={() =>
                  pullMeta(
                    str("url"),
                    (cur, m) => ({
                      ...cur,
                      label: (typeof cur.label === "string" && cur.label) || m.title || "",
                      imagePath: (typeof cur.imagePath === "string" && cur.imagePath) || m.image || "",
                    }),
                    -1,
                  )
                }
                className={fetchBtn}
              >
                {fetching === -1 ? "불러오는 중…" : "불러오기"}
              </button>
            </div>
            {fetchMsg?.slot === -1 ? <p className="mt-1 text-[12px] text-fg-sub">{fetchMsg.text}</p> : null}
          </div>

          {/* 레이아웃 — 리틀리 작은/중간/큰 카드 카피. 카드형이면 썸네일이 보인다 */}
          <div>
            <span className={label}>레이아웃</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {LINK_LAYOUTS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => set("layout", l.key)}
                  aria-pressed={(str("layout") || "button") === l.key}
                  className={
                    (str("layout") || "button") === l.key
                      ? "rounded-chip bg-primary px-3 py-1.5 text-[12px] font-semibold text-on-primary"
                      : "trans-state rounded-chip border border-line px-3 py-1.5 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg"
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          {(str("layout") || "button") !== "button" ? (
            <ImageField label="썸네일 (선택)" value={str("imagePath")} onChange={(v) => set("imagePath", v)} aspect="aspect-[16/9]" />
          ) : null}

          {/* 강조 태그 — 최대 3개. 버튼 아래 작은 칩 */}
          <div>
            <label className={label} htmlFor="b-tag">
              강조 태그 <span className="font-normal text-fg-faint">(최대 3개)</span>
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-chip bg-plate px-2 py-1 text-[12px] font-semibold text-fg">
                  #{t}
                  <button type="button" aria-label={`태그 ${t} 삭제`} onClick={() => set("tags", tags.filter((x) => x !== t))} className="text-fg-faint hover:text-fg">
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
              {tags.length < 3 ? (
                <input
                  id="b-tag"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagDraft);
                    }
                  }}
                  onBlur={() => addTag(tagDraft)}
                  placeholder="입력 후 Enter"
                  maxLength={16}
                  className="h-8 min-w-[120px] flex-1 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
                />
              ) : null}
            </div>
          </div>

          {/* 판매가·정가 — 표시용 문자열. 정가가 있으면 취소선으로 옆에 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="b-price">
                판매가 (선택)
              </label>
              <input id="b-price" value={str("price")} onChange={(e) => set("price", e.target.value)} placeholder="29,000원" maxLength={20} className={`mt-1.5 ${input}`} />
            </div>
            <div>
              <label className={label} htmlFor="b-oprice">
                정가 (선택)
              </label>
              <input id="b-oprice" value={str("originalPrice")} onChange={(e) => set("originalPrice", e.target.value)} placeholder="39,000원" maxLength={20} className={`mt-1.5 ${input}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="b-emoji">
                아이콘 (선택)
              </label>
              <input id="b-emoji" value={str("emoji")} onChange={(e) => set("emoji", sliceChars(e.target.value, 4))} placeholder="🔔" className={`mt-1.5 ${input}`} />
            </div>
            <div>
              <label className={label} htmlFor="b-emph">
                강조
              </label>
              <select id="b-emph" value={str("emphasis") || "normal"} onChange={(e) => set("emphasis", e.target.value)} className={`mt-1.5 ${input}`}>
                <option value="normal">기본</option>
                <option value="primary">채움</option>
                <option value="outline">테두리</option>
              </select>
            </div>
          </div>

          {/* 텍스트 스타일 — 링크팜의 블록별 크기·굵기·색 카피(2026-08-20 대조 6번) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="b-tsize">
                글자 크기
              </label>
              <select id="b-tsize" value={str("textSize") || "md"} onChange={(e) => set("textSize", e.target.value)} className={`mt-1.5 ${input}`}>
                <option value="sm">작게</option>
                <option value="md">기본</option>
                <option value="lg">크게</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="b-tweight">
                글자 굵기
              </label>
              <select id="b-tweight" value={str("textWeight") || "semibold"} onChange={(e) => set("textWeight", e.target.value)} className={`mt-1.5 ${input}`}>
                <option value="medium">보통</option>
                <option value="semibold">세미볼드</option>
                <option value="bold">볼드</option>
              </select>
            </div>
          </div>
          <div>
            <span className={label}>글자 색</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {LINK_TEXT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("textColor", c)}
                  aria-label={`글자 색 ${c}`}
                  aria-pressed={str("textColor") === c}
                  className={
                    str("textColor") === c
                      ? "size-6 rounded-full border-2 border-primary"
                      : "trans-state size-6 rounded-full border border-line hover:border-line-strong"
                  }
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(str("textColor")) ? str("textColor") : "#111827"}
                onChange={(e) => set("textColor", e.target.value)}
                aria-label="글자 색 직접 고르기"
                className="size-6 cursor-pointer rounded-full border border-line bg-body p-0"
              />
              <button
                type="button"
                onClick={() => set("textColor", "")}
                className="trans-state rounded-chip border border-line px-2 py-0.5 text-[11px] font-medium text-fg-sub hover:bg-tint-hover hover:text-fg"
              >
                테마 색으로
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* ── 텍스트류 ── */}
      {block.type === "heading" || block.type === "text" || block.type === "notice" ? (
        <div>
          <label className={label} htmlFor="b-text">
            내용
          </label>
          <textarea
            id="b-text"
            value={str("text")}
            onChange={(e) => set("text", e.target.value)}
            rows={block.type === "heading" ? 1 : 3}
            maxLength={500}
            className={`mt-1.5 ${area}`}
          />
        </div>
      ) : null}

      {block.type === "notice" ? (
        <div>
          <label className={label} htmlFor="b-tone">
            강조
          </label>
          <select id="b-tone" value={str("tone") || "info"} onChange={(e) => set("tone", e.target.value)} className={`mt-1.5 ${input}`}>
            <option value="info">기본</option>
            <option value="primary">채움</option>
          </select>
        </div>
      ) : null}

      {block.type === "text" ? (
        <div>
          <label className={label} htmlFor="b-align">
            정렬
          </label>
          <select id="b-align" value={str("align") || "left"} onChange={(e) => set("align", e.target.value)} className={`mt-1.5 ${input}`}>
            <option value="left">왼쪽</option>
            <option value="center">가운데</option>
          </select>
        </div>
      ) : null}

      {/* ── 구분선·빈 공간 ── */}
      {block.type === "divider" ? (
        <div>
          <label className={label} htmlFor="b-style">
            모양
          </label>
          <select id="b-style" value={str("style") || "line"} onChange={(e) => set("style", e.target.value)} className={`mt-1.5 ${input}`}>
            <option value="line">선</option>
            <option value="dot">점</option>
          </select>
        </div>
      ) : null}

      {block.type === "spacer" ? (
        <div>
          <label className={label} htmlFor="b-size">
            높이
          </label>
          <select
            id="b-size"
            value={String(num("size", 24))}
            onChange={(e) => set("size", Number(e.target.value))}
            className={`mt-1.5 ${input}`}
          >
            {[8, 16, 24, 40].map((v) => (
              <option key={v} value={v}>
                {v}px
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* ── 수익화: 쿠팡 파트너스·후원하기 ── */}
      {block.type === "coupang" ? (
        <>
          <div>
            <label className={label} htmlFor="b-cp-url">
              파트너스 링크
            </label>
            <input
              id="b-cp-url"
              value={str("url")}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://link.coupang.com/..."
              className={`mt-1.5 ${input}`}
            />
            <p className="mt-1 text-[12px] text-fg-sub">쿠팡 파트너스에서 발급받은 상품 링크를 붙여넣으세요.</p>
          </div>
          <div>
            <label className={label} htmlFor="b-cp-title">
              상품 이름
            </label>
            <input
              id="b-cp-title"
              value={str("title")}
              onChange={(e) => set("title", e.target.value)}
              maxLength={60}
              className={`mt-1.5 ${input}`}
            />
          </div>
          <div>
            <label className={label} htmlFor="b-cp-price">
              가격 표시 (선택)
            </label>
            <input
              id="b-cp-price"
              value={str("price")}
              onChange={(e) => set("price", e.target.value)}
              maxLength={20}
              placeholder="19,900원"
              className={`mt-1.5 ${input}`}
            />
          </div>
          <ImageField label="상품 이미지 (선택)" value={str("imagePath")} onChange={(v) => set("imagePath", v)} />
          {/* 고지는 옵션이 아니다 — 편집 중에 미리 보여줘야 발행 후에 놀라지 않는다 */}
          <p className="rounded-card bg-plate px-3 py-2.5 text-[12px] leading-[1.6] text-fg-sub">
            공개 페이지에는 「{COUPANG_DISCLOSURE}」 문구가 자동으로 붙어요 — 공정위 표시 의무라 끌 수 없습니다.
          </p>
        </>
      ) : null}

      {block.type === "donation" ? (
        <>
          <div>
            <label className={label} htmlFor="b-dn-url">
              후원 링크
            </label>
            <input
              id="b-dn-url"
              value={str("url")}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://toss.me/내아이디"
              className={`mt-1.5 ${input}`}
            />
            <p className="mt-1 text-[12px] text-fg-sub">토스 송금 링크(toss.me)·카카오페이 송금코드 주소 등을 넣으세요.</p>
          </div>
          <div>
            <label className={label} htmlFor="b-dn-label">
              버튼 문구
            </label>
            <input
              id="b-dn-label"
              value={str("label")}
              onChange={(e) => set("label", e.target.value)}
              maxLength={40}
              placeholder="후원하기"
              className={`mt-1.5 ${input}`}
            />
          </div>
          <div>
            <label className={label} htmlFor="b-dn-emoji">
              이모지 (선택)
            </label>
            <input
              id="b-dn-emoji"
              value={str("emoji")}
              onChange={(e) => set("emoji", e.target.value)}
              maxLength={4}
              placeholder="💛"
              className={`mt-1.5 ${input}`}
            />
          </div>
          <div>
            <label className={label} htmlFor="b-dn-msg">
              응원 문구 (선택)
            </label>
            <input
              id="b-dn-msg"
              value={str("message")}
              onChange={(e) => set("message", e.target.value)}
              maxLength={140}
              placeholder="콘텐츠가 도움이 됐다면 커피 한 잔 부탁드려요"
              className={`mt-1.5 ${input}`}
            />
          </div>
        </>
      ) : null}

      {/* ── 이미지·이미지 카드 ── */}
      {block.type === "image" || block.type === "image_card" ? (
        <ImageField label="이미지" value={str("imagePath")} onChange={setImage} />
      ) : null}

      {/* 대체 텍스트 — 공개 렌더러가 alt 로 내보낸다(block-renderer.tsx). 입력칸이 없어서
          값이 영원히 비어 있었다: 스크린리더 사용자에게 배너·포스터가 통째로 침묵한다.
          목록 요약에도 쓰여, 이미지 블록 3개가 전부 「이미지」로 보이던 것도 같이 풀린다. */}
      {block.type === "image" ? (
        <div>
          <label className={label} htmlFor="b-alt">
            대체 텍스트 (선택)
          </label>
          <input
            id="b-alt"
            value={str("alt")}
            onChange={(e) => set("alt", e.target.value)}
            placeholder="이미지 내용을 한 줄로 — 화면을 못 보는 방문자에게 읽힙니다"
            maxLength={100}
            className={`mt-1.5 ${input}`}
          />
        </div>
      ) : null}

      {block.type === "image_card" ? (
        <>
          <div>
            <label className={label} htmlFor="b-title">
              제목
            </label>
            <input id="b-title" value={str("title")} onChange={(e) => set("title", e.target.value)} maxLength={60} className={`mt-1.5 ${input}`} />
          </div>
          <div>
            <label className={label} htmlFor="b-sub">
              부제목
            </label>
            <input id="b-sub" value={str("subtitle")} onChange={(e) => set("subtitle", e.target.value)} maxLength={80} className={`mt-1.5 ${input}`} />
          </div>
          {/* 공구·판매 셀러가 카드에 넣어야 하는 건 사진·상품명·**가격**·「구매하기」다.
              가격을 부제목에 욱여넣으면 스타일을 다르게 줄 수 없다. */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="b-price">
                가격 (선택)
              </label>
              <input id="b-price" value={str("price")} onChange={(e) => set("price", e.target.value)} placeholder="29,000원" maxLength={40} className={`mt-1.5 ${input}`} />
            </div>
            <div>
              <label className={label} htmlFor="b-cta">
                버튼 문구 (선택)
              </label>
              <input id="b-cta" value={str("ctaLabel")} onChange={(e) => set("ctaLabel", e.target.value)} placeholder="구매하기" maxLength={20} className={`mt-1.5 ${input}`} />
            </div>
          </div>
        </>
      ) : null}

      {block.type === "image" || block.type === "image_card" || block.type === "video" ? (
        <div>
          <label className={label} htmlFor="b-url2">
            {block.type === "video" ? "영상 주소" : "링크 주소 (선택)"}
          </label>
          <input
            id="b-url2"
            value={str("url")}
            onChange={(e) => set("url", e.target.value)}
            placeholder={block.type === "video" ? "https://www.youtube.com/watch?v=…" : "https://…"}
            className={`mt-1.5 ${input}`}
          />
        </div>
      ) : null}

      {/* 영상 제목 — 임베드의 title(스크린리더가 읽는 이름)이자, 임베드가 안 되는 주소일 때
          「▶ …」 링크 버튼의 문구다(block-renderer.tsx). 이것도 입력칸이 없었다. */}
      {block.type === "video" ? (
        <div>
          <label className={label} htmlFor="b-vtitle">
            영상 제목 (선택)
          </label>
          <input
            id="b-vtitle"
            value={str("title")}
            onChange={(e) => set("title", e.target.value)}
            placeholder="영상 보러 가기"
            maxLength={60}
            className={`mt-1.5 ${input}`}
          />
          <p className="mt-1 text-[12px] leading-snug text-fg-sub">
            유튜브 주소면 바로 재생돼요. 그 밖의 영상은 이 제목이 붙은 링크 버튼으로 나갑니다.
          </p>
        </div>
      ) : null}

      {/* ── 배열형(가로 카드·그리드) ── */}
      {block.type === "card_row" || block.type === "grid" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {block.type === "grid" ? (
              <div>
                <label className={label} htmlFor="b-cols">
                  열 수
                </label>
                <select id="b-cols" value={String(num("columns", 2))} onChange={(e) => set("columns", Number(e.target.value))} className={`mt-1.5 ${input}`}>
                  <option value="2">2열</option>
                  <option value="3">3열</option>
                </select>
              </div>
            ) : (
              <div>
                <label className={label} htmlFor="b-layout">
                  배치
                </label>
                <select id="b-layout" value={str("layout") || "list"} onChange={(e) => set("layout", e.target.value)} className={`mt-1.5 ${input}`}>
                  <option value="list">세로 목록</option>
                  <option value="carousel">가로 캐러셀</option>
                </select>
              </div>
            )}
            <div>
              <label className={label} htmlFor="b-collapse">
                링크 나열
              </label>
              {/* 리틀리 「전부 나열 / 접기 적용」 — 처음 N개만 보이고 「더보기」 */}
              <select id="b-collapse" value={String(num("collapse", 0))} onChange={(e) => set("collapse", Number(e.target.value))} className={`mt-1.5 ${input}`}>
                {COLLAPSE_OPTIONS.map((c) => (
                  <option key={c} value={String(c)}>
                    {c === 0 ? "전부 나열" : `${c}개만 보이고 접기`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="space-y-2 rounded-card border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-fg-sub">항목 {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => set("items", items.filter((_, j) => j !== i))}
                    aria-label={`항목 ${i + 1} 삭제`}
                    className="trans-state rounded-card p-1 text-fg-faint hover:bg-tint-hover hover:text-negative"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <input
                  value={typeof it.title === "string" ? it.title : ""}
                  onChange={(e) => setItem(i, "title", e.target.value)}
                  placeholder="제목"
                  aria-label={`항목 ${i + 1} 제목`}
                  maxLength={60}
                  className={input}
                />
                {block.type === "card_row" ? (
                  <input
                    value={typeof it.subtitle === "string" ? it.subtitle : ""}
                    onChange={(e) => setItem(i, "subtitle", e.target.value)}
                    placeholder="부제목"
                    aria-label={`항목 ${i + 1} 부제목`}
                    maxLength={80}
                    className={input}
                  />
                ) : null}
                <div className="flex gap-1.5">
                  <input
                    value={typeof it.url === "string" ? it.url : ""}
                    onChange={(e) => setItem(i, "url", e.target.value)}
                    placeholder="https://…"
                    aria-label={`항목 ${i + 1} 주소`}
                    className={input}
                  />
                  <button
                    type="button"
                    disabled={fetching !== null}
                    onClick={() =>
                      pullMeta(
                        typeof it.url === "string" ? it.url : "",
                        (cur, m) => {
                          const curItems = Array.isArray(cur.items) ? (cur.items as Record<string, unknown>[]) : [];
                          return {
                            ...cur,
                            items: curItems.map((x, j) =>
                              j === i
                                ? { ...x, title: (typeof x.title === "string" && x.title) || m.title || "", imagePath: (typeof x.imagePath === "string" && x.imagePath) || m.image || "" }
                                : x,
                            ),
                          };
                        },
                        i,
                      )
                    }
                    className={fetchBtn}
                  >
                    {fetching === i ? "…" : "불러오기"}
                  </button>
                </div>
                {fetchMsg?.slot === i ? <p className="text-[12px] text-fg-sub">{fetchMsg.text}</p> : null}
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    value={typeof it.price === "string" ? it.price : ""}
                    onChange={(e) => setItem(i, "price", e.target.value)}
                    placeholder="판매가 (선택)"
                    aria-label={`항목 ${i + 1} 판매가`}
                    maxLength={20}
                    className={input}
                  />
                  <input
                    value={typeof it.originalPrice === "string" ? it.originalPrice : ""}
                    onChange={(e) => setItem(i, "originalPrice", e.target.value)}
                    placeholder="정가 (선택)"
                    aria-label={`항목 ${i + 1} 정가`}
                    maxLength={20}
                    className={input}
                  />
                </div>
                <ImageField
                  label={`항목 ${i + 1} 이미지`}
                  value={typeof it.imagePath === "string" ? it.imagePath : ""}
                  onChange={(v) => setItem(i, "imagePath", v)}
                  aspect="aspect-[3/2]"
                />
              </div>
            ))}
            {items.length < 12 ? (
              <Button variant="secondary" size="sm" onClick={() => set("items", [...items, { title: "", url: "" }])}>
                <Plus className="size-3.5" aria-hidden />
                항목 추가
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {/* ── 리틀리 흡수 4단계: 갤러리 ── */}
      {block.type === "gallery" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="b-glayout">
                레이아웃
              </label>
              <select id="b-glayout" value={str("layout") || "grid"} onChange={(e) => set("layout", e.target.value)} className={`mt-1.5 ${input}`}>
                <option value="grid">썸네일 보기</option>
                <option value="list">목록</option>
                <option value="slide">한 장씩 보기</option>
                <option value="carousel">캐러셀</option>
                <option value="masonry">자유</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="b-aspect">
                이미지 비율
              </label>
              <select id="b-aspect" value={str("aspect") || "square"} onChange={(e) => set("aspect", e.target.value)} className={`mt-1.5 ${input}`}>
                <option value="square">정사각형</option>
                <option value="intrinsic">개별 비율 유지</option>
              </select>
            </div>
          </div>
          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="space-y-2 rounded-card border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-fg-sub">사진 {i + 1}</span>
                  <button type="button" onClick={() => set("items", items.filter((_, j) => j !== i))} aria-label={`사진 ${i + 1} 삭제`} className="trans-state rounded-card p-1 text-fg-faint hover:bg-tint-hover hover:text-negative">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <ImageField label={`사진 ${i + 1}`} value={typeof it.imagePath === "string" ? it.imagePath : ""} onChange={(v) => setItem(i, "imagePath", v)} aspect="aspect-[4/3]" />
                <input value={typeof it.url === "string" ? it.url : ""} onChange={(e) => setItem(i, "url", e.target.value)} placeholder="누르면 갈 주소 (선택)" aria-label={`사진 ${i + 1} 링크`} className={input} />
              </div>
            ))}
            {items.length < 30 ? (
              <Button variant="secondary" size="sm" onClick={() => set("items", [...items, { imagePath: "" }])}>
                <Plus className="size-3.5" aria-hidden />
                사진 추가 <span className="font-normal text-fg-sub">({items.length}/30)</span>
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {/* ── 음악 ── */}
      {block.type === "music" ? (
        <>
          <div>
            <label className={label} htmlFor="b-murl">
              음악 주소
            </label>
            <input id="b-murl" value={str("url")} onChange={(e) => set("url", e.target.value)} placeholder="https://open.spotify.com/… · soundcloud.com/… · music.youtube.com/…" className={`mt-1.5 ${input}`} />
            <p className="mt-1 text-[12px] text-fg-sub">스포티파이(트랙·앨범·플레이리스트)·사운드클라우드·유튜브 뮤직 주소를 넣으면 플레이어로 보여요.</p>
          </div>
          <div>
            <label className={label} htmlFor="b-mtitle">
              제목 (선택)
            </label>
            <input id="b-mtitle" value={str("title")} onChange={(e) => set("title", e.target.value)} maxLength={60} className={`mt-1.5 ${input}`} />
          </div>
        </>
      ) : null}

      {/* ── 연락처 저장(vCard) ── */}
      {block.type === "vcard" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["name", "이름 *", "홍길동"],
                ["phone", "전화", "010-0000-0000"],
                ["email", "이메일", "hello@example.com"],
                ["org", "회사·브랜드", "핀치"],
                ["role", "직함", "대표"],
                ["website", "웹사이트", "https://"],
              ] as const
            ).map(([k, lab, ph]) => (
              <div key={k}>
                <label className={label} htmlFor={`b-v-${k}`}>
                  {lab}
                </label>
                <input id={`b-v-${k}`} value={str(k)} onChange={(e) => set(k, e.target.value)} placeholder={ph} maxLength={60} className={`mt-1.5 ${input}`} />
              </div>
            ))}
          </div>
          <div>
            <label className={label} htmlFor="b-vlabel">
              버튼 문구
            </label>
            <input id="b-vlabel" value={str("label")} onChange={(e) => set("label", e.target.value)} placeholder="연락처 저장" maxLength={40} className={`mt-1.5 ${input}`} />
          </div>
          <p className="text-[12px] text-fg-sub">누르면 방문자 폰에 연락처(vCard)로 저장돼요.</p>
        </>
      ) : null}

      {/* ── 검색 ── */}
      {block.type === "search" ? (
        <div>
          <label className={label} htmlFor="b-sph">
            안내 문구
          </label>
          <input id="b-sph" value={str("placeholder")} onChange={(e) => set("placeholder", e.target.value)} placeholder="무엇을 찾으세요?" maxLength={40} className={`mt-1.5 ${input}`} />
          <p className="mt-1 text-[12px] text-fg-sub">방문자가 글자를 치면 페이지 안 블록을 바로 걸러 보여줘요.</p>
        </div>
      ) : null}

      {/* ── 파일 공유 ── */}
      {block.type === "file" ? (
        <>
          <FileField
            value={str("url")}
            fileName={str("fileName")}
            onChange={(f) => onChange((cur) => ({ ...cur, url: f.url, fileName: f.fileName, fileSize: f.fileSize ?? 0 }))}
          />
          <div>
            <label className={label} htmlFor="b-ftitle">
              제목
            </label>
            <input id="b-ftitle" value={str("title")} onChange={(e) => set("title", e.target.value)} placeholder="예: 2026 카탈로그 PDF" maxLength={60} className={`mt-1.5 ${input}`} />
          </div>
          <div>
            <label className={label} htmlFor="b-fdesc">
              설명 (선택)
            </label>
            <input id="b-fdesc" value={str("description")} onChange={(e) => set("description", e.target.value)} maxLength={80} className={`mt-1.5 ${input}`} />
          </div>
        </>
      ) : null}

      {/* ── 방명록 ── */}
      {block.type === "guestbook" ? (
        <>
          <div>
            <label className={label} htmlFor="b-gtitle">
              제목
            </label>
            <input id="b-gtitle" value={str("title")} onChange={(e) => set("title", e.target.value)} placeholder="방명록" maxLength={40} className={`mt-1.5 ${input}`} />
          </div>
          <div>
            <label className={label} htmlFor="b-gph">
              입력칸 안내
            </label>
            <input id="b-gph" value={str("placeholder")} onChange={(e) => set("placeholder", e.target.value)} placeholder="한마디 남겨 주세요" maxLength={40} className={`mt-1.5 ${input}`} />
          </div>
          <p className="text-[12px] text-fg-sub">방문자 글은 「관리」 탭 방명록에서 답글·숨김·삭제할 수 있어요.</p>
        </>
      ) : null}

      {/* ── 최근 게시물 ── */}
      {block.type === "social_feed" ? (
        <>
          <div>
            <label className={label} htmlFor="b-ch">
              채널
            </label>
            {/* 틱톡·스레드는 **고를 수 없다.** 고르면 발행 시 빈 배열이 구워지고
                (actions.ts publishLinkPage), 공개 렌더러가 빈 배열이면 블록을 통째로
                숨긴다 — 편집기에는 멀쩡히 보이는데 공개 페이지에서 사라졌다. */}
            <select id="b-ch" value={str("channel") || "instagram"} onChange={(e) => set("channel", e.target.value)} className={`mt-1.5 ${input}`}>
              <option value="instagram">인스타그램</option>
              <option value="tiktok" disabled>
                틱톡 (준비 중)
              </option>
              <option value="threads" disabled>
                스레드 (준비 중)
              </option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="b-cnt">
              개수
            </label>
            <select id="b-cnt" value={String(num("count", 6))} onChange={(e) => set("count", Number(e.target.value))} className={`mt-1.5 ${input}`}>
              {[3, 6, 9].map((v) => (
                <option key={v} value={v}>
                  {v}개
                </option>
              ))}
            </select>
          </div>
          <p className="text-[12px] leading-snug text-fg-sub">
            <strong className="font-semibold">인스타그램을 연동해 두면</strong> 최근 게시물이
            「라이브 반영」할 때 채워집니다. 방문자마다 플랫폼을 조회하면 요청 제한에 걸려서,
            발행 시점에 한 번만 가져와요. 연동 전이면 이 블록은 공개 페이지에 나오지 않아요.
          </p>
        </>
      ) : null}

      {/* ── 받기 ── */}
      {block.type === "contact" || block.type === "subscribe" ? (
        <>
          <div>
            <label className={label} htmlFor="b-ftitle">
              제목
            </label>
            <input id="b-ftitle" value={str("title")} onChange={(e) => set("title", e.target.value)} maxLength={40} className={`mt-1.5 ${input}`} />
          </div>
          <div>
            <label className={label} htmlFor="b-fdesc">
              설명
            </label>
            <textarea id="b-fdesc" value={str("description")} onChange={(e) => set("description", e.target.value)} rows={2} maxLength={160} className={`mt-1.5 ${area}`} />
          </div>

          {/* 구독 버튼 문구 — 공개 폼(lead-form.tsx)이 이 값을 쓰는데 입력칸이 없어서
              누구나 「구독하기」로 고정돼 있었다. */}
          {block.type === "subscribe" ? (
            <div>
              <label className={label} htmlFor="b-btn">
                버튼 문구
              </label>
              <input
                id="b-btn"
                value={str("buttonLabel")}
                onChange={(e) => set("buttonLabel", e.target.value)}
                placeholder="구독하기"
                maxLength={20}
                className={`mt-1.5 ${input}`}
              />
            </div>
          ) : null}

          {block.type === "contact" ? (
            <div>
              <p className={label}>받을 항목</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {CONTACT_FIELDS.map((f) => {
                  const on = fields.includes(f.key);
                  return (
                    <label
                      key={f.key}
                      className="flex cursor-pointer items-center gap-2 rounded-card border border-line px-3 py-2 text-[14px] hover:bg-tint-hover has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        /* 연락 가능한 값이 하나도 없으면 제출이 전부 막힌다
                           (p/[slug]/actions.ts 가 이메일·연락처 중 하나를 요구한다).
                           마지막 하나는 못 끄게 한다. */
                        disabled={on && fields.filter((k) => k === "email" || k === "phone").length === 1 && (f.key === "email" || f.key === "phone")}
                        onChange={(e) =>
                          set("fields", e.target.checked ? [...fields, f.key] : fields.filter((k) => k !== f.key))
                        }
                        className="size-4 accent-[var(--color-primary)]"
                      />
                      {f.label}
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[12px] text-fg-sub">이메일·연락처 중 하나는 반드시 받아야 해요.</p>
            </div>
          ) : null}

          <p className="text-[12px] leading-snug text-fg-sub">
            받은 내용은 <strong className="font-semibold">「관리」 탭</strong>의 「받은 내용」에서 확인할 수 있어요.
          </p>
        </>
      ) : null}

      {/* ── 지도 ── */}
      {block.type === "map" ? (
        <>
          <div>
            <label className={label} htmlFor="b-addr">
              주소
            </label>
            <input id="b-addr" value={str("address")} onChange={(e) => set("address", e.target.value)} placeholder="서울시 강남구 …" maxLength={200} className={`mt-1.5 ${input}`} />
          </div>
          <div>
            <label className={label} htmlFor="b-mlabel">
              표시 이름
            </label>
            <input id="b-mlabel" value={str("label")} onChange={(e) => set("label", e.target.value)} placeholder="찾아오시는 길" maxLength={40} className={`mt-1.5 ${input}`} />
          </div>
        </>
      ) : null}

      {/* ── 일정(리틀리 흡수, 2026-08-25) ── */}
      {block.type === "events" ? (
        <>
          <div>
            <label className={label} htmlFor="b-elabel">
              블록 제목
            </label>
            <input id="b-elabel" value={str("label")} onChange={(e) => set("label", e.target.value)} placeholder="이번 달 일정" maxLength={40} className={`mt-1.5 ${input}`} />
          </div>

          <div className="space-y-3">
            {items.map((it, i) => {
              /* 저장 형식은 "YYYY-MM-DD" 또는 "YYYY-MM-DDTHH:mm" 한 칸이다.
                 편집은 날짜·시간 두 칸으로 받는다 — 시간을 비우면 「하루 종일」이 된다. */
              const at = typeof it.startAt === "string" ? it.startAt : "";
              const [date, time] = at.includes("T") ? at.split("T") : [at, ""];
              const setAt = (nextDate: string, nextTime: string) =>
                setItem(i, "startAt", nextDate ? (nextTime ? `${nextDate}T${nextTime}` : nextDate) : "");
              return (
                <div key={i} className="space-y-2 rounded-card border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-fg-sub">일정 {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => set("items", items.filter((_, j) => j !== i))}
                      aria-label={`일정 ${i + 1} 삭제`}
                      className="trans-state rounded-card p-1 text-fg-faint hover:bg-tint-hover hover:text-negative"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <input
                    value={typeof it.title === "string" ? it.title : ""}
                    onChange={(e) => setItem(i, "title", e.target.value)}
                    placeholder="일정 이름 (예: 가을 공구 오픈)"
                    aria-label={`일정 ${i + 1} 이름`}
                    maxLength={60}
                    className={input}
                  />
                  {/* 날짜 칸에는 **눈에 보이는 라벨**이 필요하다 — 빈 date 인풋 둘은 둘 다 「yyyy-mm-dd」라
                      어느 쪽이 종료일인지 알 수 없다. 시각 칸은 8.5rem: 한국어 «오후 08:00» 이 7rem 에서 잘린다 */}
                  <div className="grid grid-cols-[1fr_8.5rem] gap-1.5">
                    <label className="block text-[11px] font-medium text-fg-sub">
                      시작 날짜
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setAt(e.target.value, time)}
                        aria-label={`일정 ${i + 1} 시작 날짜`}
                        className={`mt-1 ${input}`}
                      />
                    </label>
                    <label className="block text-[11px] font-medium text-fg-sub">
                      시각 (선택)
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setAt(date, e.target.value)}
                        aria-label={`일정 ${i + 1} 시각 (비우면 하루 종일)`}
                        className={`mt-1 ${input}`}
                      />
                    </label>
                  </div>
                  {/* date 인풋은 «yyyy-mm-dd» + 달력 아이콘이 들어갈 최소 폭이 필요하다 —
                      375 에서 2열이면 125px 로 잘린다. 좁으면 한 줄씩 쌓는다 */}
                  <div className="grid grid-cols-1 gap-1.5 min-[400px]:grid-cols-2">
                    <label className="block text-[11px] font-medium text-fg-sub">
                      종료 날짜 (여러 날일 때)
                      <input
                        type="date"
                        value={typeof it.endAt === "string" ? it.endAt.split("T")[0] : ""}
                        onChange={(e) => setItem(i, "endAt", e.target.value)}
                        aria-label={`일정 ${i + 1} 종료 날짜 (선택)`}
                        className={`mt-1 ${input}`}
                      />
                    </label>
                    <label className="block text-[11px] font-medium text-fg-sub">
                      장소 (선택)
                      <input
                        value={typeof it.place === "string" ? it.place : ""}
                        onChange={(e) => setItem(i, "place", e.target.value)}
                        placeholder="예: 인스타 라이브"
                        aria-label={`일정 ${i + 1} 장소`}
                        maxLength={40}
                        className={`mt-1 ${input}`}
                      />
                    </label>
                  </div>
                  <input
                    value={typeof it.url === "string" ? it.url : ""}
                    onChange={(e) => setItem(i, "url", e.target.value)}
                    placeholder="자세히 볼 주소 (선택)"
                    aria-label={`일정 ${i + 1} 주소`}
                    className={input}
                  />
                </div>
              );
            })}
            <p className="text-[12px] text-fg-sub">시각을 비우면 「하루 종일」로 보여요. 지난 일정은 아래 설정대로 숨기거나 흐리게 남겨요.</p>
            {items.length < 12 ? (
              <Button variant="secondary" size="sm" onClick={() => set("items", [...items, { title: "", startAt: "" }])}>
                <Plus className="size-3.5" aria-hidden />
                일정 추가
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="b-epast">
                지난 일정
              </label>
              <select id="b-epast" value={str("past") || "hide"} onChange={(e) => set("past", e.target.value)} className={`mt-1.5 ${input}`}>
                <option value="hide">지나면 숨기기</option>
                <option value="dim">흐리게 남기기</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="b-eics">
                캘린더 담기 버튼
              </label>
              <select id="b-eics" value={d.ics === false ? "off" : "on"} onChange={(e) => set("ics", e.target.value === "on")} className={`mt-1.5 ${input}`}>
                <option value="on">보이기</option>
                <option value="off">숨기기</option>
              </select>
            </div>
          </div>
          {/* 예약받기가 아니라는 걸 분명히 — 기대가 어긋나면 "왜 신청이 안 들어오지"가 된다 */}
          <p className="text-[12px] text-fg-sub">일정을 알리고 방문자가 자기 캘린더에 담아 가는 블록이에요. 신청·결제를 받지는 않아요.</p>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-[14px] text-negative-strong">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        {/* 무변경 저장은 막는다 — 서버 왕복 + 빈 undo 엔트리 기록 + redo 스택 파기(감사4) */}
        <Button size="sm" disabled={busy || !dirty} onClick={() => onSave(d)}>
          {busy ? "저장 중…" : dirty ? "저장" : "저장됨"}
        </Button>
        {/* 「되돌리기」는 **이 폼만** 원래대로 돌린다 — 삭제·순서는 못 되돌린다.
            이름만 보고 undo 로 오해하지 않게 옆에 적어둔다. */}
        <Button size="sm" variant="ghost" onClick={onRevert}>
          입력 되돌리기
        </Button>
        {dirty ? <span className="text-[12px] text-fg-sub">저장 안 됨</span> : null}
      </div>
    </div>
  );
}
