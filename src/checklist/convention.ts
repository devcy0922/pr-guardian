import { z } from 'zod';
import type { CheckContext, CheckResult } from './index.js';
import { emptyUsage } from '../llm.js';
import { statusEmoji } from './index.js';

// 일반적인 Git 브랜치 표준 (feat/foo, fix/123-bar, feature/john_GA-123-desc 등 허용)
const STANDARD_BRANCH_PATTERN =
  /^(feat|feature|fix|hotfix|bugfix|refactor|release|chore|docs|test|ci)\/([a-zA-Z0-9_\-#\.\/]+)$/;
const JIRA_BRANCH_PATTERN = /^(feature|hotfix|bugfix|release)\/[a-zA-Z0-9]+_[A-Z]+-\d+-.+$/;
const TITLE_PATTERN = /^(feat|fix|refactor|docs|test|chore|hotfix|build|ci|perf|style)(\(.+\))?:\s/i;
const JIRA_PATTERN = /[A-Z]+-\d+/;

/**
 * Layer 1 — 컨벤션 준수 검사 (Hybrid)
 * - 브랜치명 규칙 검증
 * - PR 제목 Conventional Commit 규격 검증
 * - Jira 연동 모드일 때만 Jira 키 필수 검증 수행
 */
export async function checkConvention(ctx: CheckContext): Promise<CheckResult> {
  const issues: string[] = [];
  const isJiraProject = ctx.issue?.type === 'jira' || Boolean(ctx.jira);

  // 1. 브랜치명 체크
  if (isJiraProject) {
    if (!JIRA_BRANCH_PATTERN.test(ctx.pr.branch) && !STANDARD_BRANCH_PATTERN.test(ctx.pr.branch)) {
      issues.push(
        `브랜치명 \`${ctx.pr.branch}\`이 Jira 네이밍 규칙 불일치 (형식: <type>/<author>_<jira-key>-<description> 필요, 예: feature/john_GA-1234-add-health-check)`,
      );
    }
  } else {
    if (!STANDARD_BRANCH_PATTERN.test(ctx.pr.branch)) {
      issues.push(
        `브랜치명 \`${ctx.pr.branch}\`이 표준 브랜치 네이밍 규칙 불일치 (형식: <type>/<description>, 예: feat/login-service, fix/issue-123)`,
      );
    }
  }

  // 2. PR 제목 체크 (Conventional Commit)
  if (!TITLE_PATTERN.test(ctx.pr.title)) {
    issues.push(
      `PR 제목이 conventional commit 형식 불일치: \`${ctx.pr.title}\` (예: feat: [인증 모듈] 토큰 갱신 기능 추가)`,
    );
  }

  // 3. Jira 이슈 ID 매핑 체크 (Jira 모드일 때만 필수)
  if (isJiraProject) {
    if (!JIRA_PATTERN.test(ctx.pr.title) && !JIRA_PATTERN.test(ctx.pr.branch)) {
      issues.push(
        'Jira 연동 프로젝트: PR 제목 또는 브랜치명 중 최소 하나에는 Jira 이슈 Key([A-Z]+-\\d+, 예: GA-1234)가 명시되어 있어야 합니다.',
      );
    }
  }

  if (issues.length > 0) {
    return {
      id: 'convention',
      label: '컨벤션 준수',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: issues.map((i) => `- ${i}`).join('\n'),
      tokenUsage: emptyUsage(),
    };
  }

  return {
    id: 'convention',
    label: '컨벤션 준수',
    status: 'pass',
    emoji: statusEmoji('pass'),
    detail: '브랜치명 및 PR 제목 규칙(Conventional Commit) 준수 완료',
    tokenUsage: emptyUsage(),
  };
}
