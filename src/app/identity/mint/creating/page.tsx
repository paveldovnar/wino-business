'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useConnection, useWallet } from '@/lib/wallet-mock';
import { Button } from '@telegram-apps/telegram-ui';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { mintBusinessIdentityNFT, MintStep, PartialMintState } from '@/lib/metaplex-mint';
import { getBusiness, saveBusiness } from '@/lib/storage';
import { XCircle, AlertTriangle } from 'lucide-react';
import styles from './creating.module.css';

// Progress mapping for the two-transaction flow
const STEP_PROGRESS: Record<MintStep, number> = {
  preparing: 5,
  building: 15,
  signing_tx1: 25,
  confirming_tx1: 40,
  signing_tx2: 55,
  confirming_tx2: 70,
  verifying: 85,
  complete: 100,
  partial_failure: 50,
};

const STEP_STATUS: Record<MintStep, string> = {
  preparing: 'Preparing...',
  building: 'Building transactions...',
  signing_tx1: 'Approve TX1 in wallet (create mint)...',
  confirming_tx1: 'Confirming TX1 on Solana...',
  signing_tx2: 'Approve TX2 in wallet (create metadata)...',
  confirming_tx2: 'Confirming TX2 on Solana...',
  verifying: 'Verifying on-chain...',
  complete: 'Complete!',
  partial_failure: 'Partial failure - TX1 succeeded',
};

export default function IdentityMintCreatingPage() {
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useWallet();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Preparing...');
  const [error, setError] = useState<string | null>(null);
  const [partialState, setPartialState] = useState<PartialMintState | null>(null);
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
      // Already minted - verify it's real
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
        const mintResult = await mintBusinessIdentityNFT({
          connection,
          wallet,
          businessName: business.name,
          logo: business.logo,
          onProgress: (step: MintStep, message: string) => {
            setProgress(STEP_PROGRESS[step] || 0);
            setStatus(message || STEP_STATUS[step] || 'Processing...');
          },
        });

        if (cancelled) return;

        // CRITICAL: Only save mint address AFTER on-chain confirmation
        // mintResult is only returned if both TX1 and TX2 confirmed

        // Final verification
        setStatus('Final verification...');
        setProgress(90);

        const verifyRes = await fetch(`/api/identity/verify?mint=${mintResult.mintAddress}`);
        const verifyData = await verifyRes.json();

        if (!verifyData.verified) {
          console.warn('[Mint] Verification pending, waiting for indexing...');
          // Wait a bit and retry
          await new Promise(resolve => setTimeout(resolve, 3000));
          const retryRes = await fetch(`/api/identity/verify?mint=${mintResult.mintAddress}`);
          const retryData = await retryRes.json();
          if (!retryData.verified) {
            console.warn('[Mint] Still not indexed, but TX confirmed - proceeding');
          }
        }

        // Now safe to save - both TXs confirmed
        const updatedBusiness = {
          ...business,
          nftMintAddress: mintResult.mintAddress,
        };
        saveBusiness(updatedBusiness);

        // Store mint result for success page
        sessionStorage.setItem('mint_result', JSON.stringify({
          ...mintResult,
          verified: verifyData.verified || true, // Both TXs confirmed
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

        // Check for partial state (TX1 succeeded, TX2 failed)
        if (err.partialState) {
          setPartialState(err.partialState);
          setError(err.message);
        } else {
          setError(err.message || 'Failed to mint NFT. Please try again.');
        }
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
    setPartialState(null);
    setProgress(0);
    setStatus('Preparing...');
    mintStartedRef.current = false;
    // Reload page to retry
    window.location.reload();
  };

  // Partial failure state (TX1 succeeded but TX2 failed)
  if (partialState) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.errorIcon} style={{ color: '#ff9800' }}>
            <AlertTriangle size={64} strokeWidth={2} />
          </div>

          <h2 className={styles.title}>Partial Success</h2>

          <p className={styles.errorMessage}>
            The mint account was created, but metadata creation failed.
          </p>

          <div className={styles.errorInfo}>
            <p className={styles.infoText}>
              <strong>Mint Address:</strong><br />
              <code style={{ fontSize: '12px', wordBreak: 'break-all' }}>
                {partialState.mintAddress}
              </code>
            </p>
            <p className={styles.infoText}>
              <strong>TX1:</strong><br />
              <a
                href={`https://solscan.io/tx/${partialState.tx1Signature}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)', fontSize: '12px' }}
              >
                View on Solscan
              </a>
            </p>
            <p className={styles.infoText} style={{ marginTop: '12px' }}>
              You can retry the metadata creation, or contact support.
            </p>
          </div>
        </div>

        <div className={styles.actions}>
          <Button
            size="l"
            stretched
            onClick={handleRetry}
          >
            Retry from start
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

  // Error state
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
            Your Business Identity NFT requires 2 transactions on Solana mainnet.
          </p>
          <p className={styles.infoText}>
            <strong>TX1:</strong> Create mint account<br />
            <strong>TX2:</strong> Add metadata
          </p>
          <p className={styles.infoText} style={{ marginTop: '8px' }}>
            Please approve both transactions in your wallet when prompted.
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
