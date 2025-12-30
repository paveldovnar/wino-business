'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import styles from './success.module.css';

export default function PaySuccessPage() {
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
  }, []);

  const handleClose = () => {
    sessionStorage.removeItem('pay_recipient');
    sessionStorage.removeItem('pay_amount');
    sessionStorage.removeItem('pay_invoice_id');
    sessionStorage.removeItem('pay_signature');
    router.push('/dashboard');
  };

  const viewOnExplorer = () => {
    const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';
    const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
    window.open(explorerUrl, '_blank');
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.successIcon}>
          <CheckCircle2 size={64} strokeWidth={2} />
        </div>

        <h2 className={styles.title}>Payment successful</h2>

        <p className={styles.description}>
          Your payment has been confirmed on the blockchain
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

        {signature && (
          <button onClick={viewOnExplorer} className={styles.explorerLink}>
            <span>View on Solana Explorer</span>
            <ExternalLink size={16} strokeWidth={2} />
          </button>
        )}
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
