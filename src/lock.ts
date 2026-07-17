import Redis from 'ioredis';

/**
 * shared-redis 기반 PR 실행 락 매니저
 * 동일 PR에 대한 중복 리뷰 실행을 방지한다.
 *
 * 키 형식: pr-guardian:lock:{owner}:{repo}:{prNumber}
 * TTL: 기본 5분 (리뷰 실행 예상 최대 시간)
 *
 * fail-open 정책: Redis 접속 실패 시 락 없이 진행 (서비스 가용성 우선)
 */

let redisClient: Redis | null = null;

/** Redis 클라이언트 싱글턴 반환 */
function getRedis(): Redis | null {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('[Lock] REDIS_URL 미설정 — 중복 방지 락 비활성화 (fail-open)');
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      // 연결 실패 시 빠르게 포기하도록 설정 (서비스 블로킹 방지)
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });

    redisClient.on('error', (err) => {
      console.error('[Lock] Redis 연결 오류:', err.message);
    });

    return redisClient;
  } catch (err) {
    console.error('[Lock] Redis 클라이언트 초기화 실패:', err);
    return null;
  }
}

/** 락 키 생성 */
function buildLockKey(owner: string, repo: string, prNumber: number): string {
  return `pr-guardian:lock:${owner}:${repo}:${prNumber}`;
}

/**
 * PR 리뷰 락 획득
 * @returns true — 락 획득 성공 (실행 진행 가능)
 * @returns false — 이미 실행 중 (중복 실행 차단)
 */
export async function acquireLock(
  owner: string,
  repo: string,
  prNumber: number,
  ttlSeconds = 300,
): Promise<boolean> {
  const redis = getRedis();

  // Redis 없으면 항상 통과 (fail-open)
  if (!redis) return true;

  const key = buildLockKey(owner, repo, prNumber);

  try {
    // SET key value NX EX ttl — 원자적 락 획득
    const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    const acquired = result === 'OK';

    if (!acquired) {
      console.warn(`[Lock] PR #${prNumber} (${owner}/${repo}) 이미 실행 중 — 중복 실행 차단`);
    } else {
      console.log(`[Lock] PR #${prNumber} (${owner}/${repo}) 락 획득 (TTL: ${ttlSeconds}s)`);
    }

    return acquired;
  } catch (err) {
    // Redis 오류 시 fail-open
    console.error(`[Lock] Redis 락 획득 오류 — fail-open으로 진행:`, err);
    return true;
  }
}

/**
 * PR 리뷰 락 해제
 * 리뷰 완료 후 즉시 해제하여 빠른 재시도를 허용한다.
 */
export async function releaseLock(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = buildLockKey(owner, repo, prNumber);

  try {
    await redis.del(key);
    console.log(`[Lock] PR #${prNumber} (${owner}/${repo}) 락 해제`);
  } catch (err) {
    console.error(`[Lock] Redis 락 해제 오류:`, err);
  }
}

/** Redis 연결 종료 (graceful shutdown용) */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
