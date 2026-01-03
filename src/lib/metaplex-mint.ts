import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { WalletContextState } from '@/lib/wallet-mock';

export interface MintBusinessIdentityParams {
  connection: Connection;
  wallet: WalletContextState;
  businessName: string;
  logo?: string;
}

export interface MintResult {
  mintAddress: string;
  txSignature: string;
  mintedAt: number;
}

/**
 * Mint a Business Identity NFT on Solana mainnet
 *
 * Flow:
 * 1. Call server API to build unsigned transaction
 * 2. Sign transaction with connected wallet (WalletConnect prompt)
 * 3. Send signed transaction to RPC
 * 4. Wait for confirmation
 */
export async function mintBusinessIdentityNFT({
  connection,
  wallet,
  businessName,
  logo,
}: MintBusinessIdentityParams): Promise<MintResult> {
  if (!wallet.publicKey) {
    throw new Error('Wallet not connected');
  }

  if (!wallet.signTransaction) {
    throw new Error('Wallet does not support transaction signing');
  }

  if (!wallet.connected) {
    throw new Error('Wallet not connected. Please reconnect your wallet and try again.');
  }

  const ownerPubkey = wallet.publicKey.toBase58();

  console.log('[Mint] Starting NFT mint for:', businessName);
  console.log('[Mint] Owner wallet:', ownerPubkey);
  console.log('[Mint] Wallet connected:', wallet.connected);

  try {
    // Step 1: Call server API to build unsigned transaction
    console.log('[Mint] Step 1: Building transaction via API...');

    const response = await fetch('/api/identity/mint-tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName,
        logoUrl: logo,
        ownerPubkey,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    const { txBase64, mintPubkey, metadataUri } = await response.json();

    console.log('[Mint] Transaction received from server');
    console.log('[Mint] Mint address:', mintPubkey);
    console.log('[Mint] Metadata URI:', metadataUri);

    // Step 2: Deserialize and sign transaction with wallet
    console.log('[Mint] Step 2: Signing transaction with wallet...');
    console.log('[Mint] Please approve the transaction in your wallet');

    const txBuffer = Buffer.from(txBase64, 'base64');
    const transaction = Transaction.from(txBuffer);

    // Request wallet signature - this triggers WalletConnect modal
    const signedTx = await wallet.signTransaction(transaction);

    console.log('[Mint] Transaction signed successfully');

    // Step 3: Send signed transaction to RPC
    console.log('[Mint] Step 3: Sending transaction to Solana...');

    const signature = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('[Mint] Transaction sent!');
    console.log('[Mint] Signature:', signature);
    console.log('[Mint] Solscan:', 'https://solscan.io/tx/' + signature);

    // Step 4: Wait for confirmation
    console.log('[Mint] Step 4: Waiting for confirmation...');

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('[Mint] Transaction confirmed!');
    console.log('[Mint] NFT minted successfully!');
    console.log('[Mint] View NFT: https://solscan.io/token/' + mintPubkey);

    return {
      mintAddress: mintPubkey,
      txSignature: signature,
      mintedAt: Date.now(),
    };

  } catch (error: any) {
    console.error('[Mint] NFT minting failed:', error);

    // Provide user-friendly error messages
    if (error.message?.includes('insufficient funds') || error.message?.includes('Insufficient')) {
      throw new Error('Insufficient SOL balance. Please ensure you have at least 0.02 SOL for minting.');
    }

    if (error.message?.includes('User rejected') || error.message?.includes('rejected')) {
      throw new Error('Transaction cancelled by user');
    }

    if (error.message?.includes('blockhash') || error.message?.includes('expired')) {
      throw new Error('Network timeout. Please try again.');
    }

    if (error.message?.includes('not connected')) {
      throw new Error('Wallet disconnected. Please reconnect and try again.');
    }

    throw new Error(`Failed to mint NFT: ${error.message || 'Unknown error'}`);
  }
}
