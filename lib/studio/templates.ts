/**
 * 카드뉴스 콘텐츠 템플릿 — 사용자가 만드는 카드(=생성 이미지 자산)의 색 테마.
 *
 * 주의: 이건 앱 UI 색이 아니라 "사용자가 내보내는 콘텐츠 이미지"의 팔레트다(Canva 템플릿과 동일 개념).
 * 앱 UI는 여전히 코랄+잉크(DESIGN 토큰)를 쓰고, 여기서만 카드별 테마를 허용한다.
 * 기본 템플릿(coral, locked)은 핀치 브랜드 색 고정, 나머지는 콘텐츠용 자유 팔레트.
 *
 * v1은 4색(잉크·페이퍼·강조·강조위텍스트) 테마만 바꾼다. 레이아웃/폰트는 공통(Pretendard).
 * 폰트별 템플릿·전용 레이아웃은 v2(폰트 로드 선행 필요).
 */

export interface CardTemplate {
  id: string;
  name: string;
  /** true면 색 고정(핀치 기본 브랜드) */
  locked?: boolean;
  /** 어두운 면 배경(표지·마무리) + 본문 텍스트 */
  ink: string;
  /** 밝은 면 배경(본문) + 표지·마무리 텍스트 */
  paper: string;
  /** 강조 색(키커·번호배지·구분선·CTA) */
  accent: string;
  /** 강조 위 텍스트(번호·CTA 문구) */
  onAccent: string;
}

export const TEMPLATES: CardTemplate[] = [
  { id: "coral", name: "코랄", locked: true, ink: "#0C0C11", paper: "#FAF8F4", accent: "#FF6B4A", onAccent: "#FAF8F4" },
  { id: "midnight", name: "미드나잇", ink: "#0B1220", paper: "#EEF2F8", accent: "#4C82F7", onAccent: "#0B1220" },
  { id: "mono", name: "모노", ink: "#111111", paper: "#FFFFFF", accent: "#111111", onAccent: "#FFFFFF" },
  { id: "cream", name: "크림", ink: "#3A2E2A", paper: "#FBF3E7", accent: "#E0765A", onAccent: "#FBF3E7" },
  { id: "forest", name: "포레스트", ink: "#16261E", paper: "#EFF3EC", accent: "#3E8E6B", onAccent: "#EFF3EC" },
];

export const DEFAULT_TEMPLATE = TEMPLATES[0];

export function getTemplate(id: string | undefined | null): CardTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? DEFAULT_TEMPLATE;
}

/** #RRGGBB → rgba(r,g,b,a). 잘못된 형식이면 원본 반환(불투명 취급) */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
