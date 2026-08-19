"use client";

import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BLOCK_CATALOG, CONTACT_FIELDS, type LinkBlock } from "@/lib/links/blocks";
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
}: {
  block: LinkBlock;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  busy: boolean;
  /** 저장 실패 사유 — 화면 맨 위 배너만으로는 여기까지 스크롤한 사용자가 못 본다 */
  error: string | null;
  dirty: boolean;
  onSave: (data: Record<string, unknown>) => void;
  onRevert: () => void;
  onClose: () => void;
}) {
  const d = value;
  const set = (k: string, v: unknown) => onChange({ ...d, [k]: v });
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const num = (k: string, fb: number) => (typeof d[k] === "number" ? (d[k] as number) : fb);
  const items = Array.isArray(d.items) ? (d.items as Record<string, unknown>[]) : [];
  const fields = Array.isArray(d.fields) ? (d.fields as string[]) : [];

  const setItem = (i: number, k: string, v: unknown) =>
    set(
      "items",
      items.map((it, j) => (j === i ? { ...it, [k]: v } : it)),
    );

  const meta = BLOCK_CATALOG.find((c) => c.type === block.type);

  return (
    <div className="space-y-3">
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
            받은 내용은 <strong className="font-semibold">「설정」 탭</strong>의 「받은 내용」에서 확인할 수 있어요.
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

      {error ? (
        <p role="alert" className="text-[14px] text-negative-strong">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" disabled={busy} onClick={() => onSave(d)}>
          {busy ? "저장 중…" : "저장"}
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
