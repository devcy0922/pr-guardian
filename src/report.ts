import type { CheckResult, CheckRunResult } from './checklist/index.js';
import type { TokenUsage } from './llm.js';

/**
 * Markdown 리포트 생성
 * 체크 결과를 구조화된 PR 코멘트 포맷으로 조립
 */
export function buildReport(checkResults: CheckRunResult, elapsedMs: number): string {
  const { results, totalUsage, llmCalls } = checkResults;
  const lines: string[] = [];

  // 헤더
  lines.push('## 🛡️ PR Guardian Review Report');
  lines.push('');

  // 1. 작업 요약 (summary 체크 결과)
  const summary = results.find((r) => r.id === 'summary');
  if (summary) {
    lines.push('### 📝 작업 요약');
    lines.push('');
    lines.push(summary.detail);
    lines.push('');
  }

  // 2. 체크리스트 테이블 (summary, file-classify 제외)
  const tableChecks = results.filter((r) => r.id !== 'summary' && r.id !== 'file-classify');
  lines.push('### 📊 체크리스트');
  lines.push('');
  lines.push('| 항목 | 결과 | 상세 |');
  lines.push('|---|---|---|');

  for (const check of tableChecks) {
    // detail에서 개행을 제거하여 테이블 셀에 넣기
    const shortDetail = check.detail.split('\n')[0].slice(0, 80);
    lines.push(`| ${check.label} | ${check.emoji} | ${shortDetail} |`);
  }
  lines.push('');

  // 3. 상세 (fail 또는 warn 항목만 펼침)
  const detailChecks = tableChecks.filter((r) => r.status === 'fail' || r.status === 'warn');
  if (detailChecks.length > 0) {
    lines.push('<details>');
    lines.push('<summary>⚠️ 상세 항목 보기</summary>');
    lines.push('');

    for (const check of detailChecks) {
      lines.push(`#### ${check.emoji} ${check.label}`);
      lines.push('');
      lines.push(check.detail);
      lines.push('');
    }

    lines.push('</details>');
    lines.push('');
  }

  // 4. 수정 파일 분류
  const fileClassify = results.find((r) => r.id === 'file-classify');
  if (fileClassify) {
    lines.push('### 📁 수정 파일 분류');
    lines.push('');
    lines.push(fileClassify.detail);
    lines.push('');
  }

  // 5. 푸터 — 토큰 사용량 표시
  const elapsed = (elapsedMs / 1000).toFixed(1);
  lines.push('---');
  lines.push(`> 🤖 PR Guardian v0.1.0 | GoVail Gateway`);
  lines.push(`> 📊 LLM 호출: ${llmCalls}회 | 입력: ~${totalUsage.promptTokens} tok | 출력: ~${totalUsage.completionTokens} tok | 소요: ${elapsed}s`);

  return lines.join('\n');
}
