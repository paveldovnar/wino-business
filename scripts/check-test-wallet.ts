/**
 * Check Test Wallet Balance
 * Verifies SOL and USDC balance of test payer wallet
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const TEST_PAYER = 'HwiirurS8Yr28AFiW97f4JNVFZawcN74WrjQToPxmmjY';

async function checkWallet() {
  console.log('================================================');
  console.log('Test Wallet Balance Check');
  console.log('================================================\n');

  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const payer = new PublicKey(TEST_PAYER);
  const usdcMint = new PublicKey(USDC_MINT);

  console.log('Wallet Address:', TEST_PAYER);
  console.log('Solscan:', `https://solscan.io/account/${TEST_PAYER}`);
  console.log('');

  // Get USDC ATA
  const usdcAta = await getAssociatedTokenAddress(usdcMint, payer);
  console.log('USDC Token Account:', usdcAta.toBase58());
  console.log('');

  // Check SOL balance
  console.log('Checking balances...\n');
  const solBalance = await connection.getBalance(payer);
  const solAmount = solBalance / 1e9;

  console.log('SOL Balance:', solAmount, 'SOL');
  if (solAmount === 0) {
    console.log('  ⚠️  No SOL - Send at least 0.01 SOL for transaction fees');
  } else if (solAmount < 0.01) {
    console.log('  ⚠️  Low SOL - Send more for reliable testing');
  } else {
    console.log('  ✅ Sufficient SOL for transaction fees');
  }

  // Check USDC balance
  try {
    const usdcBalance = await connection.getTokenAccountBalance(usdcAta);
    const usdcAmount = usdcBalance.value.uiAmount || 0;

    console.log('USDC Balance:', usdcAmount, 'USDC');
    if (usdcAmount === 0) {
      console.log('  ⚠️  No USDC - Send USDC to enable test payments');
    } else if (usdcAmount < 0.1) {
      console.log('  ⚠️  Low USDC - Can run', Math.floor(usdcAmount / 0.01), 'tests');
    } else {
      console.log('  ✅ Can run', Math.floor(usdcAmount / 0.01), 'tests');
    }
  } catch (err) {
    console.log('USDC Balance: 0 USDC (token account not created)');
    console.log('  ⚠️  No USDC - Send USDC to automatically create account');
  }

  console.log('');
  console.log('================================================');

  // Calculate test capacity
  const testRuns = Math.floor(solAmount / 0.000005);
  const usdcTestRuns = await (async () => {
    try {
      const balance = await connection.getTokenAccountBalance(usdcAta);
      return Math.floor((balance.value.uiAmount || 0) / 0.01);
    } catch {
      return 0;
    }
  })();

  const maxTests = Math.min(testRuns, usdcTestRuns);

  console.log('Test Capacity:');
  console.log('  Based on SOL:', testRuns > 1000 ? '1000+' : testRuns, 'tests');
  console.log('  Based on USDC:', usdcTestRuns, 'tests');
  console.log('  Maximum:', maxTests, 'test runs available');
  console.log('');

  if (maxTests === 0) {
    console.log('❌ NOT READY FOR TESTING');
    console.log('');
    console.log('Action Required:');
    console.log('  1. Send 0.05 SOL to:', TEST_PAYER);
    console.log('  2. Send 1 USDC to:', TEST_PAYER);
    console.log('  3. Wait ~30 seconds for confirmation');
    console.log('  4. Run this script again to verify');
    console.log('');
  } else if (maxTests < 10) {
    console.log('⚠️  LOW BALANCE - Consider adding more funds');
    console.log('');
  } else {
    console.log('✅ READY FOR TESTING!');
    console.log('');
    console.log('Run E2E test:');
    console.log('  TEST_AUTOMATION_SECRET="mj/fu42MkNX4gNXLa8ObCX/2RWT1IJc2Yb8m4Te4rP4=" \\');
    console.log('    npx tsx scripts/test-e2e-payment-server.ts');
    console.log('');
  }

  console.log('================================================\n');
}

checkWallet().catch((err) => {
  console.error('Error checking wallet:', err);
  process.exit(1);
});
