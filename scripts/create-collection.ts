/**
 * Admin Script: Create the Wino Business Identity Collection NFT
 *
 * This script creates a single collection NFT that all Business Identity NFTs
 * will belong to. Run this ONCE to set up the collection.
 *
 * Usage:
 *   COLLECTION_AUTHORITY_KEY="base58_private_key" npx tsx scripts/create-collection.ts
 *
 * After running, set the output mint address as:
 *   IDENTITY_COLLECTION_MINT=<mint_address>
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';

const RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

function getMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

function getMasterEditionPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer(), Buffer.from('edition')],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

function buildCreateMetadataV3Instruction(
  metadata: PublicKey,
  mint: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  updateAuthority: PublicKey,
  name: string,
  symbol: string,
  uri: string,
  isCollection: boolean
) {
  const discriminator = Buffer.from([33]);

  const data = Buffer.concat([
    discriminator,
    Buffer.from([name.length, 0, 0, 0]),
    Buffer.from(name),
    Buffer.from([symbol.length, 0, 0, 0]),
    Buffer.from(symbol),
    Buffer.from([uri.length & 0xff, (uri.length >> 8) & 0xff, 0, 0]),
    Buffer.from(uri),
    Buffer.from([0, 0]), // seller_fee_basis_points
    Buffer.from([0]), // creators = None
    Buffer.from([0]), // collection = None
    Buffer.from([0]), // uses = None
    Buffer.from([1]), // is_mutable = true (for collection updates)
    isCollection
      ? Buffer.concat([
          Buffer.from([1]), // Some(CollectionDetails)
          Buffer.from([0]), // V1 variant
          Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]), // size = 0 initially
        ])
      : Buffer.from([0]), // None
  ]);

  return {
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: mintAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: updateAuthority, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: TOKEN_METADATA_PROGRAM_ID,
    data,
  };
}

function buildCreateMasterEditionV3Instruction(
  edition: PublicKey,
  mint: PublicKey,
  updateAuthority: PublicKey,
  mintAuthority: PublicKey,
  payer: PublicKey,
  metadata: PublicKey,
  maxSupply: number | null
) {
  const discriminator = Buffer.from([17]);
  const maxSupplyData = maxSupply !== null
    ? Buffer.concat([
        Buffer.from([1]),
        Buffer.from([maxSupply & 0xff, (maxSupply >> 8) & 0xff, (maxSupply >> 16) & 0xff, (maxSupply >> 24) & 0xff, 0, 0, 0, 0]),
      ])
    : Buffer.from([0]);

  return {
    keys: [
      { pubkey: edition, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: updateAuthority, isSigner: true, isWritable: false },
      { pubkey: mintAuthority, isSigner: true, isWritable: false },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: TOKEN_METADATA_PROGRAM_ID,
    data: Buffer.concat([discriminator, maxSupplyData]),
  };
}

async function main() {
  const authorityKeyStr = process.env.COLLECTION_AUTHORITY_KEY;
  if (!authorityKeyStr) {
    console.error('ERROR: COLLECTION_AUTHORITY_KEY env var required');
    console.log('Usage: COLLECTION_AUTHORITY_KEY="base58_private_key" npx tsx scripts/create-collection.ts');
    process.exit(1);
  }

  const authority = Keypair.fromSecretKey(bs58.decode(authorityKeyStr));
  console.log('Authority wallet:', authority.publicKey.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(authority.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');

  if (balance < 0.05 * 1e9) {
    console.error('ERROR: Need at least 0.05 SOL to create collection');
    process.exit(1);
  }

  // Generate collection mint
  const collectionMint = Keypair.generate();
  console.log('Collection mint:', collectionMint.publicKey.toBase58());

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const ata = getAssociatedTokenAddressSync(collectionMint.publicKey, authority.publicKey);

  // TX1: Create mint + ATA + mint token
  const tx1 = new Transaction();
  tx1.recentBlockhash = blockhash;
  tx1.lastValidBlockHeight = lastValidBlockHeight;
  tx1.feePayer = authority.publicKey;

  tx1.add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: collectionMint.publicKey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    })
  );

  tx1.add(
    createInitializeMint2Instruction(
      collectionMint.publicKey,
      0,
      authority.publicKey,
      authority.publicKey,
      TOKEN_PROGRAM_ID
    )
  );

  tx1.add(
    createAssociatedTokenAccountInstruction(
      authority.publicKey,
      ata,
      authority.publicKey,
      collectionMint.publicKey
    )
  );

  tx1.add(
    createMintToInstruction(collectionMint.publicKey, ata, authority.publicKey, 1)
  );

  tx1.sign(authority, collectionMint);

  console.log('Sending TX1 (create mint)...');
  const tx1Sig = await connection.sendRawTransaction(tx1.serialize());
  console.log('TX1:', tx1Sig);

  await connection.confirmTransaction({ signature: tx1Sig, blockhash, lastValidBlockHeight }, 'confirmed');
  console.log('TX1 confirmed!');

  // TX2: Create metadata + master edition (as collection)
  const { blockhash: bh2, lastValidBlockHeight: lvbh2 } = await connection.getLatestBlockhash();
  const tx2 = new Transaction();
  tx2.recentBlockhash = bh2;
  tx2.lastValidBlockHeight = lvbh2;
  tx2.feePayer = authority.publicKey;

  const metadataPDA = getMetadataPDA(collectionMint.publicKey);
  const masterEditionPDA = getMasterEditionPDA(collectionMint.publicKey);

  // Short metadata URI for collection
  const collectionUri = 'https://wino.business/api/collection-metadata';

  const metadataIx = buildCreateMetadataV3Instruction(
    metadataPDA,
    collectionMint.publicKey,
    authority.publicKey,
    authority.publicKey,
    authority.publicKey,
    'Wino Business Identity',
    'WINO',
    collectionUri,
    true // isCollection = true
  );
  tx2.add({ keys: metadataIx.keys, programId: metadataIx.programId, data: metadataIx.data });

  const editionIx = buildCreateMasterEditionV3Instruction(
    masterEditionPDA,
    collectionMint.publicKey,
    authority.publicKey,
    authority.publicKey,
    authority.publicKey,
    metadataPDA,
    0
  );
  tx2.add({ keys: editionIx.keys, programId: editionIx.programId, data: editionIx.data });

  tx2.sign(authority);

  console.log('Sending TX2 (create metadata as collection)...');
  const tx2Sig = await connection.sendRawTransaction(tx2.serialize());
  console.log('TX2:', tx2Sig);

  await connection.confirmTransaction({ signature: tx2Sig, blockhash: bh2, lastValidBlockHeight: lvbh2 }, 'confirmed');
  console.log('TX2 confirmed!');

  console.log('\n========================================');
  console.log('COLLECTION CREATED SUCCESSFULLY');
  console.log('========================================');
  console.log('Collection Mint:', collectionMint.publicKey.toBase58());
  console.log('Authority:', authority.publicKey.toBase58());
  console.log('TX1:', tx1Sig);
  console.log('TX2:', tx2Sig);
  console.log('Solscan:', `https://solscan.io/token/${collectionMint.publicKey.toBase58()}`);
  console.log('\nAdd to .env.local:');
  console.log(`IDENTITY_COLLECTION_MINT=${collectionMint.publicKey.toBase58()}`);
  console.log(`COLLECTION_AUTHORITY_KEY=${authorityKeyStr}`);
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
