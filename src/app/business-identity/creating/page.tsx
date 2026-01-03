'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { Button } from '@telegram-apps/telegram-ui';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { saveBusiness } from '@/lib/storage';
import { Business } from '@/types';
import styles from './creating.module.css';

export default function BusinessIdentityCreatingPage() {
  const router = useRouter();
  const wallet = useWallet();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Saving your profile...');
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (cancelled) return;

    const createBusinessProfile = async () => {
      const name = sessionStorage.getItem('business_name');
      const logoData = sessionStorage.getItem('business_logo');

      if (!name) {
        router.replace('/business-identity/name');
        return;
      }

      // Simulate progress for better UX
      setProgress(30);
      await new Promise(resolve => setTimeout(resolve, 500));

      if (cancelled) return;

      setProgress(70);

      // Create and save business profile (WITHOUT NFT)
      const business: Business = {
        id: crypto.randomUUID(),
        name,
        logo: logoData || undefined,
        walletAddress: wallet.publicKey?.toBase58() || 'not-connected',
        nftMintAddress: undefined, // No NFT minting in initial setup
        createdAt: new Date(),
      };

      saveBusiness(business);

      setProgress(100);
      setStatus('Complete!');

      // Clear session storage
      sessionStorage.removeItem('business_name');
      sessionStorage.removeItem('business_logo');

      await new Promise(resolve => setTimeout(resolve, 500));

      if (!cancelled) {
        router.push('/dashboard');
      }
    };

    createBusinessProfile();
  }, [cancelled, wallet, router]);

  const handleCancel = () => {
    setCancelled(true);
    router.back();
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <LoadingSpinner size={64} />

        <h2 className={styles.title}>Creating business profile</h2>

        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={styles.progressText}>{Math.round(progress)}%</span>
        </div>

        <p className={styles.status}>{status}</p>

        <div className={styles.info}>
          <p className={styles.infoText}>
            Your business profile is being created. You can optionally mint an identity NFT later from the dashboard.
          </p>
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          mode="outline"
          onClick={handleCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
