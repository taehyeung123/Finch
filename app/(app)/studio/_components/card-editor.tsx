"use client";

/**
 * 카드뉴스 자유 편집기 (v3) — Konva 기반. next/dynamic ssr:false로만 마운트한다
 * (Konva가 canvas/window를 참조해 서버 렌더 불가).
 *
 * v3: 실행취소/재실행(Ctrl+Z / Ctrl+Shift+Z, 버스트 합치기), 중앙 스냅 가이드선,
 *     이어 편집(initialScene 복원 — 적용한 편집을 다시 열면 그대로 이어서 수정).
 * v2: 한글 폰트 5종, 굵기 5단계, 도형 8종, 투명도, 레이어 순서, 복제.
 * v1: 선택·이동·크기조절·회전, 텍스트/색/정렬 편집, 이미지 삽입, 삭제, 배경색, 1080px PNG 내보내기.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Stage,
  Layer,
  Text as KText,
  Rect as KRect,
  Circle as KCircle,
  Image as KImage,
  Line as KLine,
  Arrow as KArrow,
  Star as KStar,
  RegularPolygon as KRegularPolygon,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import {
  X,
  Type,
  ImagePlus,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  Square,
  SquareRoundCorner,
  Circle as CircleIcon,
  Triangle,
  Star as StarIcon,
  Minus,
  MoveRight,
  Highlighter,
  Copy,
  ChevronsUp,
  ChevronsDown,
  Undo2,
  Redo2,
} from "lucide-react";
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
  FONT_OPTIONS,
  FONT_FACE_CSS,
  WEIGHT_OPTIONS,
  type EditorElement,
  type EditorScene,
  type TextEl,
} from "@/lib/studio/editor-model";

const DISPLAY = 520; // 화면 표시 크기 (내부 좌표는 항상 1080)
const SCALE = DISPLAY / CARD_SIZE;
const CENTER = CARD_SIZE / 2;
const SNAP = 12; // 중앙 스냅 임계 (카드 좌표 px)

const SWATCHES = [
  { label: "잉크", value: INK },
  { label: "페이퍼", value: PAPER },
  { label: "코랄", value: CORAL },
  { label: "흰색", value: "#FFFFFF" },
  { label: "검정", value: "#000000" },
];

type Snapshot = { elements: EditorElement[]; background: string };
type Guide = { o: "v" | "h"; p: number };

function elementColor(el: EditorElement): string | null {
  if (el.type === "line" || el.type === "arrow") return el.stroke;
  if ("fill" in el) return el.fill;
  return null;
}

/** 요소 중심(카드 좌표) — 중앙 스냅 계산용. 원/별/다각형은 x,y가 이미 중심. */
function centerOf(el: EditorElement, node: Konva.Node): { x: number; y: number } {
  if (el.type === "circle" || el.type === "star" || el.type === "polygon") {
    return { x: node.x(), y: node.y() };
  }
  if (el.type === "line" || el.type === "arrow") {
    return { x: node.x(), y: node.y() };
  }
  return { x: node.x() + node.width() / 2, y: node.y() + node.height() / 2 };
}

function useEditorFonts(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const STYLE_ID = "finch-editor-fonts";
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = FONT_FACE_CSS;
      document.head.appendChild(style);
    }
    let alive = true;
    const loads = ["GmarketSans", "BMDOHYEON", "BMJUA", "RIDIBatang"].flatMap((f) => [
      document.fonts.load(`400 32px ${f}`),
      document.fonts.load(`700 32px ${f}`),
    ]);
    Promise.allSettled(loads).then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

function ImageNode({
  el,
  isSelected,
  onSelect,
  onDragMove,
  onDragEndEl,
  onChange,
}: {
  el: Extract<EditorElement, { type: "image" }>;
  isSelected: boolean;
  onSelect: () => void;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEndEl: (e: Konva.KonvaEventObject<DragEvent>) => void;
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
      opacity={el.opacity}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={onDragMove}
      onDragEnd={onDragEndEl}
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
  initialScene,
  onClose,
  onSave,
}: {
  slide: ExportSlide;
  total: number;
  aiGenerated: boolean;
  initialScene?: EditorScene;
  onClose: () => void;
  onSave: (png: string, scene: EditorScene) => void;
}) {
  const initial = useMemo(
    () => initialScene ?? buildEditorScene(slide, total, aiGenerated),
    [initialScene, slide, total, aiGenerated],
  );
  const [background, setBackground] = useState(initial.background);
  const [elements, setElements] = useState<EditorElement[]>(initial.elements);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const fontsReady = useEditorFonts();

  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 실행취소/재실행 히스토리 — 같은 라벨이 700ms 내 연속이면 하나로 합쳐 기록(드래그·타이핑·슬라이더)
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const lastLabel = useRef("");
  const lastTime = useRef(0);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const node = selectedId ? stage.findOne(`#${selectedId}`) : null;
    tr.nodes(node ? [node as Konva.Node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, elements]);

  useEffect(() => {
    if (fontsReady) stageRef.current?.batchDraw();
  }, [fontsReady]);

  const record = useCallback(
    (label: string) => {
      const now = Date.now();
      const coalesce = label === lastLabel.current && now - lastTime.current < 700;
      lastLabel.current = label;
      lastTime.current = now;
      if (coalesce) return;
      setPast((p) => [...p.slice(-49), { elements, background }]);
      setFuture([]);
    },
    [elements, background],
  );

  const undo = useCallback(() => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [{ elements, background }, ...f]);
    setElements(prev.elements);
    setBackground(prev.background);
    setSelectedId(null);
    lastLabel.current = "";
  }, [past, elements, background]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, { elements, background }]);
    setElements(next.elements);
    setBackground(next.background);
    setSelectedId(null);
    lastLabel.current = "";
  }, [future, elements, background]);

  function patch(id: string, p: Partial<EditorElement>, label: string) {
    record(label);
    setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...p } as EditorElement) : e)));
  }
  function patchSelected(p: Partial<EditorElement>, label: string) {
    if (selectedId) patch(selectedId, p, label);
  }

  function addElement(el: EditorElement) {
    record("add");
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  }

  function changeBackground(v: string) {
    record("bg");
    setBackground(v);
  }

  const contrastFg = background === INK || background === "#000000" ? PAPER : INK;

  function addText() {
    addElement({
      id: nextId("t"),
      type: "text",
      text: "텍스트를 입력하세요",
      x: CARD_PAD,
      y: CARD_SIZE / 2 - 40,
      width: CARD_SIZE - CARD_PAD * 2,
      fontSize: 56,
      fontFamily: EDITOR_FONT,
      fontStyle: "700",
      fill: contrastFg,
      align: "left",
      lineHeight: 1.2,
      opacity: 1,
      rotation: 0,
      draggable: true,
    });
  }

  const SHAPES: { key: string; label: string; icon: React.ReactNode; make: () => EditorElement }[] = [
    { key: "rect", label: "사각형", icon: <Square className="size-4" />, make: () => ({ id: nextId("r"), type: "rect", x: CENTER - 140, y: CENTER - 90, width: 280, height: 180, fill: CORAL, cornerRadius: 0, opacity: 1, rotation: 0, draggable: true }) },
    { key: "rounded", label: "둥근 사각형", icon: <SquareRoundCorner className="size-4" />, make: () => ({ id: nextId("r"), type: "rect", x: CENTER - 140, y: CENTER - 90, width: 280, height: 180, fill: CORAL, cornerRadius: 28, opacity: 1, rotation: 0, draggable: true }) },
    { key: "circle", label: "원", icon: <CircleIcon className="size-4" />, make: () => ({ id: nextId("c"), type: "circle", x: CENTER, y: CENTER, radius: 110, fill: CORAL, opacity: 1, rotation: 0, draggable: true }) },
    { key: "triangle", label: "삼각형", icon: <Triangle className="size-4" />, make: () => ({ id: nextId("p"), type: "polygon", sides: 3, x: CENTER, y: CENTER, radius: 120, fill: CORAL, opacity: 1, rotation: 0, draggable: true }) },
    { key: "star", label: "별", icon: <StarIcon className="size-4" />, make: () => ({ id: nextId("s"), type: "star", x: CENTER, y: CENTER, numPoints: 5, innerRadius: 55, outerRadius: 120, fill: CORAL, opacity: 1, rotation: 0, draggable: true }) },
    { key: "line", label: "선", icon: <Minus className="size-4" />, make: () => ({ id: nextId("l"), type: "line", x: CENTER - 160, y: CENTER, points: [0, 0, 320, 0], stroke: CORAL, strokeWidth: 10, opacity: 1, rotation: 0, draggable: true }) },
    { key: "arrow", label: "화살표", icon: <MoveRight className="size-4" />, make: () => ({ id: nextId("a"), type: "arrow", x: CENTER - 150, y: CENTER, points: [0, 0, 300, 0], stroke: CORAL, fill: CORAL, strokeWidth: 10, opacity: 1, rotation: 0, draggable: true }) },
    { key: "highlight", label: "하이라이트 바", icon: <Highlighter className="size-4" />, make: () => ({ id: nextId("h"), type: "rect", x: CARD_PAD, y: CENTER - 30, width: 420, height: 60, fill: CORAL, cornerRadius: 8, opacity: 0.45, rotation: 0, draggable: true }) },
  ];

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
        addElement({
          id: nextId("img"),
          type: "image",
          src,
          x: CARD_SIZE / 2 - w / 2,
          y: CARD_SIZE / 2 - (w * ratio) / 2,
          width: w,
          height: w * ratio,
          opacity: 1,
          rotation: 0,
          draggable: true,
        });
      };
      probe.src = src;
    };
    reader.readAsDataURL(file);
  }

  function deleteSelected() {
    if (!selectedId) return;
    record("delete");
    setElements((prev) => prev.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy = { ...selected, id: nextId("d"), x: selected.x + 28, y: selected.y + 28 } as EditorElement;
    addElement(copy);
  }

  function moveSelected(toFront: boolean) {
    if (!selectedId) return;
    record("order");
    setElements((prev) => {
      const idx = prev.findIndex((e) => e.id === selectedId);
      if (idx < 0) return prev;
      const next = [...prev];
      const [el] = next.splice(idx, 1);
      if (toFront) next.push(el);
      else next.unshift(el);
      return next;
    });
  }

  function applyColor(v: string) {
    if (!selected) return;
    if (selected.type === "line") patchSelected({ stroke: v }, "color");
    else if (selected.type === "arrow") patchSelected({ stroke: v, fill: v }, "color");
    else patchSelected({ fill: v }, "color");
  }

  // 드래그 중 중앙 스냅 + 가이드선
  function handleDragMove(el: EditorElement, e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    const c = centerOf(el, node);
    const g: Guide[] = [];
    if (Math.abs(c.x - CENTER) < SNAP) {
      node.x(node.x() + (CENTER - c.x));
      g.push({ o: "v", p: CENTER });
    }
    if (Math.abs(c.y - CENTER) < SNAP) {
      node.y(node.y() + (CENTER - c.y));
      g.push({ o: "h", p: CENTER });
    }
    setGuides(g);
  }
  function handleDragEnd(el: EditorElement, e: Konva.KonvaEventObject<DragEvent>) {
    setGuides([]);
    patch(el.id, { x: e.target.x(), y: e.target.y() }, `drag:${el.id}`);
  }

  function handleSave() {
    setSelectedId(null);
    setGuides([]);
    requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const png = stage.toDataURL({ pixelRatio: CARD_SIZE / DISPLAY, mimeType: "image/png" });
      onSave(png, { background, elements });
    });
  }

  // 키보드 단축키
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, elements, background, undo, redo]);

  const isText = selected?.type === "text";
  const selColor = selected ? elementColor(selected) : null;
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-card border border-line bg-body sm:flex-row">
        {/* 캔버스 */}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-overlay p-4">
          <div className="flex w-full items-center justify-between px-1" style={{ maxWidth: DISPLAY }}>
            <p className="text-[13px] font-semibold text-fg-sub">카드 편집</p>
            <div className="flex gap-1">
              <button type="button" onClick={undo} disabled={!canUndo} aria-label="실행취소" className="flex size-8 items-center justify-center rounded-card border border-line text-fg-sub disabled:opacity-40 enabled:hover:border-primary enabled:hover:text-primary">
                <Undo2 className="size-4" />
              </button>
              <button type="button" onClick={redo} disabled={!canRedo} aria-label="재실행" className="flex size-8 items-center justify-center rounded-card border border-line text-fg-sub disabled:opacity-40 enabled:hover:border-primary enabled:hover:text-primary">
                <Redo2 className="size-4" />
              </button>
            </div>
          </div>
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
                  const onChangeEl = (p: Partial<EditorElement>) => patch(el.id, p, `transform:${el.id}`);
                  const dragProps = {
                    draggable: true,
                    onClick: onSelect,
                    onTap: onSelect,
                    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => handleDragMove(el, e),
                    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(el, e),
                  };
                  const common = { id: el.id, rotation: el.rotation, opacity: el.opacity, ...dragProps };
                  if (el.type === "text") {
                    return (
                      <KText
                        key={el.id}
                        {...common}
                        text={el.text}
                        x={el.x}
                        y={el.y}
                        width={el.width}
                        fontSize={el.fontSize}
                        fontFamily={el.fontFamily}
                        fontStyle={el.fontStyle}
                        fill={el.fill}
                        align={el.align}
                        lineHeight={el.lineHeight}
                        onTransformEnd={(e) => {
                          const node = e.target as Konva.Text;
                          onChangeEl({ x: node.x(), y: node.y(), rotation: node.rotation(), width: Math.max(40, node.width() * node.scaleX()) });
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
                        {...common}
                        x={el.x}
                        y={el.y}
                        width={el.width}
                        height={el.height}
                        fill={el.fill}
                        cornerRadius={el.cornerRadius}
                        onTransformEnd={(e) => {
                          const node = e.target;
                          onChangeEl({ x: node.x(), y: node.y(), rotation: node.rotation(), width: Math.max(8, node.width() * node.scaleX()), height: Math.max(4, node.height() * node.scaleY()) });
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
                        {...common}
                        x={el.x}
                        y={el.y}
                        radius={el.radius}
                        fill={el.fill}
                        onTransformEnd={(e) => {
                          const node = e.target;
                          onChangeEl({ x: node.x(), y: node.y(), radius: Math.max(6, el.radius * node.scaleX()) });
                          node.scaleX(1);
                          node.scaleY(1);
                        }}
                      />
                    );
                  }
                  if (el.type === "line") {
                    return (
                      <KLine
                        key={el.id}
                        {...common}
                        x={el.x}
                        y={el.y}
                        points={el.points}
                        stroke={el.stroke}
                        strokeWidth={el.strokeWidth}
                        lineCap="round"
                        hitStrokeWidth={40}
                        onTransformEnd={(e) => {
                          const node = e.target;
                          const sx = node.scaleX();
                          const sy = node.scaleY();
                          onChangeEl({ x: node.x(), y: node.y(), rotation: node.rotation(), points: el.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy)) });
                          node.scaleX(1);
                          node.scaleY(1);
                        }}
                      />
                    );
                  }
                  if (el.type === "arrow") {
                    return (
                      <KArrow
                        key={el.id}
                        {...common}
                        x={el.x}
                        y={el.y}
                        points={el.points}
                        stroke={el.stroke}
                        fill={el.fill}
                        strokeWidth={el.strokeWidth}
                        pointerLength={26}
                        pointerWidth={26}
                        lineCap="round"
                        hitStrokeWidth={40}
                        onTransformEnd={(e) => {
                          const node = e.target;
                          const sx = node.scaleX();
                          const sy = node.scaleY();
                          onChangeEl({ x: node.x(), y: node.y(), rotation: node.rotation(), points: el.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy)) });
                          node.scaleX(1);
                          node.scaleY(1);
                        }}
                      />
                    );
                  }
                  if (el.type === "star") {
                    return (
                      <KStar
                        key={el.id}
                        {...common}
                        x={el.x}
                        y={el.y}
                        numPoints={el.numPoints}
                        innerRadius={el.innerRadius}
                        outerRadius={el.outerRadius}
                        fill={el.fill}
                        onTransformEnd={(e) => {
                          const node = e.target;
                          const s = node.scaleX();
                          onChangeEl({ x: node.x(), y: node.y(), rotation: node.rotation(), innerRadius: Math.max(6, el.innerRadius * s), outerRadius: Math.max(10, el.outerRadius * s) });
                          node.scaleX(1);
                          node.scaleY(1);
                        }}
                      />
                    );
                  }
                  if (el.type === "polygon") {
                    return (
                      <KRegularPolygon
                        key={el.id}
                        {...common}
                        x={el.x}
                        y={el.y}
                        sides={el.sides}
                        radius={el.radius}
                        fill={el.fill}
                        onTransformEnd={(e) => {
                          const node = e.target;
                          onChangeEl({ x: node.x(), y: node.y(), rotation: node.rotation(), radius: Math.max(8, el.radius * node.scaleX()) });
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
                      onDragMove={(e) => handleDragMove(el, e)}
                      onDragEndEl={(e) => handleDragEnd(el, e)}
                      onChange={onChangeEl}
                    />
                  );
                })}
                {guides.map((g, i) =>
                  g.o === "v" ? (
                    <KLine key={`g${i}`} points={[g.p, 0, g.p, CARD_SIZE]} stroke="#FF3B7F" strokeWidth={1 / SCALE} dash={[10 / SCALE, 10 / SCALE]} listening={false} />
                  ) : (
                    <KLine key={`g${i}`} points={[0, g.p, CARD_SIZE, g.p]} stroke="#FF3B7F" strokeWidth={1 / SCALE} dash={[10 / SCALE, 10 / SCALE]} listening={false} />
                  ),
                )}
                <Transformer
                  ref={trRef}
                  rotateEnabled
                  keepRatio={false}
                  enabledAnchors={isText ? ["middle-left", "middle-right"] : ["top-left", "top-right", "bottom-left", "bottom-right"]}
                  boundBoxFunc={(oldBox, newBox) => (newBox.width < 16 ? oldBox : newBox)}
                />
              </Layer>
            </Stage>
          </div>
          <p className="text-[11px] text-fg-faint">드래그로 이동 · 가운데 근처에서 자동 정렬(분홍 선) · Ctrl+Z 실행취소</p>
        </div>

        {/* 속성 패널 */}
        <div className="flex w-full flex-col gap-4 overflow-y-auto border-t border-line p-4 sm:w-80 sm:border-l sm:border-t-0">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-bold">편집 도구</p>
            <button type="button" onClick={onClose} aria-label="닫기" className="rounded-card p-1 text-fg-faint hover:bg-overlay hover:text-fg">
              <X className="size-5" />
            </button>
          </div>

          <div className="space-y-2">
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
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-fg-sub">도형·요소</p>
              <div className="grid grid-cols-4 gap-1.5">
                {SHAPES.map((s) => (
                  <button key={s.key} type="button" title={s.label} aria-label={s.label} onClick={() => addElement(s.make())} className="flex h-9 items-center justify-center rounded-card border border-line text-fg-sub transition-colors hover:border-primary hover:text-primary">
                    {s.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-fg-sub">배경색</p>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((sw) => (
                <button key={sw.value} type="button" aria-label={`배경 ${sw.label}`} onClick={() => changeBackground(sw.value)} className={`size-7 rounded-full border ${background === sw.value ? "ring-2 ring-primary ring-offset-1" : "border-line"}`} style={{ backgroundColor: sw.value }} />
              ))}
              <input type="color" aria-label="배경 커스텀 색" value={background.startsWith("#") ? background : "#0C0C11"} onChange={(e) => changeBackground(e.target.value)} className="size-7 cursor-pointer rounded-full border border-line bg-transparent p-0" />
            </div>
          </div>

          {selected ? (
            <div className="space-y-3 rounded-card border border-line bg-overlay p-3">
              {isText ? (
                <>
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium text-fg-sub">텍스트</p>
                    <textarea value={(selected as TextEl).text} onChange={(e) => patchSelected({ text: e.target.value }, `text:${selected.id}`)} rows={3} className="w-full rounded-card border border-line bg-body px-2.5 py-2 text-[13px] focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium text-fg-sub">폰트</p>
                    <select value={(selected as TextEl).fontFamily} onChange={(e) => patchSelected({ fontFamily: e.target.value }, `font:${selected.id}`)} className="h-9 w-full rounded-card border border-line bg-body px-2 text-[13px] focus:border-primary focus:outline-none">
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.label} value={f.family}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    {!fontsReady ? <p className="mt-1 text-[11px] text-fg-faint">폰트 불러오는 중…</p> : null}
                  </div>
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium text-fg-sub">굵기</p>
                    <div className="grid grid-cols-5 gap-1">
                      {WEIGHT_OPTIONS.map((w) => (
                        <button key={w.value} type="button" onClick={() => patchSelected({ fontStyle: w.value }, `weight:${selected.id}`)} className={`rounded-card border px-1 py-1.5 text-[11px] ${(selected as TextEl).fontStyle === w.value ? "border-primary bg-primary-weak font-bold text-primary" : "border-line text-fg-sub"}`} style={{ fontWeight: Number(w.value) }}>
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[13px] text-fg-sub">크기</label>
                    <input type="range" min={18} max={160} value={(selected as TextEl).fontSize} onChange={(e) => patchSelected({ fontSize: Number(e.target.value) }, `size:${selected.id}`)} className="flex-1 accent-primary" />
                    <span className="tnum w-8 text-right text-[12px] text-fg-faint">{(selected as TextEl).fontSize}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
                      <button key={a} type="button" aria-label={`정렬 ${a}`} onClick={() => patchSelected({ align: a }, `align:${selected.id}`)} className={`flex size-8 items-center justify-center rounded-card border ${(selected as TextEl).align === a ? "border-primary bg-primary-weak text-primary" : "border-line text-fg-sub"}`}>
                        <Icon className="size-4" />
                      </button>
                    ))}
                  </div>
                </>
              ) : null}

              {selColor !== null ? (
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-fg-sub">색상</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {SWATCHES.map((sw) => (
                      <button key={sw.value} type="button" aria-label={`색 ${sw.label}`} onClick={() => applyColor(sw.value)} className={`size-7 rounded-full border ${selColor === sw.value ? "ring-2 ring-primary ring-offset-1" : "border-line"}`} style={{ backgroundColor: sw.value }} />
                    ))}
                    <input type="color" aria-label="커스텀 색" value={selColor.startsWith("#") ? selColor : "#000000"} onChange={(e) => applyColor(e.target.value)} className="size-7 cursor-pointer rounded-full border border-line bg-transparent p-0" />
                  </div>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <label className="text-[13px] text-fg-sub">투명도</label>
                <input type="range" min={10} max={100} value={Math.round(selected.opacity * 100)} onChange={(e) => patchSelected({ opacity: Number(e.target.value) / 100 }, `opacity:${selected.id}`)} className="flex-1 accent-primary" />
                <span className="tnum w-9 text-right text-[12px] text-fg-faint">{Math.round(selected.opacity * 100)}%</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => moveSelected(true)}>
                  <ChevronsUp className="size-4" aria-hidden />
                  맨 앞으로
                </Button>
                <Button size="sm" variant="secondary" onClick={() => moveSelected(false)}>
                  <ChevronsDown className="size-4" aria-hidden />
                  맨 뒤로
                </Button>
                <Button size="sm" variant="secondary" onClick={duplicateSelected}>
                  <Copy className="size-4" aria-hidden />
                  복제
                </Button>
                <Button size="sm" variant="danger" onClick={deleteSelected}>
                  <Trash2 className="size-4" aria-hidden />
                  삭제
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-card border border-dashed border-line p-3 text-center text-[13px] text-fg-faint">
              요소를 클릭해서 수정하거나,
              <br />
              위에서 텍스트·이미지·도형을 추가하세요.
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
