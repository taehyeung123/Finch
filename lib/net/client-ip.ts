import "server-only";

/*
  이 요청을 실제로 보낸 주소 — IP 로 무언가를 세거나 막는 코드는 반드시 이 함수를 쓴다.

  원칙: **위조할 수 없는 값에서 출발한다.**
   ① 바로 앞 접속자(peer) = Vercel 이 덮어쓰는 `x-vercel-forwarded-for`(없으면 `x-real-ip`).
      Vercel 문서(request-headers): x-forwarded-for 는 «덮어쓰고 외부 IP 를 전달하지 않는다 — IP 스푸핑 방지»,
      x-real-ip·x-vercel-forwarded-for 는 그와 같은 값. 요청자가 넣은 값은 여기 남지 않는다.
   ② peer 가 **Cloudflare 에지 주소일 때만** Cloudflare 가 넣은 `cf-connecting-ip`(실제 방문자)를 믿는다.
      Cloudflare 는 들어온 같은 이름의 헤더를 지우고 자기가 본 주소로 채운다 — 단, **Cloudflare 를 거친 요청에서만.**

  왜 이렇게 바꿨나(2026-09-10): 예전엔 `cf-connecting-ip` 가 있으면 무조건 믿었다. 그런데 Vercel 은 Cloudflare 를
  건너뛴 직접 접속도 받는다(Vercel 애니캐스트 주소에 Host 만 맞춰 보내면 된다 — 실측으로 확인). 그 요청에
  `cf-connecting-ip` 를 아무 값으로 넣으면 매번 다른 방문자가 되어, 잠긴 프로필 비밀번호 시도 상한이 통째로 무력했다.
  DNS 를 «DNS 전용»으로 바꾸면 모든 요청이 그 상태가 된다. 이 방식은 프록시를 켜든 끄든 코드 수정 없이 맞다.

  틀릴 때는 엄격한 쪽으로 틀린다: Cloudflare 가 새 대역을 쓰기 시작하면 그 요청은 «Cloudflare 아님»으로 분류돼
  에지 주소 단위로 세어진다(여러 방문자가 한 칸을 나눠 쓴다 — 과잉 차단). 목록은 아래 한 곳만 고치면 된다.

  ⚠️ `x-forwarded-for` 의 **첫** 값을 쓰지 말 것 — 앞단 프록시는 자기가 본 주소를 **뒤에 덧붙이므로** 첫 값은
  요청자가 넣은 값이다(2026-09-07 소넷 점검에서 한 번 그렇게 짰다가 잡혔다).
*/

/* Cloudflare 가 공개한 에지 대역 — https://www.cloudflare.com/ips-v4 · /ips-v6 (2026-09-10 확인,
   api.cloudflare.com/client/v4/ips etag 38f79d050aa027e3be3865e495dcc9bc). */
const CLOUDFLARE_V4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

const CLOUDFLARE_V6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

function parseV4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

/** IPv6 → 8개 16비트 칸. `::` 생략·IPv4 꼬리(::ffff:1.2.3.4)를 푼다. 깨진 값은 null */
function parseV6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  /* IPv4 꼬리 — 마지막 두 칸으로 바꾼다 */
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseV4(tail);
    if (v4 === null) return null;
    s = `${s.slice(0, lastColon + 1)}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const words = [...head, ...(halves.length === 2 ? new Array<string>(missing).fill("0") : []), ...rest];
  const out: number[] = [];
  for (const w of words) {
    if (!/^[0-9a-f]{1,4}$/.test(w)) return null;
    out.push(parseInt(w, 16));
  }
  return out.length === 8 ? out : null;
}

function inV4(ip: number, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const b = parseV4(base);
  const bits = Number(bitsRaw);
  if (b === null) return false;
  const size = 2 ** (32 - bits);
  return Math.floor(ip / size) === Math.floor(b / size);
}

function inV6(ip: number[], cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const b = parseV6(base);
  if (!b) return false;
  let bits = Number(bitsRaw);
  for (let i = 0; i < 8 && bits > 0; i++) {
    const take = Math.min(16, bits);
    const mask = take === 16 ? 0xffff : (0xffff << (16 - take)) & 0xffff;
    if ((ip[i] & mask) !== (b[i] & mask)) return false;
    bits -= take;
  }
  return true;
}

/** Cloudflare 에지에서 온 연결인가 — IPv4, IPv6, IPv4-mapped IPv6 를 모두 본다 */
export function isCloudflareEdge(ip: string): boolean {
  const v4 = parseV4(ip);
  if (v4 !== null) return CLOUDFLARE_V4.some((c) => inV4(v4, c));
  const v6 = parseV6(ip);
  if (!v6) return false;
  /* ::ffff:a.b.c.d — IPv4 로 다시 본다 */
  if (v6.slice(0, 5).every((w) => w === 0) && v6[5] === 0xffff) {
    return CLOUDFLARE_V4.some((c) => inV4(v6[6] * 65536 + v6[7], c));
  }
  return CLOUDFLARE_V6.some((c) => inV6(v6, c));
}

/** 쉼표 목록의 **마지막** 값 — 가장 가까운 프록시가 붙인 값 */
function lastOf(value: string | null): string {
  if (!value) return "";
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

/** 이 요청을 보낸 방문자 주소. 알 수 없으면 빈 문자열(호출부가 «제한 없음»이 아니라 «판단 불가»로 다룰 것) */
export function clientIp(h: Headers): string {
  const peer = lastOf(h.get("x-vercel-forwarded-for")) || lastOf(h.get("x-real-ip")) || lastOf(h.get("x-forwarded-for"));
  if (peer && isCloudflareEdge(peer)) {
    const cf = h.get("cf-connecting-ip")?.trim();
    if (cf) return cf;
  }
  return peer;
}
