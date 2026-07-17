import { z } from 'zod';
import type { CheckContext, CheckResult } from './index.js';
import type { LLMClient } from '../llm.js';
import { emptyUsage } from '../llm.js';
import { statusEmoji } from './index.js';

const BRANCH_PATTERN = /^(feature|hotfix|bugfix|release)\/[a-zA-Z0-9]+_[A-Z]+-\d+-.+$/;
const TITLE_PATTERN = /^(feat|fix|refactor|docs|test|chore|hotfix|build|ci|perf|style)(\(.+\))?:\s/;
const JIRA_PATTERN = /[A-Z]+-\d+/;

const ConventionLLMSchema = z.object({
  compliant: z.boolean(),
  issues: z.array(z.string()),
});

/**
 * Layer 1 — 컨벤션 준수 검사 (Hybrid)
 * 1단계: 정규식으로 브랜치명 + PR 제목 + Jira 키 체크
 * 2단계: 위반 없으면 → LLM으로 코드 스타일 검증 (가드레일 기반)
 */
export async function checkConvention(ctx: CheckContext): Promise<CheckResult> {
  const regexIssues: string[] = [];

  // 브랜치명 체크
  if (!BRANCH_PATTERN.test(ctx.pr.branch)) {
    regexIssues.push(`브랜치명 \`${ctx.pr.branch}\`이 규칙 불일치 (형식: <type>/<author>_<jira-key>-<description> 필요, 예: feature/john_GA-1234-add-health-check)`);
  }

  // PR 제목 체크
  if (!TITLE_PATTERN.test(ctx.pr.title)) {
    regexIssues.push(`PR 제목이 conventional commit 형식 불일치: \`${ctx.pr.title}\` (예: feat: [GA-1234] 기능 추가)`);
  }

  // Jira 이슈 ID 매핑 체크 (제목 혹은 브랜치에 필수 포함)
  if (!JIRA_PATTERN.test(ctx.pr.title) && !JIRA_PATTERN.test(ctx.pr.branch)) {
    regexIssues.push('PR 제목 또는 브랜치명 중 최소 하나에는 Jira 이슈 Key([A-Z]+-\\d+, 예: GA-1234)가 반드시 명시되어 있어야 합니다.');
  }

  // 정규식에서 위반 발견 시 → 즉시 반환
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

  return {
    id: 'convention',
    label: '컨벤션 준수',
    status: 'pass',
    emoji: statusEmoji('pass'),
    detail: '브랜치명, PR 제목 규칙 준수 완료 (코드 스타일 컨벤션은 종합 보고서에서 검증됩니다)',
    tokenUsage: emptyUsage(),
  };
}
