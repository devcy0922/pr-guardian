import type { Context } from 'hono';
import { collectContext } from '../collector.js';
import { analyzeContext } from '../analyzer.js';
import { publishToGitHub } from '../publisher.js';
import { acquireLock, releaseLock } from '../lock.js';

/**
 * webhook 이벤트 → 리뷰 실행 디스패처
 *
 * 처리하는 트리거:
 * 1. pull_request: opened / synchronize / reopened
 * 2. pull_request: labeled — 라벨 이름이 RETRY_LABEL_NAME과 일치할 때
 * 3. issue_comment: created — PR 코멘트이고 본문이 /ai-review로 시작할 때
 */

const RETRY_LABEL = process.env.RETRY_LABEL_NAME ?? 'ai-review';

/**
 * GitHub 웹훅 이벤트를 파싱하여 리뷰 실행 여부를 판단하고 트리거한다.
 *
 * @returns 처리 여부 및 스킵 이유
 */
export async function dispatchWebhookEvent(
  event: string,
  payload: Record<string, unknown>,
): Promise<{ triggered: boolean; reason?: string; pr?: number }> {

  // ── pull_request 이벤트 처리 ──────────────────────────────────────
  if (event === 'pull_request') {
    const action = payload.action as string;
    const pr = payload.pull_request as Record<string, unknown>;
    const repo = payload.repository as Record<string, unknown>;

    const owner = (repo.owner as Record<string, unknown>).login as string;
    const repoName = repo.name as string;
    const prNumber = pr.number as number;

    // 신규 / 동기화 / 재오픈
    if (['opened', 'synchronize', 'reopened'].includes(action)) {
      triggerReview(owner, repoName, prNumber, `pull_request.${action}`);
      return { triggered: true, pr: prNumber };
    }

    // 라벨 부착 트리거
    if (action === 'labeled') {
      const label = payload.label as Record<string, unknown>;
      const labelName = label.name as string;

      if (labelName !== RETRY_LABEL) {
        return { triggered: false, reason: `label=${labelName} (대상 아님)` };
      }

      console.log(`[WebhookTrigger] 재시도 라벨 감지: "${labelName}" — PR #${prNumber}`);
      triggerReview(owner, repoName, prNumber, `pull_request.labeled:${labelName}`);
      return { triggered: true, pr: prNumber };
    }

    return { triggered: false, reason: `action=${action}` };
  }

  // ── issue_comment 이벤트 처리 ─────────────────────────────────────
  if (event === 'issue_comment') {
    const action = payload.action as string;
    if (action !== 'created') {
      return { triggered: false, reason: `comment action=${action}` };
    }

    // PR 코멘트 여부 확인 (issue_comment에는 pull_request 필드가 있으면 PR 코멘트)
    const issue = payload.issue as Record<string, unknown>;
    const isPRComment = 'pull_request' in issue;

    if (!isPRComment) {
      return { triggered: false, reason: 'PR 코멘트 아님 (이슈 코멘트 스킵)' };
    }

    // /ai-review 커맨드 감지 (PR 코멘트 전용)
    const comment = payload.comment as Record<string, unknown>;
    const body = (comment.body as string).trim();

    if (!body.startsWith('/ai-review')) {
      return { triggered: false, reason: '/ai-review 커맨드 아님' };
    }

    const repo = payload.repository as Record<string, unknown>;
    const owner = (repo.owner as Record<string, unknown>).login as string;
    const repoName = repo.name as string;
    const prNumber = issue.number as number;

    console.log(`[WebhookTrigger] /ai-review 커맨드 감지 — PR #${prNumber} by ${(comment.user as Record<string, unknown>).login}`);
    triggerReview(owner, repoName, prNumber, 'issue_comment:/ai-review');
    return { triggered: true, pr: prNumber };
  }

  return { triggered: false, reason: `event=${event} (미지원)` };
}

/**
 * 리뷰 파이프라인 비동기 실행
 * - Redis 락으로 중복 실행 방지
 * - 완료 후 락 해제
 */
function triggerReview(
  owner: string,
  repo: string,
  prNumber: number,
  source: string,
): void {
  // 비동기 실행 (응답은 즉시 반환)
  runReviewPipeline(owner, repo, prNumber, source).catch((err) => {
    console.error(`[WebhookTrigger] 리뷰 파이프라인 예외 — PR #${prNumber}:`, err);
  });
}

async function runReviewPipeline(
  owner: string,
  repo: string,
  prNumber: number,
  source: string,
): Promise<void> {
  console.log(`[WebhookTrigger] 리뷰 시작 — ${owner}/${repo}#${prNumber} (source: ${source})`);

  // 중복 실행 방지 락 획득
  const locked = await acquireLock(owner, repo, prNumber);
  if (!locked) {
    console.warn(`[WebhookTrigger] PR #${prNumber} 이미 실행 중 — 스킵`);
    return;
  }

  try {
    const ctx = await collectContext(owner, repo, prNumber);
    const result = await analyzeContext(ctx);
    await publishToGitHub(owner, repo, prNumber, result, ctx);
    console.log(`[WebhookTrigger] 완료 — PR #${prNumber}`);
  } finally {
    // 성공/실패 모두 락 해제
    await releaseLock(owner, repo, prNumber);
  }
}
