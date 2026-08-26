/*
  주소(slug) 금칙어 — **부분 일치**로 막는다 (2026-08-26 사장님 지시).

  reserved.ts(예약어)와 성격이 다르다:
   · 예약어  = 정확히 그 이름(라우트 충돌·사칭) — exact match
   · 금칙어  = 낱말이 **포함**되기만 해도 주소 전체가 부적절해지는 것 — substring match

  slug 는 `[a-z0-9-]` 뿐이므로(SLUG_RE) 목록도 영문·로마자 표기만 둔다.
  하이픈을 뺀 값(si-bal → sibal)도 함께 검사해 끼워넣기 우회를 막는다.

  ⚠️ 부분 일치는 오탐이 생길 수 있다(sussex 의 sex 등). 그래서:
   · 짧고 흔한 영어 조각(ass·hell·dick 등)은 **넣지 않는다** — class·hello·dickson 이 죽는다.
   · 한 단어가 명백히 욕설·불법으로만 읽히는 것만 담는다.
  목록은 정책이라 바뀐다 — DB check 로 굳히지 않고 앱에서만 검사한다(validateSlug).
*/

export const BANNED_SLUG_WORDS: readonly string[] = [
  /* 욕설 — 한국어 로마자 표기 */
  "sibal",
  "ssibal",
  "shibal", // 영어식 h 표기 — sibal 만으론 못 잡는다(쏘넷 점검)
  "tlqkf", // 두벌식 자판 그대로 친 「씨발」
  "byungsin",
  "byeongsin",
  "qudtls", // 두벌식 「병신」
  "gaesaekki",
  "gaeseki",
  "jiral",
  "jonna", // 존나 — jonathan 류와 부분 충돌 없음 확인(쏘넷 점검)
  "changnyeo",
  /* 욕설 — 영어 */
  "fuck",
  "shit",
  "bitch",
  "whore",
  "slut",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  /* 성인·성범죄 */
  "porn",
  "porno",
  "hentai",
  "yadong",
  "molka",
  /* "rape" 는 넣지 않는다 — grape·therapy·scraper 를 죽인다(파일 상단 원칙 그대로.
     쏘넷 점검에서 실측 확인). 성범죄어는 위 molka·아래 성인물 항목이 담당한다. */
  /* 불법·도박·마약 */
  "casino",
  "kajino",
  "bakara", // 바카라 — 국어 로마자 표기(ㅋ→k, kajino 와 같은 규칙). c 표기는 실제 스팸에서 안 쓴다(쏘넷 점검)
  "mayak",
  /* 혐오 상징 */
  "hitler",
  "nazi",
];

/** 금칙어가 들어 있으면 그 낱말을, 없으면 null. 하이픈 끼워넣기(si-bal)도 잡는다. */
export function bannedWordIn(raw: string): string | null {
  const slug = raw.trim().toLowerCase();
  const flat = slug.replace(/-/g, "");
  for (const w of BANNED_SLUG_WORDS) {
    if (slug.includes(w) || flat.includes(w)) return w;
  }
  return null;
}
