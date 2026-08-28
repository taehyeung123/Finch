import type { BlockType } from "./blocks";

/*
  프로필 링크 템플릿 — «적용 즉시 완성된 페이지»가 목표다.

  2026-08-28 전면 재제작(«하나하나 정성 들여서») — 템플릿은 블록 나열이 아니라
  **한 사람의 페이지**여야 한다. 그래서 4종 각각에:
  · 페르소나와 목소리(카피가 서로를 알고 있다 — 브랜드의 인트로 «초록 문»은 히어로 그림의 문이다)
  · 전용 아트(public/tpl/*.svg — 팔레트를 테마와 맞춘 자체 제작 일러스트. 심플만 무아트 — 절제가 컨셉)
  · 테마 + 직접 꾸미기(글꼴·모서리·모션까지 — 적용하면 «디자인이 끝난» 상태)
  · 구성의 기승전결(알림 → 히어로 → 콘텐츠 → 신뢰 → 수집 → 클로징 한 줄)

  규칙:
  · 주소는 각 서비스 홈 — 사용자가 자기 것으로 바꾼다. 비워 두면 «주소 없는 블록 숨김»
    규칙에 걸려 템플릿이 빈 것처럼 보인다(2026-08-20 실계정 지적).
  · 이미지는 절대 URL(https://finch.ai.kr/tpl/…) — applyTemplate 은 sanitize 를 안 타지만
    사용자가 나중에 그 블록을 **수정**하면 관문(normalizeUrl)이 http(s)만 통과시킨다.
  · 이모지 금지(아이콘 영역 폐기와 한 몸) · 경쟁사 이름 금지 · 문구는 구체적 사실로.
  · 지도 자리는 공공 랜드마크(삼청로 미술관) — 누가 봐도 자리표시자다. 임의 상점 주소를
    박으면 실재하는 남의 가게가 템플릿에 실린다.

  ⚠️ 적용은 **기존 블록을 지우고 덮어쓴다.** 화면(TemplateModal)이 확인을 받는다.
*/

const ASSET = "https://finch.ai.kr/tpl";

export interface LinkTemplate {
  key: string;
  name: string;
  hint: string;
  /** 이 템플릿이 어울리는 테마(적용 시 함께 바뀐다) */
  theme: string;
  /** 테마 위에 얹는 직접 꾸미기(글꼴·모션·파스텔 등) — 없으면 적용 시 비운다.
      themes.ts 의 sanitizeThemeCustom 관문을 지나므로 그 스키마 안의 값만 살아남는다 */
  custom?: Record<string, unknown>;
  /** 스트립 카드 바탕 틴트 — 앱 UI 틴트 토큰 쌍(bg-tint-* / text-tint-*-ink):
      반투명이라 라이트·다크 어느 지면 위에서도 같은 구조로 읽힌다. */
  tint: string;
  blocks: Array<{ type: BlockType; data: Record<string, unknown> }>;
}

export const LINK_TEMPLATES: LinkTemplate[] = [
  /* ── 크리에이터 «스튜디오 로그» ─────────────────────────────
     심야 스튜디오(미드나잇 네이비 + 전기 블루). 매주 금요일 업로드하는 영상
     크리에이터의 허브 — 라이브 공지가 맨 위, 새 영상이 히어로 카드로. */
  {
    key: "creator",
    name: "크리에이터",
    hint: "라이브 공지 + 새 영상 허브",
    theme: "midnight",
    custom: { font: "ibm-plex", anim: "rise", effect: "circle" },
    tint: "bg-tint-purple text-tint-purple-ink",
    blocks: [
      { type: "notice", data: { text: "금요일 밤 9시 라이브 — 구독자 Q&A와 다음 영상 비하인드", tone: "primary" } },
      /* 소제목이 히어로 카드 **위**에 있어야 «항상 렌더되는 블록»을 라벨한다 — 피드는
         인스타 연동 전엔 숨으므로, 소제목 아래 피드만 두면 미연동 발행본에 유령 소제목이 남는다(쏘넷) */
      { type: "heading", data: { text: "이번 주 콘텐츠" } },
      {
        type: "link",
        data: {
          label: "새 영상 · 카메라 하나로 시작하는 브이로그",
          url: "https://www.youtube.com/",
          layout: "large",
          imagePath: `${ASSET}/creator-hero.svg`,
        },
      },
      { type: "social_feed", data: { channel: "instagram", count: 3 } },
      { type: "divider", data: { style: "line" } },
      {
        type: "link",
        data: {
          label: "촬영 장비 전부 정리 — 카메라·마이크·조명",
          url: "https://www.youtube.com/",
          layout: "medium",
          imagePath: `${ASSET}/creator-gear.svg`,
        },
      },
      {
        type: "card_row",
        data: { items: [{ title: "협업·광고 문의", subtitle: "DM 주시면 미디어킷을 보내드려요", url: "https://www.instagram.com/" }] },
      },
      {
        type: "subscribe",
        data: { title: "새 영상 알림 받기", description: "금요일마다 한 번 — 업로드하는 날에만, 스팸 없이.", buttonLabel: "알림 신청" },
      },
      { type: "divider", data: { style: "dot" } },
      { type: "text", data: { text: "매주 금요일 밤, 한 편씩 쌓아 갑니다.", align: "center" } },
    ],
  },

  /* ── 공구·판매 «위켄드 마켓» ─────────────────────────────
     크림 + 테라코타(니트 팔레트). 마감 임박 공지 → 히어로 상품(할인가) →
     함께 열린 상품 그리드 → 실제 후기 인용 → 재입고 알림 수집. */
  {
    key: "shop",
    name: "공구·판매",
    hint: "히어로 상품 + 마감 공지",
    theme: "cream",
    /* accent 는 일러스트의 딥 테라코타(#A93F22) — 크림 테마 기본 갈색과 두 집 살림이 됐다(쏘넷).
       흰 글자 대비 4.5:1 이상이라 관문(themes.ts 대비 게이트)도 통과한다 */
    custom: { accent: "#A93F22", anim: "rise", shadow: "soft", radius: "lg" },
    tint: "bg-tint-coral text-tint-coral-ink",
    blocks: [
      { type: "notice", data: { text: "가을 니트 공구 오픈 — 일요일 밤 12시 마감", tone: "primary" } },
      {
        type: "image_card",
        data: {
          title: "울 블렌드 라운드 니트",
          subtitle: "다섯 가지 색 — 겨울까지 입는 도톰한 두께",
          price: "29,000원",
          originalPrice: "42,000원",
          ctaLabel: "공구가로 구매하기",
          url: "https://smartstore.naver.com/",
          imagePath: `${ASSET}/shop-hero.svg`,
        },
      },
      { type: "heading", data: { text: "함께 열린 상품" } },
      {
        type: "grid",
        data: {
          columns: 2,
          items: [
            { title: "손뜨개 무드 머플러", price: "18,000원", imagePath: `${ASSET}/shop-1.svg`, url: "https://smartstore.naver.com/" },
            { title: "리브 양말 3켤레 세트", price: "9,900원", imagePath: `${ASSET}/shop-2.svg`, url: "https://smartstore.naver.com/" },
          ],
        },
      },
      { type: "link", data: { label: "지난 공구 모아보기", url: "https://www.instagram.com/", emphasis: "outline" } },
      { type: "divider", data: { style: "line" } },
      { type: "heading", data: { text: "지난 공구 후기" } },
      {
        type: "text",
        data: {
          text: "“세탁기에 돌려도 보풀이 안 났어요. 색 추가되면 또 살게요.” — 니트 공구 후기\n“화면 색 그대로 와서 놀랐어요. 포장도 꼼꼼했습니다.” — 머플러 공구 후기",
          align: "left",
        },
      },
      {
        type: "subscribe",
        data: {
          title: "다음 공구 미리 알림",
          description: "오픈 몇 시간 만에 마감되는 날이 많아요. 신청해 두면 문 열자마자 알려드려요.",
          buttonLabel: "미리 알림 받기",
        },
      },
      { type: "text", data: { text: "매주 목요일 밤, 새 공구로 돌아옵니다.", align: "center" } },
    ],
  },

  /* ── 브랜드·매장 «초록 문» ─────────────────────────────
     세이지 그린 + 세리프(고운바탕). 인트로 문장이 히어로 그림(초록 문)을 가리킨다.
     길 안내(실지도) → 영업시간 → 클래스 일정 → 예약 문의까지 오프라인의 전부. */
  {
    key: "brand",
    name: "브랜드·매장",
    hint: "오시는 길 + 클래스 일정",
    theme: "sage",
    custom: { font: "gowun-batang", anim: "rise", shadow: "soft" },
    tint: "bg-tint-green text-tint-green-ink",
    blocks: [
      { type: "image", data: { imagePath: `${ASSET}/brand-hero.svg`, alt: "초록 문이 있는 매장 입구" } },
      {
        type: "text",
        data: { text: "골목 끝, 초록 문이 보이면 다 온 거예요.\n주중엔 커피를 내리고, 주말엔 클래스를 엽니다.", align: "center" },
      },
      { type: "link", data: { label: "이번 달 메뉴판 보기", url: "https://www.instagram.com/", emphasis: "primary" } },
      {
        type: "card_row",
        data: {
          items: [
            {
              title: "온라인 스토어",
              subtitle: "원두·굿즈, 다음 날 문 앞으로",
              imagePath: `${ASSET}/brand-goods.svg`,
              url: "https://smartstore.naver.com/",
            },
          ],
        },
      },
      { type: "heading", data: { text: "찾아오시는 길" } },
      /* 자리표시 주소는 공공 랜드마크(미술관) — «골목 끝» 카피와 결이 맞는 삼청로(쏘넷) */
      { type: "map", data: { address: "서울특별시 종로구 삼청로 30", label: "매장 위치" } },
      { type: "text", data: { text: "화–일 11:00 – 20:00 · 월요일은 쉽니다", align: "center" } },
      {
        type: "events",
        data: {
          /* «이번 달»은 하드코딩 날짜와 어긋난다 — 월 무관 라벨 + 여유 있는 날짜(쏘넷).
             날짜가 다 지나면 블록이 통째로 숨는 것은 의도(지난 클래스를 광고하지 않는다) */
          label: "다가오는 클래스",
          items: [
            { title: "핸드드립 원데이 클래스", startAt: "2026-12-12T14:00", place: "매장 2층" },
            { title: "홀리데이 블렌드 시음회", startAt: "2026-12-26T15:00", place: "매장" },
          ],
          past: "hide",
          ics: true,
        },
      },
      { type: "divider", data: { style: "line" } },
      {
        type: "contact",
        data: {
          title: "예약·문의",
          description: "클래스 예약, 단체 주문 모두 여기로 남겨 주세요. 영업일 하루 안에 답해요.",
          fields: ["name", "phone", "message"],
        },
      },
      { type: "text", data: { text: "오늘도 천천히, 정성껏 내리겠습니다.", align: "center" } },
    ],
  },

  /* ── 심플 «여백» ─────────────────────────────
     포슬린 + 고운돋움, 외곽선 버튼. 절제가 곧 디자인 — 링크 넷과 두 문장. */
  {
    key: "simple",
    name: "심플",
    hint: "링크 몇 개만 조용하게",
    theme: "porcelain",
    custom: { font: "gowun-dodum", button: "outline", anim: "rise" },
    tint: "bg-tint-slate text-tint-slate-ink",
    blocks: [
      { type: "text", data: { text: "글과 사진을 만듭니다. 새 기록은 일요일마다 올라와요.", align: "center" } },
      { type: "spacer", data: { size: 16 } },
      { type: "link", data: { label: "인스타그램", url: "https://www.instagram.com/" } },
      { type: "link", data: { label: "유튜브", url: "https://www.youtube.com/" } },
      { type: "link", data: { label: "블로그", url: "https://blog.naver.com/" } },
      { type: "divider", data: { style: "dot" } },
      /* 외곽선 일색에서 CTA 만 채움 — 포슬린에선 outline 강조가 일반 버튼과 1px 차이뿐이다(쏘넷) */
      { type: "link", data: { label: "협업 제안은 DM으로", url: "https://www.instagram.com/", emphasis: "primary" } },
      { type: "spacer", data: { size: 16 } },
      { type: "text", data: { text: "답장은 느리지만, 꼭 합니다.", align: "center" } },
    ],
  },
];
