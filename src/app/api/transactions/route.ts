import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const MERCHANT_ATA = 'FaSCWAXDiXcP1BerUukGePgSWo7j4nk5HxWE13vHYuun';
const MAX_TIMEOUT_MS = 8000;

interface TransactionResult {
  signature: string;
  blockTime: number;
  amountUi: number;
  source: string;
  destination: string;
  status: string;
  explorerUrl: string;
}

interface HeliusEnhancedTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  tokenTransfers?: Array<{
    fromTokenAccount: string;
    toTokenAccount: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
}

/**
 * Fetch with timeout helper
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

/**
 * GET /api/transactions
 * Returns real on-chain USDC transfers to merchant ATA
 *
 * Query params:
 * - ata: Token account address (preferred)
 * - owner: Wallet address (fallback, will derive ATA)
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(req.url);
    let ataAddress = searchParams.get('ata');
    const ownerAddress = searchParams.get('owner');

    // If no ATA provided, derive from owner
    if (!ataAddress && ownerAddress) {
      try {
        const ownerPubkey = new PublicKey(ownerAddress);
        const derivedAta = await getAssociatedTokenAddress(USDC_MINT, ownerPubkey);
        ataAddress = derivedAta.toBase58();
      } catch (err) {
        return NextResponse.json(
          { error: 'Invalid owner address' },
          { status: 400 }
        );
      }
    }

    if (!ataAddress) {
      return NextResponse.json(
        { error: 'Missing ata or owner parameter' },
        { status: 400 }
      );
    }

    // Validate ATA address
    try {
      new PublicKey(ataAddress);
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid ata address' },
        { status: 400 }
      );
    }

    console.log('[transactions] Fetching for ATA:', ataAddress);

    // Use Helius Enhanced Transactions API
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) {
      console.warn('[transactions] No HELIUS_API_KEY, falling back to basic RPC');
      return await fallbackToBasicRPC(ataAddress, startTime);
    }

    const heliusUrl = `https://api.helius.xyz/v0/addresses/${ataAddress}/transactions?api-key=${heliusApiKey}&limit=20`;

    const response = await fetchWithTimeout(
      heliusUrl,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
      MAX_TIMEOUT_MS - (Date.now() - startTime)
    );

    if (!response.ok) {
      console.error('[transactions] Helius API error:', response.status);
      return await fallbackToBasicRPC(ataAddress, startTime);
    }

    const heliusTxs: HeliusEnhancedTransaction[] = await response.json();

    console.log('[transactions] Helius returned', heliusTxs.length, 'transactions');

    // Filter and map to our format
    const transactions: TransactionResult[] = [];

    for (const tx of heliusTxs) {
      // Only include USDC token transfers TO this ATA
      if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
        for (const transfer of tx.tokenTransfers) {
          // Check if this is USDC and destination is our ATA
          if (
            transfer.mint === USDC_MINT.toBase58() &&
            transfer.toTokenAccount === ataAddress
          ) {
            transactions.push({
              signature: tx.signature,
              blockTime: tx.timestamp,
              amountUi: transfer.tokenAmount,
              source: transfer.fromUserAccount || transfer.fromTokenAccount,
              destination: transfer.toUserAccount || transfer.toTokenAccount,
              status: 'confirmed',
              explorerUrl: `https://solscan.io/tx/${tx.signature}`,
            });
            break; // Only count one transfer per tx
          }
        }
      }
    }

    console.log('[transactions] Returning', transactions.length, 'USDC incoming transfers');

    return NextResponse.json({
      transactions,
      count: transactions.length,
      ata: ataAddress,
      fetchedAt: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error('[transactions] Error:', err.message);

    // Always return valid JSON, never hang
    return NextResponse.json({
      transactions: [],
      count: 0,
      error: err.message || 'Failed to fetch transactions',
      fetchedAt: new Date().toISOString(),
    });
  }
}

/**
 * Fallback to basic Solana RPC if Helius is unavailable
 */
async function fallbackToBasicRPC(ataAddress: string, startTime: number): Promise<NextResponse> {
  const { Connection, PublicKey } = await import('@solana/web3.js');

  const remainingTime = MAX_TIMEOUT_MS - (Date.now() - startTime);
  if (remainingTime < 1000) {
    return NextResponse.json({
      transactions: [],
      count: 0,
      error: 'Timeout before RPC fallback',
      fetchedAt: new Date().toISOString(),
    });
  }

  const rpcUrl = process.env.HELIUS_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const ataPubkey = new PublicKey(ataAddress);

  // Check if ATA exists
  const accountInfo = await connection.getAccountInfo(ataPubkey);
  if (!accountInfo) {
    return NextResponse.json({
      transactions: [],
      count: 0,
      ata: ataAddress,
      fetchedAt: new Date().toISOString(),
    });
  }

  // Get recent signatures (limited to avoid timeout)
  const signatures = await connection.getSignaturesForAddress(ataPubkey, { limit: 20 });

  if (signatures.length === 0) {
    return NextResponse.json({
      transactions: [],
      count: 0,
      ata: ataAddress,
      fetchedAt: new Date().toISOString(),
    });
  }

  // Parse transactions (limited to first 10 to avoid timeout)
  const transactions: TransactionResult[] = [];
  const signaturesSubset = signatures.slice(0, 10);

  for (const sig of signaturesSubset) {
    // Check remaining time
    if (Date.now() - startTime > MAX_TIMEOUT_MS - 500) {
      console.log('[transactions] Timeout approaching, returning partial results');
      break;
    }

    try {
      const tx = await connection.getParsedTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx || !tx.meta) continue;

      const instructions = tx.transaction.message.instructions;

      for (const ix of instructions) {
        if ('parsed' in ix && ix.program === 'spl-token') {
          const parsed = ix.parsed;

          if (
            (parsed.type === 'transfer' || parsed.type === 'transferChecked') &&
            parsed.info?.destination === ataAddress
          ) {
            const amount = parsed.info.amount || parsed.info.tokenAmount?.amount || '0';
            const amountUi = parseInt(amount) / 1_000_000;

            transactions.push({
              signature: sig.signature,
              blockTime: tx.blockTime || 0,
              amountUi,
              source: tx.transaction.message.accountKeys[0]?.pubkey.toBase58() || 'unknown',
              destination: ataAddress,
              status: 'confirmed',
              explorerUrl: `https://solscan.io/tx/${sig.signature}`,
            });
            break;
          }
        }
      }
    } catch (err) {
      console.error('[transactions] Failed to parse tx:', sig.signature);
    }
  }

  return NextResponse.json({
    transactions,
    count: transactions.length,
    ata: ataAddress,
    fetchedAt: new Date().toISOString(),
    fallback: true,
  });
}
