/**
 * Business Identity System
 *
 * Uses Arweave for permanent, decentralized identity storage.
 * Identity is discoverable by wallet address without localStorage.
 *
 * Flow:
 * 1. User signs a message to prove wallet ownership
 * 2. Logo is uploaded to Arweave (returns ar:// URI)
 * 3. Identity JSON is uploaded to Arweave with wallet tag
 * 4. On reconnect, query Arweave by wallet tag to find identity
 */

export interface BusinessIdentity {
  version: number;
  identity_type: 'business';
  name: string;
  logo_uri: string | null; // ar://... or null if no logo
  owner: string; // Wallet public key (base58)
  created_at: number; // Unix timestamp in seconds
  arweave_tx_id?: string; // Transaction ID on Arweave
}

export interface CreateIdentityParams {
  walletAddress: string;
  name: string;
  logoDataUrl?: string; // Base64 data URL of logo
  signature: string; // Wallet signature proving ownership
  message: string; // Message that was signed
}

export interface IdentityLookupResult {
  found: boolean;
  identity: BusinessIdentity | null;
  arweave_tx_id: string | null;
}

/**
 * Derive a deterministic "address" for identity lookup
 * This mimics PDA behavior - same wallet always gets same lookup key
 */
export function deriveIdentityKey(walletAddress: string): string {
  return `wino_identity_${walletAddress}`;
}

/**
 * Generate the message for wallet signing
 * This proves the user owns the wallet
 */
export function generateSignMessage(walletAddress: string, timestamp: number): string {
  return `Create Wino Business Identity\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\n\nSign this message to create your business identity on Arweave.`;
}

/**
 * Validate a signed message
 */
export async function verifySignature(
  message: string,
  signature: string,
  walletAddress: string
): Promise<boolean> {
  try {
    const { PublicKey } = await import('@solana/web3.js');
    const nacl = await import('tweetnacl');
    const bs58 = await import('bs58');

    const publicKey = new PublicKey(walletAddress);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.default.decode(signature);

    return nacl.default.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKey.toBytes()
    );
  } catch (error) {
    console.error('[identity] Signature verification failed:', error);
    return false;
  }
}
