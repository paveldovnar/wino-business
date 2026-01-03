/**
 * Business Identity PDA System
 *
 * Uses on-chain Solana PDA for identity storage.
 * Identity is discoverable deterministically by wallet address.
 *
 * PDA seeds: ["wino_business_identity", authority_pubkey]
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from '@solana/web3.js';

// Program ID from environment or default
export const IDENTITY_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_IDENTITY_PROGRAM_ID || '6oFvAzVT24jz9BJgJUtvorLD2SEZddGFhSSLu246JVt5'
);

// PDA seed prefix (must match the on-chain program)
export const IDENTITY_SEED = Buffer.from('wino_business_identity');

// Instruction discriminators from IDL
const CREATE_IDENTITY_DISCRIMINATOR = Buffer.from([12, 253, 209, 41, 176, 51, 195, 179]);
const UPDATE_IDENTITY_DISCRIMINATOR = Buffer.from([130, 54, 88, 104, 222, 124, 238, 252]);

// Account discriminator for BusinessIdentity
const BUSINESS_IDENTITY_DISCRIMINATOR = Buffer.from([187, 189, 174, 121, 23, 105, 212, 235]);

/**
 * On-chain Business Identity data structure
 */
export interface OnChainIdentity {
  authority: PublicKey;
  identityType: number;
  name: string;
  logoUri: string;
  createdAt: number;
  updatedAt: number;
  bump: number;
}

/**
 * Result from identity lookup
 */
export interface IdentityLookupResult {
  found: boolean;
  identity: OnChainIdentity | null;
  pda: PublicKey | null;
}

/**
 * Derive the PDA address for a wallet's identity
 */
export function deriveIdentityPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [IDENTITY_SEED, authority.toBuffer()],
    IDENTITY_PROGRAM_ID
  );
}

/**
 * Fetch and decode identity from chain
 */
export async function fetchIdentity(
  connection: Connection,
  authority: PublicKey
): Promise<IdentityLookupResult> {
  const [pda] = deriveIdentityPDA(authority);

  try {
    const accountInfo = await connection.getAccountInfo(pda);

    if (!accountInfo || accountInfo.data.length === 0) {
      return { found: false, identity: null, pda };
    }

    // Verify discriminator
    const discriminator = accountInfo.data.slice(0, 8);
    if (!discriminator.equals(BUSINESS_IDENTITY_DISCRIMINATOR)) {
      console.error('[identity-pda] Invalid account discriminator');
      return { found: false, identity: null, pda };
    }

    // Decode the account data
    const identity = decodeIdentity(accountInfo.data);

    return { found: true, identity, pda };
  } catch (error) {
    console.error('[identity-pda] Failed to fetch identity:', error);
    return { found: false, identity: null, pda };
  }
}

/**
 * Decode BusinessIdentity account data
 */
function decodeIdentity(data: Buffer): OnChainIdentity {
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

  return {
    authority,
    identityType,
    name,
    logoUri,
    createdAt,
    updatedAt,
    bump,
  };
}

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
 * Build create_identity instruction
 */
export function buildCreateIdentityInstruction(
  authority: PublicKey,
  name: string,
  logoUri: string
): TransactionInstruction {
  const [identityPda] = deriveIdentityPDA(authority);

  // Encode instruction data: discriminator + name + logo_uri
  const instructionData = Buffer.concat([
    CREATE_IDENTITY_DISCRIMINATOR,
    encodeString(name),
    encodeString(logoUri),
  ]);

  return new TransactionInstruction({
    programId: IDENTITY_PROGRAM_ID,
    keys: [
      { pubkey: identityPda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData,
  });
}

/**
 * Build update_identity instruction
 */
export function buildUpdateIdentityInstruction(
  authority: PublicKey,
  name: string,
  logoUri: string
): TransactionInstruction {
  const [identityPda] = deriveIdentityPDA(authority);

  // Encode instruction data: discriminator + name + logo_uri
  const instructionData = Buffer.concat([
    UPDATE_IDENTITY_DISCRIMINATOR,
    encodeString(name),
    encodeString(logoUri),
  ]);

  return new TransactionInstruction({
    programId: IDENTITY_PROGRAM_ID,
    keys: [
      { pubkey: identityPda, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
    ],
    data: instructionData,
  });
}

/**
 * Build a transaction to create identity
 */
export async function buildCreateIdentityTransaction(
  connection: Connection,
  authority: PublicKey,
  name: string,
  logoUri: string
): Promise<Transaction> {
  const instruction = buildCreateIdentityInstruction(authority, name, logoUri);

  const transaction = new Transaction().add(instruction);

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = authority;

  return transaction;
}

/**
 * Get the Solscan link for a transaction
 */
export function getSolscanLink(signature: string, cluster: 'mainnet-beta' | 'devnet' = 'devnet'): string {
  const base = cluster === 'mainnet-beta'
    ? 'https://solscan.io/tx'
    : 'https://solscan.io/tx';
  const suffix = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `${base}/${signature}${suffix}`;
}

/**
 * Get Solscan link for an account
 */
export function getSolscanAccountLink(address: string, cluster: 'mainnet-beta' | 'devnet' = 'devnet'): string {
  const suffix = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `https://solscan.io/account/${address}${suffix}`;
}
