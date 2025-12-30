'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { X, Copy, Check } from 'lucide-react';
import { Keypair } from '@solana/web3.js';
import QRCode from 'qrcode';
import { buildSolanaPayURI } from '@/lib/solana-pay';
import { watchIncomingUSDCPayments } from '@/lib/incoming-payment-watcher';
import { saveInvoice, updateInvoiceStatus, getBusiness } from '@/lib/storage';
import { Invoice } from '@/types';
import styles from './scan.module.css';

const INVOICE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

export default function InvoiceScanPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState<string | null>(null);
  const [allowCustom, setAllowCustom] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [solanaPayURI, setSolanaPayURI] = useState('');
  const [copied, setCopied] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    const storedAmount = sessionStorage.getItem('invoice_amount');
    const storedAllowCustom = sessionStorage.getItem('invoice_allow_custom') === 'true';

    setAmount(storedAmount === 'custom' ? null : storedAmount);
    setAllowCustom(storedAllowCustom);

    if (!publicKey) {
      console.error('[invoice/scan] Merchant wallet not connected');
      return;
    }

    const recipientAddress = publicKey.toBase58();
    const id = crypto.randomUUID();
    setInvoiceId(id);

    // Generate unique reference keypair for this invoice
    // CRITICAL: We only store the PUBLIC key, never the private key
    // This reference is used to match payments to this specific invoice
    const referenceKeypair = Keypair.generate();
    const referencePubkey = referenceKeypair.publicKey.toBase58();
    setReference(referencePubkey);

    const invoiceAmount = storedAmount === 'custom' ? null : parseFloat(storedAmount || '0');

    // Get business name for label
    const business = getBusiness();
    const merchantName = business?.name || 'Wino Business';

    // Build Solana Pay URI
    // RECEIVE-ONLY: This creates a payment REQUEST that customers will pay
    const solanaPayUri = buildSolanaPayURI({
      recipient: recipientAddress,
      amount: invoiceAmount || undefined, // Omit amount for custom invoices
      reference: referencePubkey,
      label: merchantName,
      message: `Invoice ${id.slice(0, 8)}`,
    });

    setSolanaPayURI(solanaPayUri);

    // Generate QR code as data URL
    QRCode.toDataURL(solanaPayUri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 300,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
      .then(url => {
        setQrCodeDataUrl(url);
      })
      .catch(err => {
        console.error('[invoice/scan] Error generating QR code:', err);
      });

    // Calculate expiration time (10 minutes from now)
    const expiresAt = new Date(Date.now() + INVOICE_TIMEOUT);

    // Save invoice to localStorage
    const invoice: Invoice = {
      id,
      amount: invoiceAmount,
      allowCustomAmount: storedAllowCustom,
      recipient: recipientAddress,
      reference: referencePubkey,
      qrCode: solanaPayUri,
      status: 'pending',
      createdAt: new Date(),
      expiresAt,
    };

    saveInvoice(invoice);

    // Store invoice ID in sessionStorage for pending page
    sessionStorage.setItem('current_invoice_id', id);

    // Start watching for incoming USDC payments
    // RECEIVE-ONLY: This function only monitors incoming transfers
    console.log('[invoice/scan] Starting to watch for incoming USDC payments...');
    console.log('[invoice/scan] Reference:', referencePubkey);

    const cleanup = watchIncomingUSDCPayments({
      merchantAddress: recipientAddress,
      expectedAmount: invoiceAmount || undefined,
      reference: referencePubkey, // Pass reference for matching
      invoiceCreatedAt: invoice.createdAt, // Pass invoice creation time for fallback matching
      onPaymentDetected: (payment) => {
        console.log('[invoice/scan] Payment detected!', payment);
        console.log('[invoice/scan] Payment source:', payment.hasReference ? 'PRIMARY (Solana Pay)' : 'FALLBACK (USDC ATA)');
        console.log('[invoice/scan] Wallet type:', payment.walletType);

        // Update invoice status
        updateInvoiceStatus(id, 'success', payment.signature, payment.from);

        // Store payment details in sessionStorage for pending/success pages
        sessionStorage.setItem('invoice_signature', payment.signature);
        sessionStorage.setItem('invoice_from', payment.from);
        sessionStorage.setItem('invoice_amount', payment.amount.toString());

        // Navigate to pending page (which will immediately show success)
        router.push('/pos/invoice/pending');
      },
      onError: (error) => {
        console.error('[invoice/scan] Error watching for payments:', error);
      },
      timeout: INVOICE_TIMEOUT,
    });

    // Set up timeout to mark invoice as declined
    const timeoutId = setTimeout(() => {
      console.log('[invoice/scan] Invoice timeout reached');
      updateInvoiceStatus(id, 'declined');
      router.push('/pos/invoice/declined');
    }, INVOICE_TIMEOUT);

    // Cleanup on unmount
    return () => {
      cleanup();
      clearTimeout(timeoutId);
    };
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
              {invoiceId.slice(0, 8)}...
            </span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Reference</span>
            <span className={styles.detailValue}>
              {reference.slice(0, 4)}...{reference.slice(-4)}
            </span>
          </div>
        </div>

        <div className={styles.infoBox}>
          <p className={styles.infoText}>
            Customer scans QR with Phantom/Solflare to pay with USDC
          </p>
          <p className={styles.infoText} style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>
            Watching blockchain for incoming transfers. Timeout: 10 minutes.
          </p>
        </div>
      </div>
    </div>
  );
}
