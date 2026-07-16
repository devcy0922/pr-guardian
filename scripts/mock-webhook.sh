#!/usr/bin/env node
// 🧪 GitHub Webhook 수동 모킹 스크립트 (node.js 기반)
// Usage: ./mock-webhook.sh [PR번호]

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 1. .env 파일 로드
const envPath = resolve(process.cwd(), '.env');
let secret = 'your_secret'; // 기본값
let port = 3002; // 기본값

try {
  const envContent = readFileSync(envPath, 'utf8');
  const envVars = {};
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      envVars[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  });

  if (envVars['GITHUB_WEBHOOK_SECRET']) {
    secret = envVars['GITHUB_WEBHOOK_SECRET'];
  }
  if (envVars['PORT']) {
    port = parseInt(envVars['PORT'], 10);
  }
} catch (e) {
  // .env 파일이 없거나 읽을 수 없는 경우 기본값 사용
}

const prNumber = parseInt(process.argv[2] || '1', 10);

// 2. GitHub Webhook Payload 구성
const payload = JSON.stringify({
  action: 'opened',
  number: prNumber,
  pull_request: {
    number: prNumber
  },
  repository: {
    name: 'pr-guardian',
    owner: {
      login: 'devcy0922'
    }
  }
});

// 3. HMAC-SHA256 시그니처 생성
const expectedSignature = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');

console.log(`⏳ Webhook POST 요청 송신 중... (Port: ${port}, PR: #${prNumber})`);

const options = {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-github-event': 'pull_request',
    'x-hub-signature-256': expectedSignature,
  },
  body: payload
};

try {
  const response = await fetch(`http://localhost:${port}/webhook`, options);
  const text = await response.text();
  console.log(`✉️ 응답 상태: ${response.status}`);
  console.log(`✉️ 응답 본문: ${text}`);
} catch (error) {
  console.error(`❌ 요청 실패: ${error.message}`);
  console.error(`⚠️ pr-guardian 서버가 포트 ${port}에서 구동 중인지 확인해 주세요.`);
}
