import { NextRequest, NextResponse } from 'next/server';
import { checkStorageHealth } from '@/server/storage/storage';

/**
 * GET /api/health
 * Health check endpoint for monitoring
 */
export async function GET(req: NextRequest) {
  try {
    // Check storage connectivity
    const storageHealth = await checkStorageHealth();

    // Check required environment variables
    const envChecks = {
      HELIUS_WEBHOOK_SECRET: !!process.env.HELIUS_WEBHOOK_SECRET,
      SOLANA_RPC_URL: !!process.env.SOLANA_RPC_URL,
      MERCHANT_WALLET: !!process.env.NEXT_PUBLIC_MERCHANT_WALLET,
      STORAGE: !!(
        (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
        process.env.REDIS_URL
      ),
    };

    const allHealthy = storageHealth.ok && Object.values(envChecks).every((v) => v);

    const response = {
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        storage: storageHealth,
        environment: envChecks,
      },
    };

    console.log('[health] Health check:', response);

    return NextResponse.json(
      response,
      { status: allHealthy ? 200 : 503 }
    );
  } catch (err: any) {
    console.error('[health] Health check error:', err);
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: err.message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
