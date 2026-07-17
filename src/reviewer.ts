import { GitHubClient } from './github.js';
import { LLMClient } from './llm.js';
import { JiraClient } from './jira.js';
import { loadGuardrails } from './guardrails.js';
import { runAllChecks } from './checklist/index.js';
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

/**
 * 8대 체크리스트 병렬 파이프라인 PR 자동 리뷰 엔진
 */
export async function review(owner: string, repo: string, prNumber: number): Promise<void> {
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

  // Jira 이슈 연동 조회
  let jiraData = null;
  const jiraKey = extractJiraKey(pr.title, pr.branch);
  if (jiraKey) {
    console.log(`[Review] 감지된 Jira Key: ${jiraKey}. Jira 이슈 정보 조회 중...`);
    try {
      jiraData = await jira.getIssue(jiraKey);
    } catch (err) {
      console.error(`[Review] Jira 이슈 조회 실패 (${jiraKey}):`, err);
    }
  } else {
    console.log('[Review] PR 제목/브랜치명에서 Jira Key를 감지하지 못했습니다.');
  }

  // 2. 체크리스트 실행 컨텍스트 구성
  const context = {
    pr,
    files,
    diff,
    guardrails,
    jira: jiraData ? { summary: jiraData.summary, description: jiraData.description, fixVersions: jiraData.fixVersions } : null,
  };

  try {
    console.log('[Review] 8대 체크리스트 병렬 실행 중...');
    const checkResults = await runAllChecks(context, llm);
    const elapsedMs = Date.now() - startMs;

    console.log('[Review] 체크리스트 완료. 리포트 조립 중...');
    const finalReport = buildReport(checkResults, elapsedMs);

    console.log('[Review] GitHub PR 코멘트 작성 중...');
    await github.createComment(owner, repo, prNumber, finalReport);
    console.log('[Review] 완료 — GitHub PR 코멘트 작성 성공');

    // 3. PM 자동화 적용 (라벨, 마일스톤, 프로젝트 연동)
    try {
      console.log('[Review] PM 자동화 실행 중...');
      const pmAutomation = new PMAutomationService(github);
      await pmAutomation.run(owner, repo, prNumber, {
        pr,
        files,
        jira: jiraData,
      });
    } catch (pmErr) {
      console.error('[Review] PM 자동화 실행 오류 (리뷰 결과 반영은 완료됨):', pmErr);
    }
  } catch (err) {
    console.error('[Review] 리뷰 파이프라인 실행 실패:', err);
    try {
      await github.createComment(
        owner,
        repo,
        prNumber,
        `## 🛡️ PR Guardian — 오류 발생\n\n리뷰 실행 도중 시스템 오류가 발생했습니다.\n\n\`\`\`\n${String(err)}\n\`\`\`\n\n> 🤖 PR Guardian v0.1.0 (Parallel Engine)`,
      );
    } catch {
      console.error('[Review] 에러 피드백 코멘트 작성도 실패');
    }
  }
}
