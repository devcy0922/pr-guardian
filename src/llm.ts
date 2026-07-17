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
  model?: string;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
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
      maxTokens = 2048,
      temperature = 0.2,
      jsonMode = false,
      model,
      reasoningEffort,
    } = options;

    const body = {
      model: model ?? this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: reasoningEffort === 'none' ? 0.0 : temperature,
      ...(jsonMode && { response_format: { type: 'json_object' } }),
      extra_body: {
        ...(reasoningEffort && { reasoning_effort: reasoningEffort }),
        ...(reasoningEffort === 'none' && {
          thinking: false,
          reasoning_format: 'none',
          max_thinking_tokens: 0,
          thinking_budget: 0
        })
      }
    };

    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

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
        console.error(`[LLM Error] HTTP ${res.status}: ${errText}`);
        throw new Error(`LLM 호출 실패 (HTTP ${res.status}): ${errText}`);
      }

      const data = await res.json() as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      console.error(`[LLM Raw Response]`, JSON.stringify(data));
      const rawContent = data.choices?.[0]?.message?.content ?? '';
      const reasoningContent = (data.choices?.[0]?.message as any)?.reasoning_content ?? '';
      const content = rawContent.trim() ? rawContent : reasoningContent;
      const usage: TokenUsage = {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      };

      console.log(`[LLM Success] Latency: ${Date.now() - start}ms, Content: ${content}`);
      return { content, usage, latencyMs: Date.now() - start };
    } catch (err) {
      console.error('[LLM Client Exception]', err);
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** JSON 파싱 + Zod 스키마 검증 */
  parseJson<T>(content: string, schema: ZodSchema<T>): T {
    let cleanContent = content.trim();

    // 마크다운 코드 블록(```json ... ```) 제거
    if (cleanContent.includes('```')) {
      const match = cleanContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        cleanContent = match[1].trim();
      }
    }

    // 본문 속에 중괄호 JSON 구조가 파묻혀 있거나 뒤에 설명 텍스트가 있다면 중괄호 영역만 추출
    if (cleanContent.includes('{') && cleanContent.includes('}')) {
      const startIdx = cleanContent.indexOf('{');
      const endIdx = cleanContent.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        cleanContent = cleanContent.slice(startIdx, endIdx + 1).trim();
      }
    }

    // 키값의 쌍따옴표 누락 복원 필터 (e.g. why: "..." -> "why": "...")
    if (cleanContent.startsWith('{')) {
      cleanContent = cleanContent.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanContent);
    } catch (err) {
      console.error(`[JSON Parse Error] 파싱 실패. Content: ${content}`, err);
      throw new Error(`LLM 응답 JSON 파싱 실패: ${content.slice(0, 200)}`);
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      console.error(`[Zod Schema Error] 검증 실패. Parsed:`, parsed, `Error:`, result.error.message);
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
