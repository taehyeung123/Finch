/*
  주소(slug) 금칙어 — **부분 일치**로 막는다 (2026-08-26 사장님 지시, 같은 날 «허술하다» 지적으로 확장,
  쏘넷 공격 점검(정상 slug 344개 + 우회 131개 실행) 반영).

  reserved.ts(예약어)와 성격이 다르다:
   · 예약어  = 정확히 그 이름(라우트 충돌·사칭) — exact match
   · 금칙어  = 낱말이 **포함**되기만 해도 주소 전체가 부적절해지는 것 — substring match

  slug 는 `[a-z0-9-]` 뿐이므로(SLUG_RE) 목록도 영문·로마자 표기만 둔다.
  하이픈을 뺀 값(si-bal → sibal)도 함께 검사해 끼워넣기 우회를 막는다.

  ── 오탐(정상 낱말 차단)은 예외 목록으로 푼다 ──
  부분 일치를 넓히면 반드시 정상 낱말이 걸린다: drug ⊂ drugstore, anal ⊂ analysis·analgesic,
  fuk ⊂ fukuoka, cock ⊂ cocktail·shuttlecock·cockapoo, sex ⊂ sussex·sexton, mayak ⊂ 마약김밥.
  BANNED_EXCEPTIONS(금칙어를 품고 있지만 명백히 정상인 낱말)를 **먼저 걷어낸 뒤** 검사한다.
  걷어낼 때 빈칸으로 치환한다 — "" 로 지우면 앞뒤 글자가 붙으면서 없던 금칙어가 만들어질 수
  있다(se + [예외] + x → sex 오탐). 예외를 지워도 나머지에 금칙어가 남으면 당연히 걸린다
  (shuttlecock-fuck 은 fuck 으로 잡힌다) — 예외가 우회 통로가 되지는 않는다.

  ── 검토 후 «넣지 않기로 한» 낱말 (쏘넷 공격 점검에서 실측) ──
   · rape      — grape·therapy·scraper 를 죽인다. molka·성인물 항목이 담당
   · kkk       — 한국어 웃음(ㅋㅋㅋ) 로마자라 오탐 압도적
   · michin    — 「미친맛·미친떡볶이」가 국민 마케팅 관용구. 욕설로서는 경미한데 F&B 셀러(핵심
                 고객)를 대량 차단한다
   · gook      — 반아시아 슬러지만 한국어 로마자 «국»(hangook·gookbap)과 정면 충돌
   · ice/herb  — 마약 은어지만 icecream·iceland·herbtea 등 오탐 확정
   · ppong     — 필로폰 은어지만 뽕짝(트로트) 콘텐츠와 충돌
   · sadari/powerball — 도박 은어지만 사다리차·미국 공식 복권과 충돌
   · anma/jujeom/chuljang/yuheung/opi — 성매매 인접 은어지만 전부 합법 일반 업종·일반어와 충돌
   · spic      — 슬러지만 spice·spicy·conspicuous 오탐
   · jogeon 단독 — 조건(condition)이라는 일반어. 복합어 jogeonmannam 만 막는다

  목록은 정책이라 바뀐다 — DB check 로 굳히지 않고 앱에서만 검사한다(validateSlug 경유,
  생성·변경·모달·새 페이지 전 경로 공통).
*/

export const BANNED_SLUG_WORDS: readonly string[] = [
  /* ── 욕설 — 한국어 로마자·두벌식 오타 표기 ── */
  "sibal",
  "sibbal",
  "sipal", // 받침을 p 로 적는 흔한 구어 표기(쏘넷 공격)
  "ssibal",
  "shibal", // 영어식 h 표기
  "tlqkf", // 두벌식 자판 그대로 친 「씨발」
  "byungsin",
  "byeongsin",
  "qudtls", // 두벌식 「병신」
  "gaesaekki",
  "gaesekki",
  "gaeseki",
  "gaejasik", // 개자식(쏘넷 공격)
  "gaejot", // 개좆(쏘넷 공격)
  "saekki",
  "sekki", // 새끼의 구어 표기(쏘넷 공격)
  "jiral",
  "wlfkf", // 두벌식 「지랄」
  "jonna",
  "jotna",
  "jotgat", // 좆같-(쏘넷 공격)
  "changnyeo",
  "boji",
  "jaji",
  /* ── 욕설·성적 — 영어 ── */
  "fuck",
  "fuk", // 예외: fuku(후쿠오카·후쿠시마)
  "shit",
  "bitch",
  "whore",
  "slut",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "asshole",
  "tits",
  "boobs",
  "penis",
  "vagina",
  "anal", // 예외: analy·analog·analgesic·analiese·canal·banal
  "cock", // 예외: cocktail·peacock·hancock·cockpit·shuttlecock·cockapoo·cockatoo
  "pussy",
  "dildo",
  "blowjob",
  "handjob",
  "sex", // sexy 도 함께 걸린다(의도). 예외: sussex·essex·middlesex·unisex·sexton
  /* ── 성인물·성매매 — 한국어 로마자 ── */
  "porn",
  "porno",
  "hentai",
  "yadong",
  "yaseol",
  "sekseu", // 섹스 로마자
  "molka",
  "seongmaemae", // 성매매(쏘넷 공격)
  "jogeonmannam", // 조건만남 — 복합어 그대로만. jogeon 단독 금지(상단 주석)
  "roomsalon", // 룸살롱(쏘넷 공격)
  "kissbang", // 키스방 — bang 단독은 PC방·노래방이라 넣지 않는다
  /* ── 도박 ── */
  "dobak", // 도박(쏘넷 공격)
  "casino",
  "kajino",
  "bakara", // 예외: bakararose(바카라 장미 — 꽃집)
  "baccarat", // 예외: baccaratcrystal(프랑스 크리스탈 브랜드)
  "gambling",
  "holdem",
  "meoktwi", // 먹튀
  "toto", // 예외: totoro·totobidet·totowashlet(위생도기 브랜드 TOTO)
  /* ── 마약 ── */
  "mayak", // 예외: 마약김밥류 음식 관용구(mayakgimbap 등 — 아래 예외 묶음)
  "drug", // 예외: drugstore
  "daemacho", // 대마초 (daema 단독은 대망·daemang 오탐이라 안 넣는다)
  "cocaine",
  "heroin", // 예외: heroine(여주인공)
  "fentanyl",
  "ketamine",
  "philopon",
  "pilopon",
  "hiropong",
  /* ── 혐오 상징·슬러 ── */
  "hitler",
  "nazi",
  "kike", // 반유대 슬러(쏘넷 공격)
  "chink", // 반아시아 슬러(쏘넷 공격 — 오탐 없는 것 확인)
  "wetback", // 반히스패닉 슬러(쏘넷 공격)
  "jjokbari", // 반일 슬러(쏘넷 공격)
];

/**
 * 금칙어를 **품고 있지만 명백히 정상**인 낱말 — 검사 전에 걷어낸다.
 * 새 금칙어를 넣을 때 여기도 함께 생각할 것: 그 낱말을 품는 흔한 정상 단어가 있는가?
 */
export const BANNED_EXCEPTIONS: readonly string[] = [
  "fuku", // 후쿠오카·후쿠시마 — 여행 셀러가 실제로 쓴다. fuk-u 도 여기 흡수된다(알려진 잔여 — fvck 류처럼 부분일치가 원래 못 잡는 수준)
  "drugstore",
  "heroine",
  "analy", // analysis·analytics·analyze
  "analog",
  "analgesic", // 진통제 — 약국·헬스케어(쏘넷 공격)
  "analiese", // 실존 인명 표기(쏘넷 공격)
  "canal",
  "banal",
  "cocktail",
  "peacock",
  "hancock",
  "cockpit",
  "shuttlecock", // 배드민턴(쏘넷 공격)
  "cockapoo", // 반려견 품종(쏘넷 공격)
  "cockatoo", // 앵무새(쏘넷 공격)
  "sussex",
  "essex",
  "middlesex",
  "unisex",
  "sexton", // 실존 영어 성씨(쏘넷 공격)
  "totoro",
  "totobidet", // TOTO 위생도기(쏘넷 공격)
  "totowashlet",
  "bakararose", // 바카라 장미 — 꽃집(쏘넷 공격)
  "baccaratcrystal", // 크리스탈 명품 브랜드(쏘넷 공격)
  /* 마약김밥류 — 「마약~」이 음식 마케팅 관용구로 굳은 조합만 핀셋 허용(쏘넷 공격) */
  "mayakgimbap",
  "mayakkimbap",
  "mayaktteokbokki",
  "mayakchicken",
  "mayaktoast",
  "mayakegg",
  "mayakoksusu",
];

/**
 * 금칙어가 들어 있으면 그 낱말을, 없으면 null. 하이픈 끼워넣기(si-bal)도 잡는다.
 *
 * 검사는 **하이픈 제거본 하나**로 한다. 하이픈을 지우면 매치가 늘기만 하지 줄지 않으므로
 * (원문에서 걸리는 것은 제거본에서도 반드시 걸린다) 원문 검사는 중복이고 — 오히려 원문까지
 * 검사하면 예외가 못 미친다: 예외는 붙임말(mayakgimbap)로 등록돼 있는데 원문(mayak-gimbap)에는
 * 그 문자열이 없어서, 예외를 지워도 원문 분기의 mayak 이 그대로 걸렸다(공격 점검 후속 실측).
 */
export function bannedWordIn(raw: string): string | null {
  let flat = raw.trim().toLowerCase().replace(/-/g, "");
  /* 예외를 빈칸으로 치환(삭제 아님 — 앞뒤가 붙으며 없던 금칙어가 생기는 것 방지) */
  for (const ex of BANNED_EXCEPTIONS) {
    if (flat.includes(ex)) flat = flat.split(ex).join(" ");
  }
  for (const w of BANNED_SLUG_WORDS) {
    if (flat.includes(w)) return w;
  }
  return null;
}
