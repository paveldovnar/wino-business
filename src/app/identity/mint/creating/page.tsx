'use client';

import { useEffect, useState, useRef } from 'react';
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
  const mintStartedRef = useRef(false);

  useEffect(() => {
    if (cancelled || error || mintStartedRef.current) return;

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
      setError('Wallet not connected. Please go back and connect your wallet.');
      return;
    }

    // Prevent double execution
    mintStartedRef.current = true;

    const performMint = async () => {
      try {
        // Step 1: Prepare
        setStatus('Preparing transaction...');
        setProgress(10);

        if (cancelled) return;

        // Step 2: Build transaction via API
        setStatus('Building mint transaction...');
        setProgress(30);

        if (cancelled) return;

        // Step 3: Sign with wallet (this triggers WalletConnect modal)
        setStatus('Please approve in your wallet...');
        setProgress(50);

        const mintResult = await mintBusinessIdentityNFT({
          connection,
          wallet,
          businessName: business.name,
          logo: business.logo,
        });

        if (cancelled) return;

        // Step 4: Verify on-chain
        setStatus('Verifying on-chain...');
        setProgress(80);

        // Verify the mint exists on-chain
        const verifyRes = await fetch(`/api/identity/verify?mint=${mintResult.mintAddress}`);
        const verifyData = await verifyRes.json();

        if (!verifyData.verified) {
          console.warn('[Mint] Verification pending, mint may still be confirming');
        } else {
          console.log('[Mint] Verified on-chain:', verifyData.nft);
        }

        // Step 5: Save result (only after verification attempt)
        setStatus('Saving...');
        setProgress(90);

        // Update business with mint address
        const updatedBusiness = {
          ...business,
          nftMintAddress: mintResult.mintAddress,
        };
        saveBusiness(updatedBusiness);

        // Store mint result for success page
        sessionStorage.setItem('mint_result', JSON.stringify({
          ...mintResult,
          verified: verifyData.verified,
        }));

        setProgress(100);
        setStatus('Complete!');

        await new Promise(resolve => setTimeout(resolve, 500));

        if (!cancelled) {
          router.push('/identity/mint/success');
        }

      } catch (err: any) {
        console.error('[Mint] Error:', err);
        mintStartedRef.current = false; // Allow retry
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
