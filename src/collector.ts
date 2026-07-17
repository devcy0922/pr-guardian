import { GitHubClient } from './github.js';
import { JiraClient } from './jira.js';
import { loadGuardrails } from './guardrails.js';
import type { CheckContext } from './checklist/index.js';

/**
 * Jira 키 추출 헬퍼 (PR 제목 또는 브랜치명에서 감지)
 * 퍼블릭 레포 보안: 추출 패턴만 사용, 외부 시스템 정보 노출 없음
 */
function extractJiraKey(title: string, branch: string): string | null {
  const pattern = /([A-Za-z]+-\d+)/;
  const titleMatch = title.match(pattern);
  if (titleMatch) return titleMatch[1].toUpperCase();
  const branchMatch = branch.match(pattern);
  if (branchMatch) return branchMatch[1].toUpperCase();
  return null;
}

/**
 * GitHub + Jira + Guardrails 데이터 수집 레이어
 *
 * 역할: 외부 API 호출을 집중 관리하고, 분석에 필요한 CheckContext를 반환한다.
 * 외부 API 실패(Jira 등)는 graceful degradation으로 처리한다.
 */
export async function collectContext(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<CheckContext> {
  const github = new GitHubClient();
  const jira = new JiraClient();

  console.log(`[Collector] 데이터 수집 시작 — ${owner}/${repo}#${prNumber}`);

  // GitHub PR 정보, 변경 파일, Diff, 가드레일 병렬 수집
  const [pr, files, diff, guardrails] = await Promise.all([
    github.getPullRequest(owner, repo, prNumber),
    github.getPullRequestFiles(owner, repo, prNumber),
    github.getPullRequestDiff(owner, repo, prNumber),
    loadGuardrails(),
  ]);

  // Jira 이슈 연동 (실패 시 null로 graceful degradation)
  let jiraData = null;
  const jiraKey = extractJiraKey(pr.title, pr.branch);

  if (jiraKey) {
    console.log(`[Collector] Jira Key 감지: ${jiraKey}`);
    try {
      jiraData = await jira.getIssue(jiraKey);
    } catch (err) {
      console.error(`[Collector] Jira 조회 실패 (${jiraKey}) — 분석은 계속 진행:`, err);
    }
  } else {
    console.log('[Collector] Jira Key 미감지 — Jira 연동 스킵');
  }

  const context: CheckContext = {
    pr,
    files,
    diff,
    guardrails,
    jira: jiraData
      ? {
          summary: jiraData.summary,
          description: jiraData.description,
        }
      : null,
  };

  console.log(`[Collector] 수집 완료 — 파일 ${files.length}개, Jira: ${jiraData ? 'OK' : 'N/A'}`);

  return context;
}
