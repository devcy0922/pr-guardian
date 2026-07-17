import { randomBytes } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraClient } from '../src/jira.js';

describe('JiraClient fixVersions 파싱 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JIRA_BASE_URL = 'https://jira.example.com';
    process.env.JIRA_EMAIL = 'test@example.com';
    process.env.JIRA_API_TOKEN = `unit-test-${randomBytes(16).toString('hex')}`;
  });

  it('Jira API 응답의 fixVersions를 올바르게 파싱해야 함', async () => {
    const mockJiraResponse = {
      fields: {
        summary: '이슈 요약',
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: '이슈 설명 내용입니다.'
                }
              ]
            }
          ]
        },
        fixVersions: [
          { id: '10001', name: 'v1.2.0' },
          { id: '10002', name: 'v1.3.0' }
        ]
      }
    };

    // 글로벌 fetch 모킹
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockJiraResponse
    } as Response);

    const jiraClient = new JiraClient();
    const result = await jiraClient.getIssue('PROJ-123');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://jira.example.com/rest/api/3/issue/PROJ-123',
      expect.any(Object)
    );

    expect(result).not.toBeNull();
    expect(result?.fixVersions).toEqual(['v1.2.0', 'v1.3.0']);
    expect(result?.summary).toBe('이슈 요약');
    expect(result?.description).toBe('이슈 설명 내용입니다.');
  });

  it('fixVersions가 존재하지 않는 경우 빈 배열을 반환해야 함', async () => {
    const mockJiraResponse = {
      fields: {
        summary: '이슈 요약',
        description: null,
      }
    };

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockJiraResponse
    } as Response);

    const jiraClient = new JiraClient();
    const result = await jiraClient.getIssue('PROJ-124');

    expect(result).not.toBeNull();
    expect(result?.fixVersions).toEqual([]);
  });
});
