import { GitHubClient, parseGitHubIssueNumber } from './github.js';
import { LLMClient } from './llm.js';
import { JiraClient } from './jira.js';
import { loadGuardrails } from './guardrails.js';
import { runAllChecks, type CheckRunResult, type IssueData } from './checklist/index.js';
import { buildReport } from './report.js';
import { PMAutomationService } from './pm-automation.js';

// Jira 키 매핑 정규식 헬퍼
function extractJiraKey(title: string, branch: string): string | null {
  const pattern = /([A-Za-z]+-\d+)/;
  const titleMatch = title.match(pattern);
  if (titleMatch) return titleMatch[1].toUpperCase();
  const branchMatch = branch.match(pattern);
  if (branchMatch) return branchMatch[1].toUpperCase();
  return null;
}

export interface ReviewOptions {
  publishComment?: boolean;
  includePmAutomation?: boolean;
}

export interface ReviewExecutionResult {
  success: boolean;
  report: string;
  checkResults?: CheckRunResult;
  elapsedMs: number;
  error?: string;
}

/**
 * 9대 체크리스트 병렬 파이프라인 PR 자동 리뷰 엔진
 * GitHub Issue & Jira Issue 정밀 연동 및 Actionable Diff 생성
 */
export async function review(
  owner: string,
  repo: string,
  prNumber: number,
  options: ReviewOptions = {},
): Promise<ReviewExecutionResult> {
  const publishComment = options.publishComment ?? true;
  const includePmAutomation = options.includePmAutomation ?? true;

  const startMs = Date.now();
  const github = new GitHubClient();
  const llm = new LLMClient();
  const jira = new JiraClient();

  console.log(`[Review] 병렬 체크리스트 파이프라인 시작 — ${owner}/${repo}#${prNumber}`);

  // 1. 기초 리소스 수집
  console.log('[Review] PR 및 소스 코드 수집 중...');
  const [pr, files, diff, guardrails] = await Promise.all([
    github.getPullRequest(owner, repo, prNumber),
    github.getPullRequestFiles(owner, repo, prNumber),
    github.getPullRequestDiff(owner, repo, prNumber),
    loadGuardrails(),
  ]);

  // 2. 이슈 연동 조회 (GitHub Issue 우선, Jira 차순)
  let issueData: IssueData | null = null;
  let jiraRawData = null;

  // 2-1. GitHub Issue 번호 감지 및 조회
  const githubIssueNum = parseGitHubIssueNumber(pr.title, pr.body, pr.branch);
  if (githubIssueNum && githubIssueNum !== prNumber) {
    console.log(`[Review] 감지된 GitHub Issue #${githubIssueNum}. 이슈 정보 조회 중...`);
    try {
      const ghIssue = await github.getIssue(owner, repo, githubIssueNum);
      issueData = {
        type: 'github',
        keyOrNumber: String(ghIssue.number),
        title: ghIssue.title,
        description: ghIssue.body,
        labels: ghIssue.labels,
        url: ghIssue.url,
      };
      console.log(`[Review] GitHub Issue #${githubIssueNum} 조회 완료: "${ghIssue.title}"`);
    } catch (err) {
      console.warn(`[Review] GitHub Issue #${githubIssueNum} 조회 실패:`, err);
    }
  }

  // 2-2. Jira 키 감지 및 조회 (설정되어 있거나 GitHub Issue가 없는 경우 또는 Jira 키가 매칭될 때)
  const jiraKey = extractJiraKey(pr.title, pr.branch);
  if (jiraKey) {
    console.log(`[Review] 감지된 Jira Key: ${jiraKey}. Jira 이슈 정보 조회 중...`);
    try {
      jiraRawData = await jira.getIssue(jiraKey);
      if (!issueData && jiraRawData) {
        issueData = {
          type: 'jira',
          keyOrNumber: jiraKey,
          title: jiraRawData.summary,
          description: jiraRawData.description,
          url: '',
        };
      }
    } catch (err) {
      console.error(`[Review] Jira 이슈 조회 실패 (${jiraKey}):`, err);
    }
  }

  // 3. 체크리스트 실행 컨텍스트 구성
  const context = {
    pr,
    files,
    diff,
    guardrails,
    issue: issueData,
    jira: jiraRawData
      ? {
          summary: jiraRawData.summary,
          description: jiraRawData.description,
          fixVersions: jiraRawData.fixVersions,
        }
      : null,
  };

  try {
    console.log('[Review] 체크리스트 병렬 실행 중...');
    const checkResults = await runAllChecks(context, llm);
    const elapsedMs = Date.now() - startMs;

    console.log('[Review] 체크리스트 완료. 리포트 조립 중...');
    const finalReport = buildReport(checkResults, elapsedMs);

    if (publishComment) {
      console.log('[Review] 이전 PR Guardian 코멘트 검사 및 정리 중...');
      try {
        const existingComments = await github.listComments(owner, repo, prNumber);
        const guardianComments = existingComments.filter((c) =>
          c.body.includes('PR Guardian') || c.body.includes('🛡️ PR Guardian'),
        );

        // 최대 4개만 남겨두고 가장 오래된 것들 정리 (새 코멘트 추가 시 총합 최대 5개 유지)
        if (guardianComments.length >= 5) {
          const toDelete = guardianComments.slice(0, guardianComments.length - 4);
          for (const c of toDelete) {
            console.log(`[Review] 오래된 PR Guardian 코멘트(#${c.id}) 삭제 중...`);
            await github.deleteComment(owner, repo, c.id);
          }
        }
      } catch (commentErr) {
        console.warn('[Review] 기존 코멘트 정리 실패 (계속 진행):', commentErr);
      }

      console.log('[Review] GitHub PR 코멘트 작성 중...');
      await github.createComment(owner, repo, prNumber, finalReport);
      console.log('[Review] 완료 — GitHub PR 코멘트 작성 성공');
    } else {
      console.log('[Review] 코멘트 작성 스킵 (publishComment=false)');
    }

    // 4. PM 자동화 적용 (옵션)
    if (includePmAutomation) {
      try {
        console.log('[Review] PM 자동화 실행 중...');
        const pmAutomation = new PMAutomationService(github);
        await pmAutomation.run(owner, repo, prNumber, {
          pr,
          files,
          jira: jiraRawData,
        });
      } catch (pmErr) {
        console.error('[Review] PM 자동화 실행 오류 (리뷰 결과 반영은 완료됨):', pmErr);
      }
    }

    return {
      success: true,
      report: finalReport,
      checkResults,
      elapsedMs,
    };
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    const errorMsg = String(err);
    console.error('[Review] 리뷰 파이프라인 실행 실패:', err);

    const errorReport = `## [PR Guardian] 오류 발생\n\n리뷰 실행 도중 시스템 오류가 발생했습니다.\n\n\`\`\`\n${errorMsg}\n\`\`\`\n\n> PR Guardian v0.2.0 (MCP Agent Engine)`;

    if (publishComment) {
      try {
        await github.createComment(owner, repo, prNumber, errorReport);
      } catch {
        console.error('[Review] 에러 피드백 코멘트 작성도 실패');
      }
    }

    return {
      success: false,
      report: errorReport,
      elapsedMs,
      error: errorMsg,
    };
  }
}
