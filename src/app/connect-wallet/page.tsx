'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { Button } from '@telegram-apps/telegram-ui';
import { Wallet, ArrowLeft, LogOut } from 'lucide-react';
import { getBusiness } from '@/lib/storage';
import styles from './connect-wallet.module.css';

type ConnectState = 'idle' | 'connecting' | 'connected' | 'routing' | 'error';

export default function ConnectWalletPage() {
  const router = useRouter();
  const { connect, connected, connecting, disconnect, select, wallets, publicKey } = useWallet();
  const [connectState, setConnectState] = useState<ConnectState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const hasRoutedRef = useRef(false);

  // Effect to handle routing when wallet is connected
  useEffect(() => {
    // Only proceed if:
    // 1. Wallet is connected
    // 2. We have a public key (stable connection)
    // 3. We haven't routed yet
    if (connected && publicKey && !hasRoutedRef.current) {
      const isDev = process.env.NODE_ENV === 'development';

      if (isDev) {
        console.log('[connect-wallet] Stable connection detected:', {
          connected,
          publicKey: publicKey.toBase58(),
          hasRouted: hasRoutedRef.current,
        });
      }

      // Set a small delay to ensure connection is fully stable
      const timeoutId = setTimeout(() => {
        if (hasRoutedRef.current) {
          if (isDev) console.log('[connect-wallet] Already routed, skipping');
          return;
        }

        setConnectState('routing');

        // Check if business profile already exists
        const existingBusiness = getBusiness();

        if (isDev) {
          console.log('[connect-wallet] Routing decision:', {
            businessExists: !!existingBusiness,
            businessName: existingBusiness?.name,
          });
        }

        hasRoutedRef.current = true;

        if (existingBusiness) {
          // Business exists - go to dashboard
          if (isDev) console.log('[connect-wallet] → Routing to /dashboard');
          router.push('/dashboard');
        } else {
          // No business profile - start onboarding
          if (isDev) console.log('[connect-wallet] → Routing to /business-identity/name');
          router.push('/business-identity/name');
        }
      }, 500); // 500ms delay for connection stability

      return () => clearTimeout(timeoutId);
    }
  }, [connected, publicKey, router]);

  // Effect to update state based on wallet connection status
  useEffect(() => {
    if (connecting) {
      setConnectState('connecting');
      setErrorMessage('');
    } else if (connected && publicKey) {
      setConnectState('connected');
    } else if (!connected && !connecting && connectState !== 'idle') {
      // Disconnected after being connected
      setConnectState('idle');
      hasRoutedRef.current = false;
    }
  }, [connecting, connected, publicKey, connectState]);

  const handleConnectWallet = async () => {
    try {
      const isDev = process.env.NODE_ENV === 'development';

      if (isDev) {
        console.log('[connect-wallet] Starting connection...');
        console.log('[connect-wallet] Available wallets:', wallets.map(w => w.adapter.name));
      }

      // Find WalletConnect adapter
      const walletConnectWallet = wallets.find(
        wallet => wallet.adapter.name === 'WalletConnect'
      );

      if (!walletConnectWallet) {
        const errorMsg = 'WalletConnect adapter not found';
        console.error('[connect-wallet]', errorMsg);
        setErrorMessage(errorMsg);
        setConnectState('error');
        return;
      }

      // Select the wallet adapter
      if (isDev) console.log('[connect-wallet] Selecting WalletConnect adapter...');
      select(walletConnectWallet.adapter.name);

      // Connect to wallet
      if (isDev) console.log('[connect-wallet] Calling connect()...');
      await connect();

      if (isDev) console.log('[connect-wallet] connect() completed');

      // Note: Routing is handled by the useEffect above
      // This ensures routing happens even if connect() completes but state updates are delayed

    } catch (err: any) {
      // User cancelled or error occurred
      console.error('[connect-wallet] Connection failed:', err);
      setErrorMessage(err?.message || 'Connection failed');
      setConnectState('error');
      hasRoutedRef.current = false;
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setConnectState('idle');
      setErrorMessage('');
      hasRoutedRef.current = false;

      if (process.env.NODE_ENV === 'development') {
        console.log('[connect-wallet] Disconnected');
      }
    } catch (err) {
      console.error('[connect-wallet] Failed to disconnect:', err);
    }
  };

  const handleContinue = () => {
    // Manual trigger for routing (safety net)
    if (connected && publicKey && !hasRoutedRef.current) {
      setConnectState('routing');

      const existingBusiness = getBusiness();
      hasRoutedRef.current = true;

      if (existingBusiness) {
        router.push('/dashboard');
      } else {
        router.push('/business-identity/name');
      }
    }
  };

  // Determine button state
  const getButtonConfig = () => {
    switch (connectState) {
      case 'connecting':
        return {
          text: 'Connecting...',
          disabled: true,
          onClick: handleConnectWallet,
        };
      case 'connected':
        return {
          text: 'Continue',
          disabled: false,
          onClick: handleContinue,
        };
      case 'routing':
        return {
          text: 'Loading...',
          disabled: true,
          onClick: handleContinue,
        };
      case 'error':
        return {
          text: 'Retry Connection',
          disabled: false,
          onClick: handleConnectWallet,
        };
      default: // idle
        return {
          text: 'Connect Wallet',
          disabled: false,
          onClick: handleConnectWallet,
        };
    }
  };

  const buttonConfig = getButtonConfig();

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

        {errorMessage && (
          <div className={styles.errorBox}>
            <p className={styles.errorText}>{errorMessage}</p>
          </div>
        )}

        {connected && publicKey && connectState === 'connected' && (
          <div className={styles.successBox}>
            <p className={styles.successText}>
              Connected: {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
            </p>
          </div>
        )}

        <div className={styles.methods}>
          <div className={styles.method}>
            <h3 className={styles.methodTitle}>WalletConnect</h3>
            <Button
              size="l"
              stretched
              onClick={buttonConfig.onClick}
              disabled={buttonConfig.disabled}
              className={styles.methodButton}
            >
              {buttonConfig.text}
            </Button>

            {connected && connectState !== 'routing' && (
              <Button
                size="l"
                stretched
                mode="outline"
                onClick={handleDisconnect}
                className={styles.disconnectButton}
                style={{ marginTop: '12px' }}
              >
                <LogOut size={16} strokeWidth={2} style={{ marginRight: '8px' }} />
                Disconnect
              </Button>
            )}

            <p style={{ marginTop: '12px', fontSize: '14px', color: 'var(--tgui--secondary_hint_color)', textAlign: 'center' }}>
              {connectState === 'connected' || connectState === 'routing'
                ? 'Click Continue to proceed'
                : 'Scan QR code with your Solana mobile wallet'}
            </p>
          </div>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <div style={{ marginTop: '24px', padding: '12px', background: 'rgba(0,0,0,0.1)', borderRadius: '8px', fontSize: '12px' }}>
            <div><strong>Debug Info:</strong></div>
            <div>State: {connectState}</div>
            <div>Connected: {String(connected)}</div>
            <div>Connecting: {String(connecting)}</div>
            <div>PublicKey: {publicKey ? 'Yes' : 'No'}</div>
            <div>HasRouted: {String(hasRoutedRef.current)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
