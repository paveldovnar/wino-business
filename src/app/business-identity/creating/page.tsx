'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet, useConnection } from '@/lib/wallet-mock';
import { Button } from '@telegram-apps/telegram-ui';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AlertCircle, CheckCircle2, Send, Upload, FileCheck } from 'lucide-react';
import { buildCreateIdentityTransaction, deriveIdentityPDA, getSolscanLink } from '@/lib/identity-pda';
import { saveBusiness } from '@/lib/storage';
import { Business } from '@/types';
import styles from './creating.module.css';

type CreationStep = 'building' | 'signing' | 'confirming' | 'success' | 'error';

interface StepInfo {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const STEP_INFO: Record<CreationStep, StepInfo> = {
  building: {
    icon: <Upload size={32} strokeWidth={2} />,
    title: 'Building transaction',
    description: 'Preparing your identity transaction...',
  },
  signing: {
    icon: <Send size={32} strokeWidth={2} />,
    title: 'Sign transaction',
    description: 'Please approve the transaction in your wallet',
  },
  confirming: {
    icon: <FileCheck size={32} strokeWidth={2} />,
    title: 'Confirming on-chain',
    description: 'Waiting for Solana network confirmation...',
  },
  success: {
    icon: <CheckCircle2 size={32} strokeWidth={2} />,
    title: 'Identity created!',
    description: 'Your business identity is now on-chain',
  },
  error: {
    icon: <AlertCircle size={32} strokeWidth={2} />,
    title: 'Creation failed',
    description: 'Something went wrong. Please try again.',
  },
};

export default function BusinessIdentityCreatingPage() {
  const router = useRouter();
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const [step, setStep] = useState<CreationStep>('building');
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [identityPda, setIdentityPda] = useState<string | null>(null);
  const hasStarted = useRef(false);

  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet') as 'devnet' | 'mainnet-beta';

  const createIdentity = useCallback(async () => {
    if (!publicKey || !signTransaction || !connection) {
      setError('Wallet not connected or signing not available');
      setStep('error');
      return;
    }

    const walletAddress = publicKey.toBase58();
    const name = sessionStorage.getItem('business_name');
    const logoData = sessionStorage.getItem('business_logo');

    if (!name) {
      router.replace('/business-identity/name');
      return;
    }

    // For now, use empty logo_uri or upload to Arweave separately
    // In production, you'd upload logo to Irys/Arweave first
    let logoUri = '';
    if (logoData) {
      // TODO: Upload logo to Irys/Arweave and get URI
      // For now, we'll skip logo upload and just store empty string
      console.log('[creating] Logo data present but skipping upload for now');
    }

    try {
      // Step 1: Build transaction
      setStep('building');
      console.log('[creating] Building create_identity transaction...');

      const [pda] = deriveIdentityPDA(publicKey);
      setIdentityPda(pda.toBase58());

      const transaction = await buildCreateIdentityTransaction(
        connection,
        publicKey,
        name,
        logoUri
      );

      console.log('[creating] Transaction built, PDA:', pda.toBase58());

      // Step 2: Sign transaction
      setStep('signing');
      console.log('[creating] Requesting wallet signature...');

      let signedTx;
      try {
        signedTx = await signTransaction(transaction);
        console.log('[creating] Transaction signed');
      } catch (signError: any) {
        console.error('[creating] Signature rejected:', signError);
        setError('Transaction was rejected. Please try again.');
        setStep('error');
        return;
      }

      // Step 3: Send and confirm
      setStep('confirming');
      console.log('[creating] Sending transaction...');

      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      setTxSignature(signature);
      console.log('[creating] Transaction sent:', signature);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        console.error('[creating] Transaction failed:', confirmation.value.err);
        setError('Transaction failed on-chain. Please try again.');
        setStep('error');
        return;
      }

      console.log('[creating] Transaction confirmed!');

      // Step 4: Success
      setStep('success');

      const business: Business = {
        id: crypto.randomUUID(),
        name,
        logo: logoData || undefined,
        logoUri: logoUri || undefined,
        walletAddress,
        identityPda: pda.toBase58(),
        identityTxSignature: signature,
        createdAt: new Date(),
      };

      saveBusiness(business);

      // Store for success page
      sessionStorage.setItem('identity_pda', pda.toBase58());
      sessionStorage.setItem('identity_tx_signature', signature);

      // Redirect to success after a brief moment
      await new Promise(resolve => setTimeout(resolve, 1500));
      router.push('/business-identity/success');

    } catch (err: any) {
      console.error('[creating] Unexpected error:', err);
      setError(err.message || 'An unexpected error occurred');
      setStep('error');
    }
  }, [publicKey, signTransaction, connection, router]);

  useEffect(() => {
    if (hasStarted.current) return;
    if (!connected || !publicKey) {
      router.replace('/connect-wallet');
      return;
    }

    hasStarted.current = true;
    createIdentity();
  }, [connected, publicKey, createIdentity, router]);

  const handleRetry = () => {
    setError(null);
    setStep('building');
    hasStarted.current = false;
    createIdentity();
  };

  const handleCancel = () => {
    router.push('/business-identity/review');
  };

  const currentStep = STEP_INFO[step];
  const isError = step === 'error';
  const isSuccess = step === 'success';

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={`${styles.iconWrapper} ${isError ? styles.iconError : ''} ${isSuccess ? styles.iconSuccess : ''}`}>
          {step === 'building' || step === 'signing' || step === 'confirming' ? (
            <LoadingSpinner size={64} />
          ) : (
            currentStep.icon
          )}
        </div>

        <h2 className={styles.title}>{currentStep.title}</h2>
        <p className={styles.status}>{error || currentStep.description}</p>

        {txSignature && !isError && (
          <div className={styles.txInfo}>
            <span className={styles.txLabel}>Transaction:</span>
            <a
              href={getSolscanLink(txSignature, cluster)}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.txLink}
            >
              {txSignature.slice(0, 8)}...{txSignature.slice(-8)}
            </a>
          </div>
        )}

        {identityPda && !isError && (
          <div className={styles.txInfo}>
            <span className={styles.txLabel}>Identity PDA:</span>
            <span className={styles.txLink}>
              {identityPda.slice(0, 8)}...{identityPda.slice(-8)}
            </span>
          </div>
        )}

        <div className={styles.steps}>
          <StepIndicator label="Build" active={step === 'building'} completed={['signing', 'confirming', 'success'].includes(step)} />
          <StepIndicator label="Sign" active={step === 'signing'} completed={['confirming', 'success'].includes(step)} />
          <StepIndicator label="Confirm" active={step === 'confirming'} completed={step === 'success'} />
        </div>
      </div>

      <div className={styles.actions}>
        {isError ? (
          <>
            <Button size="l" stretched onClick={handleRetry}>
              Try again
            </Button>
            <Button size="l" stretched mode="outline" onClick={handleCancel}>
              Back
            </Button>
          </>
        ) : !isSuccess ? (
          <Button size="l" stretched mode="outline" onClick={handleCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function StepIndicator({ label, active, completed }: { label: string; active: boolean; completed: boolean }) {
  return (
    <div className={`${styles.stepIndicator} ${active ? styles.stepActive : ''} ${completed ? styles.stepCompleted : ''}`}>
      <div className={styles.stepDot} />
      <span className={styles.stepLabel}>{label}</span>
    </div>
  );
}
