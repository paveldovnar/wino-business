'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import styles from './pending.module.css';

const POLL_INTERVAL = 2000; // 2 seconds

export default function InvoicePendingPage() {
  const router = useRouter();
  const [signature, setSignature] = useState('');
  const [from, setFrom] = useState('');
  const [amount, setAmount] = useState('0');
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    const invoiceId = sessionStorage.getItem('current_invoice_id');

    if (!invoiceId) {
      console.error('[pos/invoice/pending] No invoice ID found');
      router.replace('/pos');
      return;
    }

    setFrom('waiting...');

    let pollInterval: NodeJS.Timeout;
    let isActive = true;

    const pollStatus = async () => {
      if (!isActive) return;

      try {
        const res = await fetch(`/api/invoices/${invoiceId}/status`);
        const data = await res.json();

        if (!isActive) return;

        console.log('[pos/invoice/pending] Status:', data.status, data.debug);

        if (data.debug) {
          setDebugInfo(data.debug);
        }

        if (data.status === 'paid') {
          // Payment detected!
          setSignature(data.signature || '');
          setFrom(data.payer || '');
          setAmount(data.matchedAmount?.toString() || '0');

          // Store for success page
          sessionStorage.setItem('invoice_signature', data.signature || '');
          sessionStorage.setItem('invoice_from', data.payer || '');
          sessionStorage.setItem('invoice_amount', data.matchedAmount?.toString() || '0');

          // Navigate to success
          setTimeout(() => {
            router.push('/pos/invoice/success');
          }, 500);
        } else if (data.status === 'expired') {
          router.push('/pos/invoice/declined');
        }
      } catch (err) {
        console.error('[pos/invoice/pending] Error polling status:', err);
      }
    };

    // Start polling
    pollStatus();
    pollInterval = setInterval(pollStatus, POLL_INTERVAL);

    return () => {
      isActive = false;
      clearInterval(pollInterval);
    };
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
              {from === 'waiting...' ? from : `${from.slice(0, 4)}...${from.slice(-4)}`}
            </span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Amount</span>
            <span className={styles.detailValue}>
              {amount === 'custom' ? 'Custom amount' : `${parseFloat(amount).toFixed(2)} USDC`}
            </span>
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

        <p className={styles.description} style={{ fontSize: '12px', marginTop: '16px', opacity: 0.7 }}>
          Server verifying incoming USDC transfers via merchant ATA...
        </p>

        {/* Debug info (dev only) */}
        {debugInfo && (
          <div className={styles.card} style={{ marginTop: '16px', fontSize: '11px', fontFamily: 'monospace' }}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Txs Checked</span>
              <span className={styles.detailValue}>{debugInfo.txsChecked || 0}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Transfers Found</span>
              <span className={styles.detailValue}>{debugInfo.transfersFoundCount || 0}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Last Checked</span>
              <span className={styles.detailValue}>
                {debugInfo.checkedAt ? new Date(debugInfo.checkedAt * 1000).toLocaleTimeString() : '-'}
              </span>
            </div>
            {debugInfo.rejectReasons && Object.keys(debugInfo.rejectReasons).length > 0 && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Rejects</span>
                <span className={styles.detailValue}>
                  {JSON.stringify(debugInfo.rejectReasons)}
                </span>
              </div>
            )}
          </div>
        )}

        <p className={styles.description} style={{ fontSize: '10px', marginTop: '8px', opacity: 0.5 }}>
          Check browser console for detailed status polling logs
        </p>
      </div>
    </div>
  );
}
