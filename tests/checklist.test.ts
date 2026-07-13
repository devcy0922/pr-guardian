import { describe, it, expect } from 'vitest';
import type { CheckContext } from '../src/checklist/index.js';
import type { PullRequestData, PullRequestFile } from '../src/github.js';
import { checkPlanExists } from '../src/checklist/plan-exists.js';
import { checkTestExists } from '../src/checklist/test-exists.js';
import { checkFileClassify } from '../src/checklist/file-classify.js';

/** 테스트용 컨텍스트 생성 헬퍼 */
function makeCtx(overrides: Partial<{
  pr: Partial<PullRequestData>;
  files: Partial<PullRequestFile>[];
}>): CheckContext {
  return {
    pr: {
      title: 'feat: test',
      body: '',
      branch: 'feature/test',
      author: 'tester',
      ...overrides.pr,
    },
    files: (overrides.files ?? []).map((f) => ({
      filename: f.filename ?? 'unknown',
      status: f.status ?? 'modified',
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
      patch: f.patch ?? '',
    })),
    diff: '',
    guardrails: { conventions: {}, skills: {} },
  };
}

describe('checkPlanExists', () => {
  it('PR body에 설계 키워드 있으면 pass', async () => {
    const result = await checkPlanExists(makeCtx({ pr: { body: '이 PR은 설계 문서 기반 작업입니다' } }));
    expect(result.status).toBe('pass');
  });

  it('docs/ 파일 있으면 pass', async () => {
    const result = await checkPlanExists(makeCtx({ files: [{ filename: 'docs/architecture.md' }] }));
    expect(result.status).toBe('pass');
  });

  it('아무 근거 없으면 warn', async () => {
    const result = await checkPlanExists(makeCtx({}));
    expect(result.status).toBe('warn');
  });
});

describe('checkTestExists', () => {
  it('테스트 파일 있으면 pass', async () => {
    const result = await checkTestExists(makeCtx({
      files: [{ filename: 'tests/test_health.py' }, { filename: 'src/app.py' }],
    }));
    expect(result.status).toBe('pass');
    expect(result.detail).toContain('1개');
  });

  it('.test.ts 패턴도 인식', async () => {
    const result = await checkTestExists(makeCtx({
      files: [{ filename: 'src/utils.test.ts' }],
    }));
    expect(result.status).toBe('pass');
  });

  it('테스트 없으면 fail', async () => {
    const result = await checkTestExists(makeCtx({
      files: [{ filename: 'src/app.py' }],
    }));
    expect(result.status).toBe('fail');
  });
});

describe('checkFileClassify', () => {
  it('파일을 올바르게 분류', async () => {
    const result = await checkFileClassify(makeCtx({
      files: [
        { filename: 'src/api/router.py', additions: 10 },
        { filename: 'tests/test_router.py', additions: 20 },
        { filename: 'docs/README.md', additions: 5 },
      ],
    }));
    expect(result.status).toBe('info');
    expect(result.detail).toContain('Backend');
    expect(result.detail).toContain('Test');
    expect(result.detail).toContain('Docs');
  });
});
