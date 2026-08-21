import { z } from 'zod';
import type { CheckContext, CheckResult } from './index.js';
import type { LLMClient } from '../llm.js';
import { statusEmoji } from './index.js';

const SuggestionItemSchema = z.object({
  file: z.string(),
  lineOrSymbol: z.string().describe('대상 함수, 클래스 또는 라인 위치'),
  type: z.enum(['bug_risk', 'performance', 'security', 'refactor', 'type_safety', 'convention']),
  explanation: z.string().describe('개선 이유 및 잠재적 사이드 이펙트 설명'),
  originalSnippet: z.string().describe('기존 코드 조각'),
  suggestedSnippet: z.string().describe('개선된 추천 코드 조각 (Actionable Diff)'),
});

const SuggestionsLLMSchema = z.object({
  hasSuggestions: z.boolean(),
  overallFeedback: z.string().describe('코드 변경점에 대한 전반적인 아키텍처/품질 평가 코멘트'),
  suggestions: z.array(SuggestionItemSchema).describe('구체적인 코드 개선 제안 목록 (최대 3개)'),
});

/** 대용량/자동생성 파일 필터링 헬퍼 */
function isNoiseFile(filename: string): boolean {
  return (
    filename.includes('pnpm-lock.yaml') ||
    filename.includes('package-lock.json') ||
    filename.endsWith('.json') ||
    filename.includes('.generated.') ||
    filename.endsWith('.md')
  );
}

/**
 * Layer 2 — Actionable Code Suggestions (GitHub Copilot 하위호환 수준의 코드 피드백)
 * PR diff 및 컨텍스트를 분석하여 즉시 적용 가능한 구체적 Diff 제안 생성
 */
export async function checkActionableSuggestions(
  ctx: CheckContext,
  llm: LLMClient,
): Promise<CheckResult> {
  // 소스 코드 파일들의 패치 우선 추출 (대용량 생성 파일/락 파일 제외)
  const meaningfulFiles = ctx.files.filter((f) => !isNoiseFile(f.filename));
  const fileNames = ctx.files
    .map((f) => `${f.filename} (+${f.additions}/-${f.deletions})`)
    .slice(0, 30)
    .join('\n');

  let codeDiff = '';
  for (const f of meaningfulFiles) {
    if (f.patch) {
      codeDiff += `--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch}\n\n`;
    }
  }

  // 패치가 없거나 너무 작으면 원본 diff 슬라이스 사용
  if (codeDiff.length < 100) {
    codeDiff = ctx.diff.slice(0, 5000);
  } else {
    codeDiff = codeDiff.slice(0, 6000);
  }

  const issueContext = ctx.issue
    ? `연관 이슈: #${ctx.issue.keyOrNumber} ${ctx.issue.title}`
    : '연관 이슈 정보 없음';

  const systemPrompt =
    `당신은 빅테크 수준의 시니어 코드 리뷰어입니다.\n` +
    `PR의 핵심 소스코드 diff를 분석하여 즉시 적용 가능한 2~3개의 구체적인 코드 개선 제안을 작성하세요.\n\n` +
    `생각 과정을 절대 출력하지 말고 즉시 아래 JSON 형식으로만 응답하세요:\n` +
    `{\n` +
    `  "hasSuggestions": true,\n` +
    `  "overallFeedback": "코드 아키텍처 및 품질에 대한 1~2줄 총평",\n` +
    `  "suggestions": [\n` +
    `    {\n` +
    `      "file": "파일명 (예: apps/api/src/routes/swaps.ts)",\n` +
    `      "lineOrSymbol": "함수 또는 라인 (예: POST /v1/swap-requests)",\n` +
    `      "type": "bug_risk",\n` +
    `      "explanation": "개선 이유 및 사이드 이펙트 설명 (한국어)",\n` +
    `      "originalSnippet": "기존 코드 2~4줄",\n` +
    `      "suggestedSnippet": "개선 추천 코드 2~4줄"\n` +
    `    }\n` +
    `  ]\n` +
    `}\n\n` +
    `규칙: type은 'bug_risk' | 'performance' | 'security' | 'refactor' | 'type_safety' | 'convention' 중 하나입니다. originalSnippet과 suggestedSnippet은 백틱 없이 순수 코드만 넣으세요.`;

  const userPrompt =
    `PR 제목: ${ctx.pr.title}\n` +
    `PR 본문: ${ctx.pr.body.slice(0, 500)}\n` +
    `${issueContext}\n\n` +
    `[핵심 소스코드 Diff]\n\`\`\`diff\n${codeDiff}\n\`\`\``;

  try {
    const result = await llm.chat({
      systemPrompt,
      userPrompt,
      maxTokens: 4096,
      jsonMode: true,
      reasoningEffort: 'none',
    });

    const parsed = llm.parseJson(result.content, SuggestionsLLMSchema);

    let detail = `**전반적 품질 코멘트**: ${parsed.overallFeedback}\n\n`;

    if (!parsed.hasSuggestions || parsed.suggestions.length === 0) {
      detail += `> 특이한 코드 결함이나 긴급 수정이 필요한 부분이 발견되지 않았습니다. 전반적인 도메인 모델링 및 구현 완성도가 우수합니다.`;
      return {
        id: 'actionable-suggestions',
        label: '구체적 코드 개선 제안 (Actionable Code Suggestions)',
        status: 'pass',
        emoji: statusEmoji('pass'),
        detail,
        tokenUsage: result.usage,
      };
    }

    detail += `### 추천 코드 개선안 (${parsed.suggestions.length}건)\n\n`;
    for (let i = 0; i < parsed.suggestions.length; i++) {
      const item = parsed.suggestions[i];
      detail += `#### ${i + 1}. \`${item.file}\` (${item.lineOrSymbol}) [${item.type.toUpperCase()}]\n`;
      detail += `- **개선 이유**: ${item.explanation}\n\n`;
      detail += `\`\`\`suggestion\n// 기존 코드:\n// ${item.originalSnippet.replace(/\n/g, '\n// ')}\n\n// 제안 코드:\n${item.suggestedSnippet}\n\`\`\`\n\n`;
    }

    return {
      id: 'actionable-suggestions',
      label: '구체적 코드 개선 제안 (Actionable Code Suggestions)',
      status: 'info',
      emoji: statusEmoji('info'),
      detail: detail.trim(),
      tokenUsage: result.usage,
    };
  } catch (err) {
    return {
      id: 'actionable-suggestions',
      label: '구체적 코드 개선 제안 (Actionable Code Suggestions)',
      status: 'skip',
      emoji: statusEmoji('skip'),
      detail: `코드 개선안 분석 중 오류가 발생하여 생략되었습니다 (${String(err)}).`,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}
