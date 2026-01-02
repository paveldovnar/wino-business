'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { Building2, DollarSign, Shield, CheckCircle2, LogOut } from 'lucide-react';
import { getBusiness, saveBusiness } from '@/lib/storage';
import { useWallet } from '@/lib/wallet-mock';
import { Business } from '@/types';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import styles from './dashboard.module.css';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

interface ApiTransaction {
  id: string;
  status: 'pending' | 'paid' | 'declined';
  amountUsd: number;
  createdAt: number; // unix timestamp in seconds
  paidAt?: number; // unix timestamp in seconds
  paidTxSig?: string;
  payer?: string;
}

interface DashboardMetrics {
  totalBalance: number;
  incomeToday: number;
  incomeLast30Days: number;
  averageDay: number;
  todayVsAverage: number; // percentage
  lastUpdate: Date | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { publicKey, disconnect } = useWallet();
  const [business, setBusiness] = useState<Business | null>(null);
  const [merchantAta, setMerchantAta] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalBalance: 0,
    incomeToday: 0,
    incomeLast30Days: 0,
    averageDay: 0,
    todayVsAverage: 0,
    lastUpdate: null,
  });
  const [loading, setLoading] = useState(true);
  const [mintVerified, setMintVerified] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Compute merchant USDC ATA
  useEffect(() => {
    async function computeAta() {
      if (!publicKey) {
        setMerchantAta(null);
        return;
      }

      try {
        const ata = await getAssociatedTokenAddress(publicKey, USDC_MINT);
        setMerchantAta(ata.toBase58());
        console.log('[dashboard] Merchant USDC ATA:', ata.toBase58());
      } catch (err) {
        console.error('[dashboard] Failed to compute ATA:', err);
        setMerchantAta(null);
      }
    }

    computeAta();
  }, [publicKey]);

  // Fetch transactions from API
  useEffect(() => {
    async function fetchTransactions() {
      if (!merchantAta) {
        setTransactions([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log('[dashboard] Fetching transactions for ATA:', merchantAta);

        const res = await fetch(`/api/transactions?merchantAta=${merchantAta}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        console.log('[dashboard] Fetched transactions:', data.count);

        setTransactions(data.transactions || []);
      } catch (err) {
        console.error('[dashboard] Failed to fetch transactions:', err);
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    }

    fetchTransactions();

    // Refresh every 30 seconds
    const interval = setInterval(fetchTransactions, 30000);
    return () => clearInterval(interval);
  }, [merchantAta]);

  // Calculate metrics from transactions
  useEffect(() => {
    const now = Date.now() / 1000; // current time in seconds
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartSec = todayStart.getTime() / 1000;

    const last30DaysStart = now - 30 * 24 * 60 * 60;
    const last90DaysStart = now - 90 * 24 * 60 * 60;

    // Filter paid transactions only
    const paidTxs = transactions.filter((tx) => tx.status === 'paid' && tx.paidAt);

    // Total balance (all paid)
    const totalBalance = paidTxs.reduce((sum, tx) => sum + tx.amountUsd, 0);

    // Income today
    const incomeToday = paidTxs
      .filter((tx) => tx.paidAt! >= todayStartSec)
      .reduce((sum, tx) => sum + tx.amountUsd, 0);

    // Income last 30 days
    const incomeLast30Days = paidTxs
      .filter((tx) => tx.paidAt! >= last30DaysStart)
      .reduce((sum, tx) => sum + tx.amountUsd, 0);

    // Calculate average day (last 90 days)
    const last90DaysTxs = paidTxs.filter((tx) => tx.paidAt! >= last90DaysStart);
    const last90DaysIncome = last90DaysTxs.reduce((sum, tx) => sum + tx.amountUsd, 0);
    const averageDay = last90DaysIncome / 90;

    // Today vs average
    const todayVsAverage = averageDay > 0 ? ((incomeToday - averageDay) / averageDay) * 100 : 0;

    // Last update time
    const lastUpdate = paidTxs.length > 0
      ? new Date(Math.max(...paidTxs.map((tx) => tx.paidAt! * 1000)))
      : null;

    setMetrics({
      totalBalance,
      incomeToday,
      incomeLast30Days,
      averageDay,
      todayVsAverage,
      lastUpdate,
    });
  }, [transactions]);

  // Load business and verify NFT
  useEffect(() => {
    const businessData = getBusiness();
    if (!businessData) {
      router.replace('/welcome');
      return;
    }

    setBusiness(businessData);

    // Verify NFT mint status if business has a mint address
    if (businessData.nftMintAddress) {
      verifyMintStatus(businessData.nftMintAddress);
    }
  }, [router]);

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
        console.log('[dashboard] Wallet disconnected');
        router.push('/welcome');
      } catch (err) {
        console.error('[dashboard] Failed to disconnect wallet:', err);
      }
    }
  };

  if (!business) {
    return null;
  }

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercentage = (value: number) => {
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
        {publicKey && (
          <button onClick={handleDisconnect} className={styles.walletButton} title="Disconnect wallet">
            <LogOut size={20} strokeWidth={2} />
          </button>
        )}
      </div>

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
            {metrics.lastUpdate
              ? `Last updated ${metrics.lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'No transactions yet'}
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
                  color: metrics.todayVsAverage >= 0 ? '#4CAF50' : '#f44336',
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
                  // Clear failed mint address to allow retry
                  const updatedBusiness = { ...business, nftMintAddress: undefined };
                  saveBusiness(updatedBusiness);
                  router.push('/identity/mint/review');
                }}
                className={styles.mintButton}
              >
                Retry mint
              </Button>
            </div>
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
