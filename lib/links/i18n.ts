import type { LinkLang } from "./settings";

/*
  공개 페이지(방문자 화면) 고정 문구 — 리틀리 「글로벌 언어(ko/en/ja)」 카피(5단계).
  주인이 쓴 제목·본문은 번역하지 않는다(그건 그 사람의 글). 폼 라벨·버튼·빈 상태·안내처럼
  **우리가 그리는 문구**만 바뀐다. 편집기(/links)는 항상 한국어다.

  ⚠️ 클라이언트 컴포넌트에 prop 으로 넘어가므로 함수(more/photoLink)는 넣지 않는다 —
  서버→클라이언트 경계를 못 넘는다. 개수는 {n} 치환으로 푼다.
*/
export interface LpText {
  emptyLinks: string;
  /** {n} 치환 */
  more: string;
  less: string;
  share: string;
  copied: string;
  badge: string;
  lead: {
    name: string; email: string; phone: string; message: string;
    fail: string; failRetry: string;
    doneSubscribe: string; doneContact: string; doneNote: string;
    titleSubscribe: string; titleContact: string;
    demo: string; send: string; sending: string; subscribe: string;
  };
  guestbook: {
    title: string; placeholder: string; name: string; body: string;
    send: string; sending: string; thanks: string; demo: string; fail: string; empty: string;
  };
  search: { placeholder: string; empty: string; aria: string };
  vcard: string;
  file: string;
  music: string;
  video: string;
  product: string;
  coupangView: string;
  donate: string;
  map: string;
  imageLink: string;
  /** {n} 치환 */
  photoLink: string;
  /** {n} 치환 — 최근 게시물 타일 */
  postLink: string;
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
  | "badEmail"
  | "busy"
  | "tooMany"
  | "failed"
  | "demo"
  | "wrongPassword";

const ko: LpText = {
  emptyLinks: "아직 등록된 링크가 없어요.",
  more: "더보기 ({n}개)",
  less: "접기",
  share: "이 페이지 공유",
  copied: "주소를 복사했어요",
  badge: "핀치에서 내 프로필 꾸미기",
  lead: {
    name: "이름", email: "이메일", phone: "연락처", message: "문의 내용",
    fail: "접수하지 못했어요.", failRetry: "접수하지 못했어요. 잠시 후 다시 시도해 주세요.",
    doneSubscribe: "구독 신청이 접수됐어요", doneContact: "문의가 접수됐어요", doneNote: "확인 후 연락드릴게요. 고맙습니다!",
    titleSubscribe: "새 소식 받기", titleContact: "문의하기",
    demo: "예시 폼이에요 — 실제로 접수되지는 않습니다.", send: "보내기", sending: "보내는 중…", subscribe: "구독하기",
  },
  guestbook: {
    title: "방명록", placeholder: "한마디 남겨 주세요", name: "이름", body: "방명록 내용",
    send: "남기기", sending: "남기는 중…", thanks: "남겨 주셔서 고마워요!", demo: "예시 페이지에서는 남길 수 없어요.",
    fail: "보내지 못했어요.", empty: "아직 남겨진 글이 없어요. 첫 글을 남겨 보세요.",
  },
  search: { placeholder: "무엇을 찾으세요?", empty: "찾는 내용이 없어요.", aria: "페이지 안 검색" },
  vcard: "연락처 저장",
  file: "파일",
  music: "음악",
  video: "영상 보러 가기",
  product: "상품 보러 가기",
  coupangView: "쿠팡에서 보기",
  donate: "후원하기",
  map: "찾아오시는 길",
  imageLink: "이미지 링크",
  photoLink: "사진 {n} 링크",
  postLink: "게시물 {n}",
  link: "링크",
  go: "바로가기",
  lock: { title: "비밀번호가 있는 페이지예요", placeholder: "비밀번호", submit: "열기", wrong: "비밀번호가 맞지 않아요.", checking: "확인 중…" },
  errors: {
    unavailable: "지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.",
    notFound: "페이지를 찾을 수 없어요.",
    invalid: "접수할 수 없는 요청이에요.",
    empty: "내용을 입력해 주세요.",
    badEmail: "이메일 형식이 올바르지 않아요.",
    busy: "지금은 요청이 몰려 있어요. 잠시 후 다시 시도해 주세요.",
    tooMany: "너무 자주 시도했어요. 잠시 후 다시 시도해 주세요.",
    failed: "처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
    demo: "예시 페이지에서는 할 수 없어요.",
    wrongPassword: "비밀번호가 맞지 않아요.",
  },
};

const en: LpText = {
  emptyLinks: "No links yet.",
  more: "Show more ({n})",
  less: "Show less",
  share: "Share this page",
  copied: "Link copied",
  badge: "Make your own on Finch",
  lead: {
    name: "Name", email: "Email", phone: "Phone", message: "Message",
    fail: "Couldn't send.", failRetry: "Couldn't send. Please try again in a moment.",
    doneSubscribe: "You're subscribed", doneContact: "Message received", doneNote: "We'll get back to you soon. Thank you!",
    titleSubscribe: "Get updates", titleContact: "Contact",
    demo: "Sample form — nothing is actually sent.", send: "Send", sending: "Sending…", subscribe: "Subscribe",
  },
  guestbook: {
    title: "Guestbook", placeholder: "Leave a note", name: "Name", body: "Your note",
    send: "Post", sending: "Posting…", thanks: "Thanks for your note!", demo: "Notes can't be posted on the sample page.",
    fail: "Couldn't post.", empty: "No notes yet. Be the first!",
  },
  search: { placeholder: "Search this page", empty: "Nothing found.", aria: "Search within page" },
  vcard: "Save contact",
  file: "File",
  music: "Music",
  video: "Watch video",
  product: "View product",
  coupangView: "View on Coupang",
  donate: "Support",
  map: "Directions",
  imageLink: "Image link",
  photoLink: "Photo {n} link",
  postLink: "Post {n}",
  link: "Link",
  go: "Open",
  lock: { title: "This page is password-protected", placeholder: "Password", submit: "Open", wrong: "Wrong password.", checking: "Checking…" },
  errors: {
    unavailable: "Not available right now. Please try again shortly.",
    notFound: "Page not found.",
    invalid: "This request can't be processed.",
    empty: "Please fill in the required fields.",
    badEmail: "That email address doesn't look right.",
    busy: "Too many requests right now. Please try again shortly.",
    tooMany: "Too many attempts. Please wait a moment and try again.",
    failed: "Something went wrong. Please try again shortly.",
    demo: "Not available on the sample page.",
    wrongPassword: "Wrong password.",
  },
};

const ja: LpText = {
  emptyLinks: "まだリンクがありません。",
  more: "もっと見る ({n})",
  less: "閉じる",
  share: "このページを共有",
  copied: "リンクをコピーしました",
  badge: "Finchで自分のページを作る",
  lead: {
    name: "お名前", email: "メール", phone: "電話番号", message: "お問い合わせ内容",
    fail: "送信できませんでした。", failRetry: "送信できませんでした。しばらくしてからもう一度お試しください。",
    doneSubscribe: "登録を受け付けました", doneContact: "お問い合わせを受け付けました", doneNote: "確認のうえご連絡します。ありがとうございます！",
    titleSubscribe: "お知らせを受け取る", titleContact: "お問い合わせ",
    demo: "サンプルフォームです — 実際には送信されません。", send: "送信", sending: "送信中…", subscribe: "登録する",
  },
  guestbook: {
    title: "ゲストブック", placeholder: "ひとこと残してください", name: "お名前", body: "メッセージ",
    send: "投稿", sending: "投稿中…", thanks: "メッセージをありがとうございます！", demo: "サンプルページでは投稿できません。",
    fail: "投稿できませんでした。", empty: "まだ投稿がありません。最初のひとことをどうぞ。",
  },
  search: { placeholder: "ページ内を検索", empty: "見つかりませんでした。", aria: "ページ内検索" },
  vcard: "連絡先を保存",
  file: "ファイル",
  music: "音楽",
  video: "動画を見る",
  product: "商品を見る",
  coupangView: "Coupangで見る",
  donate: "応援する",
  map: "アクセス",
  imageLink: "画像リンク",
  photoLink: "写真 {n} のリンク",
  postLink: "投稿 {n}",
  link: "リンク",
  go: "開く",
  lock: { title: "パスワードが必要なページです", placeholder: "パスワード", submit: "開く", wrong: "パスワードが違います。", checking: "確認中…" },
  errors: {
    unavailable: "現在ご利用いただけません。しばらくしてからお試しください。",
    notFound: "ページが見つかりません。",
    invalid: "このリクエストは処理できません。",
    empty: "必要な項目を入力してください。",
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
