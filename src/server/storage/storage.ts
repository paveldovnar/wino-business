/**
 * Storage Abstraction Layer
 * Supports both Vercel KV and Upstash Redis
 * Provides a unified interface for invoice persistence
 */

import { StoredInvoice } from '../solana/types';

export interface StorageAdapter {
  // Invoice operations
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;

  // List operations
  zadd(key: string, score: number, member: string): Promise<void>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;

  // Pipeline/batch operations
  pipeline(): StoragePipeline;

  // Pub/Sub (optional - for SSE)
  publish?(channel: string, message: string): Promise<number | void>;

  // Health check
  ping(): Promise<string>;
}

export interface StoragePipeline {
  get(key: string): StoragePipeline;
  exec(): Promise<Array<[Error | null, any]>>;
}

let storageInstance: StorageAdapter | null = null;

/**
 * Get storage adapter (Vercel KV or Redis)
 * Lazy initialization with caching
 */
export async function getStorage(): Promise<StorageAdapter> {
  if (storageInstance) {
    return storageInstance;
  }

  // Try Vercel KV first (recommended for Vercel deployments)
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    console.log('[storage] Using Vercel KV');
    const { createVercelKVAdapter } = await import('./vercel-kv-adapter');
    storageInstance = await createVercelKVAdapter();
    return storageInstance;
  }

  // Fall back to Redis (ioredis or Upstash REST)
  if (process.env.REDIS_URL) {
    console.log('[storage] Using Redis (ioredis)');
    const { createRedisAdapter } = await import('./redis-adapter');
    storageInstance = await createRedisAdapter();
    return storageInstance;
  }

  throw new Error(
    'No storage configured. Set KV_REST_API_URL+KV_REST_API_TOKEN (Vercel KV) or REDIS_URL (Redis)'
  );
}

/**
 * Health check for storage connectivity
 */
export async function checkStorageHealth(): Promise<{ ok: boolean; message: string }> {
  try {
    const storage = await getStorage();
    const result = await storage.ping();
    return { ok: true, message: `Storage OK: ${result}` };
  } catch (err: any) {
    return { ok: false, message: `Storage error: ${err.message}` };
  }
}
