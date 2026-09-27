import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { handleWebhook } from './webhook.js';
import { handleApiReview } from './triggers/api-trigger.js';
import { closeRedis } from './lock.js';
import { pathToFileURL } from 'node:url';

const app = new Hono();

/** 헬스체크 */
app.get('/health', (c) => {
  return c.json({ status: 'ok', version: '0.2.0', service: 'pr-guardian' });
});

/** GitHub 웹훅 수신 (pull_request + issue_comment 이벤트) */
app.post('/webhook/github', handleWebhook);

/**
 * API 직접 리뷰 모드
 * 이미 수집된 PR/Jira 데이터를 페이로드로 받아 분석 후 JSON 반환.
 * 인증: 리버스 프록시에서 신뢰된 내부 네트워크만 허용.
 */
app.post('/api/review', handleApiReview);

/**
 * 서버 부트스트랩 (메인 진입점일 때만 실행)
 * 테스트(vitest)가 Hono `app`을 import할 때 실제 포트 바인드가 일어나지 않도록
 * `serve()`와 graceful-shutdown 등록을 메인 진입점 가드 안으로 분리한다.
 */
const isMainModule =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const port = Number(process.env.PORT ?? 3000);

  console.log(`[PR Guardian] 서버 시작 — port ${port}`);
  serve({ fetch: app.fetch, port });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[PR Guardian] SIGTERM 수신 — graceful shutdown 시작');
    await closeRedis();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[PR Guardian] SIGINT 수신 — graceful shutdown 시작');
    await closeRedis();
    process.exit(0);
  });
}

export default app;
