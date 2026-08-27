"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  CalendarClock,
  Clock,
  Copy as CopyIcon,
  Droplet,
  Ellipsis,
  GripVertical,
  Image as ImageIcon,
  Inbox,
  Loader2,
  AppWindow,
  ExternalLink,
  Monitor,
  MousePointerClick,
  Pencil,
  Percent,
  RotateCcw,
  Lock,
  LayoutGrid,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Star,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  Link2,
  Palette,
  PanelTop,
  PartyPopper,
  Plus,
  QrCode,
  Share2,
  Smartphone,
  Redo2,
  Rocket,
  Settings,
  Snowflake,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  User,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { trapFocus } from "@/components/ui/trap-focus";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { SnsIcon } from "@/components/sns-brand-icons";
import { DualLineChart } from "@/components/ui/charts";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { Switch } from "@/components/ui/switch";
import { FinchLoader } from "@/components/ui/finch-loader";
import { displayLinkUrl, normalizeSnsUrl, publicLinkUrl, SLUG_MESSAGES, stableJson, validateSlug } from "@/lib/links";
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
  CUSTOM_BUTTON_SCOPE,
  CUSTOM_TOPBAR,
  CUSTOM_LOGO_POS,
  CUSTOM_CURSORS,
  CUSTOM_SCREEN_FX,
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
  contrastRatio,
  cursorCss,
  cursorImage,
  mixHex,
  sanitizeThemeCustom,
  themeByKey,
  themeVars,
  type LinkThemeCustom,
} from "@/lib/links/themes";
import { LINK_TEMPLATES, type LinkTemplate } from "@/lib/links/templates";
import {
  addBlock,
  addBlocksBulk,
  applyTemplate,
  createLinkPage,
  createLinkSubpage,
  revertLinkDraft,
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
  changeSlug,
  checkSlugAvailable,
  replyGuestbook,
  setGuestbookHidden,
  deleteGuestbook,
  updateLinkSettings,
  setLinkPassword,
  exportLeads,
} from "../actions";
import { LINK_LANGS, LINK_TARGETS, type LinkPageSettings } from "@/lib/links/settings";
import type { LinkGuestbookEntry, LinkLead, LinkPageSummary, LinkPageView, LinkSnapshotView, LinkStats } from "@/lib/links/types";
import { BlockEditor, EDITOR_TITLE_ID } from "./block-editor";
import { ImageField } from "./image-field";
import { PickCards, PickChips } from "./option-picker";
import { DateTimePickerField } from "./date-field";
import { ImportLinks, ImportLinksBody } from "./import-links";
import { BLOCK_ICON } from "./block-icons";
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

/* 편집 보조 패널 — 프로필 행 펼침 · 블록 카탈로그 모달 */
type Drawer = "profile" | "add";

/* 상단 탭 5개 — 리틀리와 같은 정보 구조(2026-08-23 사장님 지시 "페이지·디자인·분석·관리·마케팅 깔끔하게").
   페이지 설정(주소·공개·비밀번호·언어·OG·파비콘·삭제)은 ⚙ 모달. */
type Tab = "page" | "design" | "analytics" | "manage" | "marketing";
const TABS: Array<{ key: Tab; label: string; icon: typeof User }> = [
  { key: "page", label: "페이지", icon: LayoutGrid },
  { key: "design", label: "디자인", icon: Palette },
  { key: "analytics", label: "분석", icon: BarChart3 },
  { key: "manage", label: "관리", icon: Inbox },
  { key: "marketing", label: "마케팅", icon: Megaphone },
];

/* 상단 도구 칩 — 링크팜 실측 순서(2026-08-20 캔버스 개편). 칩은 우측 드로어를
   여닫고, 캔버스(폰)는 항상 보인다. 블록 목록 패널은 없다 — 캔버스가 목록이다. */
const SNS_GROUPS = [...new Set(SNS_CATALOG.map((c) => c.group))];



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
  guestbookFailed = false,
  guestbook = [],
  isDemo,
  loadFailed = false,
  pages = [],
  pageLimit = { used: 0, max: 1 },
  paid = false,
  multiReady = false,
}: {
  page: LinkPageView | null;
  /** 내 페이지 전부(멀티·서브, 0060) — 전환 드롭다운용 */
  pages?: LinkPageSummary[];
  pageLimit?: { used: number; max: number };
  /** 유료 플랜 여부 — 배지 숨김·내 로고 게이트(2026-08-26) */
  paid?: boolean;
  multiReady?: boolean;
  blocks: LinkBlock[];
  snapshot: LinkSnapshotView | null;
  origin: string;
  stats: LinkStats;
  leads: LinkLead[];
  leadCounts?: { contact: number; subscribe: number; guestbook: number };
  leadsFailed?: boolean;
  guestbookFailed?: boolean;
  /** 방명록(0057) — 주인용 목록, 숨김 포함 */
  guestbook?: LinkGuestbookEntry[];
  isDemo: boolean;
  /** 조회 자체가 실패 — "없음"이 아니다(감사 #10·#11). 생성 폼 대신 재시도 화면 */
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  /* 기간 이동 전용 — 저장(busy)과 신호를 섞지 않는다. 섞으면 발행 중에 분석 숫자가 흐려진다 */
  const [rangePending, startRangeNav] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [tab, setTab] = useState<Tab>("page");
  const [settingsOpen, setSettingsOpen] = useState(false);
  /* 멀티·서브 페이지(0060) — 만들기 모달 */
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newSubOpen, setNewSubOpen] = useState(false);
  /* "저장(라이브 반영)하지 않으면 남지 않는다"(2026-08-24 사장님 지시) —
     발행본과 다른 초안이 있는 채로 나가면 모달로 한 번 묻고, 그래도 나가면 초안을 버린다. */
  const [revertOpen, setRevertOpen] = useState(false);
  /* 지우기 확인 — 이 앱의 다른 파괴적 확인은 전부 모달인데 여기 둘만 native confirm 이었다.
     OS 대화상자는 테마·글꼴·문구 위계가 없고, 모바일에서는 주소창 아래 붙어 어느 화면 것인지도 흐리다 */
  const [confirming, setConfirming] = useState<{ title: string; description: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  /* 발행본과 다른 초안이 서버에 있는가 = "지금 나가면 잃을 것이 있는가".
     발행한 적 있으면 dirty 그대로, 없으면 **블록이 있을 때만** — 안 그러면 빈 페이지에서도
     dirty(=!publishedAt) 가 참이라 되돌릴 것도 없는데 경고가 계속 뜬다. */
  const publishDirty = page ? (page.publishedAt ? page.dirty : blocks.length > 0) : false;
  /* 서브 페이지의 **표준 공유 주소**(/p/{부모}/{sub}) — 상단 바·링크 열기·마케팅 탭·QR 이
     전부 같은 주소를 말해야 한다. 흩어 계산하면 탭마다 다른 주소가 보인다(소넷 확정). */
  const shareUrl = (() => {
    if (!page) return "";
    const me = pages.find((p) => p.id === page.id);
    const parentSlug = me?.parentId ? pages.find((p) => p.id === me.parentId)?.slug : null;
    return parentSlug && me?.subSlug ? `${origin}/${parentSlug}/${me.subSlug}` : publicLinkUrl(page.slug, origin);
  })();
  const [editingId, setEditingId] = useState<string | null>(null);
  /* 지금 서버에 추가 중인 블록 타입 — 카탈로그의 눌린 카드가 스피너를 문다.
     전역 busy 베일은 모달이 열려 있으면 접히므로(아래 베일 조건), 모달 안 진행 표시는
     이 값이 유일하다(2026-08-26 사장님 지적: 눌러도 로딩이 안 보인다). */
  const [addingType, setAddingType] = useState<BlockType | null>(null);
  /* 최초 「주소 정하기」(2026-08-26 사장님 결정) — slugSetAt 이 null(무작위 주소 그대로)이면
     빌더 진입에서 모달을 먼저 띄운다. undefined 는 0067 미적용(기능 꺼짐), 데모는 안 띄운다.
     「나중에」로 닫으면 이번 방문 동안은 조용하고, 다음 진입에 다시 묻는다 — 권한은 계속 남아 있다. */
  const [slugSetup, setSlugSetup] = useState<boolean>(() => !isDemo && !!page && page.slugSetAt === null);
  /* 토스트 — 「블록을 추가했어요」와 「클릭이 삼켜졌어요」가 같은 회색이면 성공과 거절이 구분되지 않는다.
     배경은 두 갈래 모두 불투명 bg-overlay 를 유지하고(반투명이면 베일이 비쳐 읽기가 무너진다)
     테두리·아이콘으로 톤을 가른다 */
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const toast = (text: string, tone: "ok" | "warn" = "ok") => setNotice({ text, tone });
  /* 토스트는 4초 뒤 내려간다 — 같은 문구가 연달아 오면 타이머만 다시 돈다 */
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);
  /* 템플릿 스트립 접기 — 링크팜의 「템플릿 적용하기 ^」 상시 스트립 카피 */
  const [tplOpen, setTplOpen] = useState(true);
  /* 유료 게이트 모달(2026-08-26) — 배지 숨김·내 로고·미리보기 알약 × 가 연다 */
  const [upgradeOpen, setUpgradeOpen] = useState(false);
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
  /* ── 실시간 저장(2026-08-26 사장님 지시: «당연히 실시간 저장해놔야지») ──
     입력이 멎으면 0.8초 뒤 조용히 저장한다 — run() 의 전역 busy 를 쓰지 않는 별도 체인이라
     화면이 저장마다 잠기지 않는다. 블록을 갈아타면(leaveEditor) 기다리지 않고 즉시 저장한다. */
  const autosaveChain = useRef<Promise<unknown>>(Promise.resolve());
  const [autoSaving, setAutoSaving] = useState(false);
  /* 렌더 중 ref 쓰기 금지(react-hooks/refs) — 미러는 effect 에서 */
  const draftRef = useRef(draft);
  const editingIdRef = useRef(editingId);
  const baselineRef = useRef(baseline);
  useEffect(() => {
    draftRef.current = draft;
    editingIdRef.current = editingId;
    baselineRef.current = baseline;
    flushDraftRef.current = flushDraft;
  });
  /* 마지막으로 저장에 성공한 값 — 다음 자동 저장의 undo 원본(서버 직전 값)이 된다 */
  const lastSavedRef = useRef<{ id: string; data: Record<string, unknown> } | null>(null);
  const flushDraftRef = useRef<(id: string, data: Record<string, unknown>) => void>(() => {});
  /* 언마운트 플러시(쏘넷 점검 high) — 디바운스 0.8초 창 안에서 사이드바로 나가거나 페이지를
     갈아타면 cleanup 이 타이머만 지우고 입력이 사라진다. 앱 안 이동은 런타임이 살아 있어
     fire-and-forget 저장이 끝까지 간다. */
  useEffect(() => {
    return () => {
      const id = editingIdRef.current;
      if (id && !isDemo && stableJson(draftRef.current) !== baselineRef.current) {
        flushDraftRef.current(id, draftRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 언마운트 전용, ref 만 읽는다
  }, []);
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
  /* 방금 자동 저장으로 보낸 값(새니타이즈 후) — 그 값이 서버에서 돌아왔을 때
     그 사이의 편집을 덮지 않기 위한 비교 기준 */
  const lastSentCustom = useRef<string | null>(null);
  if (customServerKey !== prevCustomKey) {
    setPrevCustomKey(customServerKey);
    /* 우리가 보낸 값이 돌아온 것이고 그 사이 더 편집했다면 폼을 덮지 않는다 — 다음 자동 저장이 따라잡는다 */
    if (!(lastSentCustom.current === customServerKey && stableJson(customForm) !== customServerKey)) {
      setCustomForm(page?.themeCustom ?? {});
    }
  }
  const customDirty = stableJson(customForm) !== customServerKey;
  /* 마지막 「꾸미기 저장」이 실패했는가 — customDirty 만 보면 실패해서 되돌아온 상태를
     «저장됨 / 모두 저장됐어요» 라고 말한다. 실제로 빨간 배너와 「저장됨」 칩이 한 화면에
     같이 떠 있었다(실측). 성공하면 dirty 가 풀리므로 이 값은 다음 저장에서 덮인다. */
  const [customSaveFailed, setCustomSaveFailed] = useState(false);
  /* 미저장 편집이 있으면 창 닫기·새로고침에 브라우저 확인을 띄운다 — 탭 이동 관문(leaveEditor)과
     같은 결함 클래스가 라우트 경계에 열려 있었다(감사4). 앱 내부 사이드바 이동 인터셉트는
     전역 내비 구조 변경이 필요해 여기선 브라우저 경계만 지킨다. */
  const anyDirty = editorDirty || profileDirty || customDirty;
  /* 나가기 가드·초안 자동 폐기(비콘)·앵커 가로채기는 2026-08-26 실시간 저장 전환으로 제거 —
     입력은 저절로 저장되고 발행본에는 저절로 반영되므로 «나가면 사라지는 것»이 없다.
     수동 「편집 되돌리기」(revertLinkDraft)만 남긴다. */
  function patchCustom(patch: Partial<LinkThemeCustom>) {
    setCustomForm((f) => {
      const next: Record<string, unknown> = { ...f, ...patch };
      /* undefined 는 "지워라" — 프리셋 값으로 되돌리는 수단 */
      for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete next[k];
      return next as LinkThemeCustom;
    });
  }
  /* 꾸미기 실시간 저장(2026-08-27 «꾸미기 저장 왜 눌러야 반영되냐») — 블록 autosaveChain 과
     같은 문법의 **전용 체인**. run() 은 전역 busy 베일로 화면을 잠그고 겹치면 호출을 삼키므로
     여기 쓰면 안 된다(쏘넷 점검 high — 블록 자동 저장이 run() 을 안 쓰는 이유와 동일).
     0.8초 조용하면 보낸다. 실패는 5초 간격으로 **계속** 재시도 — 횟수 상한을 두면 일시 장애
     (첫 진입 503 등 ~10초 hiccup) 뒤 영구 정지가 된다(쏘넷 점검 high). */
  const customChain = useRef<Promise<unknown>>(Promise.resolve());
  const [customSaving, setCustomSaving] = useState(false);
  const [customFailTick, setCustomFailTick] = useState(0);
  const customFormKey = stableJson(customForm);
  /* 자유 입력 주소(bgImage·logoImage)가 관문을 못 넘는 동안은 보류 — 패널 상태칩이
     «저장 중» 대신 진짜 이유를 말한다(쏘넷 점검: 조용한 보류는 유실로 읽힌다) */
  const customClean = sanitizeThemeCustom(customForm);
  const customHold = !!((customForm.bgImage && !customClean?.bgImage) || (customForm.logoImage && !customClean?.logoImage));
  useEffect(() => {
    if (!page || isDemo || !customDirty) return;
    const payload = customForm;
    const clean = sanitizeThemeCustom(payload);
    if ((payload.bgImage && !clean?.bgImage) || (payload.logoImage && !clean?.logoImage)) return;
    const timer = window.setTimeout(() => {
      lastSentCustom.current = stableJson(clean ?? {});
      setCustomSaving(true);
      customChain.current = customChain.current
        .catch(() => {})
        .then(() => updateLinkThemeCustom(payload, page.id))
        .then(
          (res) => {
            if (res.ok) setCustomSaveFailed(false);
            else {
              setCustomSaveFailed(true);
              setCustomFailTick((t) => t + 1);
            }
          },
          () => {
            setCustomSaveFailed(true);
            setCustomFailTick((t) => t + 1);
          },
        )
        .finally(() => setCustomSaving(false));
    }, customSaveFailed ? 5000 : 800);
    return () => window.clearTimeout(timer);
    /* customFormKey 가 내용 변화를 대표한다 — customForm 객체 자체는 렌더마다 새것 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customDirty, customFormKey, customServerKey, customFailTick, isDemo]);
  /* 언마운트 플러시 — 디바운스 창·보류 중 사이드바로 나가면 마지막 꾸미기가 사라진다(쏘넷 점검).
     관문에 걸린 주소만 빼고(clean) 보낸다 — 색·버튼 등 유효한 편집은 살린다. */
  const customFlushRef = useRef<() => void>(() => {});
  useEffect(() => {
    customFlushRef.current = () => {
      if (!page || isDemo || !customDirty) return;
      void updateLinkThemeCustom(sanitizeThemeCustom(customForm) ?? {}, page.id).catch(() => {});
    };
  });
  useEffect(() => {
    return () => customFlushRef.current();
  }, []);
  /* 추가한 블록으로 화면 이동(2026-08-27 지시 «추가하면 바로 내용 넣게») — 새 블록은 목록
     맨 아래라 편집기가 열려도 화면 밖이었다. 행은 서버 목록이 도착해야 생기므로,
     생기는 순간 한 번만 스크롤하고 편집기 제목에 포커스를 준다. */
  const scrollToBlockRef = useRef<string | null>(null);
  useEffect(() => {
    const id = scrollToBlockRef.current;
    if (!id) return;
    const el = document.getElementById(`blk-${id}`);
    if (!el) return;
    scrollToBlockRef.current = null;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    /* 첫 입력칸에 포커스 — 편집기 제목(H3)에 주면 «바로 타이핑»이 안 된다(2026-08-27 실계정 점검).
       입력칸이 없는 블록(구분선 등)은 제목으로 폴백해 스크린리더 문맥은 유지한다. */
    requestAnimationFrame(() => {
      const first = el.querySelector<HTMLElement>('input:not([type="hidden"]):not([type="file"]):not([type="color"]), textarea');
      (first ?? document.getElementById(EDITOR_TITLE_ID))?.focus({ preventScroll: true });
    });
  }, [blocks]);
  /* 창 닫기·새로고침 — 저장이 미처 못 나간 순간만 브라우저 기본 경고를 건다(쏘넷 점검 high).
     블록 초안뿐 아니라 꾸미기 레인(디바운스·왕복·재시도·주소 보류)도 지킨다. */
  useEffect(() => {
    if (isDemo || (!editorDirty && !autoSaving && !customDirty && !customSaving)) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editorDirty, autoSaving, customDirty, customSaving, isDemo]);
  /* 통계 — 편집 탭이 아니라 상단 바에서 여닫는다("만드는 창에 통계가 왜 있냐",
     2026-08-20). 만들기와 성과 보기는 다른 일이다 — 링크팜도 통계는 빌더 밖이다. */


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
      toast("앞선 작업을 처리하는 중이에요. 잠시 후 다시 눌러 주세요.", "warn");
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
      toast(`되돌렸어요: ${entry.label}`);
    });
  }

  function performRedo() {
    const entry = redoStack[redoStack.length - 1];
    if (!entry) return;
    run(entry.redo, () => {
      setRedoStack((s) => s.filter((e) => e !== entry));
      setUndoStack((s) => [...s, entry]);
      toast(`다시 실행했어요: ${entry.label}`);
    });
  }

  /** 상단 탭 — 편집 중이면 나가기 관문을 지난다. 탭을 바꾸면 블록 편집·보조 패널은 닫힌다 */
  function switchTab(next: Tab) {
    if (next === tab) return;
    if (!leaveEditor()) return;
    setEditingId(null);
    setDrawer(null);
    setError(null);
    setTab(next);
  }

  /** 보조 패널 열기 — 같은 것을 다시 누르면 닫힌다(forceOpen 은 토글 없이 연다). 페이지 탭으로 돌아온다 */
  function openDrawer(key: Drawer, forceOpen = false) {
    if (tab !== "page") setTab("page");
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
    /* 확인창을 띄우지 않는다(2026-08-26) — 고치다 만 값은 그 자리에서 저장하고 나간다.
       실패해도 초안은 draft 상태로 남고 자동 저장 오류 안내가 뜬다. */
    if (editorDirty && editingId && !isDemo) flushDraft(editingId, draft);
    return true;
  }

  /** 초안을 지금 저장한다 — 디바운스 타이머와 갈아타기(leaveEditor)가 같은 길을 쓴다.
      attempt: 전송 계층 실패(첫 진입 직후엔 사이드바 프리페치 폭주로 Vercel 이 첫 POST 를
      503 으로 미는 것을 실계정 실측으로 확인, 2026-08-26) 시 1.5·3초 뒤 자동 재시도 — 최대 2회.
      사용자가 그 사이 더 입력했으면 재시도 대신 디바운스가 최신값을 저장한다. */
  function flushDraft(id: string, data: Record<string, unknown>, attempt = 0) {
    const type = blocks.find((b) => b.id === id)?.type ?? "link";
    const serverData = blocks.find((b) => b.id === id)?.data ?? {};
    setAutoSaving(true);
    autosaveChain.current = autosaveChain.current
      /* 앞선 저장이 던졌어도(네트워크 등) 체인을 살린다 — 여길 안 잡으면 거부된 프라미스에
         .then 이 계속 붙어 **그 뒤 모든 자동 저장이 조용히 무시**된다(2026-08-26 신고 원인 후보) */
      .catch(() => {})
      .then(async () => {
        /* undo 원본은 **실행 직전**에 읽는다(쏘넷 점검) — 앞선 저장이 끝나야 lastSavedRef 가
           맞다. 같은 값이 이미 저장돼 있으면(디바운스+갈아타기 이중 호출) 통째로 건너뛴다. */
        const prev = lastSavedRef.current?.id === id ? lastSavedRef.current.data : serverData;
        if (stableJson(prev) === stableJson(data)) {
          if (editingIdRef.current === id && stableJson(draftRef.current) === stableJson(data)) {
            setBaseline(stableJson(data));
          }
          return;
        }
        const res = await updateBlock(id, { data });
        if (!res.ok) {
          setError(res.error ?? "자동 저장하지 못했어요 — 잠시 후 다시 저장돼요.");
          return;
        }
        lastSavedRef.current = { id, data };
        /* 그 사이 더 입력했으면 기준선을 옮기지 않는다 — 다음 디바운스가 마저 저장한다 */
        if (editingIdRef.current === id && stableJson(draftRef.current) === stableJson(data)) {
          setBaseline(stableJson(data));
        }
        record({
          label: `${blockSummary(type, data)} 내용 저장`,
          undo: () => updateBlock(resolveId(id), { data: prev }),
          redo: () => updateBlock(resolveId(id), { data }),
        });
      })
      .catch(() => {
        if (attempt < 2) {
          window.setTimeout(() => {
            /* 그 사이 입력이 갔거나 편집 대상이 바뀌었으면 디바운스/갈아타기 저장이 담당한다 */
            if (editingIdRef.current === id && stableJson(draftRef.current) === stableJson(data)) {
              flushDraft(id, data, attempt + 1);
            }
          }, 1500 * (attempt + 1));
          return;
        }
        setError("자동 저장하지 못했어요 — 네트워크를 확인해 주세요. 잠시 뒤 다시 저장돼요.");
      })
      .finally(() => setAutoSaving(false));
  }

  /* 디바운스 — 입력이 멎고 0.8초. 값이 또 바뀌면 타이머가 새로 선다 */
  useEffect(() => {
    if (isDemo || !editingId || !editorDirty) return;
    const id = editingId;
    const data = draft;
    const t = window.setTimeout(() => flushDraft(id, data), 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flushDraft 는 ref·안정 setter 만 쓴다
  }, [draft, editingId, editorDirty, isDemo]);

  /* ── 자동 라이브 반영(2026-08-26: «라이브 반영은 처음 1회만») ──
     최초 발행은 사람이 「라이브 시작」으로 하고, 그 뒤부터는 초안이 바뀌면 2초 뒤
     자동으로 공개 스냅샷에 반영한다 — 링크인바이오 표준(편집 즉시 라이브). */
  const publishInFlight = useRef(false);
  const publishFails = useRef(0);
  const [autoPublishing, setAutoPublishing] = useState(false);
  useEffect(() => {
    if (isDemo || !page || !page.publishedAt || !page.dirty || publishInFlight.current) return;
    /* 연속 실패 5회면 멈춘다 — 구조적 실패에 2초 간격 무한 재시도로 서버를 두드리지 않는다(쏘넷 점검).
       실패 횟수만큼 간격도 지수로 벌린다. 성공하면 리셋. */
    if (publishFails.current >= 5) return;
    const id = page.id;
    const delay = 2000 * Math.pow(2, Math.min(publishFails.current, 4));
    const t = window.setTimeout(() => {
      publishInFlight.current = true;
      setAutoPublishing(true);
      void publishLinkPage(id)
        .then((res) => {
          if (!res.ok) {
            publishFails.current += 1;
            setError(
              publishFails.current >= 5
                ? "자동 반영이 계속 실패했어요 — 화면을 새로고침한 뒤 다시 시도해 주세요."
                : (res.error ?? "자동 반영하지 못했어요 — 잠시 후 다시 시도돼요."),
            );
          } else {
            publishFails.current = 0;
          }
        })
        .finally(() => {
          publishInFlight.current = false;
          setAutoPublishing(false);
          /* page prop 이 새로 와야 dirty 판정이 풀린다 — 남은 변경이 있으면 이 효과가 다시 돈다 */
          startTransition(() => router.refresh());
        });
    }, delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- page 객체 identity 가 refresh 마다 갱신돼 재평가된다
  }, [page, isDemo]);

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
            () => toast("페이지를 만들었어요. 주소는 「프로필」 탭에서 바꿀 수 있어요."),
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
  /* 블록 추가 한 곳 — 카탈로그 모달·빈 캔버스 빠른 추가·목록 빈 상태가 같은 경로를 쓴다
     (실행취소 기록·토스트가 세 곳에서 갈라지면 반드시 한쪽이 빠진다) */
  const addBlockOfType = (t: BlockType) => {
    setAddingType(t);
    run(
      () => addBlock(t, page!.id),
      (res) => {
        setAddingType(null);
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
              const r = await restoreBlock(payload, page!.id);
              if (r.ok && r.id) idAlias.current.set(resolveId(addedId), r.id);
              return r;
            },
          });

          /* ── 추가 즉시 편집 준비 (2026-08-26 사장님 지적: "적용됐으면 모달 꺼지고
             그 추가한 블록 수정할 수 있게 바로 딱 준비해줘야지") ──
             모달을 닫고 새 블록의 편집기를 연다. 예전엔 모달이 열린 채 토스트만 그 뒤에서
             울렸고, 사용자는 모달을 닫고 캔버스에서 새 블록을 찾아 다시 눌러야 했다.

             단 **다른 블록을 고치다 만 상태(dirty)** 면 그 편집을 버리지 않는다 — 모달만
             닫고 안내한다(leaveEditor 의 확인창을 여기서 띄우면 추가 완료 순간에 뜬금없는
             경고가 된다). */
          setDrawer(null);
          if (editorDirty) {
            toast("블록을 추가했어요 — 지금 고치는 블록을 마친 뒤 캔버스에서 눌러 편집할 수 있어요.");
          } else {
            const seed = defaultBlockData(t);
            setDraft(seed);
            setBaseline(stableJson(seed));
            /* 서버 목록에 새 블록이 실려 오기 전까지 editingServer 는 없다("__gone__") —
               위 reconcile 가드가 그걸 «블록이 사라졌다»로 읽고 편집기를 도로 닫는다.
               기준키를 미리 맞춰 가드를 지나가게 하고, 목록이 도착하면 dirty 가 아닌 한
               서버값으로 동기화된다(가드의 else-if 분기). */
            setPrevEditingKey("__gone__");
            setEditingId(addedId);
            setError(null);
            /* 행이 아직 없다 — 서버 목록이 도착해 행이 생기면 위 이펙트가 스크롤·포커스한다 */
            scrollToBlockRef.current = addedId;
            toast("블록을 추가했어요 — 바로 고쳐 보세요.");
          }
        } else {
          toast("블록을 추가했어요. 캔버스의 블록을 누르면 바로 고칠 수 있어요.");
        }
      },
      () => setAddingType(null),
    );
  };

  const canvasEditHead: Omit<CanvasEdit, "onProfileCommit"> = {
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
          toast(
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
        chained(() => moveBlock(id, dir, page.id)),
        () => {
          toast(`${label} 블록을 ${dir === "up" ? "위로" : "아래로"} 옮겼어요.`);
          /* 한계(소넷 확정 3, 수용): 역연산은 "그때의 이웃"이 아니라 실행
             시점의 이웃과 스왑한다(moveBlock 이 현재 목록을 다시 읽는다).
             사이에 다른 이동이 끼면 원래 배치 복원이 아니라 한 칸 이동을
             무를 뿐이다 — 순서는 늘 정의돼 있어(sort_order,created_at) 안전. */
          record({
            label: `${label} 이동`,
            /* 실행 시점에 id 를 푼다 — 삭제→복원 뒤 옛 id 로 부르면 이 엔트리가 영원히 실패해 이력이 막힌다(감사 C7) */
            undo: chained(() => moveBlock(resolveId(id), dir === "up" ? "down" : "up", page.id)),
            redo: chained(() => moveBlock(resolveId(id), dir, page.id)),
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
        chained(() => reorderBlock(dragId, beforeId, page.id)),
        undefined,
        () =>
          /* 한계(이동 undo 와 같은 수용, 소넷 확정 4): undo 좌표(origBefore)는
             드래그 시점 스냅샷이다. 그 블록이 그 사이 삭제되면 undo 는
             "화면을 새로고침해 주세요"로 명시적으로 실패하고 엔트리는
             스택에 남는다 — 데이터는 안 다치고, 다른 조작이 이력을 밀어낸다. */
          record({
            label: `${label} 이동`,
            undo: chained(() => reorderBlock(resolveId(dragId), origBefore === null ? null : resolveId(origBefore), page.id)),
            redo: chained(() => reorderBlock(resolveId(dragId), beforeId === null ? null : resolveId(beforeId), page.id)),
          }),
      );
    },
    onDelete: (id, label) => {
      /* 삭제는 물리 삭제 — 확인을 받은 뒤 지우고, 직전 1건은 실행취소가 복원한다 */
      setConfirming({
        title: "블록을 삭제할까요?",
        description: `「${label}」 블록이 지워져요. 직전 1건은 상단 ↩ 실행취소로 되살릴 수 있어요.`,
        confirmLabel: "삭제",
        onConfirm: () => deleteBlockNow(id, label),
      });
    },
    onAdd: () => openDrawer("add", true),
    onQuickAdd: (t) => addBlockOfType(t),
    onOpenProfile: () => openDrawer("profile", true),
  };

  /* 확인을 받은 뒤의 실제 삭제 — onDelete 에서 떼어냈다(모달의 확인 버튼이 부른다) */
  function deleteBlockNow(id: string, label: string) {
    /* 함수 선언이라 위쪽 `if (!page)` 가드의 좁히기가 여기까진 오지 않는다 */
    if (!page) return;
    const b = blocks.find((x) => x.id === id);
    /* 지우려는 블록을 고치던 중이면 보류 중인 자동 저장을 끊는다(쏘넷 점검 high) —
       편집 상태를 비우면 디바운스 cleanup 이 타이머를 지우고, 언마운트 플러시도 안 돈다.
       지우는 마당에 마지막 타이핑을 저장할 이유가 없다. */
    if (editingId === id) {
      setEditingId(null);
      setDraft({});
      setBaseline("");
    }
    /* 복원 원본은 **마지막으로 저장에 성공한 값** — 자동 저장이 삭제 직전에 성공했으면
       클릭 시점의 blocks 클로저(b.data)는 이미 낡았다(쏘넷 점검 high) */
    const restoreData = lastSavedRef.current?.id === id ? lastSavedRef.current.data : b?.data;
    run(
        () => deleteBlock(id),
        () => {
          if (b) {
            /* 복원 경로는 전역 실행취소 **하나**다 — 인라인 되돌리기 바와
               이중으로 기록하면 같은 블록이 두 번 복원된다(소넷 확정 1). */
            const payload = { type: b.type, data: restoreData ?? b.data, sortOrder: b.sortOrder, active: b.active };
            /* 복원은 **새 행**을 만든다 — 다시실행(재삭제)은 그 새 id 를
               지워야 하므로 클로저 변수로 따라간다 */
            record({
              label: `${label} 삭제`,
              undo: async () => {
                const r = await restoreBlock(payload, page.id);
                /* 옛 id → 새 id 별칭 — 이 블록을 가리키던 모든 엔트리가 새 행을 따라간다 */
                if (r.ok && r.id) idAlias.current.set(resolveId(id), r.id);
                return r;
              },
              redo: () => deleteBlock(resolveId(id)),
            });
          }
          toast("블록을 삭제했어요. 상단 ↩ 실행취소로 복원할 수 있어요.");
        },
      );
  }

  /* 삭제 확인 모달이 중간에 끼어 함수 선언(deleteBlockNow)이 필요해 두 조각으로 나뉜다 — 여기서 합친다 */
  const canvasEdit: CanvasEdit = {
    /* 미리보기 알약의 × — 지우려면 유료(리틀리와 같은 문법) */
    onUpgrade: paid ? undefined : () => setUpgradeOpen(true),
    ...canvasEditHead,
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
        () => updateLinkProfile({ ...profileFormFrom(page), ...patch }, page.id),
        () => setProfileForm((f) => ({ ...f, ...before })),
      );
    },
  };

  /* ── 상단 바 2행(이력) ── */
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
                toast(openAt || closeAt ? "예약을 저장했어요 — 공개 페이지가 날짜에 맞춰 보이거나 숨겨요." : "예약을 해제했어요.");
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
              () => applyTemplate(t.key, page.id),
              () => {
                clearHistory();
                setTplPreview(null);
                toast(`「${t.name}」 템플릿을 적용했어요.`);
              },
            );
          }}
        />
      ) : null}

      {/* 최초 「주소 정하기」 — 무작위 주소(6kt139hq 류)를 정식 주소로. 30일 쿨다운의 시작점 */}
      {slugSetup && page ? (
        <SlugSetupModal
          busy={busy}
          error={error}
          currentSlug={page.slug}
          pageId={page.id}
          onLater={() => {
            setSlugSetup(false);
            setError(null);
          }}
          onSubmit={(v) =>
            run(
              () => changeSlug(v, page.id),
              () => {
                setSlugSetup(false);
                toast(`주소를 정했어요 — finch.ai.kr/${v}`);
              },
            )
          }
        />
      ) : null}

      {/* 제목이 「블록 추가」뿐이었는데 안에는 템플릿·벌크·이사(가져오기)가 절반이었다 —
          가져오려고 들어온 사람이 «잘못 눌렀나» 하게 된다(2026-08-26 사장님 지적).
          여는 버튼 두 개(우측 패널·폰 캔버스)와 같은 문구를 쓴다. */}
      {drawer === "add" ? (
        <ModalShell
          label="블록 추가 · 가져오기"
          title="블록 추가 · 가져오기"
          description="블록을 누르면 맨 아래에 들어가요. 쓰던 링크를 한 번에 가져올 수도 있어요."
          size="xl"
          busy={busy}
          onClose={() => {
            setDrawer(null);
            setError(null);
          }}
        >
          {error ? (
            <p role="alert" className="mb-3 rounded-card border border-negative/40 bg-negative-weak px-3 py-2 text-[14px] text-negative-strong">
              {error}
            </p>
          ) : null}
              <AddPanel
                busy={busy}
                addingType={addingType}
                onAdd={(t) => addBlockOfType(t)}
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
                    () => addBlocksBulk(items, page.id),
                    () => {
                      /* 성공했을 때만 표를 비운다 — 실패하면 고른 목록·고친 이름이
                         남아 있어야 한다(붙여넣기 원문은 textarea 에 없어서 여기서
                         날리면 원래 서비스로 돌아가 다시 복사해 와야 한다). */
                      clear();
                      /* 단일 추가와 같은 규칙 — 일이 끝났으면 모달이 비켜서 결과(캔버스)를 보여준다 */
                      setDrawer(null);
                      toast(`링크 ${items.length}개를 추가했어요 — 캔버스의 블록을 눌러 바로 고칠 수 있어요.`);
                    },
                  )
                }
              />
        </ModalShell>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title={confirming.title}
          description={confirming.description}
          confirmLabel={confirming.confirmLabel}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const c = confirming;
            setConfirming(null);
            c.onConfirm();
          }}
        />
      ) : null}
      {revertOpen ? (
        <ModalShell label="편집 되돌리기" title="편집 되돌리기" onClose={() => setRevertOpen(false)} busy={busy} size="sm">
          <div className="space-y-3">
            <p className="text-[14px] leading-[1.7] text-fg-sub">
              {page.publishedAt
                ? "마지막 「라이브 반영」 상태로 되돌려요. 그 뒤에 편집한 내용은 사라지고, 숨긴 블록은 그대로 남아요."
                : "아직 발행한 적이 없어서 보이는 블록이 모두 삭제돼요. 숨긴 블록과 프로필(이름·사진)은 남아요."}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRevertOpen(false)} disabled={busy}>
                취소
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(
                    () => revertLinkDraft(page.id),
                    () => {
                      setRevertOpen(false);
                      /* 서버 상태가 통째로 바뀌었다 — 실행취소 스택·열린 편집기는 전부 무효 */
                      setUndoStack([]);
                      setRedoStack([]);
                      setEditingId(null);
                      toast(page.publishedAt ? "마지막 발행본으로 되돌렸어요." : "초안을 비웠어요.");
                      startTransition(() => router.refresh());
                    },
                  )
                }
              >
                {busy ? "되돌리는 중…" : "되돌리기"}
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
      {upgradeOpen ? <UpgradeModal onClose={() => setUpgradeOpen(false)} /> : null}
      {newPageOpen ? (
        <NewPageModal
          busy={busy}
          error={error}
          onClose={() => setNewPageOpen(false)}
          onSubmit={(slugv, titlev) =>
            run(
              () =>
                createLinkPage(slugv, titlev).then((r) => {
                  if (r.ok) {
                    setNewPageOpen(false);
                    startTransition(() => router.push(r.id ? `/links?page=${r.id}` : "/links"));
                  }
                  return r;
                }),
              () => toast("페이지를 만들었어요."),
            )
          }
        />
      ) : null}
      {newSubOpen ? (
        <NewSubpageModal
          busy={busy}
          /* 서브에서 열면 그 부모 아래로 — 서브의 서브는 없다(0060 트리거와 같은 규칙) */
          parentTitle={(pages.find((x) => x.id === (pages.find((x2) => x2.id === page.id)?.parentId ?? page.id))?.title || page.title) ?? ""}
          onClose={() => setNewSubOpen(false)}
          onSubmit={(seg, titlev) => {
            const me = pages.find((x) => x.id === page.id);
            const parentId = me?.parentId ?? page.id;
            return run(
              () =>
                createLinkSubpage(parentId, seg, titlev).then((r) => {
                  if (r.ok) {
                    setNewSubOpen(false);
                    startTransition(() => router.push(r.id ? `/links?page=${r.id}` : "/links"));
                  }
                  return r;
                }),
              () => toast("서브 페이지를 만들었어요."),
            );
          }}
        />
      ) : null}
      {settingsOpen ? (
        <ModalShell
          label="페이지 설정"
          title="페이지 설정"
          description="주소·공개·비밀번호·언어·공유 카드. 여기 값은 「라이브 반영」 없이 바로 적용돼요."
          size="lg"
          busy={busy}
          onClose={() => {
            setSettingsOpen(false);
            setError(null);
          }}
        >
          {error ? (
            <p role="alert" className="mb-3 rounded-card border border-negative/40 bg-negative-weak px-3 py-2 text-[14px] text-negative-strong">
              {error}
            </p>
          ) : null}
              <SettingsPanel
                page={page}
                busy={busy}
                /* 텍스트 칸의 blur 저장은 busy 베일을 띄우지 않는다 — 띄우면 blur 를 일으킨 그 클릭(스위치·저장 버튼)이 disabled 로 삼켜졌다(감사3 C7).
                   settings 는 서버에서 읽고-합치고-쓰기라 클라이언트에서 순서대로 보낸다 */
                onSettings={(patch) =>
                  fire(
                    () => {},
                    () => {
                      const p = settingsChain.current.then(() => updateLinkSettings(patch, page.id));
                      settingsChain.current = p.then(
                        () => {},
                        () => {},
                      );
                      return p;
                    },
                    undefined,
                    () => toast("페이지 설정을 저장했어요. 바로 적용돼요."),
                  )
                }
                onPassword={(pw, onDone) =>
                  run(
                    /* 잠금 문구 blur 저장(체인)과 같은 줄에 세운다 — 서버도 원자 패치지만 순서까지 지킨다 */
                    () => {
                      const p = settingsChain.current.then(() => setLinkPassword(pw, page.id));
                      settingsChain.current = p.then(
                        () => {},
                        () => {},
                      );
                      return p;
                    },
                    () => {
                      toast(pw === null ? "비밀번호를 풀었어요. 누구나 볼 수 있어요." : "비밀번호를 걸었어요. 방문자는 비밀번호를 넣어야 볼 수 있어요.");
                      onDone?.();
                    },
                  )
                }
                onPublishToggle={(v) => run(() => setLinkPublished(v, page.id))}
                onDelete={() =>
                  run(
                    () => deleteLinkPage(page.id),
                    /* 페이지가 사라지면 역연산 대상도 없다 — 같은 컴포넌트 인스턴스가
                       살아남아 새 페이지에 옛 블록을 꽂는 사고를 막는다 */
                    () => clearHistory(),
                  )
                }
              />
        </ModalShell>
      ) : null}

      {/* 모달이 자기 오류를 보여주는 동안은 페이지 배너를 안 띄운다 — 같은 문장이 둘(스크림 뒤 하나) 이 된다(소넷) */}
      {/* 자기 오류를 스스로 보여주는 화면(모달 4곳 + 인라인 프로필·블록 편집기)이 떠 있는 동안은
          페이지 배너를 안 띄운다 — 같은 문장이 둘이 되면 두 번 실패한 것으로 읽힌다 */}
      {error && !settingsOpen && !drawer && !editing && !scheduleFor && !tplPreview ? (
        <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak p-4 text-[15px] text-negative-strong">
          {error}
        </p>
      ) : null}

      {/* ── 배치: 좌(탭 콘텐츠) · 우(라이브 미리보기 폰 — 페이지 탭에선 눌러서 바로 편집).
            폰은 **하나**다. 전엔 편집 폰 + 미리보기 폰 둘이었는데 같은 것을 두 번 보여 화면만 복잡했다(2026-08-23 재편).
            xl 미만은 한 칸으로 쌓이고, 칸은 minmax(0,1fr) 로 못 박는다. ── */}
      {/* 2026-08-24 리틀리 배치로 재편: **폰이 왼쪽 첫 칸**(전체 높이·크게), 탭 패널이 오른쪽.
          모바일(<xl)은 한 칸으로 쌓이는데 DOM 순서는 컨트롤 먼저다 — 폰을 먼저 쌓으면
          작은 화면에서 편집 도구가 전부 접힌 아래로 밀린다. 데스크톱에서만 order 로 왼쪽으로 옮긴다. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[23rem_minmax(0,1fr)] xl:items-start 2xl:grid-cols-[26rem_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          {/* 상단 바 — 리틀리처럼 **오른쪽 칸 안**에 둔다(2026-08-24). 폰 위에 아무것도 없어야
              폰이 화면 높이를 꽉 쓴다 — 전에는 이 바가 위에 있어 폰 밑이 화면 밖으로 잘렸다. */}
          <TopBar
            page={page}
            unsaved={anyDirty}
            saving={!isDemo && (autoSaving || editorDirty || customSaving || customDirty)}
            autoPublishing={autoPublishing}
            pages={pages}
            pageLimit={pageLimit}
            multiReady={multiReady}
            onSwitchPage={(id) => {
              if (id === page.id) return;
              /* 미저장 초안이 있으면 나가기 모달로 — 다른 페이지로 가는 것도 이 페이지를 떠나는 것이다 */
              /* 실시간 저장 전환(2026-08-26) — 갈아타기 전에 고치다 만 블록만 마저 저장한다 */
              leaveEditor();
              startTransition(() => router.push(`/links?page=${id}`));
            }}
            onNewPage={() => setNewPageOpen(true)}
            onNewSubpage={() => setNewSubOpen(true)}
            busy={busy}
            tab={tab}
            onTab={switchTab}
            onOpenSettings={() => {
              setError(null);
              setSettingsOpen(true);
            }}
            /* 발행은 초안을 스냅샷으로 복사할 뿐 — 초안 조작의 실행취소는 그대로 유효하다 */
            onPublish={() => run(() => publishLinkPage(page.id))}
            onRevert={publishDirty ? () => setRevertOpen(true) : undefined}
            hasFeed={blocks.some((b) => b.active && b.type === "social_feed")}
            history={tab === "page" ? historyButtons : null}
          />
          {tab === "page" ? (
            <>
              {/* 템플릿 적용하기 — 접이식 스트립. 넘치는 쪽은 가장자리 페이드. 첫 칸은 가져오기. */}
              <div className="card-face min-w-0">
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
                  <span className="mt-2 block text-[14px] font-semibold leading-snug text-fg">
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
                    /* 바탕은 tint 토큰 쌍(templates.ts) — 반투명이라 다크에서도 카드로 남는다.
                       배지는 테마 무관 scrim 유지(사진·색 위 어디서나 읽혀야 한다) */
                    className={cn(
                      "trans-state relative w-44 shrink-0 rounded-card border border-line px-3 py-2.5 text-left hover:border-primary disabled:opacity-50",
                      t.tint,
                      tplPreview?.key === t.key && "border-primary ring-2 ring-primary/40",
                    )}
                  >
                    <span className="tnum absolute right-2 top-2 rounded-chip bg-scrim px-1.5 py-0.5 text-[11px] font-semibold text-on-scrim">
                      {t.blocks.length}블록
                    </span>
                    <span className="flex size-8 items-center justify-center rounded-card bg-body text-[17px]" aria-hidden>
                      {t.emoji}
                    </span>
                    <span className="mt-2 block text-[14px] font-semibold">{t.name}</span>
                    <span className="mt-0.5 block truncate text-[12px] opacity-75">{t.hint}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

              <Card>
                <CardBody className="space-y-4">
              <BlockListPanel
                onQuickAdd={addBlockOfType}
                onOpenTemplates={() => setTplOpen(true)}
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
                        run(() => updateLinkProfile(profileForm, page.id));
                      }}
                      onImages={(v) => run(() => updateLinkImages(v, page.id))}
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
                error={error}
                dirty={editorDirty}
                onClose={() => closeEditor(editing.id)}
                onRevert={() => {
                  const data = editing.data ?? {};
                  setDraft(data);
                  setBaseline(stableJson(data));
                }}
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
                    () => setBlockEmphasized(id, on, page.id),
                    () => {
                      toast(on ? "이 블록을 강조했어요 — 페이지 아래에 고정 버튼으로 떠요." : "강조를 풀었어요.");
                      record({
                        label: on ? "강조 켜기" : "강조 끄기",
                        undo: () =>
                          on
                            ? prevEmph
                              ? setBlockEmphasized(resolveId(prevEmph), true, page.id)
                              : setBlockEmphasized(resolveId(id), false, page.id)
                            : setBlockEmphasized(resolveId(id), true, page.id),
                        redo: () => setBlockEmphasized(resolveId(id), on, page.id),
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
                    chained(() => duplicateBlock(id, page.id)),
                    (res) => {
                      toast(`「${label}」 블록을 복사했어요 — 바로 아래에 들어갔어요.`);
                      if (res.id) {
                        const newId = res.id;
                        record({
                          label: `${label} 복사`,
                          undo: () => deleteBlock(resolveId(newId)),
                          redo: async () => {
                            const r = await duplicateBlock(resolveId(id), page.id);
                            if (r.ok && r.id) idAlias.current.set(resolveId(newId), r.id);
                            return r;
                          },
                        });
                      }
                    },
                  )
                }
              />
                </CardBody>
              </Card>
            </>
          ) : null}

          {tab === "design" ? (
            <Card>
              <CardBody className="space-y-4">
              <ThemePanel
                paid={paid}
                onUpgrade={() => setUpgradeOpen(true)}
                hasSubscribeBlock={blocks.some((b) => b.active && b.type === "subscribe")}
                custom={customForm}
                customDirty={customDirty}
                customSaveFailed={customSaveFailed}
                customHold={customHold}
                demo={isDemo}
                busy={busy}
                onCustomChange={patchCustom}
                onCustomReset={() => setCustomForm({})}
                current={liveTheme}
                /* 누르는 즉시 칠한다 — 로딩·비활성 없음. 실패하면 트랜지션 종료와 함께
                   서버 값으로 자동 복귀한다(2026-08-20 "굳이 로딩 걸어야 되나") */
                onPick={(k) => {
                  const prev = liveTheme;
                  fire(
                    () => pickThemeOptimistic(k),
                    () => updateLinkTheme(k, page.id),
                    undefined,
                    () => {
                      if (prev !== k) {
                        record({ label: "테마 변경", undo: () => updateLinkTheme(prev, page.id), redo: () => updateLinkTheme(k, page.id) });
                      }
                    },
                  );
                }}
              />
              </CardBody>
            </Card>
          ) : null}

          {tab === "analytics" ? (
            <Card>
              <CardBody>
                <StatsPanel
            stats={stats}
            blocks={blocks}
            pending={rangePending}
            /* ?page= 를 떨구면 서브페이지에서 기간을 누를 때 메인 페이지로 튕긴다(리마운트로 탭도 초기화된다) */
            onRange={(d) => startRangeNav(() => router.push(`/links?days=${d}&page=${page.id}`, { scroll: false }))}
            onRetry={() => startRangeNav(() => router.refresh())}
            onGoMarketing={() => setTab("marketing")}
            busy={busy}
          />
              </CardBody>
            </Card>
          ) : null}

          {tab === "manage" ? (
            <Card>
              <CardBody className="space-y-4">
              <ManagePanel
                leads={leads}
                leadCounts={leadCounts}
                leadsFailed={leadsFailed}
                guestbookFailed={guestbookFailed}
                guestbook={guestbook}
                busy={busy}
                onGuestbookReply={(id, reply, onDone) =>
                  run(() => replyGuestbook(id, reply), () => {
                    onDone();
                    /* 빈 값 저장은 **삭제**다(서버가 text || null 로 지운다) — 버튼 이름과 토스트가 같은 말을 해야 한다 */
                    toast(reply.trim() ? "답글을 달았어요." : "답글을 지웠어요.");
                  })
                }
                onGuestbookHide={(id, hidden) => run(() => setGuestbookHidden(id, hidden))}
                onGuestbookDelete={(id) =>
                  setConfirming({
                    title: "방명록 글을 지울까요?",
                    description: "공개 페이지에서도 함께 사라져요. 이건 되돌릴 수 없어요 — 잠시 감추려면 「숨기기」를 쓰세요.",
                    confirmLabel: "삭제",
                    onConfirm: () => run(() => deleteGuestbook(id), () => toast("방명록 글을 지웠어요.")),
                  })
                }
                onExportLeads={() =>
                  run(
                    () => exportLeads(page.id),
                    (res) => {
                      const rows = res.rows ?? [];
                      downloadCsv("핀치-프로필링크-받은내용.csv", [
                        ["종류", "이름", "이메일", "연락처", "내용", "접수일"],
                        ...rows.map((l) => [l.kind, l.name, l.email, l.phone, l.message, l.createdAt] as Array<string | number>),
                      ]);
                      toast(`받은 내용 ${rows.length}건을 CSV 로 내려받았어요.`);
                    },
                  )
                }
              />
              </CardBody>
            </Card>
          ) : null}

          {tab === "marketing" ? (
            <Card>
              <CardBody className="space-y-5">
                <MarketingPanel
                  page={page}
                  shareUrl={shareUrl}
                  origin={origin}
                  busy={busy}
                  onSettings={(patch) =>
                    fire(
                      () => {},
                      () => {
                        const p = settingsChain.current.then(() => updateLinkSettings(patch, page.id));
                        settingsChain.current = p.then(
                          () => {},
                          () => {},
                        );
                        return p;
                      },
                      undefined,
                      () => toast("마케팅 연결을 저장했어요. 공개 페이지에 바로 실려요."),
                    )
                  }
                />
              </CardBody>
            </Card>
          ) : null}
        </div>

        {/* 폰 — 리틀리처럼 **왼쪽·전체 높이**. 페이지 탭에선 편집 캔버스(누르면 목록의 그 행이 펼쳐진다),
            다른 탭에선 읽기 전용.
            ⚠️ 폰을 **카드로 감싸지 않는다**(2026-08-24 지시 "핸드폰 근처 흰색 배경 전부 없애고 딱 핸드폰만").
            기기가 회색 지면 위에 그대로 떠 있고, 주소·도구는 그 아래 **따로 흰 박스**다. */}
        {/* ⚠️ 높이를 화면에 맞춘다 — 예전엔 폰이 뷰포트보다 길어서 sticky 가 한 번도 붙지 못했다.
            목록을 내리면 폰이 통째로 화면 밖으로 사라졌고, 주소·복사·공유·QR 박스는 어느 해상도에서도
            접힌 선 아래였다(1440×900 에서 y=933, 실측). 칸을 화면 높이로 잘라 두면 폰은 늘 붙어 있고,
            짧은 화면에서만 이 칸 안에서 조금 스크롤된다 — 오른쪽 목록 스크롤과 서로 간섭하지 않는다.
            px-1 은 프레임 밖으로 나온 측면 버튼(-3px)이 잘리지 않게 두는 여유다.
            높이 8rem 뺀 값 = 상단 오프셋 72 + main 의 아래 여백(pb-10=40) + 여유 16.
            아래 여백을 안 빼면 페이지 맨 끝에서 칸이 grid 바닥에 끌려 40px 올라가 폰 윗 베젤이
            상단바 뒤로 잘린다(실측: 페이지 끝에서 colTop 72→32). */}
        <div className="space-y-3 xl:sticky xl:top-[4.5rem] xl:order-first xl:flex xl:h-[calc(100dvh-8rem)] xl:flex-col xl:gap-2 xl:space-y-0 xl:overflow-y-auto xl:overflow-x-hidden xl:px-1 xl:[overflow-anchor:none]">
          {/* 폰 위에 제목줄을 두지 않는 대신(지시) 보조기기용 제목은 남긴다 — 이 영역을
              찾아갈 이름이 아예 없어지면 스크린리더 사용자가 미리보기를 지나친다(소넷 확정) */}
          <h3 className="sr-only">{tab === "page" ? "미리보기 — 블록을 눌러 편집" : "라이브 미리보기"}</h3>
          {tab === "page" ? (
            /* xl:shrink-0 — 세로가 모자라도 프레임을 눌러 찌그러뜨리지 않는다(칸이 스크롤된다) */
            <PhonePreview
              page={draftPageView}
              /* active 필터를 걸지 않는다 — 꺼진 블록도 캔버스에 남아야 다시 켤 수 있다 */
              blocks={draftBlocksView}
              selectedId={editingId}
              edit={canvasEdit}
              frame="device"
              guestbook={guestbook}
            />
          ) : (
            /* 읽기 전용 draft — 캔버스와 같은 값·같은 관대한 규칙(도구만 없음). 꺼진 블록만 뺀다 */
            <PhonePreview
              page={draftPageView}
              blocks={draftBlocksView.filter((b) => b.active && !isScheduledHidden(b.data))}
              selectedId={null}
              frame="device"
              guestbook={guestbook}
            />
          )}

          {/* 주소·도구 — 폰 아래 별도 흰 박스(지시). 문구 있는 버튼: 복사하기·공유하기·QR 코드 */}
          <ShareBox
            url={shareUrl}
            busy={busy}
            title={page.title || page.slug}
            onEditSlug={() => {
              openDrawer("profile", true);
              /* 드로어가 그려진 다음 프레임에야 입력이 존재한다 */
              window.setTimeout(() => {
                const el = document.getElementById("p-slug");
                el?.focus();
                el?.scrollIntoView({ block: "center", behavior: "smooth" });
              }, 80);
            }}
          >
            {/* published(공개 스위치)를 먼저 본다 — 발행만 하고 공개를 안 켠 상태에서
                "공개 주소와 같은 모습" 이라고 말하면 방문자는 404 인데 소유자는 모른다(감사 #4) */}
            {profileDirty || customDirty || editorDirty
              ? "지금 고치는 중인 모습이에요 — 블록 편집은 자동 저장되고, 공개 주소에는 잠시 뒤 자동 반영돼요."
              : !page.published
                ? page.publishedAt
                  ? "비공개예요 — 설정에서 「공개」를 켜야 방문자가 볼 수 있어요."
                  : "지금 모습이에요 — 「라이브 반영」 후 설정에서 「공개」를 켜면 주소가 살아나요."
                : page.publishedAt
                  ? page.dirty
                    ? "지금 모습이에요 — 「라이브 반영」을 누르면 공개 주소에 반영돼요."
                    : "공개 주소와 같은 모습이에요."
                  : "지금 모습이에요 — 「라이브 반영」을 누르면 공개 주소가 살아나요."}
          </ShareBox>
        </div>
      </div>

      {/* 작업 중 베일 — 서버 왕복(run)이 도는 동안 핀치 로더. 200ms 안에 끝나면 보이지 않는다.
          "기능 쓸 때 로딩 중이면 로딩 화면" (2026-08-22 지시). fire() 경로(온오프·테마·드래그)는
          낙관 반영이라 기다릴 것이 없어 베일을 띄우지 않는다. */}
      {/* 모달이 열려 있으면 전역 베일을 접는다 — z-[60] 이 모달(z-50) 위를 덮어 로더가 둘이 되고,
          「만드는 중…」·「되돌리는 중…」 같은 모달 안 진행 라벨이 베일 아래로 사라졌다.
          모달이 열린 동안 시작되는 run() 은 그 모달에서 나온 것뿐이라(스크림이 뒤를 막는다) 진행 표시는 모달이 스스로 낸다 */}
      {busy && !settingsOpen && !drawer && !scheduleFor && !tplPreview && !newPageOpen && !newSubOpen && !revertOpen && !confirming && !slugSetup ? (
        <div
          className="busy-veil-in fixed inset-0 z-[60] flex items-center justify-center bg-surface/70 backdrop-blur-[2px]"
        >
          <FinchLoader label="처리하는 중…" />
        </div>
      ) : null}

      {/* 토스트 — 조작 결과 안내. 전엔 sr-only 라 "블록을 숨겼어요" 같은 안내가 눈엔 안 보였다. */}
      {/* 모바일(<md)에선 하단 탭바(약 58px + safe-area) 위로 띄운다 — 같은 z-40 이라 탭바 뒤에 깔려 한 픽셀도 안 보였다(감사2 C9) */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[70] flex justify-center px-4 md:bottom-6">
        <p
          data-open={notice ? "true" : "false"}
          role="status"
          className={cn(
            "toast-pop pointer-events-auto flex max-w-xl items-start gap-2 rounded-card border bg-overlay px-4 py-2.5 text-[14px] leading-[1.6] text-fg shadow-pop",
            notice?.tone === "warn" ? "border-warning" : "border-line-strong",
          )}
        >
          {notice?.tone === "warn" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          ) : (
            <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden />
          )}
          <span>{notice?.text}</span>
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
  pages = [],
  pageLimit = { used: 0, max: 1 },
  multiReady = false,
  onSwitchPage,
  onNewPage,
  onNewSubpage,
  busy,
  tab,
  onTab,
  onOpenSettings,
  onPublish,
  onRevert,
  hasFeed = false,
  unsaved = false,
  saving = false,
  autoPublishing = false,
  history,
}: {
  page: LinkPageView;
  pages?: LinkPageSummary[];
  pageLimit?: { used: number; max: number };
  multiReady?: boolean;
  onSwitchPage?: (id: string) => void;
  onNewPage?: () => void;
  onNewSubpage?: () => void;
  busy: boolean;
  tab: Tab;
  onTab: (t: Tab) => void;
  onOpenSettings: () => void;
  onPublish: () => void;
  /** 미발행 편집이 있을 때만 온다 — 초안을 마지막 발행본으로 되돌리는 모달을 연다 */
  onRevert?: () => void;
  /** 켜진 「최근 게시물」 블록이 있는가 — 있으면 초안이 깨끗해도 발행(피드 새로고침)을 막지 않는다 */
  hasFeed?: boolean;
  /** 저장 안 한 로컬 편집(프로필·꾸미기·블록 편집기)이 있는가 — 발행 상태보다 앞선다 */
  unsaved?: boolean;
  /** 블록 자동 저장이 돌고 있다(2026-08-26 실시간 저장) */
  saving?: boolean;
  /** 자동 라이브 반영이 돌고 있다 — 수동 발행(피드 새로고침)과 겹치지 않게 잠근다(쏘넷 점검) */
  autoPublishing?: boolean;
  /** 2행 왼쪽 — 실행취소/다시실행(페이지 탭에서만) */
  history?: React.ReactNode;
}) {
  const publishable = page.dirty || !page.publishedAt || hasFeed;

  return (
    /* 폰 칸과 **같은 선**(4.5rem)에 고정한다 — 목록을 내리면 탭·발행 버튼이 사라져
       왼쪽엔 폰이 붙어 있는데 오른쪽 기둥만 없어졌다.
       ⚠️ z-30 위로 올리지 말 것: sticky 가 쌓임 맥락을 만들어, 더 올리면 모달 스크림 뒤에서 이 바가 튀어나온다.

       ⚠️ 앱 헤더(h-14 = 56px)와 이 바(72px) 사이 **16px 띠**로 블록 목록이 잘린 채 흘러가는 게 보였다(실측).
       오프셋 4.5rem 은 폰 칸과 맞춘 값이라 못 옮긴다 — 그래서 그 틈만 지면색으로 덮는다.
       before 는 바 위쪽으로 16px 뻗어 헤더 밑단까지 닿고, 지면색이라 배경과 구분되지 않는다. */
    <div className="card-face relative xl:sticky xl:top-[4.5rem] xl:z-30 xl:before:absolute xl:before:inset-x-0 xl:before:bottom-full xl:before:h-4 xl:before:bg-surface xl:before:content-['']">
      {/* 1행 — 탭 · 주소 · 열람 도구(복사/열기/QR) · ⚙ · 공개 · 라이브 반영 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2">
        <nav aria-label="편집 영역" className="flex items-center gap-0.5 rounded-card bg-plate p-0.5">
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-current={on ? "page" : undefined}
                aria-label={t.label}
                onClick={() => onTab(t.key)}
                className={cn(
                  "trans-state flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[14px] font-semibold",
                  on ? "bg-body text-fg shadow-[var(--shadow-card)]" : "text-fg-sub hover:text-fg",
                )}
              >
                <t.icon className="size-4" aria-hidden />
                {/* xl(1280~) 은 폰 칸 23rem 과 한 줄을 나눠 써서 글자까지 넣으면 ⚙ 가 다음 줄로 밀린다.
                    md~lg(한 칸)와 2xl 이상에선 글자를 보여준다(소넷 확정 회귀) */}
                <span className="hidden md:inline xl:hidden 2xl:inline">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 페이지 전환은 좁은 폭에서 먼저 줄어든다 — 이름이 길어도 한 줄을 깨지 않게 */}
        {pages.length > 0 && onSwitchPage ? (
          <PageSwitcher
            pages={pages}
            pageLimit={pageLimit}
            multiReady={multiReady}
            activeId={page.id}
            busy={busy}
            onSwitch={onSwitchPage}
            onNewPage={onNewPage}
            onNewSubpage={onNewSubpage}
          />
        ) : null}
        {/* 주소·복사·공유·QR 은 폰 아래 박스로 옮겼다 — 리틀리 배치(2026-08-24) */}
        <span className="ml-auto" />
        <Button variant="ghost" size="sm" onClick={onOpenSettings} aria-haspopup="dialog" disabled={busy} className="shrink-0">
          <Settings className="size-3.5" aria-hidden />
          페이지 설정
        </Button>
      </div>

      {/* 2행 — 이력(↩↪) 왼쪽, 공개·발행 상태·라이브 반영 오른쪽 */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-t border-line px-3 py-1.5">
        {history}
        {/* 「실행취소」(한 단계)와 「편집 되돌리기」(초안 전체 폐기)는 무게가 다르다 —
            같은 Undo2 아이콘으로 6px 간격에 붙어 있으면 손이 먼저 나간다. 아이콘을 가르고 선으로 끊는다.
            구분선은 조건 **안**에 둔다: 밖에 두면 초안이 깨끗할 때 선만 남아 뜬다 */}
        {onRevert ? (
          <>
            <span className="mx-1 h-4 w-px bg-line" aria-hidden />
            <Button variant="ghost" size="sm" onClick={onRevert} disabled={busy}>
              <RotateCcw className="size-3.5" aria-hidden />
              편집 되돌리기
            </Button>
          </>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-chip px-2.5 py-1 text-[12px] font-semibold",
              page.published ? "bg-positive-weak text-positive-strong" : "bg-plate text-fg-sub",
            )}
          >
            {page.published ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
            {page.published ? "공개" : "비공개"}
          </span>
          {/* 「라이브까지 남은 일」 칩 — 상태와 액션을 한 몸(버튼 라벨)으로 두면 "지금 라이브가 최신인가"를 역산해야 한다.
              **저장 → 발행 순서**라 미저장이 초안 상태를 가린다: 예전엔 초록 ✓최신 옆에서
              "저장하지 않은 편집이 보여요" 라고 말해 두 곳이 서로를 부정했다(비평 확정) */}
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-chip px-2.5 py-1 text-[12px] font-semibold",
              unsaved
                ? "bg-warning-weak text-warning-strong"
                : !page.publishedAt
                  ? "bg-plate text-fg-sub"
                  : page.dirty
                    ? "bg-warning-weak text-warning-strong"
                    : "bg-positive-weak text-positive-strong",
            )}
          >
            {saving ? (
              "저장 중…"
            ) : unsaved ? (
              <>
                <AlertTriangle className="size-3" aria-hidden />
                저장 안 됨
              </>
            ) : !page.publishedAt ? (
              "발행 전"
            ) : page.dirty ? (
              "반영 중…"
            ) : (
              <>
                <Check className="size-3" aria-hidden />
                최신
              </>
            )}
          </span>
          {/* 라이브는 **처음 한 번만** 사람이 시작한다(2026-08-26) — 그 뒤엔 자동 반영이라
              버튼이 사라진다. 「최근 게시물」 피드만 수동 새로고침 버튼을 남긴다. */}
          {!page.publishedAt ? (
            <Button size="sm" onClick={onPublish} disabled={busy || autoPublishing || !publishable}>
              <Rocket className="size-3.5" aria-hidden />
              라이브 시작
            </Button>
          ) : hasFeed ? (
            <Button size="sm" variant="secondary" onClick={onPublish} disabled={busy || autoPublishing || !publishable} title="최근 게시물을 다시 불러와 반영해요">
              <Rocket className="size-3.5" aria-hidden />
              피드 새로고침
            </Button>
          ) : null}
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

/* 블록 종류별 색 — 리틀리처럼 목록·카탈로그가 알록달록하게 읽힌다. 값은 globals.css 의 tint 토큰 */
const BLOCK_TINT: Record<BlockType, string> = {
  link: "bg-tint-coral text-tint-coral-ink",
  heading: "bg-tint-slate text-tint-slate-ink",
  text: "bg-tint-slate text-tint-slate-ink",
  divider: "bg-tint-slate text-tint-slate-ink",
  spacer: "bg-tint-slate text-tint-slate-ink",
  image: "bg-tint-purple text-tint-purple-ink",
  image_card: "bg-tint-green text-tint-green-ink",
  video: "bg-tint-purple text-tint-purple-ink",
  card_row: "bg-tint-coral text-tint-coral-ink",
  grid: "bg-tint-coral text-tint-coral-ink",
  notice: "bg-tint-amber text-tint-amber-ink",
  social_feed: "bg-tint-pink text-tint-pink-ink",
  contact: "bg-tint-blue text-tint-blue-ink",
  subscribe: "bg-tint-blue text-tint-blue-ink",
  map: "bg-tint-teal text-tint-teal-ink",
  coupang: "bg-tint-green text-tint-green-ink",
  donation: "bg-tint-pink text-tint-pink-ink",
  gallery: "bg-tint-purple text-tint-purple-ink",
  music: "bg-tint-pink text-tint-pink-ink",
  vcard: "bg-tint-blue text-tint-blue-ink",
  search: "bg-tint-teal text-tint-teal-ink",
  file: "bg-tint-teal text-tint-teal-ink",
  guestbook: "bg-tint-blue text-tint-blue-ink",
  events: "bg-tint-amber text-tint-amber-ink",
};

/* 빈 목록에서 먼저 권하는 블록 — 캔버스 빈 화면(QUICK_ADD)과 같은 조합 */
const EMPTY_QUICK: Array<{ type: BlockType; label: string }> = [
  { type: "link", label: "링크 버튼" },
  { type: "image_card", label: "이미지 카드" },
  { type: "contact", label: "문의받기" },
  { type: "social_feed", label: "최근 게시물" },
];

/* 블록 아이콘 — 캔버스 자리표시자(phone-preview)와 공유(2026-08-24) */

function BlockListPanel({
  blocks,
  editingId,
  busy,
  profileOpen,
  onQuickAdd,
  onOpenTemplates,
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
  /** 빈 목록의 빠른 추가 — 카탈로그를 안 열고 바로 만든다 */
  onQuickAdd?: (type: BlockType) => void;
  /** 템플릿 스트립 펼치기 */
  onOpenTemplates?: () => void;
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
          {/* 폰이 눌러서 편집되는 캔버스라는 걸 알려주는 유일한 글줄 — 주소 박스에 있던 것을 여기로 옮겼다.
              (거기 두면 폰 세로 예산을 20px 먹는다. 유령 카드는 **빈 블록**에만 뜨므로 안내가 되지 못한다.) */}
          {blocks.length > 0 ? <span className="ml-2 hidden text-[12px] font-medium text-fg-sub xl:inline">폰 화면의 블록을 눌러도 편집할 수 있어요</span> : null}
        </h3>
        <Button size="sm" onClick={onAdd} disabled={busy}>
          <Plus className="size-3.5" aria-hidden />
          블록 추가 · 가져오기
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

      {blocks.length === 0 ? (
        /* 빈 페이지(2026-08-24) — 목록이 프로필 한 줄만 있고 아래가 통째로 비어
           "고장난 화면"으로 읽혔다. 무엇을 할 수 있는지 보여준다 */
        <div className="rounded-card border border-dashed border-line bg-body px-4 py-5 text-center">
          <p className="text-[15px] font-semibold text-fg">아직 블록이 없어요</p>
          <p className="mt-1 text-[14px] leading-[1.6] text-fg-sub">
            블록을 얹으면 오른쪽 화면이 바로 채워져요. 아래에서 하나 골라 시작하세요.
          </p>
          <div className="mt-3.5 flex flex-wrap justify-center gap-2">
            {EMPTY_QUICK.map((q) => {
              const Icon = BLOCK_ICON[q.type];
              return (
                <button
                  key={q.type}
                  type="button"
                  disabled={busy}
                  onClick={() => (onQuickAdd ? onQuickAdd(q.type) : onAdd())}
                  className={cn(
                    "trans-state flex items-center gap-1.5 rounded-chip border border-line px-3 py-1.5 text-[14px] font-medium text-fg hover:border-primary disabled:opacity-50",
                    BLOCK_TINT[q.type] ?? "bg-body",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {q.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[14px]">
            <button type="button" onClick={onAdd} disabled={busy} className="font-semibold text-primary hover:underline disabled:opacity-50">
              블록 전체 보기
            </button>
            {onOpenTemplates ? (
              <button type="button" onClick={onOpenTemplates} className="text-fg-sub hover:text-fg hover:underline">
                템플릿으로 한 번에 시작
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {blocks.map((b, i) => {
        const Icon = BLOCK_ICON[b.type] ?? Link2;
        const meta = BLOCK_CATALOG.find((c) => c.type === b.type);
        const summary = blockSummary(b.type, b.data);
        const expanded = editingId === b.id;
        const emph = b.data.emphasized === true;
        const canEmph = EMPHASIS_TYPES.includes(b.type);
        const sched = blockSchedule(b.data);
        const hasSched = !!(sched.openAt || sched.closeAt);
        /* 세 신호를 분리한다 — 예전엔 ?? 사슬이라 예약이 걸리면 「주소가 비어 공개되지 않아요」가
           통째로 삼켜졌다. 예약(정상 운영)과 고장(공개가 안 됨)은 같은 급이 아니다 */
        const off = !b.active ? "숨김 — 미리보기·공개에 안 나가요" : null;
        const problem = b.active ? (hiddenReason(b.type, b.data) ?? partialReason(b.type, b.data)) : null;
        const schedText = b.active ? scheduleCaption(b.data) : null;
        return (
          <div
            key={b.id}
            id={`blk-${b.id}`}
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
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-card", BLOCK_TINT[b.type] ?? "bg-plate text-fg-sub")} aria-hidden>
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
            {off || problem || schedText ? (
              /* pl-21(84px) = 행의 블록 아이콘 왼쪽 선.
                 px-2(8) + 핸들 p-1+size-4(24) + gap-1.5(6) + Switch w-9(36) + gap-1.5(6) + 버튼 px-1(4).
                 ↑ 이 중 하나라도 크기가 바뀌면 여기도 같이 고칠 것 */
              <div className="flex flex-wrap items-center gap-1.5 pb-2 pl-21 pr-3">
                {problem ? (
                  <span className="inline-flex items-center gap-1 rounded-chip bg-warning-weak px-2 py-0.5 text-[11px] font-medium text-warning-strong">
                    <AlertTriangle className="size-3" aria-hidden />
                    {problem}
                  </span>
                ) : null}
                {schedText ? (
                  <span className="inline-flex items-center gap-1 rounded-chip bg-plate px-2 py-0.5 text-[11px] font-medium text-fg-sub">
                    <Clock className="size-3" aria-hidden />
                    {schedText}
                  </span>
                ) : null}
                {off ? (
                  <span className="inline-flex items-center gap-1 rounded-chip bg-plate px-2 py-0.5 text-[11px] font-medium text-fg-sub">
                    <EyeOff className="size-3" aria-hidden />
                    {off}
                  </span>
                ) : null}
              </div>
            ) : null}
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
  const bad = openAt && closeAt && new Date(openAt).getTime() >= new Date(closeAt).getTime();
  const toIso = (v: string) => (v ? new Date(v).toISOString() : null);

  /* 손수 짠 스크림·포커스·Esc 를 걷고 ModalShell 로 — 다크에서 표면색(--body)이 다른 모달과 갈렸고,
     무엇보다 busy 중에도 Esc·스크림으로 닫혀 저장이 뒤에서 계속 돌 수 있었다 */
  return (
    <ModalShell
      label="예약 공개 설정"
      title={
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-4 text-fg-sub" aria-hidden />
          예약 공개
        </span>
      }
      description={`${block ? `「${blockSummary(block.type, block.data)}」 — ` : ""}정한 날짜에 맞춰 공개 페이지에서 보이거나 숨겨져요. 비워 두면 제한이 없어요.`}
      size="sm"
      busy={busy}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" disabled={busy || (!init.openAt && !init.closeAt)} onClick={() => onSave(null, null)}>
            예약 해제
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
              취소
            </Button>
            <Button size="sm" disabled={busy || !!bad} onClick={() => onSave(toIso(openAt), toIso(closeAt))}>
              저장
            </Button>
          </div>
        </div>
      }
    >
      {/* label 금지 — 모달이 label 자손이면 빈 곳 클릭이 트리거를 재활성해 값이 초기화된다(쏘넷) */}
      <span className="block text-[12px] font-medium text-fg-sub">
        공개 날짜 (이때부터 보여요)
        <DateTimePickerField mode="datetime" value={openAt} onChange={setOpenAt} ariaLabel="공개 날짜" placeholder="날짜·시각 고르기" />
      </span>
      <span className="mt-3 block text-[12px] font-medium text-fg-sub">
        숨김 날짜 (이때부터 숨겨요)
        <DateTimePickerField mode="datetime" value={closeAt} onChange={setCloseAt} ariaLabel="숨김 날짜" placeholder="날짜·시각 고르기" />
      </span>
      {bad ? <p className="mt-2 text-[12px] text-negative-strong">숨김 날짜는 공개 날짜보다 뒤여야 해요.</p> : null}
      {error && !bad ? (
        <p role="alert" className="mt-2 text-[12px] text-negative-strong">
          {error}
        </p>
      ) : null}
    </ModalShell>
  );
}

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
        className="modal-card-in shadow-pop relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-card border border-line bg-overlay outline-none"
        onKeyDown={(e) => trapFocus(boxRef.current, e)}
      >
        {/* 적용 중 — 핀치 로더(로고 주위로 도는 빛)로 덮는다. 모달을 닫지 않는다 */}
        {/* 베일도 같은 면색으로 — bg-body/75 면 다크에서 카드보다 어두워져 적용 중에 카드가 한 톤 내려앉는다 */}
        {busy ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-overlay/75">
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
        {/* 카드 **안**의 중첩 면은 plate 가 역할이다(지면 bg-surface 가 아니라) */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-plate px-5 py-5">
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
/*
  페이지 전환 드롭다운(멀티·서브, 0060) — 리틀리 「＋페이지 추가」 문법.
  메인 페이지 아래 서브가 들여쓰여 나오고, 바닥에 추가 버튼 + 사용량(n/max).
  상한·구조의 최종 관문은 DB 트리거 — 여기 disabled 는 안내일 뿐이다.
*/
function PageSwitcher({
  pages,
  pageLimit,
  multiReady,
  activeId,
  busy,
  onSwitch,
  onNewPage,
  onNewSubpage,
}: {
  pages: LinkPageSummary[];
  pageLimit: { used: number; max: number };
  multiReady: boolean;
  activeId: string;
  busy: boolean;
  onSwitch: (id: string) => void;
  onNewPage?: () => void;
  onNewSubpage?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  /* Esc 로 닫는다 — 예전엔 keydown 처리가 없어서, Esc 를 눌러도 화면 전체를 덮는 투명 오버레이가
     그대로 남았다(실측: 오버레이 1개 → Esc → 여전히 1개). 같은 화면의 블록 ⋯ 메뉴는 되는데
     이것만 안 돼서 «화면이 굳었다»로 읽힌다. 닫을 때 포커스는 트리거로 돌려준다. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const me = pages.find((p) => p.id === activeId) ?? null;
  const mains = pages.filter((p) => !p.parentId);
  const full = pageLimit.used >= pageLimit.max;
  const row = (p: LinkPageSummary, isSub: boolean) => (
    <button
      key={p.id}
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        if (p.id !== activeId) onSwitch(p.id);
      }}
      className={cn(
        "trans-state flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[14px] hover:bg-tint-hover",
        isSub && "pl-7",
        p.id === activeId ? "font-semibold text-fg" : "text-fg-sub",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{p.title || p.slug}</span>
      <span className="tnum shrink-0 text-[11px] text-fg-faint">{isSub ? `/${p.subSlug}` : `/${p.slug}`}</span>
      {p.id === activeId ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden /> : null}
    </button>
  );
  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="페이지 전환"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="trans-state flex max-w-[11rem] items-center gap-1.5 rounded-card border border-line bg-body px-2.5 py-1.5 text-[14px] font-semibold text-fg hover:bg-tint-hover disabled:opacity-50"
      >
        <span className="truncate">{me?.title || me?.slug || "페이지"}</span>
        <ChevronDown className={cn("trans-state size-3.5 shrink-0 text-fg-faint", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <>
          {/* 바깥 클릭 닫기 — 스크림은 투명(메뉴일 뿐 모달이 아니다).
              z-45: 하단 탭바가 z-40 이라 같은 층이면 **탭바가 위로 올라와** 뚫린다(모바일에서 메뉴를 연 채
              탭을 눌러 다른 화면으로 튕겼다). 메뉴 자체(z-50)보다는 아래여야 항목이 눌린다. */}
          <button type="button" aria-label="페이지 메뉴 닫기" className="fixed inset-0 z-[45] cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" aria-label="내 페이지" className="absolute left-0 top-full z-50 mt-1 w-72 rounded-card border border-line bg-overlay p-1.5 shadow-pop">
            {mains.map((m) => (
              <div key={m.id}>
                {row(m, false)}
                {pages.filter((p) => p.parentId === m.id).map((sb) => row(sb, true))}
              </div>
            ))}
            <div className="mt-1 space-y-0.5 border-t border-line pt-1.5">
              <button
                type="button"
                role="menuitem"
                disabled={full || !multiReady}
                onClick={() => {
                  setOpen(false);
                  onNewPage?.();
                }}
                className="trans-state flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[14px] font-medium text-fg hover:bg-tint-hover disabled:opacity-40"
              >
                <Plus className="size-3.5" aria-hidden />
                새 페이지
                <span className="tnum ml-auto text-[11px] text-fg-faint">
                  {pageLimit.used}/{pageLimit.max}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={full || !multiReady}
                onClick={() => {
                  setOpen(false);
                  onNewSubpage?.();
                }}
                className="trans-state flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[14px] font-medium text-fg hover:bg-tint-hover disabled:opacity-40"
              >
                <Plus className="size-3.5" aria-hidden />
                서브 페이지
              </button>
              {!multiReady ? (
                <p className="px-2.5 pb-1 text-[11px] leading-[1.5] text-fg-faint">페이지 추가는 서버 업데이트(0060) 적용 후 쓸 수 있어요.</p>
              ) : full ? (
                <p className="px-2.5 pb-1 text-[11px] leading-[1.5] text-fg-faint">페이지 상한에 닿았어요 — 플랜을 올리면 {pageLimit.max === 1 ? "3개" : "더"}까지 늘어나요.</p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── 주소 검사(2026-08-26 사장님 지시 2차: 자동 debounce 대신 «중복 확인» 버튼) ──
   형식·예약어·금칙어는 validateSlug(서버와 같은 함수)로 **입력 즉시** 거르고,
   중복·최근 사용·쿨다운은 사용자가 버튼을 눌러 확인한다 — 통과해야만 주소를 정할 수 있다.
   동기 판정과 «확인 필요» 여부는 렌더에서 파생하고 서버 결과만 상태로 든다(set-state-in-effect
   회피 — effect 자체가 없어졌다). 응답은 요청 시점 값(for)과 세대(seq)가 지금과 같을 때만
   쓴다 — 확인 후 글자를 고치면 그 값은 다시 «확인 필요»로 돌아간다. */
type SlugCheck = { level: "idle" | "checking" | "ok" | "error" | "neutral" | "unchecked"; msg?: string };

function useSlugCheck(
  value: string,
  pageId: string | undefined,
  currentSlug: string | undefined,
  mode: "change" | "create" = "change",
  /** 부모의 저장/확정 오류 — 새 오류가 오면 «통과» 캐시를 버린다(쏘넷 점검 high):
      확인은 통과였는데 저장이 거절된 값(막판 선점 등)이 초록인 채 재시도 루프가 되면 안 된다 */
  errorSignal?: string | null,
): { check: SlugCheck; passed: boolean; needsCheck: boolean; runCheck: () => void } {
  const v = value.trim().toLowerCase();
  const [server, setServer] = useState<{ for: string; res: SlugCheck } | null>(null);
  const [pendingFor, setPendingFor] = useState<string | null>(null);
  const seq = useRef(0);

  /* 렌더 중 조정 패턴(props 변화에 state 맞추기 — effect 금지 규칙의 공식 대안).
     오류가 «새로» 온 순간에만 캐시를 비운다 — 오류가 남아 있는 동안의 재확인 결과는 유지된다. */
  const [seenError, setSeenError] = useState<string | null | undefined>(errorSignal);
  if (errorSignal !== seenError) {
    setSeenError(errorSignal);
    if (errorSignal) {
      setServer(null);
      setPendingFor(null);
    }
  }

  /* 동기(즉시) 판정 — 서버가 필요 없는 경우를 렌더에서 바로 가른다 */
  let sync: SlugCheck | null = null;
  if (!v) sync = { level: "idle" };
  else if (currentSlug && v === currentSlug) {
    /* 지금 주소가 먼저다 — 목록 확장으로 기존 주소가 사후에 걸려도(0068 의 sns 실사례)
       제 주소에 빨간 오류를 띄우지 않는다. 서버 저장도 같은 원칙(주소 그대로면 검증 생략). */
    sync = { level: "ok", msg: "지금 쓰는 주소예요." };
  } else {
    const err = validateSlug(v);
    if (err) sync = { level: "error", msg: SLUG_MESSAGES[err] };
  }

  const runCheck = () => {
    if (sync) return; // 서버가 필요 없는 값 — 버튼이 어차피 잠겨 있다
    const val = v;
    const my = ++seq.current;
    setPendingFor(val);
    /* 같은 값을 다시 확인하면 낡은 캐시부터 비운다 — 버튼을 눌렀으면 정말 다시 확인한다 */
    setServer((cur) => (cur && cur.for === val ? null : cur));
    void (async () => {
      try {
        const r = await checkSlugAvailable(val, pageId, mode);
        if (seq.current !== my) return; // 그 사이 새 확인이 시작됨 — 낡은 답 버림
        const res: SlugCheck =
          r.status === "available"
            ? { level: "ok", msg: "쓸 수 있는 주소예요!" }
            : r.status === "mine"
              ? { level: "ok", msg: "지금 쓰는 주소예요." }
              : r.status === "skip"
                ? { level: "neutral", msg: "지금은 최종 확인을 못 해요 — 저장할 때 다시 검사돼요." }
                : { level: "error", msg: r.message ?? "쓸 수 없는 주소예요." };
        setServer({ for: val, res });
      } catch {
        /* 확인 실패는 통과가 아니다(사장님 지시: 통과해야만 설정) — 다시 누르게 한다 */
        if (seq.current === my) setServer({ for: val, res: { level: "error", msg: "확인하지 못했어요 — 「중복 확인」을 다시 눌러 주세요." } });
      } finally {
        if (seq.current === my) setPendingFor(null);
      }
    })();
  };

  let check: SlugCheck;
  if (sync) check = sync;
  else if (pendingFor === v) check = { level: "checking", msg: "쓸 수 있는 주소인지 확인하는 중…" };
  else if (server && server.for === v) check = server.res;
  else check = { level: "unchecked", msg: "「중복 확인」을 눌러 쓸 수 있는 주소인지 확인해 주세요." };

  return {
    check,
    /* 통과 = 초록(내 주소 포함) 또는 neutral(서버가 확인 불가 — 최종 관문은 저장이 다시 선다) */
    passed: check.level === "ok" || check.level === "neutral",
    /* 서버가 준 오류(중복·확인 실패)도 다시 눌러볼 수 있어야 한다 — 안 그러면 「다시 눌러
       주세요」라는 문구와 달리 버튼이 영영 잠긴다(쏘넷 점검 high). 동기 오류(형식·금칙어)는
       sync 가 잡으므로 여기 안 온다 — 그건 눌러 봐야 결과가 같아 잠근 채 둔다. */
    needsCheck: check.level === "unchecked" || (sync === null && check.level === "error"),
    runCheck,
  };
}

/** 「중복 확인」 — 주소 입력칸 옆에 붙는 버튼. 검사할 게 없으면(즉시 판정으로 끝) 잠긴다 */
function SlugCheckButton({ busy, state }: { busy: boolean; state: { check: SlugCheck; needsCheck: boolean; runCheck: () => void } }) {
  const checking = state.check.level === "checking";
  const disabled = busy || checking || !state.needsCheck;
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-10 shrink-0"
      disabled={disabled}
      title={
        disabled && !checking && !busy
          ? state.check.level === "idle"
            ? "주소를 먼저 입력해 주세요"
            : (state.check.msg ?? undefined)
          : undefined
      }
      onClick={state.runCheck}
    >
      {checking ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          확인 중…
        </span>
      ) : (
        "중복 확인"
      )}
    </Button>
  );
}

function SlugStatusLine({ check }: { check: SlugCheck }) {
  if (check.level === "idle" || !check.msg) return null;
  return (
    <p
      role={check.level === "error" ? "alert" : "status"}
      className={cn(
        "mt-1.5 text-[12px] leading-relaxed",
        check.level === "ok" && "text-positive-strong",
        check.level === "error" && "text-negative-strong",
        (check.level === "checking" || check.level === "neutral" || check.level === "unchecked") && "text-fg-sub",
      )}
    >
      {check.msg}
    </p>
  );
}

/** 유료 게이트 모달(2026-08-26 사장님 지시) — 배지 숨김·내 로고·미리보기 알약 × 가 연다 */
/** SNS 종류 픽커(2026-08-27 «셀렉트 전부 리틀리처럼») — 90여 채널을 네이티브 드롭다운 대신
    검색 되는 모달로 고른다. 그룹 구조는 유지, 현재 값은 어두운 칩으로 표시. */
function SnsKindPicker({ value, onPick }: { value: string; onPick: (k: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  /* autoFocus 속성은 ModalShell 의 이펙트(포커스 트랩 초기화)가 곧바로 덮어 무효가 되고
     «이전 포커스» 기록까지 망친다(쏘넷 점검). 부모 이펙트는 자식(ModalShell) 이펙트 **뒤에**
     돌므로 여기서 잡으면 트랩·복원과 공존한다. */
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);
  const entry = SNS_CATALOG.find((c) => c.key === value);
  const query = q.trim().toLowerCase();
  const groups = SNS_GROUPS.map((g) => ({
    g,
    list: SNS_CATALOG.filter((c) => c.group === g && (!query || c.label.toLowerCase().includes(query) || c.key.includes(query))),
  })).filter((x) => x.list.length > 0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQ("");
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label={`SNS 종류 — 지금 ${entry?.label ?? value}`}
        className="trans-state flex h-10 w-[9.5rem] shrink-0 items-center gap-1.5 rounded-card border border-line bg-body px-2.5 text-[14px] text-fg hover:bg-tint-hover"
      >
        <span className="min-w-0 flex-1 truncate text-left">{entry?.label ?? value}</span>
        <ChevronDown className="size-3.5 shrink-0 text-fg-faint" aria-hidden />
      </button>
      {open ? (
        <ModalShell label="SNS 종류 고르기" title="SNS 종류" onClose={() => setOpen(false)} size="md">
          <div className="space-y-4">
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="채널 이름 검색"
              aria-label="채널 검색"
              className="h-10 w-full rounded-card border border-line bg-body px-3 text-[14px] focus:border-primary focus:outline-none"
            />
            {groups.length === 0 ? (
              <p className="py-6 text-center text-[14px] text-fg-sub">찾는 채널이 없어요 — 「웹사이트」로 넣을 수 있어요.</p>
            ) : null}
            {groups.map(({ g, list }) => {
              return (
                <div key={g}>
                  <p className="text-[11px] font-bold tracking-[0.08em] text-fg-sub">{g}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {list.map((k) => (
                      <button
                        key={k.key}
                        type="button"
                        aria-pressed={k.key === value}
                        onClick={() => {
                          onPick(k.key);
                          setOpen(false);
                        }}
                        className={`trans-state flex items-center gap-1.5 rounded-chip border px-2.5 py-1.5 text-[12px] font-medium ${
                          k.key === value ? "border-fg bg-fg text-body" : "border-line bg-body text-fg-sub hover:bg-tint-hover hover:text-fg"
                        }`}
                      >
                        <SnsIcon kind={k.key} className="size-3.5" />
                        {k.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}

function UpgradeModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  return (
    <ModalShell label="유료 플랜 안내" title="유료 플랜에서 쓸 수 있어요" onClose={onClose} busy={false} size="sm">
      <div className="space-y-3">
        <p className="text-[14px] leading-[1.7] text-fg-sub">
          핀치 배지를 숨기고 <strong className="font-semibold text-fg">내 로고</strong>를 다는 건 유료 플랜 기능이에요.
          페이지를 온전히 내 브랜드로만 채울 수 있어요.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>
            닫기
          </Button>
          <Button size="sm" onClick={() => router.push("/pricing")}>
            요금제 보기
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

/**
 * 최초 「주소 정하기」(2026-08-26 사장님 결정) — 무작위 자동 주소를 정식 주소로 바꾸는 1회 관문.
 * 이후에는 30일에 한 번만 바꿀 수 있으므로(actions.ts slugCooldownError) 신중히 정하라고 말해 준다.
 * 「나중에」를 막지 않는다 — 시작을 막는 강제 관문은 무작위 주소를 만든 이유(이탈 방지)와 모순된다.
 */
function SlugSetupModal({
  busy,
  error,
  currentSlug,
  pageId,
  onLater,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  currentSlug: string;
  pageId: string;
  onLater: () => void;
  onSubmit: (slug: string) => void;
}) {
  const [v, setV] = useState("");
  /* 중복 확인을 «먼저» — 버튼으로 확인하고, 통과해야만 확정 버튼이 열린다(사장님 지시 2차) */
  const slugCheck = useSlugCheck(v, pageId, currentSlug, "change", error);
  const { check, passed, needsCheck, runCheck } = slugCheck;
  return (
    <ModalShell label="내 주소 정하기" title="내 주소를 정해 주세요" onClose={onLater} busy={busy} size="sm">
      <div className="space-y-3">
        <p className="text-[14px] leading-[1.7] text-fg-sub">
          지금 주소는 자동으로 만든 <code className="rounded bg-plate px-1 text-[12px]">{currentSlug}</code> 예요.
          기억하기 쉬운 주소로 바꿔 보세요 — 명함·프로필에 들어갈 주소예요.
        </p>
        <div>
          <label className="text-[14px] font-medium text-fg" htmlFor="slug-setup">주소</label>
          <div className="mt-1.5 flex items-center gap-1">
            <span className="shrink-0 text-[12px] text-fg-sub">finch.ai.kr/</span>
            <input
              id="slug-setup"
              value={v}
              onChange={(e) => setV(e.target.value.toLowerCase())}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing || !v.trim() || busy) return;
                /* Enter 한 키로 자연스럽게: 아직 확인 전이면 확인부터, 통과했으면 확정 */
                if (needsCheck) runCheck();
                else if (passed) onSubmit(v.trim());
              }}
              maxLength={30}
              placeholder="my-brand"
              autoFocus
              className="h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
            />
            <SlugCheckButton busy={busy} state={slugCheck} />
          </div>
          <SlugStatusLine check={check} />
        </div>
        {error ? (
          <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak px-3 py-2 text-[14px] text-negative-strong">
            {error}
          </p>
        ) : null}
        <p className="text-[12px] leading-relaxed text-fg-sub">
          정한 뒤에는 <strong className="font-semibold text-fg">30일에 한 번</strong>만 바꿀 수 있어요.
          바꿔도 옛 주소로 온 방문자는 새 주소로 안내돼요.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onLater} disabled={busy}>
            나중에 정하기
          </Button>
          <Button
            size="sm"
            disabled={busy || !v.trim() || !passed}
            title={!passed && v.trim() ? (check.msg ?? "먼저 중복 확인을 해 주세요") : undefined}
            onClick={() => onSubmit(v.trim())}
          >
            {busy ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                정하는 중…
              </span>
            ) : (
              "이 주소로 정하기"
            )}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

/** 새 페이지 만들기 — 주소·제목. 검증은 서버(validateSlug·상한 트리거)가 최종 */
function NewPageModal({ busy, error, onClose, onSubmit }: { busy: boolean; error: string | null; onClose: () => void; onSubmit: (slug: string, title: string) => void }) {
  const [slugv, setSlugv] = useState("");
  const [titlev, setTitlev] = useState("");
  /* 새 페이지도 같은 규칙 — create 모드는 내 주소·쿨다운 판정을 빼고 중복만 본다(actions 주석) */
  const slugCheck = useSlugCheck(slugv, undefined, undefined, "create", error);
  return (
    <ModalShell label="새 페이지" title="새 페이지" onClose={onClose} busy={busy} size="sm">
      <div className="space-y-3">
        <div>
          <label className="text-[14px] font-medium text-fg" htmlFor="np-title">제목</label>
          <input id="np-title" value={titlev} onChange={(e) => setTitlev(e.target.value)} maxLength={40} placeholder="예: 이벤트 페이지"
            className="mt-1.5 h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="text-[14px] font-medium text-fg" htmlFor="np-slug">주소</label>
          <div className="mt-1.5 flex items-center gap-1">
            <span className="shrink-0 text-[12px] text-fg-sub">finch.ai.kr/</span>
            <input id="np-slug" value={slugv} onChange={(e) => setSlugv(e.target.value.toLowerCase())} maxLength={30} placeholder="my-event"
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.nativeEvent.isComposing || !slugv.trim() || busy) return;
                /* 설정 모달과 같은 Enter 흐름 — 확인 전이면 확인부터, 통과했으면 만들기(쏘넷 점검) */
                if (slugCheck.needsCheck) slugCheck.runCheck();
                else if (slugCheck.passed && titlev.trim()) onSubmit(slugv.trim(), titlev.trim());
              }}
              className="h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none" />
            <SlugCheckButton busy={busy} state={slugCheck} />
          </div>
          <SlugStatusLine check={slugCheck.check} />
        </div>
        {/* 만들기 실패(서버 최종 관문)를 모달 안에서 보여준다 — 전엔 보일 자리가 없었다 */}
        {error ? (
          <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak px-3 py-2 text-[14px] text-negative-strong">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>취소</Button>
          <Button
            size="sm"
            disabled={busy || !slugv.trim() || !titlev.trim() || !slugCheck.passed}
            title={!slugCheck.passed && slugv.trim() ? (slugCheck.check.msg ?? "먼저 중복 확인을 해 주세요") : undefined}
            onClick={() => onSubmit(slugv.trim(), titlev.trim())}
          >
            {busy ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                만드는 중…
              </span>
            ) : (
              "만들기"
            )}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

/** 서브 페이지 만들기 — 부모 주소 아래 세그먼트. /p/{부모}/{세그먼트} 로 열린다 */
function NewSubpageModal({ busy, parentTitle, onClose, onSubmit }: { busy: boolean; parentTitle: string; onClose: () => void; onSubmit: (seg: string, title: string) => void }) {
  const [seg, setSeg] = useState("");
  const [titlev, setTitlev] = useState("");
  return (
    <ModalShell label="서브 페이지" title="서브 페이지" onClose={onClose} busy={busy} size="sm">
      <div className="space-y-3">
        <p className="text-[14px] text-fg-sub">
          <strong className="font-semibold text-fg">{parentTitle}</strong> 아래에 만들어요. 방문자는 부모 주소 뒤에 붙는 짧은 주소로 열어요.
        </p>
        <div>
          <label className="text-[14px] font-medium text-fg" htmlFor="ns-title">제목</label>
          <input id="ns-title" value={titlev} onChange={(e) => setTitlev(e.target.value)} maxLength={40} placeholder="예: 메뉴판"
            className="mt-1.5 h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="text-[14px] font-medium text-fg" htmlFor="ns-seg">서브 주소</label>
          <input id="ns-seg" value={seg} onChange={(e) => setSeg(e.target.value.toLowerCase())} maxLength={40} placeholder="menu"
            className="mt-1.5 h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none" />
          <p className="mt-1 text-[12px] text-fg-sub">영문 소문자·숫자·하이픈 1~40자</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>취소</Button>
          <Button size="sm" disabled={busy || !seg.trim() || !titlev.trim()} onClick={() => onSubmit(seg.trim(), titlev.trim())}>
            {busy ? "만드는 중…" : "만들기"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

/*
  폰 아래 주소 박스(2026-08-24 지시) — 폰은 지면 위에 그냥 떠 있고, 주소·도구만 흰 박스에 담는다.
  버튼은 아이콘만 두지 않고 **문구를 함께** 둔다("복사하기·공유하기·QR 코드").
  공유하기는 기기 공유 시트(navigator.share)를 쓰고, 없으면 주소 복사로 떨어진다.
*/
function ShareBox({
  url,
  busy,
  title,
  onEditSlug,
  children,
}: {
  url: string;
  busy: boolean;
  title: string;
  /** 주소 편집으로 바로 — 자동 생성된 무작위 주소를 여기서 처음 마주치기 때문에(2026-08-26 사장님) */
  onEditSlug?: () => void;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [qr, setQr] = useState(false);
  const btn =
    "trans-state flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-card border border-line px-2 text-[14px] font-medium text-fg hover:border-primary hover:text-primary disabled:opacity-50";

  /** 성공 여부를 돌려준다 — 공유 폴백이 실패한 복사에도 「복사됨」을 띄우던 것(소넷 확정) */
  async function copy(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      return true;
    } catch {
      /* 권한 거부·비보안 컨텍스트 — 주소가 화면에 보이니 손으로 복사하면 된다 */
      return false;
    }
  }

  async function share() {
    /* 모바일·크롬 기기 공유 시트. 취소는 예외로 오므로 조용히 넘긴다 */
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        return;
      }
    }
    if (!(await copy())) return;
    setShared(true);
    window.setTimeout(() => setShared(false), 1600);
  }

  return (
    /* xl:shrink-0 — 폰이 남긴 자리를 다 쓰되 스스로 눌리지는 않는다 */
    <div className="card-face space-y-1.5 p-2.5 xl:shrink-0">
      {/* 주소 자체가 링크 — 눌러서 공개 페이지를 새 창으로 연다(전에 있던 「열기」 버튼을 흡수).
          옆의 연필이 주소 편집으로 간다 — 처음 시작하면 주소가 무작위(6kt139hq 류)인데,
          바꾸는 길이 「페이지 탭 → 프로필 행」 안에 숨어 있어 못 찾았다(2026-08-26 사장님 지적). */}
      <div className="flex items-center gap-1.5">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="새 창에서 열기"
          className="trans-state block min-w-0 flex-1 truncate rounded-card border border-line bg-plate px-2.5 py-1.5 text-[12px] text-fg-sub hover:border-primary hover:text-fg"
        >
          {/* 표시는 스킴 없이 「finch…」부터 — href·복사는 완전한 주소다(lib/links displayLinkUrl 주석) */}
          {displayLinkUrl(url)}
        </a>
        {onEditSlug ? (
          <button
            type="button"
            onClick={onEditSlug}
            disabled={busy}
            aria-label="주소 바꾸기"
            title="주소 바꾸기"
            className="trans-state shrink-0 rounded-card border border-line p-1.5 text-fg-sub hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={copy} disabled={busy} className={btn}>
          {copied ? <Check className="size-3.5 text-positive-strong" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "복사됨" : "복사하기"}
        </button>
        <button type="button" onClick={share} disabled={busy} className={btn}>
          <Share2 className="size-3.5" aria-hidden />
          {shared ? "복사됨" : "공유하기"}
        </button>
        <button type="button" onClick={() => setQr(true)} disabled={busy} className={btn}>
          <QrCode className="size-3.5" aria-hidden />
          QR 코드
        </button>
      </div>
      {/* 문구는 한 줄만 — 두 줄이면 박스가 20px 길어지고 그만큼 폰이 짧아진다(왼쪽 칸은 화면 높이에 갇혀 있다) */}
      {children ? <p className="text-center text-[12px] leading-[1.6] text-fg-sub">{children}</p> : null}
      {qr ? <QrModal url={url} onClose={() => setQr(false)} /> : null}
    </div>
  );
}

/* 되돌릴 수 없는 조작의 확인 — native window.confirm 을 대체한다.
   OS 대화상자는 테마·글꼴·문구 위계가 없고, 무엇보다 «무엇이 어떻게 사라지는지» 를 말할 자리가 없다 */
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell label={title} title={title} size="sm" busy={busy} onClose={onCancel}>
      <div className="space-y-3">
        <p className="text-[14px] leading-[1.7] text-fg-sub">{description}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function QrModal({ url, onClose }: { url: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

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

  /* 다른 모달과 같은 껍데기 — 손수 짠 스크림·Esc 를 두면 다크에서 표면색(--body vs --overlay)이 갈린다.
     text-center 는 카드가 아니라 **본문**에만 건다(카드에 걸면 ModalShell 헤더 제목까지 가운데로 간다) */
  return (
    <ModalShell
      label="QR 코드"
      title="QR 코드"
      description="명함·매장·포스터 어디든 — 찍으면 내 프로필 링크로 와요."
      size="sm"
      onClose={onClose}
      footer={
        <div className="flex justify-center gap-2">
          <Button size="sm" onClick={download} disabled={failed}>
            PNG 저장
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>
      }
    >
      <div className="text-center">
        {/* 카메라가 읽어야 하므로 QR 판은 테마와 무관하게 항상 흰색이다(의도된 예외) */}
        <div className="mx-auto w-fit rounded-card bg-white p-2.5">
          <canvas ref={canvasRef} aria-label={`${url} QR 코드`} />
        </div>
        {failed ? (
          <p role="alert" className="mt-2 text-[12px] text-negative-strong">
            QR 을 만들지 못했어요. 잠시 후 다시 열어 주세요.
          </p>
        ) : null}
        {/* QR 자체는 완전한 URL 로 인코딩한다 — 캡션만 스킴 없이 */}
        <p className="mt-2 break-all text-[11px] text-fg-sub">{displayLinkUrl(url)}</p>
      </div>
    </ModalShell>
  );
}

function AddPanel({
  busy,
  addingType = null,
  onAdd,
  onApplyTemplate,
  onImport,
}: {
  busy: boolean;
  /** 서버에 추가 중인 타입 — 그 카드만 스피너·「추가하는 중…」으로 바뀐다 */
  addingType?: BlockType | null;
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
      {/* 구역 ① — 블록 하나씩. 카탈로그 그룹 제목 위에 층위 하나를 더 두는 이유:
          아래 「한 번에 채우기」와 짝이 맞아야 모달 제목(추가 · 가져오기)이 거짓말이 안 된다. */}
      <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-faint">블록 하나씩</h4>
      {groups.map(([group, list]) => (
        <div key={group}>
          <p className="text-[12px] font-semibold text-fg-sub">{group}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {list.map((c) => {
              const CatIcon = BLOCK_ICON[c.type];
              /* 눌린 카드는 저 혼자 「추가하는 중…」 — 전역 베일이 모달 앞에서는 접히므로
                 이게 유일한 진행 표시다. 나머지 카드는 disabled 흐림으로 구분된다. */
              const pending = addingType === c.type;
              return (
                <button
                  key={c.type}
                  type="button"
                  disabled={busy}
                  aria-busy={pending}
                  onClick={() => onAdd(c.type)}
                  className={cn(
                    "trans-state flex items-start gap-2.5 rounded-card border px-3 py-2.5 text-left hover:border-primary hover:bg-tint-hover disabled:opacity-50",
                    pending ? "border-primary disabled:opacity-100" : "border-line",
                  )}
                >
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-card", BLOCK_TINT[c.type] ?? "bg-plate text-fg-sub")} aria-hidden>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <CatIcon className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold">{c.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-fg-sub">
                      {pending ? "추가하는 중…" : c.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* 구역 ② — 한 번에 채우기: 템플릿 · 내 링크 벌크 · 다른 서비스 이사.
          하나씩 고르는 위쪽과 성격이 달라서 선을 긋고 이름을 준다 — 「기존 링크를 가져오려면
          어디로 가나」의 답이 이 제목이다. */}
      <div className="border-t border-line pt-4">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-faint">한 번에 채우기 · 가져오기</h4>
      </div>

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

      {/* 「링크 여러 개 한 번에」(내 링크 벌크 추가) + 「다른 서비스에서 옮겨오기」(이사) —
          템플릿과 같은 격의 접이식 두 개. 하나로 합치면 벌크 버튼이 리틀리 입력칸을
          내밀게 된다(import-links.tsx 상단 주석, 2026-08-26 사장님 지적). */}
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
  /* 주소 검사 — 모달과 같은 훅·같은 규칙(버튼으로 확인, 통과해야 저장) */
  const profileSlug = useSlugCheck(form.slug, page.id, page.slug, "change", error);
  const { slug, title, bio, layout, align, snsLinks: sns, snsPlacement, titleSize, seoTitle, seoDesc } = form;
  /* 토글을 다시 켤 때 돌아갈 레이아웃 — 끄기 직전 값(세션 내) */
  const prevLayoutRef = useRef<string>("profile");

  const input =
    "h-10 w-full rounded-card border border-line bg-body px-3 text-[15px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-bold">프로필</h3>
        {/* 프로필 영역 ON/OFF(리틀리 실측 2026-08-26) — 끄면 layout="hidden" 으로 저장되고
            블록만 남는다. 다시 켜면 끄기 전 레이아웃으로 돌아간다(세션 내). */}
        <label className="flex items-center gap-2 text-[12px] font-medium text-fg-sub">
          <Switch
            checked={layout !== "hidden"}
            onChange={(v) => {
              if (v) onChange({ layout: prevLayoutRef.current || "profile" });
              else {
                prevLayoutRef.current = layout === "hidden" ? "profile" : layout;
                onChange({ layout: "hidden" });
              }
            }}
            label="프로필 영역 표시"
          />
          표시
        </label>
      </div>

      {layout === "hidden" ? (
        <p className="rounded-card bg-plate px-3 py-2.5 text-[13px] leading-relaxed text-fg-sub">
          프로필 영역을 껐어요 — 방문자에게 블록만 보여요. 위 「표시」 스위치로 다시 켤 수 있어요.
        </p>
      ) : (
        <>
      <div>
        <p className="text-[14px] font-semibold text-fg">레이아웃</p>
        {/* 글자 대신 **그림**으로 고른다(링크팜 실측 반영) — "커버+프로필"이라는 말보다
            배너 위에 원이 얹힌 그림이 한눈에 들어온다. 그림은 순수 CSS. */}
        <div className="mt-1.5 grid grid-cols-4 gap-2">
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => onChange({ layout: l.key })}
              aria-pressed={layout === l.key}
              aria-label={l.label}
              title={`${l.label} — ${l.hint}`}
              className={cn(
                "trans-state rounded-card border p-1.5",
                layout === l.key ? "border-2 border-primary" : "border border-line hover:bg-tint-hover",
              )}
            >
              {/* 리틀리처럼 글자 없이 그림으로만(실측 2026-08-26) — 이름은 title/aria 가 말한다 */}
              <span className="relative flex h-14 flex-col items-center overflow-hidden rounded-[8px] bg-plate" aria-hidden>
                {l.key === "hero" ? (
                  <>
                    {/* 배경형 — 위쪽이 사진(실루엣+원)이고 아래로 녹는다 */}
                    <span className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-fg/25 to-transparent" />
                    <span className="relative z-10 mt-2 size-4 rounded-full bg-fg/40" />
                    <span className="mt-3 h-1 w-10 rounded-full bg-fg/20" />
                    <span className="mt-0.5 h-1 w-7 rounded-full bg-fg/15" />
                  </>
                ) : l.key === "profile" ? (
                  <>
                    <span className="mt-2 size-5 rounded-full bg-fg/40" />
                    <span className="mt-1.5 h-1 w-10 rounded-full bg-fg/20" />
                    <span className="mt-0.5 h-1 w-7 rounded-full bg-fg/15" />
                  </>
                ) : l.key === "cover_profile" ? (
                  <>
                    <span className="absolute inset-x-0 top-0 h-6 bg-fg/20" />
                    <span className="relative z-10 mt-4 size-4 rounded-full bg-fg/40 ring-2 ring-body" />
                    <span className="mt-1 h-1 w-10 rounded-full bg-fg/20" />
                    <span className="mt-0.5 h-1 w-7 rounded-full bg-fg/15" />
                  </>
                ) : (
                  <>
                    <span className="absolute inset-x-0 top-0 h-7 bg-fg/20" />
                    <span className="mt-9 h-1 w-10 rounded-full bg-fg/20" />
                    <span className="mt-0.5 h-1 w-7 rounded-full bg-fg/15" />
                  </>
                )}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 이미지는 **고르는 즉시 저장**한다 — 업로드가 이미 서버 왕복이라, 여기서 또
          「저장」을 누르게 하면 올렸는데 반영이 안 되는 것처럼 보인다. */}
      {layout !== "cover" && layout !== "hidden" ? (
        <ImageField
          label={layout === "hero" ? "배경 사진 (프로필 이미지)" : "프로필 사진"}
          value={page.avatarPath ?? ""}
          onChange={(v) => onImages({ avatarPath: v || null })}
          aspect="aspect-square"
          cropAspect={1}
          /* 실제로 원으로 보이는 자리 — 칸도 원형·작게(패널 폭을 다 먹으면 거대한 네모가 된다) */
          maxW="max-w-[152px]"
          round
          hint="권장 400×400 이상 정사각형 — 다른 비율은 올릴 때 위치를 맞출 수 있어요"
        />
      ) : null}
      {layout === "cover" || layout === "cover_profile" ? (
        <ImageField
          label="커버 이미지"
          value={page.coverPath ?? ""}
          onChange={(v) => onImages({ coverPath: v || null })}
          aspect="aspect-[4/3]"
          cropAspect={4 / 3}
          maxW="max-w-[240px]"
          hint="권장 1200×900(4:3) — 다른 비율은 올릴 때 보일 부분을 직접 고를 수 있어요"
        />
      ) : null}

      <div>
        <label htmlFor="p-title" className="block text-[12px] font-medium text-fg-sub">
          대표문구
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
          상세문구
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

      {/* 타이틀 크기·SNS 위치 — 링크팜 프로필 설정 실측(2026-08-19)에서 가져온 둘.
          링크팜의 「드래그」 배치는 안 가져온다 — 우리는 드래그 정렬 자체를 뺐다. */}
      <div>
        <p className="text-[14px] font-semibold text-fg">글자 크기</p>
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
        <p className="text-[14px] font-semibold text-fg">정렬</p>
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

      <div>
        <p className="text-[14px] font-semibold text-fg">SNS 아이콘 위치</p>
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

        </>
      )}

      <div>
        <label htmlFor="p-slug" className="block text-[12px] font-medium text-fg-sub">
          주소 (finch.ai.kr/…)
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input id="p-slug" value={slug} onChange={(e) => onChange({ slug: e.target.value.toLowerCase() })} maxLength={30} className={input} />
          <SlugCheckButton busy={busy} state={profileSlug} />
        </div>
        {/* 모달과 같은 검사 — 저장 눌러서야 「이미 있어요」를 듣게 하지 않는다 */}
        <SlugStatusLine check={profileSlug.check} />
        {/* 주소 변경의 두 가지 질문 — 「얼마나 자주 바꿀 수 있나」 「이미 뿌린 링크는 어떻게 되나」 */}
        <p className="mt-1.5 text-[12px] leading-relaxed text-fg-sub">
          주소는 30일에 한 번 바꿀 수 있어요. 바꿔도 옛 주소로 온 방문자는 새 주소로 안내되고,
          옛 주소는 90일간 다른 사람이 가져갈 수 없어요.
        </p>
      </div>

      <div>
        <p className="text-[14px] font-semibold text-fg">SNS 링크</p>
        <div className="mt-1.5 space-y-2">
          {sns.map((s, i) => {
            const entry = SNS_CATALOG.find((c) => c.key === s.kind);
            return (
            <div key={i} className="flex items-center gap-1.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-card bg-plate text-fg-sub" aria-hidden>
                <SnsIcon kind={s.kind} className="size-4" />
              </span>
              {/* 90여 채널 — 검색 되는 모달 픽커(2026-08-27 «셀렉트 전부 리틀리처럼») */}
              <SnsKindPicker value={s.kind} onPick={(k) => onChange({ snsLinks: sns.map((x, j) => (j === i ? { ...x, kind: k } : x)) })} />
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
      {/* 주소를 바꿔 적었으면 중복 확인 통과 전엔 저장이 잠긴다 — 주소 그대로면 동기 판정이
          즉시 통과라 다른 필드만 고치는 저장은 안 막힌다(서버 관문과 같은 원칙). 잠긴 이유는
          원인에 맞게 말한다 — 빈 주소인데 「중복 확인을 하라」고 하면 엉뚱하다(쏘넷 점검). */}
      <Button
        variant="secondary"
        disabled={busy || !profileSlug.passed}
        title={
          !profileSlug.passed
            ? profileSlug.check.level === "idle"
              ? "주소가 비어 있어요 — 주소를 입력하거나 원래 주소로 되돌려 주세요"
              : (profileSlug.check.msg ?? "먼저 중복 확인을 해 주세요")
            : undefined
        }
        onClick={onSave}
      >
        {busy ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            저장 중…
          </span>
        ) : (
          "저장"
        )}
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   테마 패널
   ══════════════════════════════════════════════════════════════════ */

/* 디자인 탭 섹션 머리 — 목록·카탈로그처럼 **틴트 아이콘**을 단다.
   여덟 섹션 제목이 전부 같은 회색 글자라 이 탭에만 색이 하나도 없었다(비평 확정).
   왼쪽 트랙 11rem → 13rem: 아이콘 28 + 간격 10 을 물려도 글자 폭이 지금과 같게(「상단 메뉴 · 로고」 줄바꿈 방지) */
function DSection({
  title,
  hint,
  icon: Icon,
  tint,
  children,
  first = false,
}: {
  title: string;
  hint?: string;
  icon: LucideIcon;
  tint: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section className={cn("grid gap-3 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6", !first && "border-t border-line pt-6")}>
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-card", tint)} aria-hidden>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h4 className="text-[15px] font-semibold">{title}</h4>
          {hint ? <p className="mt-0.5 text-[12px] leading-[1.5] text-fg-sub">{hint}</p> : null}
        </div>
      </div>
      {/* 컨트롤 칸이 측정 기준 — 폰(23rem)에 눌려 뷰포트보다 늘 훨씬 좁다(globals.css .ds-area) */}
      <div className="ds-area min-w-0 space-y-3">{children}</div>
    </section>
  );
}

function ThemePanel({
  paid,
  onUpgrade,
  current,
  custom,
  customDirty,
  customSaveFailed = false,
  customHold = false,
  demo = false,
  busy,
  hasSubscribeBlock,
  onPick,
  onCustomChange,
  onCustomReset,
}: {
  current: string;
  custom: LinkThemeCustom;
  customDirty: boolean;
  /** 마지막 저장이 실패했는가 — «저장됨»이라고 말하지 않기 위해 필요하다 */
  customSaveFailed?: boolean;
  /** 이미지 주소가 관문을 못 넘어 자동 저장이 보류 중인가 — 이유를 말해준다 */
  customHold?: boolean;
  /** 데모 모드 — 저장이 없으므로 상태칩을 접는다 */
  demo?: boolean;
  busy: boolean;
  /** 구독신청 블록이 켜져 있는가 — 상단 구독 버튼은 그 블록으로 스크롤한다 */
  hasSubscribeBlock: boolean;
  onPick: (k: string) => void;
  onCustomChange: (patch: Partial<LinkThemeCustom>) => void;
  paid: boolean;
  onUpgrade: () => void;
  onCustomReset: () => void;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, typeof LINK_THEMES>();
    for (const t of LINK_THEMES) {
      const list = m.get(t.group) ?? [];
      list.push(t);
      m.set(t.group, list);
    }
    /* 그룹 순서는 명시한다 — Map 삽입 순서에 맡기면 프리셋 하나 끼워 넣을 때 섹션이 통째로 재배열된다(소넷) */
    const ORDER = ["MINIMAL", "PROFESSIONAL", "VIVID"];
    return [...m.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  }, []);
  const preset = themeByKey(current);
  const hasCustom = Object.keys(custom).length > 0;
  const [fontQuery, setFontQuery] = useState("");
  const fonts = useMemo(() => {
    const q = fontQuery.trim().toLowerCase();
    return q ? LINK_FONTS.filter((f) => f.label.toLowerCase().includes(q) || f.key.includes(q) || f.family.toLowerCase().includes(q)) : LINK_FONTS;
  }, [fontQuery]);
  /* 패널이 열려 있는 동안 전 글꼴을 비차단으로 싣는다 — 목록의 각 줄이 제 글꼴로 보인다 */
  useFontStylesheets(LINK_FONTS.flatMap((f) => fontStylesheets(f.key)));
  /* 앱 공용 칩(components/ui/chip-filter.tsx)과 같은 계약 —
     cursor-pointer(v4 preflight 는 button 에 포인터를 안 준다) · 14px · 코랄 포커스 링.
     히트 영역 오버레이(after:-inset-*)는 넣지 않는다: gap-1.5 라 확장분이 이웃 칩을 덮어
     가장자리 클릭이 옆 칩을 누른다 */
  const chip = (on: boolean) =>
    cn(
      "trans-state cursor-pointer rounded-chip px-3.5 py-1.5 text-[14px] font-semibold",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      on ? "bg-primary text-on-primary" : "border border-line bg-body text-fg-sub hover:bg-tint-hover hover:text-fg",
    );
  const bgMode: "solid" | "gradient" | "image" = custom.bgImage ? "image" : custom.bg2 || (!custom.bg && preset.bg2) ? "gradient" : "solid";
  /* 「사진」은 아직 사진이 없어도 눌린 상태여야 한다 — 예전엔 스크롤만 하고 칩이 안 눌려
     3칸 모드 스위치 중 둘만 진짜였다. 저장된 사진이 있으면 bgMode 가 알아서 image 다 */
  const [wantsImage, setWantsImage] = useState(false);
  const bgTab: "solid" | "gradient" | "image" | "wash" | "pastel" = custom.bgWash ? "wash" : custom.bgPastel ? "pastel" : custom.bgImage || wantsImage ? "image" : bgMode;
  /* 스와치용 — 지금 설정에 한 값만 바꿔 **실제 발행본과 같은 CSS 변수**를 받아온다.
     8/14/20px·color-mix 문자열을 패널에 복제하지 않으므로 themeVars 가 단일 출처로 남는다 */
  const varsFor = (patch: Partial<LinkThemeCustom>) => themeVars(preset, { ...custom, ...patch });
  /* 「내 로고」 칩을 눌렀지만 아직 이미지를 안 올린 상태 — 업로드 칸을 보여주기 위한 로컬 상태 */
  const [logoOpen, setLogoOpen] = useState(false);
  const colorInput = (key: "bg" | "accent" | "card" | "fg", label: string) => (
    <label key={key} className="flex items-center gap-2 rounded-card border border-line bg-body px-2.5 py-2 text-[14px]">
      <input
        type="color"
        /* color 인풋은 #rrggbb 만 받는다 — 8자리(알파) 프리셋 값은 검정으로 새니타이즈된다(감사 #14) */
        value={(custom[key] ?? preset[key]).slice(0, 7)}
        onChange={(e) => onCustomChange({ [key]: e.target.value.toUpperCase() })}
        aria-label={`${label} 색`}
        className="size-7 cursor-pointer rounded-[6px] border-0 bg-transparent p-0"
      />
      <span className="font-medium">{label}</span>
      <span className="tnum ml-auto text-[11px] text-fg-faint">{(custom[key] ?? preset[key]).slice(0, 7)}</span>
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold">디자인</h3>
          <p className="mt-0.5 text-[14px] text-fg-sub">고르는 즉시 오른쪽 미리보기에 비치고, 잠시 뒤 저절로 저장돼요.</p>
        </div>
        <div className="flex items-center gap-2">
          {demo ? null : customSaveFailed ? (
            <span className="text-[12px] font-medium text-negative">저장이 늦어지고 있어요 — 자동 재시도 중</span>
          ) : customHold ? (
            <span className="text-[12px] font-medium text-negative">이미지 주소를 확인해 주세요 — http(s):// 로 시작해야 저장돼요</span>
          ) : customDirty ? (
            <span className="text-[12px] text-fg-sub">저장 중…</span>
          ) : null}
          {hasCustom ? (
            <Button variant="ghost" size="sm" onClick={onCustomReset} disabled={busy}>
              프리셋으로 되돌리기
            </Button>
          ) : null}
        </div>
      </div>

      <DSection icon={Palette} tint="bg-tint-purple text-tint-purple-ink" first title="테마" hint="출발점. 고른 뒤 아래에서 뭐든 바꿀 수 있어요.">
        {groups.map(([group, list]) => (
          <div key={group}>
            <p className="text-[11px] font-bold tracking-[0.08em] text-fg-sub">{group}</p>
            <div className="grid-presets mt-1.5 grid gap-2">
              {list.map((t) => {
                /* 썸네일이 배경·강조·카드 세 색만 보여줘서 모서리·글자색·그림자가 다른 테마가
                   서로 같아 보였다. 값은 새로 적지 않고 themeVars 에서 끌어온다 —
                   페이지 매핑이 바뀌면 썸네일이 따라온다(표를 두 벌 만들지 않는다) */
                const tv = themeVars(t);
                const btnR = tv["--lp-radius-btn"];
                const r = btnR === "999px" ? "999px" : `${Math.max(2, Math.round(parseInt(btnR, 10) * 0.35))}px`;
                return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onPick(t.key)}
                  aria-pressed={current === t.key}
                  className={cn(
                    "trans-state relative overflow-hidden rounded-card border bg-body text-left disabled:opacity-50",
                    current === t.key ? "border-primary ring-2 ring-primary/30" : "border-line hover:border-line-strong",
                  )}
                >
                  {/* 선택 배지 — 프리셋·글꼴이 같은 문법을 쓴다(테두리만으로는 어느 쪽이 «지금 것» 인지 흐리다).
                      ring-body 는 임의 색 스와치 위에서 코랄이 묻히지 않게 하는 halo 다 */}
                  {current === t.key ? (
                    <span className="absolute right-1 top-1 z-10 flex size-4 items-center justify-center rounded-chip bg-primary text-on-primary ring-2 ring-body" aria-hidden>
                      <Check className="size-3" />
                    </span>
                  ) : null}
                  <span className="block h-14 p-2" style={{ background: t.bg2 ? `linear-gradient(160deg, ${t.bg}, ${t.bg2})` : t.bg }}>
                    {/* 강조 막대 — 테마를 가르는 가장 센 신호 */}
                    <span className="block w-full" style={{ height: 18, background: t.accent, borderRadius: r }} aria-hidden />
                    {/* 카드 막대 위에 글자색을 얹는다 — 실제로도 본문은 카드 위에 놓인다 */}
                    <span
                      className="mt-1 flex items-center border px-1.5"
                      style={{ height: 18, background: t.card, borderColor: t.border, borderRadius: r, boxShadow: t.shadow ? tv["--lp-shadow"] : "none" }}
                      aria-hidden
                    >
                      <span className="text-[11px] font-semibold leading-none" style={{ color: t.fg }}>
                        Aa
                      </span>
                    </span>
                  </span>
                  <span className="block truncate px-2 py-1.5 text-[12px] font-semibold">{t.name}</span>
                </button>
                );
              })}
            </div>
          </div>
        ))}
      </DSection>

      <DSection icon={ImageIcon} tint="bg-tint-blue text-tint-blue-ink" title="배경" hint="단색·그라데이션·사진·워시·파스텔. 사진엔 필터를 덮어 글자를 살려요.">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={chip(bgTab === "solid")}
            aria-pressed={bgTab === "solid"}
            onClick={() => {
              setWantsImage(false);
              if (bgMode !== "solid" || custom.bgWash || custom.bgPastel) onCustomChange({ bg2: undefined, bgImage: undefined, bgWash: undefined, bgPastel: undefined, bg: custom.bg ?? preset.bg });
            }}
          >
            단색
          </button>
          <button
            type="button"
            className={chip(bgTab === "gradient")}
            aria-pressed={bgTab === "gradient"}
            /* 끝색 기본값은 배경에 강조색을 살짝 섞은 색 — 강조색 그대로면 기본·다크 프리셋에서 글자색과 같아 아래쪽 제목이 사라진다(감사2 U7) */
            onClick={() => {
              setWantsImage(false);
              if (bgMode !== "gradient" || custom.bgWash || custom.bgPastel) onCustomChange({ bgImage: undefined, bgWash: undefined, bgPastel: undefined, bg2: custom.bg2 ?? preset.bg2 ?? mixHex(custom.bg ?? preset.bg, custom.accent ?? preset.accent, 0.22) });
            }}
          >
            그라데이션
          </button>
          <button
            type="button"
            className={chip(bgTab === "image")}
            aria-pressed={bgTab === "image"}
            onClick={() => {
              setWantsImage(true);
              if (custom.bgWash || custom.bgPastel) onCustomChange({ bgWash: undefined, bgPastel: undefined });
            }}
          >
            사진
          </button>
          <button
            type="button"
            className={chip(bgTab === "wash")}
            aria-pressed={bgTab === "wash"}
            onClick={() => {
              setWantsImage(false);
              if (!custom.bgWash) onCustomChange({ bgWash: true, bgPastel: undefined });
            }}
          >
            프로필 워시
          </button>
          <button
            type="button"
            className={chip(bgTab === "pastel")}
            aria-pressed={bgTab === "pastel"}
            onClick={() => {
              setWantsImage(false);
              if (!custom.bgPastel) onCustomChange({ bgPastel: true, bgWash: undefined });
            }}
          >
            파스텔
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {colorInput("bg", bgTab === "gradient" ? "시작색" : "배경색")}
          {bgTab === "gradient" ? (
            <label className="flex items-center gap-2 rounded-card border border-line bg-body px-2.5 py-2 text-[14px]">
              <input type="color" value={custom.bg2 ?? preset.bg2 ?? "#FFFFFF"} onChange={(e) => onCustomChange({ bg2: e.target.value.toUpperCase() })} aria-label="그라데이션 끝색" className="size-7 cursor-pointer rounded-[6px] border-0 bg-transparent p-0" />
              <span className="font-medium">끝색</span>
            </label>
          ) : null}
        </div>
        {bgTab === "wash" ? (
          <p className="text-[12px] leading-[1.6] text-fg-sub">
            프로필 사진을 크게 흐려 은은한 파스텔처럼 깔아요 — 사진 색과 저절로 어울려요. 프로필 사진이 없으면 배경색만 보여요.
          </p>
        ) : null}
        {bgTab === "pastel" ? (
          <p className="text-[12px] leading-[1.6] text-fg-sub">
            군데군데 파스텔을 칠한 듯한 은은한 배경 — 버튼색을 살짝 섞어 내 페이지 톤이 돼요.
          </p>
        ) : null}
        {bgTab === "image" ? (
          /* 사진을 지우면 필터도 함께 지운다 — 안 그러면 사진 없는 페이지에 bgFilter 만 남아
             "직접 꾸민 것"으로 잡힌다(감사4). 사진이 있을 때만 필터가 의미를 갖는다 */
          <ImageField
            label="배경 사진 (선택)"
            value={custom.bgImage ?? ""}
            onChange={(v) => onCustomChange(v ? { bgImage: v } : { bgImage: undefined, bgFilter: undefined })}
            hint="넣으면 배경색·그라데이션보다 앞에 깔려요 — 글자가 읽히는지 미리보기로 확인하세요"
            aspect="aspect-[9/16]"
            cropAspect={9 / 16}
            maxW="max-w-[140px]"
          />
        ) : null}
        {bgTab === "image" && custom.bgImage ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] text-fg-sub">사진 필터</span>
            {CUSTOM_FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={(custom.bgFilter ?? "none") === f.key} /* 「없음」도 **값으로 저장한다** — undefined 로 두면 "손댄 적 없음"과 같아져
                   자동 필터(themeVars)를 끌 방법이 사라진다(소넷 확정). 사진을 지울 때 같이 지운다. */
                onClick={() => onCustomChange({ bgFilter: f.key })}
                className={chip((custom.bgFilter ?? "none") === f.key)}>
                {f.label}
              </button>
            ))}
          </div>
        ) : null}
      </DSection>

      <DSection icon={Droplet} tint="bg-tint-pink text-tint-pink-ink" title="색상" hint="버튼색은 채움 버튼·CTA 에, 카드색은 블록 판에, 글자색은 제목·본문에 쓰여요. 대비가 낮으면 자동으로 읽히는 쪽으로 바꿔요.">
        <div className="flex flex-wrap gap-2">
          {colorInput("accent", "버튼색")}
          {colorInput("card", "카드")}
          {colorInput("fg", "글자")}
        </div>
        {/* 테마 엔진이 대비를 지키려고 고른 색을 되돌리는 일이 있다 — 그 사실을 여기서 말해 준다.
            판정식은 themes.ts 의 themeVars 를 그대로 거울처럼 옮긴 것이다(4.5 기준이 바뀌면 여기도 같이 고친다) */}
        {custom.card && contrastRatio(custom.fg ?? preset.fg, custom.card) < 4.5 ? (
          <p className="flex items-start gap-1.5 rounded-card bg-tint-amber px-2.5 py-1.5 text-[12px] text-tint-amber-ink">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            글자색과 대비가 낮아 카드색은 프리셋 값으로 되돌려 칠했어요 — 글자색을 함께 바꿔 보세요.
          </p>
        ) : null}
        {(custom.accent || custom.bg) && contrastRatio(custom.accent ?? preset.accent, custom.bg ?? preset.bg) < 4.5 ? (
          <p className="flex items-start gap-1.5 rounded-card bg-tint-amber px-2.5 py-1.5 text-[12px] text-tint-amber-ink">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            배경과 대비가 낮아 버튼색 글자(외곽선·은은하게 버튼, 태그 칩·아이콘)는 본문색으로 그려요 — 채움 버튼 배경은 그대로예요.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-fg-sub">버튼색 적용</span>
          {CUSTOM_BUTTON_SCOPE.map((f) => (
            <button key={f.key} type="button" title={f.hint} aria-pressed={(custom.buttonScope ?? "partial") === f.key} onClick={() => onCustomChange({ buttonScope: f.key === "partial" ? undefined : f.key })} className={chip((custom.buttonScope ?? "partial") === f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </DSection>

      <DSection icon={Square} tint="bg-tint-coral text-tint-coral-ink" title="버튼" hint="링크 버튼의 모양·스타일·그림자·마우스 올렸을 때 움직임.">
        {(
          [
            /* 프리셋 기본값 선택은 undefined 로 — 안 그러면 이미 선택된 칩 재클릭이 보이지 않는
               영구 오버라이드를 만들어 프리셋을 갈아타도 옛 값이 박제된다(감사4, 88c0454 원칙) */
            ["모서리", CUSTOM_RADIUS, custom.radius ?? preset.radius, (k: string) => onCustomChange({ radius: (k === preset.radius ? undefined : k) as LinkThemeCustom["radius"] })],
            ["스타일", CUSTOM_BUTTONS, custom.buttonScope === "all" ? "fill" : (custom.button ?? "fill"), (k: string) => onCustomChange({ button: (k === "fill" ? undefined : k) as LinkThemeCustom["button"] })],
            ["그림자", CUSTOM_SHADOWS, custom.shadow ?? (preset.shadow ? "soft" : "none"), (k: string) => onCustomChange({ shadow: (k === (preset.shadow ? "soft" : "none") ? undefined : k) as LinkThemeCustom["shadow"] })],
            ["액션", CUSTOM_EFFECTS, custom.effect ?? "none", (k: string) => onCustomChange({ effect: (k === "none" ? undefined : k) as LinkThemeCustom["effect"] })],
          ] as const
        ).map(([lab, opts, cur, set]) => {
          /* 전체 적용이면 스타일(채움/외곽선/은은)은 의미가 없다 — 비활성 + 이유 */
          const off = lab === "스타일" && custom.buttonScope === "all";
          /* 「액션」은 마우스를 올려야 보이는 움직임이라 정지 그림으로 못 보여준다 — 칩 그대로 */
          const swatch = lab !== "액션";
          return (
            <div key={lab} className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 w-10 text-[12px] text-fg-sub">{lab}</span>
              {opts.map((o) => {
                if (!swatch) {
                  return (
                    <button key={o.key} type="button" disabled={off} aria-pressed={cur === o.key} onClick={() => set(o.key)} className={cn(chip(cur === o.key), off && "opacity-40")}>
                      {o.label}
                    </button>
                  );
                }
                /* 값을 손으로 다시 적지 않는다 — themeVars 를 다시 불러 **실제 발행본과 같은 값**으로 그린다.
                   그래야 카드 대비 가드·어두운 지면 그림자 같은 분기까지 스와치가 저절로 따라온다 */
                const base = varsFor({});
                const v = varsFor(
                  lab === "모서리" ? { radius: o.key as LinkThemeCustom["radius"] } : lab === "스타일" ? { button: o.key as LinkThemeCustom["button"] } : { shadow: o.key as LinkThemeCustom["shadow"] },
                );
                return (
                  <button
                    key={o.key}
                    type="button"
                    disabled={off}
                    aria-pressed={cur === o.key}
                    onClick={() => set(o.key)}
                    className={cn(
                      "trans-state relative flex cursor-pointer flex-col items-center rounded-card border p-2",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                      cur === o.key ? "border-primary ring-2 ring-primary/30" : "border-line bg-body hover:bg-tint-hover",
                      off && "opacity-40",
                    )}
                  >
                    {/* 프리셋·글꼴과 같은 선택 문법 — 1px 테두리(2.82:1)만으로는 «지금 것» 이 안 읽힌다 */}
                    {cur === o.key ? (
                      <span className="absolute right-1 top-1 z-10 flex size-4 items-center justify-center rounded-chip bg-primary text-on-primary ring-2 ring-body" aria-hidden>
                        <Check className="size-3" />
                      </span>
                    ) : null}
                    {lab === "모서리" ? (
                      <span className="block h-7 w-12" style={{ background: custom.accent ?? preset.accent, borderRadius: v["--lp-radius-btn"] }} aria-hidden />
                    ) : lab === "스타일" ? (
                      <span
                        className="flex h-7 w-12 items-center justify-center text-[12px] font-semibold"
                        style={{ background: v["--lp-btn-bg"], color: v["--lp-btn-fg"], border: `1.5px solid ${v["--lp-btn-border"]}`, borderRadius: v["--lp-radius-btn"] }}
                        aria-hidden
                      >
                        Aa
                      </span>
                    ) : (
                      /* 그림자는 **지면 위의 카드**로 그린다 — 흰 상자에 얹으면 어두운 테마·사진 배경의 분기를 못 보여준다 */
                      <span
                        className="flex h-7 w-12 items-center justify-center"
                        style={{ background: base["--lp-bg"], backgroundImage: base["--lp-bg-image"], backgroundSize: "cover", borderRadius: v["--lp-radius"] }}
                        aria-hidden
                      >
                        <span className="block h-4 w-8" style={{ background: base["--lp-card"], boxShadow: v["--lp-shadow"], borderRadius: v["--lp-radius"] }} />
                      </span>
                    )}
                    <span className="mt-1 block text-[11px] text-fg-sub">{o.label}</span>
                  </button>
                );
              })}
              {off ? <span className="text-[12px] text-fg-faint">— 「전체 적용」이면 모두 채움</span> : null}
            </div>
          );
        })}
      </DSection>

      <DSection
        icon={Type}
        tint="bg-tint-amber text-tint-amber-ink"
        title="글꼴"
        /* 찾은 개수가 곧 목록의 끝 신호다 — 페이드로 흐리면 다 본 뒤에도 마지막 줄이 영구히 흐려진다 */
        hint={fontQuery.trim() ? `${fonts.length}종 찾았어요.` : "한글 31종 + 영문 11종. 이름으로 찾아요."}
      >
        {/* 지우기 — 레퍼런스 검색(search-console)과 같은 관용구 */}
        <div className="relative flex items-center">
          <input
            value={fontQuery}
            onChange={(e) => setFontQuery(e.target.value)}
            placeholder="글꼴 검색 — 예: 명조, 손글씨, Inter"
            aria-label="글꼴 검색"
            className="h-10 w-full rounded-card border border-line bg-body px-3 pr-10 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
          />
          {fontQuery ? (
            <button
              type="button"
              onClick={() => setFontQuery("")}
              aria-label="검색어 지우기"
              className="trans-state absolute right-1 flex size-8 cursor-pointer items-center justify-center rounded-card text-fg-faint hover:bg-tint-hover hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto pr-1 md:grid-cols-3">
          {fonts.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={(custom.font ?? "sans") === f.key}
              onClick={() => onCustomChange({ font: f.key === "sans" ? undefined : f.key })}
              className={cn(
                "trans-state relative flex flex-col items-start rounded-card border px-3 py-2 text-left",
                (custom.font ?? "sans") === f.key ? "border-primary bg-primary/10" : "border-line bg-body hover:bg-tint-hover",
              )}
            >
              {(custom.font ?? "sans") === f.key ? (
                <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-chip bg-primary text-on-primary ring-2 ring-body" aria-hidden>
                  <Check className="size-3" />
                </span>
              ) : null}
              {/* 견본만 그 글꼴 — 이름표는 앱 글꼴 그대로 */}
              <span className="text-[17px] leading-tight" style={{ fontFamily: f.family }}>
                안녕하세요 Aa
              </span>
              <span className="mt-1 text-[11px] text-fg-sub">{f.label}</span>
            </button>
          ))}
          {fonts.length === 0 ? (
            <div className="col-span-full py-6 text-center">
              <p className="text-[14px] text-fg-sub">「{fontQuery}」와 맞는 글꼴이 없어요.</p>
              <Button variant="ghost" size="sm" className="mt-1" onClick={() => setFontQuery("")}>
                전체 보기
              </Button>
            </div>
          ) : null}
        </div>
      </DSection>

      <DSection icon={PanelTop} tint="bg-tint-teal text-tint-teal-ink" title="상단 메뉴 · 로고" hint="스크롤해도 붙어 있는 제목 줄, 공유·구독 버튼, 페이지 아래 로고.">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-fg-sub">상단 메뉴</span>
          {CUSTOM_TOPBAR.map((f) => (
            <button key={f.key} type="button" aria-pressed={(custom.topbar ?? "none") === f.key} onClick={() => onCustomChange({ topbar: f.key === "none" ? undefined : f.key })} className={chip((custom.topbar ?? "none") === f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        {/* 공유·구독 — 리틀리식 선택제 칩(2026-08-26 사장님 스크린샷 스펙): 기본값(비공개)만 무료,
            바꾸는 건 유료. 자물쇠 칩을 누르면 유료 안내가 뜬다. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-fg-sub">공유·구독 버튼</span>
          {(
            [
              { key: "none", label: "비공개", needsSub: false },
              { key: "both", label: "노출", needsSub: true },
              { key: "share", label: "공유", needsSub: false },
              { key: "sub", label: "구독", needsSub: true },
            ] as const
          ).map((o) => {
            const sel = custom.share && custom.subscribe ? "both" : custom.share ? "share" : custom.subscribe ? "sub" : "none";
            const locked = !paid && o.key !== "none";
            const noSub = o.needsSub && !hasSubscribeBlock && sel !== o.key;
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={sel === o.key}
                disabled={noSub}
                title={noSub ? "구독신청 블록을 먼저 추가하세요" : locked ? "유료 플랜에서 바꿀 수 있어요" : undefined}
                onClick={() => {
                  if (sel === o.key) return;
                  if (locked) {
                    onUpgrade();
                    return;
                  }
                  onCustomChange(
                    o.key === "both"
                      ? { share: true, subscribe: true }
                      : o.key === "share"
                        ? { share: true, subscribe: undefined }
                        : o.key === "sub"
                          ? { share: undefined, subscribe: true }
                          : { share: undefined, subscribe: undefined },
                  );
                }}
                className={cn(chip(sel === o.key), "inline-flex items-center gap-1", noSub && "opacity-50")}
              >
                {locked ? <Lock className="size-3" aria-hidden /> : null}
                {o.label}
              </button>
            );
          })}
        </div>

        {/* 로고 — [핀치 로고] [내 로고🔒] [로고 삭제🔒] (리틀리와 같은 3칩) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-fg-sub">로고</span>
          {(
            [
              { key: "finch", label: "핀치 로고" },
              { key: "custom", label: "내 로고" },
              { key: "none", label: "로고 삭제" },
            ] as const
          ).map((o) => {
            const sel = custom.logoImage || logoOpen ? "custom" : custom.badge === "hide" ? "none" : "finch";
            const locked = !paid && o.key !== "finch";
            return (
              <button
                key={o.key}
                type="button"
                aria-pressed={sel === o.key}
                title={locked ? "유료 플랜에서 바꿀 수 있어요" : undefined}
                onClick={() => {
                  if (o.key === "finch") {
                    setLogoOpen(false);
                    onCustomChange({ badge: undefined, logoImage: undefined, logoPos: undefined });
                    return;
                  }
                  if (locked) {
                    onUpgrade();
                    return;
                  }
                  if (o.key === "custom") {
                    setLogoOpen(true);
                    onCustomChange({ badge: undefined });
                  } else {
                    setLogoOpen(false);
                    onCustomChange({ badge: "hide", logoImage: undefined, logoPos: undefined });
                  }
                }}
                className={cn(chip((custom.logoImage || logoOpen ? "custom" : custom.badge === "hide" ? "none" : "finch") === o.key), "inline-flex items-center gap-1")}
              >
                {locked ? <Lock className="size-3" aria-hidden /> : null}
                {o.label}
              </button>
            );
          })}
        </div>
        {custom.logoImage || logoOpen ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <ImageField label="내 로고" value={custom.logoImage ?? ""} onChange={(v) => onCustomChange({ logoImage: v || undefined })} hint="핀치 배지 대신 이 로고가 보여요. PNG 투명 배경 권장" aspect="aspect-[4/1]" />
            {custom.logoImage ? (
              <div className="flex gap-1.5">
                {CUSTOM_LOGO_POS.map((f) => (
                  <button key={f.key} type="button" aria-pressed={(custom.logoPos ?? "bottom") === f.key} onClick={() => onCustomChange({ logoPos: f.key === "bottom" ? undefined : f.key })} className={chip((custom.logoPos ?? "bottom") === f.key)}>
                    {f.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </DSection>

      {/* 예전 hint 는 커서·스크롤까지 "공개 페이지에서만 움직인다"고 했는데 사실이 아니다 —
          미리보기도 --lp-cursor 와 스크롤 애니를 그대로 돌린다. 진짜로 미리보기에 없는 건 화면 효과뿐이다 */}
      <DSection
        icon={Sparkles}
        tint="bg-tint-green text-tint-green-ink"
        title="효과"
        hint="커서는 칩이나 폰 위에 올려 보면 바로 보여요. 스크롤 효과는 폰을 굴려 보세요. 화면 효과만 공개 페이지에서 보입니다."
      >
        {(
          [
            ["스크롤", CUSTOM_ANIMS, custom.anim ?? "none", (k: string) => onCustomChange({ anim: k === "none" ? undefined : (k as LinkThemeCustom["anim"]) })],
            ["커서", CUSTOM_CURSORS, custom.cursor ?? "default", (k: string) => onCustomChange({ cursor: k === "default" ? undefined : (k as LinkThemeCustom["cursor"]) })],
            ["화면", CUSTOM_SCREEN_FX, custom.screenFx ?? "none", (k: string) => onCustomChange({ screenFx: k === "none" ? undefined : (k as LinkThemeCustom["screenFx"]) })],
          ] as const
        ).map(([lab, opts, cur, set]) => (
          <div key={lab} className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 w-10 text-[12px] text-fg-sub">{lab}</span>
            {opts.map((o) => {
              /* 커서 줄에만 실제 커서·글리프를 건다 — 공용 루프라 lab 으로 갈라야 페이드·줌 칩에 별이 붙지 않는다 */
              const isCursor = lab === "커서";
              const isFx = lab === "화면";
              const FxIcon = o.key === "confetti" ? PartyPopper : o.key === "snow" ? Snowflake : o.key === "sparkle" ? Sparkles : null;
              const curImg = isCursor ? cursorImage(o.key as LinkThemeCustom["cursor"]) : undefined;
              return (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={cur === o.key}
                  onClick={() => set(o.key)}
                  className={chip(cur === o.key)}
                  /* 「기본」은 cursorCss 가 "auto"(truthy) 라 || 로는 안 걸린다 — 값으로 비교해 pointer 를 준다 */
                  style={isCursor ? { cursor: curImg ? cursorCss(o.key as LinkThemeCustom["cursor"]) : "pointer" } : undefined}
                >
                  {curImg ? (
                    <span
                      aria-hidden
                      className="mr-1 inline-block size-4 bg-center bg-no-repeat align-[-4px]"
                      style={{ backgroundImage: curImg, backgroundSize: "16px 16px" }}
                    />
                  ) : null}
                  {isFx && FxIcon ? <FxIcon aria-hidden className="mr-1 inline size-3.5 align-[-2px]" /> : null}
                  {o.label}
                </button>
              );
            })}
          </div>
        ))}
      </DSection>

      <DSection icon={Monitor} tint="bg-tint-slate text-tint-slate-ink" title="PC 레이아웃" hint="넓은 화면에서 프로필을 왼쪽에 떼어 두 칸으로 보여줄 수 있어요.">
        <div className="flex flex-wrap gap-1.5">
          {CUSTOM_DESKTOP.map((f) => (
            <button key={f.key} type="button" aria-pressed={(custom.desktop ?? "phone") === f.key} onClick={() => onCustomChange({ desktop: f.key === "phone" ? undefined : f.key })} className={chip((custom.desktop ?? "phone") === f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </DSection>

      {customSaveFailed ? (
        <p className="border-t border-line pt-5 text-[14px] text-negative">
          저장이 늦어지고 있어요 — 연결이 돌아오면 자동으로 저장돼요. 이 화면을 닫으면 마지막 변경이 빠질 수 있어요.
        </p>
      ) : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   통계 패널
   ══════════════════════════════════════════════════════════════════ */

/** 비율 막대 목록 — 유입·기기·지역 공통(분석 탭) */
function BarList({
  title,
  rows,
  empty,
  hint,
  color = "bg-primary",
  denom,
  restLabel = "나머지",
  icon: Icon,
  tint,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
  empty: string;
  hint?: string;
  /** 막대 색 — 섹션마다 다른 색(알록달록) */
  color?: string;
  /** 실제 분모 — SQL 이 상위 8개만 주므로 rows 합계는 100% 가 아니다(0058).
      분모를 rows 합계로 두면 "인스타 54%" 같은 부풀린 비중이 찍힌다 */
  denom?: number;
  /** 잘린 꼬리 행 이름 */
  restLabel?: string;
  /** 카드 정체 — 넷이 같은 격자에 있어 아이콘이 없으면 제목을 읽어야만 구분된다 */
  icon: LucideIcon;
  tint: string;
}) {
  const n = (v: number) => v.toLocaleString("ko-KR");
    const shown = rows.reduce((a, r) => a + r.value, 0);
    const total = denom && denom > shown ? denom : shown;
    const rest = total - shown;
    return (
      /* 카드(bg-body) **안**의 중첩 면이라 bg-plate — bg-body 면 흰 판 위 흰 판이라 단차가 0이다 */
      <div className="rounded-card border border-line bg-plate p-4">
        {/* h4 여야 한다 — 제목색(fg-strong)·자간을 globals.css 의 @layer base 가 h1~h4 에 일괄로 건다.
            p 에 크기만 올리면 본문색·기본 자간으로 남아 1px 차이만 생긴다(CLAUDE.md) */}
        <div className="flex items-center gap-2">
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-card", tint)} aria-hidden>
            <Icon className="size-4" />
          </span>
          <h4 className="text-[15px] font-semibold">{title}</h4>
        </div>
        {rows.length === 0 ? (
          <p className="mt-2 text-[14px] text-fg-sub">{empty}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((r, i) => (
              <li key={i}>
                <div className="flex items-baseline justify-between gap-2 text-[14px]">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="tnum shrink-0 font-semibold">
                    {n(r.value)} <span className="font-normal text-fg-sub">{total > 0 ? `${Math.round((r.value / total) * 100)}%` : ""}</span>
                  </span>
                </div>
                {/* 트랙은 상자(bg-plate)보다 밝게 — 면이 한 단계 내려갔으니 반전한다 */}
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-body" aria-hidden>
                  <span className={cn("block h-full rounded-full", color)} style={{ width: `${total > 0 ? Math.round((r.value / total) * 100) : 0}%` }} />
                </span>
              </li>
            ))}
            {/* 잘린 꼬리 — 안 보여주면 상위 8개가 전부인 것처럼 읽힌다 */}
            {rest > 0 ? (
              <li className="flex items-baseline justify-between gap-2 border-t border-line pt-2 text-[14px] text-fg-sub">
                <span className="min-w-0 truncate">{restLabel}</span>
                <span className="tnum shrink-0">
                  {n(rest)} {Math.round((rest / total) * 100)}%
                </span>
              </li>
            ) : null}
          </ul>
        )}
        {hint ? <p className="mt-2 text-[11px] text-fg-sub">{hint}</p> : null}
      </div>
    );
  }

const STAT_RANGES: Array<{ days: number; label: string }> = [
  { days: 1, label: "오늘" },
  { days: 7, label: "7일" },
  { days: 30, label: "30일" },
  { days: 90, label: "3개월" },
  { days: 180, label: "6개월" },
  { days: 365, label: "1년" },
];

function StatsPanel({
  stats,
  blocks,
  onRange,
  onRetry,
  onGoMarketing,
  pending,
  busy,
}: {
  stats: LinkStats;
  /** 초안 블록 순서 — 블록별 클릭을 「페이지 순서」로 정렬할 때 기준 */
  blocks: LinkBlock[];
  onRange: (days: number) => void;
  onRetry: () => void;
  /** 0건 빈 상태에서 「마케팅 탭 열기」 — 유입 태깅 주소를 복사하러 보낸다 */
  onGoMarketing: () => void;
  /** 기간 왕복 중 — 지금 보이는 숫자는 옛 기간 값이다 */
  pending: boolean;
  busy: boolean;
}) {
  /* 분모가 0이면 비율은 "0%"가 아니라 **모름**이다. 0% 로 찍으면 성과가 나쁜 것처럼 읽힌다 */
  const ratio = (v: number, denom: number) => (denom > 0 ? `${v}%` : "—");
  const maxBlock = Math.max(1, ...stats.blocks.map((b) => b.clicks));
  const [blockSort, setBlockSort] = useState<"clicks" | "order">("clicks");
  const order = new Map(blocks.map((b, i) => [b.id, i]));
  const sortedBlocks =
    blockSort === "clicks"
      ? stats.blocks
      : [...stats.blocks].sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
  /* 순위는 언제나 클릭 기준 — 「페이지 순서」로 정렬해도 1·2·3위 표식은 따라간다 */
  const rankById = new Map(stats.blocks.map((b, i) => [b.id, i]));
  const rangeLabel = STAT_RANGES.find((r) => r.days === stats.days)?.label ?? `${stats.days}일`;
  const n = (v: number) => v.toLocaleString("ko-KR");
  /* 집계 실패는 「모름」이지 「0」이 아니다 — 0 을 찍으면 멀쩡한 페이지를 갈아엎는다 */
  const nv = (v: number) => (stats.failed ? "—" : n(v));
  /* 아직 아무도 안 온 페이지 — 빈 카드 아홉 장 대신 할 일을 한 번만 말한다.
     failed 는 뺀다: 집계 실패를 «방문 없음» 으로 뭉개면 안 된다 */
  const blank = !stats.failed && stats.views === 0 && stats.clicks === 0;
  /* 일별 추이 공통 축의 최댓값 — 눈금 라벨과 차트가 같은 값을 봐야 한다 */
  const dayMax = Math.max(1, ...stats.daily.map((d) => Math.max(d.views, d.clicks)));

  type StatCard = { label: string; value: string; icon: LucideIcon; tint: string; unknown?: boolean; tip?: string };
  /* 원자 지표 — 먼저 얼마나 왔나. 28px 는 sm 부터다(375px·3칸이면 다섯 자리가 카드를 넘는다) */
  const primaryCards: StatCard[] = [
    { label: "페이지뷰", value: nv(stats.views), icon: Eye, tint: "bg-tint-blue text-tint-blue-ink", unknown: stats.failed },
    {
      label: "방문자",
      value: nv(stats.uniques),
      icon: User,
      tint: "bg-tint-green text-tint-green-ink",
      unknown: stats.failed,
      tip: "쿠키로 사람을 구분해요. 쿠키를 지웠거나 막은 방문은 여기서 빠져요.",
    },
    { label: "클릭", value: nv(stats.clicks), icon: MousePointerClick, tint: "bg-tint-coral text-tint-coral-ink", unknown: stats.failed },
  ];
  /* 파생 비율 — 그중 얼마가 눌렀나. 「클릭률」이 아니라 「조회당 클릭」이라 100% 를 넘을 수 있다 */
  const derivedCards: StatCard[] = [
    {
      label: "조회당 클릭",
      value: ratio(stats.ctr, stats.views),
      icon: Percent,
      tint: "bg-tint-purple text-tint-purple-ink",
      tip: "클릭 ÷ 페이지뷰. 같은 사람이 30분 안에 다시 와도 조회는 1로 묶지만 클릭은 전부 세기 때문에 100%를 넘을 수 있어요.",
    },
    {
      label: "재방문율",
      value: ratio(stats.returning, stats.uniques),
      icon: RotateCcw,
      tint: "bg-tint-amber text-tint-amber-ink",
      tip: "2번 이상 온 사람 ÷ 사람 수를 셀 수 있었던 방문자. 쿠키가 없어 사람을 못 가른 방문은 분모에서 빠져요.",
    },
    {
      label: "평균 체류",
      value: stats.dwell.n > 0 ? dwellLabel(stats.dwell.avgMs) : "—",
      icon: Clock,
      tint: "bg-tint-teal text-tint-teal-ink",
      /* n=0 이면 카드 값이 «—» 다 — 팁이 "표본 0건" 이라고 숫자를 말하면 서로 어긋난다 */
      tip:
        stats.dwell.n > 0
          ? `페이지를 닫을 때 보내는 신호가 닿은 방문만 평균 냈어요(표본 ${stats.dwell.n.toLocaleString("ko-KR")}건).`
          : "페이지를 닫을 때 보내는 신호가 닿은 방문만 평균 내요. 아직 신호가 닿은 방문이 없어요.",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold">분석</h3>
          <p className="mt-0.5 text-[14px] text-fg-sub">설정 없이 자동으로 집계돼요. 누가 얼마나 와서 무엇을 눌렀는지 — 기간은 한국 시간 자정 기준.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 탭 내비와 같은 «트랙 안 알약» — 낱개 테두리 버튼 6개는 어느 것이 한 묶음인지 알려주지 않는다.
              트랙은 rounded-card 다: 좁은 화면에서 줄바꿈돼도 모양이 무너지지 않는다 */}
          <div className="flex flex-wrap items-center gap-0.5 rounded-card bg-plate p-0.5" role="group" aria-label="조회 기간">
            {STAT_RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                disabled={busy}
                onClick={() => onRange(r.days)}
                aria-pressed={stats.days === r.days}
                className={cn(
                  /* 세그먼티드 트랙 안이라 py 를 키우면 트랙이 커진다 — 히트영역만 넓힌다 */
                  "trans-state relative rounded-chip px-2.5 py-1 text-[12px] font-semibold before:absolute before:-inset-y-[9px] before:inset-x-0 before:content-[''] disabled:opacity-50",
                  stats.days === r.days ? "bg-primary text-on-primary" : "text-fg-sub hover:text-fg",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {/* CSV — 화면이 든 데이터를 그대로 내린다. 집계 실패 상태의 0 을 파일로 내보내면
              화면을 고쳐도 거짓이 파일에 남는다 */}
          <Button
            variant="secondary"
            size="sm"
            disabled={stats.failed}
            title={stats.failed ? "통계를 불러오지 못해 내려받을 수 없어요" : undefined}
            onClick={() =>
              downloadCsv(`핀치-프로필링크-분석-${rangeLabel}.csv`, [
                ["구분", "값"],
                ["기간", rangeLabel],
                ["조회수", stats.views],
                ["방문자", stats.uniques],
                ["클릭", stats.clicks],
                ["조회당 클릭(%)", stats.ctr],
                ["재방문율(%)", stats.returning],
                ...(stats.dwell.n > 0 ? [["평균 체류(초)", Math.round(stats.dwell.avgMs / 1000)], ["체류 표본", stats.dwell.n]] : []),
                [],
                ["날짜", "조회수", "클릭"],
                ...stats.daily.map((d) => [d.date, d.views, d.clicks] as Array<string | number>),
                [],
                ["블록", "클릭", "상태"],
                ...stats.blocks.map((b) => [b.label, b.clicks, b.removed ? "지운 블록" : ""] as Array<string | number>),
                [],
                ["지역", "국가", "조회수"],
                ...stats.regions.map((r) => [r.region, r.country, r.views] as Array<string | number>),
                ...(stats.sources.length ? [[], ["유입 채널", "조회수"], ...stats.sources.map((x) => [(x.src && SRC_LABEL.get(x.src)) ?? "직접·기타", x.views] as Array<string | number>)] : []),
                ...(stats.devices.length ? [[], ["기기", "조회수"], ...stats.devices.map((x) => [DEVICE_LABEL.get(x.device ?? "") ?? "알 수 없음", x.views] as Array<string | number>)] : []),
                ...(stats.referrers.length ? [[], ["유입 경로", "조회수"], ...stats.referrers.map((x) => [x.host ?? "직접 입력·앱 내부", x.views] as Array<string | number>)] : []),
              ])
            }
          >
            <Download className="size-3.5" aria-hidden />
            CSV
          </Button>
        </div>
      </div>

      {/* 집계 실패를 0 으로 뭉개면 "성과 0" 으로 읽힌다 — 멀쩡한 페이지를 갈아엎게 만든다 */}
      {stats.failed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-negative/40 bg-negative-weak p-3">
          <span role="alert" className="text-[14px] text-negative-strong">
            통계를 불러오지 못했어요 — 성과가 0이라는 뜻이 아니에요.
          </span>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            다시 시도
          </Button>
        </div>
      ) : null}

      {/* 기간 왕복 중에는 아래 내용이 **옛 기간의 값**이다 — 흐려서 그 사실을 말한다.
          툴바(기간 칩·CSV)는 선명하게 둔다: 흐린 칩을 다시 누르게 만들면 안 된다 */}
      <div className={cn("space-y-6", pending && "trans-state opacity-60")} aria-busy={pending}>

      {/* 요약 — **원자 3(얼마나 왔나) / 파생 3(그중 얼마가 눌렀나)** 두 줄로 나눈다.
          여섯 칸이 같은 크기·같은 굵기면 핵심 지표가 먼저 눈에 오지 않는다.
          자체 산출 지표에는 InfoTip 으로 계산 근거를 단다(CLAUDE.md — 출처 배지와 달리 이건 유지한다) */}
      {[
        { rows: primaryCards, big: true },
        { rows: derivedCards, big: false },
      ].map((grp, gi) => (
        <div key={gi} className={cn("grid grid-cols-3 gap-2", gi === 1 && "-mt-4")}>
          {grp.rows.map((c) => (
            <div key={c.label} className="rounded-card border border-line bg-plate px-3 py-3">
              <span className={cn("mb-2 flex size-7 items-center justify-center rounded-card", c.tint)} aria-hidden>
                <c.icon className="size-4" />
              </span>
              {/* break-keep — 한글은 기본값이 아무 데서나 끊겨 「조회당 클릭」이 "조회당 클/릭" 이 된다 */}
              <p className="flex items-center gap-1 break-keep text-[12px] text-fg-sub">
                {c.label}
                {c.tip ? <InfoTip>{c.tip}</InfoTip> : null}
              </p>
              <p className={cn("tnum mt-0.5 text-[20px] font-bold leading-none", grp.big && "sm:text-[28px]", c.unknown && "text-fg-faint")}>
                {c.value}
                {c.unknown ? <span className="sr-only">불러오지 못함</span> : null}
              </p>
            </div>
          ))}
        </div>
      ))}
      {/* 실패했으면 여기부터는 그리지 않는다 — "아직 클릭이 없어요"는 모름을 없음이라 말하는 거짓말이다.
          요약 6칸은 남긴다: 지표 이름과 «—» 가 나란히 있어야 "모른다"가 읽힌다 */}
      {blank ? (
        <EmptyState
          icon={BarChart3}
          title="아직 방문이 없어요"
          description="주소를 인스타 프로필·카톡 프로필에 걸어 두면 여기에 조회와 클릭이 쌓여요. 어디서 왔는지까지 나눠 보려면 마케팅 탭의 「플랫폼별 링크」를 복사해 쓰세요."
          action={
            <Button size="sm" variant="secondary" onClick={onGoMarketing}>
              마케팅 탭 열기
            </Button>
          }
        />
      ) : stats.failed ? null : (
        <>
      {/* 추이 */}
      <div className="rounded-card border border-line bg-plate p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[15px] font-semibold">일별 추이</h4>
          <span className="flex items-center gap-2.5 text-[11px] text-fg-sub">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-tint-blue-ink" aria-hidden />
              페이지뷰
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-tint-coral-ink" aria-hidden />
              클릭
            </span>
          </span>
        </div>
        {stats.daily.length < 2 ? (
          <p className="mt-2 text-[14px] text-fg-sub">
            오늘 페이지뷰 <span className="tnum font-semibold text-fg">{n(stats.daily[0]?.views ?? 0)}</span> · 클릭 <span className="tnum font-semibold text-fg">{n(stats.daily[0]?.clicks ?? 0)}</span> — 추이는 이틀 이상일 때 선으로 보여요.
          </p>
        ) : stats.daily.some((d) => d.views > 0 || d.clicks > 0) ? (
          <>
            {/* 두 선을 **공통 0~최댓값** 축에 올린다 — 각자 정규화하면 클릭 3건이 페이지뷰 300건과
                같은 높이로 그려져 "클릭이 조회만큼 나온다"로 읽힌다. 눈금은 HTML 로 얹는다:
                차트가 preserveAspectRatio="none" 이라 SVG 안 글자는 가로로 늘어난다 */}
            <div className="relative mt-2 pl-9">
              {/* 14px = charts.tsx 의 padY. translate 로 라벨 중심을 선에 맞춘다 */}
              <span className="tnum absolute left-0 top-[14px] -translate-y-1/2 text-[11px] leading-none text-fg-sub">{n(dayMax)}</span>
              <span className="tnum absolute bottom-[14px] left-0 translate-y-1/2 text-[11px] leading-none text-fg-sub">0</span>
              <DualLineChart
                height={180}
                scale="shared0"
                series={[
                  /* 요약 카드(페이지뷰=파랑·클릭=코랄)와 같은 토큰 — 한 항목이 카드→범례→선까지 같은 색이다.
                     positive 는 «상승» 전용 의미색이라 계열색으로 쓰지 않는다 */
                  { data: stats.daily.map((d) => d.views), stroke: "var(--color-tint-blue-ink)" },
                  { data: stats.daily.map((d) => d.clicks), stroke: "var(--color-tint-coral-ink)" },
                ]}
              />
            </div>
            <div className="mt-1 flex justify-between pl-9 text-[11px] text-fg-sub">
              <span className="tnum">{stats.daily[0]?.date ?? ""}</span>
              <span className="tnum">{stats.daily[stats.daily.length - 1]?.date ?? ""}</span>
            </div>
          </>
        ) : (
          <p className="mt-2 text-[14px] text-fg-sub">아직 데이터가 없어요.</p>
        )}
      </div>

      {/* 블록별 클릭 — 예전엔 옆에 「BEST 클릭」 카드가 따로 있었는데 같은 목록의 앞 3줄이었다.
          순위 표식을 이 목록이 직접 달아 카드 하나를 없앴다 */}
      <div>
        <div className="rounded-card border border-line bg-plate p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[15px] font-semibold">블록별 클릭</h4>
            {/* 이 카드는 bg-plate 라 트랙은 한 단계 밝은 bg-body 로 반전한다(같은 색이면 트랙이 사라진다) */}
            <div className="flex flex-wrap items-center gap-0.5 rounded-card bg-body p-0.5" role="group" aria-label="정렬">
              {(
                [
                  ["clicks", "클릭순"],
                  ["order", "페이지 순서"],
                ] as const
              ).map(([k, lab]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={blockSort === k}
                  onClick={() => setBlockSort(k)}
                  className={cn(
                    "trans-state rounded-chip px-2.5 py-1 text-[12px] font-semibold",
                    blockSort === k ? "bg-primary text-on-primary" : "text-fg-sub hover:text-fg",
                  )}
                >
                  {lab}
                </button>
              ))}
            </div>
          </div>
          {sortedBlocks.length === 0 ? (
            <p className="mt-2 text-[14px] text-fg-sub">아직 클릭이 없어요.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {sortedBlocks.slice(0, 20).map((b, i) => {
                /* ?? 0 이면 스냅샷에 없는 id 가 금메달이 된다 */
                const r = rankById.get(b.id) ?? i;
                return (
                  <li key={b.id} className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "tnum flex size-6 shrink-0 items-center justify-center rounded-chip text-[11px] font-bold",
                        r === 0 ? "bg-primary text-on-primary" : r < 3 ? "bg-tint-coral text-tint-coral-ink" : "text-fg-sub",
                      )}
                    >
                      {r + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        {/* fg-faint 는 본문 금지(플레이스홀더·아이콘 전용) — 취소선이 이미 「지운 블록」을 말한다 */}
                        <span className={cn("min-w-0 truncate text-[14px]", b.removed && "text-fg-sub line-through")}>{b.label}</span>
                        <span className="tnum shrink-0 text-[14px] font-semibold">
                          {n(b.clicks)} <span className="font-normal text-fg-sub">{stats.clicks > 0 ? `${Math.round((b.clicks / stats.clicks) * 100)}%` : ""}</span>
                        </span>
                      </div>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-body" aria-hidden>
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((b.clicks / maxBlock) * 100)}%` }} />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {/* 유입 4칸은 막대 길이가 곧 % 인데 여기만 다르다 — 그 차이를 밝혀 둔다 */}
          <p className="mt-2 text-[11px] text-fg-sub">막대는 1위 대비 길이예요(%는 전체 클릭 중 몫). 취소선은 초안에서 지웠지만 라이브에서 눌린 블록이에요.</p>
        </div>
      </div>

      {/* 유입 4칸 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <BarList
          color="bg-tint-coral-ink"
          title="유입 채널"
          icon={Share2} tint="bg-tint-coral text-tint-coral-ink"
          denom={stats.views}
          rows={stats.sources.map((x) => ({ label: (x.src && SRC_LABEL.get(x.src)) ?? "직접·기타", value: x.views }))}
          empty="마케팅 탭의 「플랫폼별 링크」로 복사한 주소로 들어온 방문이 여기 잡혀요."
        />
        <BarList
          color="bg-tint-blue-ink"
          title="유입 경로"
          icon={Link2} tint="bg-tint-blue text-tint-blue-ink"
          denom={stats.views}
          rows={stats.referrers.map((x) => ({ label: x.host ?? "직접 입력·앱 내부", value: x.views }))}
          empty="아직 유입 경로 정보가 없어요."
          hint="브라우저가 알려준 이전 페이지(호스트만). 인스타·카톡 앱 안에서 온 방문은 대개 「직접 입력·앱 내부」예요."
        />
        <BarList
          color="bg-tint-purple-ink"
          title="기기"
          icon={Smartphone} tint="bg-tint-purple text-tint-purple-ink"
          denom={stats.views}
          rows={stats.devices.map((x) => ({ label: DEVICE_LABEL.get(x.device ?? "") ?? "알 수 없음", value: x.views }))}
          empty="아직 기기 정보가 없어요."
        />
        <BarList
          color="bg-tint-teal-ink"
          title="지역"
          icon={MapPin} tint="bg-tint-teal text-tint-teal-ink"
          denom={stats.views}
          /* regions 만 country is not null 조건이 있어 잔여에 국가 미상 방문이 섞인다 — 이름으로 그 사실을 드러낸다 */
          restLabel="나머지·지역 미확인"
          rows={stats.regions.map((r) => ({ label: [r.region, r.country].filter(Boolean).join(", "), value: r.views }))}
          empty="아직 지역 정보가 없어요."
        />
      </div>
        </>
      )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   설정 패널
   ══════════════════════════════════════════════════════════════════ */

function PlatformLinks({ baseUrl }: { baseUrl: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(`${baseUrl}?src=${key}`);
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-body px-4 py-3">
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
  guestbookFailed = false,
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
  guestbookFailed?: boolean;
  guestbook: LinkGuestbookEntry[];
  busy: boolean;
  /** onDone 은 성공했을 때만 불린다 — 실패하면 입력창·초안을 그대로 둔다(감사4: 500자 답글 유실) */
  onGuestbookReply: (id: number, reply: string, onDone: () => void) => void;
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
  /* 방명록 본문은 500자까지 들어온다 — 접어 두고 필요할 때만 편다 */
  const [openGb, setOpenGb] = useState<number | null>(null);
  const shownLeads = kindFilter === "all" ? leads : leads.filter((l) => l.kind === kindFilter);
  /* 카드는 총 건수(서버 count) — 없으면(데모) 목록을 센다 */
  /* 카드는 총 건수(서버 count). 화면에 들어온 행 수를 **하한**으로 깐다 —
     count 만 실패해 0 이 오면 "3건이 보이는데 0건"이라고 말하게 된다 */
  const counts = {
    contact: Math.max(leadCounts?.contact ?? 0, leads.filter((l) => l.kind === "contact").length),
    subscribe: Math.max(leadCounts?.subscribe ?? 0, leads.filter((l) => l.kind === "subscribe").length),
    guestbook: Math.max(leadCounts?.guestbook ?? 0, guestbook.length),
    unreplied: guestbook.filter((g) => !g.reply && !g.hidden).length,
  };
  /* 답글 없는 글만 보기 — 인박스에서 남은 일을 골라내는 유일한 수단 */
  const [gbFilter, setGbFilter] = useState<"all" | "unreplied">("all");
  const shownGuest = gbFilter === "all" ? guestbook : guestbook.filter((g) => !g.reply && !g.hidden);
  /* 날짜는 KST 로 — UTC ISO 를 10자 자르면 새벽 0~9시 접수가 전날로 보인다(감사3) */
  const dayOf = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)).replace(/\.\s?/g, "-").replace(/-$/, "");
  /* 시각도 같은 KST 로 — 접힌 행(dayOf)과 펼친 줄이 다른 날짜를 말하면 안 된다.
     toLocaleString 은 **보는 사람의 시간대**라 해외 접속 시 하루가 어긋났다 */
  const timeOf = (iso: string) =>
    `${dayOf(iso)} ${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))}`;

  return (
    <div className="space-y-4">
      {/* 형제 탭(디자인·분석·마케팅)과 같은 17 semibold — 탭을 오갈 때 같은 자리의 제목이 움직이지 않는다.
          동시에 안쪽 소제목(14 semibold)보다 커져 위계가 굵기 하나에만 걸리지 않는다 */}
      <div>
        <h3 className="text-[17px] font-semibold">관리</h3>
        <p className="mt-0.5 text-[14px] text-fg-sub">방문자가 남긴 문의·구독 신청·방명록이 여기 모여요.</p>
      </div>

      {/* 건수 요약 — 리틀리 관리 탭 상단 카드 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          /* 조회 실패면 0 이 아니라 «—» — 0 은 「아무도 안 보냈다」는 사실 주장이라 실패했을 땐 거짓이다
             (분석 탭의 ratio·nv 와 같은 규칙) */
          { label: "문의", value: leadsFailed ? "—" : counts.contact.toLocaleString("ko-KR"), unknown: leadsFailed, icon: MessageSquare, tint: "bg-tint-blue text-tint-blue-ink", sub: undefined as string | undefined },
          { label: "구독", value: leadsFailed ? "—" : counts.subscribe.toLocaleString("ko-KR"), unknown: leadsFailed, icon: Mail, tint: "bg-tint-green text-tint-green-ink", sub: undefined as string | undefined },
          { label: "방명록", value: leadsFailed || guestbookFailed ? "—" : counts.guestbook.toLocaleString("ko-KR"), unknown: leadsFailed || guestbookFailed, icon: BookOpen, tint: "bg-tint-pink text-tint-pink-ink", sub: counts.unreplied ? `답글 없음 ${counts.unreplied}` : undefined },
        ].map((c) => (
          <div key={c.label} className="rounded-card border border-line bg-plate px-3 py-2.5">
            <span className={cn("mb-1.5 flex size-7 items-center justify-center rounded-card", c.tint)} aria-hidden>
              <c.icon className="size-4" />
            </span>
            <p className="text-[12px] text-fg-sub">{c.label}</p>
            <p className={cn("tnum mt-0.5 text-[20px] font-bold leading-none", c.unknown && "text-fg-faint")}>
              {c.value}
              {c.unknown ? <span className="sr-only">불러오지 못함</span> : null}
            </p>
            {c.sub ? <p className="mt-1 text-[11px] text-primary-ink">{c.sub}</p> : null}
          </div>
        ))}
      </div>
      {leadsFailed ? (
        <p role="alert" className="rounded-card border border-negative/40 bg-negative-weak px-3 py-2 text-[14px] text-negative-strong">
          받은 내용을 불러오지 못했어요 — 새로고침해 주세요. (아무도 안 보낸 게 아니라 조회가 실패한 거예요.)
        </p>
      ) : null}

      {/* 받은 내용 — 문의받기·구독신청 블록이 약속한 자리.
          이게 없으면 방문자가 남긴 게 어디로 갔는지 알 수 없다(편집기가 여기를 가리킨다).
          판을 씌운다 — 맨몸으로 두면 분석 탭과 구조가 달라 같은 편집기로 안 읽힌다.
          카드(bg-body) 안이므로 면은 bg-plate 다(흰 판 위 흰 판 금지) */}
      <div className="rounded-card border border-line bg-plate p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <p className="text-[14px] font-semibold text-fg">받은 내용</p>
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
                    /* 24px 짜리 칩이라 손가락으로 못 누른다 — 보이는 크기는 두고 히트영역만 위아래로 넓힌다(44px) */
                    "trans-state relative rounded-chip px-2 py-0.5 text-[11px] font-semibold before:absolute before:-inset-y-[10px] before:inset-x-0 before:content-['']",
                    kindFilter === k ? "bg-primary text-on-primary" : "border border-line text-fg-sub hover:bg-tint-hover hover:text-fg",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* CSV — 목록 50건이 아니라 **전체**를 서버에서 받아 내린다. 0건이어도 자리를 비우지 않는다:
              첫 리드가 들어오는 순간 헤더 높이가 뛰는 것도 막는다. 분석 탭 CSV 와 같은 부품 */}
          <Button
            variant="secondary"
            size="sm"
            onClick={onExportLeads}
            disabled={busy || (counts.contact + counts.subscribe === 0 && !leadsFailed)}
            title={counts.contact + counts.subscribe === 0 && !leadsFailed ? "아직 받은 내용이 없어요" : undefined}
          >
            <Download className="size-3.5" aria-hidden />
            CSV 전체
          </Button>
        </div>
        {shownLeads.length === 0 ? (
          /* 조회 실패면 빈 상태를 그리지 않는다 — 위 경고가 이미 설명했고,
             여기서 "아직 없어요"라고 단정하면 실패를 「아무도 안 보냄」으로 뭉갠다 */
          leadsFailed ? null : (
            <div className="mt-3">
              <EmptyState
                icon={Inbox}
                title={leads.length === 0 ? "아직 받은 내용이 없어요" : "이 종류로 들어온 내용이 없어요"}
                description={leads.length === 0 ? "「문의받기」·「구독신청」 블록을 페이지에 두면 방문자가 남긴 내용이 여기에 쌓여요." : undefined}
              />
            </div>
          )
        ) : (
          <>
          <ul className="mt-2 max-h-96 divide-y divide-line overflow-y-auto">
            {shownLeads.map((l) => {
              const open = openLead === l.id;
              return (
                <li key={l.id} className="py-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenLead(open ? null : l.id)}
                    aria-expanded={open}
                    /* 눌리는 줄인데 마우스·키보드에 아무 반응이 없었다 — 틴트와 포커스 링을 준다 */
                    className="trans-state flex w-full flex-wrap items-center gap-2 rounded-card px-2 py-1 text-left hover:bg-tint-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {/* 위 카드가 문의=파랑·구독=초록으로 약속했다 — 목록에서 회색으로 뭉개면 그 약속이 깨진다 */}
                    <span
                      className={cn(
                        "rounded-chip px-2 py-0.5 text-[11px] font-semibold",
                        l.kind === "subscribe" ? "bg-tint-green text-tint-green-ink" : "bg-tint-blue text-tint-blue-ink",
                      )}
                    >
                      {l.kind === "subscribe" ? "구독" : "문의"}
                    </span>
                    <span className="text-[14px] font-semibold">{l.name || l.email || l.phone || "(이름 없음)"}</span>
                    <span className="tnum ml-auto text-[12px] text-fg-sub">{dayOf(l.createdAt)}</span>
                    <ChevronDown className={cn("trans-state size-4 shrink-0 text-fg-sub", open && "rotate-180")} aria-hidden />
                  </button>
                  {l.email || l.phone ? (
                    <p className="mt-0.5 px-2 text-[12px] text-fg-sub">{[l.email, l.phone].filter(Boolean).join(" · ")}</p>
                  ) : null}
                  {/* 공백 없는 긴 주문번호·URL 이 가로로 터져 목록에 스크롤바를 만들던 것 */}
                  {l.message ? <p className={cn("mt-1 whitespace-pre-wrap break-words px-2 text-[14px]", !open && "line-clamp-2")}>{l.message}</p> : null}
                  {open ? (
                    <div className="mt-1.5 flex flex-wrap gap-1 px-2">
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
                      <p className="tnum w-full px-2 text-[11px] text-fg-sub">접수 {timeOf(l.createdAt)}</p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {/* 꼬리말은 스크롤 상자 **밖**에 — 안에 있으면 끝까지 굴려야 보인다.
              "최근 N건" 은 필터가 걸려 12건만 보일 때도 참인 진술이다 */}
          {counts.contact + counts.subscribe > leads.length || leads.length >= 50 ? (
            <p className="mt-2 border-t border-line pt-2 text-[12px] text-fg-sub">
              최근 <span className="tnum font-semibold text-fg">{leads.length}</span>건까지만 불러와요 — 지금까지 받은{" "}
              <span className="tnum font-semibold text-fg">{(counts.contact + counts.subscribe).toLocaleString("ko-KR")}</span>건 전체는 위 「CSV 전체」로 받으세요.
            </p>
          ) : null}
          </>
        )}
      </div>

      {/* 방명록 — 방문자 글에 답글·숨김·삭제(리틀리 「답글 및 삭제」 카피, 4단계) */}
      <div className="rounded-card border border-line bg-plate p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 숫자는 카드와 같은 **전체** 건수 — 목록은 최근 50건이라 둘이 다르면 어느 쪽이 맞는지 알 수 없다 */}
          <p className="text-[14px] font-semibold text-fg">
            방명록 {counts.guestbook ? <span className="tnum">{counts.guestbook.toLocaleString("ko-KR")}</span> : null}
            {guestbook.length < counts.guestbook ? <span className="ml-1 text-[12px] font-normal text-fg-sub">· 최근 {guestbook.length}건 표시</span> : null}
          </p>
          {/* 미답변만 보기 — 답글 달 일이 남았는지 목록 어디에도 표시가 없었다.
              칩은 개수가 아니라 목록 유무로 건다: 마지막 하나에 답글을 달아 0이 돼도 되돌릴 칩이 남아야 한다 */}
          {guestbook.length > 0 ? (
            <div className="flex gap-1" role="group" aria-label="답글 상태">
              {(
                [
                  ["all", "전체"],
                  ["unreplied", counts.unreplied ? `답글 없음 ${counts.unreplied}` : "답글 없음"],
                ] as const
              ).map(([k, labelText]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={gbFilter === k}
                  onClick={() => setGbFilter(k)}
                  className={cn(
                    "trans-state relative rounded-chip px-2 py-0.5 text-[11px] font-semibold before:absolute before:-inset-y-[10px] before:inset-x-0 before:content-['']",
                    gbFilter === k ? "bg-primary text-on-primary" : "border border-line text-fg-sub hover:bg-tint-hover hover:text-fg",
                  )}
                >
                  {labelText}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {shownGuest.length === 0 ? (
          guestbookFailed ? (
            /* 조회가 실패한 것을 「글이 없다」고 단정하면 안 된다 — 받은 내용 칸과 같은 규칙(감사5 확정) */
            <p role="alert" className="mt-2 rounded-card border border-negative/40 bg-negative-weak px-3 py-2 text-[14px] text-negative-strong">
              방명록을 불러오지 못했어요 — 새로고침해 주세요. (글이 없는 게 아니라 조회가 실패한 거예요.)
            </p>
          ) : guestbook.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon={BookOpen}
                title="아직 방명록 글이 없어요"
                description="「방명록」 블록을 페이지에 두면 방문자 글이 여기에 쌓여요. 답글을 달면 공개 페이지에 함께 보여요."
              />
            </div>
          ) : (
            /* 필터가 걸려 비었을 뿐이다 — 빈 상태 그림을 띄우면 "글이 하나도 없다"로 읽힌다 */
            <p className="mt-2 text-[14px] text-fg-sub">답글 없는 글이 없어요 — 다 답했어요.</p>
          )
        ) : (
          <ul className="mt-2 max-h-96 divide-y divide-line overflow-y-auto">
            {/* 숨김을 opacity 로 표현하면 메타 글자가 2.5:1 까지 떨어진다 —
                왼쪽 레일과 칩으로 말하고 본문 대비는 그대로 둔다(주인은 그 글을 읽고 판단해야 한다) */}
            {shownGuest.map((g) => (
              <li key={g.id} className={cn("border-l-2 py-2.5 pl-3", g.hidden ? "border-tint-slate-ink" : "border-transparent")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold">{g.name}</span>
                  {/* 상태 배지는 무채 — 종류(파랑·초록)와 문법을 가른다. 판이 bg-plate 라 채움 대신 테두리로 */}
                  {g.hidden ? (
                    <span className="inline-flex items-center gap-1 rounded-chip bg-tint-slate px-2 py-0.5 text-[11px] font-semibold text-tint-slate-ink">
                      <EyeOff className="size-3" aria-hidden />
                      숨김
                    </span>
                  ) : null}
                  {!g.reply && !g.hidden ? (
                    <span className="rounded-chip bg-tint-coral px-2 py-0.5 text-[11px] font-semibold text-tint-coral-ink">답글 없음</span>
                  ) : null}
                  <span className="tnum ml-auto text-[12px] text-fg-sub">{dayOf(g.createdAt)}</span>
                </div>
                <p className={cn("mt-1 whitespace-pre-wrap break-words text-[14px]", openGb !== g.id && "line-clamp-3")}>{g.message}</p>
                {/* 길이·줄바꿈 휴리스틱 — 짧은 글에 쓸모없는 「더보기」가 뜨는 건 무해하지만,
                    줄 많은 글이 토글 없이 잘리면 내용이 통째로 숨는다 */}
                {g.message.length > 120 || g.message.split("\n").length > 3 ? (
                  <button
                    type="button"
                    onClick={() => setOpenGb(openGb === g.id ? null : g.id)}
                    aria-expanded={openGb === g.id}
                    className="trans-state mt-0.5 text-[12px] font-semibold text-fg-sub hover:text-fg"
                  >
                    {openGb === g.id ? "접기" : "더보기"}
                  </button>
                ) : null}
                {g.reply ? (
                  <p className="mt-1 whitespace-pre-wrap break-words rounded-card border border-line bg-body px-2.5 py-1.5 text-[14px] text-fg-sub">↳ {g.reply}</p>
                ) : null}
                {replyFor === g.id ? (
                  /* 500자를 받는 칸이 한 줄 input 이었다 — 세 줄 textarea·글자 수·Esc 로 닫기 */
                  <div className="mt-2 space-y-1.5">
                    <textarea
                      value={replyDraft}
                      onChange={(e) => setReplyDraft(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="답글"
                      aria-label="답글 내용"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setReplyFor(null);
                      }}
                      className="w-full resize-y rounded-card border border-line bg-body px-2.5 py-2 text-[14px] leading-[1.6] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none"
                    />
                    <div className="flex items-center gap-1.5">
                      {/* 기존 답글이 있을 때 빈 값 저장은 «답글 삭제» 다(서버가 text || null 로 지운다) — 이름으로 그렇게 말한다 */}
                      <Button
                        size="sm"
                        disabled={busy || (!g.reply && !replyDraft.trim())}
                        onClick={() => onGuestbookReply(g.id, replyDraft, () => { setReplyFor(null); setReplyDraft(""); })}
                      >
                        {g.reply && !replyDraft.trim() ? "답글 삭제" : "저장"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setReplyFor(null)}>
                        취소
                      </Button>
                      <span className="tnum ml-auto text-[11px] text-fg-sub">{replyDraft.length}/500</span>
                    </div>
                  </div>
                ) : (
                  /* 되돌릴 수 없는 「삭제」가 답글·숨기기와 같은 무게였다 — 색과 자리로 갈라 놓는다 */
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Button
                      variant={g.reply ? "ghost" : "secondary"}
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setReplyFor(g.id);
                        setReplyDraft(g.reply ?? "");
                      }}
                    >
                      <MessageSquare className="size-3.5" aria-hidden />
                      {g.reply ? "답글 수정" : "답글"}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => onGuestbookHide(g.id, !g.hidden)}>
                      {g.hidden ? (
                        <>
                          <Eye className="size-3.5" aria-hidden />
                          다시 보이기
                        </>
                      ) : (
                        <>
                          <EyeOff className="size-3.5" aria-hidden />
                          숨기기
                        </>
                      )}
                    </Button>
                    <Button variant="danger" size="sm" className="ml-auto" disabled={busy} onClick={() => onGuestbookDelete(g.id)}>
                      <Trash2 className="size-3.5" aria-hidden />
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
  section = "page",
}: {
  page: LinkPageView;
  busy: boolean;
  onSettings: (patch: Partial<LinkPageSettings>) => void;
  onPassword: (pw: string | null, onDone?: () => void) => void;
  /** page: 비밀번호·언어·링크 열기·검색·공유 카드·파비콘 / marketing: 추적 ID 만(마케팅 탭) */
  section?: "page" | "marketing";
}) {
  const st = page.settings;
  /* 텍스트 필드는 초안을 두고 blur/저장에서 확정 — 글자마다 서버 왕복을 돌리지 않는다 */
  type Staged = Pick<LinkPageSettings, "ogTitle" | "ogImage" | "favicon" | "lockMessage" | "ga4" | "metaPixel" | "tiktokPixel" | "verifyGoogle" | "verifyNaver">;
  const stagedOf = (x: LinkPageSettings): Staged => ({
    ogTitle: x.ogTitle, ogImage: x.ogImage, favicon: x.favicon, lockMessage: x.lockMessage, ga4: x.ga4, metaPixel: x.metaPixel, tiktokPixel: x.tiktokPixel,
    verifyGoogle: x.verifyGoogle, verifyNaver: x.verifyNaver,
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
  const setVerify = (k: "verifyGoogle" | "verifyNaver", v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setTracker = (k: "ga4" | "metaPixel" | "tiktokPixel", v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setOgTitle = (v: string) => setForm((f) => ({ ...f, ogTitle: v }));
  const setOgImage = (v: string) => setForm((f) => ({ ...f, ogImage: v }));
  const setFavicon = (v: string) => setForm((f) => ({ ...f, favicon: v }));
  const setLockMessage = (v: string) => setForm((f) => ({ ...f, lockMessage: v }));

  const input =
    "h-10 w-full rounded-card border border-line bg-body px-3 text-[14px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none";
  const label = "block text-[14px] font-medium text-fg";
  const commit = (k: keyof LinkPageSettings, v: string) => {
    if (v.trim() === (st[k] as string)) return;
    onSettings({ [k]: v.trim() } as Partial<LinkPageSettings>);
  };

  if (section === "marketing") {
    return (
      <div className="space-y-3">
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
        <p className="text-[12px] text-fg-sub">방문자에게 추적 코드를 싣는 건 주인의 책임이에요 — 개인정보처리방침에 제3자 분석 도구 사용을 적어 두세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 비밀번호 */}
      <div className="rounded-card border border-line bg-body px-4 py-3">
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
          <span className={label}>페이지 언어</span>
          <PickChips
            ariaLabel="페이지 언어"
            value={st.lang}
            disabled={busy}
            onChange={(v) => onSettings({ lang: v as LinkPageSettings["lang"] })}
            options={LINK_LANGS.map((l) => ({ key: l.key, label: l.label }))}
          />
          <p className="mt-1 text-[11px] text-fg-sub">폼 라벨·버튼 같은 고정 문구가 바뀌어요. 내가 쓴 글은 그대로예요.</p>
        </div>
        <div>
          <span className={label}>링크 열기</span>
          <PickCards
            ariaLabel="링크 열기"
            value={st.target}
            disabled={busy}
            onChange={(v) => onSettings({ target: v as LinkPageSettings["target"] })}
            options={[
              { key: "blank", label: "새 창", icon: <ExternalLink className="size-4" /> },
              { key: "self", label: "현재 창", icon: <AppWindow className="size-4" /> },
            ]}
          />
          <p className="mt-1 text-[11px] text-fg-sub">{LINK_TARGETS.find((t) => t.key === st.target)?.hint}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-body px-4 py-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">검색·AI 노출</p>
          <p className="mt-0.5 text-[12px] text-fg-sub">{st.robots === "index" ? "구글·네이버·AI 검색이 이 페이지를 찾을 수 있어요." : "검색 결과에 나오지 않게 막아요(주소를 아는 사람만)."}</p>
        </div>
        <Switch checked={st.robots === "index"} onChange={(v) => onSettings({ robots: v ? "index" : "noindex" })} label="검색 노출" disabled={busy} />
      </div>

      {/* 검색엔진 소유확인(리틀리 「메타태그」) — 서치콘솔·네이버 웹마스터에 주소를 등록하려면
          그쪽이 준 확인 코드가 이 페이지 <head> 에 있어야 한다. **임의 태그는 받지 않는다** —
          두 열쇠만, 형식이 맞는 값만 넣는다(임의 문자열을 head 에 심게 하면 남의 화면에 태그를 넣는 창구가 된다).
          평소엔 접어 둔다 — 대부분의 사용자에겐 필요 없는 칸이다. */}
      <details className="rounded-card border border-line bg-body px-4 py-3">
        <summary className="cursor-pointer text-[14px] font-semibold">
          검색엔진 소유확인
          {st.verifyGoogle || st.verifyNaver ? <span className="ml-2 text-[12px] font-medium text-fg-sub">등록됨</span> : null}
        </summary>
        <p className="mt-2 text-[12px] leading-[1.6] text-fg-sub">
          구글 서치콘솔·네이버 서치어드바이저에 이 주소를 등록할 때 쓰는 확인 코드예요.
          <code className="mx-1 rounded bg-plate px-1">content=&quot;…&quot;</code> 안의 값만 넣어 주세요 — 태그 전체가 아니라요.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["verifyGoogle", "구글 서치콘솔", "abcDEF123_gh-…"],
              ["verifyNaver", "네이버 서치어드바이저", "1a2b3c4d5e6f…"],
            ] as Array<["verifyGoogle" | "verifyNaver", string, string]>
          ).map(([k, name, ph]) => (
            <div key={k}>
              <label className={label} htmlFor={`ps-${k}`}>
                {name}
              </label>
              <input
                id={`ps-${k}`}
                value={form[k]}
                onChange={(e) => setVerify(k, e.target.value)}
                onBlur={() => commit(k, form[k])}
                placeholder={ph}
                maxLength={100}
                spellCheck={false}
                className={`mt-1.5 ${input}`}
              />
            </div>
          ))}
        </div>
      </details>

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
          cropAspect={1200 / 630}
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

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   마케팅 탭 — 리틀리 「마케팅」 카피: 플랫폼별 추적 링크 · 마케팅 연결(픽셀) · QR · 공유
   ══════════════════════════════════════════════════════════════════ */

function MarketingPanel({
  page,
  shareUrl,
  origin,
  busy,
  onSettings,
}: {
  page: LinkPageView;
  /** 표준 공유 주소 — 퍼뜨리기·QR·플랫폼별 주소의 밑동 */
  shareUrl?: string;
  origin: string;
  busy: boolean;
  onSettings: (patch: Partial<LinkPageSettings>) => void;
}) {
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = shareUrl || publicLinkUrl(page.slug, origin);
  const connected = [page.settings.ga4 && "GA4", page.settings.metaPixel && "Meta 픽셀", page.settings.tiktokPixel && "TikTok 픽셀"].filter(Boolean) as string[];
  /* React 의 <details open> 은 리렌더마다 prop 값으로 되돌린다 — 토스트 하나에 접히지 않게 상태로 든다 */
  const [adOpen, setAdOpen] = useState(() => connected.length > 0);
  return (
    <>
      <div>
        <h3 className="text-[17px] font-semibold">마케팅</h3>
        <p className="mt-0.5 text-[14px] text-fg-sub">어디서 왔는지 재고, 광고 계정에 방문자를 쌓고, 오프라인에도 퍼뜨려요.</p>
      </div>

      {/* 방문·클릭 집계는 핀치가 자동으로 한다 — "GA 를 넣어야 분석이 되나"로 읽히면 안 된다(2026-08-23 지적) */}
      <p className="rounded-card bg-tint-green px-3.5 py-2.5 text-[14px] text-tint-green-ink">
        방문·클릭·기기·유입 분석은 <strong className="font-semibold">핀치가 자동으로 집계해요</strong> — 아무 설정 없이 「분석」 탭에서 바로 보세요.
      </p>

      <PlatformLinks baseUrl={url} />

      <section className="space-y-2 border-t border-line pt-5">
        <h4 className="text-[15px] font-semibold">클릭에 UTM 자동 붙이기</h4>
        <label className="flex items-start gap-2.5">
          {/* 서버 값 직접 바인딩(robots 스위치와 같은 패턴) — 낙관적 로컬 미러는 저장 실패 시
              복구 경로가 없어 스위치가 어긋난 채 굳는다(소넷 확정). 성공하면 revalidate 로 돌아온다 */}
          <Switch checked={page.settings.utm} onChange={(v) => onSettings({ utm: v })} label="UTM 자동 부착" disabled={busy} />
          <span className="text-[14px] leading-[1.6] text-fg-sub">
            켜면 방문자가 누른 링크 목적지에 <code className="rounded bg-plate px-1 text-[12px]">utm_source=finch</code> 등이 붙어,
            내 쇼핑몰·블로그의 애널리틱스에서 프로필 링크 유입을 구분할 수 있어요. 이미 UTM 이 있는 주소는 건드리지 않아요.
          </span>
        </label>
      </section>

      <section className="space-y-3 border-t border-line pt-5">
        <h4 className="text-[15px] font-semibold">퍼뜨리기</h4>
        <div className="flex flex-wrap items-center gap-2">
          {/* min-w-0 이 flex-wrap 을 무력화해 좁은 화면에서 주소만 계속 줄어들었다(375 에서 102px) —
              좁을 땐 한 줄을 통째로 쓰게 한다 */}
          <code className="min-w-[14rem] flex-1 basis-full truncate rounded-card border border-line bg-body px-3 py-2 text-[14px] text-fg-sub sm:basis-auto">{displayLinkUrl(url)}</code>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              } catch {
                /* 비보안 컨텍스트 — 주소가 보이니 손으로 */
              }
            }}
          >
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? "복사됨" : "주소 복사"}
          </Button>
          {/* disabled={busy} — QR 은 컴포넌트 로컬 state 라 최상위 베일 제외 목록이 알 수 없다.
              busy 중에 열리면 z-[60] 베일이 z-50 모달을 덮어 로더가 둘이 된다(소넷 확정) */}
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setQr(true)}>
            <QrCode className="size-3.5" aria-hidden />
            QR 코드
          </Button>
        </div>
        <p className="text-[14px] text-fg-sub">인스타 프로필·유튜브 설명란엔 위의 플랫폼별 주소를, 명함·매장엔 QR 을 쓰세요.</p>
        {qr ? <QrModal url={url} onClose={() => setQr(false)} /> : null}
      </section>

      {/* 고급 — 내 광고 계정 연결. 접어 둔다: 필수처럼 보이면 "왜 수동이냐"가 된다 */}
      <details className="rounded-card border border-line" open={adOpen} onToggle={(e) => setAdOpen(e.currentTarget.open)}>
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span>
            <span className="text-[15px] font-semibold">내 광고 계정에도 쌓기 (선택)</span>
            <span className="mt-0.5 block text-[12px] text-fg-sub">GA4·Meta 픽셀·TikTok 픽셀 ID 를 넣으면 방문자가 내 광고 계정 모수로도 쌓여요 — 리타게팅 광고용. 핀치 분석과는 무관해요.</span>
          </span>
          <span className={cn("shrink-0 rounded-chip px-2.5 py-1 text-[12px] font-semibold", connected.length ? "bg-positive-weak text-positive-strong" : "bg-plate text-fg-sub")}>
            {connected.length ? `연결됨 · ${connected.join(" · ")}` : "연결 안 함"}
          </span>
        </summary>
        <div className="border-t border-line px-4 py-3">
          <PageSettingsForm page={page} busy={busy} onSettings={onSettings} onPassword={() => {}} section="marketing" />
        </div>
      </details>
    </>
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
                  <span className="shrink-0 text-[14px] text-fg-sub">finch.ai.kr/</span>
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
