'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { CheckCircle2, ExternalLink, Shield } from 'lucide-react';
import { getBusiness } from '@/lib/storage';
import { MintResult } from '@/lib/metaplex-mint';
import styles from './success.module.css';

export default function IdentityMintSuccessPage() {
  const router = useRouter();
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [business, setBusiness] = useState<any>(null);

  useEffect(() => {
    const businessData = getBusiness();
    if (!businessData) {
      router.push('/dashboard');
      return;
    }

    setBusiness(businessData);

    // Get mint result from session storage
    const mintResultStr = sessionStorage.getItem('mint_result');
    if (mintResultStr) {
      try {
        const result = JSON.parse(mintResultStr) as MintResult;
        setMintResult(result);
        // Clear from session storage
        sessionStorage.removeItem('mint_result');
      } catch (err) {
        console.error('Failed to parse mint result:', err);
      }
    }
  }, [router]);

  const handleViewOnSolscan = () => {
    if (mintResult?.mintAddress) {
      window.open(`https://solscan.io/token/${mintResult.mintAddress}`, '_blank');
    } else if (business?.nftMintAddress) {
      window.open(`https://solscan.io/token/${business.nftMintAddress}`, '_blank');
    }
  };

  const mintAddress = mintResult?.mintAddress || business?.nftMintAddress;

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.iconWrapper}>
          <CheckCircle2 size={64} strokeWidth={2} className={styles.icon} />
        </div>

        <h2 className={styles.title}>Identity minted!</h2>

        <p className={styles.description}>
          Your Business Identity NFT has been successfully created on Solana mainnet.
        </p>

        <div className={styles.resultCard}>
          <div className={styles.resultRow}>
            <div className={styles.resultIcon}>
              <Shield size={20} strokeWidth={2} />
            </div>
            <div className={styles.resultContent}>
              <div className={styles.resultLabel}>Business Name</div>
              <div className={styles.resultValue}>{business?.name || 'Loading...'}</div>
            </div>
          </div>

          {mintAddress && (
            <div className={styles.resultRow}>
              <div className={styles.resultIcon}>
                <Shield size={20} strokeWidth={2} />
              </div>
              <div className={styles.resultContent}>
                <div className={styles.resultLabel}>NFT Mint Address</div>
                <div className={styles.resultValue} style={{ fontFamily: 'monospace', fontSize: '14px' }}>
                  {mintAddress.slice(0, 8)}...{mintAddress.slice(-8)}
                </div>
              </div>
            </div>
          )}

          {mintResult?.txSignature && !mintResult.txSignature.startsWith('MetaplexCreated_') && (
            <div className={styles.resultRow}>
              <div className={styles.resultIcon}>
                <ExternalLink size={20} strokeWidth={2} />
              </div>
              <div className={styles.resultContent}>
                <div className={styles.resultLabel}>Transaction</div>
                <div className={styles.resultValue} style={{ fontFamily: 'monospace', fontSize: '14px' }}>
                  {mintResult.txSignature.slice(0, 8)}...{mintResult.txSignature.slice(-8)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={styles.featureList}>
          <div className={styles.feature}>
            <div className={styles.featureDot}></div>
            <span>Publicly verifiable on Solana blockchain</span>
          </div>
          <div className={styles.feature}>
            <div className={styles.featureDot}></div>
            <span>Visible in your wallet</span>
          </div>
          <div className={styles.feature}>
            <div className={styles.featureDot}></div>
            <span>Permanently owned by you</span>
          </div>
        </div>

        {mintAddress && (
          <Button
            size="m"
            mode="outline"
            onClick={handleViewOnSolscan}
            className={styles.viewButton}
          >
            <ExternalLink size={20} strokeWidth={2} />
            <span>View on Solscan</span>
          </Button>
        )}
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          onClick={() => router.push('/dashboard')}
        >
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
