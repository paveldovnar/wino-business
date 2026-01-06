'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { Button } from '@telegram-apps/telegram-ui';
import { Wallet, ArrowLeft, LogOut, RefreshCw } from 'lucide-react';
import { getBusiness } from '@/lib/storage';
import { fullWalletLogout } from '@/lib/wallet-persistence';
import styles from './connect-wallet.module.css';

// Connection timeout in milliseconds
const CONNECTION_TIMEOUT_MS = 25000; // 25 seconds max

type ConnectState = 'idle' | 'connecting' | 'connected' | 'routing' | 'error' | 'timeout';

export default function ConnectWalletPage() {
  const router = useRouter();
  const { connected, connecting, disconnect, wallets, publicKey } = useWallet();
  const [connectState, setConnectState] = useState<ConnectState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [clickCount, setClickCount] = useState(0);
  const hasRoutedRef = useRef(false);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectingStartRef = useRef<number | null>(null);
  const isManuallyConnectingRef = useRef(false); // Track manual connection attempts

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    };
  }, []);

  // Monitor connecting state and implement timeout
  useEffect(() => {
    if (connecting && !connectingStartRef.current) {
      // Just started connecting
      connectingStartRef.current = Date.now();
      console.log('[connect-wallet] Connection started, setting timeout...');

      // Set timeout
      connectionTimeoutRef.current = setTimeout(() => {
        console.log('[connect-wallet] Connection timeout reached!');
        if (connecting && !connected) {
          setConnectState('timeout');
          setErrorMessage('Connection timed out. The wallet app may not have responded. Try again or reset connection.');
          connectingStartRef.current = null;
        }
      }, CONNECTION_TIMEOUT_MS);
    } else if (!connecting) {
      // No longer connecting - clear timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      connectingStartRef.current = null;
    }
  }, [connecting, connected]);

  // Effect to handle routing when wallet is connected
  useEffect(() => {
    if (connected && publicKey && !hasRoutedRef.current) {
      console.log('[connect-wallet] Stable connection detected:', publicKey.toBase58());

      // Clear any pending timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      const timeoutId = setTimeout(() => {
        if (hasRoutedRef.current) return;

        setConnectState('routing');
        const existingBusiness = getBusiness();

        console.log('[connect-wallet] Routing decision:', { businessExists: !!existingBusiness });
        hasRoutedRef.current = true;

        if (existingBusiness) {
          router.push('/dashboard');
        } else {
          router.push('/business-identity/name');
        }
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [connected, publicKey, router]);

  // Effect to update state based on wallet connection status
  useEffect(() => {
    if (connecting && connectState !== 'timeout') {
      setConnectState('connecting');
      setErrorMessage('');
    } else if (connected && publicKey) {
      setConnectState('connected');
      setErrorMessage('');
      isManuallyConnectingRef.current = false; // Clear manual flag on success
    } else if (!connected && !connecting && connectState !== 'idle' && connectState !== 'timeout' && connectState !== 'error') {
      // Only reset to idle if we're not in a manual connection attempt
      if (!isManuallyConnectingRef.current) {
        setConnectState('idle');
        hasRoutedRef.current = false;
      }
    }
  }, [connecting, connected, publicKey, connectState]);

  const handleConnectWallet = async () => {
    // Immediate feedback - increment click count to verify handler is called
    setClickCount(c => c + 1);
    console.log('!!! HANDLER CALLED !!!', clickCount + 1);

    // Set manual connecting flag to prevent useEffect from resetting state
    isManuallyConnectingRef.current = true;

    try {
      console.log('[connect-wallet] Starting connection...');
      console.log('[connect-wallet] Available wallets:', wallets.map(w => w.adapter.name));
      console.log('[connect-wallet] Current state:', { connected, connecting, publicKey: publicKey?.toBase58() });

      setConnectState('connecting');
      setErrorMessage('');

      // Find WalletConnect adapter
      const walletConnectWallet = wallets.find(
        wallet => wallet.adapter.name === 'WalletConnect'
      );

      if (!walletConnectWallet) {
        console.error('[connect-wallet] No WalletConnect adapter found in:', wallets);
        throw new Error('WalletConnect adapter not found. Please refresh the page.');
      }

      const adapter = walletConnectWallet.adapter;
      console.log('[connect-wallet] Adapter state:', {
        name: adapter.name,
        connected: adapter.connected,
        connecting: adapter.connecting,
        publicKey: adapter.publicKey?.toBase58(),
      });

      // If adapter is already connected, just update state
      if (adapter.connected && adapter.publicKey) {
        console.log('[connect-wallet] Adapter already connected, updating state');
        return;
      }

      // If adapter is already connecting, don't try again
      if (adapter.connecting) {
        console.log('[connect-wallet] Adapter already connecting, waiting...');
        return;
      }

      // Connect directly through the adapter to avoid race condition
      // (select() updates React state async, so connect() would fail if called immediately)
      console.log('[connect-wallet] Connecting via adapter directly...');
      await adapter.connect();

      console.log('[connect-wallet] connect() completed');
    } catch (err: any) {
      console.error('[connect-wallet] Connection failed:', err);
      setErrorMessage(err?.message || 'Connection failed. Please try again.');
      setConnectState('error');
      hasRoutedRef.current = false;
      isManuallyConnectingRef.current = false; // Clear manual flag on error
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setConnectState('idle');
      setErrorMessage('');
      hasRoutedRef.current = false;
      console.log('[connect-wallet] Disconnected');
    } catch (err) {
      console.error('[connect-wallet] Failed to disconnect:', err);
    }
  };

  // Full reset - clears all wallet state and reloads
  const handleFullReset = useCallback(() => {
    console.log('[connect-wallet] Performing full reset...');

    // Clear all wallet storage
    fullWalletLogout();

    // Reset local state
    setConnectState('idle');
    setErrorMessage('');
    hasRoutedRef.current = false;

    // Try to disconnect if possible
    try {
      disconnect();
    } catch (e) {
      console.warn('[connect-wallet] Disconnect failed during reset:', e);
    }

    // Force page reload to reinitialize wallet adapter
    window.location.reload();
  }, [disconnect]);

  const handleContinue = () => {
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

  // Button configuration based on state
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
      case 'timeout':
        return {
          text: 'Try Again',
          disabled: false,
          onClick: handleConnectWallet,
        };
      default:
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

            {/* Show reset button when stuck or errored */}
            {(connectState === 'timeout' || connectState === 'error') && (
              <Button
                size="l"
                stretched
                mode="outline"
                onClick={handleFullReset}
                style={{ marginTop: '12px' }}
              >
                <RefreshCw size={16} strokeWidth={2} style={{ marginRight: '8px' }} />
                Reset Connection
              </Button>
            )}

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
              {connectState === 'connecting'
                ? 'Scan QR code with your Solana wallet app...'
                : connectState === 'connected' || connectState === 'routing'
                ? 'Click Continue to proceed'
                : connectState === 'timeout'
                ? 'Connection timed out. Try again or reset.'
                : 'Scan QR code with your Solana mobile wallet'}
            </p>
          </div>
        </div>

        {/* Debug info - always show for troubleshooting */}
        <div style={{ marginTop: '24px', padding: '12px', background: 'rgba(0,0,0,0.1)', borderRadius: '8px', fontSize: '12px' }}>
          <div><strong>Debug Info:</strong></div>
          <div>State: {connectState}</div>
          <div>Connected: {String(connected)}</div>
          <div>Connecting: {String(connecting)}</div>
          <div>PublicKey: {publicKey ? publicKey.toBase58().slice(0, 8) + '...' : 'null'}</div>
          <div>Wallets: {wallets.length > 0 ? wallets.map(w => w.adapter.name).join(', ') : 'none'}</div>
          <div>HasRouted: {String(hasRoutedRef.current)}</div>
          <div><strong>Clicks: {clickCount}</strong></div>
        </div>
      </div>
    </div>
  );
}
