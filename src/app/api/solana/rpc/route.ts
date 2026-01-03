import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Allowed RPC methods - prevent abuse
const ALLOWED_METHODS = new Set([
  'getLatestBlockhash',
  'sendRawTransaction',
  'getSignatureStatuses',
  'getTransaction',
  'getBlockHeight',
  'getSlot',
  'getRecentPrioritizationFees',
  'getAccountInfo',
  'getBalance',
]);

// Fallback for dev (never use in production with sensitive operations)
const FALLBACK_RPC = 'https://api.mainnet-beta.solana.com';

/**
 * POST /api/solana/rpc
 * Proxies JSON-RPC requests to Helius (or fallback) to avoid CORS/403 issues
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate JSON-RPC format
    if (!body.jsonrpc || !body.method || body.id === undefined) {
      return NextResponse.json(
        { error: 'Invalid JSON-RPC request' },
        { status: 400 }
      );
    }

    // Check if method is allowed
    if (!ALLOWED_METHODS.has(body.method)) {
      console.warn('[rpc-proxy] Blocked method:', body.method);
      return NextResponse.json(
        { error: `Method not allowed: ${body.method}` },
        { status: 403 }
      );
    }

    // Get RPC URL from environment
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.HELIUS_RPC_URL;

    if (!rpcUrl) {
      // Fallback to public RPC (limited, dev only)
      console.warn('[rpc-proxy] No SOLANA_RPC_URL configured, using fallback');
      return await proxyRequest(FALLBACK_RPC, body);
    }

    // Try primary RPC
    const result = await proxyRequest(rpcUrl, body);

    // If 403, try fallback in development
    if (result.status === 403 && process.env.NODE_ENV !== 'production') {
      console.warn('[rpc-proxy] Primary RPC returned 403, trying fallback');
      return await proxyRequest(FALLBACK_RPC, body);
    }

    return result;

  } catch (error: any) {
    console.error('[rpc-proxy] Error:', error.message);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message || 'Internal error',
        },
        id: null,
      },
      { status: 500 }
    );
  }
}

async function proxyRequest(rpcUrl: string, body: any): Promise<NextResponse> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  // Log errors but still return them to client
  if (data.error) {
    console.error('[rpc-proxy] RPC error:', data.error);
  }

  return NextResponse.json(data, { status: response.status });
}
