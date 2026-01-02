'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnection, useWallet } from '@/lib/wallet-mock';
import { Button } from '@telegram-apps/telegram-ui';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { mintBusinessIdentityNFT } from '@/lib/metaplex-mint';
import { getBusiness, saveBusiness } from '@/lib/storage';
import { XCircle } from 'lucide-react';
import styles from './creating.module.css';

export default function IdentityMintCreatingPage() {
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Preparing...');
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (cancelled || error) return;

    const business = getBusiness();
    if (!business) {
      router.push('/dashboard');
      return;
    }

    if (business.nftMintAddress) {
      // Already minted
      router.push('/dashboard');
      return;
    }

    if (!wallet.connected || !wallet.publicKey) {
      setError('Wallet not connected');
      return;
    }

    const performMint = async () => {
      try {
        // Step 1: Prepare
        setStatus('Preparing metadata...');
        setProgress(10);
        await new Promise(resolve => setTimeout(resolve, 500));

        if (cancelled) return;

        // Step 2: Upload metadata
        setStatus('Uploading metadata to Arweave...');
        setProgress(30);

        if (cancelled) return;

        // Step 3: Create NFT with Metaplex
        setStatus('Creating NFT on Solana...');
        setProgress(50);

        const mintResult = await mintBusinessIdentityNFT({
          connection,
          wallet,
          businessName: business.name,
          logo: business.logo,
        });

        if (cancelled) return;

        // Step 4: Save result
        setStatus('Finalizing...');
        setProgress(90);

        // Update business with mint address
        const updatedBusiness = {
          ...business,
          nftMintAddress: mintResult.mintAddress,
        };
        saveBusiness(updatedBusiness);

        // Store mint result for success page
        sessionStorage.setItem('mint_result', JSON.stringify(mintResult));

        setProgress(100);
        setStatus('Complete!');

        await new Promise(resolve => setTimeout(resolve, 500));

        if (!cancelled) {
          router.push('/identity/mint/success');
        }

      } catch (err: any) {
        console.error('[Mint] Error:', err);
        setError(err.message || 'Failed to mint NFT. Please try again.');
        setProgress(0);
      }
    };

    performMint();
  }, [cancelled, connection, wallet, router, error]);

  const handleCancel = () => {
    setCancelled(true);
    router.push('/dashboard');
  };

  const handleRetry = () => {
    setError(null);
    setProgress(0);
    setStatus('Preparing...');
    // Reload page to retry
    window.location.reload();
  };

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.errorIcon}>
            <XCircle size={64} strokeWidth={2} />
          </div>

          <h2 className={styles.title}>Minting failed</h2>

          <p className={styles.errorMessage}>{error}</p>

          <div className={styles.errorInfo}>
            <p className={styles.infoText}>
              Common issues:
            </p>
            <ul className={styles.errorList}>
              <li>Insufficient SOL balance (need ~0.02 SOL)</li>
              <li>Transaction cancelled in wallet</li>
              <li>Network timeout or RPC issues</li>
            </ul>
          </div>
        </div>

        <div className={styles.actions}>
          <Button
            size="l"
            stretched
            onClick={handleRetry}
          >
            Try again
          </Button>
          <Button
            size="l"
            stretched
            mode="outline"
            onClick={() => router.push('/dashboard')}
          >
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <LoadingSpinner size={64} />

        <h2 className={styles.title}>Minting your identity</h2>

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
            Your Business Identity NFT is being created on Solana mainnet.
            This may take 1-2 minutes.
          </p>
          <p className={styles.infoText}>
            Please approve the transaction in your wallet when prompted.
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
