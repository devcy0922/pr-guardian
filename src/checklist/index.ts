import type { PullRequestData, PullRequestFile } from '../github.js';
import type { LLMClient, TokenUsage } from '../llm.js';
import { emptyUsage, mergeUsage } from '../llm.js';

import { checkSummary } from './summary.js';
import { checkConvention } from './convention.js';
import { checkSecurity } from './security.js';
import { checkTestExists } from './test-exists.js';
import { checkTestQuality } from './test-quality.js';
import { checkFileClassify } from './file-classify.js';
import { checkPlanMatch } from './plan-match.js';
import { checkBusinessIntent } from './business-intent.js';

/** 체크 상태 */
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip' | 'info';

/** 개별 체크 결과 */
export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  emoji: string;
  detail: string;
  tokenUsage: TokenUsage;
}

/** 가드레일 파일 세트 */
export interface GuardrailSet {
  conventions: Record<string, string>;
  skills: Record<string, string>;
}

export interface JiraIssueData {
  summary: string;
  description: string;
}

/** 체크리스트 실행 컨텍스트 */
export interface CheckContext {
  pr: PullRequestData;
  files: PullRequestFile[];
  diff: string;
  guardrails: GuardrailSet;
  jira?: JiraIssueData | null;
}

/** 전체 체크 결과 */
export interface CheckRunResult {
  results: CheckResult[];
  totalUsage: TokenUsage;
  llmCalls: number;
}

/** 상태별 텍스트 배지 (이모지 전면 제거) */
export function statusEmoji(status: CheckStatus): string {
  const map: Record<CheckStatus, string> = {
    pass: 'PASS', warn: 'WARN', fail: 'FAIL', skip: 'SKIP', info: 'INFO',
  };
  return `[${map[status]}]`;
}

/**
 * 모든 체크리스트 병렬 실행
 * Layer 0 (Deterministic) + Layer 1 (Hybrid/LLM) + Layer 2 (LLM) 동시 실행
 */
export async function runAllChecks(ctx: CheckContext, llm: LLMClient): Promise<CheckRunResult> {
  const results = await Promise.all([
    // Layer 0 — Deterministic (LLM 0회)
    checkTestExists(ctx),
    checkFileClassify(ctx),
    // Layer 1 — Hybrid (정적 검증 후 필요시 조건부 LLM 호출)
    checkConvention(ctx),
    checkSecurity(ctx, llm),
    // Layer 2 — LLM 필수 (병렬 동시 실행)
    checkSummary(ctx, llm),
    checkTestQuality(ctx, llm),
    checkPlanMatch(ctx, llm),
    checkBusinessIntent(ctx, llm),
  ]);

  const usages = results.map((r) => r.tokenUsage);
  const totalUsage = mergeUsage(...usages);
  const llmCalls = usages.filter((u) => u.totalTokens > 0).length;

  return { results, totalUsage, llmCalls };
}
