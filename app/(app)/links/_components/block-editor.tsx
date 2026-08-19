"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BLOCK_CATALOG, type LinkBlock } from "@/lib/links/blocks";
import { ImageField } from "./image-field";

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
const label = "block text-[12px] font-medium text-fg-sub";

export function BlockEditor({
  block,
  busy,
  onSave,
  onClose,
}: {
  block: LinkBlock;
  busy: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<Record<string, unknown>>(block.data ?? {});

  /* 다른 블록을 고르면 편집 대상이 바뀐다 — 렌더 시점에 맞춘다(레포 관례) */
  const [prevId, setPrevId] = useState(block.id);
  if (block.id !== prevId) {
    setPrevId(block.id);
    setD(block.data ?? {});
  }

  const set = (k: string, v: unknown) => setD((p) => ({ ...p, [k]: v }));
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const num = (k: string, fb: number) => (typeof d[k] === "number" ? (d[k] as number) : fb);
  const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];

  const setItem = (i: number, k: string, v: unknown) =>
    set(
      "items",
      items.map((it, j) => (j === i ? { ...it, [k]: v } : it)),
    );

  const meta = BLOCK_CATALOG.find((c) => c.type === block.type);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold">{meta?.label ?? block.type}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="편집 닫기"
          className="trans-state rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>

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
            <input id="b-url" value={str("url")} onChange={(e) => set("url", e.target.value)} placeholder="https://example.com" className={`mt-1.5 ${input}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label} htmlFor="b-emoji">
                아이콘 (선택)
              </label>
              <input id="b-emoji" value={str("emoji")} onChange={(e) => set("emoji", e.target.value.slice(0, 2))} placeholder="🔔" className={`mt-1.5 ${input}`} />
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

      {/* ── 이미지·이미지 카드 ── */}
      {block.type === "image" || block.type === "image_card" ? (
        <ImageField label="이미지" value={str("imagePath")} onChange={(v) => set("imagePath", v)} />
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
            placeholder={block.type === "video" ? "https://youtube.com/watch?v=…" : "https://…"}
            className={`mt-1.5 ${input}`}
          />
        </div>
      ) : null}

      {/* ── 배열형(가로 카드·그리드) ── */}
      {block.type === "card_row" || block.type === "grid" ? (
        <>
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
          ) : null}

          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="space-y-2 rounded-card border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-fg-sub">항목 {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => set("items", items.filter((_, j) => j !== i))}
                    aria-label="항목 삭제"
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
                  className={input}
                />
                {block.type === "card_row" ? (
                  <input
                    value={typeof it.subtitle === "string" ? it.subtitle : ""}
                    onChange={(e) => setItem(i, "subtitle", e.target.value)}
                    placeholder="부제목"
                    aria-label={`항목 ${i + 1} 부제목`}
                    className={input}
                  />
                ) : null}
                <input
                  value={typeof it.url === "string" ? it.url : ""}
                  onChange={(e) => setItem(i, "url", e.target.value)}
                  placeholder="https://…"
                  aria-label={`항목 ${i + 1} 주소`}
                  className={input}
                />
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

      {/* ── 최근 게시물 ── */}
      {block.type === "social_feed" ? (
        <>
          <div>
            <label className={label} htmlFor="b-ch">
              채널
            </label>
            <select id="b-ch" value={str("channel") || "instagram"} onChange={(e) => set("channel", e.target.value)} className={`mt-1.5 ${input}`}>
              <option value="instagram">인스타그램</option>
              <option value="tiktok">틱톡</option>
              <option value="threads">스레드</option>
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
            연동한 채널의 최근 게시물이 <strong className="font-semibold">라이브 반영할 때</strong> 채워집니다.
            방문자마다 플랫폼을 조회하면 요청 제한에 걸려서, 발행 시점에 한 번만 가져와요.
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
          <p className="text-[12px] leading-snug text-fg-sub">
            받은 내용은 이 화면 아래 「받은 내용」에서 확인할 수 있어요.
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
            <input id="b-addr" value={str("address")} onChange={(e) => set("address", e.target.value)} placeholder="서울시 강남구 …" className={`mt-1.5 ${input}`} />
          </div>
          <div>
            <label className={label} htmlFor="b-mlabel">
              표시 이름
            </label>
            <input id="b-mlabel" value={str("label")} onChange={(e) => set("label", e.target.value)} placeholder="찾아오시는 길" maxLength={40} className={`mt-1.5 ${input}`} />
          </div>
        </>
      ) : null}

      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={busy} onClick={() => onSave(d)}>
          {busy ? "저장 중…" : "저장"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setD(block.data ?? {})}>
          되돌리기
        </Button>
      </div>
    </div>
  );
}
