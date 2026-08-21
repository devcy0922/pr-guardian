import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** 등록된 레포지토리 설정 */
export interface RepositoryConfig {
  owner: string;
  repo: string;
  issueTracker: 'github' | 'jira';
  defaultBranch?: string;
  jiraProjectKey?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'repositories.json');

/**
 * 로컬 레포지토리 저장소 매니저
 * Git 추적에서 격리된 data/repositories.json에 메타데이터 영속화
 */
export class RepositoryStore {
  private static async ensureDataFile(): Promise<void> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      try {
        await fs.access(STORE_PATH);
      } catch {
        await fs.writeFile(STORE_PATH, JSON.stringify([], null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('[RepositoryStore] 데이터 파일 초기화 오류:', err);
    }
  }

  /** 전체 레포지토리 목록 조회 */
  static async list(): Promise<RepositoryConfig[]> {
    await this.ensureDataFile();
    try {
      const content = await fs.readFile(STORE_PATH, 'utf-8');
      return JSON.parse(content) as RepositoryConfig[];
    } catch (err) {
      console.error('[RepositoryStore] 레포지토리 목록 로드 실패:', err);
      return [];
    }
  }

  /** 특정 레포지토리 조회 */
  static async get(owner: string, repo: string): Promise<RepositoryConfig | null> {
    const list = await this.list();
    const normalizedOwner = owner.trim().toLowerCase();
    const normalizedRepo = repo.trim().toLowerCase();
    return (
      list.find(
        (r) =>
          r.owner.trim().toLowerCase() === normalizedOwner &&
          r.repo.trim().toLowerCase() === normalizedRepo,
      ) ?? null
    );
  }

  /** 레포지토리 등록 및 갱신 */
  static async add(
    entry: Omit<RepositoryConfig, 'createdAt' | 'updatedAt'>,
  ): Promise<RepositoryConfig> {
    const list = await this.list();
    const normalizedOwner = entry.owner.trim();
    const normalizedRepo = entry.repo.trim();
    const now = new Date().toISOString();

    const existingIndex = list.findIndex(
      (r) =>
        r.owner.trim().toLowerCase() === normalizedOwner.toLowerCase() &&
        r.repo.trim().toLowerCase() === normalizedRepo.toLowerCase(),
    );

    const newConfig: RepositoryConfig = {
      ...entry,
      owner: normalizedOwner,
      repo: normalizedRepo,
      defaultBranch: entry.defaultBranch ?? 'main',
      createdAt: existingIndex >= 0 ? list[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      list[existingIndex] = newConfig;
    } else {
      list.push(newConfig);
    }

    await fs.writeFile(STORE_PATH, JSON.stringify(list, null, 2), 'utf-8');
    return newConfig;
  }

  /** 레포지토리 등록 해제 */
  static async remove(owner: string, repo: string): Promise<boolean> {
    const list = await this.list();
    const normalizedOwner = owner.trim().toLowerCase();
    const normalizedRepo = repo.trim().toLowerCase();

    const filtered = list.filter(
      (r) =>
        !(
          r.owner.trim().toLowerCase() === normalizedOwner &&
          r.repo.trim().toLowerCase() === normalizedRepo
        ),
    );

    if (filtered.length === list.length) {
      return false; // 대상 없음
    }

    await fs.writeFile(STORE_PATH, JSON.stringify(filtered, null, 2), 'utf-8');
    return true;
  }
}
