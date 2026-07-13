import { GitHubClient } from './github.js';
import { LLMClient } from './llm.js';
import { runAllChecks } from './checklist/index.js';
import { buildReport } from './report.js';
import { loadGuardrails } from './guardrails.js';
import { validateReport, repairReport } from './pipeline.js';

const MAX_RETRY = 1;

/**
 * PR 리뷰 파이프라인
 *
 * collect → analyze → assemble → validate → publish
 *                       ↑            ↓ fail
 *                       └── retry (max 1)
 */
export async function review(owner: string, repo: string, prNumber: number): Promise<void> {
  const startMs = Date.now();
  const github = new GitHubClient();
  const llm = new LLMClient();

  console.log(`[Review] 파이프라인 시작 — ${owner}/${repo}#${prNumber}`);

  // ── Stage 1: collect ──
  console.log('[Review] Stage: collect');
  const [pr, files, diff, guardrails] = await Promise.all([
    github.getPullRequest(owner, repo, prNumber),
    github.getPullRequestFiles(owner, repo, prNumber),
    github.getPullRequestDiff(owner, repo, prNumber),
    loadGuardrails(),
  ]);

  const ctx = { pr, files, diff, guardrails };

  // ── Stage 2: analyze ──
  console.log('[Review] Stage: analyze');
  const checkResults = await runAllChecks(ctx, llm);

  // ── Stage 3: assemble + validate (retry loop) ──
  let report = '';
  let attempts = 0;

  while (attempts <= MAX_RETRY) {
    attempts++;
    console.log(`[Review] Stage: assemble (attempt ${attempts})`);
    report = buildReport(checkResults, Date.now() - startMs);

    console.log(`[Review] Stage: validate (attempt ${attempts})`);
    const validation = validateReport(report, checkResults);

    if (validation.valid) {
      console.log('[Review] 리포트 검증 통과');
      break;
    }

    console.warn(`[Review] 검증 실패 (attempt ${attempts}): ${validation.issues.join(', ')}`);

    if (attempts <= MAX_RETRY) {
      // 복구 시도
      report = repairReport(report, validation.issues);
      console.log('[Review] 리포트 복구 적용');
    }
  }

  // ── Stage 4: publish ──
  console.log('[Review] Stage: publish');
  try {
    await github.createComment(owner, repo, prNumber, report);
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`[Review] 완료 — ${elapsed}s, LLM ${checkResults.llmCalls}회, ${checkResults.totalUsage.totalTokens} tokens`);
  } catch (err) {
    console.error('[Review] 코멘트 작성 실패:', err);
    // 실패 시 에러 코멘트라도 남기기
    try {
      await github.createComment(owner, repo, prNumber,
        `## 🛡️ PR Guardian — 오류 발생\n\n리뷰 파이프라인 실행 중 오류가 발생했습니다.\n\n\`\`\`\n${String(err)}\n\`\`\`\n\n> 🤖 PR Guardian v0.1.0`,
      );
    } catch {
      // 에러 코멘트도 실패하면 로그만
      console.error('[Review] 에러 코멘트 작성도 실패');
    }
  }
}
