import type { CheckContext, CheckResult } from './index.js';
import { emptyUsage } from '../llm.js';
import { statusEmoji } from './index.js';

const PLAN_KEYWORDS = [
  'plan', '계획', '설계', 'goal', 'implementation', 'design doc',
  '아키텍처', 'architecture', '명세', 'spec', 'rfc',
];

const PLAN_FILE_PATTERNS = [
  /docs\//i,
  /\.plan\.md$/i,
  /goal\.md$/i,
  /implementation_plan/i,
  /design/i,
  /architecture/i,
  /spec\//i,
];

/** Layer 0 — 플랜 문서 존재 여부 (Deterministic) */
export async function checkPlanExists(ctx: CheckContext): Promise<CheckResult> {
  const evidence: string[] = [];

  // PR body에서 키워드 탐지
  const bodyLower = ctx.pr.body.toLowerCase();
  for (const kw of PLAN_KEYWORDS) {
    if (bodyLower.includes(kw.toLowerCase())) {
      evidence.push(`PR 본문에 "${kw}" 키워드 발견`);
    }
  }

  // 변경 파일에서 문서 패턴 매칭
  for (const file of ctx.files) {
    for (const pattern of PLAN_FILE_PATTERNS) {
      if (pattern.test(file.filename)) {
        evidence.push(`문서 파일: ${file.filename}`);
        break;
      }
    }
  }

  const found = evidence.length > 0;
  const status = found ? 'pass' : 'warn';

  return {
    id: 'plan-exists',
    label: '플랜 문서 존재',
    status,
    emoji: statusEmoji(status),
    detail: found
      ? evidence.map((e) => `- ${e}`).join('\n')
      : 'PR 본문에 설계/계획 관련 키워드 또는 문서 파일이 없습니다.',
    tokenUsage: emptyUsage(),
  };
}
