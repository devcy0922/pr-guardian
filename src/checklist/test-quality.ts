import { z } from 'zod';
import type { CheckContext, CheckResult } from './index.js';
import type { LLMClient } from '../llm.js';
import { emptyUsage } from '../llm.js';
import { statusEmoji } from './index.js';

const TEST_PATTERNS = [/\.test\.\w+$/, /\.spec\.\w+$/, /^tests?\//, /__tests__\//, /test_[^/]+\.\w+$/];

const TestQualitySchema = z.object({
  grade: z.enum(['A', 'B', 'C', 'D']),
  reason: z.string(),
  suggestions: z.array(z.string()),
});

/**
 * Layer 2 — 테스트 코드 평가 (LLM)
 * 테스트 파일이 없으면 스킵. 있으면 테스트 diff만 전달하여 품질 평가.
 */
export async function checkTestQuality(ctx: CheckContext, llm: LLMClient): Promise<CheckResult> {
  const testFiles = ctx.files.filter((f) =>
    TEST_PATTERNS.some((p) => p.test(f.filename))
  );

  // 테스트 없으면 스킵 (LLM 호출 안 함)
  if (testFiles.length === 0) {
    return {
      id: 'test-quality',
      label: '테스트 코드 평가',
      status: 'skip',
      emoji: statusEmoji('skip'),
      detail: '변경된 테스트 파일 없음 — 평가 생략',
      tokenUsage: emptyUsage(),
    };
  }

  // 테스트 파일 patch만 추출 (최대 100줄)
  const testDiff = testFiles
    .map((f) => `--- ${f.filename} ---\n${f.patch}`)
    .join('\n\n')
    .split('\n')
    .slice(0, 100)
    .join('\n');

  const systemPrompt = '테스트 코드 품질 평가관. 등급과 이유 JSON 출력. {"grade":"A|B|C|D","reason":"...","suggestions":["..."]}';
  const userPrompt = `테스트 diff:\n${testDiff}`;

  try {
    const result = await llm.chat({ systemPrompt, userPrompt, maxTokens: 256 });
    const parsed = llm.parseJson(result.content, TestQualitySchema);

    const gradeStatus = { A: 'pass', B: 'pass', C: 'warn', D: 'fail' } as const;
    const status = gradeStatus[parsed.grade];

    let detail = `**등급: ${parsed.grade}** — ${parsed.reason}`;
    if (parsed.suggestions.length > 0) {
      detail += '\n\n개선 제안:\n' + parsed.suggestions.map((s) => `- ${s}`).join('\n');
    }

    return {
      id: 'test-quality',
      label: '테스트 코드 평가',
      status,
      emoji: statusEmoji(status),
      detail,
      tokenUsage: result.usage,
    };
  } catch {
    return {
      id: 'test-quality',
      label: '테스트 코드 평가',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: '테스트 품질 LLM 평가 실패 — 수동 확인 필요',
      tokenUsage: emptyUsage(),
    };
  }
}
