import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_DECIMALS = 6;

async function sendPayment() {
  // Payment details from invoice
  const merchantWallet = 'G7Jhr2df7tEYxmjcHTUJuGyourBDHYw2Zh46ms6NjRDJ';
  const reference = 'EpmPkJG45T4JR1sQvymRbYkoTNEoMyAGdBAATScNrNot';
  const invoiceId = 'dada58d6-9096-468b-a202-af08cd950203';
  const amount = 1.000000; // 1 USDC

  // Sender wallet
  const senderPrivateKey = '2x6Ne28Ljcd8D4rrGvavZ2MtEaQCntKqha3SiaWgT4R2rMTuoTuEVtfmUesmBzsCpJdP1syb9GqskXjN2EygD8K9';
  const senderKeypair = Keypair.fromSecretKey(bs58.decode(senderPrivateKey));

  console.log('Sender wallet:', senderKeypair.publicKey.toBase58());

  // Connect to Solana mainnet
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

  // Get sender and merchant USDC ATAs
  const usdcMint = new PublicKey(USDC_MINT);
  const merchantPubkey = new PublicKey(merchantWallet);
  const referencePubkey = new PublicKey(reference);

  const senderAta = await getAssociatedTokenAddress(
    usdcMint,
    senderKeypair.publicKey
  );

  const merchantAta = await getAssociatedTokenAddress(
    usdcMint,
    merchantPubkey
  );

  console.log('Sender USDC ATA:', senderAta.toBase58());
  console.log('Merchant USDC ATA:', merchantAta.toBase58());

  // Check sender balance
  const senderBalance = await connection.getTokenAccountBalance(senderAta);
  console.log('Sender USDC balance:', senderBalance.value.uiAmount);

  if (!senderBalance.value.uiAmount || senderBalance.value.uiAmount < amount) {
    throw new Error('Insufficient USDC balance');
  }

  // Calculate amount in minor units
  const amountMinor = BigInt(Math.round(amount * Math.pow(10, USDC_DECIMALS)));

  // Build transaction
  const transaction = new Transaction();

  // Add USDC transfer instruction
  transaction.add(
    createTransferInstruction(
      senderAta,
      merchantAta,
      senderKeypair.publicKey,
      amountMinor,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  // Add reference as readonly account (Solana Pay standard)
  // Reference is included as an extra account in the instruction
  transaction.add(
    new TransactionInstruction({
      keys: [
        {
          pubkey: referencePubkey,
          isSigner: false,
          isWritable: false,
        },
      ],
      programId: new PublicKey('11111111111111111111111111111111'),
      data: Buffer.alloc(0),
    })
  );

  // Add memo instruction
  const memoData = Buffer.from(`wino:${invoiceId}`, 'utf8');
  const memoProgramId = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  transaction.add(
    new TransactionInstruction({
      keys: [],
      programId: memoProgramId,
      data: memoData,
    })
  );

  console.log('\n--- Sending payment ---');
  console.log('Amount:', amount, 'USDC');
  console.log('To:', merchantPubkey.toBase58());
  console.log('Reference:', referencePubkey.toBase58());
  console.log('Memo:', `wino:${invoiceId}`);

  // Send and confirm transaction
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [senderKeypair],
    {
      commitment: 'confirmed',
    }
  );

  console.log('\n✅ Payment sent!');
  console.log('Transaction signature:', signature);
  console.log('View on Solscan:', `https://solscan.io/tx/${signature}`);

  return signature;
}

sendPayment()
  .then((sig) => {
    console.log('\n✅ SUCCESS');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ ERROR:', err);
    process.exit(1);
  });
