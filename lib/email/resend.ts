import "server-only";
import { Resend } from "resend";

/**
 * 이메일 발송 — Resend. RESEND_EMAIL_FROM 미검증 도메인이면 기본값(onboarding@resend.dev)으로도
 * 테스트 발송은 되지만, 정식 발신은 finch.ai.kr 도메인을 Resend에서 검증(DNS 레코드 추가) 후 사용한다.
 * RESEND_API_KEY 미설정이면 조용히 no-op — 이메일은 알림의 부가 채널이라 실패해도 인앱 알림은 유지된다.
 */

let client: Resend | null | undefined;

function getClient(): Resend | null {
  if (client !== undefined) return client;
  const key = process.env.RESEND_API_KEY;
  client = key ? new Resend(key) : null;
  return client;
}

const BRAND_CORAL = "#FF6B4A"; // app/globals.css --primary — 이메일은 인라인 스타일만 허용돼 CSS 토큰을 못 쓴다

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="ko"><body style="margin:0;padding:0;background:#F7F6F4;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:20px;font-weight:800;color:${BRAND_CORAL};margin-bottom:24px;">핀치</div>
    <div style="background:#fff;border:1px solid #E5E1DB;border-radius:16px;padding:28px;">
      <h1 style="font-size:17px;font-weight:700;margin:0 0 10px;color:#1A1A1A;">${title}</h1>
      <p style="font-size:14px;line-height:1.6;color:#4A4640;margin:0;">${body}</p>
      <a href="https://finch.ai.kr" style="display:inline-block;margin-top:20px;padding:10px 18px;background:${BRAND_CORAL};color:#1A1A1A;font-weight:700;font-size:13px;border-radius:10px;text-decoration:none;">
        핀치에서 확인하기
      </a>
    </div>
    <p style="font-size:12px;color:#9A948A;margin-top:20px;">
      이 메일은 핀치 알림 설정에 따라 발송되었어요. 설정 &gt; 알림에서 수신을 끌 수 있습니다.
    </p>
  </div>
</body></html>`;
}

/** 알림 이메일 발송 — 실패는 예외를 던지지 않고 false로 흡수(호출측이 인앱 알림까지 실패 처리하지 않도록) */
export async function sendNotificationEmail(to: string, title: string, body: string): Promise<boolean> {
  const resend = getClient();
  if (!resend) return false;
  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_EMAIL_FROM || "핀치 <onboarding@resend.dev>",
      to,
      subject: `[핀치] ${title}`,
      html: wrapHtml(title, body),
    });
    if (error) {
      console.error("[email] 발송 실패:", error.message ?? error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] 발송 예외:", e instanceof Error ? e.message : String(e));
    return false;
  }
}
