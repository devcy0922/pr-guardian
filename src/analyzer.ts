import { LLMClient } from './llm.js';
import { runAllChecks } from './checklist/index.js';
import { buildReport } from './report.js';
import { validateReport, repairReport } from './pipeline.js';
import type { CheckContext, CheckRunResult } from './checklist/index.js';

/** 분석 결과 */
export interface AnalysisResult {
  /** 최종 리포트 (마크다운 문자열) */
  report: string;
  /** 개별 체크 결과 */
  checkResults: CheckRunResult;
  /** 전체 소요 시간 (ms) */
  elapsedMs: number;
  /** 리포트 자동 복구 여부 */
  repaired: boolean;
}

/**
 * 체크리스트 실행 + 리포트 빌드 오케스트레이터
 *
 * 역할: CheckContext를 받아 LLM 체크리스트 전체를 실행하고,
 * 리포트를 조립/검증한 뒤 AnalysisResult를 반환한다.
 * 트리거(webhook/api) 및 결과 게시(publisher)와 완전히 분리됨.
 */
export async function analyzeContext(ctx: CheckContext): Promise<AnalysisResult> {
  const startMs = Date.now();
  const llm = new LLMClient();

  console.log('[Analyzer] 체크리스트 병렬 실행 시작');
  const checkResults = await runAllChecks(ctx, llm);
  const elapsedMs = Date.now() - startMs;

  console.log(`[Analyzer] 체크리스트 완료 — ${elapsedMs}ms, LLM 호출: ${checkResults.llmCalls}회`);

  // 리포트 조립
  let report = buildReport(checkResults, elapsedMs);

  // 리포트 구조 검증 + 자동 복구
  const validation = validateReport(report, checkResults);
  let repaired = false;

  if (!validation.valid) {
    console.warn('[Analyzer] 리포트 검증 실패 — 자동 복구 적용:', validation.issues);
    report = repairReport(report, validation.issues);
    repaired = true;
  }

  return { report, checkResults, elapsedMs, repaired };
}
