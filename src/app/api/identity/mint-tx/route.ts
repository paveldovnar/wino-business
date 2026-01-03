import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { Metaplex, keypairIdentity, toBigNumber } from '@metaplex-foundation/js';

export const dynamic = 'force-dynamic';

const RPC_URL = process.env.HELIUS_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

interface MintTxRequest {
  businessName: string;
  logoUrl?: string;
  ownerPubkey: string;
}

/**
 * POST /api/identity/mint-tx
 * Build an unsigned NFT mint transaction for client-side signing
 *
 * This endpoint:
 * 1. Uploads metadata to Arweave (server-side, using a temp keypair for bundlr)
 * 2. Builds the mint transaction with owner as payer/authority
 * 3. Returns unsigned transaction for client to sign
 */
export async function POST(req: NextRequest) {
  try {
    const body: MintTxRequest = await req.json();
    const { businessName, logoUrl, ownerPubkey } = body;

    if (!businessName) {
      return NextResponse.json({ error: 'Missing businessName' }, { status: 400 });
    }

    if (!ownerPubkey) {
      return NextResponse.json({ error: 'Missing ownerPubkey' }, { status: 400 });
    }

    // Validate owner pubkey
    let ownerKey: PublicKey;
    try {
      ownerKey = new PublicKey(ownerPubkey);
    } catch {
      return NextResponse.json({ error: 'Invalid ownerPubkey' }, { status: 400 });
    }

    console.log('[mint-tx] Building mint transaction for:', businessName);
    console.log('[mint-tx] Owner:', ownerPubkey);

    // Connect to Solana
    const connection = new Connection(RPC_URL, 'confirmed');

    // Create a temporary keypair for metadata upload
    // This is only used for Bundlr/Arweave uploads, NOT for signing the mint tx
    const tempKeypair = Keypair.generate();

    // Initialize Metaplex with temp keypair for metadata upload
    const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(tempKeypair));

    // Prepare metadata (NFT name max 32 chars)
    const truncatedName = businessName.length > 20 ? businessName.slice(0, 20) : businessName;
    const metadata = {
      name: `${truncatedName} - Wino`,
      symbol: 'WINO',
      description: `Business Identity NFT for ${businessName}. Created with Wino Business app.`,
      image: logoUrl || 'https://arweave.net/placeholder',
      attributes: [
        { trait_type: 'identity_type', value: 'business' },
        { trait_type: 'name', value: businessName },
        { trait_type: 'Wallet', value: ownerPubkey },
        { trait_type: 'Created', value: new Date().toISOString() },
      ],
      properties: {
        files: [
          { uri: logoUrl || 'https://arweave.net/placeholder', type: 'image/png' },
        ],
        category: 'image',
      },
    };

    console.log('[mint-tx] Uploading metadata...');

    // Upload metadata - this uses bundlr which may fail without funds
    // Fallback: use a JSON hosting approach
    let metadataUri: string;
    try {
      const uploadResult = await metaplex.nfts().uploadMetadata(metadata);
      metadataUri = uploadResult.uri;
      console.log('[mint-tx] Metadata uploaded to:', metadataUri);
    } catch (uploadError: any) {
      console.error('[mint-tx] Bundlr upload failed, using fallback:', uploadError.message);
      // Fallback: encode metadata as data URI (not ideal but works for testing)
      // In production, use a proper metadata hosting service
      const metadataJson = JSON.stringify(metadata);
      const base64 = Buffer.from(metadataJson).toString('base64');
      metadataUri = `data:application/json;base64,${base64}`;
      console.log('[mint-tx] Using data URI fallback');
    }

    // Generate a new mint keypair - this will be the NFT address
    const mintKeypair = Keypair.generate();
    const mintPubkey = mintKeypair.publicKey.toBase58();

    console.log('[mint-tx] Mint address:', mintPubkey);

    // Build the create NFT transaction using Metaplex builder
    // The builder creates the transaction without sending it
    // Note: updateAuthority must be a Signer, so we use the temp keypair
    // Since isMutable is false, the update authority doesn't matter after mint
    const txBuilder = await metaplex.nfts().builders().create({
      uri: metadataUri,
      name: metadata.name,
      symbol: metadata.symbol,
      sellerFeeBasisPoints: 0,
      isMutable: false,
      maxSupply: toBigNumber(1),
      useNewMint: mintKeypair,
      mintAuthority: metaplex.identity(),
      updateAuthority: metaplex.identity(), // Temp keypair, doesn't matter since immutable
      tokenOwner: ownerKey,
    });

    // Get the transaction from the builder
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    // Build transaction with proper payer
    const transaction = txBuilder.toTransaction({
      blockhash,
      lastValidBlockHeight,
    });

    // Set the owner as fee payer
    transaction.feePayer = ownerKey;

    // Partial sign with server keypairs:
    // - mintKeypair: New account being created (required)
    // - tempKeypair: Used as mintAuthority/updateAuthority in the Metaplex call
    transaction.partialSign(mintKeypair, tempKeypair);

    // Serialize the partially signed transaction
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    const txBase64 = serializedTx.toString('base64');

    console.log('[mint-tx] Transaction built successfully');
    console.log('[mint-tx] Transaction size:', serializedTx.length, 'bytes');

    return NextResponse.json({
      txBase64,
      mintPubkey,
      metadataUri,
      blockhash,
      lastValidBlockHeight,
    });

  } catch (error: any) {
    console.error('[mint-tx] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to build mint transaction' },
      { status: 500 }
    );
  }
}
