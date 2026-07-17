import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { dispatchWebhookEvent } from './triggers/webhook-trigger.js';

/**
 * GitHub 웹훅 시그니처 검증 (HMAC-SHA256)
 * timing-safe comparison으로 타이밍 공격 방지
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * GitHub 웹훅 라우터
 *
 * 역할: 시그니처 검증 + 이벤트 타입 파싱 → webhook-trigger로 디스패치
 * 실제 이벤트 해석 및 리뷰 실행은 webhook-trigger.ts가 담당한다.
 */
export async function handleWebhook(c: Context): Promise<Response> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Webhook] GITHUB_WEBHOOK_SECRET 미설정');
    return c.json({ error: 'server misconfigured' }, 500);
  }

  // 시그니처 검증
  const signature = c.req.header('x-hub-signature-256') ?? '';
  const body = await c.req.text();

  if (!verifySignature(body, signature, secret)) {
    console.warn('[Webhook] 시그니처 검증 실패');
    return c.json({ error: 'invalid signature' }, 401);
  }

  const event = c.req.header('x-github-event') ?? '';
  const payload = JSON.parse(body) as Record<string, unknown>;

  // 지원하는 이벤트 타입만 디스패치
  const supportedEvents = ['pull_request', 'issue_comment'];
  if (!supportedEvents.includes(event)) {
    return c.json({ skipped: true, reason: `event=${event}` }, 200);
  }

  const result = await dispatchWebhookEvent(event, payload);

  if (!result.triggered) {
    return c.json({ skipped: true, reason: result.reason }, 200);
  }

  // 리뷰는 비동기 실행 중, 즉시 202 반환
  return c.json({ accepted: true, pr: result.pr }, 202);
}
