import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

export const dynamic = 'force-dynamic';

const RPC_URL = process.env.HELIUS_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Token Metadata Program ID (Metaplex)
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

interface MintTxRequest {
  businessName: string;
  logoUrl?: string;
  ownerPubkey: string;
}

/**
 * Derive the metadata PDA for a mint
 */
function getMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive the master edition PDA for a mint
 */
function getMasterEditionPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from('edition'),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Build CreateMetadataAccountV3 instruction manually
 * This avoids dependency issues with different mpl-token-metadata versions
 */
function buildCreateMetadataV3Instruction(
  metadata: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string,
  creators: { address: PublicKey; verified: boolean; share: number }[] | null,
  sellerFeeBasisPoints: number,
  isMutable: boolean
): TransactionInstruction {
  // Instruction discriminator for CreateMetadataAccountV3 = 33
  const discriminator = Buffer.from([33]);

  // Serialize the data
  const nameBuffer = Buffer.from(name.slice(0, 32).padEnd(32, '\0'));
  const symbolBuffer = Buffer.from(symbol.slice(0, 10).padEnd(10, '\0'));
  const uriBuffer = Buffer.from(uri.slice(0, 200));

  // Build data payload
  // Format: discriminator + DataV2 struct + isMutable + collectionDetails (null)
  const data = Buffer.concat([
    discriminator,
    // name (string with length prefix)
    Buffer.from([name.length, 0, 0, 0]),
    Buffer.from(name),
    // symbol (string with length prefix)
    Buffer.from([symbol.length, 0, 0, 0]),
    Buffer.from(symbol),
    // uri (string with length prefix)
    Buffer.from([uri.length & 0xff, (uri.length >> 8) & 0xff, 0, 0]),
    Buffer.from(uri),
    // seller_fee_basis_points (u16)
    Buffer.from([sellerFeeBasisPoints & 0xff, (sellerFeeBasisPoints >> 8) & 0xff]),
    // creators (Option<Vec<Creator>>)
    creators
      ? Buffer.concat([
          Buffer.from([1]), // Some
          Buffer.from([creators.length, 0, 0, 0]), // Vec length
          ...creators.map(c =>
            Buffer.concat([
              c.address.toBuffer(),
              Buffer.from([c.verified ? 1 : 0]),
              Buffer.from([c.share]),
            ])
          ),
        ])
      : Buffer.from([0]), // None
    // collection (Option<Collection>) - None
    Buffer.from([0]),
    // uses (Option<Uses>) - None
    Buffer.from([0]),
    // is_mutable
    Buffer.from([isMutable ? 1 : 0]),
    // collection_details (Option<CollectionDetails>) - None
    Buffer.from([0]),
  ]);

  const keys = [
    { pubkey: metadata, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: mintAuthority, isSigner: true, isWritable: false },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: updateAuthority, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: TOKEN_METADATA_PROGRAM_ID,
    data,
  });
}

/**
 * Build CreateMasterEditionV3 instruction manually
 */
function buildCreateMasterEditionV3Instruction(
  edition: PublicKey,
  mint: PublicKey,
  updateAuthority: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  metadata: PublicKey,
  maxSupply: number | null
): TransactionInstruction {
  // Instruction discriminator for CreateMasterEditionV3 = 17
  const discriminator = Buffer.from([17]);

  // maxSupply is Option<u64>
  const maxSupplyData =
    maxSupply !== null
      ? Buffer.concat([
          Buffer.from([1]), // Some
          Buffer.from([
            maxSupply & 0xff,
            (maxSupply >> 8) & 0xff,
            (maxSupply >> 16) & 0xff,
            (maxSupply >> 24) & 0xff,
            0,
            0,
            0,
            0,
          ]),
        ])
      : Buffer.from([0]); // None

  const data = Buffer.concat([discriminator, maxSupplyData]);

  const keys = [
    { pubkey: edition, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: updateAuthority, isSigner: true, isWritable: false },
    { pubkey: mintAuthority, isSigner: true, isWritable: false },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: metadata, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: TOKEN_METADATA_PROGRAM_ID,
    data,
  });
}

/**
 * POST /api/identity/mint-tx
 * Build TWO unsigned transactions for NFT minting:
 *
 * TX1: Create mint account + ATA + mint 1 token
 * TX2: Create metadata + master edition
 *
 * This splits the work to keep each TX under 1232 bytes.
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

    console.log('[mint-tx] Building split mint transactions for:', businessName);
    console.log('[mint-tx] Owner:', ownerPubkey);

    // Connect to Solana
    const connection = new Connection(RPC_URL, 'confirmed');

    // Generate mint keypair (this will be the NFT address)
    const mintKeypair = Keypair.generate();
    const mintPubkey = mintKeypair.publicKey;

    console.log('[mint-tx] Mint address:', mintPubkey.toBase58());

    // Prepare metadata - keep it SHORT to stay under 1232 bytes
    const truncatedName = businessName.length > 16 ? businessName.slice(0, 16) : businessName;
    const nftName = `${truncatedName} - Wino`;
    const symbol = 'WINO';

    // Use a short metadata URI (external hosting recommended for production)
    // For now, use a minimal data URI that fits within transaction limits
    const minimalMetadata = {
      name: nftName,
      symbol: symbol,
      image: logoUrl || '',
    };
    const metadataUri = `data:,${encodeURIComponent(JSON.stringify(minimalMetadata))}`;

    console.log('[mint-tx] Metadata URI length:', metadataUri.length);

    // Get blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    // Calculate rent for mint account
    const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

    // Get ATA address
    const ata = getAssociatedTokenAddressSync(mintPubkey, ownerKey);

    // ========================================
    // TX1: Create Mint + ATA + Mint 1 Token
    // ========================================
    const tx1 = new Transaction();
    tx1.recentBlockhash = blockhash;
    tx1.lastValidBlockHeight = lastValidBlockHeight;
    tx1.feePayer = ownerKey;

    // 1. Create mint account
    tx1.add(
      SystemProgram.createAccount({
        fromPubkey: ownerKey,
        newAccountPubkey: mintPubkey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    // 2. Initialize mint (0 decimals for NFT, owner is mint authority)
    tx1.add(
      createInitializeMint2Instruction(
        mintPubkey,
        0, // decimals
        ownerKey, // mint authority
        ownerKey, // freeze authority
        TOKEN_PROGRAM_ID
      )
    );

    // 3. Create ATA for owner
    tx1.add(
      createAssociatedTokenAccountInstruction(
        ownerKey, // payer
        ata, // ata address
        ownerKey, // owner
        mintPubkey // mint
      )
    );

    // 4. Mint 1 token to owner's ATA
    tx1.add(
      createMintToInstruction(
        mintPubkey, // mint
        ata, // destination
        ownerKey, // authority
        1 // amount (1 for NFT)
      )
    );

    // Partially sign TX1 with mint keypair (it's a new account)
    tx1.partialSign(mintKeypair);

    const tx1Serialized = tx1.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const tx1Base64 = tx1Serialized.toString('base64');

    console.log('[mint-tx] TX1 size:', tx1Serialized.length, 'bytes');

    // ========================================
    // TX2: Create Metadata + Master Edition
    // ========================================
    const tx2 = new Transaction();
    tx2.recentBlockhash = blockhash;
    tx2.lastValidBlockHeight = lastValidBlockHeight;
    tx2.feePayer = ownerKey;

    const metadataPDA = getMetadataPDA(mintPubkey);
    const masterEditionPDA = getMasterEditionPDA(mintPubkey);

    // 1. Create metadata account
    tx2.add(
      buildCreateMetadataV3Instruction(
        metadataPDA,
        mintPubkey,
        ownerKey, // mint authority
        ownerKey, // payer
        ownerKey, // update authority
        nftName,
        symbol,
        metadataUri,
        [
          {
            address: ownerKey,
            verified: true,
            share: 100,
          },
        ],
        0, // seller fee basis points
        false // is mutable
      )
    );

    // 2. Create master edition (makes it a true NFT with max supply 0)
    tx2.add(
      buildCreateMasterEditionV3Instruction(
        masterEditionPDA,
        mintPubkey,
        ownerKey, // update authority
        ownerKey, // mint authority
        ownerKey, // payer
        metadataPDA,
        0 // maxSupply = 0 for unique NFT
      )
    );

    // TX2 doesn't need mint keypair signature - owner signs as mint authority
    const tx2Serialized = tx2.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    const tx2Base64 = tx2Serialized.toString('base64');

    console.log('[mint-tx] TX2 size:', tx2Serialized.length, 'bytes');

    // Validate sizes
    if (tx1Serialized.length > 1232) {
      console.error('[mint-tx] TX1 too large:', tx1Serialized.length);
      return NextResponse.json(
        { error: `TX1 too large: ${tx1Serialized.length} > 1232 bytes` },
        { status: 500 }
      );
    }

    if (tx2Serialized.length > 1232) {
      console.error('[mint-tx] TX2 too large:', tx2Serialized.length);
      return NextResponse.json(
        { error: `TX2 too large: ${tx2Serialized.length} > 1232 bytes` },
        { status: 500 }
      );
    }

    console.log('[mint-tx] Both transactions built successfully');

    return NextResponse.json({
      tx1Base64,
      tx2Base64,
      mintAddress: mintPubkey.toBase58(),
      metadataUri,
      ata: ata.toBase58(),
      debug: {
        tx1Size: tx1Serialized.length,
        tx2Size: tx2Serialized.length,
        blockhash,
        lastValidBlockHeight,
      },
    });

  } catch (error: any) {
    console.error('[mint-tx] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to build mint transactions' },
      { status: 500 }
    );
  }
}
