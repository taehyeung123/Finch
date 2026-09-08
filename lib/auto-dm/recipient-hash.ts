import "server-only";
import crypto from "node:crypto";

/*
  댓글 작성자 식별값의 해시 — 원문 인스타 사용자 id 는 저장하지 않는다.

  왜 페퍼를 넣었나 (2026-09-08 보안 감사): 예전에는 **비밀 키 없는 SHA-256** 이었다.
  인스타 사용자 id 는 숫자이고, 무엇보다 «어떤 게시물에 누가 댓글을 달았는지»는 공개 정보다 —
  후보 목록을 손에 넣은 사람은 해시를 하나씩 대조해 **«이 사람이 수신거부했는지»·«DM 을 받았는지»**
  를 확인할 수 있었다. 개인정보처리방침은 이 값을 「식별 최소화를 위해 해시 처리」라고 설명하는데,
  키 없는 해시는 그 주장을 뒷받침하지 못한다.

  ⚠️ **기존 해시를 다시 계산하지 않는다.** 저장된 값은 이미 sha256(id) 라서 원문 id 를 되찾을 수 없고,
  되찾을 수 없는 값을 한꺼번에 바꾸다 잘못되면 **수신거부한 사람에게 DM 이 다시 나간다** —
  고칠 수 없는 종류의 사고다(이미 발송됨).
  그래서 재계산 대신 **둘 다 인정한다**: 새로 쓰는 값은 페퍼가 들어간 것이고,
  조회할 때는 새 값과 옛 값을 함께 본다(0090 의 두 함수). 옛 행은 그대로 사람을 보호하고,
  시간이 지나면 자연히 사라진다.

  페퍼가 없으면 예전과 같은 값이 나온다 — 즉 **페퍼를 넣기 전과 후가 안전하게 이어진다.**
  (페퍼를 넣지 않으면 보호가 없을 뿐, 아무것도 깨지지 않는다.)
  ⚠️ 페퍼를 한 번 넣은 뒤에 **바꾸거나 잃어버리면** 그 뒤로 만들어진 수신거부 기록이 영영 매칭되지 않는다.
  DM_HASH_PEPPER 는 TOKEN_ENCRYPTION_KEY 와 같은 급으로 다룬다.
*/

function pepper(): string {
  return process.env.DM_HASH_PEPPER ?? "";
}

/** 옛 방식 — 비밀 키 없는 SHA-256. **조회에만** 쓴다(이미 저장된 행을 계속 찾기 위해). */
export function legacyRecipientHash(igUserId: string): string {
  return crypto.createHash("sha256").update(igUserId).digest("hex");
}

/** 지금 방식 — 페퍼가 있으면 HMAC, 없으면 옛 방식과 같은 값. 새로 저장하는 값은 항상 이것이다. */
export function recipientHash(igUserId: string): string {
  const key = pepper();
  if (!key) return legacyRecipientHash(igUserId);
  return crypto.createHmac("sha256", key).update(igUserId).digest("hex");
}

/**
 * 조회에 쓸 두 값. `legacy` 가 `current` 와 같으면(페퍼 미설정) null 을 준다 —
 * 같은 값을 두 번 비교하게 두면 SQL 쪽 의도가 흐려진다.
 */
export function recipientHashes(igUserId: string): { current: string; legacy: string | null } {
  const current = recipientHash(igUserId);
  const legacy = legacyRecipientHash(igUserId);
  return { current, legacy: legacy === current ? null : legacy };
}
