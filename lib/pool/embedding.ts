import "server-only";

/*
  임베딩 — Upstage Solar Embedding 2 (한국어 특화, 1024차원, OpenAI 호환 API).

  왜 Upstage 인가(2026-08-13 조사): 한국어 캡션 검색이 용도의 전부인데 한국어 특화
  임베딩이고, 1024차원이라 pgvector HNSW 인덱스 한도(2000) 안이며, 문서/쿼리 전용
  모델이 분리돼 검색 품질에 유리하다. OpenAI /v1/embeddings 와 같은 와이어 포맷이라
  공급사를 갈아타도 이 파일의 상수 몇 개만 바뀐다(단, 차원이 바뀌면 재임베딩 필요).

  UPSTAGE_API_KEY 미설정이면 조용히 null — 의미 검색은 보조 경로라서
  키가 없어도 기존 글자 일치 검색이 그대로 동작해야 한다.
*/

const ENDPOINT = "https://api.upstage.ai/v1/embeddings";
/** 문서(소재 본문)용과 검색어용 모델이 다르다 — 바꿔 쓰면 유사도 분포가 틀어진다 */
const MODEL_PASSAGE = "solar-embedding-2-passage";
const MODEL_QUERY = "solar-embedding-2-query";
export const EMBEDDING_DIM = 1024;
const TIMEOUT_MS = 15_000;

export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.UPSTAGE_API_KEY);
}

async function call(model: string, inputs: string[], timeoutMs: number): Promise<number[][] | null> {
  const key = process.env.UPSTAGE_API_KEY;
  if (!key || inputs.length === 0) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: inputs }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.error("[pool] 임베딩 호출 실패:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ index: number; embedding: number[] }> };
    if (!Array.isArray(json.data) || json.data.length !== inputs.length) return null;
    // index 기준 정렬 — 응답 순서가 입력 순서와 같다는 보장이 스펙상 없다
    const out = new Array<number[]>(inputs.length);
    for (const d of json.data) {
      if (!Array.isArray(d.embedding) || d.embedding.length !== EMBEDDING_DIM) return null;
      out[d.index] = d.embedding;
    }
    return out.every(Boolean) ? out : null;
  } catch (e) {
    console.error("[pool] 임베딩 호출 실패:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * 소재 본문 임베딩 (배치, **부분 성공형**). 입력과 같은 길이의 배열을 돌려주고
 * 실패한 청크 자리는 null 이다 — 한 청크의 독 입력이 나머지 성공분까지 버리게
 * 하지 않는다(리뷰 확정 결함). 전부 실패면 null.
 * @param deadline 이 시각(epoch ms)까지 못 끝낼 청크는 건너뛴다 — 크론 60초 상한 보호.
 *                 건너뛴 자리는 null 로 남고 다음 회차 백필이 줍는다.
 */
export async function embedPassages(
  texts: string[],
  deadline?: number,
): Promise<Array<number[] | null> | null> {
  const out: Array<number[] | null> = new Array(texts.length).fill(null);
  let any = false;
  // 한 요청에 너무 많이 실으면 400/타임아웃 위험 — 50개씩 끊는다 (순차)
  for (let i = 0; i < texts.length; i += 50) {
    if (deadline && Date.now() + TIMEOUT_MS + 2_000 > deadline) break;
    const chunk = await call(MODEL_PASSAGE, texts.slice(i, i + 50), TIMEOUT_MS);
    if (chunk) {
      chunk.forEach((v, j) => {
        out[i + j] = v;
      });
      any = true;
    }
  }
  return any ? out : null;
}

/** 검색어 임베딩 (1건). 사용자 검색 응답을 물고 있는 경로라 타임아웃을 짧게 건다 —
 *  공급사가 느린 날 검색이 15초씩 멈추면 안 된다. 실패 시 null → 글자 일치만으로 계속. */
export async function embedQuery(text: string): Promise<number[] | null> {
  const r = await call(MODEL_QUERY, [text.slice(0, 500)], 4_000);
  return r?.[0] ?? null;
}

/** 소재 → 임베딩 입력 텍스트. AI 태깅 산출물이 있으면 함께 — 검색 의미가 진해진다. */
export function embeddingTextOf(row: {
  title?: string | null;
  body?: string | null;
  ai_topic?: string | null;
  ai_summary?: string | null;
}): string {
  return [row.title, row.ai_topic, row.ai_summary, row.body]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join("\n")
    .slice(0, 2000);
}
