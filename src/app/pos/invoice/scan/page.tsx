'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { X, Copy, Check, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button } from '@telegram-apps/telegram-ui';
import QRCode from 'qrcode';
import styles from './scan.module.css';

type InvoiceStatus = 'pending' | 'paid' | 'declined' | 'expired';

interface InvoiceData {
  id: string;
  status: InvoiceStatus;
  amountUsd?: number;
  expiresAtSec: number;
  paidTxSig?: string;
  payer?: string;
}

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

  // Invoice status tracking
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>('pending');
  const [expiresAtSec, setExpiresAtSec] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [paidTxSig, setPaidTxSig] = useState('');
  const [payer, setPayer] = useState('');
  const [extending, setExtending] = useState(false);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

        // Store invoice ID in sessionStorage
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

        // Start polling for status
        startStatusPolling(invoiceId);
      } catch (err) {
        console.error('[invoice/scan] Error creating invoice:', err);
        alert('Failed to create invoice');
        router.push('/pos');
      }
    };

    createInvoice();

    // Cleanup on unmount
    return () => {
      stopPolling();
    };
  }, [publicKey, router]);

  const startStatusPolling = (id: string) => {
    // Poll every 1.5 seconds
    pollingIntervalRef.current = setInterval(() => {
      checkInvoiceStatus(id);
    }, 1500);

    // Check immediately
    checkInvoiceStatus(id);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  const checkInvoiceStatus = async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`);
      if (!res.ok) return;

      const data = await res.json();
      const invoice: InvoiceData = data.invoice;

      setInvoiceStatus(invoice.status);
      setExpiresAtSec(invoice.expiresAtSec);

      if (invoice.paidTxSig) {
        setPaidTxSig(invoice.paidTxSig);
      }
      if (invoice.payer) {
        setPayer(invoice.payer);
      }

      // Update countdown
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = invoice.expiresAtSec - nowSec;
      setTimeLeft(Math.max(0, remaining));

      // Stop polling if terminal status
      if (invoice.status === 'paid' || invoice.status === 'declined') {
        stopPolling();
      }

      // Start countdown timer if not already running
      if (!countdownIntervalRef.current && invoice.status === 'pending') {
        startCountdown(invoice.expiresAtSec);
      }
    } catch (err) {
      console.error('[invoice/scan] Error checking status:', err);
    }
  };

  const startCountdown = (expiresAt: number) => {
    countdownIntervalRef.current = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = expiresAt - nowSec;
      setTimeLeft(Math.max(0, remaining));

      if (remaining <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }
    }, 1000);
  };

  const handleExtend = async () => {
    if (!invoiceId) return;

    setExtending(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/extend`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to extend invoice');
      }

      const data = await res.json();
      setExpiresAtSec(data.expiresAtSec);

      // Restart countdown with new expiry
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = data.expiresAtSec - nowSec;
      setTimeLeft(Math.max(0, remaining));

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      startCountdown(data.expiresAtSec);

      console.log('[invoice/scan] Extended invoice:', data);
    } catch (err) {
      console.error('[invoice/scan] Error extending invoice:', err);
      alert('Failed to extend invoice expiration');
    } finally {
      setExtending(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(solanaPayURI);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleClose = () => {
    stopPolling();
    sessionStorage.removeItem('invoice_signature');
    sessionStorage.removeItem('invoice_from');
    sessionStorage.removeItem('invoice_amount');
    sessionStorage.removeItem('invoice_allow_custom');
    sessionStorage.removeItem('current_invoice_id');
    router.push('/pos');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Render success UI
  if (invoiceStatus === 'paid') {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#4CAF50',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            color: 'white',
          }}>
            <CheckCircle2 size={40} strokeWidth={2} />
          </div>

          <h2 className={styles.title} style={{ color: '#4CAF50' }}>Payment successful!</h2>

          <p className={styles.description}>
            The transaction has been confirmed on the blockchain
          </p>

          <div className={styles.details}>
            {payer && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>From</span>
                <span className={styles.detailValue}>
                  {payer.slice(0, 4)}...{payer.slice(-4)}
                </span>
              </div>
            )}

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Amount</span>
              <span className={styles.detailValue}>
                {allowCustom ? 'Custom amount' : `${parseFloat(amount || '0').toFixed(2)} USDC`}
              </span>
            </div>

            {paidTxSig && (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Signature</span>
                <span className={styles.detailValue}>
                  {paidTxSig.slice(0, 4)}...{paidTxSig.slice(-4)}
                </span>
              </div>
            )}
          </div>

          {paidTxSig && (
            <a
              href={`https://solscan.io/tx/${paidTxSig}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginTop: '16px',
                padding: '12px 24px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block',
                fontSize: '14px',
              }}
            >
              View on Solscan →
            </a>
          )}
        </div>

        <div className={styles.actions} style={{ marginTop: '24px' }}>
          <Button size="l" stretched onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  // Render declined/expired UI
  if (invoiceStatus === 'declined') {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#f44336',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            color: 'white',
          }}>
            <XCircle size={40} strokeWidth={2} />
          </div>

          <h2 className={styles.title} style={{ color: '#f44336' }}>Payment declined</h2>

          <p className={styles.description}>
            The invoice has expired or been cancelled
          </p>
        </div>

        <div className={styles.actions} style={{ marginTop: '24px' }}>
          <Button size="l" stretched onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  // Render pending UI with QR and countdown
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={handleClose} className={styles.closeButton}>
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

        {/* Countdown timer */}
        <div className={styles.infoBox}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Clock size={16} strokeWidth={2} />
            <p className={styles.infoText} style={{ fontWeight: 'bold' }}>
              Waiting for payment… {formatTime(timeLeft)}
            </p>
          </div>
          <p className={styles.infoText} style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>
            Customer scans QR with Phantom/Solflare to pay with USDC
          </p>
        </div>

        {/* Show "Wait 2 more minutes" button when expired */}
        {timeLeft === 0 && invoiceStatus === 'pending' && (
          <Button
            size="l"
            stretched
            onClick={handleExtend}
            disabled={extending}
            style={{ marginTop: '16px' }}
          >
            {extending ? 'Extending...' : 'Wait 2 more minutes'}
          </Button>
        )}
      </div>
    </div>
  );
}
