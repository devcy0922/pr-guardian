import { z } from 'zod';
import type { CheckContext, CheckResult } from './index.js';
import type { LLMClient } from '../llm.js';
import { emptyUsage } from '../llm.js';
import { statusEmoji } from './index.js';

/** 시크릿 패턴 정의 */
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'OpenAI API Key', pattern: /sk-[a-zA-Z0-9]{20,}/ },
  { name: 'Generic Secret', pattern: /(?:password|secret|token|api_key)\s*=\s*['"][^'"]{8,}/i },
  { name: 'Private Key File', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: 'Connection String', pattern: /(?:mysql|postgres|mongodb):\/\/[^:]+:[^@]+@/ },
];

const SENSITIVE_FILES = [/\.env$/, /\.pem$/, /\.key$/, /id_rsa/, /\.p12$/];

const SecurityLLMSchema = z.object({
  real_secrets: z.array(z.string()),
  false_positives: z.array(z.string()),
});

/**
 * Layer 1 — 보안 위반 검사 (Hybrid)
 * 1단계: 정규식으로 시크릿 패턴 + 민감 파일 스캔
 * 2단계: 탐지 시 → LLM으로 진짜 시크릿인지 오탐인지 판별
 *        미탐지 시 → LLM 스킵, pass 반환
 */
export async function checkSecurity(ctx: CheckContext, llm: LLMClient): Promise<CheckResult> {
  const findings: Array<{ name: string; line: string; lineNum: number }> = [];

  // 민감 파일 체크
  const sensitiveFiles = ctx.files.filter((f) =>
    SENSITIVE_FILES.some((p) => p.test(f.filename))
  );

  // diff에서 시크릿 패턴 스캔 (추가된 줄만)
  const lines = ctx.diff.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('+') || line.startsWith('+++')) continue;

    for (const sp of SECRET_PATTERNS) {
      if (sp.pattern.test(line)) {
        findings.push({ name: sp.name, line: line.slice(0, 120), lineNum: i + 1 });
      }
    }
  }

  // 탐지 0건 + 민감 파일 0건 → 즉시 pass, LLM 스킵
  if (findings.length === 0 && sensitiveFiles.length === 0) {
    return {
      id: 'security',
      label: '보안성 위반',
      status: 'pass',
      emoji: statusEmoji('pass'),
      detail: '시크릿 패턴 및 민감 파일 미탐지',
      tokenUsage: emptyUsage(),
    };
  }

  // 민감 파일 발견 → 즉시 fail (LLM 불필요)
  if (sensitiveFiles.length > 0) {
    const fileList = sensitiveFiles.map((f) => `- \`${f.filename}\``).join('\n');
    return {
      id: 'security',
      label: '보안성 위반',
      status: 'fail',
      emoji: statusEmoji('fail'),
      detail: `🚨 민감 파일이 커밋에 포함됨:\n${fileList}`,
      tokenUsage: emptyUsage(),
    };
  }

  // 시크릿 패턴 탐지 → LLM으로 진위 판별
  const suspiciousContext = findings
    .slice(0, 5) // 최대 5건만
    .map((f) => `[${f.name}] L${f.lineNum}: ${f.line}`)
    .join('\n');

  const systemPrompt = '보안 분석가. 의심 라인이 실제 시크릿인지 오탐인지 판별. JSON만 출력. {"real_secrets":["..."],"false_positives":["..."]}';
  const userPrompt = `의심 패턴 ${findings.length}건:\n${suspiciousContext}`;

  try {
    const result = await llm.chat({ systemPrompt, userPrompt, maxTokens: 256 });
    const parsed = llm.parseJson(result.content, SecurityLLMSchema);

    if (parsed.real_secrets.length > 0) {
      return {
        id: 'security',
        label: '보안성 위반',
        status: 'fail',
        emoji: statusEmoji('fail'),
        detail: `🚨 실제 시크릿 탐지:\n${parsed.real_secrets.map((s) => `- ${s}`).join('\n')}`,
        tokenUsage: result.usage,
      };
    }

    return {
      id: 'security',
      label: '보안성 위반',
      status: 'pass',
      emoji: statusEmoji('pass'),
      detail: `패턴 ${findings.length}건 탐지 → LLM 검증 결과 모두 오탐(false positive)`,
      tokenUsage: result.usage,
    };
  } catch {
    // LLM 실패 시 → 보수적으로 warn
    return {
      id: 'security',
      label: '보안성 위반',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: `패턴 ${findings.length}건 탐지, LLM 검증 실패 — 수동 확인 필요:\n${suspiciousContext}`,
      tokenUsage: emptyUsage(),
    };
  }
}
