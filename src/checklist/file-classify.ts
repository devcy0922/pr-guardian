import type { CheckContext, CheckResult } from './index.js';
import { emptyUsage } from '../llm.js';
import { statusEmoji } from './index.js';

/** 파일 카테고리 */
type FileCategory = 'Backend' | 'Frontend' | 'Docs' | 'Infra' | 'Test' | 'Other';

interface CategoryRule {
  category: FileCategory;
  patterns: RegExp[];
}

const RULES: CategoryRule[] = [
  {
    category: 'Test',
    patterns: [/\.test\.\w+$/, /\.spec\.\w+$/, /^tests?\//, /__tests__\//, /test_[^/]+\.\w+$/],
  },
  {
    category: 'Docs',
    patterns: [/^docs\//, /\.md$/i, /^readme/i, /^changelog/i, /^license/i],
  },
  {
    category: 'Infra',
    patterns: [/^docker/i, /^\.github\//, /makefile$/i, /\.ya?ml$/i, /^\.env/, /dockerfile/i],
  },
  {
    category: 'Frontend',
    patterns: [/\.(vue|jsx|tsx)$/, /^src\/(components|pages|views|app|ui)\//, /\.css$/, /\.scss$/],
  },
  {
    category: 'Backend',
    patterns: [/^src\/(api|server|routes|controllers|services|middleware|core)\//, /\.(py|go|rs|java)$/],
  },
];

function classify(filename: string): FileCategory {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(filename))) {
      return rule.category;
    }
  }
  return 'Other';
}

/** Layer 0 — 수정 파일 분류 (Deterministic) */
export async function checkFileClassify(ctx: CheckContext): Promise<CheckResult> {
  const groups = new Map<FileCategory, { files: string[]; additions: number; deletions: number }>();

  for (const file of ctx.files) {
    const cat = classify(file.filename);
    const entry = groups.get(cat) ?? { files: [], additions: 0, deletions: 0 };
    entry.files.push(file.filename);
    entry.additions += file.additions;
    entry.deletions += file.deletions;
    groups.set(cat, entry);
  }

  // 테이블 생성
  const rows: string[] = ['| 카테고리 | 파일 수 | +/- | 주요 파일 |', '|---|---:|---:|---|'];
  for (const [cat, data] of groups) {
    const top = data.files.slice(0, 3).map((f) => `\`${f.split('/').pop()}\``).join(', ');
    const more = data.files.length > 3 ? ` 외 ${data.files.length - 3}개` : '';
    rows.push(`| ${cat} | ${data.files.length} | +${data.additions} -${data.deletions} | ${top}${more} |`);
  }

  return {
    id: 'file-classify',
    label: '수정 파일 분류',
    status: 'info',
    emoji: statusEmoji('info'),
    detail: rows.join('\n'),
    tokenUsage: emptyUsage(),
  };
}
