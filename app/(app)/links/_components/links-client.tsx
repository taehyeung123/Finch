"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  Palette,
  Plus,
  QrCode,
  Redo2,
  Rocket,
  Settings,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { SnsIcon } from "@/components/sns-brand-icons";
import { DualLineChart } from "@/components/ui/charts";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { FinchLoader } from "@/components/ui/finch-loader";
import { publicLinkUrl, stableJson } from "@/lib/links";
import { BLOCK_CATALOG, blockSummary, defaultBlockData, type BlockType, type LinkBlock } from "@/lib/links/blocks";
import {
  CUSTOM_BUTTONS,
  CUSTOM_FONTS,
  CUSTOM_RADIUS,
  LAYOUTS,
  LINK_THEMES,
  SNS_KINDS,
  sanitizeThemeCustom,
  themeByKey,
  type LinkThemeCustom,
} from "@/lib/links/themes";
import { LINK_TEMPLATES, type LinkTemplate } from "@/lib/links/templates";
import {
  addBlock,
  addBlocksBulk,
  applyTemplate,
  createLinkPage,
  createLinkPageWithStart,
  deleteBlock,
  deleteLinkPage,
  moveBlock,
  publishLinkPage,
  reorderBlock,
  restoreBlock,
  setLinkPublished,
  updateBlock,
  updateLinkImages,
  updateLinkProfile,
  updateLinkTheme,
  updateLinkThemeCustom,
} from "../actions";
import type { LinkLead, LinkPageView, LinkSnapshotView, LinkStats } from "@/lib/links/types";
import { BlockEditor, EDITOR_TITLE_ID } from "./block-editor";
import { ImageField } from "./image-field";
import { ImportLinks, ImportLinksBody } from "./import-links";
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
   · 순서 변경은 드래그(캔버스 그립)와 ↑↓ 병행 — 터치·키보드는 ↑↓ 가 맡는다.

  서버 액션만 쓴다. 서버 액션이 revalidatePath 를 부르므로 **router.refresh 를 따로
  부르지 않는다** — 부르면 같은 집계 질의가 한 조작에 두 번 돈다.
*/

type Drawer = "profile" | "theme" | "add" | "settings";

/* 상단 도구 칩 — 링크팜 실측 순서(2026-08-20 캔버스 개편). 칩은 우측 드로어를
   여닫고, 캔버스(폰)는 항상 보인다. 블록 목록 패널은 없다 — 캔버스가 목록이다. */
const TOOLS: Array<{ key: Drawer; label: string; icon: typeof User }> = [
  { key: "profile", label: "프로필", icon: User },
  { key: "theme", label: "테마", icon: Palette },
  { key: "add", label: "블록 추가", icon: Plus },
  { key: "settings", label: "설정", icon: Settings },
];

const DRAWER_TITLE: Record<Drawer, string> = {
  profile: "프로필 설정",
  theme: "테마 선택",
  add: "블록 추가",
  settings: "설정",
};

const LEAVE_WARNING = "저장하지 않은 편집 내용이 사라져요. 그래도 나갈까요?";

/** 실행취소 한 칸 — 성공한 서버 조작의 역연산 쌍 */
type UndoEntry = {
  label: string;
  undo: () => Promise<{ ok: boolean; error?: string }>;
  redo: () => Promise<{ ok: boolean; error?: string }>;
};
/** 스택 상한 — 밤새 눌러도 메모리가 안 자란다 */
const UNDO_MAX = 30;

/* 플랫폼별 추적 링크 — 링크팜 설정의 「SNS 링크 설정」 카피(2026-08-20 대조 7번).
   같은 공개 주소에 ?src= 표식만 달라, 어느 채널에서 온 방문인지 통계에 잡힌다. */
const SRC_PLATFORMS = [
  { key: "instagram", label: "인스타그램" },
  { key: "tiktok", label: "틱톡" },
  { key: "threads", label: "스레드" },
  { key: "youtube", label: "유튜브" },
  { key: "x", label: "X" },
] as const;
const SRC_LABEL = new Map<string, string>(SRC_PLATFORMS.map((p) => [p.key, p.label]));

/**
 * CSV 를 만들어 내려준다 — 서버 왕복 없음. 화면이 이미 든 데이터가 전부다.
 *
 * BOM(\uFEFF)을 앞에 붙인다: 한국에서 CSV 는 곧 엑셀이고, BOM 없는 UTF-8 을
 * 엑셀이 CP949 로 읽어 한글이 전부 깨진다.
 */
function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => {
    let t = String(v);
    /* 수식 인젝션 방어 — 받은 내용의 이름·연락처·내용은 **방문자가 쓴 값**이다.
       "=HYPERLINK(...)" 로 시작하는 셀을 엑셀이 수식으로 실행하면 방문자(비신뢰)가
       페이지 주인(신뢰)의 엑셀에서 코드를 돌리는 셈이 된다. 시작 문자가 수식
       트리거(= + - @ 탭 CR)면 작은따옴표를 붙여 문자열로 강제한다(OWASP 완화책). */
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 프로필 폼 전체 — 부모(LinksClient)가 들고 패널은 그리기만 한다 */
type ProfileFormState = {
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
};

/** 서버 페이지 → 폼 초기값. page 가 없으면(생성 전) 무해한 빈 값 */
function profileFormFrom(p: LinkPageView | null): ProfileFormState {
  return {
    slug: p?.slug ?? "",
    title: p?.title ?? "",
    bio: p?.bio ?? "",
    layout: p?.layout ?? "profile",
    align: p?.align ?? "center",
    snsLinks: p?.snsLinks ?? [],
    snsPlacement: p?.snsPlacement ?? "profile",
    titleSize: p?.titleSize ?? "md",
    seoTitle: p?.seoTitle ?? "",
    seoDesc: p?.seoDesc ?? "",
  };
}

export function LinksClient({
  page,
  blocks,
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
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  /* 템플릿 스트립 접기 — 링크팜의 「템플릿 적용하기 ^」 상시 스트립 카피 */
  const [tplOpen, setTplOpen] = useState(true);
  /* 템플릿 미리보기 — 카드를 누르면 **별도 모달**에서 그 템플릿을 보여준다(링크팜
     동작). 작업 중인 캔버스·미리보기는 건드리지 않는다 — 화면을 바꿔치기하면
     "하던 게 날아간" 것처럼 보인다(2026-08-20 지적). 서버 호출은 「이 템플릿 적용」
     때만. */
  const [tplPreview, setTplPreview] = useState<LinkTemplate | null>(null);
  /* 편집 중인 블록 값은 **여기서** 들고 있다 — 편집기 안에 가둬 두면 탭을 누르는
     시점에 부모가 "미저장인가"를 알 수 없다. baseline 은 마지막으로 서버에 반영된 값. */
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [baseline, setBaseline] = useState("");
  const editorDirty = editingId !== null && stableJson(draft) !== baseline;

  /* 프로필 폼 상태 — 패널이 아니라 **여기**서 든다. 패널 안에 두면 탭을 옮기는
     순간 언마운트로 입력이 통째로 사라진다("프로필 쓰다 테마 눌렀더니 초기화",
     2026-08-20). 탭은 자유롭게 오가고, 값은 사용자가 고치거나 서버가 정규화해
     내려줄 때만 바뀐다. 미리보기는 항상 이 폼을 그린다 — 저장 전 입력도 폰에
     바로 비친다(링크팜 동작). */
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() => profileFormFrom(page));
  /* 서버가 실제로 새 값을 줬을 때만 폼을 맞춘다(값 비교 — 객체 동일성 비교 금지,
     page 는 렌더마다 새 리터럴이다). 저장 시 서버가 slug 소문자화·제목 자르기를
     하므로, 이 동기화가 없으면 저장 후에도 옛 값이 남아 되돌려 쓴다. */
  const profileServerKey = stableJson(profileFormFrom(page));
  const [prevProfileKey, setPrevProfileKey] = useState(profileServerKey);
  if (profileServerKey !== prevProfileKey) {
    setPrevProfileKey(profileServerKey);
    setProfileForm(profileFormFrom(page));
  }
  const profileDirty = profileServerKey !== stableJson(profileForm);

  /* 테마 직접 꾸미기 폼 — 프로필 폼과 같은 규칙(부모가 들고, 서버 값 비교 동기화).
     미리보기는 이 폼을 바로 그려서 색을 고르는 순간 캔버스·우측 미리보기가 같이 바뀐다. */
  const [customForm, setCustomForm] = useState<LinkThemeCustom>(page?.themeCustom ?? {});
  const customServerKey = stableJson(page?.themeCustom ?? {});
  const [prevCustomKey, setPrevCustomKey] = useState(customServerKey);
  if (customServerKey !== prevCustomKey) {
    setPrevCustomKey(customServerKey);
    setCustomForm(page?.themeCustom ?? {});
  }
  const customDirty = stableJson(customForm) !== customServerKey;
  function patchCustom(patch: Partial<LinkThemeCustom>) {
    setCustomForm((f) => {
      const next: Record<string, unknown> = { ...f, ...patch };
      /* undefined 는 "지워라" — 프리셋 값으로 되돌리는 수단 */
      for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete next[k];
      return next as LinkThemeCustom;
    });
  }
  /* 통계 — 편집 탭이 아니라 상단 바에서 여닫는다("만드는 창에 통계가 왜 있냐",
     2026-08-20). 만들기와 성과 보기는 다른 일이다 — 링크팜도 통계는 빌더 밖이다. */
  const [statsOpen, setStatsOpen] = useState(false);

  /* 순서 계열 직렬화 — 드래그(fire)와 ↑↓·undo/redo(run)는 서로의 잠금을 모른다.
     순서를 바꾸는 서버 호출(SELECT→계산→UPDATE, TOCTOU 취약)은 **전부** 이 체인을
     타야 겹치지 않는다(소넷 확정 — 드래그만 태우면 undo 가 끼어들어 경주한다).
     낙관 반영은 즉시, 서버 실행만 조작 순서대로. */
  const reorderChain = useRef<Promise<unknown>>(Promise.resolve());

  function chained<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>): () => Promise<T> {
    return () => {
      const p = reorderChain.current.then(fn);
      /* 실패해도 다음 링크는 돈다 — 체인에는 캐치된 사본만 저장한다 */
      reorderChain.current = p.then(
        () => {},
        () => {},
      );
      return p;
    };
  }

  /* 실행취소/다시실행 — 링크팜 상단 ↩↪ 카피(2026-08-20 대조 보고서 3번).
     서버 조작의 **역연산 쌍**을 메모리에 쌓는다(새로고침이면 사라진다 — 링크팜 동일).
     성공한 조작만 기록한다: 실패한 조작을 기록하면 실행취소가 "안 일어난 일의
     역연산"을 실행해 상태를 실제로 망가뜨린다.
     템플릿 적용·대량 가져오기는 제외 — 역연산이 전체 교체 복원이라 자체 확인창이
     이미 있고, 발행본은 어차피 안 다친다(draft/publish 분리). */
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);

  /* 낙관 상태 — 블록 온오프·테마처럼 잦고 독립적인 조작은 서버 왕복을 기다리지
     않고 즉시 그린다. 트랜지션이 끝나면 서버 props 가 진실을 되돌려주므로
     (실패 시 자동 복귀) 수동 롤백이 필요 없다. */
  const [liveBlocks, applyBlockPatch] = useOptimistic(
    blocks,
    (
      bs: LinkBlock[],
      p: { kind: "active"; id: string; active: boolean } | { kind: "order"; id: string; beforeId: string | null },
    ) => {
      if (p.kind === "active") return bs.map((b) => (b.id === p.id ? { ...b, active: p.active } : b));
      /* order — 서버 reorderBlock 과 같은 의미론: 빼서 beforeId 앞(null=맨 뒤)에 끼운다 */
      const moved = bs.find((b) => b.id === p.id);
      if (!moved) return bs;
      const rest = bs.filter((b) => b.id !== p.id);
      const at = p.beforeId === null ? rest.length : rest.findIndex((b) => b.id === p.beforeId);
      if (at < 0) return bs;
      return [...rest.slice(0, at), moved, ...rest.slice(at)];
    },
  );
  const [liveTheme, pickThemeOptimistic] = useOptimistic(page?.theme ?? "");

  function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, onOk?: (res: T) => void, onFail?: () => void) {
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
        if (!res.ok) {
          setError(res.error ?? "처리하지 못했어요.");
          onFail?.();
        } else onOk?.(res);
      } catch {
        /* 전송 계층 실패(네트워크 단절 등) — 잡지 않으면 busy 만 풀리고 아무 안내가 없다 */
        setError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
        onFail?.();
      } finally {
        setBusy(false);
      }
    });
  }

  /* run() 의 전역 busy 는 순서가 중요한 조작(이동·삭제·발행)용이다. 온오프·테마는
     독립적·멱등이라 그 줄에 세우면 연타가 "앞선 작업 처리 중" 안내로 삼켜져
     "엄청 느리다"는 체감이 됐다(2026-08-20). 낙관 반영과 함께 바로 쏜다. */
  function fire(
    optimistic: () => void,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    onFail?: () => void,
    onOk?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      optimistic();
      let res: { ok: boolean; error?: string };
      try {
        res = await fn();
      } catch {
        /* {ok:false} 계약 밖 예외를 여기서 흡수해야 낙관 반영이
           "성공한 척" 화면에 박제되지 않는다 */
        res = { ok: false, error: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요." };
      }
      if (res.ok) onOk?.();
      if (!res.ok) {
        setError(res.error ?? "처리하지 못했어요.");
        /* 낙관이 useOptimistic 이 아니라 **폼 상태**를 미리 바꾼 경우(인라인 프로필),
           서버 값이 안 바뀌는 실패에선 serverKey 동기화가 깨어나지 않는다 —
           호출부가 준 onFail 이 유일한 복구 경로다(소넷 확정 2). */
        onFail?.();
      }
    });
  }

  function record(entry: UndoEntry) {
    setUndoStack((s) => [...s.slice(-(UNDO_MAX - 1)), entry]);
    /* 새 조작은 다시실행 가지를 자른다 — 표준 히스토리 의미론 */
    setRedoStack([]);
  }

  /** 이력 전체 파기 — 대상 블록들이 통째로 사라지는 조작(템플릿 적용·페이지 삭제) 후.
      옛 역연산이 새 구성에 유령 블록을 꽂거나 0행 매치로 헛돌게 두지 않는다(소넷 확정 2). */
  function clearHistory() {
    setUndoStack([]);
    setRedoStack([]);
  }

  function performUndo() {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    run(entry.undo, () => {
      setUndoStack((s) => s.slice(0, -1));
      setRedoStack((s) => [...s, entry]);
      setNotice(`되돌렸어요: ${entry.label}`);
    });
  }

  function performRedo() {
    const entry = redoStack[redoStack.length - 1];
    if (!entry) return;
    run(entry.redo, () => {
      setRedoStack((s) => s.slice(0, -1));
      setUndoStack((s) => [...s, entry]);
      setNotice(`다시 실행했어요: ${entry.label}`);
    });
  }

  /** 도구 칩·캔버스에서 드로어 열기 — 같은 칩을 다시 누르면 닫힌다(forceOpen 은 토글 없이 연다) */
  function openDrawer(key: Drawer, forceOpen = false) {
    if (!leaveEditor()) return;
    setEditingId(null);
    /* 오류는 그 조작에 붙은 것 — 드로어를 옮기면 함께 사라져야 한다 */
    setError(null);
    setDrawer((prev) => (prev === key && !forceOpen ? null : key));
  }

  function openEditor(id: string) {
    if (!leaveEditor()) return;
    const data = blocks.find((b) => b.id === id)?.data ?? {};
    setDraft(data);
    setBaseline(stableJson(data));
    setEditingId(id);
    /* 편집을 닫으면 **캔버스만** 남는다 — 드로어를 연 채 진입하면 닫을 때 이전
       드로어가 재등장하는 뒷문이 생긴다(소넷 확정 4). 여기서 닫아 규칙을 하나로. */
    setDrawer(null);
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
        onStart={(input) =>
          run(
            () => createLinkPageWithStart(input),
            () => setNotice("페이지를 만들었어요. 주소는 「프로필」 탭에서 바꿀 수 있어요."),
          )
        }
        error={error}
        busy={busy}
        isDemo={isDemo}
      />
    );
  }

  const editing = blocks.find((b) => b.id === editingId) ?? null;



  /* ── 상단 바 부품 — 1행(도구 칩)·2행(이력·미리보기 토글)에 꽂는 JSX ── */
  const toolChips = (
    <>
      {TOOLS.map((t) => {
        const on = !editing && drawer === t.key;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            aria-label={t.label}
            onClick={() => openDrawer(t.key)}
            className={cn(
              "trans-state flex items-center gap-1.5 rounded-chip px-2.5 py-1.5 text-[14px] font-semibold",
              on ? "bg-primary text-on-primary" : "border border-line text-fg-sub hover:bg-tint-hover hover:text-fg",
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {/* 좁은 폭에선 아이콘만 — 1행에서 주소·열람 버튼과 자리 다툼을 막는다 */}
            <span className="hidden lg:inline">{t.label}</span>
          </button>
        );
      })}
    </>
  );

  const historyButtons = (
    <>
      <button
        type="button"
        onClick={performUndo}
        disabled={undoStack.length === 0 || busy}
        aria-label={undoStack.length ? `실행취소: ${undoStack[undoStack.length - 1].label}` : "실행취소"}
        title={undoStack.length ? `실행취소: ${undoStack[undoStack.length - 1].label}` : undefined}
        className="trans-state rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg disabled:opacity-30"
      >
        <Undo2 className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={performRedo}
        disabled={redoStack.length === 0 || busy}
        aria-label={redoStack.length ? `다시실행: ${redoStack[redoStack.length - 1].label}` : "다시실행"}
        title={redoStack.length ? `다시실행: ${redoStack[redoStack.length - 1].label}` : undefined}
        className="trans-state rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg disabled:opacity-30"
      >
        <Redo2 className="size-4" aria-hidden />
      </button>
    </>
  );


  /* 지금 편집 중인 화면 — 캔버스(도구 포함)와 우측 미리보기(공개 규칙, 도구 없음)가
     **같은 데이터**를 그린다. 프로필 폼·낙관 테마·낙관 블록·편집 중 draft 를 합친
     값이라 타이핑하는 즉시 두 군데 다 바뀐다. 링크팜의 라이브 미리보기가 이것이다 —
     발행본이 아니라 현재 상태(2026-08-20 오더). 발행 여부는 헤더 문구·최신 칩이 말한다. */
  const draftPageView: LinkPageView = {
    ...page,
    title: profileForm.title,
    bio: profileForm.bio,
    layout: profileForm.layout,
    align: profileForm.align,
    snsLinks: profileForm.snsLinks,
    snsPlacement: profileForm.snsPlacement,
    titleSize: profileForm.titleSize,
    theme: liveTheme,
    themeCustom: Object.keys(customForm).length ? customForm : null,
  };
  const draftBlocksView = liveBlocks.map((b) => (b.id === editingId ? { ...b, data: draft } : b));

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
      <TopBar
        page={page}
        origin={origin}
        busy={busy}
        /* 발행은 초안을 스냅샷으로 복사할 뿐 — 초안 조작의 실행취소는 그대로 유효하다 */
        onPublish={() => run(() => publishLinkPage())}
        statsOpen={statsOpen}
        onToggleStats={() => setStatsOpen((v) => !v)}
        tools={toolChips}
        history={historyButtons}
      />

      {tplPreview ? (
        <TemplateModal
          template={tplPreview}
          page={draftPageView}
          busy={busy}
          onClose={() => setTplPreview(null)}
          onApply={() => {
            const t = tplPreview;
            run(
              () => applyTemplate(t.key),
              () => {
                clearHistory();
                setTplPreview(null);
                setNotice(`「${t.name}」 템플릿을 적용했어요.`);
              },
            );
          }}
        />
      ) : null}

      {statsOpen ? (
        <Card>
          <CardBody>
            <StatsPanel stats={stats} onRange={(d) => router.push(`/links?days=${d}`, { scroll: false })} busy={busy} />
          </CardBody>
        </Card>
      ) : null}

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

      {/* ── 링크팜 배치 그대로: 좌(템플릿 스트립 + 편집 폰) · 우(상시 라이브 미리보기,
          드로어가 열리면 그 자리를 대체). 무대 배경 없음 — 폰이 지면 위에 바로 뜬다
          (2026-08-20 사장님 오더 1·2). ── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <div className="min-w-0 space-y-5">
          {/* 템플릿 적용하기 — 링크팜 상시 스트립(접이식). 첫 칸은 가져오기. */}
          <div className="card-face">
            <button
              type="button"
              onClick={() => setTplOpen((v) => !v)}
              aria-expanded={tplOpen}
              className="flex w-full items-center justify-between px-4 py-2.5 text-[14px] font-semibold"
            >
              <span>✨ 템플릿 적용하기</span>
              <ChevronDown className={cn("size-4 text-fg-sub transition-transform", tplOpen && "rotate-180")} aria-hidden />
            </button>
            {tplOpen ? (
              <div className="flex gap-2 overflow-x-auto px-4 pb-3">
                <button
                  type="button"
                  onClick={() => openDrawer("add", true)}
                  className="trans-state w-44 shrink-0 rounded-card border border-dashed border-line bg-plate px-3 py-2.5 text-left hover:border-primary"
                >
                  <span className="flex size-8 items-center justify-center rounded-card bg-body text-fg-sub" aria-hidden>
                    <Download className="size-4" />
                  </span>
                  <span className="mt-2 block text-[13px] font-semibold leading-snug text-fg">
                    + 기존 프로필 링크
                    <br />
                    복사해오기
                  </span>
                </button>
                {LINK_TEMPLATES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    disabled={busy}
                    /* 누르면 즉시 미리보기 — 확정은 캔버스 위 「이 템플릿 적용」 */
                    onClick={() => setTplPreview(t)}
                    aria-pressed={tplPreview?.key === t.key}
                    /* 틴트 바탕은 템플릿 고유색(콘텐츠 팔레트) — 글자는 테마 무관 항상 어두운
                       on-primary, 배지는 항상 어두운 scrim: 다크 테마에서도 그대로 읽힌다 */
                    style={{ background: t.tint }}
                    className={cn(
                      "trans-state relative w-44 shrink-0 rounded-card border border-line px-3 py-2.5 text-left hover:border-primary disabled:opacity-50",
                      tplPreview?.key === t.key && "border-primary ring-2 ring-primary/40",
                    )}
                  >
                    <span className="tnum absolute right-2 top-2 rounded-chip bg-scrim px-1.5 py-0.5 text-[11px] font-semibold text-on-scrim">
                      {t.blocks.length}블록
                    </span>
                    <span className="flex size-8 items-center justify-center rounded-card bg-white/80 text-[18px]" aria-hidden>
                      {t.emoji}
                    </span>
                    <span className="mt-2 block text-[14px] font-semibold text-on-primary">{t.name}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-on-primary/70">{t.hint}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {(
              <PhonePreview
                page={draftPageView}
                /* active 필터를 걸지 않는다 — 꺼진 블록도 캔버스에 남아야 다시 켤 수 있다 */
                blocks={draftBlocksView}
                selectedId={editingId}
                edit={{
                  onEdit: openEditor,
                  /* 온오프는 낙관 즉시 반영 — 스위치가 서버 왕복을 기다리면 고장처럼 보인다 */
                  onToggle: (id, active) =>
                    fire(
                      () => applyBlockPatch({ kind: "active", id, active }),
                      () => updateBlock(id, { active }),
                      undefined,
                      () =>
                        record({
                          label: active ? "노출 켜기" : "노출 끄기",
                          undo: () => updateBlock(id, { active: !active }),
                          redo: () => updateBlock(id, { active }),
                        }),
                    ),
                  /* 안내는 **성공했을 때만** 나간다 — 연타로 무시된 클릭·서버 실패에
                     「옮겼어요」가 읽히면 안 된다(목록을 눈으로 못 보는 사용자에게는 확정이다) */
                  onMove: (id, dir, label) =>
                    run(
                      chained(() => moveBlock(id, dir)),
                      () => {
                        setNotice(`${label} 블록을 ${dir === "up" ? "위로" : "아래로"} 옮겼어요.`);
                        /* 한계(소넷 확정 3, 수용): 역연산은 "그때의 이웃"이 아니라 실행
                           시점의 이웃과 스왑한다(moveBlock 이 현재 목록을 다시 읽는다).
                           사이에 다른 이동이 끼면 원래 배치 복원이 아니라 한 칸 이동을
                           무를 뿐이다 — 순서는 늘 정의돼 있어(sort_order,created_at) 안전. */
                        record({
                          label: `${label} 이동`,
                          undo: chained(() => moveBlock(id, dir === "up" ? "down" : "up")),
                          redo: chained(() => moveBlock(id, dir)),
                        });
                      },
                    ),
                  /* 드래그 정렬 — 낙관으로 즉시 재배치, 성공 시에만 역연산 기록.
                     origBefore(원래 바로 뒤 블록)가 복원 좌표다. */
                  onReorder: (dragId, beforeId, label) => {
                    const from = liveBlocks.findIndex((b) => b.id === dragId);
                    if (from < 0) return;
                    const origBefore = liveBlocks[from + 1]?.id ?? null;
                    /* 제자리 드롭은 조작이 아니다 — 서버 왕복도 이력도 만들지 않는다 */
                    if (beforeId === dragId || beforeId === origBefore) return;
                    fire(
                      () => applyBlockPatch({ kind: "order", id: dragId, beforeId }),
                      chained(() => reorderBlock(dragId, beforeId)),
                      undefined,
                      () =>
                        /* 한계(이동 undo 와 같은 수용, 소넷 확정 4): undo 좌표(origBefore)는
                           드래그 시점 스냅샷이다. 그 블록이 그 사이 삭제되면 undo 는
                           "화면을 새로고침해 주세요"로 명시적으로 실패하고 엔트리는
                           스택에 남는다 — 데이터는 안 다치고, 다른 조작이 이력을 밀어낸다. */
                        record({
                          label: `${label} 이동`,
                          undo: chained(() => reorderBlock(dragId, origBefore)),
                          redo: chained(() => reorderBlock(dragId, beforeId)),
                        }),
                    );
                  },
                  onDelete: (id, label) => {
                    /* 삭제는 물리 삭제 — 확인 후 지우고, 직전 1건은 되돌리기 바가 복원한다 */
                    if (!window.confirm(`「${label}」 블록을 삭제할까요?`)) return;
                    const b = blocks.find((x) => x.id === id);
                    run(
                      () => deleteBlock(id),
                      () => {
                        if (b) {
                          /* 복원 경로는 전역 실행취소 **하나**다 — 인라인 되돌리기 바와
                             이중으로 기록하면 같은 블록이 두 번 복원된다(소넷 확정 1). */
                          const payload = { type: b.type, data: b.data, sortOrder: b.sortOrder, active: b.active };
                          /* 복원은 **새 행**을 만든다 — 다시실행(재삭제)은 그 새 id 를
                             지워야 하므로 클로저 변수로 따라간다 */
                          let currentId = id;
                          record({
                            label: `${label} 삭제`,
                            undo: async () => {
                              const r = await restoreBlock(payload);
                              if (r.ok && r.id) currentId = r.id;
                              return r;
                            },
                            redo: () => deleteBlock(currentId),
                          });
                        }
                        setNotice("블록을 삭제했어요. 상단 ↩ 실행취소로 복원할 수 있어요.");
                      },
                    );
                  },
                  onAdd: () => openDrawer("add", true),
                  onOpenProfile: () => openDrawer("profile", true),
                  onProfileCommit: (patch) => {
                    /* 인라인 편집은 **그 필드만** 확정한다. 서버에는 「마지막 서버
                       확정값 + 이번 패치」를 보낸다 — profileForm 전체를 보내면
                       드로어에 남아 있던 미저장 주소·SEO 가 저장 버튼 없이 딸려
                       나간다(소넷 확정 1). 실패하면 그 필드만 폼에서 되돌린다 —
                       서버 값이 안 바뀌는 실패에선 serverKey 동기화가 영원히
                       깨어나지 않기 때문이다(확정 2). */
                    const before: Partial<ProfileFormState> = {};
                    for (const k of Object.keys(patch) as Array<keyof typeof patch>) before[k] = profileForm[k];
                    setProfileForm((f) => ({ ...f, ...patch }));
                    fire(
                      () => {},
                      () => updateLinkProfile({ ...profileFormFrom(page), ...patch }),
                      () => setProfileForm((f) => ({ ...f, ...before })),
                    );
                  },
                }}
              />
            )}
        </div>

        {/* 우측 패널 — 링크팜 구조: 평소엔 「라이브 미리보기」, 드로어·블록 편집이
            그 자리를 대체한다(✕ 로 닫으면 라이브로 복귀). 모바일에선 편집·드로어가
            열렸을 때만 캔버스보다 먼저(order-first). */}
        {/* sticky 오프셋은 상단바(h-14=56px) **아래**여야 한다 — top-6 이면 고정되는 순간
            카드 윗줄이 헤더 밑에 깔린다(소넷 확정). 폰 프레임이 고정 높이라 스크롤이 늘 생긴다. */}
        <Card className={cn("xl:order-none xl:sticky xl:top-[4.5rem]", (editing || drawer) && "order-first")}>
          <CardBody className="space-y-4">
            {!editing && drawer ? (
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold">{DRAWER_TITLE[drawer]}</h3>
                <button
                  type="button"
                  aria-label="패널 닫기"
                  /* 오류는 그 패널의 조작에 붙은 것 — 패널만 닫고 배너를 남기면
                     무관한 다음 작업 위에 유령처럼 얹힌다(소넷 확정 3) */
                  onClick={() => {
                    setDrawer(null);
                    setError(null);
                  }}
                  className="trans-state rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-fg"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ) : null}

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
                onSave={(data) =>
                  run(
                    () => updateBlock(editing.id, { data }),
                    () => {
                      setBaseline(stableJson(data));
                      /* editing.data 는 저장 직전 렌더의 서버 값 — 역연산의 원본이다 */
                      const prev = editing.data ?? {};
                      record({
                        label: `${blockSummary(editing.type, data)} 내용 저장`,
                        undo: () => updateBlock(editing.id, { data: prev }),
                        redo: () => updateBlock(editing.id, { data }),
                      });
                    },
                  )
                }
              />
            ) : drawer === "profile" ? (
              <ProfilePanel
                page={page}
                form={profileForm}
                dirty={profileDirty}
                busy={busy}
                error={error}
                onChange={(patch) => setProfileForm((f) => ({ ...f, ...patch }))}
                onSave={() => run(() => updateLinkProfile(profileForm))}
                onImages={(v) => run(() => updateLinkImages(v))}
              />
            ) : drawer === "theme" ? (
              <ThemePanel
                custom={customForm}
                customDirty={customDirty}
                busy={busy}
                onCustomChange={patchCustom}
                onCustomReset={() => setCustomForm({})}
                onCustomSave={() => {
                  /* 서버 관문은 틀린 값을 **조용히** 떨군다 — 그러면 저장 직후 미리보기에
                     있던 배경 이미지가 말없이 사라진다. 보내기 전에 같은 관문을 태워
                     떨어질 값이 있으면 여기서 알린다(색 인풋·칩은 틀릴 수 없고 주소만 자유 입력). */
                  const clean = sanitizeThemeCustom(customForm);
                  if (customForm.bgImage && !clean?.bgImage) {
                    setError("배경 이미지 주소는 http(s)로 시작해야 하고 공백·따옴표·괄호가 없어야 해요.");
                    return;
                  }
                  run(() => updateLinkThemeCustom(customForm));
                }}
                current={liveTheme}
                /* 누르는 즉시 칠한다 — 로딩·비활성 없음. 실패하면 트랜지션 종료와 함께
                   서버 값으로 자동 복귀한다(2026-08-20 "굳이 로딩 걸어야 되나") */
                onPick={(k) => {
                  const prev = liveTheme;
                  fire(
                    () => pickThemeOptimistic(k),
                    () => updateLinkTheme(k),
                    undefined,
                    () => {
                      if (prev !== k) {
                        record({ label: "테마 변경", undo: () => updateLinkTheme(prev), redo: () => updateLinkTheme(k) });
                      }
                    },
                  );
                }}
              />
            ) : drawer === "add" ? (
              <AddPanel
                busy={busy}
                onAdd={(t) =>
                  run(
                    () => addBlock(t),
                    (res) => {
                      setNotice("블록을 추가했어요. 캔버스의 블록을 누르면 바로 고칠 수 있어요.");
                      if (res.id) {
                        const payload = {
                          type: t,
                          data: defaultBlockData(t),
                          sortOrder: (blocks[blocks.length - 1]?.sortOrder ?? -1) + 1,
                          active: true,
                        };
                        let currentId = res.id;
                        record({
                          label: `${BLOCK_CATALOG.find((c) => c.type === t)?.label ?? t} 추가`,
                          undo: () => deleteBlock(currentId),
                          redo: async () => {
                            const r = await restoreBlock(payload);
                            if (r.ok && r.id) currentId = r.id;
                            return r;
                          },
                        });
                      }
                    },
                  )
                }
                /* 드로어의 템플릿도 같은 try-on 경로 — 드로어를 닫아 우측 미리보기까지 보이게 */
                onApplyTemplate={(k) => {
                  const t = LINK_TEMPLATES.find((x) => x.key === k);
                  if (t) {
                    setTplPreview(t);
                    setDrawer(null);
                  }
                }}
                onImport={(items, clear) =>
                  run(
                    () => addBlocksBulk(items),
                    () => {
                      /* 성공했을 때만 표를 비운다 — 실패하면 고른 목록·고친 이름이
                         남아 있어야 한다(붙여넣기 원문은 textarea 에 없어서 여기서
                         날리면 원래 서비스로 돌아가 다시 복사해 와야 한다). */
                      clear();
                      setNotice(`링크 ${items.length}개를 추가했어요.`);
                    },
                  )
                }
              />
            ) : drawer === "settings" ? (
              <>
              <PlatformLinks slug={page.slug} origin={origin} />
              <SettingsPanel
                page={page}
                leads={leads}
                busy={busy}
                onPublishToggle={(v) => run(() => setLinkPublished(v))}
                onDelete={() =>
                  run(
                    () => deleteLinkPage(),
                    /* 페이지가 사라지면 역연산 대상도 없다 — 같은 컴포넌트 인스턴스가
                       살아남아 새 페이지에 옛 블록을 꽂는 사고를 막는다 */
                    () => clearHistory(),
                  )
                }
              />
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-[15px] font-bold">
                    <Smartphone className="size-4 text-fg-sub" aria-hidden />
                    라이브 미리보기
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(publicLinkUrl(page.slug, origin), "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    링크 열기
                  </Button>
                </div>
                <p className="-mt-2 text-[12px] text-fg-sub">
                  {page.publishedAt
                    ? page.dirty
                      ? "지금 모습이에요 — 「라이브 반영」을 누르면 공개 주소에 반영돼요."
                      : "공개 주소와 같은 모습이에요."
                    : "지금 모습이에요 — 「라이브 반영」을 누르면 공개 주소가 살아나요."}
                </p>
                {/* 읽기 전용 draft — 캔버스와 같은 값·같은 관대한 규칙(도구만 없음). 꺼진 블록만
                    뺀다. 수정하는 즉시 여기도 바뀐다. live 로 그리면 주소 없는 블록이 빠져
                    "미리보기에 안 나온다"가 된다(2026-08-20 지적). */}
                <PhonePreview
                  page={draftPageView}
                  blocks={draftBlocksView.filter((b) => b.active)}
                  selectedId={null}
                  /* 실제 폰 크기로 고정 — 블록 수와 무관하게 같은 프레임, 내용은 안에서 스크롤 */
                  frame="device"
                />
              </>
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
  statsOpen,
  onToggleStats,
  tools,
  history,
}: {
  page: LinkPageView;
  origin: string;
  busy: boolean;
  onPublish: () => void;
  statsOpen: boolean;
  onToggleStats: () => void;
  /** 1행 왼쪽 — 드로어 여닫는 도구 칩(부모가 상태를 들고 JSX 로 꽂는다) */
  tools: React.ReactNode;
  /** 2행 왼쪽 — 실행취소/다시실행 */
  history: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
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
    <div className="card-face">
      {/* 1행 — 도구 칩 · 주소 · 열람 도구(복사/열기/QR) · 통계 (링크팜 실측 배치) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2">
        {tools}
        <code className="min-w-0 flex-1 truncate px-1 text-[12px] text-fg-sub">{url}</code>

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
      <Button variant="ghost" size="sm" onClick={() => setQr(true)}>
        <QrCode className="size-3.5" aria-hidden />
        QR
      </Button>
      {qr ? <QrModal url={url} onClose={() => setQr(false)} /> : null}

      {/* 통계 — 편집 탭이 아니라 여기. 만드는 도구와 성과 보기를 섞지 않는다 */}
      <Button variant={statsOpen ? "secondary" : "ghost"} size="sm" onClick={onToggleStats} aria-expanded={statsOpen}>
        <BarChart3 className="size-3.5" aria-hidden />
        통계
      </Button>
      </div>

      {/* 2행 — 이력(↩↪) 왼쪽, 초안/라이브·발행 상태·라이브 반영 오른쪽 (링크팜 보조 줄) */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-t border-line px-3 py-1.5">
        {history}
        <div className="ml-auto flex flex-wrap items-center gap-2">

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
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   블록 추가 패널 — 카탈로그·템플릿·가져오기 (블록 목록은 캔버스가 대신한다)
   ══════════════════════════════════════════════════════════════════ */

/* 템플릿 미리보기 모달 — 링크팜 카피. 작업 중 캔버스는 그대로 두고 **모달 안 폰**에
   템플릿을 그린다. 프로필(이름·사진)은 내 것, 블록·테마는 템플릿 것 — "내 페이지가
   이렇게 된다"가 보인다. 서버 호출은 「이 템플릿 적용」 때만. */
function TemplateModal({
  template,
  page,
  busy,
  onClose,
  onApply,
}: {
  template: LinkTemplate;
  page: LinkPageView;
  busy: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  /* 적용 중엔 어떤 경로(Esc·배경 클릭·X)로도 닫지 않는다 — 닫힌 줄 알았던 작업이
     뒤늦게 적용되면 "취소했는데 바뀌었다"가 된다. 로더 오버레이가 버튼은 가리지만
     키보드·배경은 못 가리므로 여기서 막는다. */
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);

  const blocks: LinkBlock[] = template.blocks.map((b, i) => ({
    id: `tpl-${i}`,
    type: b.type,
    data: b.data,
    sortOrder: i,
    active: true,
  }));

  return (
    <div
      className="modal-scrim-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${template.name} 템플릿 미리보기`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        className="modal-card-in shadow-pop relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-card border border-line bg-body outline-none"
      >
        {/* 적용 중 — 핀치 로더(로고 주위로 도는 빛)로 덮는다. 모달을 닫지 않는다 */}
        {busy ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-body/75">
            <FinchLoader label="템플릿을 적용하는 중…" />
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[17px] font-semibold">
              {template.emoji} {template.name}{" "}
              <span className="tnum text-[14px] font-normal text-fg-sub">{template.blocks.length}블록</span>
            </h3>
            <p className="mt-0.5 text-[14px] text-fg-sub">{template.hint}</p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="trans-state rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-fg"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface px-5 py-5">
          <PhonePreview page={{ ...page, theme: template.theme, themeCustom: null }} blocks={blocks} selectedId={null} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-[12px] text-fg-sub">적용하면 지금 블록이 이 구성으로 바뀌어요. 작업 중인 화면은 닫기 전까지 그대로예요.</p>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              닫기
            </Button>
            <Button size="sm" disabled={busy} onClick={onApply}>
              {busy ? "적용 중…" : "이 템플릿 적용"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* QR 코드 — 링크팜 라이브 미리보기 옆 QR 카피(2026-08-20 대조). 명함·매장·
   오프라인 유입의 표준 통로다. qrcode 는 모달을 열 때만 동적 로드해서
   편집기 본 번들에 끼우지 않는다. */
function QrModal({ url, onClose }: { url: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  /* onClose 는 부모 렌더마다 새 함수다 — ref 로 고정해 리스너를 한 번만 건다
     (rule-wizard·post-composer 와 같은 관례, 소넷 확정) */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  /* 열릴 때 모달로 포커스, 닫히면 원래 자리로 — 레포 모달 공통 관례 */
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((QR) => {
        if (alive && canvasRef.current) {
          /* 카메라가 읽어야 하므로 테마와 무관하게 **항상 검정-흰색**이다 —
             다크 토큰을 따르면 대비가 뒤집혀 스캔이 안 된다(의도된 hex 예외) */
          return QR.toCanvas(canvasRef.current, url, {
            width: 220,
            margin: 1,
            color: { dark: "#111111", light: "#ffffff" },
          });
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function download() {
    const c = canvasRef.current;
    if (!c) return;
    /* data: URL 은 일부 사파리가 다운로드 대신 새 탭으로 연다 — Blob 경로가 안전하다 */
    c.toBlob((blob) => {
      if (!blob) return;
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "핀치-프로필링크-QR.png";
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(u), 10_000);
    }, "image/png");
  }

  return (
    <div
      className="modal-scrim-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="QR 코드"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={boxRef} tabIndex={-1} className="modal-card-in shadow-pop w-full max-w-xs rounded-card border border-line bg-body p-5 text-center outline-none">
        <h3 className="text-[15px] font-bold">QR 코드</h3>
        <p className="mt-1 text-[12px] text-fg-sub">명함·매장·포스터 어디든 — 찍으면 내 프로필 링크로 와요.</p>
        <div className="mx-auto mt-3 w-fit rounded-card bg-white p-2.5">
          <canvas ref={canvasRef} aria-label={`${url} QR 코드`} />
        </div>
        {failed ? (
          <p role="alert" className="mt-2 text-[12px] text-negative-strong">
            QR 을 만들지 못했어요. 잠시 후 다시 열어 주세요.
          </p>
        ) : null}
        <p className="mt-2 break-all text-[11px] text-fg-sub">{url}</p>
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" onClick={download} disabled={failed}>
            PNG 저장
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddPanel({
  busy,
  onAdd,
  onApplyTemplate,
  onImport,
}: {
  busy: boolean;
  onAdd: (t: BlockType) => void;
  onApplyTemplate: (key: string) => void;
  onImport: (items: Array<{ label: string; url: string }>, clear: () => void) => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, typeof BLOCK_CATALOG>();
    for (const c of BLOCK_CATALOG) {
      const list = m.get(c.group) ?? [];
      list.push(c);
      m.set(c.group, list);
    }
    return [...m.entries()];
  }, []);

  return (
    <div className="space-y-4">
      {groups.map(([group, list]) => (
        <div key={group}>
          <p className="text-[12px] font-semibold text-fg-sub">{group}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {list.map((c) => (
              <button
                key={c.type}
                type="button"
                disabled={busy}
                onClick={() => onAdd(c.type)}
                className="trans-state rounded-card border border-line px-3 py-2.5 text-left hover:border-primary hover:bg-tint-hover disabled:opacity-50"
              >
                <span className="block text-[14px] font-semibold">{c.label}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-fg-sub">{c.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

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
              /* 누르면 미리보기로 — 확정은 캔버스 위 「이 템플릿 적용」이 받는다 */
              onClick={() => onApplyTemplate(t.key)}
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

      {/* 다른 서비스에서 옮겨오기 — 템플릿과 같은 격의 접이식 */}
      <ImportLinks busy={busy} onImport={onImport} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   프로필 패널
   ══════════════════════════════════════════════════════════════════ */

function ProfilePanel({
  page,
  form,
  dirty,
  busy,
  error,
  onChange,
  onSave,
  onImages,
}: {
  page: LinkPageView;
  /** 폼의 단일 출처 — 부모가 든다(탭 이동에도 입력이 살아남는 이유) */
  form: ProfileFormState;
  /** 서버 값과 다른 입력이 있는가 — 저장 안내 표시용 */
  dirty: boolean;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<ProfileFormState>) => void;
  onImages: (v: { avatarPath?: string | null; coverPath?: string | null }) => void;
  onSave: () => void;
}) {
  const { slug, title, bio, layout, align, snsLinks: sns, snsPlacement, titleSize, seoTitle, seoDesc } = form;

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
              onClick={() => onChange({ layout: l.key })}
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
          cropAspect={1}
          hint="권장 400×400 이상 정사각형 — 다른 비율은 올릴 때 위치를 맞출 수 있어요"
        />
      ) : null}
      {layout === "cover" || layout === "cover_profile" ? (
        <ImageField
          label="커버 이미지"
          value={page.coverPath ?? ""}
          onChange={(v) => onImages({ coverPath: v || null })}
          aspect="aspect-[3/1]"
          cropAspect={3}
          hint="권장 1200×400(3:1) — 다른 비율은 올릴 때 보일 부분을 직접 고를 수 있어요"
        />
      ) : null}

      <div>
        <label htmlFor="p-slug" className="block text-[12px] font-medium text-fg-sub">
          주소 (/p/…)
        </label>
        <input id="p-slug" value={slug} onChange={(e) => onChange({ slug: e.target.value.toLowerCase() })} maxLength={30} className={`mt-1.5 ${input}`} />
      </div>

      <div>
        <label htmlFor="p-title" className="block text-[12px] font-medium text-fg-sub">
          타이틀
        </label>
        <input
          id="p-title"
          value={title}
          onChange={(e) => onChange({ title: e.target.value })}
          maxLength={40}
          className={`mt-1.5 ${input}`}
        />
      </div>

      <div>
        <label htmlFor="p-bio" className="block text-[12px] font-medium text-fg-sub">
          설명
        </label>
        <textarea
          id="p-bio"
          value={bio}
          onChange={(e) => onChange({ bio: e.target.value })}
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
              onClick={() => onChange({ align: a })}
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
          링크팜의 「드래그」 배치는 안 가져온다 — 우리는 드래그 정렬 자체를 뺐다. */}
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
              onClick={() => onChange({ titleSize: t.key })}
              aria-pressed={titleSize === t.key}
              className={cn(
                "trans-state rounded-card border px-2 py-1.5 font-semibold",
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
              onClick={() => onChange({ snsPlacement: o.key })}
              aria-pressed={snsPlacement === o.key}
              className={cn(
                "trans-state rounded-card border px-2 py-1.5 text-[12px] font-semibold",
                snsPlacement === o.key ? "border-2 border-primary" : "border border-line hover:bg-tint-hover",
              )}
            >
              {o.label}
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
                onChange={(e) => onChange({ snsLinks: sns.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)) })}
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
                onChange={(e) => onChange({ snsLinks: sns.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })}
                placeholder="https://…"
                aria-label={`SNS ${i + 1} 주소`}
                className="h-10 min-w-0 flex-1 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => onChange({ snsLinks: sns.filter((_, j) => j !== i) })}
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
              onClick={() => onChange({ snsLinks: [...sns, { kind: "instagram", url: "" }] })}
            >
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
            <input id="p-seot" value={seoTitle} onChange={(e) => onChange({ seoTitle: e.target.value })} maxLength={60} placeholder={page.title || "브랜드 이름"} className={`mt-1.5 ${input}`} />
          </div>
          <div>
            <label htmlFor="p-seod" className="block text-[12px] font-medium text-fg-sub">
              공유 설명 <span className="tnum text-fg-faint">{seoDesc.length}/160</span>
            </label>
            <textarea
              id="p-seod"
              value={seoDesc}
              onChange={(e) => onChange({ seoDesc: e.target.value })}
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

      {/* 입력이 탭 이동에도 살아남게 되면서, "고쳐놓고 저장을 잊는" 경우가
          조용히 길어질 수 있다 — 서버 값과 다르면 여기서 말해 준다 */}
      {dirty ? (
        <p className="text-[12px] text-fg-sub">
          저장 안 한 변경이 있어요 — 탭을 옮겨도 입력은 남아 있고, 「저장」해야 실제로 반영됩니다.
        </p>
      ) : null}
      <Button variant="secondary" disabled={busy} onClick={onSave}>
        {busy ? "저장 중…" : "저장"}
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   테마 패널
   ══════════════════════════════════════════════════════════════════ */

function ThemePanel({
  current,
  custom,
  customDirty,
  busy,
  onPick,
  onCustomChange,
  onCustomReset,
  onCustomSave,
}: {
  current: string;
  custom: LinkThemeCustom;
  customDirty: boolean;
  busy: boolean;
  onPick: (k: string) => void;
  onCustomChange: (patch: Partial<LinkThemeCustom>) => void;
  onCustomReset: () => void;
  onCustomSave: () => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, typeof LINK_THEMES>();
    for (const t of LINK_THEMES) {
      const list = m.get(t.group) ?? [];
      list.push(t);
      m.set(t.group, list);
    }
    return [...m.entries()];
  }, []);
  const preset = themeByKey(current);
  const hasCustom = Object.keys(custom).length > 0;
  const chip = (on: boolean) =>
    cn(
      "trans-state rounded-chip px-3 py-1.5 text-[12px] font-semibold",
      on ? "bg-primary text-on-primary" : "border border-line text-fg-sub hover:bg-tint-hover hover:text-fg",
    );

  return (
    <div className="space-y-5">
      <h3 className="text-[15px] font-bold">테마</h3>
      {groups.map(([group, list]) => (
        <div key={group}>
          <p className="text-[11px] font-bold tracking-[0.08em] text-fg-sub">{group}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {list.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => onPick(t.key)}
                aria-pressed={current === t.key}
                className={cn(
                  "trans-state overflow-hidden rounded-card border text-left disabled:opacity-50",
                  current === t.key ? "border-2 border-primary" : "border border-line hover:border-line-strong",
                )}
              >
                {/* 테마 미니 미리보기 — 실제 색(그라데이션 프리셋은 그라데이션 그대로) */}
                <span
                  className="block h-16 p-2.5"
                  style={{ background: t.bg2 ? `linear-gradient(160deg, ${t.bg}, ${t.bg2})` : t.bg }}
                >
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

      {/* ── 직접 꾸미기 — 프리셋 위에 덮는다(2026-08-20 "에디트 더 자유롭게").
          값은 폼으로 들고 있고 미리보기에 즉시 비친다. 저장해야 실제 반영·발행에 굳는다. ── */}
      <div className="space-y-4 border-t border-line pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold">직접 꾸미기</h3>
          {hasCustom ? (
            <button
              type="button"
              onClick={onCustomReset}
              className="trans-state text-[12px] font-medium text-fg-sub underline underline-offset-2 hover:text-fg"
            >
              프리셋으로 되돌리기
            </button>
          ) : null}
        </div>

        <div>
          <p className="text-[12px] font-medium text-fg-sub">색</p>
          <div className="mt-1.5 grid grid-cols-4 gap-2">
            {(
              [
                { key: "bg", label: "배경" },
                { key: "accent", label: "강조" },
                { key: "card", label: "카드" },
                { key: "fg", label: "글자" },
              ] as const
            ).map((c) => (
              <label key={c.key} className="block text-center text-[11px] text-fg-sub">
                <input
                  type="color"
                  value={custom[c.key] ?? preset[c.key]}
                  onChange={(e) => onCustomChange({ [c.key]: e.target.value.toUpperCase() })}
                  aria-label={`${c.label} 색`}
                  className="block h-9 w-full cursor-pointer rounded-card border border-line bg-body p-0.5"
                />
                <span className="mt-1 block">{c.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-fg-sub">배경</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={!!custom.bg2}
              onClick={() => onCustomChange({ bg2: custom.bg2 ? undefined : (preset.bg2 ?? custom.accent ?? preset.accent) })}
              className={chip(!!custom.bg2)}
            >
              그라데이션
            </button>
            {custom.bg2 ? (
              <label className="flex items-center gap-1.5 text-[12px] text-fg-sub">
                끝색
                <input
                  type="color"
                  value={custom.bg2}
                  onChange={(e) => onCustomChange({ bg2: e.target.value.toUpperCase() })}
                  aria-label="그라데이션 끝색"
                  className="h-8 w-10 cursor-pointer rounded-card border border-line bg-body p-0.5"
                />
              </label>
            ) : null}
          </div>
          <div className="mt-2">
            <ImageField
              label="배경 이미지 (선택)"
              value={custom.bgImage ?? ""}
              onChange={(v) => onCustomChange({ bgImage: v || undefined })}
              hint="넣으면 배경색·그라데이션보다 앞에 깔려요 — 글자가 읽히는지 미리보기로 확인하세요"
            />
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-fg-sub">모서리</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CUSTOM_RADIUS.map((r) => (
              <button
                key={r.key}
                type="button"
                aria-pressed={(custom.radius ?? preset.radius) === r.key}
                onClick={() => onCustomChange({ radius: r.key })}
                className={chip((custom.radius ?? preset.radius) === r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-fg-sub">버튼</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CUSTOM_BUTTONS.map((b) => (
              <button
                key={b.key}
                type="button"
                aria-pressed={(custom.button ?? "fill") === b.key}
                onClick={() => onCustomChange({ button: b.key })}
                className={chip((custom.button ?? "fill") === b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-fg-sub">글꼴</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CUSTOM_FONTS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={(custom.font ?? "sans") === f.key}
                onClick={() => onCustomChange({ font: f.key })}
                className={chip((custom.font ?? "sans") === f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {customDirty ? (
          <p className="text-[12px] text-fg-sub">저장 안 한 변경이 있어요 — 미리보기엔 보이지만 「저장」해야 실제로 반영됩니다.</p>
        ) : null}
        <Button variant="secondary" disabled={busy || !customDirty} onClick={onCustomSave}>
          {busy ? "저장 중…" : "꾸미기 저장"}
        </Button>
      </div>
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
        <div className="flex items-center gap-1.5">
        {/* CSV — 링크팜 통계 모달의 다운로드에 해당. 화면이 든 데이터를 그대로 내린다 */}
        <button
          type="button"
          onClick={() =>
            downloadCsv(`핀치-프로필링크-통계-${stats.days}일.csv`, [
              ["구분", "값"],
              ["기간", `${stats.days}일`],
              ["조회수", stats.views],
              ["방문자", stats.uniques],
              ["클릭", stats.clicks],
              ["조회당 클릭(%)", stats.ctr],
              ["재방문율(%)", stats.returning],
              [],
              ["날짜", "조회수", "클릭"],
              ...stats.daily.map((d) => [d.date, d.views, d.clicks] as Array<string | number>),
              [],
              ["블록", "클릭", "상태"],
              ...stats.blocks.map((b) => [b.label, b.clicks, b.removed ? "지운 블록" : ""] as Array<string | number>),
              [],
              ["지역", "국가", "조회수"],
              ...stats.regions.map((r) => [r.region, r.country, r.views] as Array<string | number>),
              ...(stats.sources.length
                ? [
                    [],
                    ["유입 채널", "조회수"],
                    ...stats.sources.map((x) => [(x.src && SRC_LABEL.get(x.src)) ?? "직접·기타", x.views] as Array<string | number>),
                  ]
                : []),
            ])
          }
          className="trans-state rounded-chip border border-line px-2.5 py-1 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg"
        >
          CSV
        </button>
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

      {stats.sources.length > 0 ? (
        <div>
          <p className="text-[12px] font-medium text-fg-sub">유입 채널</p>
          <ul className="mt-1.5 space-y-1">
            {stats.sources.map((x) => (
              <li key={x.src ?? "direct"} className="flex items-center justify-between gap-2 text-[14px]">
                <span className="min-w-0 truncate">{(x.src && SRC_LABEL.get(x.src)) ?? "직접·기타"}</span>
                <span className="tnum font-semibold">{x.views.toLocaleString("ko-KR")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-fg-sub">설정의 「플랫폼별 링크」로 복사한 주소로 들어온 방문이에요.</p>
        </div>
      ) : null}

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

function PlatformLinks({ slug, origin }: { slug: string; origin: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(`${publicLinkUrl(slug, origin)}?src=${key}`);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* 권한 거부·비보안 컨텍스트 — 상단 바의 주소를 손으로 복사하면 된다 */
    }
  }
  return (
    <div>
      <h3 className="text-[15px] font-bold">플랫폼별 링크</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-fg-sub">
        올리는 곳마다 그 플랫폼의 주소를 쓰면, 방문이 어느 채널에서 왔는지 통계의 「유입 채널」에 잡혀요.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SRC_PLATFORMS.map((pf) => (
          <button
            key={pf.key}
            type="button"
            onClick={() => void copy(pf.key)}
            aria-label={`${pf.label}용 주소 복사`}
            className="trans-state flex items-center gap-1.5 rounded-chip border border-line px-2.5 py-1.5 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg"
          >
            <SnsIcon kind={pf.key} className="size-3.5" />
            {copied === pf.key ? "복사됨!" : pf.label}
          </button>
        ))}
      </div>
    </div>
  );
}

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
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-fg-sub">받은 내용</p>
          {leads.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                downloadCsv("핀치-프로필링크-받은내용.csv", [
                  ["종류", "이름", "이메일", "연락처", "내용", "접수일"],
                  ...leads.map(
                    (l) =>
                      [
                        l.kind === "subscribe" ? "구독" : "문의",
                        l.name ?? "",
                        l.email ?? "",
                        l.phone ?? "",
                        l.message ?? "",
                        l.createdAt,
                      ] as Array<string | number>,
                  ),
                ])
              }
              className="trans-state rounded-chip border border-line px-2.5 py-1 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg"
            >
              CSV
            </button>
          ) : null}
        </div>
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
   생성 폼 — 링크팜 첫 화면 문법(2026-08-19 재실측 반영)
   ══════════════════════════════════════════════════════════════════ */

function CreateForm({
  onCreate,
  onStart,
  error,
  busy,
  isDemo,
}: {
  onCreate: (slug: string, title: string) => void;
  onStart: (input: { template?: string; links?: Array<{ label: string; url: string }> }) => void;
  error: string | null;
  busy: boolean;
  isDemo: boolean;
}) {
  /*
    앞서는 주소·제목 폼 하나였다 — 템플릿·가져오기는 페이지를 만든 **다음** 블록 탭
    안에 접혀 있어서, 정작 제일 필요한 순간(빈손으로 온 첫 화면)에 안 보였다.
    링크팜은 반대다: 첫 화면이 「템플릿으로 시작」과 「기존 링크 가져오기」 두 CTA 고,
    주소는 자동 생성이다. 그 문법을 따른다 — 주소 고민은 시작을 막는 첫 이탈 지점이다.
  */
  const [mode, setMode] = useState<null | "template" | "import" | "blank">(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");

  const cta =
    "trans-state flex w-full items-center justify-center gap-2 rounded-card px-4 py-3 text-[15px] font-semibold disabled:opacity-50";

  return (
    <Card>
      <CardBody>
        <EmptyState
          icon={Link2}
          title="아직 프로필 링크가 없어요"
          description="템플릿을 고르거나, 쓰던 서비스의 링크를 가져와서 시작하세요. 주소는 자동으로 만들어져요."
        />

        {/* 데모 모드는 **누르기 전에** 알린다 — 저장은 서버 액션이 막는다 */}
        {isDemo ? (
          <p className="mx-auto mt-6 max-w-md rounded-card border border-line bg-plate px-4 py-3 text-[14px] leading-[1.6] text-fg-sub">
            지금은 <strong className="font-semibold text-fg">데모 모드</strong>예요. 화면은 둘러볼 수 있지만
            저장은 되지 않아요. 로그인하면 실제 프로필 링크를 만들 수 있습니다.
          </p>
        ) : null}

        <div className="mx-auto mt-6 max-w-md space-y-2.5">
          <button
            type="button"
            disabled={isDemo || busy}
            aria-expanded={mode === "template"}
            onClick={() => setMode(mode === "template" ? null : "template")}
            className={cn(cta, "bg-primary text-on-primary")}
          >
            <Sparkles className="size-4" aria-hidden />
            템플릿으로 시작
          </button>

          {mode === "template" ? (
            <div className="grid grid-cols-2 gap-2">
              {LINK_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  disabled={busy}
                  onClick={() => onStart({ template: t.key })}
                  className="trans-state rounded-card border border-line px-3 py-2.5 text-left hover:border-primary hover:bg-tint-hover disabled:opacity-50"
                >
                  <span className="block text-[14px] font-semibold">
                    {t.name} <span className="tnum font-normal text-fg-sub">{t.blocks.length}블록</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-fg-sub">{t.hint}</span>
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            disabled={isDemo || busy}
            aria-expanded={mode === "import"}
            onClick={() => setMode(mode === "import" ? null : "import")}
            className={cn(cta, "border border-line text-fg hover:bg-tint-hover")}
          >
            <Download className="size-4" aria-hidden />
            기존 링크 가져오기
          </button>

          {mode === "import" ? (
            <div className="rounded-card border border-line p-3">
              <ImportLinksBody
                busy={busy}
                actionLabel="담아서 시작하기"
                /* clear 는 안 부른다 — 성공하면 CreateForm 자체가 빌더로 바뀌며 사라지고,
                   실패하면 고른 목록이 남아 있어야 다시 시도할 수 있다 */
                onImport={(items) => onStart({ links: items })}
              />
            </div>
          ) : null}

          <button
            type="button"
            disabled={isDemo || busy}
            aria-expanded={mode === "blank"}
            onClick={() => setMode(mode === "blank" ? null : "blank")}
            className="trans-state mx-auto block text-[12px] text-fg-sub underline underline-offset-2 hover:text-fg disabled:opacity-50"
          >
            빈 페이지로 시작 (주소 직접 정하기)
          </button>

          {mode === "blank" ? (
            <div className="space-y-3 rounded-card border border-line p-3">
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
              <Button onClick={() => onCreate(slug, title)} disabled={!slug.trim() || busy} className="w-full">
                {busy ? "만드는 중…" : "만들기"}
              </Button>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-[14px] text-negative-strong">
              {error}
            </p>
          ) : null}

          <p className="pt-1 text-center text-[12px] text-fg-sub">
            주소·제목·테마는 만든 뒤 언제든 바꿀 수 있어요.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
