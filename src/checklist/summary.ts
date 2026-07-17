import { z } from 'zod';
import type { CheckContext, CheckResult } from './index.js';
import type { LLMClient } from '../llm.js';
import { statusEmoji } from './index.js';

const SummarySchema = z.object({
  summary: z.array(z.string()).min(1).max(5),
});

/**
 * Layer 2 — 작업 요약 (LLM 필수)
 * diff에서 핵심 변경만 추출하여 3줄 한글 요약 생성
 */
export async function checkSummary(ctx: CheckContext, llm: LLMClient): Promise<CheckResult> {
  // 입력 압축: 파일 목록 + 핵심 hunk만
  const fileList = ctx.files
    .map((f) => `${f.filename} (+${f.additions} -${f.deletions})`)
    .join('\n');

  // diff에서 핵심 hunk 추출 (함수 시그니처, export, class 변경 중심)
  const keyHunks = extractKeyHunks(ctx.diff, 80);

  const systemPrompt = 'PR diff 분석하여 3줄 한글 요약 JSON 출력. {"summary":["줄1","줄2","줄3"]}. 이모지는 절대 사용하지 마세요(No emojis). 생각 과정(thinking/reasoning)은 생략하고 즉시 JSON만 출력하세요. Skip thinking and output JSON directly.';
  const userPrompt = `제목: ${ctx.pr.title}\n본문: ${ctx.pr.body.slice(0, 300)}\n\n파일:\n${fileList}\n\n주요변경:\n${keyHunks}`;

  try {
    const result = await llm.chat({
      systemPrompt,
      userPrompt,
      maxTokens: 150,
      jsonMode: true,
      reasoningEffort: 'none'
    });
    const parsed = llm.parseJson(result.content, SummarySchema);

    return {
      id: 'summary',
      label: '작업 요약',
      status: 'info',
      emoji: statusEmoji('info'),
      detail: parsed.summary.map((s) => `- ${s}`).join('\n'),
      tokenUsage: result.usage,
    };
  } catch {
    // LLM 실패 시 → PR 제목 기반 폴백
    return {
      id: 'summary',
      label: '작업 요약',
      status: 'info',
      emoji: statusEmoji('info'),
      detail: `- ${ctx.pr.title}\n- 변경 파일 ${ctx.files.length}개 (LLM 요약 실패, 제목 기반 폴백)`,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}

/**
 * diff에서 핵심 hunk만 추출
 * 추가된 줄 중 함수/클래스/export 선언 위주로 수집
 */
function extractKeyHunks(diff: string, maxLines: number): string {
  const lines = diff.split('\n');
  const keyLines: string[] = [];
  const keyPatterns = [
    /^[+].*(?:function|class|interface|type|export|import|def |async |const |let )/,
    /^[+].*(?:@app\.|@router\.|app\.|router\.)/,
    /^@@/,
  ];

  for (const line of lines) {
    if (keyLines.length >= maxLines) break;
    if (keyPatterns.some((p) => p.test(line))) {
      keyLines.push(line);
    }
  }

  return keyLines.join('\n') || diff.split('\n').filter((l) => l.startsWith('+')).slice(0, maxLines).join('\n');
}
