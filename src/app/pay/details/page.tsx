'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { Button } from '@telegram-apps/telegram-ui';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Keypair } from '@solana/web3.js';
import styles from './details.module.css';

export default function PayDetailsPage() {
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('0');
  const [invoiceId, setInvoiceId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const rec = sessionStorage.getItem('pay_recipient');
    const amt = sessionStorage.getItem('pay_amount');
    const id = sessionStorage.getItem('pay_invoice_id');

    if (!rec || !amt || !id) {
      router.replace('/pay/scan');
      return;
    }

    setRecipient(rec);
    setAmount(amt);
    setInvoiceId(id);
  }, [router]);

  const handlePay = async () => {
    setLoading(true);

    // TODO: Implement real payment transaction here
    // Steps for future implementation:
    // 1. Create a Solana transfer transaction (using @solana/web3.js)
    // 2. Set recipient (merchant's public key from QR code)
    // 3. Set amount (in lamports, convert from USD amount)
    // 4. Sign transaction using wallet.signTransaction() from useWallet()
    // 5. Send transaction to Solana mainnet-beta
    // 6. Store the real transaction signature
    // 7. Navigate to pending page to wait for confirmation
    //
    // For now, using a mock signature for testing the flow

    const mockSignature = Keypair.generate().publicKey.toBase58();
    sessionStorage.setItem('pay_signature', mockSignature);

    setTimeout(() => {
      router.push('/pay/pending');
    }, 1000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          <ArrowLeft size={24} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Payment details</h1>
      </div>

      <div className={styles.content}>
        <div className={styles.amountCard}>
          <div className={styles.amountLabel}>Amount to pay</div>
          <div className={styles.amount}>${parseFloat(amount).toFixed(2)}</div>
        </div>

        <div className={styles.detailsCard}>
          <h3 className={styles.cardTitle}>Merchant details</h3>

          <div className={styles.merchant}>
            <div className={styles.merchantIcon}>
              <Building2 size={32} strokeWidth={2} />
            </div>
            <div className={styles.merchantInfo}>
              <div className={styles.merchantName}>Business Merchant</div>
              <div className={styles.merchantAddress}>
                {recipient.slice(0, 8)}...{recipient.slice(-8)}
              </div>
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Invoice ID</span>
            <span className={styles.detailValue}>{invoiceId.slice(0, 8)}...</span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Network</span>
            <span className={styles.detailValue}>Solana</span>
          </div>

          {publicKey && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>From wallet</span>
              <span className={styles.detailValue}>
                {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          onClick={handlePay}
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Confirm payment'}
        </Button>
      </div>
    </div>
  );
}
