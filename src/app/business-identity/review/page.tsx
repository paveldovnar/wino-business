'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { ArrowLeft, Building2 } from 'lucide-react';
import styles from './review.module.css';

export default function BusinessIdentityReviewPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    const name = sessionStorage.getItem('business_name');
    const logoData = sessionStorage.getItem('business_logo');

    if (!name) {
      router.replace('/business-identity/name');
      return;
    }

    setBusinessName(name);
    setLogo(logoData);
  }, [router]);

  const handleConfirm = () => {
    router.push('/business-identity/creating');
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          <ArrowLeft size={24} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Business identity</h1>
      </div>

      <div className={styles.content}>
        <div className={styles.step}>Step 2 of 2</div>

        <h2 className={styles.heading}>Review your details</h2>

        <div className={styles.card}>
          <div className={styles.logoWrapper}>
            {logo ? (
              <img src={logo} alt="Logo" className={styles.logo} />
            ) : (
              <div className={styles.logoPlaceholder}>
                <Building2 size={40} strokeWidth={2} />
              </div>
            )}
          </div>

          <div className={styles.details}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Business name</span>
              <span className={styles.detailValue}>{businessName}</span>
            </div>

            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Identity type</span>
              <span className={styles.detailValue}>NFT on Solana</span>
            </div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <p className={styles.infoText}>
            Your business identity will be minted as an NFT on the Solana blockchain.
            This ensures immutability and ownership verification.
          </p>
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          onClick={handleConfirm}
        >
          Confirm and create
        </Button>
      </div>
    </div>
  );
}
