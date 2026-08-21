import { Octokit } from '@octokit/rest';

/** PR 메타데이터 */
export interface PullRequestData {
  nodeId: string;
  number: number;
  title: string;
  body: string;
  branch: string;
  author: string;
  url: string;
}

/** PR 변경 파일 정보 */
export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
}

/** GitHub Issue 정보 */
export interface GitHubIssueData {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  url: string;
}

/** PR 제목, 본문, 브랜치명에서 GitHub Issue 번호 추출 */
export function parseGitHubIssueNumber(title: string, body: string, branch: string): number | null {
  // 1. 브랜치명 패턴: (issue|feat|fix|feature)/#?123-..., 123-something
  const branchMatch = branch.match(/(?:issue|feat|fix|feature)[\/-](\d+)/i) || branch.match(/^(\d+)-/);
  if (branchMatch) {
    const num = parseInt(branchMatch[1], 10);
    if (!Number.isNaN(num)) return num;
  }

  // 2. 본문 및 제목 키워드 패턴: (fixes|closes|resolves|issue|ref) #123
  const text = `${title}\n${body}`;
  const keywordMatch = text.match(/(?:fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved|issue|ref|refs)\s+#(\d+)/i);
  if (keywordMatch) {
    const num = parseInt(keywordMatch[1], 10);
    if (!Number.isNaN(num)) return num;
  }

  // 3. 일반 #123 형태 매칭 (제목 우선, 본문 차순)
  const titleHashMatch = title.match(/#(\d+)/);
  if (titleHashMatch) {
    const num = parseInt(titleHashMatch[1], 10);
    if (!Number.isNaN(num)) return num;
  }

  const bodyHashMatch = body.match(/#(\d+)/);
  if (bodyHashMatch) {
    const num = parseInt(bodyHashMatch[1], 10);
    if (!Number.isNaN(num)) return num;
  }

  return null;
}

/**
 * GitHub REST API 클라이언트
 * GITHUB_TOKEN 환경변수로 인증
 */
export class GitHubClient {
  private octokit: Octokit;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN 환경변수 필요');
    this.octokit = new Octokit({ auth: token });
  }

  /** PR 메타데이터 조회 */
  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequestData> {
    const { data } = await this.octokit.pulls.get({ owner, repo, pull_number: prNumber });
    return {
      nodeId: data.node_id,
      number: data.number,
      title: data.title,
      body: data.body ?? '',
      branch: data.head.ref,
      author: data.user?.login ?? 'unknown',
      url: data.html_url,
    };
  }

  /** PR 목록 조회 */
  async listPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open',
  ): Promise<Array<{ number: number; title: string; branch: string; author: string; url: string }>> {
    const { data } = await this.octokit.pulls.list({
      owner,
      repo,
      state,
      per_page: 30,
      sort: 'updated',
      direction: 'desc',
    });
    return data.map((p) => ({
      number: p.number,
      title: p.title,
      branch: p.head.ref,
      author: p.user?.login ?? 'unknown',
      url: p.html_url,
    }));
  }

  /** GitHub Issue 메타데이터 조회 */
  async getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssueData> {
    const { data } = await this.octokit.issues.get({ owner, repo, issue_number: issueNumber });
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? '',
      state: data.state,
      labels: data.labels.map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean),
      url: data.html_url,
    };
  }

  /** PR 변경 파일 목록 조회 */
  async getPullRequestFiles(owner: string, repo: string, prNumber: number): Promise<PullRequestFile[]> {
    const { data } = await this.octokit.pulls.listFiles({
      owner, repo, pull_number: prNumber, per_page: 100,
    });
    return data.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? '',
    }));
  }

  /** PR raw diff 조회 */
  async getPullRequestDiff(owner: string, repo: string, prNumber: number): Promise<string> {
    const { data } = await this.octokit.pulls.get({
      owner, repo, pull_number: prNumber,
      mediaType: { format: 'diff' },
    });
    return data as unknown as string;
  }

  /** PR에 코멘트 작성 (issue comment) */
  async createComment(owner: string, repo: string, prNumber: number, body: string): Promise<{ id: number }> {
    const { data } = await this.octokit.issues.createComment({
      owner, repo, issue_number: prNumber, body,
    });
    return { id: data.id };
  }

  /** PR 코멘트 목록 조회 */
  async listComments(owner: string, repo: string, prNumber: number): Promise<Array<{ id: number; body: string; createdAt: string }>> {
    const { data } = await this.octokit.issues.listComments({
      owner, repo, issue_number: prNumber, per_page: 100,
    });
    return data.map((c) => ({
      id: c.id,
      body: c.body ?? '',
      createdAt: c.created_at,
    }));
  }

  /** PR 코멘트 삭제 */
  async deleteComment(owner: string, repo: string, commentId: number): Promise<void> {
    await this.octokit.issues.deleteComment({
      owner, repo, comment_id: commentId,
    });
  }

  /** PR에 라벨 부여 */
  async addLabels(owner: string, repo: string, prNumber: number, labels: string[]): Promise<void> {
    await this.octokit.issues.addLabels({
      owner, repo, issue_number: prNumber, labels,
    });
  }

  /** 활성화된 마일스톤 목록 조회 */
  async listMilestones(owner: string, repo: string): Promise<any[]> {
    const { data } = await this.octokit.issues.listMilestones({
      owner, repo, state: 'open',
    });
    return data;
  }

  /** 마일스톤 생성 */
  async createMilestone(owner: string, repo: string, title: string): Promise<any> {
    const { data } = await this.octokit.issues.createMilestone({
      owner, repo, title,
    });
    return data;
  }

  /** PR의 마일스톤 업데이트 */
  async updatePullRequestMilestone(owner: string, repo: string, prNumber: number, milestoneNumber: number): Promise<void> {
    await this.octokit.issues.update({
      owner, repo, issue_number: prNumber, milestone: milestoneNumber,
    });
  }

  /** Organization 또는 User를 기준으로 ProjectV2 ID 조회 */
  async getProjectV2Id(owner: string, projectNumber: number): Promise<string | null> {
    try {
      const query = `
        query GetOrgProject($login: String!, $number: Int!) {
          organization(login: $login) {
            projectV2(number: $number) {
              id
            }
          }
        }
      `;
      const res = await this.octokit.graphql<any>(query, { login: owner, number: projectNumber });
      return res.organization?.projectV2?.id ?? null;
    } catch (err) {
      try {
        const query = `
          query GetUserProject($login: String!, $number: Int!) {
            user(login: $login) {
              projectV2(number: $number) {
                id
              }
            }
          }
        `;
        const res = await this.octokit.graphql<any>(query, { login: owner, number: projectNumber });
        return res.user?.projectV2?.id ?? null;
      } catch (err2) {
        console.warn(`[GitHub] ProjectV2 ID 조회 실패 (owner: ${owner}, number: ${projectNumber}):`, err2);
        return null;
      }
    }
  }

  /** ProjectV2에 PR(또는 Issue) 카드 추가 */
  async addProjectV2Item(projectId: string, contentId: string): Promise<string | null> {
    const mutation = `
      mutation AddProjectV2Item($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
          item {
            id
          }
        }
      }
    `;
    try {
      const res = await this.octokit.graphql<any>(mutation, { projectId, contentId });
      return res.addProjectV2ItemById?.item?.id ?? null;
    } catch (err) {
      console.error('[GitHub] ProjectV2 아이템 추가 실패:', err);
      return null;
    }
  }
}
