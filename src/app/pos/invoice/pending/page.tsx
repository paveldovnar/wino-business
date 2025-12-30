'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { watchIncomingUSDCPayments } from '@/lib/incoming-payment-watcher';
import { getInvoiceById, updateInvoiceStatus, saveTransaction } from '@/lib/storage';
import { Transaction } from '@/types';
import styles from './pending.module.css';

const INVOICE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

export default function InvoicePendingPage() {
  const router = useRouter();
  const [signature, setSignature] = useState('');
  const [from, setFrom] = useState('');
  const [amount, setAmount] = useState('0');
  const [debugInfo, setDebugInfo] = useState({
    invoiceCreatedAt: '',
    invoiceCreatedAtSec: 0,
    reference: '',
    recipient: '',
  });

  useEffect(() => {
    const invoiceId = sessionStorage.getItem('current_invoice_id');

    if (!invoiceId) {
      console.error('[pos/invoice/pending] No invoice ID found');
      router.replace('/pos');
      return;
    }

    // Get invoice from localStorage
    const invoice = getInvoiceById(invoiceId);

    if (!invoice) {
      console.error('[pos/invoice/pending] Invoice not found');
      router.replace('/pos');
      return;
    }

    // Check if invoice was already paid (from scan page detection)
    if (invoice.status === 'success' && invoice.signature) {
      console.log('[pos/invoice/pending] Invoice already paid, navigating to success...');

      const sig = sessionStorage.getItem('invoice_signature') || invoice.signature;
      const fromAddr = sessionStorage.getItem('invoice_from') || invoice.from || '';
      const amt = sessionStorage.getItem('invoice_amount') || invoice.amount?.toString() || '0';

      setSignature(sig);
      setFrom(fromAddr);
      setAmount(amt);

      // Save transaction to history
      const transaction: Transaction = {
        id: crypto.randomUUID(),
        signature: sig,
        amount: parseFloat(amt),
        from: fromAddr,
        to: invoice.recipient,
        status: 'success',
        timestamp: new Date(),
        type: 'invoice',
      };

      saveTransaction(transaction);

      // Navigate to success immediately
      setTimeout(() => {
        router.push('/pos/invoice/success');
      }, 500);

      return;
    }

    // Invoice is still pending, continue watching
    console.log('[pos/invoice/pending] Invoice still pending, continuing to watch...');
    console.log('[pos/invoice/pending] Reference:', invoice.reference);

    setFrom('waiting...');
    setAmount(invoice.amount?.toString() || 'custom');

    // Set debug info
    const invoiceCreatedAtMs = invoice.createdAt.getTime();
    const invoiceCreatedAtSec = invoiceCreatedAtMs > 1e12 ? Math.floor(invoiceCreatedAtMs / 1000) : invoiceCreatedAtMs;
    setDebugInfo({
      invoiceCreatedAt: invoice.createdAt.toISOString(),
      invoiceCreatedAtSec,
      reference: invoice.reference,
      recipient: invoice.recipient,
    });

    // Continue watching for incoming USDC payments with DUAL-WATCHER strategy
    // RECEIVE-ONLY: This function only monitors incoming transfers
    const cleanup = watchIncomingUSDCPayments({
      merchantAddress: invoice.recipient,
      expectedAmount: invoice.amount || undefined,
      reference: invoice.reference, // Use reference for safe matching
      invoiceCreatedAt: invoice.createdAt, // Pass invoice creation time for fallback matching
      onPaymentDetected: (payment) => {
        console.log('[pos/invoice/pending] Payment detected!', payment);
        console.log('[pos/invoice/pending] Payment source:', payment.hasReference ? 'PRIMARY (Solana Pay)' : 'FALLBACK (USDC ATA)');
        console.log('[pos/invoice/pending] Wallet type:', payment.walletType);

        // Update invoice status
        updateInvoiceStatus(invoiceId, 'success', payment.signature, payment.from);

        // Store payment details
        sessionStorage.setItem('invoice_signature', payment.signature);
        sessionStorage.setItem('invoice_from', payment.from);
        sessionStorage.setItem('invoice_amount', payment.amount.toString());

        // Save transaction to history
        const transaction: Transaction = {
          id: crypto.randomUUID(),
          signature: payment.signature,
          amount: payment.amount,
          from: payment.from,
          to: invoice.recipient,
          status: 'success',
          timestamp: new Date(),
          type: 'invoice',
        };

        saveTransaction(transaction);

        // Navigate to success page
        router.push('/pos/invoice/success');
      },
      onError: (error) => {
        console.error('[pos/invoice/pending] Error watching for payments:', error);
      },
      timeout: INVOICE_TIMEOUT,
    });

    // Set up timeout to mark invoice as declined
    const timeoutId = setTimeout(() => {
      console.log('[pos/invoice/pending] Invoice timeout reached');
      updateInvoiceStatus(invoiceId, 'declined');
      router.push('/pos/invoice/declined');
    }, INVOICE_TIMEOUT);

    // Cleanup on unmount
    return () => {
      cleanup();
      clearTimeout(timeoutId);
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
          Watching for incoming USDC transfers with Solana Pay reference matching...
        </p>

        {/* Debug info */}
        <div className={styles.card} style={{ marginTop: '16px', fontSize: '11px', fontFamily: 'monospace' }}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Invoice Created</span>
            <span className={styles.detailValue}>{debugInfo.invoiceCreatedAt}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Created (seconds)</span>
            <span className={styles.detailValue}>{debugInfo.invoiceCreatedAtSec}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Reference</span>
            <span className={styles.detailValue}>
              {debugInfo.reference ? `${debugInfo.reference.slice(0, 8)}...${debugInfo.reference.slice(-8)}` : 'none'}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Recipient</span>
            <span className={styles.detailValue}>
              {debugInfo.recipient ? `${debugInfo.recipient.slice(0, 8)}...${debugInfo.recipient.slice(-8)}` : 'none'}
            </span>
          </div>
        </div>

        <p className={styles.description} style={{ fontSize: '10px', marginTop: '8px', opacity: 0.5 }}>
          Check browser console for detailed transaction matching logs
        </p>
      </div>
    </div>
  );
}
