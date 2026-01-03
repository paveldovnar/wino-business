import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const MAX_TIMEOUT_MS = 8000;

/**
 * GET /api/balance?owner=<wallet_address>
 * Returns real on-chain USDC balance for merchant wallet
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(req.url);
    const ownerAddress = searchParams.get('owner');

    if (!ownerAddress) {
      return NextResponse.json(
        { error: 'Missing owner parameter' },
        { status: 400 }
      );
    }

    // Validate owner address
    let ownerPubkey: PublicKey;
    try {
      ownerPubkey = new PublicKey(ownerAddress);
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid owner address' },
        { status: 400 }
      );
    }

    // Connect to Solana with timeout handling
    const rpcUrl = process.env.HELIUS_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: MAX_TIMEOUT_MS,
    });

    // Get merchant USDC ATA
    const merchantUsdcAta = await getAssociatedTokenAddress(
      USDC_MINT,
      ownerPubkey
    );

    console.log('[balance] Fetching balance for:', {
      owner: ownerAddress,
      ata: merchantUsdcAta.toBase58(),
    });

    // Fetch token account balance with timeout
    const balancePromise = connection.getTokenAccountBalance(merchantUsdcAta);
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), MAX_TIMEOUT_MS - (Date.now() - startTime));
    });

    try {
      const balance = await Promise.race([balancePromise, timeoutPromise]);

      if (!balance || !balance.value) {
        return NextResponse.json({
          balance: null,
          uiAmount: null,
          ata: merchantUsdcAta.toBase58(),
          exists: false,
          fetchedAt: new Date().toISOString(),
        });
      }

      const uiAmount = balance.value.uiAmount ?? null;

      console.log('[balance] Found balance:', {
        raw: balance.value.amount,
        ui: uiAmount,
      });

      return NextResponse.json({
        balance: parseInt(balance.value.amount),
        uiAmount,
        ata: merchantUsdcAta.toBase58(),
        exists: true,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      // Account doesn't exist = null balance (not 0 - we don't know)
      if (err.message?.includes('could not find account') || err.message?.includes('Invalid param')) {
        console.log('[balance] ATA does not exist yet');
        return NextResponse.json({
          balance: null,
          uiAmount: null,
          ata: merchantUsdcAta.toBase58(),
          exists: false,
          fetchedAt: new Date().toISOString(),
        });
      }

      if (err.message === 'Timeout') {
        console.error('[balance] Request timeout');
        return NextResponse.json({
          balance: null,
          uiAmount: null,
          error: 'Timeout fetching balance',
          fetchedAt: new Date().toISOString(),
        });
      }

      throw err;
    }
  } catch (err: any) {
    console.error('[balance] Error:', err);
    return NextResponse.json({
      balance: null,
      uiAmount: null,
      error: err.message || 'Failed to fetch balance',
      fetchedAt: new Date().toISOString(),
    });
  }
}
