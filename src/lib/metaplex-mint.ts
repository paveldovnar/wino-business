import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { Metaplex, walletAdapterIdentity, toBigNumber } from '@metaplex-foundation/js';
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
 * Mint a Business Identity NFT on Solana mainnet using Metaplex
 */
export async function mintBusinessIdentityNFT({
  connection,
  wallet,
  businessName,
  logo,
}: MintBusinessIdentityParams): Promise<MintResult> {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error('Wallet not connected or does not support transaction signing');
  }

  if (!wallet.connected) {
    throw new Error('Wallet not connected. Please reconnect your wallet and try again.');
  }

  try {
    console.log('[Metaplex] Starting NFT mint for:', businessName);
    console.log('[Metaplex] Wallet:', wallet.publicKey.toBase58());
    console.log('[Metaplex] Wallet connected:', wallet.connected);

    // Initialize Metaplex instance with timeout handling
    const metaplex = Metaplex.make(connection)
      .use(walletAdapterIdentity(wallet));

    console.log('[Metaplex] Metaplex instance created');

    // Prepare metadata with required identity_type
    const metadata = {
      name: `${businessName} - Wino Business`,
      symbol: 'WINO',
      description: `Business Identity NFT for ${businessName}. Created with Wino Business app.`,
      image: logo || 'https://arweave.net/placeholder',
      attributes: [
        {
          trait_type: 'identity_type',
          value: 'business',
        },
        {
          trait_type: 'Business Name',
          value: businessName,
        },
        {
          trait_type: 'App',
          value: 'wino-business',
        },
        {
          trait_type: 'Wallet',
          value: wallet.publicKey.toBase58(),
        },
        {
          trait_type: 'Created',
          value: new Date().toISOString(),
        },
      ],
      properties: {
        files: [
          {
            uri: logo || 'https://arweave.net/placeholder',
            type: 'image/png',
          },
        ],
        category: 'image',
      },
    };

    console.log('[Metaplex] Metadata prepared:', metadata);

    // Upload metadata to Arweave/bundlr via Metaplex
    console.log('[Metaplex] Uploading metadata...');
    const { uri: metadataUri } = await metaplex.nfts().uploadMetadata(metadata);
    console.log('[Metaplex] Metadata uploaded to:', metadataUri);

    // Create NFT and capture the response with transaction details
    console.log('[Metaplex] Creating NFT...');
    const { nft, response } = await metaplex.nfts().create({
      uri: metadataUri,
      name: metadata.name,
      symbol: metadata.symbol,
      sellerFeeBasisPoints: 0,
      isMutable: false,
      maxSupply: toBigNumber(1),
    });

    console.log('[Metaplex] NFT created successfully!');
    console.log('[Metaplex] Mint address:', nft.address.toBase58());
    console.log('[Metaplex] Metadata URI:', nft.uri);

    const mintAddress = nft.address.toBase58();

    // Extract the transaction signature from the response
    // The response contains the signature of the mint transaction
    const txSignature = response.signature;

    if (!txSignature) {
      throw new Error('No transaction signature returned from minting operation');
    }

    console.log('[Metaplex] Transaction signature:', txSignature);

    // Confirm the transaction to ensure it's finalized
    console.log('[Metaplex] Confirming transaction...');
    const confirmation = await connection.confirmTransaction(txSignature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('[Metaplex] Transaction confirmed successfully!');
    console.log('[Metaplex] View on Solscan: https://solscan.io/tx/' + txSignature);

    return {
      mintAddress,
      txSignature,
      mintedAt: Date.now(),
    };

  } catch (error: any) {
    console.error('[Metaplex] NFT minting failed:', error);

    // Provide user-friendly error messages
    if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient SOL balance. Please ensure you have at least 0.02 SOL for minting.');
    }

    if (error.message?.includes('User rejected')) {
      throw new Error('Transaction cancelled by user');
    }

    if (error.message?.includes('blockhash')) {
      throw new Error('Network timeout. Please try again.');
    }

    throw new Error(`Failed to mint NFT: ${error.message || 'Unknown error'}`);
  }
}
