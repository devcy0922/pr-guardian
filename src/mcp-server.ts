#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { RepositoryStore } from './repository-store.js';
import { GitHubClient } from './github.js';
import { review } from './reviewer.js';

// MCP 서버 초기화
const server = new McpServer({
  name: 'pr-guardian',
  version: '0.2.0',
});

/**
 * Tool 1: 등록된 레포지토리 목록 조회
 */
server.tool(
  'list_repositories',
  '등록된 관리 대상 레포지토리 목록 및 설정(소유자, 기본 브랜치, 이슈 트래커 타입 등)을 조회합니다.',
  {},
  async () => {
    try {
      const repos = await RepositoryStore.list();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(repos, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `레포지토리 목록 조회 실패: ${String(err)}`,
          },
        ],
      };
    }
  },
);

/**
 * Tool 2: 신규 레포지토리 등록
 */
server.tool(
  'add_repository',
  '새로운 프로젝트/레포지토리를 관리 대상에 등록합니다 (로컬 격리 저장).',
  {
    owner: z.string().describe('GitHub 소유자/조직명 (예: "devcy0922" 또는 "flevo")'),
    repo: z.string().describe('레포지토리 이름 (예: "flevo" 또는 "pr-guardian")'),
    issueTracker: z
      .enum(['github', 'jira'])
      .default('github')
      .describe('연동할 이슈 트래커 타입 (github 또는 jira)'),
    defaultBranch: z.string().optional().describe('기본 브랜치 이름 (기본값: main)'),
    jiraProjectKey: z.string().optional().describe('Jira 프로젝트 키 (Jira 연동 시 필요)'),
    description: z.string().optional().describe('레포지토리 설명 또는 메모'),
  },
  async (args) => {
    try {
      const config = await RepositoryStore.add({
        owner: args.owner,
        repo: args.repo,
        issueTracker: args.issueTracker,
        defaultBranch: args.defaultBranch ?? 'main',
        jiraProjectKey: args.jiraProjectKey,
        description: args.description,
      });
      return {
        content: [
          {
            type: 'text',
            text: `[성공] 레포지토리 [${config.owner}/${config.repo}] 등록 완료:\n${JSON.stringify(config, null, 2)}`,
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `레포지토리 등록 실패: ${String(err)}`,
          },
        ],
      };
    }
  },
);

/**
 * Tool 3: 레포지토리 등록 해제
 */
server.tool(
  'remove_repository',
  '관리 대상에서 특정 레포지토리를 제거합니다.',
  {
    owner: z.string().describe('GitHub 소유자/조직명'),
    repo: z.string().describe('레포지토리 이름'),
  },
  async (args) => {
    try {
      const removed = await RepositoryStore.remove(args.owner, args.repo);
      if (removed) {
        return {
          content: [
            {
              type: 'text',
              text: `[성공] 레포지토리 [${args.owner}/${args.repo}] 등록 해제 완료.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ 등록된 레포지토리를 찾을 수 없습니다: ${args.owner}/${args.repo}`,
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `레포지토리 등록 해제 실패: ${String(err)}`,
          },
        ],
      };
    }
  },
);

/**
 * Tool 4: PR 목록 조회
 */
server.tool(
  'list_pull_requests',
  '특정 레포지토리의 Pull Request 목록(PR 번호, 제목, 브랜치 등)을 조회합니다.',
  {
    owner: z.string().describe('GitHub 소유자/조직명'),
    repo: z.string().describe('레포지토리 이름'),
    state: z
      .enum(['open', 'closed', 'all'])
      .default('open')
      .describe('PR 상태 필터 (open, closed, all)'),
  },
  async (args) => {
    try {
      const github = new GitHubClient();
      const prs = await github.listPullRequests(args.owner, args.repo, args.state);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(prs, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `PR 목록 조회 실패: ${String(err)}`,
          },
        ],
      };
    }
  },
);

/**
 * Tool 5: PR 가드레일 정밀 리뷰 실행 (Copilot 수준 코드 제안 포함)
 */
server.tool(
  'run_review',
  '지정된 레포지토리의 PR을 심층 분석(연관 이슈 정합성, 보안, 테스트 품질, 컨벤션, 구체적 코드 개선안)하고 리포트를 생성합니다.',
  {
    owner: z.string().describe('GitHub 소유자/조직명'),
    repo: z.string().describe('레포지토리 이름'),
    prNumber: z.number().describe('리뷰 대상 PR 번호'),
    publishComment: z
      .boolean()
      .default(true)
      .describe('GitHub PR 코멘트에 리뷰 리포트를 직접 게시할지 여부 (기본값: true)'),
    includePmAutomation: z
      .boolean()
      .default(true)
      .describe('라벨 및 마일스톤 등 PM 자동화를 함께 실행할지 여부 (기본값: true)'),
  },
  async (args) => {
    try {
      const result = await review(args.owner, args.repo, args.prNumber, {
        publishComment: args.publishComment,
        includePmAutomation: args.includePmAutomation,
      });

      if (!result.success) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `PR 리뷰 실행 중 오류가 발생했습니다:\n\n${result.report}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: result.report,
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `PR 리뷰 실행 실패: ${String(err)}`,
          },
        ],
      };
    }
  },
);

// Stdio 연결 시작
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[PR Guardian MCP] 서버가 Stdio 모드로 실행되었습니다.');
}

main().catch((err) => {
  console.error('[PR Guardian MCP] 치명적 오류 발생:', err);
  process.exit(1);
});
