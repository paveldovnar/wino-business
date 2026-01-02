import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';

/**
 * GET /api/identity/verify
 * Verify that an NFT mint exists on-chain
 *
 * Query params:
 * - mint: The mint address to verify
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mintAddress = searchParams.get('mint');

    if (!mintAddress) {
      return NextResponse.json(
        { error: 'Missing mint parameter' },
        { status: 400 }
      );
    }

    // Validate mint address format
    let mintPubkey: PublicKey;
    try {
      mintPubkey = new PublicKey(mintAddress);
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid mint address format' },
        { status: 400 }
      );
    }

    // Connect to Solana
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // Use Metaplex to fetch NFT data
    const metaplex = Metaplex.make(connection);

    console.log('[verify] Fetching NFT data for mint:', mintAddress);

    // Attempt to fetch the NFT
    const nft = await metaplex.nfts().findByMint({ mintAddress: mintPubkey });

    if (!nft) {
      return NextResponse.json({
        verified: false,
        error: 'NFT not found on-chain',
      });
    }

    console.log('[verify] NFT found:', {
      mint: nft.address.toBase58(),
      name: nft.name,
      symbol: nft.symbol,
    });

    // Verify it's a Business Identity NFT
    const isWinoBusinessNFT =
      nft.symbol === 'WINO' ||
      nft.name.includes('Wino Business');

    return NextResponse.json({
      verified: true,
      nft: {
        mint: nft.address.toBase58(),
        name: nft.name,
        symbol: nft.symbol,
        uri: nft.uri,
        updateAuthority: nft.updateAuthorityAddress.toBase58(),
        isWinoBusinessNFT,
      },
    });

  } catch (error: any) {
    console.error('[verify] Error:', error);

    // If the error is about account not found, return not verified
    if (error.message?.includes('Account does not exist') || error.message?.includes('Not Found')) {
      return NextResponse.json({
        verified: false,
        error: 'NFT mint address does not exist on-chain',
      });
    }

    return NextResponse.json(
      {
        verified: false,
        error: error.message || 'Verification failed'
      },
      { status: 500 }
    );
  }
}
