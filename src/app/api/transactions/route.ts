import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

export const dynamic = 'force-dynamic';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

interface OnChainTransaction {
  signature: string;
  blockTime: number;
  payer: string;
  amountUsdc: number;
  destinationAta: string;
  slot: number;
}

/**
 * GET /api/transactions?owner=<wallet_address>
 * Returns real on-chain USDC transfers to merchant ATA
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

    console.log('[transactions] Fetching for ATA:', merchantUsdcAta.toBase58());

    // Check if ATA exists
    const accountInfo = await connection.getAccountInfo(merchantUsdcAta);
    if (!accountInfo) {
      console.log('[transactions] ATA does not exist yet');
      return NextResponse.json({
        transactions: [],
        count: 0,
      });
    }

    // Get recent signatures for this ATA
    const signatures = await connection.getSignaturesForAddress(
      merchantUsdcAta,
      { limit: 50 }
    );

    console.log('[transactions] Found', signatures.length, 'signatures');

    if (signatures.length === 0) {
      return NextResponse.json({
        transactions: [],
        count: 0,
      });
    }

    // Fetch and parse each transaction
    const transactions: OnChainTransaction[] = [];

    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta) continue;

        // Parse token transfers
        const parsedTx = tx as ParsedTransactionWithMeta;
        const instructions = parsedTx.transaction.message.instructions;

        for (const ix of instructions) {
          if ('parsed' in ix && ix.program === 'spl-token') {
            const parsed = ix.parsed;

            // Look for transfer/transferChecked instructions
            if (
              (parsed.type === 'transfer' || parsed.type === 'transferChecked') &&
              parsed.info?.destination === merchantUsdcAta.toBase58()
            ) {
              // This is an incoming transfer to our ATA
              const amount = parsed.info.amount || parsed.info.tokenAmount?.amount || '0';
              const amountUsdc = parseInt(amount) / 1_000_000; // USDC has 6 decimals

              // Get payer (fee payer, usually the sender)
              const payer = parsedTx.transaction.message.accountKeys[0]?.pubkey.toBase58() || 'unknown';

              transactions.push({
                signature: sig.signature,
                blockTime: tx.blockTime || 0,
                payer,
                amountUsdc,
                destinationAta: merchantUsdcAta.toBase58(),
                slot: tx.slot,
              });

              break; // Only count one transfer per transaction
            }
          }
        }
      } catch (err) {
        console.error('[transactions] Failed to parse tx:', sig.signature, err);
        // Continue to next transaction
      }
    }

    // Sort by blockTime descending (newest first)
    transactions.sort((a, b) => b.blockTime - a.blockTime);

    console.log('[transactions] Returning', transactions.length, 'parsed transactions');

    return NextResponse.json({
      transactions,
      count: transactions.length,
    });
  } catch (err: any) {
    console.error('[transactions] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
