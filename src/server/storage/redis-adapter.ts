/**
 * Redis Storage Adapter using ioredis
 * Works with standard Redis and Upstash Redis
 */

import Redis from 'ioredis';
import { StorageAdapter, StoragePipeline } from './storage';

class RedisAdapter implements StorageAdapter {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async set(key: string, value: string): Promise<void> {
    await this.redis.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await this.redis.zadd(key, score, member);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.redis.zrevrange(key, start, stop);
  }

  pipeline(): StoragePipeline {
    const redisPipeline = this.redis.pipeline();
    return {
      get: (key: string) => {
        redisPipeline.get(key);
        return this as any;
      },
      exec: async () => {
        const results = await redisPipeline.exec();
        if (!results) return [];
        return results.map(([err, result]) => [err, result]);
      },
    };
  }

  async ping(): Promise<string> {
    return await this.redis.ping();
  }
}

// Global singleton to survive hot module reloads
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export async function createRedisAdapter(): Promise<StorageAdapter> {
  if (globalForRedis.redis) {
    console.log('[redis-adapter] Reusing existing Redis connection');
    return new RedisAdapter(globalForRedis.redis);
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }

  console.log('[redis-adapter] Creating new Redis connection');

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) {
        console.error('[redis-adapter] Max retries reached, giving up');
        return null;
      }
      const delay = Math.min(times * 50, 2000);
      console.log(`[redis-adapter] Retry attempt ${times}, waiting ${delay}ms`);
      return delay;
    },
  });

  // Connect immediately
  try {
    await redis.connect();
    console.log('[redis-adapter] Connected successfully');
  } catch (err) {
    console.error('[redis-adapter] Connection error:', err);
    throw new Error(`Failed to connect to Redis: ${err}`);
  }

  redis.on('error', (err) => {
    console.error('[redis-adapter] Redis error:', err);
  });

  redis.on('connect', () => {
    console.log('[redis-adapter] Redis connected');
  });

  redis.on('ready', () => {
    console.log('[redis-adapter] Redis ready');
  });

  globalForRedis.redis = redis;
  return new RedisAdapter(redis);
}
