'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { ArrowLeft, Camera } from 'lucide-react';
import { Keypair } from '@solana/web3.js';
import styles from './scan.module.css';

export default function PayScanPage() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);

  const handleScan = () => {
    setScanning(true);

    setTimeout(() => {
      const mockRecipient = Keypair.generate().publicKey.toBase58();
      const mockAmount = (Math.random() * 200 + 50).toFixed(2);
      const mockInvoiceId = crypto.randomUUID();

      sessionStorage.setItem('pay_recipient', mockRecipient);
      sessionStorage.setItem('pay_amount', mockAmount);
      sessionStorage.setItem('pay_invoice_id', mockInvoiceId);

      router.push('/pay/details');
    }, 2000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          <ArrowLeft size={24} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Scan QR code</h1>
      </div>

      <div className={styles.content}>
        <div className={styles.cameraContainer}>
          <div className={styles.cameraPlaceholder}>
            <Camera size={64} strokeWidth={2} className={styles.cameraIcon} />
            <p className={styles.cameraText}>
              {scanning ? 'Scanning...' : 'Position QR code in the frame'}
            </p>
          </div>

          <div className={styles.scanFrame}>
            <div className={styles.scanCorner} style={{ top: 0, left: 0 }} />
            <div className={styles.scanCorner} style={{ top: 0, right: 0 }} />
            <div className={styles.scanCorner} style={{ bottom: 0, left: 0 }} />
            <div className={styles.scanCorner} style={{ bottom: 0, right: 0 }} />
          </div>
        </div>

        <div className={styles.info}>
          <p className={styles.infoText}>
            Scan the merchant's QR code to proceed with payment
          </p>
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? 'Scanning...' : 'Simulate scan'}
        </Button>
      </div>
    </div>
  );
}
