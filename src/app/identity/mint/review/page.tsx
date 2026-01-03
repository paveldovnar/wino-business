'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { Button } from '@telegram-apps/telegram-ui';
import { X, Shield, Wallet, Building2, AlertCircle } from 'lucide-react';
import { getBusiness } from '@/lib/storage';
import { Business } from '@/types';
import styles from './review.module.css';

export default function IdentityMintReviewPage() {
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const [business, setBusiness] = useState<Business | null>(null);

  useEffect(() => {
    const businessData = getBusiness();
    if (!businessData) {
      router.push('/dashboard');
      return;
    }

    // If already minted, redirect to dashboard
    if (businessData.nftMintAddress) {
      router.push('/dashboard');
      return;
    }

    setBusiness(businessData);
  }, [router]);

  if (!business) {
    return null;
  }

  const handleMint = () => {
    if (!connected || !publicKey) {
      // Redirect to connect wallet
      router.push('/connect-wallet');
      return;
    }

    router.push('/identity/mint/creating');
  };

  const estimatedCost = '0.01-0.02 SOL';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.push('/dashboard')} className={styles.closeButton}>
          <X size={24} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Mint Business Identity</h1>
      </div>

      <div className={styles.content}>
        <div className={styles.iconWrapper}>
          <Shield size={48} strokeWidth={2} className={styles.icon} />
        </div>

        <h2 className={styles.heading}>Create your on-chain identity</h2>

        <p className={styles.description}>
          Mint a Business Identity NFT on Solana to publicly verify your business.
          This is completely optional and does not affect payment functionality.
        </p>

        <div className={styles.detailsCard}>
          <div className={styles.detailRow}>
            <div className={styles.detailIcon}>
              <Building2 size={20} strokeWidth={2} />
            </div>
            <div className={styles.detailContent}>
              <div className={styles.detailLabel}>Business Name</div>
              <div className={styles.detailValue}>{business.name}</div>
            </div>
          </div>

          <div className={styles.detailRow}>
            <div className={styles.detailIcon}>
              <Wallet size={20} strokeWidth={2} />
            </div>
            <div className={styles.detailContent}>
              <div className={styles.detailLabel}>Wallet Address</div>
              <div className={styles.detailValue}>
                {publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : 'Not connected'}
              </div>
            </div>
          </div>

          <div className={styles.detailRow}>
            <div className={styles.detailIcon}>
              <Shield size={20} strokeWidth={2} />
            </div>
            <div className={styles.detailContent}>
              <div className={styles.detailLabel}>Collection</div>
              <div className={styles.detailValue}>Wino Business Identity</div>
            </div>
          </div>
        </div>

        <div className={styles.infoBox}>
          <AlertCircle size={20} strokeWidth={2} className={styles.infoIcon} />
          <div className={styles.infoContent}>
            <div className={styles.infoTitle}>Estimated cost</div>
            <div className={styles.infoText}>
              {estimatedCost} (~$2-4 USD) for transaction fees and storage rent.
            </div>
          </div>
        </div>

        <div className={styles.featureList}>
          <div className={styles.feature}>
            <div className={styles.featureDot}></div>
            <span>Publicly verifiable on-chain</span>
          </div>
          <div className={styles.feature}>
            <div className={styles.featureDot}></div>
            <span>No subscription or recurring fees</span>
          </div>
          <div className={styles.feature}>
            <div className={styles.featureDot}></div>
            <span>Your wallet remains in full control</span>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          onClick={handleMint}
          disabled={!connected || !publicKey}
        >
          Continue to mint
        </Button>
        <Button
          size="l"
          stretched
          mode="outline"
          onClick={() => router.push('/dashboard')}
        >
          Maybe later
        </Button>
      </div>
    </div>
  );
}
