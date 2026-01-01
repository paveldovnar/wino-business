/**
 * Vercel KV Storage Adapter
 * Uses @vercel/kv for serverless-optimized storage
 */

import { kv } from '@vercel/kv';
import { StorageAdapter, StoragePipeline } from './storage';

class VercelKVAdapter implements StorageAdapter {
  async set(key: string, value: string): Promise<void> {
    await kv.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return await kv.get<string>(key);
  }

  async del(key: string): Promise<void> {
    await kv.del(key);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    await kv.zadd(key, { score, member });
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return await kv.zrange(key, start, stop, { rev: true });
  }

  pipeline(): StoragePipeline {
    const commands: Array<() => Promise<any>> = [];

    return {
      get: (key: string) => {
        commands.push(async () => await kv.get(key));
        return this as any;
      },
      exec: async () => {
        const results = await Promise.allSettled(commands.map((cmd) => cmd()));
        return results.map((result) =>
          result.status === 'fulfilled'
            ? [null, result.value]
            : [new Error(result.reason), null]
        );
      },
    };
  }

  async ping(): Promise<string> {
    // Vercel KV doesn't have ping, so we test with a simple operation
    await kv.set('health-check', 'ok', { ex: 1 });
    const result = await kv.get('health-check');
    return result === 'ok' ? 'PONG' : 'ERROR';
  }
}

export async function createVercelKVAdapter(): Promise<StorageAdapter> {
  console.log('[vercel-kv-adapter] Using Vercel KV');
  return new VercelKVAdapter();
}
