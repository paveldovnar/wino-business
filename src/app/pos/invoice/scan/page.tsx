'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { X, Copy, Check } from 'lucide-react';
import { getSolanaConnection, waitForSignature } from '@/lib/solana';
import { Keypair } from '@solana/web3.js';
import styles from './scan.module.css';

export default function InvoiceScanPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState<string | null>(null);
  const [allowCustom, setAllowCustom] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  const [mockSignature, setMockSignature] = useState('');

  useEffect(() => {
    const storedAmount = sessionStorage.getItem('invoice_amount');
    const storedAllowCustom = sessionStorage.getItem('invoice_allow_custom') === 'true';

    setAmount(storedAmount === 'custom' ? null : storedAmount);
    setAllowCustom(storedAllowCustom);

    const recipientAddress = publicKey?.toBase58() || 'mock-wallet-address';
    const id = crypto.randomUUID();
    setInvoiceId(id);

    const mockSig = Keypair.generate().publicKey.toBase58();
    setMockSignature(mockSig);

    const qrData = JSON.stringify({
      recipient: recipientAddress,
      amount: storedAmount === 'custom' ? null : parseFloat(storedAmount || '0'),
      invoiceId: id,
    });
    setQrCode(qrData);

    const pollForPayment = setTimeout(() => {
      sessionStorage.setItem('invoice_signature', mockSig);
      sessionStorage.setItem('invoice_from', Keypair.generate().publicKey.toBase58());
      router.push('/pos/invoice/pending');
    }, 5000);

    return () => clearTimeout(pollForPayment);
  }, [publicKey, router]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.push('/pos')} className={styles.closeButton}>
          <X size={24} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Scan to pay</h1>
      </div>

      <div className={styles.content}>
        <div className={styles.qrContainer}>
          <div className={styles.qrPlaceholder}>
            <div className={styles.qrCode}>
              <div className={styles.qrPattern}>
                {Array.from({ length: 100 }).map((_, i) => (
                  <div
                    key={i}
                    className={styles.qrBlock}
                    style={{
                      opacity: Math.random() > 0.5 ? 1 : 0,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <button onClick={handleCopy} className={styles.copyButton}>
            {copied ? (
              <>
                <Check size={16} strokeWidth={2} />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={16} strokeWidth={2} />
                <span>Copy payment data</span>
              </>
            )}
          </button>
        </div>

        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Recipient</span>
            <span className={styles.detailValue}>
              {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
            </span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Amount</span>
            <span className={styles.detailValue}>
              {allowCustom ? 'Custom amount' : `$${parseFloat(amount || '0').toFixed(2)}`}
            </span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Invoice ID</span>
            <span className={styles.detailValue}>
              {invoiceId.slice(0, 8)}...
            </span>
          </div>
        </div>

        <div className={styles.infoBox}>
          <p className={styles.infoText}>
            Waiting for customer to scan and pay...
          </p>
        </div>
      </div>
    </div>
  );
}
