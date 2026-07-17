import { GitHubClient } from './github.js';
import { PMAutomationService } from './pm-automation.js';
import type { AnalysisResult } from './analyzer.js';
import type { CheckContext } from './checklist/index.js';

/** GitHub 코멘트 게시 결과 */
export interface PublishGitHubResult {
  success: boolean;
  error?: string;
}

/** API 응답 포맷 */
export interface ReviewApiResponse {
  success: boolean;
  report: string;
  meta: {
    elapsedMs: number;
    totalTokens: number;
    llmCalls: number;
    repaired: boolean;
    checkResults: Array<{
      id: string;
      label: string;
      status: string;
      emoji: string;
    }>;
  };
}

/**
 * GitHub PR에 리뷰 결과 코멘트 게시
 *
 * 역할: 분석 완료된 결과를 GitHub PR 코멘트로 작성한다.
 * 에러 시 fallback 에러 코멘트를 작성하여 사용자에게 상태를 알린다.
 */
export async function publishToGitHub(
  owner: string,
  repo: string,
  prNumber: number,
  result: AnalysisResult,
  ctx?: CheckContext,
): Promise<PublishGitHubResult> {
  const github = new GitHubClient();

  try {
    console.log(`[Publisher] GitHub PR #${prNumber} 코멘트 작성 중...`);
    await github.createComment(owner, repo, prNumber, result.report);
    console.log(`[Publisher] GitHub PR #${prNumber} 코멘트 작성 완료`);

    // PM 자동화 (라벨, 마일스톤, 프로젝트 연동)
    if (ctx) {
      try {
        console.log('[Publisher] PM 자동화 실행 중...');
        const pmAutomation = new PMAutomationService(github);
        await pmAutomation.run(owner, repo, prNumber, {
          pr: ctx.pr,
          files: ctx.files,
          // PMAutomationService는 fixVersions 필드를 요구하므로 빈 배열로 보완
          jira: ctx.jira ? { ...ctx.jira, fixVersions: [] } : null,
        });
      } catch (pmErr) {
        // PM 자동화 실패는 리뷰 결과에 영향 없음
        console.error('[Publisher] PM 자동화 오류 (리뷰 게시는 완료됨):', pmErr);
      }
    }

    return { success: true };
  } catch (err) {
    const errMsg = String(err);
    console.error(`[Publisher] GitHub 코멘트 작성 실패:`, err);

    // 에러 fallback 코멘트 작성 시도
    try {
      await github.createComment(
        owner,
        repo,
        prNumber,
        `## 🛡️ PR Guardian — 오류 발생\n\n리뷰 실행 도중 시스템 오류가 발생했습니다.\n\n\`\`\`\n${errMsg}\n\`\`\`\n\n> 🤖 PR Guardian`,
      );
    } catch {
      console.error('[Publisher] 에러 fallback 코멘트 작성도 실패');
    }

    return { success: false, error: errMsg };
  }
}

/**
 * 분석 결과를 API 응답 JSON 포맷으로 변환
 *
 * 역할: webhook 모드와 달리 GitHub 코멘트를 작성하지 않고,
 * 구조화된 JSON 응답으로 결과를 반환한다.
 */
export function formatApiResponse(result: AnalysisResult): ReviewApiResponse {
  const { report, checkResults, elapsedMs, repaired } = result;

  return {
    success: true,
    report,
    meta: {
      elapsedMs,
      totalTokens: checkResults.totalUsage.totalTokens,
      llmCalls: checkResults.llmCalls,
      repaired,
      checkResults: checkResults.results.map((r) => ({
        id: r.id,
        label: r.label,
        status: r.status,
        emoji: r.emoji,
      })),
    },
  };
}

/**
 * 에러 API 응답 포맷
 */
export function formatApiError(err: unknown): { success: false; error: string } {
  return {
    success: false,
    error: err instanceof Error ? err.message : String(err),
  };
}
