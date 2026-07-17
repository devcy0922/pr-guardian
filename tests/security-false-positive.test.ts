import { describe, it, expect, vi } from 'vitest';
import { checkSecurity } from '../src/checklist/security.js';
import type { CheckContext } from '../src/checklist/index.js';
import type { LLMClient } from '../src/llm.js';

describe('Security False Positive Handling Test', () => {
  it('AWS key 패턴이 주석 및 테스트 예시로 포함되었을 때 LLM 검증을 거쳐 오탐으로 걸러지는지 확인', async () => {
    const syntheticAccessKey = ['AKIA', '0'.repeat(16)].join('');
    // 1. AWS API 키와 유사한 더미 패턴이 포함된 diff 컨텍스트
    const mockCtx: CheckContext = {
      pr: {
        nodeId: 'node_1',
        title: 'test: add mock tests',
        body: 'Adding test fixtures',
        branch: 'feature/mock-tests',
        author: 'tester',
      },
      files: [
        {
          filename: 'tests/mock.ts',
          status: 'modified',
          additions: 5,
          deletions: 0,
          patch: `+ const fakeKey = "${syntheticAccessKey}"; // This is just a test dummy key`,
        },
      ],
      diff: `+ const fakeKey = "${syntheticAccessKey}"; // This is just a test dummy key`,
      guardrails: { conventions: {}, skills: {} },
    };

    // 2. LLMClient Mocking — 오탐 판정하도록 설정
    const mockLLM = {
      chat: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          real_secrets: [],
          false_positives: [`${syntheticAccessKey} (테스트 코드 내 Mock 키)`],
        }),
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        latencyMs: 150,
      }),
      parseJson: vi.fn().mockImplementation((content, schema) => JSON.parse(content)),
    } as unknown as LLMClient;

    // 3. 실행
    const result = await checkSecurity(mockCtx, mockLLM);

    // 4. 검증: 상태는 pass여야 하고 오탐 판정이 들어가 있어야 함
    expect(result.status).toBe('pass');
    expect(result.detail).toContain('LLM 검증 결과 모두 오탐');
    expect(mockLLM.chat).toHaveBeenCalled();
  });
});
