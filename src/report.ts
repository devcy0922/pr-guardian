import type { CheckResult, CheckRunResult } from './checklist/index.js';

/**
 * Markdown 리포트 생성 (결정적 동기식 조립기)
 * 사용자가 요청한 [요약, 체크리스트 수행 결과, 최종결과 설명] 3가지로만 아주 간결하게 보고서 구성
 */
export function buildReport(checkResults: CheckRunResult, elapsedMs: number): string {
  const { results, totalUsage } = checkResults;

  // 개별 체크 결과 추출
  const summary = results.find((r) => r.id === 'summary');
  const convention = results.find((r) => r.id === 'convention');
  const security = results.find((r) => r.id === 'security');
  const testExists = results.find((r) => r.id === 'test-exists');
  const testQuality = results.find((r) => r.id === 'test-quality');
  const planMatch = results.find((r) => r.id === 'plan-match');

  const lines: string[] = [];

  lines.push('# PR Guardian 자동 리뷰 보고서');
  lines.push('');

  // 1. 요약
  lines.push('### 📝 요약');
  if (summary && summary.detail) {
    lines.push(summary.detail);
  } else {
    lines.push('- 작업 요약 정보 없음');
  }
  lines.push('');

  // 2. 체크리스트 수행 결과
  lines.push('### 📊 체크리스트 수행 결과');
  lines.push('| 검사 항목 | 상태 배지 | 요약 결과 |');
  lines.push('|---|---|---|');
  
  // 가독성을 극대화하기 위해 핵심 검사 항목들 위주로 우선 노출
  const displayOrder = ['security', 'convention', 'plan-match', 'test-quality', 'test-exists'];
  for (const id of displayOrder) {
    const r = results.find(res => res.id === id);
    if (!r) continue;
    const briefDetail = r.detail.split('\n')[0].replace(/[*#`_\-]/g, '').slice(0, 60);
    lines.push(`| ${r.label} | \`${r.emoji}\` | ${briefDetail} |`);
  }
  lines.push('');

  // 3. 최종결과 설명 (문제점 또는 결과통과 등)
  lines.push('### 🔍 최종결과 설명');
  
  const hasFail = results.some((r) => r.status === 'fail');
  const hasWarn = results.some((r) => r.status === 'warn');

  let opinionHeader = '';
  let opinionDesc = '';

  if (hasFail) {
    opinionHeader = '[재수정 권장]';
    opinionDesc = '보안성 가드레일 위반 또는 치명적인 컨벤션 불일치가 감지되었습니다. 아래의 조치 가이드를 참고하여 재수정 후 요청해 주시기 바랍니다.';
  } else if (hasWarn) {
    opinionHeader = '[조건부 승인 가능]';
    opinionDesc = '마이너한 경고 또는 확인 필요 사항이 감지되었습니다. 아래 조치 권장 내역을 확인해 보완해 주시기 바랍니다.';
  } else {
    opinionHeader = '[승인 가능]';
    opinionDesc = '모든 보안성 검사 및 정적 규칙들을 정상적으로 통과하여 즉시 병합 가능합니다.';
  }

  lines.push(`- **검토 판정:** **${opinionHeader}**`);
  lines.push(`- **의견:** ${opinionDesc}`);
  lines.push('');

  // 위반 사항(문제점)이 있을 경우 상세 출력
  const violations = results.filter((r) => r.status === 'fail' || r.status === 'warn');
  if (violations.length > 0) {
    lines.push('**발견된 문제점 및 조치 권장:**');
    lines.push('');
    for (const v of violations) {
      lines.push(`- **${v.label} (${v.emoji})**:`);
      const blockDetail = v.detail.replace(/\n/g, '\n  ');
      lines.push(`  ${blockDetail}`);
      lines.push('');
    }
  } else {
    lines.push('**발견된 문제점 및 조치 권장:**');
    lines.push('- 특이사항 없음 (모든 보안성 검사 및 정적 규칙들을 만족합니다)');
    lines.push('');
  }

  // 푸터
  const elapsed = (elapsedMs / 1000).toFixed(1);
  const totalTokens = totalUsage.totalTokens;
  lines.push('---');
  lines.push(`> PR Guardian v0.1.0 | 소요 시간: ${elapsed}s | 토큰 소모: ~${totalTokens} tok`);

  return lines.join('\n');
}
