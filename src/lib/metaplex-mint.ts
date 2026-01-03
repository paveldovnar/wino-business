import { Connection, Transaction } from '@solana/web3.js';
import { WalletContextState } from '@/lib/wallet-mock';

export interface MintBusinessIdentityParams {
  connection: Connection;
  wallet: WalletContextState;
  businessName: string;
  logo?: string;
  onProgress?: (step: MintStep, message: string) => void;
}

export type MintStep =
  | 'preparing'
  | 'building'
  | 'signing_tx1'
  | 'confirming_tx1'
  | 'signing_tx2'
  | 'confirming_tx2'
  | 'verifying'
  | 'complete'
  | 'partial_failure';

export interface MintResult {
  mintAddress: string;
  tx1Signature: string;
  tx2Signature: string;
  mintedAt: number;
  verified: boolean;
}

export interface PartialMintState {
  mintAddress: string;
  tx1Signature: string;
  tx1Confirmed: boolean;
  tx2Pending: boolean;
}

/**
 * Mint a Business Identity NFT on Solana mainnet
 *
 * Flow (split into 2 transactions to stay under 1232 bytes each):
 * 1. Call server API to build unsigned TX1 and TX2
 * 2. Sign TX1 with wallet, send, wait for confirmation
 * 3. Sign TX2 with wallet, send, wait for confirmation
 * 4. Verify on-chain
 *
 * If TX1 succeeds but TX2 fails, returns partial state for retry.
 */
export async function mintBusinessIdentityNFT({
  connection,
  wallet,
  businessName,
  logo,
  onProgress,
}: MintBusinessIdentityParams): Promise<MintResult> {
  const report = (step: MintStep, message: string) => {
    console.log(`[Mint] ${step}: ${message}`);
    onProgress?.(step, message);
  };

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

  report('preparing', 'Preparing NFT mint...');
  console.log('[Mint] Starting NFT mint for:', businessName);
  console.log('[Mint] Owner wallet:', ownerPubkey);

  try {
    // Step 1: Call server API to build both transactions
    report('building', 'Building mint transactions...');

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

    const { tx1Base64, tx2Base64, mintAddress, metadataUri, debug } = await response.json();

    console.log('[Mint] Transactions received from server');
    console.log('[Mint] Mint address:', mintAddress);
    console.log('[Mint] TX1 size:', debug?.tx1Size, 'bytes');
    console.log('[Mint] TX2 size:', debug?.tx2Size, 'bytes');

    // Step 2: Sign and send TX1 (Create mint + ATA + mint token)
    report('signing_tx1', 'Please approve TX1 in your wallet (create mint)...');

    const tx1Buffer = Buffer.from(tx1Base64, 'base64');
    const tx1 = Transaction.from(tx1Buffer);

    console.log('[Mint] Requesting TX1 signature...');
    const signedTx1 = await wallet.signTransaction(tx1);

    console.log('[Mint] TX1 signed, sending to network...');
    report('confirming_tx1', 'Confirming TX1 on Solana...');

    const tx1Signature = await connection.sendRawTransaction(signedTx1.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('[Mint] TX1 sent:', tx1Signature);
    console.log('[Mint] Solscan TX1:', 'https://solscan.io/tx/' + tx1Signature);

    // Wait for TX1 confirmation
    const { blockhash: bh1, lastValidBlockHeight: lvbh1 } = await connection.getLatestBlockhash();
    const confirmation1 = await connection.confirmTransaction({
      signature: tx1Signature,
      blockhash: bh1,
      lastValidBlockHeight: lvbh1,
    }, 'confirmed');

    if (confirmation1.value.err) {
      throw new Error(`TX1 failed: ${JSON.stringify(confirmation1.value.err)}`);
    }

    console.log('[Mint] TX1 confirmed!');

    // Step 3: Sign and send TX2 (Create metadata + master edition)
    report('signing_tx2', 'Please approve TX2 in your wallet (create metadata)...');

    const tx2Buffer = Buffer.from(tx2Base64, 'base64');
    const tx2 = Transaction.from(tx2Buffer);

    console.log('[Mint] Requesting TX2 signature...');
    let signedTx2: Transaction;
    try {
      signedTx2 = await wallet.signTransaction(tx2);
    } catch (signError: any) {
      // TX1 succeeded but TX2 signing failed
      console.error('[Mint] TX2 signing failed:', signError);
      const partialError = new Error(
        `Mint created but metadata signing failed. TX1: ${tx1Signature}. Please retry metadata.`
      );
      (partialError as any).partialState = {
        mintAddress,
        tx1Signature,
        tx1Confirmed: true,
        tx2Pending: true,
      };
      throw partialError;
    }

    console.log('[Mint] TX2 signed, sending to network...');
    report('confirming_tx2', 'Confirming TX2 on Solana...');

    let tx2Signature: string;
    try {
      tx2Signature = await connection.sendRawTransaction(signedTx2.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    } catch (sendError: any) {
      console.error('[Mint] TX2 send failed:', sendError);
      const partialError = new Error(
        `Mint created but metadata transaction failed: ${sendError.message}. TX1: ${tx1Signature}`
      );
      (partialError as any).partialState = {
        mintAddress,
        tx1Signature,
        tx1Confirmed: true,
        tx2Pending: true,
      };
      throw partialError;
    }

    console.log('[Mint] TX2 sent:', tx2Signature);
    console.log('[Mint] Solscan TX2:', 'https://solscan.io/tx/' + tx2Signature);

    // Wait for TX2 confirmation
    const { blockhash: bh2, lastValidBlockHeight: lvbh2 } = await connection.getLatestBlockhash();
    const confirmation2 = await connection.confirmTransaction({
      signature: tx2Signature,
      blockhash: bh2,
      lastValidBlockHeight: lvbh2,
    }, 'confirmed');

    if (confirmation2.value.err) {
      const partialError = new Error(
        `Metadata transaction failed: ${JSON.stringify(confirmation2.value.err)}. TX1: ${tx1Signature}`
      );
      (partialError as any).partialState = {
        mintAddress,
        tx1Signature,
        tx1Confirmed: true,
        tx2Pending: true,
      };
      throw partialError;
    }

    console.log('[Mint] TX2 confirmed!');

    // Step 4: Verify on-chain
    report('verifying', 'Verifying NFT on-chain...');

    let verified = false;
    try {
      const verifyRes = await fetch(`/api/identity/verify?mint=${mintAddress}`);
      const verifyData = await verifyRes.json();
      verified = verifyData.verified === true;
      console.log('[Mint] On-chain verification:', verified ? 'SUCCESS' : 'PENDING');
    } catch (verifyError) {
      console.warn('[Mint] Verification check failed:', verifyError);
      // Don't throw - both TXs confirmed, just verification API failed
    }

    report('complete', 'NFT minted successfully!');

    console.log('[Mint] ========================================');
    console.log('[Mint] NFT MINT COMPLETE');
    console.log('[Mint] Mint Address:', mintAddress);
    console.log('[Mint] TX1:', tx1Signature);
    console.log('[Mint] TX2:', tx2Signature);
    console.log('[Mint] Verified:', verified);
    console.log('[Mint] Solscan:', 'https://solscan.io/token/' + mintAddress);
    console.log('[Mint] ========================================');

    return {
      mintAddress,
      tx1Signature,
      tx2Signature,
      mintedAt: Date.now(),
      verified,
    };

  } catch (error: any) {
    console.error('[Mint] NFT minting failed:', error);

    // Check for partial state
    if (error.partialState) {
      throw error; // Re-throw with partial state attached
    }

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

/**
 * Retry TX2 (metadata) for a partially minted NFT
 * This is called when TX1 succeeded but TX2 failed
 */
export async function retryMetadataTransaction({
  connection,
  wallet,
  mintAddress,
  businessName,
  logo,
  onProgress,
}: {
  connection: Connection;
  wallet: WalletContextState;
  mintAddress: string;
  businessName: string;
  logo?: string;
  onProgress?: (step: MintStep, message: string) => void;
}): Promise<{ tx2Signature: string; verified: boolean }> {
  const report = (step: MintStep, message: string) => {
    console.log(`[Mint Retry] ${step}: ${message}`);
    onProgress?.(step, message);
  };

  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected');
  }

  // For retry, we need to rebuild TX2 with a fresh blockhash
  // This requires a new API endpoint or the ability to build TX2 separately
  // For now, throw an informative error
  throw new Error(
    'Metadata retry not yet implemented. Please contact support with your mint address: ' + mintAddress
  );
}
