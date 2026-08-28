import type { LinkLang } from "./settings";

/*
  공개 페이지(방문자 화면) 고정 문구 — 리틀리 「글로벌 언어(ko/en/ja)」 카피(5단계).
  주인이 쓴 제목·본문은 번역하지 않는다(그건 그 사람의 글). 폼 라벨·버튼·빈 상태·안내처럼
  **우리가 그리는 문구**만 바뀐다. 편집기(/links)는 항상 한국어다.

  ⚠️ 클라이언트 컴포넌트에 prop 으로 넘어가므로 함수(more/photoLink)는 넣지 않는다 —
  서버→클라이언트 경계를 못 넘는다. 개수는 {n} 치환으로 푼다.
*/
export interface LpText {
  /** 이 문구 묶음의 언어 — 날짜·요일을 Intl 로 찍을 때 쓴다(문구를 비교해 언어를 추측하지 않게) */
  lang: LinkLang;
  emptyLinks: string;
  /** {n} 치환 */
  more: string;
  less: string;
  share: string;
  copied: string;
  badge: string;
  /** 맨 아래 작게 고정되는 문구 — {name} 자리에 페이지 이름 */
  badgeWith: string;
  /** 플로팅 알약 문구 */
  badgeCta: string;
  lead: {
    name: string; email: string; phone: string; message: string;
    fail: string; failRetry: string;
    doneSubscribe: string; doneContact: string; doneNote: string;
    titleSubscribe: string; titleContact: string;
    demo: string; send: string; sending: string; subscribe: string;
    /** 개인정보 동의 — spec 의 {items}는 실제 폼 필드 라벨, {purpose}는 목적 문구로 치환된다 */
    consent: string; consentSpec: string; consentPurposeContact: string; consentPurposeSubscribe: string;
  };
  guestbook: {
    title: string; placeholder: string; name: string; body: string;
    send: string; sending: string; thanks: string; demo: string; fail: string; empty: string;
  };
  /* count 는 {n} 을 결과 수로 바꿔 쓴다(lpN). clear 는 지우기 버튼의 보조기기 이름 */
  search: { placeholder: string; empty: string; aria: string; count: string; clear: string };
  vcard: string;
  /** 법적 풋터 — 이용약관·개인정보처리방침 */
  legalTerms: string;
  legalPrivacy: string;
  file: string;
  music: string;
  video: string;
  product: string;
  coupangView: string;
  donate: string;
  map: string;
  /** 일정 블록 — 제목·지난 일정 표시·캘린더 담기·하루 종일 */
  events: { title: string; past: string; add: string; allday: string };
  imageLink: string;
  /** {n} 치환 */
  photoLink: string;
  /** {n} 치환 — 최근 게시물 타일 */
  postLink: string;
  /** {n} 치환 — 제목 없는 카드·그리드 항목 */
  itemLink: string;
  /** 링크 버튼 이름이 비었을 때 */
  link: string;
  /** 강조 CTA 기본 문구 */
  go: string;
  lock: { title: string; placeholder: string; submit: string; wrong: string; checking: string };
  /** 서버 액션 실패 코드 → 문구(감사 C8: 서버가 한국어 문장을 돌려주면 en/ja 페이지에도 한국어가 떴다) */
  errors: Record<LpErrorCode, string>;
}

export type LpErrorCode =
  | "unavailable"
  | "notFound"
  | "invalid"
  | "empty"
  | "needContact"
  | "badEmail"
  | "busy"
  | "tooMany"
  | "failed"
  | "demo"
  | "wrongPassword";

const ko: LpText = {
  lang: "ko",
  emptyLinks: "아직 등록된 링크가 없어요.",
  more: "더보기 ({n}개)",
  less: "접기",
  share: "이 페이지 공유",
  copied: "주소를 복사했어요",
  badge: "핀치에서 내 프로필 꾸미기",
  badgeWith: "핀치에서 {name}님과 함께하세요",
  badgeCta: "나만의 페이지 만들기",
  lead: {
    name: "이름", email: "이메일", phone: "연락처", message: "문의 내용",
    fail: "접수하지 못했어요.", failRetry: "접수하지 못했어요. 잠시 후 다시 시도해 주세요.",
    doneSubscribe: "구독 신청이 접수됐어요", doneContact: "문의가 접수됐어요", doneNote: "확인 후 연락드릴게요. 고맙습니다!",
    titleSubscribe: "새 소식 받기", titleContact: "문의하기",
    demo: "예시 폼이에요 — 실제로 접수되지는 않습니다.", send: "보내기", sending: "보내는 중…", subscribe: "구독하기",
    consent: "개인정보 수집·이용에 동의합니다.",
    consentSpec: "(항목: {items} / 목적: {purpose} / 보유: 목적 달성 후 지체 없이 파기)",
    consentPurposeContact: "문의 응대", consentPurposeSubscribe: "소식 발송",
  },
  guestbook: {
    title: "방명록", placeholder: "한마디 남겨 주세요", name: "이름", body: "방명록 내용",
    send: "남기기", sending: "남기는 중…", thanks: "남겨 주셔서 고마워요!", demo: "예시 페이지에서는 남길 수 없어요.",
    fail: "보내지 못했어요.", empty: "아직 남겨진 글이 없어요. 첫 글을 남겨 보세요.",
  },
  search: { placeholder: "무엇을 찾으세요?", empty: "찾는 내용이 없어요.", aria: "페이지 안 검색", count: "{n}개 찾았어요", clear: "검색어 지우기" },
  vcard: "연락처 저장",
  legalTerms: "이용약관",
  legalPrivacy: "개인정보처리방침",
  file: "파일",
  music: "음악",
  video: "영상 보러 가기",
  product: "상품 보러 가기",
  coupangView: "쿠팡에서 보기",
  donate: "후원하기",
  map: "찾아오시는 길",
  events: { title: "일정", past: "지난 일정", add: "캘린더에 추가", allday: "하루 종일" },
  imageLink: "이미지 링크",
  photoLink: "사진 {n} 링크",
  postLink: "게시물 {n}",
  itemLink: "항목 {n} 링크",
  link: "링크",
  go: "바로가기",
  lock: { title: "비밀번호가 있는 페이지예요", placeholder: "비밀번호", submit: "열기", wrong: "비밀번호가 맞지 않아요.", checking: "확인 중…" },
  errors: {
    unavailable: "지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.",
    notFound: "페이지를 찾을 수 없어요.",
    invalid: "접수할 수 없는 요청이에요.",
    empty: "내용을 입력해 주세요.",
    needContact: "이메일 또는 연락처를 입력해 주세요.",
    badEmail: "이메일 형식이 올바르지 않아요.",
    busy: "지금은 요청이 몰려 있어요. 잠시 후 다시 시도해 주세요.",
    tooMany: "너무 자주 시도했어요. 잠시 후 다시 시도해 주세요.",
    failed: "처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
    demo: "예시 페이지에서는 할 수 없어요.",
    wrongPassword: "비밀번호가 맞지 않아요.",
  },
};

const en: LpText = {
  lang: "en",
  emptyLinks: "No links yet.",
  more: "Show more ({n})",
  less: "Show less",
  share: "Share this page",
  copied: "Link copied",
  badge: "Make your own on Finch",
  badgeWith: "Join {name} on Finch",
  badgeCta: "Create your own page",
  lead: {
    name: "Name", email: "Email", phone: "Phone", message: "Message",
    fail: "Couldn't send.", failRetry: "Couldn't send. Please try again in a moment.",
    doneSubscribe: "You're subscribed", doneContact: "Message received", doneNote: "We'll get back to you soon. Thank you!",
    titleSubscribe: "Get updates", titleContact: "Contact",
    demo: "Sample form — nothing is actually sent.", send: "Send", sending: "Sending…", subscribe: "Subscribe",
    consent: "I agree to the collection and use of my personal information.",
    consentSpec: "(Data: {items} / Purpose: {purpose} / Retention: deleted once fulfilled)",
    consentPurposeContact: "responding to this inquiry", consentPurposeSubscribe: "sending updates",
  },
  guestbook: {
    title: "Guestbook", placeholder: "Leave a note", name: "Name", body: "Your note",
    send: "Post", sending: "Posting…", thanks: "Thanks for your note!", demo: "Notes can't be posted on the sample page.",
    fail: "Couldn't post.", empty: "No notes yet. Be the first!",
  },
  search: { placeholder: "Search this page", empty: "Nothing found.", aria: "Search within page", count: "{n} found", clear: "Clear search" },
  vcard: "Save contact",
  legalTerms: "Terms",
  legalPrivacy: "Privacy",
  file: "File",
  music: "Music",
  video: "Watch video",
  product: "View product",
  coupangView: "View on Coupang",
  donate: "Support",
  map: "Directions",
  events: { title: "Schedule", past: "Past", add: "Add to calendar", allday: "All day" },
  imageLink: "Image link",
  photoLink: "Photo {n} link",
  postLink: "Post {n}",
  itemLink: "Item {n} link",
  link: "Link",
  go: "Open",
  lock: { title: "This page is password-protected", placeholder: "Password", submit: "Open", wrong: "Wrong password.", checking: "Checking…" },
  errors: {
    unavailable: "Not available right now. Please try again shortly.",
    notFound: "Page not found.",
    invalid: "This request can't be processed.",
    empty: "Please fill in the required fields.",
    needContact: "Please enter an email or phone number.",
    badEmail: "That email address doesn't look right.",
    busy: "Too many requests right now. Please try again shortly.",
    tooMany: "Too many attempts. Please wait a moment and try again.",
    failed: "Something went wrong. Please try again shortly.",
    demo: "Not available on the sample page.",
    wrongPassword: "Wrong password.",
  },
};

const ja: LpText = {
  lang: "ja",
  emptyLinks: "まだリンクがありません。",
  more: "もっと見る ({n})",
  less: "閉じる",
  share: "このページを共有",
  copied: "リンクをコピーしました",
  badge: "Finchで自分のページを作る",
  badgeWith: "Finchで{name}さんと一緒に",
  badgeCta: "自分のページを作る",
  lead: {
    name: "お名前", email: "メール", phone: "電話番号", message: "お問い合わせ内容",
    fail: "送信できませんでした。", failRetry: "送信できませんでした。しばらくしてからもう一度お試しください。",
    doneSubscribe: "登録を受け付けました", doneContact: "お問い合わせを受け付けました", doneNote: "確認のうえご連絡します。ありがとうございます！",
    titleSubscribe: "お知らせを受け取る", titleContact: "お問い合わせ",
    demo: "サンプルフォームです — 実際には送信されません。", send: "送信", sending: "送信中…", subscribe: "登録する",
    consent: "個人情報の収集・利用に同意します。",
    consentSpec: "（項目: {items} ／ 目的: {purpose} ／ 保有: 目的達成後、遅滞なく破棄）",
    consentPurposeContact: "お問い合わせ対応", consentPurposeSubscribe: "お知らせの送信",
  },
  guestbook: {
    title: "ゲストブック", placeholder: "ひとこと残してください", name: "お名前", body: "メッセージ",
    send: "投稿", sending: "投稿中…", thanks: "メッセージをありがとうございます！", demo: "サンプルページでは投稿できません。",
    fail: "投稿できませんでした。", empty: "まだ投稿がありません。最初のひとことをどうぞ。",
  },
  search: { placeholder: "ページ内を検索", empty: "見つかりませんでした。", aria: "ページ内検索", count: "{n}件見つかりました", clear: "検索をクリア" },
  vcard: "連絡先を保存",
  legalTerms: "利用規約",
  legalPrivacy: "プライバシー",
  file: "ファイル",
  music: "音楽",
  video: "動画を見る",
  product: "商品を見る",
  coupangView: "Coupangで見る",
  donate: "応援する",
  map: "アクセス",
  events: { title: "スケジュール", past: "終了した予定", add: "カレンダーに追加", allday: "終日" },
  imageLink: "画像リンク",
  photoLink: "写真 {n} のリンク",
  postLink: "投稿 {n}",
  itemLink: "項目 {n} のリンク",
  link: "リンク",
  go: "開く",
  lock: { title: "パスワードが必要なページです", placeholder: "パスワード", submit: "開く", wrong: "パスワードが違います。", checking: "確認中…" },
  errors: {
    unavailable: "現在ご利用いただけません。しばらくしてからお試しください。",
    notFound: "ページが見つかりません。",
    invalid: "このリクエストは処理できません。",
    empty: "必要な項目を入力してください。",
    needContact: "メールアドレスか電話番号を入力してください。",
    badEmail: "メールアドレスの形式が正しくありません。",
    busy: "ただいま混み合っています。しばらくしてからお試しください。",
    tooMany: "試行回数が多すぎます。しばらくしてからお試しください。",
    failed: "処理できませんでした。しばらくしてからお試しください。",
    demo: "サンプルページでは利用できません。",
    wrongPassword: "パスワードが違います。",
  },
};

const TEXT: Record<LinkLang, LpText> = { ko, en, ja };

export function lpText(lang: string | undefined): LpText {
  return lang && Object.hasOwn(TEXT, lang) ? TEXT[lang as LinkLang] : ko;
}

/** "{n}" 치환 */
export function lpN(tpl: string, n: number): string {
  return tpl.replace("{n}", String(n));
}
