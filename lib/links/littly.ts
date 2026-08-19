/*
  리틀리(litt.ly) 페이지 파싱 — **서버 액션 전용.** 클라이언트에서 import 하지 말 것
  (Buffer 를 쓴다).

  왜 리틀리만 서버에서 가져오는가 (2026-08-19 실측 재확인, 사장님 승인):
   · robots.txt 가 `Allow: /` — 링크트리(전면 거부)와 다르게 명시적으로 열려 있다.
   · 서버 HTML 에 앵커가 0개인 SPA 껍데기지만, `<script id="data">` 안에 페이지
     전체가 base64 JSON 으로 실려 온다(블록 타입·제목·URL 이 구조화돼 있다 —
     litt.ly/start_now_new 40블록, litt.ly/client 66링크로 검증).
   · 없는 슬러그는 301 로 홈에 되던진다 → redirect 를 안 따라가면 그게 곧
     "못 찾음" 신호다.

  SSRF 관점: 임의 URL 을 받지 않는다. **호스트는 litt.ly 상수**이고 우리가 검증한
  슬러그로 주소를 직접 조립하며, 리다이렉트를 따라가지 않는다 — DNS 리바인딩·
  리다이렉트 우회는 공격자가 호스트를 고를 수 있을 때의 위협이다. 그 전제가 없다.
  (fetch 는 액션 쪽 — 이 모듈은 네트워크를 모르는 순수 파서다.)
*/

export interface LittlyCandidate {
  label: string;
  url: string;
}

export interface LittlyParsed {
  pageTitle: string | null;
  candidates: LittlyCandidate[];
}

/** 블록 타입별 라벨 폴백 — 리틀리는 제목이 빈 블록이 흔하다 */
const TYPE_LABEL: Record<string, string> = {
  video: "영상",
  music: "음악",
  productLink: "제품",
};

const MAX_CANDIDATES = 100;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * 리틀리 서버 HTML → 링크 후보 목록.
 *
 * `use === false`(꺼둔 블록)는 건너뛴다. 타입 화이트리스트를 두지 않고 **url 필드가
 * 있는 모든 블록**에서 걷는다 — 리틀리가 블록 타입을 늘려도(실측에서 music 이
 * 그렇게 나타났다) 파서를 고칠 필요가 없다. http(s) 검증·중복 제거·추적 파라미터
 * 제거는 클라이언트의 parsePastedLinks 가 붙여넣기 경로와 **같은 관문**으로 처리한다.
 */
export function parseLittlyHtml(html: string): LittlyParsed | null {
  const m = /<script[^>]*\bid="data"[^>]*>([^<]+)<\/script>/.exec(html);
  if (!m) return null;

  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(m[1].trim(), "base64").toString("utf-8"));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;

  const root = data as Record<string, unknown>;
  const profile = (root.profile ?? {}) as Record<string, unknown>;
  const pageTitle = str(profile.title).trim() || null;

  const blocks = Array.isArray(root.blocks) ? (root.blocks as Array<Record<string, unknown>>) : [];
  const out: LittlyCandidate[] = [];

  const push = (rawUrl: unknown, rawLabel: string, type: string) => {
    if (out.length >= MAX_CANDIDATES) return;
    const url = str(rawUrl).trim();
    if (!url) return;
    const label = rawLabel.trim() || TYPE_LABEL[type] || "링크";
    out.push({ url, label });
  };

  for (const b of blocks) {
    if (b.use === false) continue; // 주인이 꺼둔 블록은 공개 페이지에도 없다
    const type = str(b.type);
    const title = str(b.title);

    push(b.url, title, type);

    /* video·music·productLink·sns 는 links[] 안에 항목이 더 있다 */
    if (Array.isArray(b.links)) {
      for (const raw of b.links as Array<Record<string, unknown>>) {
        if (!raw || typeof raw !== "object") continue;
        /* sns 항목은 {type:"instagram", value:"..."} — value 가 URL 이 아니면
           (전화번호·이메일·빈 값) parsePastedLinks 의 normalizeUrl 이 걸러낸다 */
        push(raw.url ?? raw.value, str(raw.title) || str(raw.type) || title, type);
      }
    }
  }

  return { pageTitle, candidates: out };
}
