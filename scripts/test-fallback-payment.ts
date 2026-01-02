/**
 * Test Fallback Payment (No Reference)
 * Sends USDC directly to merchant ATA WITHOUT including reference
 * This tests the fallback matching logic in the webhook handler
 */

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS = 6;

async function sendPaymentNoReference(amountUsd: number, merchantAta: string) {
  console.log('================================================');
  console.log('Test Fallback Payment (No Reference)');
  console.log('================================================\n');

  // Load payer from env
  const payerPrivateKey = process.env.TEST_PAYER_PRIVATE_KEY;
  if (!payerPrivateKey) {
    throw new Error('TEST_PAYER_PRIVATE_KEY not set');
  }

  const payerKeypair = Keypair.fromSecretKey(bs58.decode(payerPrivateKey));
  console.log('Payer:', payerKeypair.publicKey.toBase58());
  console.log('Amount:', amountUsd, 'USDC');
  console.log('To ATA:', merchantAta);
  console.log('');

  // Setup connection
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const usdcMint = new PublicKey(USDC_MINT);
  const merchantAtaPubkey = new PublicKey(merchantAta);

  // Get payer's USDC ATA
  const payerAta = await getAssociatedTokenAddress(usdcMint, payerKeypair.publicKey);

  console.log('Payer USDC ATA:', payerAta.toBase58());

  // Check balance
  const balance = await connection.getTokenAccountBalance(payerAta);
  console.log('Balance:', balance.value.uiAmount, 'USDC\n');

  if (!balance.value.uiAmount || balance.value.uiAmount < amountUsd) {
    throw new Error(`Insufficient balance: ${balance.value.uiAmount} USDC`);
  }

  // Build transaction WITHOUT reference (fallback test)
  const transaction = new Transaction();

  const amountMinor = BigInt(Math.round(amountUsd * Math.pow(10, USDC_DECIMALS)));
  const transferInstruction = createTransferInstruction(
    payerAta,
    merchantAtaPubkey,
    payerKeypair.publicKey,
    amountMinor,
    [],
    TOKEN_PROGRAM_ID
  );

  // NOTE: We intentionally DO NOT add the reference pubkey here
  // This simulates a wallet that doesn't support Solana Pay references

  transaction.add(transferInstruction);

  console.log('Sending transaction WITHOUT reference (testing fallback)...');

  // Get blockhash and send
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = payerKeypair.publicKey;

  transaction.sign(payerKeypair);
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  console.log('✅ Transaction sent (no reference included)');
  console.log('Signature:', signature);
  console.log('Solscan:', `https://solscan.io/tx/${signature}`);
  console.log('');
  console.log('Webhook should detect this payment via FALLBACK matching');
  console.log('(matching by amount + merchant ATA + time window)');
  console.log('================================================\n');

  return signature;
}

// Get args from command line
const amountStr = process.argv[2];
const merchantAta = process.argv[3];

if (!amountStr || !merchantAta) {
  console.error('Usage: npx tsx scripts/test-fallback-payment.ts <amount> <merchantAta>');
  console.error('Example: npx tsx scripts/test-fallback-payment.ts 0.01 FaSCWAXDiXcP1BerUukGePgSWo7j4nk5HxWE13vHYuun');
  process.exit(1);
}

const amount = parseFloat(amountStr);

sendPaymentNoReference(amount, merchantAta).catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
