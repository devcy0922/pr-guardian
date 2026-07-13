import type { CheckContext, CheckResult } from './index.js';
import { emptyUsage } from '../llm.js';
import { statusEmoji } from './index.js';

const TEST_PATTERNS = [
  /\.test\.\w+$/,
  /\.spec\.\w+$/,
  /^tests?\//,
  /__tests__\//,
  /test_[^/]+\.\w+$/,
];

/** Layer 0 — 테스트 코드 존재 여부 (Deterministic) */
export async function checkTestExists(ctx: CheckContext): Promise<CheckResult> {
  const testFiles = ctx.files.filter((f) =>
    TEST_PATTERNS.some((p) => p.test(f.filename))
  );

  const count = testFiles.length;
  const status = count > 0 ? 'pass' : 'fail';
  const detail = count > 0
    ? `테스트 파일 ${count}개:\n` + testFiles.map((f) => `- \`${f.filename}\` (+${f.additions} -${f.deletions})`).join('\n')
    : '변경된 파일 중 테스트 코드가 없습니다.';

  return {
    id: 'test-exists',
    label: '테스트 코드 존재',
    status,
    emoji: statusEmoji(status),
    detail,
    tokenUsage: emptyUsage(),
  };
}
