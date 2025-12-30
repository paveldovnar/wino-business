'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { getSolanaConnection, waitForSignature } from '@/lib/solana';
import styles from './pending.module.css';

export default function InvoicePendingPage() {
  const router = useRouter();
  const [signature, setSignature] = useState('');
  const [from, setFrom] = useState('');
  const [amount, setAmount] = useState('0');

  useEffect(() => {
    const sig = sessionStorage.getItem('invoice_signature') || '';
    const fromAddr = sessionStorage.getItem('invoice_from') || '';
    const amt = sessionStorage.getItem('invoice_amount') || '0';

    setSignature(sig);
    setFrom(fromAddr);
    setAmount(amt === 'custom' ? '100.00' : parseFloat(amt).toFixed(2));

    const simulateConfirmation = async () => {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const success = Math.random() > 0.2;

      if (success) {
        router.push('/pos/invoice/success');
      } else {
        router.push('/pos/invoice/declined');
      }
    };

    simulateConfirmation();
  }, [router]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <LoadingSpinner size={64} />

        <h2 className={styles.title}>Processing payment</h2>

        <p className={styles.description}>
          Waiting for blockchain confirmation...
        </p>

        <div className={styles.card}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>From</span>
            <span className={styles.detailValue}>
              {from.slice(0, 4)}...{from.slice(-4)}
            </span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Amount</span>
            <span className={styles.detailValue}>${amount}</span>
          </div>

          {signature && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Signature</span>
              <span className={styles.detailValue}>
                {signature.slice(0, 4)}...{signature.slice(-4)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
