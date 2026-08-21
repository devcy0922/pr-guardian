import { z } from 'zod';
import type { CheckContext, CheckResult } from './index.js';
import type { LLMClient } from '../llm.js';
import { emptyUsage } from '../llm.js';
import { statusEmoji } from './index.js';

const PlanMatchSchema = z.object({
  match: z.boolean(),
  gaps: z.array(z.string()).describe('기획/이슈 요구사항 중 코드에 누락된 항목'),
  extras: z.array(z.string()).describe('이슈 범위를 벗어나 불필요하게 추가된 사이드 변경 항목'),
  analysisSummary: z.string().describe('전반적인 일치성 분석 요약'),
});

/**
 * Layer 2 — 이슈(GitHub/Jira) ↔ PR ↔ 실제 작업 일치성 검사 (LLM)
 * 이슈 기획 의도와 PR 개발 계획, 그리고 실제 코드 변경 사항이 일치하는지 삼중 검증
 */
export async function checkPlanMatch(ctx: CheckContext, llm: LLMClient): Promise<CheckResult> {
  const issueTitle = ctx.issue?.title ?? ctx.jira?.summary ?? '연관 이슈 없음';
  const issueDesc = ctx.issue?.description ?? ctx.jira?.description ?? '연관 이슈 없음';
  const issueType = ctx.issue?.type ? ctx.issue.type.toUpperCase() : ctx.jira ? 'JIRA' : 'NONE';
  const issueKey = ctx.issue?.keyOrNumber ?? '';

  const hasIssue = Boolean(ctx.issue || ctx.jira);

  // PR body가 50자 미만이고 이슈 연동도 없으면 LLM 호출 없이 warn
  if (ctx.pr.body.length < 50 && !hasIssue) {
    return {
      id: 'plan-match',
      label: '이슈 ↔ PR ↔ 작업 일치성 (Traceability)',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: `PR 본문이 ${ctx.pr.body.length}자로 불충분하고 연관 이슈 정보가 없어 요구사항 일치성 검증 불가`,
      tokenUsage: emptyUsage(),
    };
  }

  // 파일 변경 요약
  const fileChanges = ctx.files
    .slice(0, 40)
    .map((f) => `${f.filename} (${f.status}, +${f.additions} -${f.deletions})`)
    .join('\n');

  const systemPrompt =
    `당신은 소프트웨어 요구사항 추적성(Traceability) 분석 전문가입니다.\n` +
    `연관 이슈(${issueType} ${issueKey})와 PR 개발 계획, 실제 변경된 소스코드를 비교하여 정합성을 검증하세요.\n\n` +
    `반드시 생각 과정을 출력하지 말고 즉시 아래 JSON 형식만 반환하세요:\n` +
    `{\n` +
    `  "match": true,\n` +
    `  "gaps": ["누락된 요구사항 (없으면 빈 배열)"],\n` +
    `  "extras": ["범위 초과 변경 (없으면 빈 배열)"],\n` +
    `  "analysisSummary": "전체 정합성에 대한 명확한 한 줄 요약"\n` +
    `}\n\n` +
    `규칙: 모든 설명은 친절한 한국어로 작성하고, 이모지는 사용하지 마세요.`;

  const userPrompt =
    `## 1. 연관 이슈 정보 (${issueType} #${issueKey})\n` +
    `- 제목: ${issueTitle}\n` +
    `- 설명: ${issueDesc.slice(0, 800)}\n\n` +
    `## 2. GitHub PR 본문\n` +
    `${ctx.pr.body.slice(0, 800)}\n\n` +
    `## 3. 실제 변경 파일 목록\n` +
    `${fileChanges}`;

  try {
    const result = await llm.chat({
      systemPrompt,
      userPrompt,
      maxTokens: 4096,
      jsonMode: true,
      reasoningEffort: 'none',
    });
    const parsed = llm.parseJson(result.content, PlanMatchSchema);

    if (parsed.match && parsed.gaps.length === 0 && parsed.extras.length === 0) {
      return {
        id: 'plan-match',
        label: '이슈 ↔ PR ↔ 작업 일치성 (Traceability)',
        status: 'pass',
        emoji: statusEmoji('pass'),
        detail: `연관 이슈(${issueType} ${issueKey})의 요구사항과 PR 설명, 실제 코드 변경점이 완벽하게 일치합니다.\n- **분석 요약**: ${parsed.analysisSummary}`,
        tokenUsage: result.usage,
      };
    }

    let detail = `- **분석 요약**: ${parsed.analysisSummary}\n\n`;
    if (parsed.gaps.length > 0) {
      detail += '**누락된 요구사항 (Gaps):**\n' + parsed.gaps.map((g) => `- ${g}`).join('\n') + '\n\n';
    }
    if (parsed.extras.length > 0) {
      detail += '**범위 초과 변경 (Scope Creep / Extras):**\n' + parsed.extras.map((e) => `- ${e}`).join('\n');
    }

    return {
      id: 'plan-match',
      label: '이슈 ↔ PR ↔ 작업 일치성 (Traceability)',
      status: parsed.gaps.length > 0 ? 'warn' : 'info',
      emoji: statusEmoji(parsed.gaps.length > 0 ? 'warn' : 'info'),
      detail: detail.trim(),
      tokenUsage: result.usage,
    };
  } catch (err) {
    return {
      id: 'plan-match',
      label: '이슈 ↔ PR ↔ 작업 일치성 (Traceability)',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: `삼각 일치성 검증 실패: ${String(err)}`,
      tokenUsage: emptyUsage(),
    };
  }
}
