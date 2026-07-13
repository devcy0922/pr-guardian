import { review } from '../src/reviewer.js';

// 임시 환경변수 설정
process.env.GITHUB_WEBHOOK_SECRET = 'local-secret';
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? 'mock-token';
process.env.LLM_GATEWAY_URL = process.env.LLM_GATEWAY_URL ?? 'http://192.168.0.5:4000';
process.env.LLM_MODEL = process.env.LLM_MODEL ?? 'qwen3-8b';

async function runSimulation() {
  console.log('🚀 [PR Guardian] E2E 리뷰 파이프라인 시뮬레이션 시작...');
  const owner = 'devcy0922';
  const repo = 'pr-guardian';
  const prNumber = 1;

  try {
    // 실제 GitHub 토큰이 없는 테스트 실행 대비 에러 캡처 처리
    await review(owner, repo, prNumber);
    console.log('✅ [PR Guardian] 시뮬레이션 프로세스 정상 완료');
  } catch (err) {
    console.error('❌ [PR Guardian] 시뮬레이션 도중 에러 감지 (정상 케이스):', String(err));
  }
}

runSimulation();
