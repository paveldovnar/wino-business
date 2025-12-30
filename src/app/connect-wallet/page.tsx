'use client';

import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { Button, Input } from '@telegram-apps/telegram-ui';
import { Wallet, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import styles from './connect-wallet.module.css';

export default function ConnectWalletPage() {
  const router = useRouter();
  const { select, connect } = useWallet();
  const [seedPhrase, setSeedPhrase] = useState('');

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setSeedPhrase(text);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  const handleContinue = () => {
    router.push('/importing');
  };

  const handleConnectPhantom = async () => {
    select('Phantom');
    try {
      await connect();
      router.push('/business-identity/name');
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          <ArrowLeft size={24} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Connect wallet</h1>
      </div>

      <div className={styles.content}>
        <div className={styles.iconWrapper}>
          <Wallet size={48} strokeWidth={2} />
        </div>

        <p className={styles.description}>
          Connect your Solana wallet to create your business identity NFT
        </p>

        <div className={styles.methods}>
          <div className={styles.method}>
            <h3 className={styles.methodTitle}>Wallet app</h3>
            <Button
              size="l"
              stretched
              onClick={handleConnectPhantom}
              className={styles.methodButton}
            >
              Connect Phantom
            </Button>
          </div>

          <div className={styles.divider}>
            <span>OR</span>
          </div>

          <div className={styles.method}>
            <h3 className={styles.methodTitle}>Recovery phrase</h3>
            <Input
              header="Seed phrase"
              placeholder="Enter your recovery phrase"
              value={seedPhrase}
              onChange={(e) => setSeedPhrase(e.target.value)}
              className={styles.input}
            />
            <div className={styles.inputActions}>
              <Button
                size="m"
                mode="outline"
                onClick={handlePaste}
              >
                Paste
              </Button>
              <Button
                size="m"
                disabled={!seedPhrase}
                onClick={handleContinue}
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
