'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { X, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';
import styles from './scan.module.css';

export default function InvoiceScanPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState<string | null>(null);
  const [allowCustom, setAllowCustom] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [solanaPayURI, setSolanaPayURI] = useState('');
  const [copied, setCopied] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const createInvoice = async () => {
      const storedAmount = sessionStorage.getItem('invoice_amount');
      const storedAllowCustom = sessionStorage.getItem('invoice_allow_custom') === 'true';

      setAmount(storedAmount === 'custom' ? null : storedAmount);
      setAllowCustom(storedAllowCustom);

      if (!publicKey) {
        console.error('[invoice/scan] Merchant wallet not connected');
        router.push('/connect-wallet');
        return;
      }

      const recipientAddress = publicKey.toBase58();
      const invoiceAmount = storedAmount === 'custom' ? undefined : parseFloat(storedAmount || '0');

      try {
        // Create invoice on server
        const res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: recipientAddress,
            amount: invoiceAmount,
            allowCustomAmount: storedAllowCustom,
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to create invoice');
        }

        const data = await res.json();
        const { invoiceId, solanaPayUrl } = data;

        setInvoiceId(invoiceId);
        setSolanaPayURI(solanaPayUrl);

        // Store invoice ID in sessionStorage for pending page
        sessionStorage.setItem('current_invoice_id', invoiceId);

        // Generate QR code
        const qrDataUrl = await QRCode.toDataURL(solanaPayUrl, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 300,
          color: { dark: '#000000', light: '#FFFFFF' },
        });

        setQrCodeDataUrl(qrDataUrl);
        setLoading(false);

        console.log('[invoice/scan] Invoice created:', invoiceId);
      } catch (err) {
        console.error('[invoice/scan] Error creating invoice:', err);
        alert('Failed to create invoice');
        router.push('/pos');
      }
    };

    createInvoice();
  }, [publicKey, router]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(solanaPayURI);
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
        <h1 className={styles.title}>Awaiting payment</h1>
      </div>

      <div className={styles.content}>
        <div className={styles.qrContainer}>
          <div className={styles.qrPlaceholder}>
            {qrCodeDataUrl ? (
              <img
                src={qrCodeDataUrl}
                alt="Solana Pay QR Code"
                className={styles.qrImage}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            ) : (
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
            )}
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
                <span>Copy Solana Pay URI</span>
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
              {allowCustom ? 'Customer enters amount' : `${parseFloat(amount || '0').toFixed(2)} USDC`}
            </span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Invoice ID</span>
            <span className={styles.detailValue}>
              {invoiceId ? `${invoiceId.slice(0, 8)}...` : 'Generating...'}
            </span>
          </div>
        </div>

        <div className={styles.infoBox}>
          <p className={styles.infoText}>
            Customer scans QR with Phantom/Solflare to pay with USDC
          </p>
          <p className={styles.infoText} style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>
            Server verifying blockchain for incoming transfers. Timeout: 10 minutes.
          </p>
        </div>

        <button
          onClick={() => router.push('/pos/invoice/pending')}
          className={styles.continueButton}
          disabled={loading}
          style={{
            marginTop: '16px',
            width: '100%',
            padding: '12px',
            backgroundColor: loading ? '#666' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Creating invoice...' : 'Continue to payment status'}
        </button>
      </div>
    </div>
  );
}
