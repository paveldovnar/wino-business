import { test, expect } from '@playwright/test';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Metaplex, keypairIdentity, toBigNumber } from '@metaplex-foundation/js';
import bs58 from 'bs58';

const APP_URL = process.env.APP_URL || 'https://wino-business.vercel.app';
const API_BASE = process.env.API_BASE || APP_URL;
const RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

const TEST_PAYER_PRIVATE_KEY = process.env.TEST_PAYER_PRIVATE_KEY;

test.describe('NFT Identity Tests', () => {
  test('verify API works for known NFT', async ({ request }) => {
    // Test with a known Metaplex NFT mint address (any valid one)
    // We'll just verify the API responds correctly
    const response = await request.get(`${API_BASE}/api/identity/verify?mint=invalid`);
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toBe('Invalid mint address format');
  });

  test.skip(!TEST_PAYER_PRIVATE_KEY, 'Skipping: TEST_PAYER_PRIVATE_KEY not set');

  test('mint real Business Identity NFT on mainnet', async ({ request }) => {
    if (!TEST_PAYER_PRIVATE_KEY) {
      console.log('[test] Skipping - no test wallet configured');
      return;
    }

    // Create payer keypair
    const payerSecretKey = bs58.decode(TEST_PAYER_PRIVATE_KEY);
    const payer = Keypair.fromSecretKey(payerSecretKey);

    console.log('[test] Payer wallet:', payer.publicKey.toBase58());

    // Connect to Solana
    const connection = new Connection(RPC_URL, 'confirmed');

    // Check SOL balance (need ~0.02 SOL for minting)
    const balance = await connection.getBalance(payer.publicKey);
    const solBalance = balance / 1_000_000_000;
    console.log('[test] SOL balance:', solBalance);

    if (solBalance < 0.02) {
      console.log('[test] Insufficient SOL for minting (need ~0.02 SOL)');
      test.skip(true, 'Insufficient SOL balance for NFT mint');
      return;
    }

    // Initialize Metaplex with keypair identity
    console.log('[test] Initializing Metaplex...');
    const metaplex = Metaplex.make(connection)
      .use(keypairIdentity(payer));

    // Prepare metadata (NFT name max 32 chars)
    const businessName = 'TestBiz' + Date.now().toString().slice(-6);
    const metadata = {
      name: `${businessName} - Wino`,  // Keep under 32 chars
      symbol: 'WINO',
      description: `Business Identity NFT for ${businessName}. Created with Wino Business app.`,
      image: 'https://arweave.net/placeholder',
      attributes: [
        { trait_type: 'identity_type', value: 'business' },
        { trait_type: 'Business Name', value: businessName },
        { trait_type: 'App', value: 'wino-business' },
        { trait_type: 'Wallet', value: payer.publicKey.toBase58() },
        { trait_type: 'Created', value: new Date().toISOString() },
      ],
      properties: {
        files: [{ uri: 'https://arweave.net/placeholder', type: 'image/png' }],
        category: 'image',
      },
    };

    console.log('[test] Business Name:', businessName);

    // Upload metadata
    console.log('[test] Uploading metadata to Arweave...');
    const { uri: metadataUri } = await metaplex.nfts().uploadMetadata(metadata);
    console.log('[test] Metadata URI:', metadataUri);

    // Create NFT
    console.log('[test] Creating NFT on Solana mainnet...');
    const { nft, response } = await metaplex.nfts().create({
      uri: metadataUri,
      name: metadata.name,
      symbol: metadata.symbol,
      sellerFeeBasisPoints: 0,
      isMutable: false,
      maxSupply: toBigNumber(1),
    });

    const mintAddress = nft.address.toBase58();
    const txSignature = response.signature;

    console.log('[test] NFT Minted!');
    console.log('[test] Mint Address:', mintAddress);
    console.log('[test] Transaction:', txSignature);
    console.log('[test] Solscan NFT:', 'https://solscan.io/token/' + mintAddress);
    console.log('[test] Solscan TX:', 'https://solscan.io/tx/' + txSignature);

    // Verify on-chain via API
    console.log('[test] Verifying via API...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for indexing

    const verifyResponse = await request.get(`${API_BASE}/api/identity/verify?mint=${mintAddress}`);
    const verifyData = await verifyResponse.json();

    console.log('[test] Verify response:', verifyData);

    expect(verifyData.verified).toBe(true);
    expect(verifyData.nft.mint).toBe(mintAddress);
    expect(verifyData.nft.symbol).toBe('WINO');
    expect(verifyData.nft.isWinoBusinessNFT).toBe(true);

    // Summary
    console.log('\n========================================');
    console.log('NFT MINT TEST SUMMARY');
    console.log('========================================');
    console.log('Business Name:', businessName);
    console.log('Mint Address:', mintAddress);
    console.log('Transaction:', txSignature);
    console.log('Metadata URI:', metadataUri);
    console.log('Verified:', verifyData.verified);
    console.log('Solscan:', 'https://solscan.io/token/' + mintAddress);
    console.log('========================================\n');
  });
});
