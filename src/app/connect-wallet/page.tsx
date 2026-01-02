'use client';

import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { Button } from '@telegram-apps/telegram-ui';
import { Wallet, ArrowLeft } from 'lucide-react';
import { getBusiness } from '@/lib/storage';
import styles from './connect-wallet.module.css';

export default function ConnectWalletPage() {
  const router = useRouter();
  const { connect, connected, connecting, select, wallets } = useWallet();

  const handleConnectWallet = async () => {
    try {
      // Debug: Log available wallet adapters
      console.log('Available wallets:', wallets.map(w => w.adapter.name));

      // Find WalletConnect adapter
      const walletConnectWallet = wallets.find(
        wallet => wallet.adapter.name === 'WalletConnect'
      );

      if (!walletConnectWallet) {
        console.error('WalletConnect adapter not found. Available wallets:', wallets.map(w => w.adapter.name));
        return;
      }

      // IMPORTANT: Must call select() before connect() in wallet-adapter
      // This tells the adapter which wallet to use
      console.log('Selecting WalletConnect adapter...');
      select(walletConnectWallet.adapter.name);

      // Now connect - this will open the WalletConnect QR modal
      console.log('Calling connect...');
      await connect();

      console.log('Wallet connected successfully');

      // Check if business profile already exists
      const existingBusiness = getBusiness();
      if (existingBusiness) {
        // Business exists - go to dashboard
        console.log('[connect-wallet] Business profile exists, routing to dashboard');
        router.push('/dashboard');
      } else {
        // No business profile - start onboarding
        console.log('[connect-wallet] No business profile, starting onboarding');
        router.push('/business-identity/name');
      }
    } catch (err) {
      // User cancelled connection or error occurred
      // Stay on this screen and log error
      console.error('Wallet connection failed:', err);
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
            <h3 className={styles.methodTitle}>WalletConnect</h3>
            <Button
              size="l"
              stretched
              onClick={handleConnectWallet}
              disabled={connecting || connected}
              className={styles.methodButton}
            >
              {connecting ? 'Connecting...' : connected ? 'Connected' : 'Connect Wallet'}
            </Button>
            <p style={{ marginTop: '12px', fontSize: '14px', color: 'var(--tgui--secondary_hint_color)', textAlign: 'center' }}>
              Scan QR code with your Solana mobile wallet
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
