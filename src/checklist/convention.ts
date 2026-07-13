import { z } from 'zod';
import type { CheckContext, CheckResult } from './index.js';
import type { LLMClient } from '../llm.js';
import { emptyUsage } from '../llm.js';
import { statusEmoji } from './index.js';

const BRANCH_PATTERN = /^(feature|hotfix|bugfix|release)\//;
const TITLE_PATTERN = /^(feat|fix|refactor|docs|test|chore|hotfix|build|ci|perf|style)(\(.+\))?:\s/;

const ConventionLLMSchema = z.object({
  compliant: z.boolean(),
  issues: z.array(z.string()),
});

/**
 * Layer 1 — 컨벤션 준수 검사 (Hybrid)
 * 1단계: 정규식으로 브랜치명 + PR 제목 체크
 * 2단계: 위반 없으면 → LLM으로 코드 스타일 검증 (가드레일 기반)
 */
export async function checkConvention(ctx: CheckContext, llm: LLMClient): Promise<CheckResult> {
  const regexIssues: string[] = [];

  // 브랜치명 체크
  if (!BRANCH_PATTERN.test(ctx.pr.branch)) {
    regexIssues.push(`브랜치명 \`${ctx.pr.branch}\`이 규칙 불일치 (feature/|hotfix/|bugfix/|release/ 필요)`);
  }

  // PR 제목 체크
  if (!TITLE_PATTERN.test(ctx.pr.title)) {
    regexIssues.push(`PR 제목이 conventional commit 형식 불일치: \`${ctx.pr.title}\``);
  }

  // 정규식에서 위반 발견 시 → LLM 스킵, 즉시 반환
  if (regexIssues.length > 0) {
    return {
      id: 'convention',
      label: '컨벤션 준수',
      status: 'fail',
      emoji: statusEmoji('fail'),
      detail: regexIssues.map((i) => `- ${i}`).join('\n'),
      tokenUsage: emptyUsage(),
    };
  }

  // 정규식 통과 → LLM으로 코드 스타일 검증
  const conventionDocs = Object.values(ctx.guardrails.conventions).join('\n\n---\n\n');
  if (!conventionDocs.trim()) {
    return {
      id: 'convention',
      label: '컨벤션 준수',
      status: 'pass',
      emoji: statusEmoji('pass'),
      detail: '브랜치명, PR 제목 규칙 준수. (가드레일 문서 미등록으로 코드 스타일 검증 생략)',
      tokenUsage: emptyUsage(),
    };
  }

  // diff 첫 80줄만 전달 (토큰 절약)
  const diffSample = ctx.diff.split('\n').slice(0, 80).join('\n');

  const systemPrompt = '코드 컨벤션 검사관. 아래 규칙 기준으로 diff를 평가. JSON만 출력. {"compliant":bool,"issues":["..."]}';
  const userPrompt = `## 컨벤션 규칙\n${conventionDocs}\n\n## Diff (일부)\n${diffSample}`;

  try {
    const result = await llm.chat({ systemPrompt, userPrompt, maxTokens: 256 });
    const parsed = llm.parseJson(result.content, ConventionLLMSchema);

    const status = parsed.compliant ? 'pass' : 'warn';
    const detail = parsed.compliant
      ? '브랜치명, PR 제목, 코드 스타일 모두 준수'
      : parsed.issues.map((i) => `- ${i}`).join('\n');

    return {
      id: 'convention',
      label: '컨벤션 준수',
      status,
      emoji: statusEmoji(status),
      detail,
      tokenUsage: result.usage,
    };
  } catch (err) {
    return {
      id: 'convention',
      label: '컨벤션 준수',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: `브랜치명/제목 규칙 준수. 코드 스타일 LLM 검증 실패: ${String(err)}`,
      tokenUsage: emptyUsage(),
    };
  }
}
