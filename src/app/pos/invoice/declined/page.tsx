'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { XCircle } from 'lucide-react';
import styles from './declined.module.css';

export default function InvoiceDeclinedPage() {
  const router = useRouter();
  const [from, setFrom] = useState('');
  const [amount, setAmount] = useState('0');
  const [signature, setSignature] = useState('');

  useEffect(() => {
    const sig = sessionStorage.getItem('invoice_signature') || '';
    const fromAddr = sessionStorage.getItem('invoice_from') || '';
    const amt = sessionStorage.getItem('invoice_amount') || '0';

    setSignature(sig);
    setFrom(fromAddr);
    setAmount(amt === 'custom' ? '100.00' : parseFloat(amt).toFixed(2));
  }, []);

  const handleClose = () => {
    sessionStorage.removeItem('invoice_signature');
    sessionStorage.removeItem('invoice_from');
    sessionStorage.removeItem('invoice_amount');
    sessionStorage.removeItem('invoice_allow_custom');
    router.push('/pos');
  };

  const handleTryAgain = () => {
    sessionStorage.removeItem('invoice_signature');
    sessionStorage.removeItem('invoice_from');
    router.push('/pos/invoice/create');
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.errorIcon}>
          <XCircle size={64} strokeWidth={2} />
        </div>

        <h2 className={styles.title}>Payment declined</h2>

        <p className={styles.description}>
          The transaction was rejected or failed to confirm
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

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          onClick={handleTryAgain}
        >
          Try again
        </Button>
        <Button
          size="l"
          stretched
          mode="outline"
          onClick={handleClose}
        >
          Close
        </Button>
      </div>
    </div>
  );
}
