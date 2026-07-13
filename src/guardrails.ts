import fs from 'node:fs/promises';
import path from 'node:path';
import type { GuardrailSet } from './checklist/index.js';

/**
 * guardrails/ 디렉토리에서 컨벤션 + 스킬 MD 파일 로드
 * 파일이 없으면 빈 Record 반환
 */
export async function loadGuardrails(): Promise<GuardrailSet> {
  const root = path.join(process.cwd(), 'guardrails');
  return {
    conventions: await loadDir(path.join(root, 'conventions')),
    skills: await loadDir(path.join(root, 'skills')),
  };
}

async function loadDir(dirPath: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
      result[file] = content;
    }
  } catch {
    // 디렉토리 없으면 빈 결과
  }
  return result;
}
