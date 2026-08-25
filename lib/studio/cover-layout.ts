/**
 * 표지 카드의 세로 배치 — **내보내기(캔버스)와 편집기(Konva)가 같이 쓴다.**
 *
 * 예전엔 좌표가 두 벌로 복제돼 있었다: export-slides.ts 의 drawCover 는 헤드라인을 위에서
 * 아래로 흘려보내고 부연을 그 뒤에 이어 붙였고, editor-model.ts 의 coverScene 은 부연을
 * y=800 에 **못 박아** 뒀다. 그래서
 *   · 내보낸 PNG: 헤드라인이 4줄이면 부연이 캔버스(1080) 밖으로 잘리고 「밀어서 보기」와 순서가 뒤집혔다
 *   · 편집기: 헤드라인이 길면 제목과 부연이 통째로 포개졌다(실측 17~133px 겹침)
 * 즉 «미리보기와 편집 화면과 발행물이 서로 다른» 상태였다. 계산을 한 곳으로 모은다.
 *
 * 배치 원칙은 **바닥에서 역산**이다. 「밀어서 보기 →」가 기준선이고, 그 위에 부연 자리를 확보한 뒤,
 * 남는 높이에 헤드라인을 맞춘다. 넘치면 줄을 자르는 대신 글자를 줄인다 — 잘린 문장은 문장이 아니다.
 */

export const COVER_TOP = 560;
export const COVER_HINT_Y = 980;
export const COVER_FOOT_SIZE = 38;
export const COVER_FOOT_LH = 52;
/** 「밀어서 보기 →」의 글자 크기 — 아래 여백 계산이 이 값을 뺀다 */
const HINT_SIZE = 28;
/**
 * 부연 마지막 줄과 힌트 **글자 사이**의 여백.
 *
 * ⚠️ 예전엔 이 값을 «baseline ↔ baseline» 간격으로 썼다. 부연이 38px 이라 24px 로는 모자라서,
 * 부연이 2줄로 감기면 마지막 줄과 힌트가 실제로 겹쳤다(마지막 baseline 956 vs 힌트 baseline 980 —
 * 감사 후속 실측). 이제 힌트 글자 높이를 먼저 빼고 그 위에 여백을 준다.
 */
const GAP = 20;
/** 큰 것부터 시도하는 헤드라인 크기 — 상한 안에 들어가는 첫 값을 쓴다 */
const HEAD_SIZES = [98, 92, 86, 80, 74, 68, 62] as const;

export interface CoverLayout {
  headFontSize: number;
  headLineHeight: number;
  headLines: string[];
  /** 부연 첫 줄의 기준선(없으면 null) */
  footTop: number | null;
  footLines: string[];
  hintY: number;
}

/**
 * @param measure  (글자, 크기) → 픽셀 폭. 캔버스는 measureText, 편집기는 근사치를 넘긴다.
 * @param wrap     (글자, 크기, 최대폭) → 줄 배열.
 */
export function coverLayout(
  headline: string,
  footnote: string | undefined,
  maxWidth: number,
  wrap: (text: string, fontSize: number, maxWidth: number) => string[],
): CoverLayout {
  const footLines = footnote ? wrap(footnote, COVER_FOOT_SIZE, maxWidth).slice(0, 2) : [];
  /* 부연 마지막 줄의 기준선 — 힌트 글자 높이와 여백을 먼저 뗀 자리다 */
  const footLastBaseline = COVER_HINT_Y - HINT_SIZE - GAP;
  /* 헤드라인이 끝나야 하는 선 — 부연 블록까지 마저 뗀다 */
  const headBottomLimit = footLastBaseline - footLines.length * COVER_FOOT_LH;

  let headFontSize: number = HEAD_SIZES[HEAD_SIZES.length - 1];
  let headLineHeight = Math.round(headFontSize * 1.18);
  let headLines: string[] = [];
  for (const size of HEAD_SIZES) {
    const lh = Math.round(size * 1.18);
    const lines = wrap(headline, size, maxWidth);
    headFontSize = size;
    headLineHeight = lh;
    headLines = lines;
    if (COVER_TOP + lines.length * lh <= headBottomLimit) break;
  }
  /* 가장 작은 크기로도 넘치면 그때만 자른다 — 캔버스 밖으로 새는 것만은 막아야 한다 */
  const maxLines = Math.max(1, Math.floor((headBottomLimit - COVER_TOP) / headLineHeight));
  headLines = headLines.slice(0, maxLines);

  return {
    headFontSize,
    headLineHeight,
    headLines,
    footLines,
    /* 부연은 헤드라인 바로 아래가 아니라 **힌트 바로 위**에 붙인다 — 읽는 순서가 항상 같다 */
    footTop: footLines.length ? footLastBaseline - (footLines.length - 1) * COVER_FOOT_LH : null,
    hintY: COVER_HINT_Y,
  };
}

/**
 * 캔버스가 없는 곳(편집기 모델)의 줄바꿈 근사.
 * 한글은 글자 폭이 대략 1em, 라틴/숫자는 절반쯤이라고 보고 센다 — 정확한 조판은 Konva 가
 * 실제로 하고, 여기서 필요한 건 «몇 줄이 될지»의 어림뿐이다(겹침만 막으면 된다).
 */
export function estimateWrap(text: string, fontSize: number, maxWidth: number): string[] {
  const w = (ch: string) => (/[\x20-\x7E]/.test(ch) ? fontSize * 0.52 : fontSize * 1.0);
  const lines: string[] = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    let width = 0;
    for (const word of paragraph.split(" ")) {
      const wordW = [...word].reduce((n, ch) => n + w(ch), 0);
      const spaceW = line ? w(" ") : 0;
      if (width + spaceW + wordW <= maxWidth || !line) {
        line = line ? `${line} ${word}` : word;
        width += spaceW + wordW;
        continue;
      }
      lines.push(line);
      line = word;
      width = wordW;
    }
    lines.push(line);
  }
  return lines.filter((l, i) => l !== "" || i === 0);
}
