import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import { createHmac } from 'node:crypto';

// GITHUB_WEBHOOK_SECRET 임시 설정
process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
process.env.GITHUB_TOKEN = 'mock-token';
process.env.LLM_GATEWAY_URL = 'http://localhost:4000';

// reviewer 모듈의 review 함수를 mock 처리
const reviewMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/reviewer.js', () => ({
  review: (owner: string, repo: string, prNumber: number) => reviewMock(owner, repo, prNumber),
}));

describe('E2E Webhook Endpoint Test', () => {
  let server: Server;
  const port = 3999;

  beforeAll(async () => {
    const { default: app } = await import('../src/index.js');
    // 임시로 포트를 변경해서 서버를 기동하거나, hono app.fetch를 직접 테스트할 수 있습니다.
    // 여기서는 app.fetch를 사용해 HTTP 서버 기동 없이 가상 요청을 보냅니다.
  });

  it('올바른 GitHub Webhook 요청 수신 시 202 Accepted를 반환하고 review를 비동기 실행해야 함', async () => {
    const { default: app } = await import('../src/index.js');
    const payload = JSON.stringify({
      action: 'opened',
      number: 1,
      pull_request: {
        number: 1,
        title: 'feat: test pr',
        body: 'PR body description',
        head: { ref: 'feature/test-branch' },
        user: { login: 'testuser' }
      },
      repository: {
        name: 'test-repo',
        owner: { login: 'testowner' }
      }
    });

    const sig = 'sha256=' + createHmac('sha256', 'test-secret').update(payload).digest('hex');

    const res = await app.request('/webhook/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': sig,
        'x-github-event': 'pull_request'
      },
      body: payload
    });

    expect(res.status).toBe(202);
    const data = await res.json() as { accepted: boolean; pr: number };
    expect(data.accepted).toBe(true);
    expect(data.pr).toBe(1);

    // 비동기 처리가 시작되었는지 약간 대기 후 확인
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(reviewMock).toHaveBeenCalledWith('testowner', 'test-repo', 1);
  });

  it('잘못된 시그니처 요청 시 401 반환해야 함', async () => {
    const { default: app } = await import('../src/index.js');
    const res = await app.request('/webhook/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'sha256=invalid',
        'x-github-event': 'pull_request'
      },
      body: '{}'
    });
    expect(res.status).toBe(401);
  });
});
