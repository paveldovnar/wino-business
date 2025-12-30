'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import styles from './pending.module.css';

export default function PayPendingPage() {
  const router = useRouter();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('0');
  const [signature, setSignature] = useState('');

  useEffect(() => {
    const rec = sessionStorage.getItem('pay_recipient') || '';
    const amt = sessionStorage.getItem('pay_amount') || '0';
    const sig = sessionStorage.getItem('pay_signature') || '';

    setRecipient(rec);
    setAmount(amt);
    setSignature(sig);

    const simulateConfirmation = setTimeout(() => {
      router.push('/pay/success');
    }, 3000);

    return () => clearTimeout(simulateConfirmation);
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
            <span className={styles.detailLabel}>To</span>
            <span className={styles.detailValue}>
              {recipient.slice(0, 4)}...{recipient.slice(-4)}
            </span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Amount</span>
            <span className={styles.detailValue}>${parseFloat(amount).toFixed(2)}</span>
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
