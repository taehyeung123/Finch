"use client";

import { useEffect, useLayoutEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  Contact,
  FileDown,
  Images,
  Music2,
  Search,
  CalendarClock,
  Clock,
  Copy as CopyIcon,
  Ellipsis,
  GripVertical,
  Heart,
  Heading,
  Inbox,
  Lock,
  Monitor,
  Tablet,
  Image as ImageIcon,
  LayoutGrid,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Minus,
  MoveVertical,
  Play,
  Rss,
  ShoppingBag,
  Star,
  Type,
  GalleryHorizontal,
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
import { trapFocus } from "@/components/ui/trap-focus";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { SnsIcon } from "@/components/sns-brand-icons";
import { DualLineChart } from "@/components/ui/charts";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { FinchLoader } from "@/components/ui/finch-loader";
import { normalizeSnsUrl, publicLinkUrl, stableJson } from "@/lib/links";
import { SNS_CATALOG, snsHref } from "@/lib/links/sns-catalog";
import {
  BLOCK_CATALOG,
  EMPHASIS_TYPES,
  blockSchedule,
  blockSummary,
  defaultBlockData,
  hiddenReason,
  isScheduledHidden,
  partialReason,
  scheduleCaption,
  BLOCK_META_KEYS,
  type BlockType,
  type LinkBlock,
} from "@/lib/links/blocks";
import {
  CUSTOM_BUTTONS,
  CUSTOM_ANIMS,
  CUSTOM_DESKTOP,
  CUSTOM_EFFECTS,
  CUSTOM_FILTERS,
  CUSTOM_SHADOWS,
  LINK_FONTS,
  fontStylesheets,
  CUSTOM_RADIUS,
  LAYOUTS,
  LINK_THEMES,
  mixHex,
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
  setBlockEmphasized,
  setBlockSchedule,
  duplicateBlock,
  replyGuestbook,
  setGuestbookHidden,
  deleteGuestbook,
  updateLinkSettings,
  setLinkPassword,
  exportLeads,
} from "../actions";
import { LINK_LANGS, LINK_TARGETS, type LinkPageSettings } from "@/lib/links/settings";
import type { LinkGuestbookEntry, LinkLead, LinkPageView, LinkSnapshotView, LinkStats } from "@/lib/links/types";
import { BlockEditor, EDITOR_TITLE_ID } from "./block-editor";
import { ImageField } from "./image-field";
import { ImportLinks, ImportLinksBody } from "./import-links";
import { PhonePreview, type CanvasEdit } from "./phone-preview";
import { useFontStylesheets } from "./use-font-stylesheets";

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

type Drawer = "profile" | "theme" | "add" | "manage" | "settings";

/* 상단 도구 칩 — 링크팜 실측 순서(2026-08-20 캔버스 개편). 칩은 우측 드로어를
   여닫고, 캔버스(폰)는 항상 보인다. 블록 목록 패널은 없다 — 캔버스가 목록이다. */
const TOOLS: Array<{ key: Drawer; label: string; icon: typeof User }> = [
  { key: "profile", label: "프로필", icon: User },
  { key: "theme", label: "테마", icon: Palette },
  { key: "add", label: "블록 추가", icon: Plus },
  /* 관리 — 리틀리 「관리」 탭 카피(5단계): 문의·구독·방명록이 한 곳에. 전엔 설정 드로어 안에 묻혀 있었다 */
  { key: "manage", label: "관리", icon: Inbox },
  { key: "settings", label: "설정", icon: Settings },
];

const SNS_GROUPS = [...new Set(SNS_CATALOG.map((c) => c.group))];

const DRAWER_TITLE: Record<Drawer, string> = {
  profile: "프로필 설정",
  theme: "테마 선택",
  add: "블록 추가",
  manage: "관리",
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
const DEVICE_LABEL = new Map<string, string>([
  ["mobile", "모바일"],
  ["tablet", "태블릿"],
  ["desktop", "PC"],
]);
/** ms → "1분 12초" / "48초" */
function dwellLabel(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}

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
  leadCounts,
  leadsFailed = false,
  guestbook = [],
  isDemo,
  loadFailed = false,
}: {
  page: LinkPageView | null;
  blocks: LinkBlock[];
  snapshot: LinkSnapshotView | null;
  origin: string;
  stats: LinkStats;
  leads: LinkLead[];
  leadCounts?: { contact: number; subscribe: number; guestbook: number };
  leadsFailed?: boolean;
  /** 방명록(0057) — 주인용 목록, 숨김 포함 */
  guestbook?: LinkGuestbookEntry[];
  isDemo: boolean;
  /** 조회 자체가 실패 — "없음"이 아니다(감사 #10·#11). 생성 폼 대신 재시도 화면 */
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  /* 토스트는 4초 뒤 내려간다 — 같은 문구가 연달아 오면 타이머만 다시 돈다 */
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);
  /* 템플릿 스트립 접기 — 링크팜의 「템플릿 적용하기 ^」 상시 스트립 카피 */
  const [tplOpen, setTplOpen] = useState(true);
  /* 스트립이 잘리는 쪽을 흐린다 — 카드가 뚝 잘려 "끊긴 화면"으로 보이던 것(2026-08-22 지적).
     스크롤 위치·폭이 바뀔 때마다 양끝 페이드를 다시 판정한다. */
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripFade, setStripFade] = useState({ l: false, r: false });
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const judge = () => {
      const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      const l = el.scrollLeft > 4;
      setStripFade((f) => (f.l === l && f.r === r ? f : { l, r }));
    };
    judge();
    el.addEventListener("scroll", judge, { passive: true });
    const ro = new ResizeObserver(judge);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", judge);
      ro.disconnect();
    };
    /* 스트립은 페이지가 생긴 뒤에야 마운트된다 — 생성 폼에서 바로 넘어오면 같은 인스턴스라 [] 로는 다시 안 붙는다(감사 L10) */
  }, [page?.id, loadFailed]);

  /* 템플릿 미리보기 — 카드를 누르면 **별도 모달**에서 그 템플릿을 보여준다(링크팜
     동작). 작업 중인 캔버스·미리보기는 건드리지 않는다 — 화면을 바꿔치기하면
     "하던 게 날아간" 것처럼 보인다(2026-08-20 지적). 서버 호출은 「이 템플릿 적용」
     때만. */
  const [tplPreview, setTplPreview] = useState<LinkTemplate | null>(null);
  /* 예약 공개 모달 — 어느 블록의 예약을 고치는 중인가 */
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  /* 편집 중인 블록 값은 **여기서** 들고 있다 — 편집기 안에 가둬 두면 탭을 누르는
     시점에 부모가 "미저장인가"를 알 수 없다. baseline 은 마지막으로 서버에 반영된 값. */
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [baseline, setBaseline] = useState("");
  /* 페이지 설정 저장 체인 — blur 저장이 연달아 나가도 서버의 읽고-합치고-쓰기가 겹치지 않게 */
  const settingsChain = useRef<Promise<unknown>>(Promise.resolve());
  const editorDirty = editingId !== null && stableJson(draft) !== baseline;
  /* 편집 중인 블록의 **서버 값**이 바뀌면(↩ 내용 되돌리기·저장 후 서버 정규화) 미저장이 아닐 때만 초안을 다시 심는다 —
     안 그러면 되돌린 뒤에도 편집기·캔버스가 옛 내용을 보여주고 「저장」이 되돌린 값을 다시 쓴다(감사 C4).
     블록이 사라졌으면(삭제·추가 취소·템플릿) 편집 상태를 비운다 — 남겨두면 없는 편집기에 대한 "나갈까요?" 가 뜬다(감사 L8) */
  const editingServer = editingId ? blocks.find((b) => b.id === editingId) : undefined;
  const editingServerKey = editingId ? (editingServer ? stableJson(editingServer.data ?? {}) : "__gone__") : "";
  const [prevEditingKey, setPrevEditingKey] = useState(editingServerKey);
  if (editingServerKey !== prevEditingKey) {
    setPrevEditingKey(editingServerKey);
    if (editingId && !editingServer) {
      setEditingId(null);
      setDraft({});
      setBaseline("");
    } else if (editingId && editingServer && !editorDirty) {
      const data = editingServer.data ?? {};
      setDraft(data);
      setBaseline(editingServerKey);
    }
  }

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
  /* 직전 서버 폼도 기억한다 — 3-way 병합의 기준점.
     통째로 덮어쓰면 캔버스 인라인 이름 저장이 성공하는 순간 드로어에 쓰던 미저장 주소·SEO·SNS 가
     경고 없이 사라졌다(감사 #2). 필드별로: 서버가 바꾼 값은 받고, 사용자가 고친(미저장) 값은 지킨다. */
  const [prevServerForm, setPrevServerForm] = useState<ProfileFormState>(() => profileFormFrom(page));
  if (profileServerKey !== prevProfileKey) {
    const next = profileFormFrom(page);
    const base = prevServerForm;
    setPrevProfileKey(profileServerKey);
    setPrevServerForm(next);
    setProfileForm((f) => {
      const out = { ...f } as Record<string, unknown>;
      for (const k of Object.keys(next) as Array<keyof ProfileFormState>) {
        const changedOnServer = stableJson(next[k]) !== stableJson(base[k]);
        const userEdited = stableJson(f[k]) !== stableJson(base[k]);
        if (changedOnServer || !userEdited) out[k] = next[k];
      }
      return out as ProfileFormState;
    });
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
  /* 삭제→복원은 **새 id** 를 만든다. 그 전에 기록된 엔트리(내용 저장·노출 토글·추가)가 옛 id 를
     들고 있으면 0행을 치고 헛돈다(감사 #8). 옛 id → 새 id 별칭을 등록하고 실행 시점에 풀어 쓴다. */
  const idAlias = useRef(new Map<string, string>());
  function resolveId(id: string): string {
    let cur = id;
    for (let i = 0; i < 32 && idAlias.current.has(cur); i++) cur = idAlias.current.get(cur)!;
    return cur;
  }

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
    /* 위치(slice(0,-1))가 아니라 **동일성**으로 뺀다 — fire() 경로의 record 가 undo 서버 왕복 중에
       끼어들면 엉뚱한 엔트리가 빠지고 같은 undo 가 두 번 실행돼 블록이 복제됐다(감사 #1) */
    run(entry.undo, () => {
      setUndoStack((s) => s.filter((e) => e !== entry));
      setRedoStack((s) => [...s, entry]);
      setNotice(`되돌렸어요: ${entry.label}`);
    });
  }

  function performRedo() {
    const entry = redoStack[redoStack.length - 1];
    if (!entry) return;
    run(entry.redo, () => {
      setRedoStack((s) => s.filter((e) => e !== entry));
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
    /* 이미 열린 블록을 캔버스에서 다시 누름 = "보려는" 것 — 편집 중 내용을 버리지 않는다(감사 L9) */
    if (id === editingId) {
      requestAnimationFrame(() => document.getElementById(EDITOR_TITLE_ID)?.focus());
      return;
    }
    if (!leaveEditor()) return;
    const data = blocks.find((b) => b.id === id)?.data ?? {};
    setDraft(data);
    setBaseline(stableJson(data));
    setPrevEditingKey(stableJson(data));
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

  if (loadFailed) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="프로필 링크를 불러오지 못했어요"
        description="서버와 잠시 연결이 끊겼어요. 페이지는 그대로 있으니 다시 시도해 주세요."
        action={
          <Button variant="secondary" onClick={() => router.refresh()}>
            다시 시도
          </Button>
        }
      />
    );
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



  /* 캔버스·블록 목록이 **같은 핸들러**를 쓴다 — 두 화면이 같은 일을 다르게 하면 안 된다 */
  const canvasEdit: CanvasEdit = {
    onEdit: openEditor,
    /* 온오프는 낙관 즉시 반영 — 스위치가 서버 왕복을 기다리면 고장처럼 보인다 */
    onToggle: (id, active) =>
      fire(
        () => applyBlockPatch({ kind: "active", id, active }),
        () => updateBlock(id, { active }),
        undefined,
        () => {
          /* 무슨 일이 났는지 바로 말한다 — 눈 아이콘을 편집 버튼으로 알고 누른 뒤
             "미리보기에 왜 안 나오냐"가 됐다(2026-08-22 실계정). 되돌리는 길도 같이. */
          setNotice(
            active
              ? "블록을 다시 켰어요 — 미리보기·공개에 나가요."
              : "블록을 숨겼어요 — 미리보기·공개 페이지에서 빠져요. 눈 아이콘이나 ↩ 실행취소로 되돌릴 수 있어요.",
          );
          record({
            label: active ? "노출 켜기" : "노출 끄기",
            undo: () => updateBlock(resolveId(id), { active: !active }),
            redo: () => updateBlock(resolveId(id), { active }),
          });
        },
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
            /* 실행 시점에 id 를 푼다 — 삭제→복원 뒤 옛 id 로 부르면 이 엔트리가 영원히 실패해 이력이 막힌다(감사 C7) */
            undo: chained(() => moveBlock(resolveId(id), dir === "up" ? "down" : "up")),
            redo: chained(() => moveBlock(resolveId(id), dir)),
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
            undo: chained(() => reorderBlock(resolveId(dragId), origBefore === null ? null : resolveId(origBefore))),
            redo: chained(() => reorderBlock(resolveId(dragId), beforeId === null ? null : resolveId(beforeId))),
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
            record({
              label: `${label} 삭제`,
              undo: async () => {
                const r = await restoreBlock(payload);
                /* 옛 id → 새 id 별칭 — 이 블록을 가리키던 모든 엔트리가 새 행을 따라간다 */
                if (r.ok && r.id) idAlias.current.set(resolveId(id), r.id);
                return r;
              },
              redo: () => deleteBlock(resolveId(id)),
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
  };

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
  /* 편집 중 블록은 초안을 덮되 **메타(강조·예약)는 서버 값**을 따른다 — 초안엔 열 때의 메타가 굳어 있어
     ★ 를 눌러도 안 바뀌고 다시 누르면 "켜기"를 또 보내 영원히 못 껐다(감사 C4) */
  const draftBlocksView = liveBlocks.map((b) => {
    if (b.id !== editingId) return b;
    const data: Record<string, unknown> = { ...draft };
    for (const k of BLOCK_META_KEYS) {
      if (k in b.data) data[k] = b.data[k];
      else delete data[k];
    }
    return { ...b, data };
  });

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
        hasFeed={blocks.some((b) => b.active && b.type === "social_feed")}
        statsOpen={statsOpen}
        onToggleStats={() => setStatsOpen((v) => !v)}
        tools={toolChips}
        history={historyButtons}
      />

      {scheduleFor ? (
        <ScheduleModal
          block={blocks.find((b) => b.id === scheduleFor) ?? null}
          busy={busy}
          error={error}
          onClose={() => setScheduleFor(null)}
          onSave={(openAt, closeAt) => {
            const b = blocks.find((x) => x.id === scheduleFor);
            if (!b) return;
            const prev = blockSchedule(b.data);
            const id = b.id;
            run(
              () => setBlockSchedule(id, openAt, closeAt),
              () => {
                setScheduleFor(null);
                setNotice(openAt || closeAt ? "예약을 저장했어요 — 공개 페이지가 날짜에 맞춰 보이거나 숨겨요." : "예약을 해제했어요.");
                record({
                  label: "예약 공개 변경",
                  undo: () => setBlockSchedule(resolveId(id), prev.openAt, prev.closeAt),
                  redo: () => setBlockSchedule(resolveId(id), openAt, closeAt),
                });
              },
            );
          }}
        />
      ) : null}

      {tplPreview ? (
        <TemplateModal
          template={tplPreview}
          page={draftPageView}
          busy={busy}
          error={error}
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

      {/* ── 배치: 좌(템플릿 스트립 + 편집 폰) · 우(상시 라이브 미리보기).
          드로어·블록 편집은 **그 사이 세 번째 칸**으로 열린다 — 전엔 미리보기 자리를 대체했는데
          "블록 추가·테마 누르면 미리보기가 가려져 불편" (2026-08-22 지시). 패널은 sticky + 내부 스크롤이라
          긴 편집기(그리드 12칸)도 미리보기를 밀어내지 않는다. 모바일(<xl)은 패널이 캔버스 위로. ── */}
      {/* ── 배치(명시적 그리드 좌표):
            1행: 템플릿 스트립(1~2열) · 라이브 미리보기(3열, 2행에 걸쳐 sticky — 원래 자리인 **상단 오른쪽**)
            2행: 편집 폰(1열) · 패널 칸(2열, 열릴 때만 폭)
          스트립이 캔버스+패널 칸을 합친 폭을 쓰므로 패널이 열려도 카드가 잘리지 않고, 미리보기는
          스트립 옆 제자리에 있다(2026-08-22 "라이브 미리보기 위치 원래대로"). ── */}
      {/* xl 미만은 한 칸 — minmax(0,1fr) 로 못 박는다. 암묵 auto 칸은 어느 항목의 min-content(409px)를 따라가 폰에서 카드가 뷰포트 밖으로 새어 나갔다 */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_auto_26rem] xl:items-start">
      {/* 템플릿 적용하기 — 링크팜 상시 스트립(접이식). 접기는 grid-rows 로 스르륵,
          넘치는 쪽은 가장자리 페이드. 첫 칸은 가져오기. */}
      {/* min-w-0 — 스트립 카드(shrink-0)의 min-content 가 그리드 칸을 밀어 폰에서 카드가 뷰포트 밖으로 새어 나갔다(실측 409/390px) */}
      <div className="card-face min-w-0 xl:col-span-2 xl:col-start-1 xl:row-start-1">
        <button
          type="button"
          onClick={() => setTplOpen((v) => !v)}
          aria-expanded={tplOpen}
          className="flex w-full items-center justify-between px-4 py-2.5 text-[14px] font-semibold"
        >
          <span>✨ 템플릿 적용하기</span>
          <ChevronDown
            className={cn("size-4 text-fg-sub transition-transform duration-[240ms] ease-[var(--ease-arrive)]", tplOpen && "rotate-180")}
            aria-hidden
          />
        </button>
        <div className="links-collapse" data-open={tplOpen ? "true" : "false"}>
          <div>
            <div
              ref={stripRef}
              className="links-strip flex gap-2 overflow-x-auto px-4 pb-3"
              data-fade-l={stripFade.l ? "true" : "false"}
              data-fade-r={stripFade.r ? "true" : "false"}
            >
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
                    /* 누르면 즉시 미리보기 — 확정은 캔버스 위 「이 템플릿 적용」. 앞선 조작의 오류는 이 모달 것이 아니다 */
                    onClick={() => {
                      setError(null);
                      setTplPreview(t);
                    }}
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
          </div>
        </div>
      </div>

        <div className="min-w-0 space-y-5 xl:col-start-1 xl:row-start-2">
          {(
              <PhonePreview
                page={draftPageView}
                /* active 필터를 걸지 않는다 — 꺼진 블록도 캔버스에 남아야 다시 켤 수 있다 */
                blocks={draftBlocksView}
                selectedId={editingId}
                edit={canvasEdit}
              />
            )}
        </div>

        {/* 편집 패널(가운데 칸) — 드로어·블록 편집. 칸은 항상 렌더되고 data-open 으로 폭이
            스르륵 열리고 닫힌다(.links-panel-col). 닫히는 동안은 마지막 내용을 잔상으로 보여준다.
            sticky 오프셋은 상단바(h-14=56px) **아래**(top-[4.5rem]). 높이는 뷰포트에 맞추고 안에서 스크롤. */}
        {(() => {
          /* 목록 모드(기본) — 블록 아코디언. 블록 편집·프로필은 **목록 안 행이 펼쳐지는** 것이고,
             테마·블록 추가·설정만 목록을 대체한다(✕ 로 목록 복귀). 리틀리 흡수 1단계. */
          const listMode = !drawer || drawer === "profile" || !!editing;
          const panelKey = listMode ? "list" : `drawer:${drawer}`;
          const body = (
            <CardBody key={panelKey} className="wizard-step-in space-y-4">
            {!listMode && drawer ? (
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

            {listMode ? (
              <BlockListPanel
                blocks={draftBlocksView}
                editingId={editingId}
                busy={busy}
                profileOpen={drawer === "profile"}
                onToggleProfile={() => {
                  if (drawer === "profile") {
                    setDrawer(null);
                    setError(null);
                  } else openDrawer("profile", true);
                }}
                profile={
                  drawer === "profile" ? (
                    <ProfilePanel
                      page={page}
                      form={profileForm}
                      dirty={profileDirty}
                      busy={busy}
                      error={error}
                      onChange={(patch) => setProfileForm((f) => ({ ...f, ...patch }))}
                      onSave={() => {
                        const bad = profileForm.snsLinks.find((x) => !normalizeSnsUrl(snsHref(x.kind, x.url)));
                        if (bad) {
                          setError(bad.url.trim() ? "SNS 주소가 올바르지 않아요 — http(s) 주소, 이메일, 전화번호만 넣을 수 있어요." : "비어 있는 SNS 줄은 지워 주세요.");
                          return;
                        }
                        run(() => updateLinkProfile(profileForm));
                      }}
                      onImages={(v) => run(() => updateLinkImages(v))}
                    />
                  ) : null
                }
                editor={
                  editing ? (
              <BlockEditor
                embedded
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
                      const savedId = editing.id;
                      record({
                        label: `${blockSummary(editing.type, data)} 내용 저장`,
                        undo: () => updateBlock(resolveId(savedId), { data: prev }),
                        redo: () => updateBlock(resolveId(savedId), { data }),
                      });
                    },
                  )
                }
              />
                  ) : null
                }
                onExpand={(id) => openEditor(id)}
                onCollapse={() => closeEditor()}
                onToggle={canvasEdit.onToggle}
                onMove={canvasEdit.onMove}
                onReorder={canvasEdit.onReorder}
                onDelete={canvasEdit.onDelete}
                onAdd={() => openDrawer("add", true)}
                onEmphasize={(id, on) => {
                  /* 켜면 다른 블록의 강조가 풀린다 — 되돌리기는 "그 전에 강조였던 블록"을 복원한다 */
                  const prevEmph = liveBlocks.find((b) => b.data.emphasized === true && b.id !== id)?.id ?? null;
                  run(
                    () => setBlockEmphasized(id, on),
                    () => {
                      setNotice(on ? "이 블록을 강조했어요 — 페이지 아래에 고정 버튼으로 떠요." : "강조를 풀었어요.");
                      record({
                        label: on ? "강조 켜기" : "강조 끄기",
                        undo: () =>
                          on
                            ? prevEmph
                              ? setBlockEmphasized(resolveId(prevEmph), true)
                              : setBlockEmphasized(resolveId(id), false)
                            : setBlockEmphasized(resolveId(id), true),
                        redo: () => setBlockEmphasized(resolveId(id), on),
                      });
                    },
                  );
                }}
                onSchedule={(id) => {
                  setError(null);
                  setScheduleFor(id);
                }}
                onDuplicate={(id, label) =>
                  run(
                    /* 정렬 번호를 다시 쓰는 조작 — 드래그(fire)와 겹치지 않게 같은 체인을 탄다(감사 L5) */
                    chained(() => duplicateBlock(id)),
                    (res) => {
                      setNotice(`「${label}」 블록을 복사했어요 — 바로 아래에 들어갔어요.`);
                      if (res.id) {
                        const newId = res.id;
                        record({
                          label: `${label} 복사`,
                          undo: () => deleteBlock(resolveId(newId)),
                          redo: async () => {
                            const r = await duplicateBlock(resolveId(id));
                            if (r.ok && r.id) idAlias.current.set(resolveId(newId), r.id);
                            return r;
                          },
                        });
                      }
                    },
                  )
                }
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
                    setError("배경 이미지 주소는 http(s)로 시작해야 하고 공백·따옴표·괄호·역슬래시가 없어야 해요.");
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
                        const addedId = res.id;
                        record({
                          label: `${BLOCK_CATALOG.find((c) => c.type === t)?.label ?? t} 추가`,
                          undo: () => deleteBlock(resolveId(addedId)),
                          redo: async () => {
                            const r = await restoreBlock(payload);
                            if (r.ok && r.id) idAlias.current.set(resolveId(addedId), r.id);
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
            ) : drawer === "manage" ? (
              <ManagePanel
                leads={leads}
                leadCounts={leadCounts}
                leadsFailed={leadsFailed}
                guestbook={guestbook}
                busy={busy}
                onGuestbookReply={(id, reply) => run(() => replyGuestbook(id, reply), () => setNotice("답글을 달았어요."))}
                onGuestbookHide={(id, hidden) => run(() => setGuestbookHidden(id, hidden))}
                onGuestbookDelete={(id) => {
                  if (!window.confirm("이 방명록 글을 지울까요?")) return;
                  run(() => deleteGuestbook(id), () => setNotice("방명록 글을 지웠어요."));
                }}
                onExportLeads={() =>
                  run(
                    () => exportLeads(),
                    (res) => {
                      const rows = res.rows ?? [];
                      downloadCsv("핀치-프로필링크-받은내용.csv", [
                        ["종류", "이름", "이메일", "연락처", "내용", "접수일"],
                        ...rows.map((l) => [l.kind, l.name, l.email, l.phone, l.message, l.createdAt] as Array<string | number>),
                      ]);
                      setNotice(`받은 내용 ${rows.length}건을 CSV 로 내려받았어요.`);
                    },
                  )
                }
              />
            ) : drawer === "settings" ? (
              <>
              <PlatformLinks slug={page.slug} origin={origin} />
              <SettingsPanel
                page={page}
                busy={busy}
                /* 텍스트 칸의 blur 저장은 busy 베일을 띄우지 않는다 — 띄우면 blur 를 일으킨 그 클릭(스위치·저장 버튼)이 disabled 로 삼켜졌다(감사3 C7).
                   settings 는 서버에서 읽고-합치고-쓰기라 클라이언트에서 순서대로 보낸다 */
                onSettings={(patch) =>
                  fire(
                    () => {},
                    () => {
                      const p = settingsChain.current.then(() => updateLinkSettings(patch));
                      settingsChain.current = p.then(
                        () => {},
                        () => {},
                      );
                      return p;
                    },
                    undefined,
                    () => setNotice("페이지 설정을 저장했어요. 바로 적용돼요."),
                  )
                }
                onPassword={(pw, onDone) =>
                  run(
                    () => setLinkPassword(pw),
                    () => {
                      setNotice(pw === null ? "비밀번호를 풀었어요. 누구나 볼 수 있어요." : "비밀번호를 걸었어요. 방문자는 비밀번호를 넣어야 볼 수 있어요.");
                      onDone?.();
                    },
                  )
                }
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
            ) : null}
            </CardBody>
          );
          return <PanelColumn open>{body}</PanelColumn>;
        })()}

        {/* 라이브 미리보기 — **항상** 오른쪽에 있다. 패널이 열려도 가려지지 않는다. */}
        <Card className="xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:sticky xl:top-[4.5rem]">
          <CardBody className="space-y-4">
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
                {/* published(공개 스위치)를 먼저 본다 — 발행만 하고 공개를 안 켠 상태에서
                    "공개 주소와 같은 모습" 이라고 말하면 방문자는 404 인데 소유자는 모른다(감사 #4) */}
                <p className="-mt-2 text-[12px] text-fg-sub">
                  {profileDirty || customDirty || editorDirty
                    ? "저장하지 않은 편집이 보여요 — 저장한 뒤 「라이브 반영」을 누르면 공개 주소에 반영돼요."
                    : !page.published
                    ? page.publishedAt
                      ? "비공개예요 — 설정에서 「공개」를 켜야 방문자가 볼 수 있어요."
                      : "지금 모습이에요 — 「라이브 반영」 후 설정에서 「공개」를 켜면 주소가 살아나요."
                    : page.publishedAt
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
                  blocks={draftBlocksView.filter((b) => b.active && !isScheduledHidden(b.data))}
                  selectedId={null}
                  /* 실제 폰 크기로 고정 — 블록 수와 무관하게 같은 프레임, 내용은 안에서 스크롤 */
                  frame="device"
                />
              </>
          </CardBody>
        </Card>
      </div>

      {/* 작업 중 베일 — 서버 왕복(run)이 도는 동안 핀치 로더. 200ms 안에 끝나면 보이지 않는다.
          "기능 쓸 때 로딩 중이면 로딩 화면" (2026-08-22 지시). fire() 경로(온오프·테마·드래그)는
          낙관 반영이라 기다릴 것이 없어 베일을 띄우지 않는다. */}
      {busy ? (
        <div
          className="busy-veil-in fixed inset-0 z-40 flex items-center justify-center bg-surface/70 backdrop-blur-[2px]"
        >
          <FinchLoader label="처리하는 중…" />
        </div>
      ) : null}

      {/* 토스트 — 조작 결과 안내. 전엔 sr-only 라 "블록을 숨겼어요" 같은 안내가 눈엔 안 보였다. */}
      {/* 모바일(<md)에선 하단 탭바(약 58px + safe-area) 위로 띄운다 — 같은 z-40 이라 탭바 뒤에 깔려 한 픽셀도 안 보였다(감사2 C9) */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6">
        <p
          data-open={notice ? "true" : "false"}
          role="status"
          className="toast-pop pointer-events-auto max-w-xl rounded-card border border-line-strong bg-overlay px-4 py-2.5 text-[14px] text-fg-sub shadow-pop"
        >
          {notice}
        </p>
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
  hasFeed = false,
  statsOpen,
  onToggleStats,
  tools,
  history,
}: {
  page: LinkPageView;
  origin: string;
  busy: boolean;
  onPublish: () => void;
  /** 켜진 「최근 게시물」 블록이 있는가 — 있으면 초안이 깨끗해도 발행(피드 새로고침)을 막지 않는다 */
  hasFeed?: boolean;
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

      {/* 라이브 반영 — 초안을 공개 스냅샷으로. 바뀐 게 없으면 눌러도 의미가 없다.
          단, 「최근 게시물」이 켜져 있으면 늘 누를 수 있다 — 피드는 발행 시점에 구워지므로 새 글을 반영할 길이 이것뿐이다(감사2 U3) */}
      <Button
        size="sm"
        onClick={onPublish}
        disabled={busy || (!page.dirty && !!page.publishedAt && !hasFeed)}
        title={!page.dirty && !!page.publishedAt && hasFeed ? "최근 게시물을 다시 불러와 반영해요" : undefined}
      >
        <Rocket className="size-3.5" aria-hidden />
        {busy ? "반영 중…" : !page.dirty && !!page.publishedAt && hasFeed ? "피드 새로고침" : "라이브 반영"}
      </Button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   블록 추가 패널 — 카탈로그·템플릿·가져오기 (블록 목록은 캔버스가 대신한다)
   ══════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════
   블록 목록 아코디언 — 리틀리 흡수 1단계(2026-08-22).
   행 헤더: 핸들 · ON/OFF · 아이콘+요약 · 강조★ · 예약🕐 · ⋯(복사/위/아래/삭제) · 펼침.
   펼친 행 안에 편집기가 그 자리에서 열린다. 맨 위 「프로필」 행은 프로필 패널을 연다.
   캔버스와 같은 핸들러(canvasEdit)를 쓴다 — 두 화면이 같은 일을 다르게 하지 않는다.
   ══════════════════════════════════════════════════════════════════ */

const BLOCK_ICON: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  link: Link2,
  heading: Heading,
  text: Type,
  divider: Minus,
  spacer: MoveVertical,
  image: ImageIcon,
  image_card: ShoppingBag,
  video: Play,
  card_row: GalleryHorizontal,
  grid: LayoutGrid,
  notice: Megaphone,
  social_feed: Rss,
  contact: MessageSquare,
  subscribe: Mail,
  map: MapPin,
  coupang: ShoppingBag,
  donation: Heart,
  gallery: Images,
  music: Music2,
  vcard: Contact,
  search: Search,
  file: FileDown,
  guestbook: BookOpen,
};

function BlockListPanel({
  blocks,
  editingId,
  busy,
  profileOpen,
  onToggleProfile,
  profile,
  editor,
  onExpand,
  onCollapse,
  onToggle,
  onMove,
  onReorder,
  onDelete,
  onAdd,
  onEmphasize,
  onSchedule,
  onDuplicate,
}: {
  blocks: LinkBlock[];
  editingId: string | null;
  busy: boolean;
  profileOpen: boolean;
  onToggleProfile: () => void;
  profile: React.ReactNode;
  editor: React.ReactNode;
  onExpand: (id: string) => void;
  onCollapse: () => void;
  onToggle: CanvasEdit["onToggle"];
  onMove: CanvasEdit["onMove"];
  onReorder: CanvasEdit["onReorder"];
  onDelete: CanvasEdit["onDelete"];
  onAdd: () => void;
  onEmphasize: (id: string, on: boolean) => void;
  onSchedule: (id: string) => void;
  onDuplicate: (id: string, label: string) => void;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  /* ⋯ 메뉴는 바깥 클릭·Esc 로 닫힌다 */
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuFor]);

  function dropOn(beforeId: string | null) {
    if (!draggingId) return;
    const label = blockSummary(blocks.find((b) => b.id === draggingId)?.type ?? "link", blocks.find((b) => b.id === draggingId)?.data ?? {});
    onReorder(draggingId, beforeId, label);
    setDraggingId(null);
    setOverId(null);
  }

  const iconBtn = "trans-state rounded-card p-1.5 text-fg-sub hover:bg-tint-hover hover:text-fg disabled:opacity-40";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-bold">
          블록 <span className="tnum text-[12px] font-medium text-fg-sub">{blocks.length}</span>
        </h3>
        <Button size="sm" onClick={onAdd} disabled={busy}>
          <Plus className="size-3.5" aria-hidden />
          블록 추가
        </Button>
      </div>

      {/* 프로필 행 — 리틀리처럼 목록 맨 위 */}
      <div className={cn("rounded-card border bg-body", profileOpen ? "border-primary" : "border-line")}>
        <button
          type="button"
          onClick={onToggleProfile}
          aria-expanded={profileOpen}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        >
          <span className="flex size-7 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
            <User className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">프로필</span>
          <ChevronDown
            className={cn("size-4 text-fg-sub transition-transform duration-[240ms] ease-[var(--ease-arrive)]", profileOpen && "rotate-180")}
            aria-hidden
          />
        </button>
        {profileOpen ? <div className="anim-swap border-t border-line px-3 py-3">{profile}</div> : null}
      </div>

      {blocks.map((b, i) => {
        const Icon = BLOCK_ICON[b.type] ?? Link2;
        const meta = BLOCK_CATALOG.find((c) => c.type === b.type);
        const summary = blockSummary(b.type, b.data);
        const expanded = editingId === b.id;
        const emph = b.data.emphasized === true;
        const canEmph = EMPHASIS_TYPES.includes(b.type);
        const sched = blockSchedule(b.data);
        const hasSched = !!(sched.openAt || sched.closeAt);
        const status = !b.active
          ? "숨김 — 미리보기·공개에 안 나가요"
          : (scheduleCaption(b.data) ?? hiddenReason(b.type, b.data) ?? partialReason(b.type, b.data));
        return (
          <div
            key={b.id}
            className={cn(
              "rounded-card border bg-body",
              expanded ? "border-primary" : "border-line",
              draggingId === b.id && "opacity-50",
              overId === b.id && draggingId && draggingId !== b.id && "outline-dashed outline-2 outline-primary",
            )}
            onDragOver={(e) => {
              if (draggingId && draggingId !== b.id) {
                e.preventDefault();
                setOverId(b.id);
              }
            }}
            onDragLeave={() => setOverId((v) => (v === b.id ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              dropOn(b.id);
            }}
          >
            <div className="flex items-center gap-1.5 px-2 py-2">
              {/* 드래그 핸들 — 마우스 전용(키보드·터치는 ⋯ 의 위/아래) */}
              <span
                draggable
                aria-hidden="true"
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", b.id);
                  setDraggingId(b.id);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setOverId(null);
                }}
                className="cursor-grab rounded-card p-1 text-fg-faint hover:text-fg active:cursor-grabbing"
              >
                <GripVertical className="size-4" />
              </span>
              <Switch checked={b.active} onChange={(next) => onToggle(b.id, next)} label={`${summary} 노출`} />
              <button
                type="button"
                id={`row-${b.id}`}
                onClick={() => (expanded ? onCollapse() : onExpand(b.id))}
                aria-expanded={expanded}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-card px-1 py-1 text-left hover:bg-tint-hover"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{meta?.label ?? b.type}</span>
                  <span className="block truncate text-[12px] text-fg-sub">{summary}</span>
                </span>
              </button>
              {canEmph ? (
                <button
                  type="button"
                  onClick={() => onEmphasize(b.id, !emph)}
                  aria-pressed={emph}
                  aria-label={`${summary} 강조`}
                  title="강조 — 페이지 아래 고정 버튼"
                  disabled={busy}
                  /* 좁은 화면(<md)에선 ⋯ 메뉴로 — 375px 에서 행의 이름 칸이 39px 로 줄어 블록 이름이 다 잘렸다(감사2 U16) */
                  className={cn(iconBtn, "hidden md:inline-flex", emph && "text-primary-ink")}
                >
                  <Star className={cn("size-4", emph && "fill-current")} aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onSchedule(b.id)}
                aria-label={`${summary} 예약 공개`}
                title="예약 공개 — 날짜에 맞춰 보이거나 숨기기"
                disabled={busy}
                className={cn(iconBtn, "relative hidden md:inline-flex", hasSched && "text-primary-ink")}
              >
                <Clock className="size-4" aria-hidden />
                {hasSched ? <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" aria-hidden /> : null}
              </button>
              <div className="relative">
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setMenuFor((v) => (v === b.id ? null : b.id))}
                  aria-haspopup="menu"
                  aria-expanded={menuFor === b.id}
                  aria-label={`${summary} 더보기`}
                  className={iconBtn}
                >
                  <Ellipsis className="size-4" aria-hidden />
                </button>
                {menuFor === b.id ? (
                  <div
                    role="menu"
                    onMouseDown={(e) => e.stopPropagation()}
                    className="modal-card-in shadow-pop absolute right-0 top-full z-20 mt-1 w-36 rounded-card border border-line bg-overlay p-1"
                  >
                    {[
                      /* <md 에서만 보이는 항목 — 위 ★·🕐 버튼이 숨겨진 자리 */
                      ...(canEmph ? [{ k: "emph", label: emph ? "강조 해제" : "강조", icon: Star, run: () => onEmphasize(b.id, !emph), disabled: false, narrow: true }] : []),
                      { k: "sched", label: hasSched ? "예약 공개 수정" : "예약 공개", icon: Clock, run: () => onSchedule(b.id), disabled: false, narrow: true },
                      { k: "copy", label: "블록 복사", icon: CopyIcon, run: () => onDuplicate(b.id, summary), disabled: false },
                      { k: "up", label: "위로", icon: ArrowUp, run: () => onMove(b.id, "up", summary), disabled: i === 0 },
                      { k: "down", label: "아래로", icon: ArrowDown, run: () => onMove(b.id, "down", summary), disabled: i === blocks.length - 1 },
                      { k: "del", label: "삭제", icon: Trash2, run: () => onDelete(b.id, summary), disabled: false, danger: true },
                    ].map((m) => (
                      <button
                        key={m.k}
                        role="menuitem"
                        type="button"
                        disabled={m.disabled || busy}
                        onClick={() => {
                          setMenuFor(null);
                          m.run();
                        }}
                        className={cn(
                          "trans-state flex w-full items-center gap-2 rounded-card px-2.5 py-1.5 text-left text-[14px] hover:bg-tint-hover disabled:opacity-40",
                          m.danger ? "text-negative" : "text-fg",
                          m.narrow && "md:hidden",
                        )}
                      >
                        <m.icon className="size-3.5" aria-hidden />
                        {m.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => (expanded ? onCollapse() : onExpand(b.id))}
                aria-label={expanded ? `${summary} 접기` : `${summary} 펼치기`}
                className={iconBtn}
              >
                <ChevronDown
                  className={cn("size-4 transition-transform duration-[240ms] ease-[var(--ease-arrive)]", expanded && "rotate-180")}
                  aria-hidden
                />
              </button>
            </div>
            {status ? <p className="px-3 pb-2 text-[11px] text-fg-sub">{status}</p> : null}
            {expanded ? <div className="anim-swap border-t border-line px-3 py-3">{editor}</div> : null}
          </div>
        );
      })}

      {/* 맨 뒤 드롭 영역 */}
      <div
        onDragOver={(e) => {
          if (draggingId) {
            e.preventDefault();
            setOverId("__end__");
          }
        }}
        onDragLeave={() => setOverId((v) => (v === "__end__" ? null : v))}
        onDrop={(e) => {
          e.preventDefault();
          dropOn(null);
        }}
        className={cn(
          "rounded-card border border-dashed border-line px-3 py-2 text-center text-[12px] text-fg-sub",
          draggingId ? "block" : "hidden",
          overId === "__end__" && "outline-dashed outline-2 outline-primary",
        )}
      >
        여기 놓으면 맨 뒤로
      </div>
    </div>
  );
}

/* 예약 공개 모달 — 공개 날짜 / 숨김 날짜(둘 다 선택). 비우면 해제. */
function ScheduleModal({
  block,
  busy,
  error,
  onClose,
  onSave,
}: {
  block: LinkBlock | null;
  busy: boolean;
  /** 저장 실패 사유 — 모달 안에 보여야 한다(감사2 U6) */
  error?: string | null;
  onClose: () => void;
  onSave: (openAt: string | null, closeAt: string | null) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const init = block ? blockSchedule(block.data) : { openAt: null, closeAt: null };
  /* datetime-local 은 로컬 시각 "YYYY-MM-DDTHH:mm" 을 쓴다 — ISO(UTC) 와 서로 변환 */
  const toLocal = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const [openAt, setOpenAt] = useState(toLocal(init.openAt));
  const [closeAt, setCloseAt] = useState(toLocal(init.closeAt));
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);
  const bad = openAt && closeAt && new Date(openAt).getTime() >= new Date(closeAt).getTime();
  const toIso = (v: string) => (v ? new Date(v).toISOString() : null);
  const field = "mt-1.5 h-10 w-full rounded-card border border-line bg-body px-3 text-[14px] text-fg focus:border-primary focus:outline-none";

  return (
    <div
      className="modal-scrim-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="예약 공개 설정"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        onKeyDown={(e) => trapFocus(boxRef.current, e)}
        className="modal-card-in shadow-pop w-full max-w-sm rounded-card border border-line bg-body p-5 outline-none"
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[15px] font-bold">
            <CalendarClock className="size-4 text-fg-sub" aria-hidden />
            예약 공개
          </h3>
          <button type="button" aria-label="닫기" onClick={onClose} className="trans-state rounded-card p-1.5 text-fg-faint hover:bg-tint-hover hover:text-fg">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-[12px] text-fg-sub">
          {block ? `「${blockSummary(block.type, block.data)}」 — ` : ""}
          정한 날짜에 맞춰 공개 페이지에서 보이거나 숨겨져요. 비워 두면 제한이 없어요.
        </p>
        <label className="mt-4 block text-[12px] font-medium text-fg-sub">
          공개 날짜 (이때부터 보여요)
          <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} className={field} />
        </label>
        <label className="mt-3 block text-[12px] font-medium text-fg-sub">
          숨김 날짜 (이때부터 숨겨요)
          <input type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} className={field} />
        </label>
        {bad ? <p className="mt-2 text-[12px] text-negative-strong">숨김 날짜는 공개 날짜보다 뒤여야 해요.</p> : null}
        {error && !bad ? (
          <p role="alert" className="mt-2 text-[12px] text-negative-strong">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={busy || (!init.openAt && !init.closeAt)} onClick={() => onSave(null, null)}>
            예약 해제
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              취소
            </Button>
            <Button size="sm" disabled={busy || !!bad} onClick={() => onSave(toIso(openAt), toIso(closeAt))}>
              {busy ? "저장 중…" : "저장"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 가운데 패널 칸 — 닫힐 때 **마지막 내용을 잔상으로** 들고 오므라든다. 내용이 먼저 사라지고
   빈 칸만 줄어들면 "뚝" 끊겨 보인다. 잔상은 레이아웃 이펙트에서 잡아 첫 프레임 공백이 없다.
   닫히는 동안 pointer-events 는 CSS(.links-panel-col[data-open=false])가 끈다. */
function PanelColumn({ open, children }: { open: boolean; children: React.ReactNode }) {
  const prev = useRef<React.ReactNode>(null);
  const [closing, setClosing] = useState<React.ReactNode>(null);
  useLayoutEffect(() => {
    if (open) prev.current = children;
    else setClosing(prev.current);
  }, [open, children]);
  return (
    <div
      className="links-panel-col order-first xl:order-none xl:col-start-2 xl:row-start-2 xl:sticky xl:top-[4.5rem]"
      data-open={open ? "true" : "false"}
      aria-hidden={open ? undefined : true}
    >
      <Card className="xl:w-[22rem] xl:max-h-[calc(100dvh-5.5rem)] xl:overflow-y-auto 2xl:w-[24rem]">{open ? children : closing}</Card>
    </div>
  );
}

/** 모달 안에서 Tab 을 가둔다 — aria-modal 은 스크린리더 커서만 제한하고 키보드 포커스는
    못 막아 Tab 이 스크림 뒤 상단바 칩으로 빠져나가 Enter 로 드로어·실행취소가 실행됐다(감사 #12).
    rule-wizard.tsx 의 trapFocus 와 같은 패턴. */
/* 템플릿 미리보기 모달 — 링크팜 카피. 작업 중 캔버스는 그대로 두고 **모달 안 폰**에
   템플릿을 그린다. 프로필(이름·사진)은 내 것, 블록·테마는 템플릿 것 — "내 페이지가
   이렇게 된다"가 보인다. 서버 호출은 「이 템플릿 적용」 때만. */
function TemplateModal({
  template,
  page,
  busy,
  error,
  onClose,
  onApply,
}: {
  template: LinkTemplate;
  page: LinkPageView;
  busy: boolean;
  /** 적용 실패 사유 — 페이지 위 배너는 스크림 뒤라 안 보인다(감사2 U6) */
  error?: string | null;
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
        onKeyDown={(e) => trapFocus(boxRef.current, e)}
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
          {error ? (
            <p role="alert" className="text-[12px] text-negative-strong">
              {error}
            </p>
          ) : (
            <p className="text-[12px] text-fg-sub">적용하면 지금 블록이 이 구성으로 바뀌어요. 작업 중인 화면은 닫기 전까지 그대로예요.</p>
          )}
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
      <div
        ref={boxRef}
        tabIndex={-1}
        onKeyDown={(e) => trapFocus(boxRef.current, e)}
        className="modal-card-in shadow-pop w-full max-w-xs rounded-card border border-line bg-body p-5 text-center outline-none"
      >
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
          {sns.map((s, i) => {
            const entry = SNS_CATALOG.find((c) => c.key === s.kind);
            return (
            <div key={i} className="flex items-center gap-1.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
                <SnsIcon kind={s.kind} className="size-4" />
              </span>
              {/* 90여 채널 — 그룹별 optgroup(리틀리 흡수 4단계) */}
              <select
                value={s.kind}
                onChange={(e) => onChange({ snsLinks: sns.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)) })}
                aria-label={`SNS ${i + 1} 종류`}
                className="h-10 w-[9.5rem] shrink-0 rounded-card border border-line bg-body px-2 text-[14px] text-fg focus:border-primary focus:outline-none"
              >
                {SNS_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {SNS_CATALOG.filter((c) => c.group === g).map((k) => (
                      <option key={k.key} value={k.key}>
                        {k.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <input
                value={s.url}
                onChange={(e) => onChange({ snsLinks: sns.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })}
                placeholder={entry?.placeholder ?? "https://…"}
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
            );
          })}
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
  /* 패널이 열려 있는 동안 전 글꼴을 비차단으로 싣는다 — 목록의 각 줄이 제 글꼴로 보인다 */
  useFontStylesheets(LINK_FONTS.flatMap((f) => fontStylesheets(f.key)));
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
                  /* color 인풋은 #rrggbb 만 받는다 — 8자리(알파) 프리셋 값은 검정으로 새니타이즈된다(감사 #14) */
                  value={(custom[c.key] ?? preset[c.key]).slice(0, 7)}
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
              /* 끝색 기본값은 배경에 강조색을 살짝 섞은 색 — 강조색 그대로면 기본·다크 프리셋에서 글자색과 같아 아래쪽 제목이 사라진다(감사2 U7) */
              onClick={() => onCustomChange({ bg2: custom.bg2 ? undefined : (preset.bg2 ?? mixHex(custom.bg ?? preset.bg, custom.accent ?? preset.accent, 0.22)) })}
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

        {/* 배경 이미지 필터 — 이미지가 있을 때만 의미 있다 */}
        {custom.bgImage ? (
          <div>
            <p className="text-[12px] font-medium text-fg-sub">배경 필터</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CUSTOM_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={(custom.bgFilter ?? "none") === f.key}
                  onClick={() => onCustomChange({ bgFilter: f.key })}
                  className={chip((custom.bgFilter ?? "none") === f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="text-[12px] font-medium text-fg-sub">글꼴</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {LINK_FONTS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={(custom.font ?? "sans") === f.key}
                onClick={() => onCustomChange({ font: f.key })}
                className={cn(
                  "trans-state flex items-center justify-between rounded-card border px-3 py-2 text-left text-[14px]",
                  (custom.font ?? "sans") === f.key ? "border-primary bg-primary/10 text-fg" : "border-line text-fg hover:bg-tint-hover",
                )}
              >
                {/* 견본만 그 글꼴 — 이름표는 앱 글꼴 그대로 */}
                <span style={{ fontFamily: f.family }}>안녕하세요</span>
                <span className="text-[11px] text-fg-sub">{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-fg-sub">버튼 액션 <span className="font-normal text-fg-faint">— 마우스를 올리면</span></p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CUSTOM_EFFECTS.map((f) => (
              <button key={f.key} type="button" aria-pressed={(custom.effect ?? "none") === f.key} onClick={() => onCustomChange({ effect: f.key })} className={chip((custom.effect ?? "none") === f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-fg-sub">그림자</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CUSTOM_SHADOWS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={(custom.shadow ?? (preset.shadow ? "soft" : "none")) === f.key}
                onClick={() => onCustomChange({ shadow: f.key })}
                className={chip((custom.shadow ?? (preset.shadow ? "soft" : "none")) === f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-fg-sub">스크롤 애니메이션 <span className="font-normal text-fg-faint">— 공개 페이지에서</span></p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CUSTOM_ANIMS.map((f) => (
              <button key={f.key} type="button" aria-pressed={(custom.anim ?? "none") === f.key} onClick={() => onCustomChange({ anim: f.key })} className={chip((custom.anim ?? "none") === f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[12px] font-medium text-fg-sub">PC 레이아웃 <span className="font-normal text-fg-faint">— 넓은 화면에서</span></p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {CUSTOM_DESKTOP.map((f) => (
              <button key={f.key} type="button" aria-pressed={(custom.desktop ?? "phone") === f.key} onClick={() => onCustomChange({ desktop: f.key })} className={chip((custom.desktop ?? "phone") === f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-[14px]">
            <Switch checked={!!custom.share} onChange={(v) => onCustomChange({ share: v ? true : undefined })} label="상단 공유 버튼" />
            상단 공유 버튼
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <Switch checked={custom.badge !== "hide"} onChange={(v) => onCustomChange({ badge: v ? undefined : "hide" })} label="핀치 배지" />
            핀치 배지
          </label>
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
              ...(stats.devices.length
                ? [[], ["기기", "조회수"], ...stats.devices.map((x) => [DEVICE_LABEL.get(x.device ?? "") ?? "알 수 없음", x.views] as Array<string | number>)]
                : []),
              ...(stats.referrers.length
                ? [[], ["유입 경로", "조회수"], ...stats.referrers.map((x) => [x.host ?? "직접 입력·앱 내부", x.views] as Array<string | number>)]
                : []),
              ...(stats.dwell.n > 0 ? [[], ["평균 체류(초)", Math.round(stats.dwell.avgMs / 1000)], ["체류 표본", stats.dwell.n]] : []),
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

      {/* 기기·리퍼러·체류(0058) — 리틀리 분석 탭 카피(5단계). 미적용 서버는 빈 배열이라 섹션이 안 나온다 */}
      {stats.devices.length > 0 || stats.dwell.n > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-card border border-line bg-plate px-3 py-2.5">
            <p className="text-[12px] text-fg-sub">기기</p>
            {stats.devices.length === 0 ? (
              <p className="mt-1 text-[14px] text-fg-sub">—</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {stats.devices.map((d) => {
                  const total = stats.devices.reduce((a, x) => a + x.views, 0);
                  const Icon = d.device === "desktop" ? Monitor : d.device === "tablet" ? Tablet : Smartphone;
                  return (
                    <li key={d.device ?? "unknown"} className="flex items-center justify-between gap-2 text-[14px]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {d.device ? <Icon className="size-3.5 text-fg-sub" aria-hidden /> : null}
                        {DEVICE_LABEL.get(d.device ?? "") ?? "알 수 없음"}
                      </span>
                      <span className="tnum font-semibold">{total > 0 ? `${Math.round((d.views / total) * 100)}%` : "—"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="rounded-card border border-line bg-plate px-3 py-2.5">
            <p className="text-[12px] text-fg-sub">평균 체류</p>
            <p className="tnum mt-1 text-[20px] font-bold leading-none">{stats.dwell.n > 0 ? dwellLabel(stats.dwell.avgMs) : "—"}</p>
            <p className="mt-1 text-[11px] text-fg-sub">{stats.dwell.n > 0 ? `방문 ${stats.dwell.n.toLocaleString("ko-KR")}건 기준` : "아직 측정된 방문이 없어요"}</p>
          </div>
        </div>
      ) : null}

      {stats.referrers.length > 0 ? (
        <div>
          <p className="text-[12px] font-medium text-fg-sub">유입 경로</p>
          <ul className="mt-1.5 space-y-1">
            {stats.referrers.map((x) => (
              <li key={x.host ?? "direct"} className="flex items-center justify-between gap-2 text-[14px]">
                <span className="min-w-0 truncate">{x.host ?? "직접 입력·앱 내부"}</span>
                <span className="tnum font-semibold">{x.views.toLocaleString("ko-KR")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-fg-sub">브라우저가 알려준 이전 페이지 주소(호스트만)예요. 인스타·카톡 앱 안에서 온 방문은 대개 「직접 입력·앱 내부」로 잡혀요.</p>
        </div>
      ) : null}

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
  busy,
  onPublishToggle,
  onSettings,
  onPassword,
  onDelete,
}: {
  page: LinkPageView;
  busy: boolean;
  onPublishToggle: (v: boolean) => void;
  onSettings: (patch: Partial<LinkPageSettings>) => void;
  onPassword: (pw: string | null, onDone?: () => void) => void;
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

      <PageSettingsForm page={page} busy={busy} onSettings={onSettings} onPassword={onPassword} />

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
   관리 패널 — 리틀리 「관리」 탭 카피(5단계): 문의·구독·방명록 한눈에
   ══════════════════════════════════════════════════════════════════ */

function ManagePanel({
  leads,
  leadCounts,
  leadsFailed = false,
  guestbook,
  busy,
  onGuestbookReply,
  onGuestbookHide,
  onGuestbookDelete,
  onExportLeads,
}: {
  leads: LinkLead[];
  leadCounts?: { contact: number; subscribe: number; guestbook: number };
  leadsFailed?: boolean;
  guestbook: LinkGuestbookEntry[];
  busy: boolean;
  onGuestbookReply: (id: number, reply: string) => void;
  onGuestbookHide: (id: number, hidden: boolean) => void;
  onGuestbookDelete: (id: number) => void;
  /** CSV — 화면의 50건이 아니라 **전체**를 서버에서 받아 내린다(감사 C13) */
  onExportLeads: () => void;
}) {
  /* 방명록 답글 작성 중인 글 id 와 초안 */
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "contact" | "subscribe">("all");
  const [openLead, setOpenLead] = useState<number | null>(null);
  const shownLeads = kindFilter === "all" ? leads : leads.filter((l) => l.kind === kindFilter);
  /* 카드는 총 건수(서버 count) — 없으면(데모) 목록을 센다 */
  const counts = {
    contact: leadCounts?.contact ?? leads.filter((l) => l.kind === "contact").length,
    subscribe: leadCounts?.subscribe ?? leads.filter((l) => l.kind === "subscribe").length,
    guestbook: leadCounts?.guestbook ?? guestbook.length,
    unreplied: guestbook.filter((g) => !g.reply && !g.hidden).length,
  };
  /* 날짜는 KST 로 — UTC ISO 를 10자 자르면 새벽 0~9시 접수가 전날로 보인다(감사3) */
  const dayOf = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/\.\s?/g, "-").replace(/-$/, "");

  return (
    <div className="space-y-4">
      <h3 className="text-[15px] font-bold">관리</h3>

      {/* 건수 요약 — 리틀리 관리 탭 상단 카드 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "문의", value: counts.contact },
          { label: "구독", value: counts.subscribe },
          { label: "방명록", value: counts.guestbook, sub: counts.unreplied ? `답글 없음 ${counts.unreplied}` : undefined },
        ].map((c) => (
          <div key={c.label} className="rounded-card border border-line bg-plate px-3 py-2.5">
            <p className="text-[12px] text-fg-sub">{c.label}</p>
            <p className="tnum mt-1 text-[20px] font-bold leading-none">{c.value.toLocaleString("ko-KR")}</p>
            {c.sub ? <p className="mt-1 text-[11px] text-primary-ink">{c.sub}</p> : null}
          </div>
        ))}
      </div>
      <p className="text-[12px] text-fg-sub">목록은 최근 50건만 보여요(숫자는 전체). 받은 내용 전체는 CSV 로 내려받을 수 있어요.</p>
      {leadsFailed ? (
        <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak px-3 py-2 text-[13px] text-negative-strong">
          받은 내용을 불러오지 못했어요 — 새로고침해 주세요. (아무도 안 보낸 게 아니라 조회가 실패한 거예요.)
        </p>
      ) : null}

      {/* 받은 내용 — 문의받기·구독신청 블록이 약속한 자리.
          이게 없으면 방문자가 남긴 게 어디로 갔는지 알 수 없다(편집기가 여기를 가리킨다). */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <p className="text-[12px] font-medium text-fg-sub">받은 내용</p>
            <div className="flex gap-1" role="group" aria-label="종류">
              {(
                [
                  ["all", "전체"],
                  ["contact", "문의"],
                  ["subscribe", "구독"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kindFilter === k}
                  onClick={() => setKindFilter(k)}
                  className={cn(
                    "trans-state rounded-chip px-2 py-0.5 text-[11px] font-semibold",
                    kindFilter === k ? "bg-primary text-on-primary" : "border border-line text-fg-sub hover:bg-tint-hover hover:text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {leads.length > 0 || leadsFailed || (leadCounts?.contact ?? 0) + (leadCounts?.subscribe ?? 0) > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={onExportLeads}
              className="trans-state rounded-chip border border-line px-2.5 py-1 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg disabled:opacity-50"
            >
              CSV (전체)
            </button>
          ) : null}
        </div>
        {shownLeads.length === 0 ? (
          <p className="mt-1.5 text-[14px] text-fg-sub">
            {leads.length === 0 ? "문의받기·구독신청 블록으로 들어온 내용이 여기에 쌓여요." : "이 종류로 들어온 내용이 아직 없어요."}
          </p>
        ) : (
          <ul className="mt-1.5 max-h-80 divide-y divide-line overflow-y-auto">
            {shownLeads.map((l) => {
              const open = openLead === l.id;
              return (
                <li key={l.id} className="py-2.5">
                  <button
                    type="button"
                    onClick={() => setOpenLead(open ? null : l.id)}
                    aria-expanded={open}
                    className="flex w-full flex-wrap items-center gap-2 text-left"
                  >
                    <span className="rounded-chip bg-plate px-2 py-0.5 text-[11px] font-semibold text-fg-sub">
                      {l.kind === "subscribe" ? "구독" : "문의"}
                    </span>
                    <span className="text-[14px] font-semibold">{l.name || l.email || l.phone || "(이름 없음)"}</span>
                    <span className="tnum ml-auto text-[12px] text-fg-sub">{dayOf(l.createdAt)}</span>
                    <ChevronDown className={cn("trans-state size-3.5 text-fg-faint", open && "rotate-180")} aria-hidden />
                  </button>
                  {l.email || l.phone ? (
                    <p className="mt-0.5 text-[12px] text-fg-sub">{[l.email, l.phone].filter(Boolean).join(" · ")}</p>
                  ) : null}
                  {l.message ? <p className={cn("mt-1 whitespace-pre-wrap text-[14px]", !open && "line-clamp-2")}>{l.message}</p> : null}
                  {open ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {l.email ? (
                        <a href={`mailto:${l.email}`} className="trans-state rounded-chip border border-line px-2.5 py-1 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg">
                          메일 보내기
                        </a>
                      ) : null}
                      {l.phone ? (
                        <a href={`tel:${l.phone}`} className="trans-state rounded-chip border border-line px-2.5 py-1 text-[12px] font-semibold text-fg-sub hover:bg-tint-hover hover:text-fg">
                          전화
                        </a>
                      ) : null}
                      <p className="tnum w-full text-[11px] text-fg-sub">접수 {new Date(l.createdAt).toLocaleString("ko-KR")}</p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 방명록 — 방문자 글에 답글·숨김·삭제(리틀리 「답글 및 삭제」 카피, 4단계) */}
      <div>
        <p className="text-[12px] font-medium text-fg-sub">방명록 {guestbook.length ? <span className="tnum">{guestbook.length}</span> : null}</p>
        {guestbook.length === 0 ? (
          <p className="mt-1.5 text-[14px] text-fg-sub">방명록 블록을 두면 방문자 글이 여기에 쌓여요. 답글을 달면 공개 페이지에 함께 보여요.</p>
        ) : (
          <ul className="mt-1.5 max-h-72 divide-y divide-line overflow-y-auto">
            {guestbook.map((g) => (
              <li key={g.id} className={cn("py-2.5", g.hidden && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold">{g.name}</span>
                  {g.hidden ? <span className="rounded-chip bg-plate px-2 py-0.5 text-[11px] font-semibold text-fg-sub">숨김</span> : null}
                  <span className="tnum ml-auto text-[12px] text-fg-sub">{dayOf(g.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[14px]">{g.message}</p>
                {g.reply ? <p className="mt-1 rounded-card bg-plate px-2.5 py-1.5 text-[13px] text-fg-sub">↳ {g.reply}</p> : null}
                {replyFor === g.id ? (
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      maxLength={500}
                      placeholder="답글"
                      aria-label="답글 내용"
                      className="h-9 min-w-0 flex-1 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg focus:border-primary focus:outline-none"
                    />
                    <Button size="sm" disabled={busy} onClick={() => { onGuestbookReply(g.id, replyDraft); setReplyFor(null); }}>
                      저장
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setReplyFor(null)}>
                      취소
                    </Button>
                  </div>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setReplyFor(g.id); setReplyDraft(g.reply ?? ""); }}>
                      {g.reply ? "답글 수정" : "답글"}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => onGuestbookHide(g.id, !g.hidden)}>
                      {g.hidden ? "다시 보이기" : "숨기기"}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => onGuestbookDelete(g.id)}>
                      삭제
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   페이지 설정 폼 — 리틀리 ⚙ 페이지 설정 모달 카피(5단계). 발행과 무관하게 즉시 적용
   ══════════════════════════════════════════════════════════════════ */

function PageSettingsForm({
  page,
  busy,
  onSettings,
  onPassword,
}: {
  page: LinkPageView;
  busy: boolean;
  onSettings: (patch: Partial<LinkPageSettings>) => void;
  onPassword: (pw: string | null, onDone?: () => void) => void;
}) {
  const st = page.settings;
  /* 텍스트 필드는 초안을 두고 blur/저장에서 확정 — 글자마다 서버 왕복을 돌리지 않는다 */
  type Staged = Pick<LinkPageSettings, "ogTitle" | "ogImage" | "favicon" | "lockMessage" | "ga4" | "metaPixel" | "tiktokPixel">;
  const stagedOf = (x: LinkPageSettings): Staged => ({
    ogTitle: x.ogTitle, ogImage: x.ogImage, favicon: x.favicon, lockMessage: x.lockMessage, ga4: x.ga4, metaPixel: x.metaPixel, tiktokPixel: x.tiktokPixel,
  });
  const [form, setForm] = useState<Staged>(() => stagedOf(st));
  const [pw, setPw] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  /* 서버 값이 바뀌면 **필드별** 3-way 병합 — 서버가 바꾼 필드는 받고, 사용자가 고친(미저장) 필드는 지킨다.
     통째로 덮으면 제목을 쓰다 「검색 노출」을 켜는 순간 쓰던 글이 사라진다(프로필 폼의 감사 #2 와 같은 버그, 소넷 5단계 #2) */
  const serverKey = stableJson(stagedOf(st));
  const [prevKey, setPrevKey] = useState(serverKey);
  const [prevServer, setPrevServer] = useState<Staged>(() => stagedOf(st));
  if (serverKey !== prevKey) {
    const next = stagedOf(st);
    const base = prevServer;
    setPrevKey(serverKey);
    setPrevServer(next);
    setForm((f) => {
      const out = { ...f };
      for (const k of Object.keys(next) as Array<keyof Staged>) {
        const changedOnServer = next[k] !== base[k];
        const userEdited = f[k] !== base[k];
        if (changedOnServer || !userEdited) out[k] = next[k];
      }
      return out;
    });
  }
  const { ogTitle, ogImage, favicon, lockMessage } = form;
  const setTracker = (k: "ga4" | "metaPixel" | "tiktokPixel", v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setOgTitle = (v: string) => setForm((f) => ({ ...f, ogTitle: v }));
  const setOgImage = (v: string) => setForm((f) => ({ ...f, ogImage: v }));
  const setFavicon = (v: string) => setForm((f) => ({ ...f, favicon: v }));
  const setLockMessage = (v: string) => setForm((f) => ({ ...f, lockMessage: v }));

  const input =
    "h-10 w-full rounded-card border border-line bg-body px-3 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";
  const label = "block text-[12px] font-medium text-fg-sub";
  const commit = (k: keyof LinkPageSettings, v: string) => {
    if (v.trim() === (st[k] as string)) return;
    onSettings({ [k]: v.trim() } as Partial<LinkPageSettings>);
  };

  return (
    <div className="space-y-4">
      <p className="text-[12px] font-medium text-fg-sub">페이지 설정</p>
      <p className="-mt-3 text-[12px] text-fg-sub">여기 값은 「라이브 반영」 없이 바로 적용돼요.</p>

      {/* 비밀번호 */}
      <div className="rounded-card border border-line bg-plate px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[14px] font-semibold">
              <Lock className="size-3.5 text-fg-sub" aria-hidden />
              {st.hasPassword ? "비밀번호로 잠겨 있어요" : "비밀번호 없음"}
            </p>
            <p className="mt-0.5 text-[12px] text-fg-sub">
              {st.hasPassword ? "방문자는 비밀번호를 넣어야 볼 수 있어요. 검색에도 안 잡혀요." : "걸어두면 아는 사람만 볼 수 있어요(4~32자)."}
            </p>
          </div>
          <div className="flex gap-1.5">
            {st.hasPassword ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onPassword(null)}>
                풀기
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setPwOpen((v) => !v)}>
              {st.hasPassword ? "바꾸기" : "걸기"}
            </Button>
          </div>
        </div>
        {pwOpen ? (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (pw.trim().length < 4) return;
              /* Enter 로 제출하면 안내 문구 칸의 blur 가 안 나온다 — 먼저 확정하고 비밀번호를 보낸다(감사3) */
              commit("lockMessage", lockMessage);
              onPassword(pw, () => {
                setPw("");
                setPwOpen(false);
              });
            }}
          >
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="새 비밀번호 (4~32자)"
              aria-label="새 비밀번호"
              autoComplete="new-password"
              minLength={4}
              maxLength={32}
              className={input}
            />
            <label className={label} htmlFor="ps-lockmsg">
              잠금 화면 안내 문구 (선택)
            </label>
            <input
              id="ps-lockmsg"
              value={lockMessage}
              onChange={(e) => setLockMessage(e.target.value)}
              onBlur={() => commit("lockMessage", lockMessage)}
              placeholder="예: 멤버십 회원에게 공유한 비밀번호를 넣어 주세요"
              maxLength={200}
              className={input}
            />
            <div className="flex gap-1.5">
              <Button size="sm" type="submit" disabled={busy || pw.trim().length < 4}>
                저장
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={() => { setPwOpen(false); setPw(""); }}>
                취소
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="ps-lang">
            페이지 언어
          </label>
          <select id="ps-lang" value={st.lang} disabled={busy} onChange={(e) => onSettings({ lang: e.target.value as LinkPageSettings["lang"] })} className={`mt-1.5 ${input}`}>
            {LINK_LANGS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-fg-sub">폼 라벨·버튼 같은 고정 문구가 바뀌어요. 내가 쓴 글은 그대로예요.</p>
        </div>
        <div>
          <label className={label} htmlFor="ps-target">
            링크 열기
          </label>
          <select id="ps-target" value={st.target} disabled={busy} onChange={(e) => onSettings({ target: e.target.value as LinkPageSettings["target"] })} className={`mt-1.5 ${input}`}>
            {LINK_TARGETS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-fg-sub">{LINK_TARGETS.find((t) => t.key === st.target)?.hint}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-plate px-4 py-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">검색·AI 노출</p>
          <p className="mt-0.5 text-[12px] text-fg-sub">{st.robots === "index" ? "구글·네이버·AI 검색이 이 페이지를 찾을 수 있어요." : "검색 결과에 나오지 않게 막아요(주소를 아는 사람만)."}</p>
        </div>
        <Switch checked={st.robots === "index"} onChange={(v) => onSettings({ robots: v ? "index" : "noindex" })} label="검색 노출" disabled={busy} />
      </div>

      {/* 공유 카드(OG) */}
      <div className="space-y-2">
        <div>
          <label className={label} htmlFor="ps-ogtitle">
            공유 카드 제목 (선택)
          </label>
          <input
            id="ps-ogtitle"
            value={ogTitle}
            onChange={(e) => setOgTitle(e.target.value)}
            onBlur={() => commit("ogTitle", ogTitle)}
            placeholder={page.seoTitle || page.title || "페이지 제목"}
            maxLength={80}
            className={`mt-1.5 ${input}`}
          />
          <p className="mt-1 text-[11px] text-fg-sub">카카오톡·인스타 DM 에 붙여 넣었을 때 보이는 제목. 비우면 SEO 제목 → 페이지 제목 순이에요.</p>
        </div>
        <ImageField
          label="공유 카드 이미지 (선택)"
          value={ogImage}
          onChange={(v) => {
            setOgImage(v);
            commit("ogImage", v);
          }}
          hint="비우면 커버 → 프로필 사진 순. 1200×630 비율이 가장 잘 맞아요."
          aspect="aspect-[1.91/1]"
        />
        <div>
          <label className={label} htmlFor="ps-favicon">
            파비콘 (선택)
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="ps-favicon"
              value={favicon}
              onChange={(e) => setFavicon(e.target.value)}
              onBlur={() => commit("favicon", favicon)}
              placeholder="이모지 하나 (예: 🐦) 또는 https 이미지 주소"
              maxLength={300}
              className={input}
            />
            {favicon && !/^https:/.test(favicon) ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-card border border-line bg-body text-[20px]" aria-hidden>
                {favicon}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-fg-sub">브라우저 탭에 뜨는 작은 아이콘. 비우면 핀치 기본 아이콘이에요.</p>
        </div>
      </div>

      {/* 마케팅 연결 — 리틀리 「마케팅 연결」 카피(6단계). 메타 광고 리타게팅 모수를 프로필 링크에서 쌓는다 */}
      <div className="space-y-2">
        <p className="text-[12px] font-medium text-fg-sub">마케팅 연결</p>
        <p className="-mt-1 text-[11px] text-fg-sub">ID 를 넣으면 공개 페이지에 해당 추적 코드가 실려요. 비우면 아무것도 실리지 않아요. 내 미리보기엔 싣지 않아요.</p>
        {(
          [
            ["ga4", "GA4 측정 ID", "G-XXXXXXXXXX"],
            ["metaPixel", "Meta 픽셀 ID", "1234567890123456"],
            ["tiktokPixel", "TikTok 픽셀 ID", "CXXXXXXXXXXXXXXXXX"],
          ] as const
        ).map(([k, lab, ph]) => (
          <div key={k}>
            <label className={label} htmlFor={`ps-${k}`}>
              {lab}
            </label>
            <input
              id={`ps-${k}`}
              value={form[k]}
              onChange={(e) => setTracker(k, e.target.value)}
              onBlur={() => commit(k, form[k])}
              placeholder={ph}
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              className={`mt-1.5 ${input} font-mono`}
            />
          </div>
        ))}
        <p className="text-[11px] text-fg-sub">방문자에게 추적 코드를 싣는 건 주인의 책임이에요 — 개인정보처리방침에 제3자 분석 도구 사용을 적어 두세요.</p>
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
