'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { useWalletConfig } from '@/components/providers/WalletProvider';
import { Button } from '@telegram-apps/telegram-ui';
import { Wallet, ArrowLeft, LogOut, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { getBusiness } from '@/lib/storage';
import { fullWalletLogout } from '@/lib/wallet-persistence';
import styles from './connect-wallet.module.css';

/**
 * WALLETCONNECT FIX - connect-wallet/page.tsx
 *
 * Fixed issues:
 * 1. State machine could get stuck in 'connecting' forever - now has 15s timeout
 * 2. isManuallyConnectingRef caused race conditions - replaced with cleaner state flow
 * 3. No Telegram WebView handling - now detects and shows deep link fallbacks
 * 4. No error display when projectId missing - now shows explicit error via useWalletConfig
 * 5. Button stayed disabled after errors - now properly resets on error/timeout
 *
 * State machine: idle -> opening -> (modal shown) -> connected OR error OR timeout
 * - idle: ready to connect
 * - opening: clicked connect, opening WalletConnect modal
 * - connected: wallet connected successfully
 * - routing: navigating to next page
 * - error: connection failed with error message
 * - timeout: connection took too long (15s)
 */

// Connection timeout in milliseconds - 15s is reasonable for mobile wallet response
const CONNECTION_TIMEOUT_MS = 15000;

type ConnectState = 'idle' | 'opening' | 'connected' | 'routing' | 'error' | 'timeout';

// Detect Telegram WebView - more specific detection to avoid false positives
function isTelegramWebView(): boolean {
  if (typeof window === 'undefined') return false;
  // Primary check: Telegram WebApp API presence
  if ((window as any).Telegram?.WebApp?.initData) return true;
  // Secondary check: userAgent must contain specific Telegram WebView patterns
  // "TelegramBot" is the bot, we want "Telegram" in specific contexts
  const ua = navigator.userAgent;
  // Check for Telegram-specific patterns in WebView
  return ua.includes('Telegram') && (ua.includes('TDesktop') || ua.includes('WebView') || ua.includes('Mobile'));
}

// Deep links for popular Solana wallets
const WALLET_DEEP_LINKS = {
  phantom: 'https://phantom.app/ul/browse/',
  okx: 'https://www.okx.com/download',
  trust: 'https://link.trustwallet.com/open_url?coin_id=501&url=',
};

export default function ConnectWalletPage() {
  const router = useRouter();
  const { connected, connecting, disconnect, wallets, publicKey, select, connect, wallet } = useWallet();
  const { projectIdMissing } = useWalletConfig();

  const [connectState, setConnectState] = useState<ConnectState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [inTelegram, setInTelegram] = useState(false);

  const hasRoutedRef = useRef(false);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef<ConnectState>('idle'); // Keep state ref in sync for timeout callbacks

  // Keep state ref in sync
  useEffect(() => {
    stateRef.current = connectState;
  }, [connectState]);

  // Detect Telegram on mount
  useEffect(() => {
    setInTelegram(isTelegramWebView());
  }, []);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    };
  }, []);

  // Handle successful connection - route to appropriate page
  useEffect(() => {
    if (connected && publicKey && !hasRoutedRef.current) {
      console.log('[connect-wallet] Connected:', publicKey.toBase58().slice(0, 8) + '...');

      // Clear any pending timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      setConnectState('connected');
      setErrorMessage('');

      // Small delay before routing to show success state
      const routeTimer = setTimeout(() => {
        if (hasRoutedRef.current) return;

        setConnectState('routing');
        hasRoutedRef.current = true;

        const existingBusiness = getBusiness();
        console.log('[connect-wallet] Routing to:', existingBusiness ? '/dashboard' : '/business-identity/name');

        if (existingBusiness) {
          router.push('/dashboard');
        } else {
          router.push('/business-identity/name');
        }
      }, 500);

      return () => clearTimeout(routeTimer);
    }
  }, [connected, publicKey, router]);

  // Monitor wallet adapter's connecting state for timeout detection
  useEffect(() => {
    // If wallet adapter says it's connecting but we're not in 'opening' state,
    // it means auto-reconnect is happening - update our state
    if (connecting && connectState === 'idle') {
      console.log('[connect-wallet] Detected auto-reconnect attempt');
      setConnectState('opening');
    }

    // If we're in opening state and adapter finishes connecting without success
    if (!connecting && !connected && (connectState === 'opening')) {
      // Connection attempt finished without success
      // Only set to idle if we didn't hit timeout/error
      if (stateRef.current === 'opening') {
        console.log('[connect-wallet] Connection attempt finished without connecting');
        // Small delay to allow for any async state updates
        setTimeout(() => {
          if (stateRef.current === 'opening' && !connecting && !connected) {
            setConnectState('idle');
          }
        }, 500);
      }
    }
  }, [connecting, connected, connectState]);

  const handleConnectWallet = async () => {
    console.log('[connect-wallet] Connect button clicked');

    // If already connected, just route
    if (connected && publicKey) {
      handleContinue();
      return;
    }

    // If already in opening state, don't re-trigger
    if (connectState === 'opening' || connecting) {
      console.log('[connect-wallet] Already connecting, ignoring click');
      return;
    }

    try {
      // Update state to opening immediately
      setConnectState('opening');
      setErrorMessage('');

      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        console.log('[connect-wallet] Connection timeout reached after', CONNECTION_TIMEOUT_MS, 'ms');
        if (stateRef.current === 'opening') {
          setConnectState('timeout');
          setErrorMessage('Connection timed out. The wallet may not have responded. Try again or use a direct wallet link below.');
        }
      }, CONNECTION_TIMEOUT_MS);

      // Find WalletConnect adapter
      const walletConnectWallet = wallets.find(w => w.adapter.name === 'WalletConnect');

      if (!walletConnectWallet) {
        throw new Error('WalletConnect adapter not found. Please refresh the page.');
      }

      console.log('[connect-wallet] Selecting WalletConnect adapter');
      select(walletConnectWallet.adapter.name);

      // Brief delay for React state to update after select()
      await new Promise(resolve => setTimeout(resolve, 100));

      // Trigger connection - this should open the WalletConnect modal
      console.log('[connect-wallet] Calling connect()...');
      await connect();

      console.log('[connect-wallet] connect() returned');
      // Note: We don't set connected state here - the useEffect above handles that
      // based on the actual wallet adapter state

    } catch (err: any) {
      console.error('[connect-wallet] Connection error:', err);

      // Clear timeout on error
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      // User rejected or closed modal
      if (err?.message?.includes('rejected') || err?.message?.includes('User rejected') || err?.message?.includes('closed')) {
        setConnectState('idle');
        setErrorMessage('');
        return;
      }

      setConnectState('error');
      setErrorMessage(err?.message || 'Connection failed. Please try again.');
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
      console.error('[connect-wallet] Disconnect error:', err);
    }
  };

  const handleFullReset = useCallback(() => {
    console.log('[connect-wallet] Full reset');

    // Clear timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }

    // Clear all wallet storage
    fullWalletLogout();

    // Reset state
    setConnectState('idle');
    setErrorMessage('');
    hasRoutedRef.current = false;

    // Try to disconnect
    try {
      disconnect();
    } catch (e) {
      console.warn('[connect-wallet] Disconnect during reset failed:', e);
    }

    // Force reload to reinitialize wallet adapter
    window.location.reload();
  }, [disconnect]);

  const handleContinue = () => {
    if (connected && publicKey && !hasRoutedRef.current) {
      setConnectState('routing');
      hasRoutedRef.current = true;

      const existingBusiness = getBusiness();
      if (existingBusiness) {
        router.push('/dashboard');
      } else {
        router.push('/business-identity/name');
      }
    }
  };

  // Open wallet deep link (for Telegram WebView fallback)
  const handleOpenWallet = (walletType: 'phantom' | 'okx' | 'trust') => {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

    let deepLink = '';
    switch (walletType) {
      case 'phantom':
        deepLink = `${WALLET_DEEP_LINKS.phantom}${encodeURIComponent(currentUrl)}`;
        break;
      case 'okx':
        deepLink = WALLET_DEEP_LINKS.okx;
        break;
      case 'trust':
        deepLink = `${WALLET_DEEP_LINKS.trust}${encodeURIComponent(currentUrl)}`;
        break;
    }

    console.log('[connect-wallet] Opening wallet deep link:', walletType, deepLink);
    window.open(deepLink, '_blank');
  };

  // Button configuration based on state
  const getButtonConfig = () => {
    // If projectId is missing and we're using fallback, show warning but allow connect
    switch (connectState) {
      case 'opening':
        return {
          text: 'Opening wallet...',
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
          Connect your Solana wallet to create your business identity
        </p>

        {/* Project ID warning (non-blocking) */}
        {projectIdMissing && (
          <div className={styles.warningBox} style={{ marginBottom: '16px', padding: '12px', background: 'rgba(255, 152, 0, 0.1)', borderRadius: '8px', border: '1px solid rgba(255, 152, 0, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ff9800' }}>
              <AlertCircle size={16} />
              <span style={{ fontSize: '13px' }}>Using fallback WalletConnect config</span>
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className={styles.errorBox}>
            <p className={styles.errorText}>{errorMessage}</p>
          </div>
        )}

        {/* Success message */}
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
              data-testid="connect-button"
            >
              {buttonConfig.text}
            </Button>

            {/* Status text */}
            <p style={{ marginTop: '12px', fontSize: '14px', color: 'var(--tgui--secondary_hint_color)', textAlign: 'center' }}>
              {connectState === 'opening'
                ? 'Scan QR code with your Solana wallet app...'
                : connectState === 'connected' || connectState === 'routing'
                ? 'Wallet connected! Redirecting...'
                : connectState === 'timeout'
                ? 'Connection timed out. Try again or use direct links below.'
                : connectState === 'error'
                ? 'Connection failed. Please try again.'
                : 'Scan QR code with your Solana mobile wallet'}
            </p>

            {/* Reset button for stuck/error states */}
            {(connectState === 'timeout' || connectState === 'error') && (
              <Button
                size="l"
                stretched
                mode="outline"
                onClick={handleFullReset}
                style={{ marginTop: '12px' }}
                data-testid="reset-button"
              >
                <RefreshCw size={16} strokeWidth={2} style={{ marginRight: '8px' }} />
                Reset Connection
              </Button>
            )}

            {/* Disconnect button when connected */}
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
          </div>

          {/* Telegram WebView fallback: Direct wallet links */}
          {(inTelegram || connectState === 'timeout') && (
            <div className={styles.method} style={{ marginTop: '24px' }}>
              <h3 className={styles.methodTitle}>
                {inTelegram ? 'Open Wallet Directly' : 'Or open wallet app'}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--tgui--secondary_hint_color)', marginBottom: '12px', textAlign: 'center' }}>
                {inTelegram
                  ? 'In Telegram, you may need to open your wallet app directly'
                  : 'If the QR code did not work, try opening your wallet directly'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Button
                  size="m"
                  mode="outline"
                  stretched
                  onClick={() => handleOpenWallet('phantom')}
                >
                  <ExternalLink size={14} style={{ marginRight: '8px' }} />
                  Open Phantom
                </Button>
                <Button
                  size="m"
                  mode="outline"
                  stretched
                  onClick={() => handleOpenWallet('okx')}
                >
                  <ExternalLink size={14} style={{ marginRight: '8px' }} />
                  Open OKX Wallet
                </Button>
                <Button
                  size="m"
                  mode="outline"
                  stretched
                  onClick={() => handleOpenWallet('trust')}
                >
                  <ExternalLink size={14} style={{ marginRight: '8px' }} />
                  Open Trust Wallet
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Debug info */}
        <div style={{ marginTop: '24px', padding: '12px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace' }}>
          <div><strong>Debug:</strong></div>
          <div>state: {connectState}</div>
          <div>connected: {String(connected)}</div>
          <div>connecting: {String(connecting)}</div>
          <div>publicKey: {publicKey ? publicKey.toBase58().slice(0, 8) + '...' : 'null'}</div>
          <div>wallet: {wallet?.adapter.name || 'none'}</div>
          <div>adapters: {wallets.map(w => w.adapter.name).join(', ') || 'none'}</div>
          <div>inTelegram: {String(inTelegram)}</div>
        </div>
      </div>
    </div>
  );
}
