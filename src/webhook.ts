import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { review } from './reviewer.js';

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

/** GitHub 웹훅 핸들러 */
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

  // 이벤트 타입 필터
  const event = c.req.header('x-github-event');
  if (event !== 'pull_request') {
    return c.json({ skipped: true, reason: `event=${event}` }, 200);
  }

  const payload = JSON.parse(body);
  const action = payload.action as string;

  // opened, synchronize, reopened 만 처리
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return c.json({ skipped: true, reason: `action=${action}` }, 200);
  }

  const { number: prNumber } = payload.pull_request;
  const owner = payload.repository.owner.login as string;
  const repo = payload.repository.name as string;

  console.log(`[Webhook] PR #${prNumber} (${action}) — ${owner}/${repo}`);

  // 비동기 실행 (응답은 즉시 반환)
  review(owner, repo, prNumber).catch((err) => {
    console.error(`[Webhook] 리뷰 실패 — PR #${prNumber}:`, err);
  });

  return c.json({ accepted: true, pr: prNumber }, 202);
}
