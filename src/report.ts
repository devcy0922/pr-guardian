import type { CheckResult, CheckRunResult } from './checklist/index.js';

/**
 * Markdown 리포트 생성 (결정적 동기식 조립기)
 * 1. 요약 및 비즈니스 의도
 * 2. 체크리스트 수행 결과 (보안, 일치성, 테스트 품질, 컨벤션 등)
 * 3. 최종결과 설명 (판정 및 조치 가이드)
 * 4. 구체적 코드 개선 제안 (Actionable Code Suggestions)
 */
export function buildReport(checkResults: CheckRunResult, elapsedMs: number): string {
  const { results, totalUsage } = checkResults;

  // 개별 체크 결과 추출
  const summary = results.find((r) => r.id === 'summary');
  const businessIntent = results.find((r) => r.id === 'business-intent');
  const planMatch = results.find((r) => r.id === 'plan-match');
  const actionableSuggestions = results.find((r) => r.id === 'actionable-suggestions');

  const lines: string[] = [];

  lines.push('# 🛡️ PR Guardian 자동 리뷰 보고서');
  lines.push('');

  // 1. 요약 및 비즈니스 맥락
  lines.push('### 📝 요약 및 비즈니스 의도');
  if (summary && summary.detail) {
    lines.push(summary.detail);
  } else {
    lines.push('- 작업 요약 정보 없음');
  }
  lines.push('');

  if (businessIntent && businessIntent.detail) {
    lines.push('**비즈니스 의도 및 효과:**');
    lines.push(businessIntent.detail);
    lines.push('');
  }

  // 2. 체크리스트 수행 결과
  lines.push('### 📊 체크리스트 수행 결과');
  lines.push('| 검사 항목 | 상태 배지 | 요약 결과 |');
  lines.push('|---|---|---|');

  const displayOrder = [
    'security',
    'convention',
    'plan-match',
    'test-quality',
    'test-exists',
    'actionable-suggestions',
  ];
  for (const id of displayOrder) {
    const r = results.find((res) => res.id === id);
    if (!r) continue;
    const briefDetail = r.detail.split('\n')[0].replace(/[*#`_\-]/g, '').slice(0, 60);
    lines.push(`| ${r.label} | \`${r.emoji}\` | ${briefDetail} |`);
  }
  lines.push('');

  // 3. 이슈 ↔ PR 연관성 및 누락/범위 초과 검증 (Plan Match)
  if (planMatch && planMatch.detail) {
    lines.push('### 🎯 연관 이슈 ↔ PR 정합성 (Traceability)');
    lines.push(planMatch.detail);
    lines.push('');
  }

  // 4. 구체적 코드 개선 제안 (Actionable Code Suggestions)
  if (actionableSuggestions && actionableSuggestions.detail) {
    lines.push('### 💡 구체적 코드 개선 제안 (Actionable Suggestions)');
    lines.push(actionableSuggestions.detail);
    lines.push('');
  }

  // 5. 최종결과 설명
  lines.push('### 🔍 최종 검토 판정');

  const hasFail = results.some((r) => r.status === 'fail');
  const hasWarn = results.some((r) => r.status === 'warn');

  let opinionHeader = '';
  let opinionDesc = '';

  if (hasFail) {
    opinionHeader = '[재수정 권장]';
    opinionDesc = '보안성 가드레일 위반 또는 치명적인 컨벤션 불일치가 감지되었습니다. 상세 내역을 확인하여 보완 후 재요청 바랍니다.';
  } else if (hasWarn) {
    opinionHeader = '[조건부 승인 가능]';
    opinionDesc = '마이너한 경고 또는 확인 필요 사항(누락 요구사항, 테스트 보완 등)이 감지되었습니다. 조치 권장 내역을 확인해 보완해 주시기 바랍니다.';
  } else {
    opinionHeader = '[승인 권장]';
    opinionDesc = '모든 보안성 검사 및 정적/동적 규칙들을 정상적으로 통과하여 즉시 병합 가능합니다.';
  }

  lines.push(`- **검토 판정:** **${opinionHeader}**`);
  lines.push(`- **의견:** ${opinionDesc}`);
  lines.push('');

  // 위반 사항(문제점)이 있을 경우 상세 출력
  const violations = results.filter(
    (r) => (r.status === 'fail' || r.status === 'warn') && r.id !== 'plan-match',
  );
  if (violations.length > 0) {
    lines.push('**발견된 주의 사항 및 조치 권장:**');
    lines.push('');
    for (const v of violations) {
      lines.push(`- **${v.label} (${v.emoji})**:`);
      const blockDetail = v.detail.replace(/\n/g, '\n  ');
      lines.push(`  ${blockDetail}`);
      lines.push('');
    }
  }

  // 푸터
  const elapsed = (elapsedMs / 1000).toFixed(1);
  const totalTokens = totalUsage.totalTokens;
  lines.push('---');
  lines.push(`> 🤖 PR Guardian v0.2.0 (MCP Agent Engine) | 소요 시간: ${elapsed}s | 토큰 소모: ~${totalTokens} tok`);

  return lines.join('\n');
}
