import { Connection, PublicKey } from '@solana/web3.js';

const TX_SIG = '3o85GhWQ1yUZX7JSZvQRHZ5hnYnwueB9RS3kumN3suedgS6aaCbiPFyNVBBUzRdrJxXTz18gcMka8cKuE9797HhG';
const INVOICE_ID = 'dada58d6-9096-468b-a202-af08cd950203';
const USDC_DECIMALS = 6;

async function verifyTransaction() {
  console.log('\n🔍 Verifying on-chain transaction...\n');

  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

  // Get transaction details
  const tx = await connection.getParsedTransaction(TX_SIG, {
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    console.log('❌ Transaction not found on-chain');
    return;
  }

  console.log('✅ Transaction found on-chain');
  console.log('Block Time:', new Date((tx.blockTime || 0) * 1000).toISOString());
  console.log('Slot:', tx.slot);
  console.log('Status:', tx.meta?.err ? 'FAILED' : 'SUCCESS');

  // Extract token transfers
  const preBalances = tx.meta?.preTokenBalances || [];
  const postBalances = tx.meta?.postTokenBalances || [];

  console.log('\n--- Token Transfers ---');

  for (let i = 0; i < postBalances.length; i++) {
    const post = postBalances[i];
    const pre = preBalances.find(b => b.accountIndex === post.accountIndex);

    if (pre && post) {
      const preAmount = parseFloat(pre.uiTokenAmount.uiAmountString || '0');
      const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || '0');
      const change = postAmount - preAmount;

      if (change !== 0) {
        console.log(`\nAccount ${post.accountIndex}:`);
        console.log('  Owner:', post.owner);
        console.log('  Mint:', post.mint);
        console.log('  Pre:', preAmount.toFixed(6), 'USDC');
        console.log('  Post:', postAmount.toFixed(6), 'USDC');
        console.log('  Change:', change > 0 ? `+${change.toFixed(6)}` : change.toFixed(6), 'USDC');
      }
    }
  }

  // Check for memo
  console.log('\n--- Instructions ---');
  const instructions = tx.transaction.message.instructions;

  for (const ix of instructions) {
    if ('parsed' in ix) {
      console.log(`Type: ${ix.parsed.type}`);
      if (ix.parsed.type === 'transfer' || ix.parsed.type === 'transferChecked') {
        console.log('  Info:', JSON.stringify(ix.parsed.info, null, 2));
      }
    } else if ('data' in ix) {
      // Check if it's a memo instruction
      const programId = ix.programId.toBase58();
      if (programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
        const memoData = Buffer.from(ix.data, 'base64').toString('utf8');
        console.log('Memo:', memoData);
      }
    }
  }

  // Check account keys for reference
  console.log('\n--- Account Keys ---');
  const accountKeys = tx.transaction.message.accountKeys;
  accountKeys.forEach((key, i) => {
    console.log(`[${i}] ${key.pubkey.toBase58()}${key.signer ? ' (signer)' : ''}${key.writable ? ' (writable)' : ''}`);
  });

  return tx;
}

verifyTransaction()
  .then(() => {
    console.log('\n✅ Verification complete');
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
