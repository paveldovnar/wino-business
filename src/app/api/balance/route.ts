import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

export const dynamic = 'force-dynamic';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

/**
 * GET /api/balance?owner=<wallet_address>
 * Returns real on-chain USDC balance for merchant wallet
 */
export async function GET(req: NextRequest) {
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

    // Connect to Solana
    const rpcUrl = process.env.HELIUS_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // Get merchant USDC ATA
    const merchantUsdcAta = await getAssociatedTokenAddress(
      USDC_MINT,
      ownerPubkey
    );

    console.log('[balance] Fetching balance for:', {
      owner: ownerAddress,
      ata: merchantUsdcAta.toBase58(),
    });

    // Fetch token account balance
    try {
      const balance = await connection.getTokenAccountBalance(merchantUsdcAta);

      if (!balance || !balance.value) {
        return NextResponse.json({
          balance: 0,
          uiAmount: 0,
          ata: merchantUsdcAta.toBase58(),
          exists: false,
        });
      }

      const uiAmount = balance.value.uiAmount || 0;

      console.log('[balance] Found balance:', {
        raw: balance.value.amount,
        ui: uiAmount,
      });

      return NextResponse.json({
        balance: parseInt(balance.value.amount),
        uiAmount,
        ata: merchantUsdcAta.toBase58(),
        exists: true,
      });
    } catch (err: any) {
      // Account doesn't exist = zero balance
      if (err.message?.includes('could not find account')) {
        console.log('[balance] ATA does not exist yet');
        return NextResponse.json({
          balance: 0,
          uiAmount: 0,
          ata: merchantUsdcAta.toBase58(),
          exists: false,
        });
      }
      throw err;
    }
  } catch (err: any) {
    console.error('[balance] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}
