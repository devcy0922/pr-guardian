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
 * Layer 2 — Jira ↔ PR ↔ 작업 일치성 검사 (LLM)
 * Jira 기획 의도와 PR 개발 계획, 그리고 실제 코드 변경 사항이 일치하는지 삼중 검증
 */
export async function checkPlanMatch(ctx: CheckContext, llm: LLMClient): Promise<CheckResult> {
  const jiraSummary = ctx.jira ? ctx.jira.summary : 'Jira 연동 없음';
  const jiraDesc = ctx.jira ? ctx.jira.description : 'Jira 연동 없음';

  // PR body가 50자 미만이고 Jira 연동도 없으면 LLM 호출 없이 warn
  if (ctx.pr.body.length < 50 && !ctx.jira) {
    return {
      id: 'plan-match',
      label: 'Jira ↔ PR ↔ 작업 일치',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: `PR 본문이 ${ctx.pr.body.length}자로 불충분하고 Jira 연동 정보가 없어 일치성 검증 불가`,
      tokenUsage: emptyUsage(),
    };
  }

  // 파일 변경 요약
  const fileChanges = ctx.files
    .map((f) => `${f.filename} (${f.status}, +${f.additions} -${f.deletions})`)
    .join('\n');

  const systemPrompt = 
    `Jira 기획 내용, GitHub PR 개발 계획, 그리고 실제 변경 파일 목록을 삼각 비교하여 상호 정합성을 검증하세요. ` +
    `계획된 기획 및 개발 내용 중 실제 소스코드 변경에서 누락된 사항(gaps)이나, 계획에 없었으나 임의로 수정/추가된 사항(extras)을 찾아 JSON으로 반환하세요.\n\n` +
    `JSON 출력 규격 (이모지는 절대 사용하지 마세요. Do not use any emojis in your response):\n` +
    `{\n` +
    `  "match": true,\n` +
    `  "gaps": ["기획/계획에 있지만 실제 작업 내용 및 파일 변경에서 누락된 핵심 항목들"],\n` +
    `  "extras": ["기획/계획에는 없지만 실제 변경 파일 및 코드에 임의로 추가된 핵심 항목들"]\n` +
    `}\n` +
    `생각 과정(thinking/reasoning)은 생략하고 즉시 JSON만 출력하세요. Skip thinking and output JSON directly.`;

  const userPrompt = 
    `## 1. Jira 기획 이슈\n` +
    `- 제목: ${jiraSummary}\n` +
    `- 설명: ${jiraDesc.slice(0, 1000)}\n\n` +
    `## 2. GitHub PR 개발 계획 (PR 본문)\n` +
    `${ctx.pr.body.slice(0, 1000)}\n\n` +
    `## 3. 실제 변경 파일 목록\n` +
    `${fileChanges}`;

  try {
    const result = await llm.chat({
      systemPrompt,
      userPrompt,
      maxTokens: 3072,
      jsonMode: true,
      reasoningEffort: 'medium'
    });
    const parsed = llm.parseJson(result.content, PlanMatchSchema);

    if (parsed.match && parsed.gaps.length === 0 && parsed.extras.length === 0) {
      return {
        id: 'plan-match',
        label: 'Jira ↔ PR ↔ 작업 일치',
        status: 'pass',
        emoji: statusEmoji('pass'),
        detail: 'Jira 기획 이슈와 PR 개발 계획, 그리고 실제 코드 작업이 완벽하게 일치합니다.',
        tokenUsage: result.usage,
      };
    }

    let detail = '';
    if (parsed.gaps.length > 0) {
      detail += '**누락 항목 (Gaps):**\n' + parsed.gaps.map((g) => `- ${g}`).join('\n') + '\n\n';
    }
    if (parsed.extras.length > 0) {
      detail += '**범위 초과 (Extras):**\n' + parsed.extras.map((e) => `- ${e}`).join('\n');
    }

    return {
      id: 'plan-match',
      label: 'Jira ↔ PR ↔ 작업 일치',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: detail.trim(),
      tokenUsage: result.usage,
    };
  } catch (err) {
    return {
      id: 'plan-match',
      label: 'Jira ↔ PR ↔ 작업 일치',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: `LLM 삼중 일치성 검증 실패: ${String(err)}`,
      tokenUsage: emptyUsage(),
    };
  }
}
