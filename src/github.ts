import { Octokit } from '@octokit/rest';

/** PR 메타데이터 */
export interface PullRequestData {
  title: string;
  body: string;
  branch: string;
  author: string;
}

/** PR 변경 파일 정보 */
export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
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
      title: data.title,
      body: data.body ?? '',
      branch: data.head.ref,
      author: data.user?.login ?? 'unknown',
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
  async createComment(owner: string, repo: string, prNumber: number, body: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner, repo, issue_number: prNumber, body,
    });
  }
}
