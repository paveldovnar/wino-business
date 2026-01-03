'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { Building2, DollarSign, Shield, CheckCircle2, LogOut, Bug, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import { getBusiness, saveBusiness, clearBusiness } from '@/lib/storage';
import { useWallet, useConnection } from '@/lib/wallet-mock';
import { saveWalletState, fullWalletLogout, shouldExpectReconnect, clearWalletState } from '@/lib/wallet-persistence';
import { Business } from '@/types';
import { fetchIdentity, deriveIdentityPDA, getSolscanAccountLink, OnChainIdentity } from '@/lib/identity-pda';
import styles from './dashboard.module.css';

// Timeouts
const SESSION_RESTORE_TIMEOUT_MS = 8000; // 8 seconds max to restore session
const CONNECTING_STUCK_TIMEOUT_MS = 15000; // 15 seconds = definitely stuck

interface OnChainTransaction {
  signature: string;
  blockTime: number | null;
  amountUi: number | null;
  source: string | null;
  destination: string | null;
  status: string;
  explorerUrl: string;
}

interface DashboardMetrics {
  totalBalance: number | null;
  incomeToday: number | null;
  incomeLast30Days: number | null;
  averageDay: number | null;
  todayVsAverage: number | null;
  lastUpdate: Date | null;
}

type WalletRestoreState = 'restoring' | 'restored' | 'timeout' | 'not_expected';

export default function DashboardPage() {
  const router = useRouter();
  const { publicKey, disconnect, connected, connecting } = useWallet();
  const { connection } = useConnection();
  const [business, setBusiness] = useState<Business | null>(null);
  const [onChainIdentity, setOnChainIdentity] = useState<OnChainIdentity | null>(null);
  const [identityPda, setIdentityPda] = useState<string | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [transactions, setTransactions] = useState<OnChainTransaction[]>([]);
  const [realBalance, setRealBalance] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalBalance: null,
    incomeToday: null,
    incomeLast30Days: null,
    averageDay: null,
    todayVsAverage: null,
    lastUpdate: null,
  });
  const [loading, setLoading] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [walletRestoreState, setWalletRestoreState] = useState<WalletRestoreState>('restoring');
  const [connectingStartTime, setConnectingStartTime] = useState<number | null>(null);
  const [isStuck, setIsStuck] = useState(false);

  // Check if we should wait for wallet to restore
  useEffect(() => {
    const shouldWait = shouldExpectReconnect();
    console.log('[dashboard] Should expect wallet reconnect:', shouldWait, 'connected:', connected, 'connecting:', connecting);

    if (connected && publicKey) {
      // Already connected - no need to wait
      setWalletRestoreState('restored');
      return;
    }

    if (!shouldWait) {
      setWalletRestoreState('not_expected');
    } else if (!connecting && !connected) {
      // Was expecting reconnect but not connecting - might have failed silently
      const failTimer = setTimeout(() => {
        if (!connected && !connecting) {
          console.log('[dashboard] Expected reconnect but not connecting, marking timeout');
          setWalletRestoreState('timeout');
        }
      }, 2000); // Give 2s grace period for adapter init
      return () => clearTimeout(failTimer);
    } else {
      // Currently connecting - set timeout for session restore
      const timeout = setTimeout(() => {
        console.log('[dashboard] Wallet restore timeout reached');
        if (!connected && !publicKey) {
          setWalletRestoreState('timeout');
          // Clear the stuck connecting state
          clearWalletState();
        }
      }, SESSION_RESTORE_TIMEOUT_MS);

      return () => clearTimeout(timeout);
    }
  }, [connected, publicKey, connecting]);

  // Track connecting state for stuck detection
  useEffect(() => {
    if (connecting && !connectingStartTime) {
      setConnectingStartTime(Date.now());
    } else if (!connecting) {
      setConnectingStartTime(null);
      setIsStuck(false);
    }
  }, [connecting, connectingStartTime]);

  // Detect stuck connecting state
  useEffect(() => {
    if (connecting && connectingStartTime) {
      const checkStuck = setInterval(() => {
        const elapsed = Date.now() - connectingStartTime;
        if (elapsed > CONNECTING_STUCK_TIMEOUT_MS) {
          console.log('[dashboard] Wallet connection appears stuck');
          setIsStuck(true);
          clearInterval(checkStuck);
        }
      }, 1000);

      return () => clearInterval(checkStuck);
    }
  }, [connecting, connectingStartTime]);

  // Lookup identity on-chain (PDA) when wallet connects
  const lookupIdentity = useCallback(async (walletAddress: string) => {
    if (!connection) return;

    setIdentityLoading(true);
    console.log('[dashboard] Looking up identity on-chain for:', walletAddress);

    try {
      const { PublicKey } = await import('@solana/web3.js');
      const authority = new PublicKey(walletAddress);
      const result = await fetchIdentity(connection, authority);

      if (result.found && result.identity) {
        console.log('[dashboard] Found on-chain identity:', result.identity.name);
        setOnChainIdentity(result.identity);
        setIdentityPda(result.pda?.toBase58() || null);

        // Sync to local storage
        const localBusiness = getBusiness();
        const updatedBusiness: Business = {
          id: localBusiness?.id || crypto.randomUUID(),
          name: result.identity.name,
          logo: localBusiness?.logo,
          logoUri: result.identity.logoUri || undefined,
          walletAddress: walletAddress,
          identityPda: result.pda?.toBase58(),
          createdAt: localBusiness?.createdAt || new Date(result.identity.createdAt * 1000),
        };
        saveBusiness(updatedBusiness);
        setBusiness(updatedBusiness);
      } else {
        console.log('[dashboard] No on-chain identity found');
        setOnChainIdentity(null);
        setIdentityPda(result.pda?.toBase58() || null);

        // Check local storage as fallback
        const localBusiness = getBusiness();
        if (localBusiness) {
          console.log('[dashboard] Using local business:', localBusiness.name);
          setBusiness(localBusiness);
        }
      }
    } catch (err) {
      console.error('[dashboard] Failed to lookup identity:', err);
      // Fall back to local storage
      const localBusiness = getBusiness();
      if (localBusiness) {
        setBusiness(localBusiness);
      }
    } finally {
      setIdentityLoading(false);
    }
  }, [connection]);

  // Update wallet restore state when connection completes
  useEffect(() => {
    if (connected && publicKey) {
      const walletAddress = publicKey.toBase58();
      console.log('[dashboard] Wallet connected:', walletAddress);
      setWalletRestoreState('restored');

      // Save wallet state for persistence
      saveWalletState({
        wasConnected: true,
        lastAddress: walletAddress,
        lastConnectedAt: Date.now(),
      });

      // Lookup identity on Arweave
      lookupIdentity(walletAddress);
    }
  }, [connected, publicKey, lookupIdentity]);

  // Fetch real balance and transactions
  useEffect(() => {
    async function fetchData() {
      if (!publicKey) {
        setTransactions([]);
        setRealBalance(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const ownerAddress = publicKey.toBase58();
        console.log('[dashboard] Fetching data for owner:', ownerAddress);

        // Fetch balance and transactions in parallel
        const [balanceRes, txRes] = await Promise.all([
          fetch(`/api/balance?owner=${ownerAddress}`),
          fetch(`/api/transactions?owner=${ownerAddress}`),
        ]);

        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          setRealBalance(balanceData.uiAmount ?? null);
          console.log('[dashboard] Real balance:', balanceData.uiAmount);
        } else {
          setRealBalance(null);
        }

        if (txRes.ok) {
          const txData = await txRes.json();
          setTransactions(txData.transactions || []);
          console.log('[dashboard] Fetched', txData.count, 'transactions');
        } else {
          setTransactions([]);
        }
      } catch (err) {
        console.error('[dashboard] Failed to fetch data:', err);
        setTransactions([]);
        setRealBalance(null);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Refresh every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [publicKey]);

  // Calculate metrics from transactions
  useEffect(() => {
    // If wallet not connected, show null for all metrics
    if (!connected || !publicKey) {
      setMetrics({
        totalBalance: null,
        incomeToday: null,
        incomeLast30Days: null,
        averageDay: null,
        todayVsAverage: null,
        lastUpdate: null,
      });
      return;
    }

    if (transactions.length === 0) {
      // Connected but no transactions - show balance but 0 for income
      setMetrics({
        totalBalance: realBalance,
        incomeToday: realBalance === null ? null : 0,
        incomeLast30Days: realBalance === null ? null : 0,
        averageDay: realBalance === null ? null : 0,
        todayVsAverage: null, // Can't calculate vs average with no data
        lastUpdate: realBalance !== null ? new Date() : null,
      });
      return;
    }

    const now = Date.now() / 1000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartSec = todayStart.getTime() / 1000;

    const last30DaysStart = now - 30 * 24 * 60 * 60;
    const last90DaysStart = now - 90 * 24 * 60 * 60;

    // Safe amount getter - handle NaN and invalid values
    const getAmount = (tx: OnChainTransaction) => {
      const val = tx.amountUi;
      if (val === null || val === undefined || isNaN(val)) return 0;
      return val;
    };
    const getTime = (tx: OnChainTransaction) => tx.blockTime ?? 0;

    // Income today
    const incomeToday = transactions
      .filter((tx) => getTime(tx) >= todayStartSec)
      .reduce((sum, tx) => sum + getAmount(tx), 0);

    // Income last 30 days
    const incomeLast30Days = transactions
      .filter((tx) => getTime(tx) >= last30DaysStart)
      .reduce((sum, tx) => sum + getAmount(tx), 0);

    // Calculate average day (last 90 days)
    const last90DaysTxs = transactions.filter((tx) => getTime(tx) >= last90DaysStart);
    const last90DaysIncome = last90DaysTxs.reduce((sum, tx) => sum + getAmount(tx), 0);
    const averageDay = last90DaysTxs.length > 0 ? last90DaysIncome / 90 : null;

    // Today vs average (only if we have average data)
    const todayVsAverage = averageDay !== null && averageDay > 0
      ? ((incomeToday - averageDay) / averageDay) * 100
      : null;

    // Last update time
    const validTimes = transactions.map(tx => getTime(tx)).filter(t => t > 0);
    const lastUpdate = validTimes.length > 0
      ? new Date(Math.max(...validTimes) * 1000)
      : new Date();

    setMetrics({
      totalBalance: realBalance,
      incomeToday,
      incomeLast30Days,
      averageDay,
      todayVsAverage,
      lastUpdate,
    });
  }, [transactions, realBalance, connected, publicKey]);

  // Load business profile from local storage initially
  useEffect(() => {
    const businessData = getBusiness();
    if (businessData) {
      setBusiness(businessData);
    }
    // Don't redirect - let user stay on dashboard even without business
    // They can create identity from here
  }, []);

  // Full logout - clear everything and redirect
  const handleLogout = useCallback(async () => {
    console.log('[dashboard] Logging out...');

    try {
      await disconnect();
    } catch (err) {
      console.warn('[dashboard] Disconnect failed:', err);
    }

    // Full cleanup
    fullWalletLogout();
    clearBusiness();

    // Redirect to connect wallet
    router.push('/connect-wallet');
  }, [disconnect, router]);

  // Reset stuck connection
  const handleResetConnection = useCallback(() => {
    console.log('[dashboard] Resetting stuck connection...');

    try {
      disconnect();
    } catch (err) {
      console.warn('[dashboard] Disconnect during reset failed:', err);
    }

    fullWalletLogout();
    window.location.reload();
  }, [disconnect]);

  // Show recovery UI if session restore timed out
  if (walletRestoreState === 'timeout') {
    return (
      <div className={styles.container}>
        <div className={styles.content} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', gap: '16px' }}>
          <AlertTriangle size={48} strokeWidth={2} style={{ color: '#ff9800' }} />
          <h2 style={{ margin: 0 }}>Session Expired</h2>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
            Could not restore your wallet session.
          </p>
          <Button
            size="l"
            onClick={() => router.push('/connect-wallet')}
            style={{ marginTop: '16px' }}
          >
            Connect Wallet
          </Button>
          <Button
            size="l"
            mode="outline"
            onClick={handleResetConnection}
          >
            <RefreshCw size={16} style={{ marginRight: '8px' }} />
            Reset & Retry
          </Button>
        </div>
      </div>
    );
  }

  // Show loading while restoring
  if (walletRestoreState === 'restoring' && !connected) {
    return (
      <div className={styles.container}>
        <div className={styles.content} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '50vh', gap: '12px' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Restoring wallet session...</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>This may take a few seconds</p>
        </div>
      </div>
    );
  }

  // Show recovery if stuck in connecting state
  if (isStuck) {
    return (
      <div className={styles.container}>
        <div className={styles.content} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', gap: '16px' }}>
          <AlertTriangle size={48} strokeWidth={2} style={{ color: '#f44336' }} />
          <h2 style={{ margin: 0 }}>Connection Stuck</h2>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
            Wallet connection seems to be stuck. Please reset and try again.
          </p>
          <Button
            size="l"
            onClick={handleResetConnection}
            style={{ marginTop: '16px' }}
          >
            <RefreshCw size={16} style={{ marginRight: '8px' }} />
            Reset Connection
          </Button>
        </div>
      </div>
    );
  }

  // Show connect wallet UI if not connected and no reconnect expected
  if (walletRestoreState === 'not_expected' && !connected && !publicKey) {
    return (
      <div className={styles.container}>
        <div className={styles.content} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', gap: '16px' }}>
          <Building2 size={48} strokeWidth={2} style={{ color: 'var(--text-secondary)' }} />
          <h2 style={{ margin: 0 }}>Connect Your Wallet</h2>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
            Connect your Solana wallet to view your business dashboard
          </p>
          <Button
            size="l"
            onClick={() => router.push('/connect-wallet')}
            style={{ marginTop: '16px' }}
          >
            Connect Wallet
          </Button>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return '—';
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercentage = (value: number | null) => {
    if (value === null || value === undefined) return '—';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  // Get logo source - prefer on-chain URI
  const getLogoSrc = () => {
    if (onChainIdentity?.logoUri) {
      // Handle different URI formats
      if (onChainIdentity.logoUri.startsWith('ar://')) {
        const arweaveId = onChainIdentity.logoUri.replace('ar://', '');
        return `https://arweave.net/${arweaveId}`;
      }
      return onChainIdentity.logoUri;
    }
    return business?.logo || null;
  };

  const logoSrc = getLogoSrc();

  // Get cluster for links
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet') as 'devnet' | 'mainnet-beta';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.businessInfo}>
          <div className={styles.logoWrapper}>
            {logoSrc ? (
              <img src={logoSrc} alt="Logo" className={styles.logo} />
            ) : (
              <div className={styles.logoPlaceholder}>
                <Building2 size={24} strokeWidth={2} />
              </div>
            )}
          </div>
          <div>
            <h1 className={styles.businessName}>{business?.name || 'Loading...'}</h1>
            <p className={styles.businessType}>Business merchant</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className={styles.walletButton}
            title="Toggle debug info"
            style={{ opacity: 0.5 }}
          >
            <Bug size={20} strokeWidth={2} />
          </button>
          <button onClick={handleLogout} className={styles.walletButton} title="Logout">
            <LogOut size={20} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebug && (
        <div style={{
          margin: '12px 16px',
          padding: '12px',
          background: 'rgba(0,0,0,0.05)',
          borderRadius: '8px',
          fontSize: '11px',
          fontFamily: 'monospace',
        }}>
          <div><strong>Debug Info:</strong></div>
          <div>connected: {String(connected)}</div>
          <div>connecting: {String(connecting)}</div>
          <div>publicKey: {publicKey ? publicKey.toBase58() : 'null'}</div>
          <div>walletRestoreState: {walletRestoreState}</div>
          <div>isStuck: {String(isStuck)}</div>
          <div>realBalance: {realBalance}</div>
          <div>txCount: {transactions.length}</div>
          <div>onChainIdentity: {onChainIdentity ? 'found' : 'none'}</div>
          <div>identityPda: {identityPda || 'none'}</div>
          <div>network: {cluster}</div>
          <div style={{ marginTop: '8px' }}>
            <button onClick={handleResetConnection} style={{ fontSize: '10px', padding: '4px 8px' }}>
              Force Reset
            </button>
          </div>
        </div>
      )}

      <div className={styles.content}>
        {/* Balance Card */}
        <div className={styles.balanceCard}>
          <div className={styles.balanceHeader}>
            <span className={styles.balanceLabel}>Total Balance</span>
            <DollarSign size={20} strokeWidth={2} className={styles.balanceIcon} />
          </div>
          <div className={styles.balanceAmount}>
            ${loading ? '—' : formatCurrency(metrics.totalBalance)}
          </div>
          <div className={styles.balanceSubtext}>
            {!connected || !publicKey
              ? 'Connect wallet to see balance'
              : loading
              ? 'Loading...'
              : metrics.lastUpdate
              ? `Last updated ${metrics.lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : realBalance === null
              ? 'Unable to fetch balance'
              : realBalance === 0
              ? 'No USDC received yet'
              : 'No recent transactions'}
          </div>
        </div>

        {/* Income Stats */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statLabel}>Income Today</div>
            <div className={styles.statValue}>
              ${loading ? '—' : formatCurrency(metrics.incomeToday)}
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLabel}>Last 30 Days</div>
            <div className={styles.statValue}>
              ${loading ? '—' : formatCurrency(metrics.incomeLast30Days)}
            </div>
          </div>
        </div>

        {/* Today's Performance */}
        <div className={styles.performanceCard}>
          <div className={styles.performanceHeader}>
            <span className={styles.performanceLabel}>Today's Performance</span>
          </div>
          <div className={styles.performanceContent}>
            <div className={styles.performanceRow}>
              <span className={styles.performanceText}>Today</span>
              <span className={styles.performanceValue}>
                ${loading ? '—' : formatCurrency(metrics.incomeToday)}
              </span>
            </div>
            <div className={styles.performanceRow}>
              <span className={styles.performanceText}>vs Average</span>
              <span
                className={styles.performanceValue}
                style={{
                  color: metrics.todayVsAverage === null || metrics.todayVsAverage >= 0 ? '#4CAF50' : '#f44336',
                }}
              >
                {loading ? '—' : formatPercentage(metrics.todayVsAverage)}
              </span>
            </div>
            <div className={styles.performanceRow}>
              <span className={styles.performanceText}>Avg per day (90d)</span>
              <span className={styles.performanceValue}>
                ${loading ? '—' : formatCurrency(metrics.averageDay)}
              </span>
            </div>
          </div>
        </div>

        {/* Business Identity */}
        <div className={styles.identityCard}>
          <div className={styles.identityHeader}>
            <div className={styles.identityIcon}>
              <Shield size={24} strokeWidth={2} />
            </div>
            <div className={styles.identityInfo}>
              <div className={styles.identityTitle}>Business Identity</div>
              <div className={styles.identityStatus}>
                {identityLoading ? (
                  <span className={styles.statusNotMinted}>Checking on-chain...</span>
                ) : onChainIdentity ? (
                  <div className={styles.statusMinted}>
                    <CheckCircle2 size={16} strokeWidth={2} />
                    <span>On-chain PDA</span>
                  </div>
                ) : (
                  <span className={styles.statusNotMinted}>Not created</span>
                )}
              </div>
            </div>
          </div>

          {onChainIdentity && identityPda ? (
            <div className={styles.identityMintAddress}>
              <div className={styles.mintLabel}>Identity PDA</div>
              <div className={styles.mintValue}>
                {identityPda.slice(0, 8)}...{identityPda.slice(-8)}
              </div>
              <a
                href={getSolscanAccountLink(identityPda, cluster)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '12px',
                  color: 'var(--accent)',
                  marginTop: '4px',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                View on Solscan <ExternalLink size={12} />
              </a>
            </div>
          ) : !connected || !publicKey ? (
            <Button
              size="m"
              mode="outline"
              disabled
              className={styles.mintButton}
            >
              Connect wallet to create identity
            </Button>
          ) : (
            <Button
              size="m"
              mode="outline"
              onClick={() => router.push('/business-identity/name')}
              className={styles.mintButton}
            >
              Create Business Identity
            </Button>
          )}
        </div>

        {/* POS Mode Button */}
        <div className={styles.actions}>
          <Button
            size="l"
            stretched
            onClick={() => router.push('/pos')}
            className={styles.primaryButton}
          >
            Open POS mode
          </Button>
        </div>
      </div>
    </div>
  );
}
