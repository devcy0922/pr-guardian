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
  { name: 'Private IP Address', pattern: /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/ },
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

  // 동적 민감 호스트명 설정 로드
  const sensitiveHosts = process.env.SENSITIVE_HOSTNAMES
    ? process.env.SENSITIVE_HOSTNAMES.split(',').map((h) => h.trim()).filter(Boolean)
    : [];
  const hostRegex = sensitiveHosts.length > 0
    ? new RegExp(`\\b(?:${sensitiveHosts.join('|')})\\b`, 'i')
    : null;

  // diff에서 시크릿 패턴 스캔 (추가된 줄만)
  const lines = ctx.diff.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('+') || line.startsWith('+++')) continue;

    // 정적 패턴 검출
    for (const sp of SECRET_PATTERNS) {
      if (sp.pattern.test(line)) {
        findings.push({ name: sp.name, line: line.slice(0, 120), lineNum: i + 1 });
      }
    }

    // 동적 호스트명 검출
    if (hostRegex && hostRegex.test(line)) {
      findings.push({ name: 'Internal Hostname', line: line.slice(0, 120), lineNum: i + 1 });
    }
  }

  // 탐지 0건 + 민감 파일 0건 → 즉시 pass (LLM 호출 안 함)
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

  // 민감 파일 발견 → 즉시 fail (LLM 호출 안 함)
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

  // 1차 필터링 단계에서 내부 정보 노출 의심 패턴 탐지 시 가독성 높은 리포팅
  const suspiciousContext = findings
    .slice(0, 5)
    .map((f) => `* **[${f.name}]** (Line ${f.lineNum}):\n  \`\`\`diff\n  ${f.line}\n  \`\`\``)
    .join('\n');

  const systemPrompt = '보안 분석가. 의심 라인이 실제 시크릿인지 오탐인지 판별. JSON만 출력. {"real_secrets":["..."],"false_positives":["..."]}. 이모지는 절대 사용하지 마세요(No emojis). 생각 과정(thinking/reasoning)은 생략하고 즉시 JSON만 출력하세요. Skip thinking and output JSON directly.';
  const userPrompt = `의심 패턴 ${findings.length}건:\n${findings.slice(0, 5).map((f) => `[${f.name}] L${f.lineNum}: ${f.line}`).join('\n')}`;

  try {
    const result = await llm.chat({
      systemPrompt,
      userPrompt,
      maxTokens: 150,
      jsonMode: true,
      reasoningEffort: 'none'
    });
    const parsed = llm.parseJson(result.content, SecurityLLMSchema);

    if (parsed.real_secrets.length > 0) {
      return {
        id: 'security',
        label: '보안성 위반',
        status: 'fail',
        emoji: statusEmoji('fail'),
        detail: `🚨 **실제 보안 위반(시크릿 노출) 탐지:**\n\n${parsed.real_secrets.map((s) => `- ${s}`).join('\n')}\n\n* **권장 조치:** 노출된 시크릿을 즉시 무효화(Revoke)하시고, 소스코드에서 하드코딩을 제거한 뒤 \`.env\` 파일 또는 GitHub Secrets와 같은 기밀 관리 시스템으로 이관하여 주시기 바랍니다.`,
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
  } catch (err) {
    // LLM 실패 시 → 보수적으로 warn
    return {
      id: 'security',
      label: '보안성 위반',
      status: 'warn',
      emoji: statusEmoji('warn'),
      detail: `⚠️ **보안 검출 사항 (수동 검토 필요):**\n\n1차 필터링 단계에서 내부 정보(사설 IP 대역 또는 민감 설정 등) 노출 의심 패턴이 아래와 같이 탐지되었습니다.\n\n${suspiciousContext}\n\n* **개선 방안:** 위 정보가 퍼블릭으로 공개되면 안 되는 사설망 IP 주소이거나 내부 식별자 정보인 경우, 소스코드에 하드코딩하는 대신 \`.env\` 또는 컨테이너의 런타임 환경변수 주입 방식을 사용하여 소스코드 기밀성을 확보해 주시기 바랍니다.`,
      tokenUsage: emptyUsage(),
    };
  }
}
