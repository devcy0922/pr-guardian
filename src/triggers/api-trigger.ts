import { z } from 'zod';
import type { Context } from 'hono';
import { analyzeContext } from '../analyzer.js';
import { formatApiResponse, formatApiError } from '../publisher.js';
import { loadGuardrails } from '../guardrails.js';

/**
 * API 직접 호출 모드 — POST /api/review 핸들러
 *
 * 이미 GitHub/Jira 데이터를 수집한 외부 시스템이 페이로드를 직접 전달하여
 * 분석만 수행하고 결과를 JSON으로 반환하는 모드.
 *
 * 보안: nginx 레벨에서 192.168.x.x 대역만 접근 허용 (ai-service-infra 설정)
 *       소스 코드에 인증 정보 없음 (퍼블릭 레포 보안 원칙 준수)
 */

/** PR 파일 정보 스키마 */
const PullRequestFileSchema = z.object({
  filename: z.string(),
  status: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  patch: z.string().default(''),
});

/** PR 메타데이터 스키마 */
const PullRequestDataSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  body: z.string().default(''),
  branch: z.string(),
  author: z.string().default('unknown'),
});

/** Jira 이슈 정보 스키마 (선택) */
const JiraDataSchema = z.object({
  summary: z.string(),
  description: z.string().default(''),
}).nullable().optional();

/** Guardrail 스키마 (선택, 미전달 시 서버 로컬 가드레일 사용) */
const GuardrailSetSchema = z.object({
  conventions: z.record(z.string(), z.string()).default({}),
  skills: z.record(z.string(), z.string()).default({}),
}).optional();

/** API 요청 바디 스키마 */
const ReviewRequestSchema = z.object({
  pr: PullRequestDataSchema,
  files: z.array(PullRequestFileSchema),
  diff: z.string(),
  jira: JiraDataSchema,
  guardrails: GuardrailSetSchema,
});

export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;

/**
 * POST /api/review 핸들러
 *
 * 흐름:
 * 1. 요청 바디 Zod 검증
 * 2. 가드레일 미전달 시 서버 로컬 가드레일 로드
 * 3. analyzeContext() 실행 (GitHub/Jira API 호출 없음)
 * 4. JSON 응답 반환 (GitHub 코멘트 미작성)
 */
export async function handleApiReview(c: Context): Promise<Response> {
  let rawBody: unknown;

  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ success: false, error: '요청 바디 JSON 파싱 실패' }, 400);
  }

  // Zod 스키마 검증
  const parsed = ReviewRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: '요청 바디 스키마 오류',
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  const { pr, files, diff, jira, guardrails: incomingGuardrails } = parsed.data;

  try {
    // 가드레일: 페이로드에 없으면 서버 로컬 가드레일 사용
    const guardrails = incomingGuardrails ?? (await loadGuardrails());

    const ctx = {
      pr,
      files,
      diff,
      guardrails,
      jira: jira ?? null,
    };

    console.log(`[ApiTrigger] API 리뷰 실행 — PR: "${pr.title}", 파일: ${files.length}개`);

    const result = await analyzeContext(ctx);
    const response = formatApiResponse(result);

    console.log(
      `[ApiTrigger] API 리뷰 완료 — ${result.elapsedMs}ms, 토큰: ${result.checkResults.totalUsage.totalTokens}`,
    );

    return c.json(response, 200);
  } catch (err) {
    console.error('[ApiTrigger] 분석 실행 오류:', err);
    return c.json(formatApiError(err), 500);
  }
}
