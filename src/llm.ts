import type { ZodSchema } from 'zod';

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

/** 토큰 사용량 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** LLM 호출 결과 */
export interface ChatResult {
  content: string;
  usage: TokenUsage;
  latencyMs: number;
}

/**
 * vLLM 게이트웨이 연동 LLM 클라이언트
 */
export class LLMClient {
  private baseUrl: string;
  private model: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.LLM_GATEWAY_URL ?? 'http://192.0.2.1:14000';
    this.model = process.env.LLM_MODEL ?? 'auto';
    this.apiKey = process.env.LLM_API_KEY ?? '';
  }

  /** LLM chat completion 호출 */
  async chat(options: ChatOptions): Promise<ChatResult> {
    const {
      systemPrompt,
      userPrompt,
      maxTokens = 3072,
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
        chat_template_kwargs: { enable_thinking: reasoningEffort !== 'none' },
        ...(reasoningEffort && { reasoning_effort: reasoningEffort }),
        ...(reasoningEffort === 'none' && {
          thinking: false,
          reasoning_format: 'none',
          max_thinking_tokens: 0,
          thinking_budget: 0,
        }),
      },
    };

    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);

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

      const data = (await res.json()) as {
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

  /** JSON 파싱 + Zod 스키마 검증 (다중 후보 탐색 및 견고한 복원기) */
  parseJson<T>(content: string, schema: ZodSchema<T>): T {
    let cleanContent = content.trim();

    // 1. 마크다운 코드 블록(```json ... ```) 우선 추출
    const codeBlockMatches = cleanContent.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g);
    for (const match of codeBlockMatches) {
      const candidate = match[1].trim();
      const parsed = this.tryParseAndValidate(candidate, schema);
      if (parsed) return parsed;
    }

    // 2. 전체 문자열 직접 파싱 시도
    const directParsed = this.tryParseAndValidate(cleanContent, schema);
    if (directParsed) return directParsed;

    // 3. 문자열 내의 모든 유효한 JSON 객체 탐색
    let depth = 0;
    let startIdx = -1;
    for (let i = 0; i < cleanContent.length; i++) {
      if (cleanContent[i] === '{') {
        if (depth === 0) startIdx = i;
        depth++;
      } else if (cleanContent[i] === '}') {
        depth--;
        if (depth === 0 && startIdx !== -1) {
          const candidate = cleanContent.slice(startIdx, i + 1);
          const parsed = this.tryParseAndValidate(candidate, schema);
          if (parsed) return parsed;
          startIdx = -1;
        }
      }
    }

    // 4. 마지막 수단: 첫 번째 { ~ 마지막 } 슬라이스 복원
    const firstBrace = cleanContent.indexOf('{');
    const lastBrace = cleanContent.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleanContent.slice(firstBrace, lastBrace + 1);
      const parsed = this.tryParseAndValidate(candidate, schema);
      if (parsed) return parsed;
    }

    console.error(`[JSON Parse Error] 유효한 JSON 객체 탐색 실패. Content: ${content}`);
    throw new Error(`LLM 응답 JSON 파싱 및 스키마 검증 실패: ${content.slice(0, 200)}`);
  }

  private tryParseAndValidate<T>(raw: string, schema: ZodSchema<T>): T | null {
    try {
      let formatted = raw.trim();
      // 누락된 키 쌍따옴표 복원
      if (formatted.startsWith('{')) {
        formatted = formatted.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
      }
      const obj = JSON.parse(formatted);
      const res = schema.safeParse(obj);
      if (res.success) {
        return res.data;
      }
    } catch {
      // ignore
    }
    return null;
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
