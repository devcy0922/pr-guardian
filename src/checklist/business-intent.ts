import { z } from 'zod';
import type { CheckContext, CheckResult } from './index.js';
import type { LLMClient } from '../llm.js';
import { statusEmoji } from './index.js';

const BusinessIntentLLMSchema = z.object({
  why: z.string().describe('작업의 배경 및 필요성'),
  what: z.string().describe('개선 효과 및 가치'),
  timing: z.string().describe('작업 시점 및 타당성 분석'),
});

/**
 * Layer 2 — 비즈니스 의도 및 맥락 평가 (LLM 필수)
 * Issue(GitHub/Jira)와 PR 메타데이터를 사용하여 작업의 필요성, 개선 효과, 타이밍 분석
 */
export async function checkBusinessIntent(ctx: CheckContext, llm: LLMClient): Promise<CheckResult> {
  const issueSummary = ctx.issue?.title ?? ctx.jira?.summary ?? '연관 이슈 없음';
  const issueDesc = ctx.issue?.description ?? ctx.jira?.description ?? '연관 이슈 없음';
  const issueType = ctx.issue?.type ? ctx.issue.type.toUpperCase() : ctx.jira ? 'JIRA' : 'NONE';
  const issueKey = ctx.issue?.keyOrNumber ?? '';

  const systemPrompt =
    `당신은 소프트웨어 아키텍트이자 비즈니스 분석가입니다. ` +
    `연관 이슈(${issueType} ${issueKey})와 GitHub PR 본문을 바탕으로 이 작업의 비즈니스적 의도를 요약하세요. ` +
    `반드시 생각 과정(thinking/reasoning)은 출력하지 말고 즉시 결과 JSON만 반환하세요. Skip thinking and output JSON directly.\n\n` +
    `출력 JSON 포맷 (반드시 모든 값은 친절한 한국어 문장으로 작성하고, 이모지는 절대 사용하지 마세요. Do not use any emojis. ` +
    `또한 반드시 키 이름(why, what, timing)은 쌍따옴표로 감싸야 하며 유효한 JSON 형식이어야 합니다):\n` +
    `{\n` +
    `  "why": "왜 이 작업을 해야 하는지 한글로 기술 (배경 및 필요성, 최대 100자)",\n` +
    `  "what": "어떤 게 개선되는지 한글로 기술 (정량적/정성적 효과, 최대 100자)",\n` +
    `  "timing": "지금 작업이 적당한 시점인지 한글로 기술 (타당성 및 타이밍 분석, 최대 100자)"\n` +
    `}`;

  const userPrompt =
    `연관 이슈 제목: ${issueSummary}\n` +
    `연관 이슈 설명: ${issueDesc.slice(0, 1000)}\n\n` +
    `GitHub PR 제목: ${ctx.pr.title}\n` +
    `GitHub PR 본문: ${ctx.pr.body.slice(0, 1000)}`;

  try {
    const result = await llm.chat({
      systemPrompt,
      userPrompt,
      maxTokens: 3072,
      jsonMode: true,
      reasoningEffort: 'low',
    });
    const parsed = llm.parseJson(result.content, BusinessIntentLLMSchema);

    const detail =
      `- **작업의 필요성 (Why)**: ${parsed.why}\n` +
      `- **개선 효과 (What)**: ${parsed.what}\n` +
      `- **릴리즈 시점 분석**: ${parsed.timing}`;

    return {
      id: 'business-intent',
      label: '비즈니스 의도 및 맥락 평가',
      status: 'info',
      emoji: statusEmoji('info'),
      detail,
      tokenUsage: result.usage,
    };
  } catch (err) {
    return {
      id: 'business-intent',
      label: '비즈니스 의도 및 맥락 평가',
      status: 'info',
      emoji: statusEmoji('info'),
      detail:
        `- **작업의 필요성 (Why)**: 이슈 및 PR 본문 파악 불가 (${ctx.pr.title})\n` +
        `- **개선 효과 (What)**: PR 본문 분석 요약 실패\n` +
        `- **릴리즈 시점 분석**: PR 본문이 불충분하여 판단 불가`,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}
