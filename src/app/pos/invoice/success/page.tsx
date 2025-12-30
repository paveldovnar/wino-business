'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { CheckCircle2 } from 'lucide-react';
import { saveTransaction } from '@/lib/storage';
import { Transaction } from '@/types';
import styles from './success.module.css';

export default function InvoiceSuccessPage() {
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
    const amountValue = amt === 'custom' ? '100.00' : parseFloat(amt).toFixed(2);
    setAmount(amountValue);

    const transaction: Transaction = {
      id: crypto.randomUUID(),
      signature: sig,
      amount: parseFloat(amountValue),
      from: fromAddr,
      to: 'merchant-wallet',
      status: 'success',
      timestamp: new Date(),
      type: 'invoice',
    };

    saveTransaction(transaction);
  }, []);

  const handleClose = () => {
    sessionStorage.removeItem('invoice_signature');
    sessionStorage.removeItem('invoice_from');
    sessionStorage.removeItem('invoice_amount');
    sessionStorage.removeItem('invoice_allow_custom');
    router.push('/pos');
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.successIcon}>
          <CheckCircle2 size={64} strokeWidth={2} />
        </div>

        <h2 className={styles.title}>Payment successful</h2>

        <p className={styles.description}>
          The transaction has been confirmed on the blockchain
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
          onClick={handleClose}
        >
          Close
        </Button>
      </div>
    </div>
  );
}
