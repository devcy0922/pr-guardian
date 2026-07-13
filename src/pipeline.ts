import { z } from 'zod';
import type { CheckResult, CheckRunResult } from './checklist/index.js';
import type { LLMClient } from './llm.js';

/**
 * 리포트 검증 스키마
 * 리포트가 올바른 구조인지 확인
 */
const ReportValidation = z.object({
  valid: z.boolean(),
  issues: z.array(z.string()),
});

/** 파이프라인 단계 */
export type PipelineStage = 'collect' | 'analyze' | 'assemble' | 'validate' | 'publish';

/** 파이프라인 실행 결과 */
export interface PipelineResult {
  stage: PipelineStage;
  success: boolean;
  report: string;
  attempts: number;
  checkResults: CheckRunResult;
}

/**
 * 리포트 구조 검증 (Deterministic)
 * LLM 없이 리포트 무결성 확인
 */
export function validateReport(report: string, checkResults: CheckRunResult): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // 1. 빈 리포트 체크
  if (report.length < 50) {
    issues.push('리포트가 너무 짧음 (50자 미만)');
  }

  // 2. 필수 섹션 존재 확인
  const requiredSections = ['PR Guardian', '체크리스트', '수정 파일 분류'];
  for (const section of requiredSections) {
    if (!report.includes(section)) {
      issues.push(`필수 섹션 누락: "${section}"`);
    }
  }

  // 3. 체크 결과 수 일치 검증
  const checkCount = checkResults.results.length;
  // 체크리스트 테이블에 각 체크 결과가 반영되었는지 (summary는 별도 섹션)
  const expectedInTable = checkResults.results.filter((r) => r.id !== 'summary' && r.id !== 'file-classify').length;
  const tableRows = (report.match(/\|.*\|.*\|.*\|/g) ?? []).length - 2; // 헤더 + 구분선 제외
  if (tableRows < expectedInTable) {
    issues.push(`체크리스트 테이블 행 부족: 기대 ${expectedInTable}행, 실제 ${tableRows}행`);
  }

  // 4. 깨진 마크다운 체크
  const unclosedCodeBlocks = (report.match(/```/g) ?? []).length % 2 !== 0;
  if (unclosedCodeBlocks) {
    issues.push('닫히지 않은 코드 블록 존재');
  }

  return { valid: issues.length === 0, issues };
}

/**
 * 리포트 복구 시도
 * 검증 실패 시 문제 부분을 수정하여 재생성
 */
export function repairReport(report: string, validationIssues: string[]): string {
  let repaired = report;

  // 닫히지 않은 코드 블록 수정
  if (validationIssues.some((i) => i.includes('코드 블록'))) {
    repaired += '\n```\n';
  }

  // 필수 섹션 누락 시 추가
  if (validationIssues.some((i) => i.includes('PR Guardian'))) {
    repaired = `## 🛡️ PR Guardian Review Report\n\n${repaired}`;
  }

  // 리포트 하단에 검증 경고 추가
  repaired += `\n\n> ⚠️ 리포트 자동 복구 적용됨: ${validationIssues.join(', ')}`;

  return repaired;
}
