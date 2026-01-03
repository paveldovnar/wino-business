'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { Building2, DollarSign, Shield, CheckCircle2, LogOut, Bug } from 'lucide-react';
import { getBusiness, saveBusiness, clearBusiness } from '@/lib/storage';
import { useWallet } from '@/lib/wallet-mock';
import { saveWalletState, clearWalletState, shouldExpectReconnect } from '@/lib/wallet-persistence';
import { Business } from '@/types';
import styles from './dashboard.module.css';

interface OnChainTransaction {
  signature: string;
  blockTime: number;
  amountUi: number;
  source: string;
  destination: string;
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

export default function DashboardPage() {
  const router = useRouter();
  const { publicKey, disconnect, connected, connecting } = useWallet();
  const [business, setBusiness] = useState<Business | null>(null);
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
  const [mintVerified, setMintVerified] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [walletRestoring, setWalletRestoring] = useState(true);

  // Check if we should wait for wallet to restore
  useEffect(() => {
    const shouldWait = shouldExpectReconnect();
    console.log('[dashboard] Should expect wallet reconnect:', shouldWait);

    if (!shouldWait) {
      // No previous session, no need to wait
      setWalletRestoring(false);
    } else {
      // Give wallet adapter time to restore session
      const timeout = setTimeout(() => {
        console.log('[dashboard] Wallet restore timeout reached');
        setWalletRestoring(false);
      }, 3000); // 3 second max wait

      return () => clearTimeout(timeout);
    }
  }, []);

  // Update wallet restoring state when connection completes
  useEffect(() => {
    if (connected && publicKey) {
      console.log('[dashboard] Wallet connected:', publicKey.toBase58());
      setWalletRestoring(false);

      // Save wallet state for persistence
      saveWalletState({
        wasConnected: true,
        lastAddress: publicKey.toBase58(),
        lastConnectedAt: Date.now(),
      });
    } else if (!connecting && !connected) {
      // Not connecting and not connected - done waiting
      const shouldWait = shouldExpectReconnect();
      if (!shouldWait) {
        setWalletRestoring(false);
      }
    }
  }, [connected, publicKey, connecting]);

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
          setRealBalance(balanceData.uiAmount ?? 0);
          console.log('[dashboard] Real balance:', balanceData.uiAmount);
        }

        if (txRes.ok) {
          const txData = await txRes.json();
          setTransactions(txData.transactions || []);
          console.log('[dashboard] Fetched', txData.count, 'transactions');
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
    if (transactions.length === 0) {
      // No transactions - show balance if available, otherwise null
      setMetrics({
        totalBalance: realBalance,
        incomeToday: realBalance === null ? null : 0,
        incomeLast30Days: realBalance === null ? null : 0,
        averageDay: realBalance === null ? null : 0,
        todayVsAverage: realBalance === null ? null : 0,
        lastUpdate: null,
      });
      return;
    }

    const now = Date.now() / 1000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartSec = todayStart.getTime() / 1000;

    const last30DaysStart = now - 30 * 24 * 60 * 60;
    const last90DaysStart = now - 90 * 24 * 60 * 60;

    // Income today
    const incomeToday = transactions
      .filter((tx) => tx.blockTime >= todayStartSec)
      .reduce((sum, tx) => sum + tx.amountUi, 0);

    // Income last 30 days
    const incomeLast30Days = transactions
      .filter((tx) => tx.blockTime >= last30DaysStart)
      .reduce((sum, tx) => sum + tx.amountUi, 0);

    // Calculate average day (last 90 days)
    const last90DaysTxs = transactions.filter((tx) => tx.blockTime >= last90DaysStart);
    const last90DaysIncome = last90DaysTxs.reduce((sum, tx) => sum + tx.amountUi, 0);
    const averageDay = last90DaysIncome / 90;

    // Today vs average
    const todayVsAverage = averageDay > 0 ? ((incomeToday - averageDay) / averageDay) * 100 : 0;

    // Last update time
    const lastUpdate = transactions.length > 0
      ? new Date(Math.max(...transactions.map((tx) => tx.blockTime * 1000)))
      : null;

    setMetrics({
      totalBalance: realBalance,
      incomeToday,
      incomeLast30Days,
      averageDay,
      todayVsAverage,
      lastUpdate,
    });
  }, [transactions, realBalance]);

  // Load business profile
  useEffect(() => {
    const businessData = getBusiness();
    if (!businessData) {
      // Only redirect if we're not waiting for wallet and wallet didn't connect
      if (!walletRestoring) {
        console.log('[dashboard] No business profile, redirecting to welcome');
        router.replace('/welcome');
      }
      return;
    }

    setBusiness(businessData);

    // Verify NFT mint status if business has a mint address
    if (businessData.nftMintAddress) {
      verifyMintStatus(businessData.nftMintAddress);
    }
  }, [router, walletRestoring]);

  const verifyMintStatus = async (mintAddress: string) => {
    setVerifying(true);
    try {
      console.log('[dashboard] Verifying NFT mint:', mintAddress);
      const res = await fetch(`/api/identity/verify?mint=${mintAddress}`);
      const data = await res.json();

      if (data.verified) {
        console.log('[dashboard] NFT verified on-chain:', data.nft);
        setMintVerified(true);
      } else {
        console.warn('[dashboard] NFT not verified:', data.error);
        setMintVerified(false);
      }
    } catch (err) {
      console.error('[dashboard] Failed to verify mint:', err);
      setMintVerified(false);
    } finally {
      setVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    if (confirm('Disconnect wallet? Your business profile will remain saved.')) {
      try {
        await disconnect();
        clearWalletState();
        console.log('[dashboard] Wallet disconnected');
        router.push('/welcome');
      } catch (err) {
        console.error('[dashboard] Failed to disconnect wallet:', err);
      }
    }
  };

  // Show loading while waiting for wallet to restore
  if (walletRestoring) {
    return (
      <div className={styles.container}>
        <div className={styles.content} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Restoring wallet session...</p>
        </div>
      </div>
    );
  }

  if (!business) {
    return null;
  }

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '—';
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercentage = (value: number | null) => {
    if (value === null) return '—';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.businessInfo}>
          <div className={styles.logoWrapper}>
            {business.logo ? (
              <img src={business.logo} alt="Logo" className={styles.logo} />
            ) : (
              <div className={styles.logoPlaceholder}>
                <Building2 size={24} strokeWidth={2} />
              </div>
            )}
          </div>
          <div>
            <h1 className={styles.businessName}>{business.name}</h1>
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
          {publicKey && (
            <button onClick={handleDisconnect} className={styles.walletButton} title="Disconnect wallet">
              <LogOut size={20} strokeWidth={2} />
            </button>
          )}
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
          <div>walletRestoring: {String(walletRestoring)}</div>
          <div>realBalance: {realBalance}</div>
          <div>txCount: {transactions.length}</div>
          <div>network: mainnet-beta</div>
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

        {/* Business Identity NFT */}
        <div className={styles.identityCard}>
          <div className={styles.identityHeader}>
            <div className={styles.identityIcon}>
              <Shield size={24} strokeWidth={2} />
            </div>
            <div className={styles.identityInfo}>
              <div className={styles.identityTitle}>Business Identity NFT</div>
              <div className={styles.identityStatus}>
                {verifying ? (
                  <span className={styles.statusNotMinted}>Verifying...</span>
                ) : mintVerified === true ? (
                  <div className={styles.statusMinted}>
                    <CheckCircle2 size={16} strokeWidth={2} />
                    <span>Minted (verified on-chain)</span>
                  </div>
                ) : mintVerified === false && business.nftMintAddress ? (
                  <span className={styles.statusNotMinted} style={{ color: '#f44336' }}>
                    Not verified on-chain
                  </span>
                ) : (
                  <span className={styles.statusNotMinted}>Not minted</span>
                )}
              </div>
            </div>
          </div>

          {business.nftMintAddress && mintVerified === true ? (
            <div className={styles.identityMintAddress}>
              <div className={styles.mintLabel}>Mint Address</div>
              <div className={styles.mintValue}>
                {business.nftMintAddress.slice(0, 4)}...{business.nftMintAddress.slice(-4)}
              </div>
              <a
                href={`https://solscan.io/token/${business.nftMintAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '12px',
                  color: 'var(--accent)',
                  marginTop: '4px',
                  textDecoration: 'none',
                }}
              >
                View on Solscan →
              </a>
            </div>
          ) : business.nftMintAddress && mintVerified === false ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                Mint address exists locally but not verified on-chain. Try minting again.
              </p>
              <Button
                size="m"
                mode="outline"
                onClick={() => {
                  const updatedBusiness = { ...business, nftMintAddress: undefined };
                  saveBusiness(updatedBusiness);
                  router.push('/identity/mint/review');
                }}
                className={styles.mintButton}
              >
                Retry mint
              </Button>
            </div>
          ) : !connected || !publicKey ? (
            <Button
              size="m"
              mode="outline"
              disabled
              className={styles.mintButton}
            >
              Connect wallet to mint NFT
            </Button>
          ) : (
            <Button
              size="m"
              mode="outline"
              onClick={() => router.push('/identity/mint/review')}
              className={styles.mintButton}
            >
              Mint identity NFT (optional)
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
