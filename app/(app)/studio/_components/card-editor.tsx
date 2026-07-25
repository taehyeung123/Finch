"use client";

/**
 * 카드뉴스 자유 편집기 (v1) — Konva 기반. next/dynamic ssr:false로만 마운트한다
 * (Konva가 canvas/window를 참조해 서버 렌더 불가).
 *
 * 기능: 요소(텍스트/도형/이미지) 선택·이동·크기조절·회전, 텍스트 내용·색·크기·굵기·정렬 편집,
 *       텍스트/이미지 추가, 삭제, 배경색 변경, 1080px PNG 내보내기.
 * v2 예정: 실행취소/재실행, 정렬 가이드선, 도형 추가, 다중 선택.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Text as KText, Rect as KRect, Circle as KCircle, Image as KImage, Transformer } from "react-konva";
import type Konva from "konva";
import { X, Type, ImagePlus, Trash2, Bold, AlignLeft, AlignCenter, AlignRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ExportSlide } from "@/lib/studio/export-slides";
import {
  buildEditorScene,
  nextId,
  CARD_SIZE,
  CARD_PAD,
  INK,
  PAPER,
  CORAL,
  EDITOR_FONT,
  type EditorElement,
  type TextEl,
} from "@/lib/studio/editor-model";

const DISPLAY = 520; // 화면 표시 크기 (내부 좌표는 항상 1080)
const SCALE = DISPLAY / CARD_SIZE;

const SWATCHES = [
  { label: "잉크", value: INK },
  { label: "페이퍼", value: PAPER },
  { label: "코랄", value: CORAL },
  { label: "흰색", value: "#FFFFFF" },
  { label: "검정", value: "#000000" },
];

/** 이미지 요소 — HTMLImageElement를 로드해 KonvaImage로 렌더 */
function ImageNode({
  el,
  isSelected,
  onSelect,
  onChange,
}: {
  el: Extract<EditorElement, { type: "image" }>;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<EditorElement>) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.src = el.src;
    image.onload = () => setImg(image);
  }, [el.src]);
  if (!img) return null;
  return (
    <KImage
      id={el.id}
      image={img}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => {
        const node = e.target;
        onChange({
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: Math.max(20, node.width() * node.scaleX()),
          height: Math.max(20, node.height() * node.scaleY()),
        });
        node.scaleX(1);
        node.scaleY(1);
      }}
      stroke={isSelected ? CORAL : undefined}
      strokeWidth={isSelected ? 2 / SCALE : 0}
    />
  );
}

export default function CardEditor({
  slide,
  total,
  aiGenerated,
  onClose,
  onSave,
}: {
  slide: ExportSlide;
  total: number;
  aiGenerated: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const initial = useMemo(() => buildEditorScene(slide, total, aiGenerated), [slide, total, aiGenerated]);
  const [background, setBackground] = useState(initial.background);
  const [elements, setElements] = useState<EditorElement[]>(initial.elements);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  // 선택 변경 시 Transformer를 해당 노드에 부착
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const node = selectedId ? stage.findOne(`#${selectedId}`) : null;
    tr.nodes(node ? [node as Konva.Node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, elements]);

  function patch(id: string, p: Partial<EditorElement>) {
    setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...p } as EditorElement) : e)));
  }
  function patchSelected(p: Partial<EditorElement>) {
    if (selectedId) patch(selectedId, p);
  }

  function addText() {
    const el: TextEl = {
      id: nextId("t"),
      type: "text",
      text: "텍스트를 입력하세요",
      x: CARD_PAD,
      y: CARD_SIZE / 2 - 40,
      width: CARD_SIZE - CARD_PAD * 2,
      fontSize: 56,
      fontStyle: "bold",
      fill: background === INK ? PAPER : INK,
      align: "left",
      lineHeight: 1.2,
      opacity: 1,
      rotation: 0,
      draggable: true,
    };
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const probe = new window.Image();
      probe.onload = () => {
        const maxW = 520;
        const ratio = probe.height / probe.width || 1;
        const w = Math.min(maxW, probe.width);
        const el: EditorElement = {
          id: nextId("img"),
          type: "image",
          src,
          x: CARD_SIZE / 2 - w / 2,
          y: CARD_SIZE / 2 - (w * ratio) / 2,
          width: w,
          height: w * ratio,
          rotation: 0,
          draggable: true,
        };
        setElements((prev) => [...prev, el]);
        setSelectedId(el.id);
      };
      probe.src = src;
    };
    reader.readAsDataURL(file);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setElements((prev) => prev.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  }

  function handleSave() {
    setSelectedId(null);
    // 선택 해제(Transformer 제거)가 반영된 다음 프레임에 내보낸다
    requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const dataUrl = stage.toDataURL({ pixelRatio: CARD_SIZE / DISPLAY, mimeType: "image/png" });
      onSave(dataUrl);
    });
  }

  const isText = selected?.type === "text";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-card border border-line bg-body sm:flex-row">
        {/* 캔버스 */}
        <div className="flex flex-1 items-center justify-center bg-overlay p-4">
          <div style={{ width: DISPLAY, height: DISPLAY }} className="shrink-0 rounded-card shadow-lg">
            <Stage
              ref={stageRef}
              width={DISPLAY}
              height={DISPLAY}
              scaleX={SCALE}
              scaleY={SCALE}
              onMouseDown={(e) => {
                if (e.target === e.target.getStage()) setSelectedId(null);
              }}
              onTouchStart={(e) => {
                if (e.target === e.target.getStage()) setSelectedId(null);
              }}
            >
              <Layer>
                <KRect x={0} y={0} width={CARD_SIZE} height={CARD_SIZE} fill={background} listening={false} />
                {elements.map((el) => {
                  const onSelect = () => setSelectedId(el.id);
                  const onChangeEl = (p: Partial<EditorElement>) => patch(el.id, p);
                  if (el.type === "text") {
                    return (
                      <KText
                        key={el.id}
                        id={el.id}
                        text={el.text}
                        x={el.x}
                        y={el.y}
                        width={el.width}
                        fontSize={el.fontSize}
                        fontFamily={EDITOR_FONT}
                        fontStyle={el.fontStyle}
                        fill={el.fill}
                        align={el.align}
                        lineHeight={el.lineHeight}
                        opacity={el.opacity}
                        rotation={el.rotation}
                        draggable
                        onClick={onSelect}
                        onTap={onSelect}
                        onDragEnd={(e) => onChangeEl({ x: e.target.x(), y: e.target.y() })}
                        onTransformEnd={(e) => {
                          const node = e.target as Konva.Text;
                          onChangeEl({
                            x: node.x(),
                            y: node.y(),
                            rotation: node.rotation(),
                            width: Math.max(40, node.width() * node.scaleX()),
                          });
                          node.scaleX(1);
                          node.scaleY(1);
                        }}
                      />
                    );
                  }
                  if (el.type === "rect") {
                    return (
                      <KRect
                        key={el.id}
                        id={el.id}
                        x={el.x}
                        y={el.y}
                        width={el.width}
                        height={el.height}
                        fill={el.fill}
                        cornerRadius={el.cornerRadius}
                        opacity={el.opacity}
                        rotation={el.rotation}
                        draggable
                        onClick={onSelect}
                        onTap={onSelect}
                        onDragEnd={(e) => onChangeEl({ x: e.target.x(), y: e.target.y() })}
                        onTransformEnd={(e) => {
                          const node = e.target;
                          onChangeEl({
                            x: node.x(),
                            y: node.y(),
                            rotation: node.rotation(),
                            width: Math.max(8, node.width() * node.scaleX()),
                            height: Math.max(4, node.height() * node.scaleY()),
                          });
                          node.scaleX(1);
                          node.scaleY(1);
                        }}
                      />
                    );
                  }
                  if (el.type === "circle") {
                    return (
                      <KCircle
                        key={el.id}
                        id={el.id}
                        x={el.x}
                        y={el.y}
                        radius={el.radius}
                        fill={el.fill}
                        opacity={el.opacity}
                        rotation={el.rotation}
                        draggable
                        onClick={onSelect}
                        onTap={onSelect}
                        onDragEnd={(e) => onChangeEl({ x: e.target.x(), y: e.target.y() })}
                        onTransformEnd={(e) => {
                          const node = e.target;
                          onChangeEl({ x: node.x(), y: node.y(), radius: Math.max(6, el.radius * node.scaleX()) });
                          node.scaleX(1);
                          node.scaleY(1);
                        }}
                      />
                    );
                  }
                  return (
                    <ImageNode
                      key={el.id}
                      el={el}
                      isSelected={selectedId === el.id}
                      onSelect={onSelect}
                      onChange={onChangeEl}
                    />
                  );
                })}
                <Transformer
                  ref={trRef}
                  rotateEnabled
                  keepRatio={false}
                  enabledAnchors={
                    isText
                      ? ["middle-left", "middle-right"]
                      : ["top-left", "top-right", "bottom-left", "bottom-right"]
                  }
                  boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 ? oldBox : newBox)}
                />
              </Layer>
            </Stage>
          </div>
        </div>

        {/* 속성 패널 */}
        <div className="flex w-full flex-col gap-4 overflow-y-auto border-t border-line p-4 sm:w-72 sm:border-l sm:border-t-0">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-bold">카드 편집</p>
            <button type="button" onClick={onClose} aria-label="닫기" className="rounded-card p-1 text-fg-faint hover:bg-overlay hover:text-fg">
              <X className="size-5" />
            </button>
          </div>

          {/* 추가 도구 */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={addText}>
              <Type className="size-4" aria-hidden />
              텍스트
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="size-4" aria-hidden />
              이미지
            </Button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
          </div>

          {/* 배경색 */}
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-fg-sub">배경색</p>
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((sw) => (
                <button
                  key={sw.value}
                  type="button"
                  aria-label={`배경 ${sw.label}`}
                  onClick={() => setBackground(sw.value)}
                  className={`size-7 rounded-full border ${background === sw.value ? "ring-2 ring-primary ring-offset-1" : "border-line"}`}
                  style={{ backgroundColor: sw.value }}
                />
              ))}
            </div>
          </div>

          {/* 선택 요소 속성 */}
          {selected ? (
            <div className="space-y-3 rounded-card border border-line bg-overlay p-3">
              {isText ? (
                <>
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium text-fg-sub">텍스트</p>
                    <textarea
                      value={(selected as TextEl).text}
                      onChange={(e) => patchSelected({ text: e.target.value })}
                      rows={3}
                      className="w-full rounded-card border border-line bg-body px-2.5 py-2 text-[13px] focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[13px] text-fg-sub">크기</label>
                    <input
                      type="range"
                      min={18}
                      max={140}
                      value={(selected as TextEl).fontSize}
                      onChange={(e) => patchSelected({ fontSize: Number(e.target.value) })}
                      className="flex-1 accent-primary"
                    />
                    <span className="tnum w-8 text-right text-[12px] text-fg-faint">{(selected as TextEl).fontSize}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      aria-label="굵게"
                      onClick={() => patchSelected({ fontStyle: (selected as TextEl).fontStyle === "bold" ? "normal" : "bold" })}
                      className={`flex size-8 items-center justify-center rounded-card border ${(selected as TextEl).fontStyle === "bold" ? "border-primary bg-primary-weak text-primary" : "border-line text-fg-sub"}`}
                    >
                      <Bold className="size-4" />
                    </button>
                    {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
                      <button
                        key={a}
                        type="button"
                        aria-label={`정렬 ${a}`}
                        onClick={() => patchSelected({ align: a })}
                        className={`flex size-8 items-center justify-center rounded-card border ${(selected as TextEl).align === a ? "border-primary bg-primary-weak text-primary" : "border-line text-fg-sub"}`}
                      >
                        <Icon className="size-4" />
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {/* 색상 (텍스트·도형 공통) */}
              {selected.type !== "image" ? (
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-fg-sub">색상</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {SWATCHES.map((sw) => (
                      <button
                        key={sw.value}
                        type="button"
                        aria-label={`색 ${sw.label}`}
                        onClick={() => patchSelected({ fill: sw.value })}
                        className={`size-7 rounded-full border ${"fill" in selected && selected.fill === sw.value ? "ring-2 ring-primary ring-offset-1" : "border-line"}`}
                        style={{ backgroundColor: sw.value }}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="커스텀 색"
                      value={"fill" in selected ? selected.fill : "#000000"}
                      onChange={(e) => patchSelected({ fill: e.target.value })}
                      className="size-7 cursor-pointer rounded-full border border-line bg-transparent p-0"
                    />
                  </div>
                </div>
              ) : null}

              <Button size="sm" variant="danger" onClick={deleteSelected} className="w-full">
                <Trash2 className="size-4" aria-hidden />
                선택 요소 삭제
              </Button>
            </div>
          ) : (
            <p className="rounded-card border border-dashed border-line p-3 text-center text-[13px] text-fg-faint">
              요소를 클릭해서 수정하거나,
              <br />
              위에서 텍스트·이미지를 추가하세요.
            </p>
          )}

          <div className="mt-auto flex gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">
              취소
            </Button>
            <Button onClick={handleSave} className="flex-1">
              <Check className="size-4" aria-hidden />
              적용
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
