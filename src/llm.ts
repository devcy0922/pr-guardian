import type { ZodSchema } from 'zod';

/** 토큰 사용량 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** LLM 호출 옵션 */
export interface ChatOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

/** LLM 호출 결과 */
export interface ChatResult {
  content: string;
  usage: TokenUsage;
  latencyMs: number;
}

/**
 * govail-gateway LLM 호출 클라이언트
 * OpenAI-compatible /v1/chat/completions 엔드포인트 사용
 */
export class LLMClient {
  private baseUrl: string;
  private model: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = (process.env.LLM_GATEWAY_URL ?? 'http://localhost:4000').replace(/\/$/, '');
    this.model = process.env.LLM_MODEL ?? 'qwen3-8b';
    this.apiKey = process.env.LLM_API_KEY ?? '';
  }

  /** LLM chat completion 호출 */
  async chat(options: ChatOptions): Promise<ChatResult> {
    const {
      systemPrompt,
      userPrompt,
      maxTokens = 512,
      temperature = 0.2,
      jsonMode = true,
    } = options;

    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
      ...(jsonMode && { response_format: { type: 'json_object' } }),
    };

    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LLM 호출 실패 (HTTP ${res.status}): ${errText}`);
      }

      const data = await res.json() as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const content = data.choices?.[0]?.message?.content ?? '';
      const usage: TokenUsage = {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };

      return { content, usage, latencyMs: Date.now() - start };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** JSON 파싱 + Zod 스키마 검증 */
  parseJson<T>(content: string, schema: ZodSchema<T>): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`LLM 응답 JSON 파싱 실패: ${content.slice(0, 200)}`);
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`스키마 검증 실패: ${result.error.message}`);
    }
    return result.data;
  }
}

/** 빈 토큰 사용량 */
export function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

/** 토큰 사용량 합산 */
export function mergeUsage(...usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (acc, u) => ({
      promptTokens: acc.promptTokens + u.promptTokens,
      completionTokens: acc.completionTokens + u.completionTokens,
      totalTokens: acc.totalTokens + u.totalTokens,
    }),
    emptyUsage(),
  );
}
