import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { RepositoryStore } from '../src/repository-store.js';
import { parseGitHubIssueNumber } from '../src/github.js';
import { buildReport } from '../src/report.js';
import type { CheckRunResult } from '../src/checklist/index.js';

describe('RepositoryStore & GitHub Issue Parser & Report Builder', () => {
  const DATA_DIR = path.resolve(process.cwd(), 'data');
  const STORE_PATH = path.join(DATA_DIR, 'repositories.json');

  beforeEach(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify([], null, 2), 'utf-8');
  });

  afterEach(async () => {
    try {
      await fs.rm(DATA_DIR, { recursive: true, force: true });
    } catch {}
  });

  it('레포지토리 추가, 조회, 삭제가 정상 동작해야 함', async () => {
    // 1. 추가
    const added = await RepositoryStore.add({
      owner: 'devcy0922',
      repo: 'flevo',
      issueTracker: 'github',
      defaultBranch: 'main',
      description: 'Flevo project',
    });
    expect(added.owner).toBe('devcy0922');
    expect(added.repo).toBe('flevo');

    // 2. 조회
    const list = await RepositoryStore.list();
    expect(list.length).toBe(1);
    expect(list[0].repo).toBe('flevo');

    const single = await RepositoryStore.get('devcy0922', 'flevo');
    expect(single).not.toBeNull();
    expect(single?.issueTracker).toBe('github');

    // 3. 삭제
    const removed = await RepositoryStore.remove('devcy0922', 'flevo');
    expect(removed).toBe(true);

    const listAfter = await RepositoryStore.list();
    expect(listAfter.length).toBe(0);
  });

  it('PR 제목, 본문, 브랜치명에서 GitHub Issue 번호를 정확히 추출해야 함', () => {
    expect(parseGitHubIssueNumber('feat: #101 add login', '', 'main')).toBe(101);
    expect(parseGitHubIssueNumber('fix bug', 'Fixes #42 in auth module', 'feat/login')).toBe(42);
    expect(parseGitHubIssueNumber('refactor', 'Closes #99', 'feat/login')).toBe(99);
    expect(parseGitHubIssueNumber('update UI', '', 'feat/123-dark-mode')).toBe(123);
    expect(parseGitHubIssueNumber('update UI', '', '123-dark-mode')).toBe(123);
    expect(parseGitHubIssueNumber('update UI', 'no issue mentioned', 'main')).toBeNull();
  });

  it('리포트 빌더에 Actionable Code Suggestions 및 Traceability가 포함되어야 함', () => {
    const mockCheckResults: CheckRunResult = {
      llmCalls: 2,
      totalUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      results: [
        {
          id: 'summary',
          label: '변경 사항 요약',
          status: 'pass',
          emoji: '[PASS]',
          detail: '- 로그인 API 토큰 갱신 로직 구현',
          tokenUsage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
        },
        {
          id: 'security',
          label: '보안 및 인증 검사',
          status: 'pass',
          emoji: '[PASS]',
          detail: '보안 취약점 없음',
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        },
        {
          id: 'plan-match',
          label: '이슈 ↔ PR ↔ 작업 일치성',
          status: 'pass',
          emoji: '[PASS]',
          detail: '이슈 #42의 요구사항과 완벽히 일치함',
          tokenUsage: { promptTokens: 25, completionTokens: 15, totalTokens: 40 },
        },
        {
          id: 'actionable-suggestions',
          label: '구체적 코드 개선 제안',
          status: 'info',
          emoji: '[INFO]',
          detail: '### 추천 코드 개선안\n- Null 체크 보강 권장',
          tokenUsage: { promptTokens: 25, completionTokens: 10, totalTokens: 35 },
        },
      ],
    };

    const report = buildReport(mockCheckResults, 1200);
    expect(report).toContain('PR Guardian 자동 리뷰 보고서');
    expect(report).toContain('연관 이슈 ↔ PR 정합성 (Traceability)');
    expect(report).toContain('구체적 코드 개선 제안 (Actionable Suggestions)');
    expect(report).toContain('MCP Agent Engine');
  });
});
