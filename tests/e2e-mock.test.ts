import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';

// 환경변수 설정 (임포트 전 필수)
const testWebhookSecret = randomBytes(32).toString('hex');
process.env.GITHUB_WEBHOOK_SECRET = testWebhookSecret;
process.env.GITHUB_TOKEN = `unit-test-${randomBytes(16).toString('hex')}`;
process.env.LLM_GATEWAY_URL = 'http://localhost:4000';

/**
 * webhook-trigger의 dispatchWebhookEvent를 mock 처리
 * 신규 아키텍처: reviewer.ts 제거 → webhook-trigger.ts가 디스패치 담당
 */
const dispatchMock = vi.fn().mockResolvedValue({ triggered: true, pr: 1 });
vi.mock('../src/triggers/webhook-trigger.js', () => ({
  dispatchWebhookEvent: (event: string, payload: unknown) => dispatchMock(event, payload),
}));

describe('E2E Webhook Endpoint Test', () => {
  beforeAll(async () => {
    // index.ts 임포트 전 mock이 먼저 설정되어야 함
  });

  it('올바른 GitHub Webhook 요청 수신 시 202 Accepted를 반환하고 dispatchWebhookEvent를 호출해야 함', async () => {
    const { default: app } = await import('../src/index.js');
    const payload = JSON.stringify({
      action: 'opened',
      number: 1,
      pull_request: {
        number: 1,
        title: 'feat: test pr',
        body: 'PR body description',
        head: { ref: 'feature/test-branch' },
        user: { login: 'testuser' },
      },
      repository: {
        name: 'test-repo',
        owner: { login: 'testowner' },
      },
    });

    const sig = 'sha256=' + createHmac('sha256', testWebhookSecret).update(payload).digest('hex');

    const res = await app.request('/webhook/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': sig,
        'x-github-event': 'pull_request',
      },
      body: payload,
    });

    expect(res.status).toBe(202);
    const data = (await res.json()) as { accepted: boolean; pr: number };
    expect(data.accepted).toBe(true);
    expect(data.pr).toBe(1);

    // dispatchWebhookEvent가 올바른 인자로 호출되었는지 확인
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(dispatchMock).toHaveBeenCalledWith('pull_request', expect.objectContaining({ action: 'opened' }));
  });

  it('잘못된 시그니처 요청 시 401 반환해야 함', async () => {
    const { default: app } = await import('../src/index.js');
    const res = await app.request('/webhook/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'sha256=invalid',
        'x-github-event': 'pull_request',
      },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('issue_comment 이벤트 수신 시 dispatchWebhookEvent를 호출해야 함', async () => {
    const { default: app } = await import('../src/index.js');
    dispatchMock.mockResolvedValueOnce({ triggered: true, pr: 42 });

    const payload = JSON.stringify({
      action: 'created',
      issue: {
        number: 42,
        pull_request: { url: 'https://api.github.com/repos/testowner/test-repo/pulls/42' },
      },
      comment: { body: '/ai-review', user: { login: 'tester' } },
      repository: {
        name: 'test-repo',
        owner: { login: 'testowner' },
      },
    });

    const sig = 'sha256=' + createHmac('sha256', testWebhookSecret).update(payload).digest('hex');

    const res = await app.request('/webhook/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': sig,
        'x-github-event': 'issue_comment',
      },
      body: payload,
    });

    expect(res.status).toBe(202);
    const data = (await res.json()) as { accepted: boolean; pr: number };
    expect(data.accepted).toBe(true);
  });
});
