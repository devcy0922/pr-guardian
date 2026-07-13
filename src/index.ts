import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { handleWebhook } from './webhook.js';

const app = new Hono();

/** 헬스체크 */
app.get('/health', (c) => {
  return c.json({ status: 'ok', version: '0.1.0', service: 'pr-guardian' });
});

/** GitHub 웹훅 수신 */
app.post('/webhook/github', handleWebhook);

const port = Number(process.env.PORT ?? 3000);

console.log(`[PR Guardian] 서버 시작 — port ${port}`);
serve({ fetch: app.fetch, port });
