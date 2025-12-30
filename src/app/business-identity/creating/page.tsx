'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnection, useWallet } from '@/lib/wallet-mock';
import { Button } from '@telegram-apps/telegram-ui';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { mintBusinessNFT, generateMockMintAddress } from '@/lib/nft';
import styles from './creating.module.css';

export default function BusinessIdentityCreatingPage() {
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Preparing...');
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (cancelled) return;

    const steps = [
      { text: 'Preparing metadata...', duration: 1000 },
      { text: 'Creating NFT...', duration: 2000 },
      { text: 'Finalizing...', duration: 1000 },
    ];

    let currentStep = 0;
    let progressValue = 0;

    const runSteps = async () => {
      for (const step of steps) {
        if (cancelled) return;

        setStatus(step.text);
        const increment = 100 / steps.length;
        const stepStart = progressValue;
        const stepEnd = Math.min(progressValue + increment, 100);

        const startTime = Date.now();
        const animate = () => {
          if (cancelled) return;

          const elapsed = Date.now() - startTime;
          const stepProgress = Math.min(elapsed / step.duration, 1);
          const currentProgress = stepStart + (stepEnd - stepStart) * stepProgress;

          setProgress(currentProgress);

          if (stepProgress < 1) {
            requestAnimationFrame(animate);
          }
        };

        animate();
        await new Promise(resolve => setTimeout(resolve, step.duration));
        progressValue = stepEnd;
        currentStep++;
      }

      if (!cancelled) {
        const name = sessionStorage.getItem('business_name') || 'Business';

        let mintAddress: string | null = null;

        if (wallet.connected && wallet.publicKey) {
          mintAddress = await mintBusinessNFT({
            connection,
            wallet,
            name,
          });
        }

        if (!mintAddress) {
          mintAddress = generateMockMintAddress();
        }

        sessionStorage.setItem('nft_mint_address', mintAddress);
        setProgress(100);
        setStatus('Complete!');

        setTimeout(() => {
          router.push('/business-identity/success');
        }, 500);
      }
    };

    runSteps();
  }, [cancelled, connection, wallet, router]);

  const handleCancel = () => {
    setCancelled(true);
    router.back();
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <LoadingSpinner size={64} />

        <h2 className={styles.title}>Creating business identity</h2>

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
            Your business identity is being minted as an NFT on Solana.
            This process may take a minute.
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
