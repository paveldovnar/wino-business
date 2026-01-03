import { test, expect } from '@playwright/test';
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';

const APP_URL = process.env.APP_URL || 'https://wino-business.vercel.app';
const API_BASE = process.env.API_BASE || APP_URL;
const RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

const TEST_PAYER_PRIVATE_KEY = process.env.TEST_PAYER_PRIVATE_KEY;

// Token Metadata Program ID (Metaplex)
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

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
  const discriminator = Buffer.from([33]);

  const data = Buffer.concat([
    discriminator,
    Buffer.from([name.length, 0, 0, 0]),
    Buffer.from(name),
    Buffer.from([symbol.length, 0, 0, 0]),
    Buffer.from(symbol),
    Buffer.from([uri.length & 0xff, (uri.length >> 8) & 0xff, 0, 0]),
    Buffer.from(uri),
    Buffer.from([sellerFeeBasisPoints & 0xff, (sellerFeeBasisPoints >> 8) & 0xff]),
    creators
      ? Buffer.concat([
          Buffer.from([1]),
          Buffer.from([creators.length, 0, 0, 0]),
          ...creators.map(c =>
            Buffer.concat([
              c.address.toBuffer(),
              Buffer.from([c.verified ? 1 : 0]),
              Buffer.from([c.share]),
            ])
          ),
        ])
      : Buffer.from([0]),
    Buffer.from([0]), // collection
    Buffer.from([0]), // uses
    Buffer.from([isMutable ? 1 : 0]),
    Buffer.from([0]), // collection_details
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
  const discriminator = Buffer.from([17]);

  const maxSupplyData =
    maxSupply !== null
      ? Buffer.concat([
          Buffer.from([1]),
          Buffer.from([
            maxSupply & 0xff,
            (maxSupply >> 8) & 0xff,
            (maxSupply >> 16) & 0xff,
            (maxSupply >> 24) & 0xff,
            0, 0, 0, 0,
          ]),
        ])
      : Buffer.from([0]);

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

test.describe('NFT Identity Tests (Two-Transaction Flow)', () => {
  test('verify API works for known NFT', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/identity/verify?mint=invalid`);
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toBe('Invalid mint address format');
  });

  test.skip(!TEST_PAYER_PRIVATE_KEY, 'Skipping: TEST_PAYER_PRIVATE_KEY not set');

  test('mint NFT using two-transaction flow (TX1: mint, TX2: metadata)', async ({ request }) => {
    if (!TEST_PAYER_PRIVATE_KEY) {
      console.log('[test] Skipping - no test wallet configured');
      return;
    }

    const payerSecretKey = bs58.decode(TEST_PAYER_PRIVATE_KEY);
    const payer = Keypair.fromSecretKey(payerSecretKey);

    console.log('[test] Payer wallet:', payer.publicKey.toBase58());

    const connection = new Connection(RPC_URL, 'confirmed');

    const balance = await connection.getBalance(payer.publicKey);
    const solBalance = balance / 1_000_000_000;
    console.log('[test] SOL balance:', solBalance);

    if (solBalance < 0.02) {
      console.log('[test] Insufficient SOL for minting (need ~0.02 SOL)');
      test.skip(true, 'Insufficient SOL balance for NFT mint');
      return;
    }

    const mintKeypair = Keypair.generate();
    const mintPubkey = mintKeypair.publicKey;

    console.log('[test] Mint address:', mintPubkey.toBase58());

    const businessName = 'Test2TX' + Date.now().toString().slice(-6);
    const nftName = `${businessName} - Wino`;
    const symbol = 'WINO';

    const minimalMetadata = { name: nftName, symbol, image: '' };
    const metadataUri = `data:,${encodeURIComponent(JSON.stringify(minimalMetadata))}`;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    const ata = getAssociatedTokenAddressSync(mintPubkey, payer.publicKey);

    console.log('[test] Building TX1 (create mint + ATA + mint token)...');

    // TX1: Create Mint + ATA + Mint 1 Token
    const tx1 = new Transaction();
    tx1.recentBlockhash = blockhash;
    tx1.lastValidBlockHeight = lastValidBlockHeight;
    tx1.feePayer = payer.publicKey;

    tx1.add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintPubkey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    tx1.add(
      createInitializeMint2Instruction(mintPubkey, 0, payer.publicKey, payer.publicKey, TOKEN_PROGRAM_ID)
    );

    tx1.add(
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, payer.publicKey, mintPubkey)
    );

    tx1.add(createMintToInstruction(mintPubkey, ata, payer.publicKey, 1));

    tx1.sign(payer, mintKeypair);

    const tx1Serialized = tx1.serialize();
    console.log('[test] TX1 size:', tx1Serialized.length, 'bytes');
    expect(tx1Serialized.length).toBeLessThanOrEqual(1232);

    console.log('[test] Sending TX1...');
    const tx1Signature = await connection.sendRawTransaction(tx1Serialized, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('[test] TX1 sent:', tx1Signature);
    console.log('[test] Solscan TX1:', 'https://solscan.io/tx/' + tx1Signature);

    const { blockhash: bh1, lastValidBlockHeight: lvbh1 } = await connection.getLatestBlockhash();
    const confirmation1 = await connection.confirmTransaction({
      signature: tx1Signature,
      blockhash: bh1,
      lastValidBlockHeight: lvbh1,
    }, 'confirmed');

    expect(confirmation1.value.err).toBeNull();
    console.log('[test] TX1 confirmed!');

    const { blockhash: blockhash2, lastValidBlockHeight: lvbh2 } = await connection.getLatestBlockhash();

    console.log('[test] Building TX2 (create metadata + master edition)...');

    // TX2: Create Metadata + Master Edition
    const tx2 = new Transaction();
    tx2.recentBlockhash = blockhash2;
    tx2.lastValidBlockHeight = lvbh2;
    tx2.feePayer = payer.publicKey;

    const metadataPDA = getMetadataPDA(mintPubkey);
    const masterEditionPDA = getMasterEditionPDA(mintPubkey);

    tx2.add(
      buildCreateMetadataV3Instruction(
        metadataPDA,
        mintPubkey,
        payer.publicKey,
        payer.publicKey,
        payer.publicKey,
        nftName,
        symbol,
        metadataUri,
        [{ address: payer.publicKey, verified: true, share: 100 }],
        0,
        false
      )
    );

    tx2.add(
      buildCreateMasterEditionV3Instruction(
        masterEditionPDA,
        mintPubkey,
        payer.publicKey,
        payer.publicKey,
        payer.publicKey,
        metadataPDA,
        0
      )
    );

    tx2.sign(payer);

    const tx2Serialized = tx2.serialize();
    console.log('[test] TX2 size:', tx2Serialized.length, 'bytes');
    expect(tx2Serialized.length).toBeLessThanOrEqual(1232);

    console.log('[test] Sending TX2...');
    const tx2Signature = await connection.sendRawTransaction(tx2Serialized, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('[test] TX2 sent:', tx2Signature);
    console.log('[test] Solscan TX2:', 'https://solscan.io/tx/' + tx2Signature);

    const { blockhash: bh2, lastValidBlockHeight: lvbh2_2 } = await connection.getLatestBlockhash();
    const confirmation2 = await connection.confirmTransaction({
      signature: tx2Signature,
      blockhash: bh2,
      lastValidBlockHeight: lvbh2_2,
    }, 'confirmed');

    expect(confirmation2.value.err).toBeNull();
    console.log('[test] TX2 confirmed!');

    console.log('[test] Waiting for API indexing...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('[test] Verifying via API...');
    const verifyResponse = await request.get(`${API_BASE}/api/identity/verify?mint=${mintPubkey.toBase58()}`);
    const verifyData = await verifyResponse.json();

    console.log('[test] Verify response:', verifyData);

    console.log('\n========================================');
    console.log('TWO-TRANSACTION NFT MINT TEST SUMMARY');
    console.log('========================================');
    console.log('Business Name:', businessName);
    console.log('Mint Address:', mintPubkey.toBase58());
    console.log('TX1 (mint+ATA):', tx1Signature);
    console.log('TX2 (metadata):', tx2Signature);
    console.log('TX1 Size:', tx1Serialized.length, 'bytes');
    console.log('TX2 Size:', tx2Serialized.length, 'bytes');
    console.log('Verified:', verifyData.verified);
    console.log('Solscan NFT:', 'https://solscan.io/token/' + mintPubkey.toBase58());
    console.log('========================================\n');

    expect(verifyData.verified).toBe(true);
    expect(verifyData.nft.mint).toBe(mintPubkey.toBase58());
    expect(verifyData.nft.symbol).toBe('WINO');
  });

  test('test API endpoint returns two transactions under 1232 bytes', async ({ request }) => {
    if (!TEST_PAYER_PRIVATE_KEY) {
      console.log('[test] Skipping - no test wallet configured');
      return;
    }

    const payerSecretKey = bs58.decode(TEST_PAYER_PRIVATE_KEY);
    const payer = Keypair.fromSecretKey(payerSecretKey);

    const response = await request.post(`${API_BASE}/api/identity/mint-tx`, {
      data: {
        businessName: 'APITest' + Date.now().toString().slice(-6),
        ownerPubkey: payer.publicKey.toBase58(),
      },
    });

    expect(response.ok()).toBe(true);

    const data = await response.json();

    console.log('[test] API Response:');
    console.log('  - TX1 Size:', data.debug?.tx1Size, 'bytes');
    console.log('  - TX2 Size:', data.debug?.tx2Size, 'bytes');
    console.log('  - Mint Address:', data.mintAddress);

    expect(data.tx1Base64).toBeTruthy();
    expect(data.tx2Base64).toBeTruthy();
    expect(data.mintAddress).toBeTruthy();

    expect(data.debug.tx1Size).toBeLessThanOrEqual(1232);
    expect(data.debug.tx2Size).toBeLessThanOrEqual(1232);

    console.log('[test] API endpoint test PASSED');
  });
});
