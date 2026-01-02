'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { Building2, TrendingUp, DollarSign, Activity, Shield, CheckCircle2, LogOut, Wallet as WalletIcon } from 'lucide-react';
import { getBusiness, getTransactions, getPendingTransactions, updateTransactionStatus } from '@/lib/storage';
import { trackTransaction } from '@/lib/tx-status';
import { useWallet } from '@/lib/wallet-mock';
import { Business, Transaction } from '@/types';
import styles from './dashboard.module.css';

export default function DashboardPage() {
  const router = useRouter();
  const { publicKey, disconnect } = useWallet();
  const [business, setBusiness] = useState<Business | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [mintVerified, setMintVerified] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const businessData = getBusiness();
    if (!businessData) {
      router.replace('/welcome');
      return;
    }

    setBusiness(businessData);

    const loadTransactions = () => {
      const txs = getTransactions();
      setTransactions(txs);

      const successfulTxs = txs.filter(tx => tx.status === 'success');
      const totalBalance = successfulTxs.reduce((sum, tx) => sum + tx.amount, 0);
      setBalance(totalBalance);
    };

    loadTransactions();

    // Restore tracking for any pending transactions
    // This ensures that if the user refreshed the page or reopened the app,
    // pending transactions will continue to be tracked
    const pendingTxs = getPendingTransactions();
    const cleanupFunctions: (() => void)[] = [];

    pendingTxs.forEach(tx => {
      console.log(`[dashboard] Restoring tracking for pending tx: ${tx.signature.slice(0, 8)}...`);

      const cleanup = trackTransaction(tx.signature, {
        onConfirmed: () => {
          console.log(`[dashboard] Transaction confirmed: ${tx.signature.slice(0, 8)}...`);
          updateTransactionStatus(tx.signature, 'success');
          loadTransactions(); // Reload to update UI
        },
        onFailed: (error) => {
          console.error(`[dashboard] Transaction failed: ${tx.signature.slice(0, 8)}...`, error);
          updateTransactionStatus(tx.signature, 'failed');
          loadTransactions(); // Reload to update UI
        },
      });

      cleanupFunctions.push(cleanup);
    });

    // Verify NFT mint status if business has a mint address
    if (businessData.nftMintAddress) {
      verifyMintStatus(businessData.nftMintAddress);
    }

    // Cleanup all tracking subscriptions when component unmounts
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
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

  if (!business) {
    return null;
  }

  const todayTransactions = transactions.filter(tx => {
    const today = new Date();
    const txDate = new Date(tx.timestamp);
    return txDate.toDateString() === today.toDateString();
  }).length;

  const successRate = transactions.length > 0
    ? (transactions.filter(tx => tx.status === 'success').length / transactions.length) * 100
    : 0;

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
        <div className={styles.balanceCard}>
          <div className={styles.balanceHeader}>
            <span className={styles.balanceLabel}>Total balance</span>
            <DollarSign size={20} strokeWidth={2} className={styles.balanceIcon} />
          </div>
          <div className={styles.balanceAmount}>
            ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={styles.balanceSubtext}>
            {todayTransactions} transactions today
          </div>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>
              <Activity size={24} strokeWidth={2} />
            </div>
            <div className={styles.statContent}>
              <div className={styles.statValue}>{transactions.length}</div>
              <div className={styles.statLabel}>Total transactions</div>
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>
              <TrendingUp size={24} strokeWidth={2} />
            </div>
            <div className={styles.statContent}>
              <div className={styles.statValue}>{successRate.toFixed(0)}%</div>
              <div className={styles.statLabel}>Success rate</div>
            </div>
          </div>
        </div>

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
                onClick={() => router.push('/identity/mint/review')}
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
