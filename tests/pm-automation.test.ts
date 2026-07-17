import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PMAutomationService, type PMAutomationContext } from '../src/pm-automation.js';
import { GitHubClient } from '../src/github.js';

// GitHubClient 모킹
vi.mock('../src/github.js', () => {
  return {
    GitHubClient: vi.fn().mockImplementation(() => {
      return {
        addLabels: vi.fn(),
        listMilestones: vi.fn(),
        createMilestone: vi.fn(),
        updatePullRequestMilestone: vi.fn(),
        getProjectV2Id: vi.fn(),
        addProjectV2Item: vi.fn(),
      };
    })
  };
});

describe('PMAutomationService', () => {
  let githubMock: any;
  let service: PMAutomationService;

  beforeEach(() => {
    vi.clearAllMocks();
    githubMock = new GitHubClient();
    service = new PMAutomationService(githubMock);
    process.env.AUTO_PM_ENABLED = 'true';
    process.env.AUTO_PM_PROJECT_NUMBER = '1';
    process.env.AUTO_PM_CREATE_MILESTONE = 'true';
  });

  describe('processLabels (라벨 자동화)', () => {
    it('PR 제목 prefix에 맞는 라벨을 부여해야 함', async () => {
      const context: PMAutomationContext = {
        pr: {
          nodeId: 'node_pr_1',
          title: 'feat: add new feature',
          body: 'description',
          branch: 'main',
          author: 'user1',
        },
        files: [],
        jira: null,
      };

      await service.run('owner', 'repo', 1, context);

      expect(githubMock.addLabels).toHaveBeenCalledWith('owner', 'repo', 1, expect.arrayContaining(['enhancement']));
    });

    it('PR 브랜치명 prefix 및 파일 확장에 따른 라벨을 모두 부여해야 함', async () => {
      const context: PMAutomationContext = {
        pr: {
          nodeId: 'node_pr_2',
          title: 'some pr',
          body: 'description',
          branch: 'bug/fix-something',
          author: 'user1',
        },
        files: [
          { filename: 'tests/unit/index.test.ts', status: 'modified', additions: 10, deletions: 1, patch: '' },
          { filename: 'package.json', status: 'modified', additions: 1, deletions: 1, patch: '' }
        ],
        jira: null,
      };

      await service.run('owner', 'repo', 2, context);

      expect(githubMock.addLabels).toHaveBeenCalledWith(
        'owner', 'repo', 2,
        expect.arrayContaining(['bug', 'test', 'chore'])
      );
    });
  });

  describe('processMilestone (마일스톤 자동화)', () => {
    it('Jira fixVersions 버전명과 매칭되는 마일스톤이 존재할 경우 업데이트해야 함', async () => {
      const context: PMAutomationContext = {
        pr: {
          nodeId: 'node_pr_3',
          title: 'JIRA-123 pr title',
          body: 'description',
          branch: 'feature/JIRA-123',
          author: 'user1',
        },
        files: [],
        jira: {
          summary: 'Jira issue',
          description: 'desc',
          fixVersions: ['v1.3.0']
        },
      };

      githubMock.listMilestones.mockResolvedValue([
        { number: 42, title: 'v1.3.0', state: 'open' },
        { number: 43, title: 'v1.4.0', state: 'open' }
      ]);

      await service.run('owner', 'repo', 3, context);

      expect(githubMock.updatePullRequestMilestone).toHaveBeenCalledWith('owner', 'repo', 3, 42);
    });

    it('Jira 정보는 없지만 브랜치명 버전과 매치되는 마일스톤이 있을 경우 업데이트해야 함', async () => {
      const context: PMAutomationContext = {
        pr: {
          nodeId: 'node_pr_4',
          title: 'some release',
          body: 'description',
          branch: 'release/v2.1.0',
          author: 'user1',
        },
        files: [],
        jira: null,
      };

      githubMock.listMilestones.mockResolvedValue([
        { number: 10, title: '2.1.0', state: 'open' }
      ]);

      await service.run('owner', 'repo', 4, context);

      expect(githubMock.updatePullRequestMilestone).toHaveBeenCalledWith('owner', 'repo', 4, 10);
    });

    it('마일스톤이 존재하지 않을 때 AUTO_PM_CREATE_MILESTONE이 true이면 마일스톤을 새로 생성해서 지정해야 함', async () => {
      const context: PMAutomationContext = {
        pr: {
          nodeId: 'node_pr_5',
          title: 'some release',
          body: 'description',
          branch: 'release/v3.0.0',
          author: 'user1',
        },
        files: [],
        jira: null,
      };

      githubMock.listMilestones.mockResolvedValue([]);
      githubMock.createMilestone.mockResolvedValue({ number: 99, title: 'v3.0.0' });

      await service.run('owner', 'repo', 5, context);

      expect(githubMock.createMilestone).toHaveBeenCalledWith('owner', 'repo', 'v3.0.0');
      expect(githubMock.updatePullRequestMilestone).toHaveBeenCalledWith('owner', 'repo', 5, 99);
    });
  });

  describe('processProject (프로젝트 연동 자동화)', () => {
    it('프로젝트 번호가 설정되어 있을 때 ProjectV2에 PR 카드를 등록해야 함', async () => {
      const context: PMAutomationContext = {
        pr: {
          nodeId: 'node_pr_6',
          title: 'some pr',
          body: 'description',
          branch: 'main',
          author: 'user1',
        },
        files: [],
        jira: null,
      };

      githubMock.getProjectV2Id.mockResolvedValue('project_v2_graphql_id');
      githubMock.addProjectV2Item.mockResolvedValue('item_graphql_id');

      await service.run('owner', 'repo', 6, context);

      expect(githubMock.getProjectV2Id).toHaveBeenCalledWith('owner', 1);
      expect(githubMock.addProjectV2Item).toHaveBeenCalledWith('project_v2_graphql_id', 'node_pr_6');
    });
  });
});
