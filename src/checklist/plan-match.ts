import { z } from 'zod';
import type { CheckContext, CheckResult } from './index.js';
import type { LLMClient } from '../llm.js';
import { emptyUsage } from '../llm.js';
import { statusEmoji } from './index.js';

const PlanMatchSchema = z.object({
  match: z.boolean(),
  gaps: z.array(z.string()),
  extras: z.array(z.string()),
});

/**
 * Layer 2 — 플랜 ↔ 작업 일치성 검사 (LLM)
 * PR 본문이 너무 짧으면 LLM 스킵.
 */
export async function checkPlanMatch(ctx: CheckContext, llm: LLMClient): Promise<CheckResult> {
  // PR body가 100자 미만이면 LLM 호출 없이 warn
  if (ctx.pr.body.length < 100) {
    return {
      id: 'plan-match',
      label: '플랜 ↔ 작업 일치',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: `PR 본문이 ${ctx.pr.body.length}자로 불충분 — 플랜 일치 검증 불가`,
      tokenUsage: emptyUsage(),
    };
  }

  // 파일 변경 요약
  const fileChanges = ctx.files
    .map((f) => `${f.filename} (${f.status}, +${f.additions} -${f.deletions})`)
    .join('\n');

  const systemPrompt = 'PR 본문 계획과 실제 변경 일치 판단. JSON만 출력. {"match":bool,"gaps":["누락항목"],"extras":["범위초과항목"]}';
  const userPrompt = `## PR 본문 (계획)\n${ctx.pr.body.slice(0, 1000)}\n\n## 실제 변경 파일\n${fileChanges}`;

  try {
    const result = await llm.chat({ systemPrompt, userPrompt, maxTokens: 256 });
    const parsed = llm.parseJson(result.content, PlanMatchSchema);

    if (parsed.match && parsed.gaps.length === 0 && parsed.extras.length === 0) {
      return {
        id: 'plan-match',
        label: '플랜 ↔ 작업 일치',
        status: 'pass',
        emoji: statusEmoji('pass'),
        detail: 'PR 본문 계획과 실제 변경이 일치합니다.',
        tokenUsage: result.usage,
      };
    }

    let detail = '';
    if (parsed.gaps.length > 0) {
      detail += '**누락 항목:**\n' + parsed.gaps.map((g) => `- ${g}`).join('\n') + '\n\n';
    }
    if (parsed.extras.length > 0) {
      detail += '**범위 초과:**\n' + parsed.extras.map((e) => `- ${e}`).join('\n');
    }

    return {
      id: 'plan-match',
      label: '플랜 ↔ 작업 일치',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: detail.trim(),
      tokenUsage: result.usage,
    };
  } catch {
    return {
      id: 'plan-match',
      label: '플랜 ↔ 작업 일치',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: 'LLM 검증 실패 — 수동 확인 필요',
      tokenUsage: emptyUsage(),
    };
  }
}
