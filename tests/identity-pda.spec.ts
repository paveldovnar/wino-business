import { test, expect } from '@playwright/test';
import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import bs58 from 'bs58';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_IDENTITY_PROGRAM_ID || '6oFvAzVT24jz9BJgJUtvorLD2SEZddGFhSSLu246JVt5');

// Test wallet for devnet testing
const TEST_PAYER_PRIVATE_KEY = process.env.TEST_PAYER_PRIVATE_KEY;

// PDA seed
const IDENTITY_SEED = Buffer.from('wino_business_identity');

// Instruction discriminators from IDL
const CREATE_IDENTITY_DISCRIMINATOR = Buffer.from([12, 253, 209, 41, 176, 51, 195, 179]);
const BUSINESS_IDENTITY_DISCRIMINATOR = Buffer.from([187, 189, 174, 121, 23, 105, 212, 235]);

/**
 * Encode a string for Borsh serialization (4 byte length prefix + data)
 */
function encodeString(str: string): Buffer {
  const strBuffer = Buffer.from(str, 'utf8');
  const lenBuffer = Buffer.alloc(4);
  lenBuffer.writeUInt32LE(strBuffer.length);
  return Buffer.concat([lenBuffer, strBuffer]);
}

/**
 * Derive the PDA address for a wallet's identity
 */
function deriveIdentityPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [IDENTITY_SEED, authority.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Decode BusinessIdentity account data
 */
function decodeIdentity(data: Buffer): any {
  let offset = 8; // Skip discriminator

  // authority: Pubkey (32 bytes)
  const authority = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  // identity_type: u8 (1 byte)
  const identityType = data.readUInt8(offset);
  offset += 1;

  // name: String (4 bytes length + data)
  const nameLen = data.readUInt32LE(offset);
  offset += 4;
  const name = data.slice(offset, offset + nameLen).toString('utf8');
  offset += nameLen;

  // logo_uri: String (4 bytes length + data)
  const logoUriLen = data.readUInt32LE(offset);
  offset += 4;
  const logoUri = data.slice(offset, offset + logoUriLen).toString('utf8');
  offset += logoUriLen;

  // created_at: i64 (8 bytes)
  const createdAt = Number(data.readBigInt64LE(offset));
  offset += 8;

  // updated_at: i64 (8 bytes)
  const updatedAt = Number(data.readBigInt64LE(offset));
  offset += 8;

  // bump: u8 (1 byte)
  const bump = data.readUInt8(offset);

  return { authority: authority.toBase58(), identityType, name, logoUri, createdAt, updatedAt, bump };
}

test.describe('Identity PDA Tests', () => {
  test('PDA derivation is deterministic', async () => {
    const testWallet = new PublicKey('GZLwCRw2Q2NMBrKyH8dNDYzQwgnf1H4btwrcESoW3HeT');

    // Derive PDA twice and verify it's the same
    const [pda1, bump1] = deriveIdentityPDA(testWallet);
    const [pda2, bump2] = deriveIdentityPDA(testWallet);

    expect(pda1.toBase58()).toBe(pda2.toBase58());
    expect(bump1).toBe(bump2);

    console.log('[test] Test wallet:', testWallet.toBase58());
    console.log('[test] Identity PDA:', pda1.toBase58());
    console.log('[test] Bump:', bump1);
  });

  test('program is deployed on devnet', async () => {
    const connection = new Connection(RPC_URL, 'confirmed');

    // Check if program exists
    const accountInfo = await connection.getAccountInfo(PROGRAM_ID);

    expect(accountInfo).not.toBeNull();
    expect(accountInfo?.executable).toBe(true);

    console.log('[test] Program ID:', PROGRAM_ID.toBase58());
    console.log('[test] Program deployed: YES');
    console.log('[test] Program data length:', accountInfo?.data.length, 'bytes');
  });

  test('create identity on-chain', async () => {
    if (!TEST_PAYER_PRIVATE_KEY) {
      console.log('[test] Skipping - no test wallet configured');
      test.skip();
      return;
    }

    // Create payer keypair from private key
    const payerSecretKey = bs58.decode(TEST_PAYER_PRIVATE_KEY);
    const payer = Keypair.fromSecretKey(payerSecretKey);

    console.log('[test] Test wallet:', payer.publicKey.toBase58());

    // Derive PDA
    const [identityPda, bump] = deriveIdentityPDA(payer.publicKey);
    console.log('[test] Identity PDA:', identityPda.toBase58());
    console.log('[test] Bump:', bump);

    const connection = new Connection(RPC_URL, 'confirmed');

    // Check if identity already exists
    const existingAccount = await connection.getAccountInfo(identityPda);
    if (existingAccount) {
      console.log('[test] Identity already exists, decoding...');
      const identity = decodeIdentity(existingAccount.data);
      console.log('[test] Existing identity:', JSON.stringify(identity, null, 2));

      // Verify it's our identity
      expect(identity.authority).toBe(payer.publicKey.toBase58());
      console.log('[test] Identity verified for our wallet!');

      console.log('\n========================================');
      console.log('IDENTITY PDA TEST SUMMARY');
      console.log('========================================');
      console.log('Authority:', payer.publicKey.toBase58());
      console.log('Identity PDA:', identityPda.toBase58());
      console.log('Name:', identity.name);
      console.log('Created At:', new Date(identity.createdAt * 1000).toISOString());
      console.log('Solscan:', `https://solscan.io/account/${identityPda.toBase58()}?cluster=devnet`);
      console.log('========================================\n');

      return;
    }

    // Identity doesn't exist, create it
    const name = 'Test Coffee Shop';
    const logoUri = '';

    console.log('[test] Creating identity with name:', name);

    // Build instruction data
    const instructionData = Buffer.concat([
      CREATE_IDENTITY_DISCRIMINATOR,
      encodeString(name),
      encodeString(logoUri),
    ]);

    // Build instruction
    const createIdentityIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: identityPda, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });

    // Build transaction
    const transaction = new Transaction().add(createIdentityIx);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = payer.publicKey;

    // Sign and send
    transaction.sign(payer);

    console.log('[test] Sending transaction...');
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('[test] Transaction sent:', signature);
    console.log('[test] Solscan TX:', `https://solscan.io/tx/${signature}?cluster=devnet`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('[test] Transaction confirmed!');

    // Fetch the created identity
    const newAccount = await connection.getAccountInfo(identityPda);
    expect(newAccount).not.toBeNull();

    const identity = decodeIdentity(newAccount!.data);
    console.log('[test] Created identity:', JSON.stringify(identity, null, 2));

    // Verify
    expect(identity.authority).toBe(payer.publicKey.toBase58());
    expect(identity.name).toBe(name);
    expect(identity.identityType).toBe(1);

    console.log('\n========================================');
    console.log('IDENTITY PDA TEST SUMMARY');
    console.log('========================================');
    console.log('Authority:', payer.publicKey.toBase58());
    console.log('Identity PDA:', identityPda.toBase58());
    console.log('Name:', identity.name);
    console.log('TX Signature:', signature);
    console.log('Solscan TX:', `https://solscan.io/tx/${signature}?cluster=devnet`);
    console.log('Solscan PDA:', `https://solscan.io/account/${identityPda.toBase58()}?cluster=devnet`);
    console.log('STATUS: SUCCESS');
    console.log('========================================\n');
  });
});
