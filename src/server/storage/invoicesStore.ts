import { StoredInvoice } from '../solana/types';
import fs from 'fs/promises';
import path from 'path';

// Storage abstraction: Redis/KV or local file
interface InvoiceStore {
  create(invoice: StoredInvoice): Promise<void>;
  get(id: string): Promise<StoredInvoice | null>;
  update(id: string, patch: Partial<StoredInvoice>): Promise<void>;
  list(): Promise<StoredInvoice[]>;
}

class FileInvoiceStore implements InvoiceStore {
  private dataDir = path.join(process.cwd(), '.data');
  private filePath = path.join(this.dataDir, 'invoices.json');

  private async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (err) {
      // Ignore if exists
    }
  }

  private async readAll(): Promise<Record<string, StoredInvoice>> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      return {};
    }
  }

  private async writeAll(invoices: Record<string, StoredInvoice>) {
    await this.ensureDataDir();
    await fs.writeFile(this.filePath, JSON.stringify(invoices, null, 2), 'utf-8');
  }

  async create(invoice: StoredInvoice): Promise<void> {
    const all = await this.readAll();
    all[invoice.id] = invoice;
    await this.writeAll(all);
  }

  async get(id: string): Promise<StoredInvoice | null> {
    const all = await this.readAll();
    return all[id] || null;
  }

  async update(id: string, patch: Partial<StoredInvoice>): Promise<void> {
    const all = await this.readAll();
    if (!all[id]) throw new Error('Invoice not found');
    all[id] = { ...all[id], ...patch };
    await this.writeAll(all);
  }

  async list(): Promise<StoredInvoice[]> {
    const all = await this.readAll();
    return Object.values(all);
  }
}

class RedisInvoiceStore implements InvoiceStore {
  private redis: any;
  private kvType: 'vercel' | 'upstash';

  constructor(kvType: 'vercel' | 'upstash') {
    this.kvType = kvType;
  }

  private async getRedis() {
    if (this.redis) return this.redis;

    try {
      if (this.kvType === 'vercel') {
        // Dynamic require for Vercel KV
        const kvModule = eval('require')('@vercel/kv');
        this.redis = kvModule.kv;
      } else {
        // Dynamic require for Upstash Redis
        const redisModule = eval('require')('@upstash/redis');
        this.redis = new redisModule.Redis({
          url: process.env.UPSTASH_REDIS_REST_URL!,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });
      }
    } catch (err) {
      throw new Error(`Failed to load ${this.kvType} module. Install @${this.kvType === 'vercel' ? 'vercel/kv' : 'upstash/redis'}`);
    }

    return this.redis;
  }

  async create(invoice: StoredInvoice): Promise<void> {
    const redis = await this.getRedis();
    await redis.set(`invoice:${invoice.id}`, JSON.stringify(invoice));
    // Also add to list
    await redis.zadd('invoices:list', { score: invoice.createdAtSec, member: invoice.id });
  }

  async get(id: string): Promise<StoredInvoice | null> {
    const redis = await this.getRedis();
    const data = await redis.get(`invoice:${id}`);
    if (!data) return null;
    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  async update(id: string, patch: Partial<StoredInvoice>): Promise<void> {
    const redis = await this.getRedis();
    const existing = await this.get(id);
    if (!existing) throw new Error('Invoice not found');
    const updated = { ...existing, ...patch };
    await redis.set(`invoice:${id}`, JSON.stringify(updated));
  }

  async list(): Promise<StoredInvoice[]> {
    const redis = await this.getRedis();
    const ids = await redis.zrange('invoices:list', 0, -1);
    const invoices: StoredInvoice[] = [];
    for (const id of ids) {
      const invoice = await this.get(id);
      if (invoice) invoices.push(invoice);
    }
    return invoices;
  }
}

// Factory
let storeInstance: InvoiceStore | null = null;

export function getInvoiceStore(): InvoiceStore {
  if (storeInstance) return storeInstance;

  // Try Redis/KV first
  const hasKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;
  const hasUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

  if (hasKV) {
    console.log('[invoicesStore] Using Vercel KV storage');
    storeInstance = new RedisInvoiceStore('vercel');
  } else if (hasUpstash) {
    console.log('[invoicesStore] Using Upstash Redis storage');
    storeInstance = new RedisInvoiceStore('upstash');
  } else {
    console.log('[invoicesStore] Using local file storage');
    storeInstance = new FileInvoiceStore();
  }

  return storeInstance;
}

// Convenience functions
export async function createInvoice(invoice: StoredInvoice): Promise<void> {
  const store = getInvoiceStore();
  await store.create(invoice);
}

export async function getInvoice(id: string): Promise<StoredInvoice | null> {
  const store = getInvoiceStore();
  return store.get(id);
}

export async function updateInvoice(id: string, patch: Partial<StoredInvoice>): Promise<void> {
  const store = getInvoiceStore();
  await store.update(id, patch);
}

export async function listInvoices(): Promise<StoredInvoice[]> {
  const store = getInvoiceStore();
  return store.list();
}
