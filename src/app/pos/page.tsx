'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Placeholder } from '@telegram-apps/telegram-ui';
import { X, CheckCircle2, Plus, ExternalLink, LogOut } from 'lucide-react';
import { useWallet } from '@/lib/wallet-mock';
import { fullWalletLogout } from '@/lib/wallet-persistence';
import styles from './pos.module.css';

interface OnChainTransaction {
  signature: string;
  blockTime: number | null;
  source: string | null;
  amountUi: number | null;
  destination: string | null;
  status: string;
  explorerUrl: string;
}

export default function POSPage() {
  const router = useRouter();
  const { publicKey, connected, disconnect } = useWallet();

  // Full logout handler
  const handleLogout = useCallback(async () => {
    console.log('[POS] Logging out...');
    try {
      await disconnect();
    } catch (err) {
      console.warn('[POS] Disconnect failed:', err);
    }
    fullWalletLogout();
    router.push('/connect-wallet');
  }, [disconnect, router]);
  const [transactions, setTransactions] = useState<OnChainTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch real on-chain transactions
  const fetchTransactions = async (ownerAddress: string) => {
    try {
      console.log('[POS] Fetching transactions for owner:', ownerAddress);
      const res = await fetch(`/api/transactions?owner=${ownerAddress}`);
      if (!res.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const data = await res.json();
      console.log('[POS] Fetched', data.count, 'transactions');
      setTransactions(data.transactions || []);
      setLoading(false);
    } catch (err) {
      console.error('[POS] Error fetching transactions:', err);
      setTransactions([]);
      setLoading(false);
    }
  };

  // Start polling for transactions
  useEffect(() => {
    if (!publicKey) {
      setLoading(false);
      return;
    }

    const ownerAddress = publicKey.toBase58();

    // Fetch immediately
    fetchTransactions(ownerAddress);

    // Poll every 5 seconds
    pollingIntervalRef.current = setInterval(() => {
      fetchTransactions(ownerAddress);
    }, 5000);

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [publicKey]);

  const groupTransactionsByDate = (txs: OnChainTransaction[]) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { label: string; transactions: OnChainTransaction[] }[] = [];
    const todayTxs: OnChainTransaction[] = [];
    const yesterdayTxs: OnChainTransaction[] = [];
    const olderTxs: OnChainTransaction[] = [];

    txs.forEach(tx => {
      if (!tx.blockTime) {
        olderTxs.push(tx);
        return;
      }
      const txDate = new Date(tx.blockTime * 1000);
      if (txDate.toDateString() === today.toDateString()) {
        todayTxs.push(tx);
      } else if (txDate.toDateString() === yesterday.toDateString()) {
        yesterdayTxs.push(tx);
      } else {
        olderTxs.push(tx);
      }
    });

    if (todayTxs.length > 0) {
      groups.push({ label: 'Today', transactions: todayTxs });
    }
    if (yesterdayTxs.length > 0) {
      groups.push({ label: 'Yesterday', transactions: yesterdayTxs });
    }
    if (olderTxs.length > 0) {
      groups.push({ label: 'Older', transactions: olderTxs });
    }

    return groups;
  };

  const groups = groupTransactionsByDate(transactions);

  const formatAddress = (address: string | null) => {
    if (!address || address === 'unknown') return 'Unknown';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatAmount = (amount: number | null) => {
    if (amount === null || amount === undefined) return '—';
    return `$${amount.toFixed(2)}`;
  };

  const formatTime = (blockTime: number | null) => {
    if (!blockTime) return '—';
    return new Date(blockTime * 1000).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.push('/dashboard')} className={styles.closeButton}>
          <X size={24} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>POS Mode</h1>
        <button onClick={handleLogout} className={styles.closeButton} title="Logout" style={{ marginLeft: 'auto' }}>
          <LogOut size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Removed filter tabs - show all transactions */}

      <div className={styles.content}>
        {loading ? (
          <div className={styles.empty}>
            <Placeholder
              header="Loading..."
              description="Fetching transactions from chain"
            >
            </Placeholder>
          </div>
        ) : !connected || !publicKey ? (
          <div className={styles.empty}>
            <Placeholder
              header="Wallet not connected"
              description="Connect your wallet to view transactions"
            >
            </Placeholder>
          </div>
        ) : transactions.length === 0 ? (
          <div className={styles.empty}>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
              No transactions yet
            </p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label} className={styles.group}>
              <div className={styles.groupHeader}>{group.label}</div>
              <div className={styles.list}>
                {group.transactions.map(tx => (
                  <div key={tx.signature} className={styles.transaction}>
                    <div className={styles.transactionIcon}>
                      <CheckCircle2 size={20} strokeWidth={2} className={styles.iconSuccess} />
                    </div>
                    <div className={styles.transactionContent}>
                      <div className={styles.transactionFrom}>
                        From {formatAddress(tx.source)}
                      </div>
                      <div className={styles.transactionTime}>
                        {formatTime(tx.blockTime)}
                      </div>
                    </div>
                    <div className={styles.transactionAmount}>
                      <span>{formatAmount(tx.amountUi)}</span>
                      <a
                        href={tx.explorerUrl || `https://solscan.io/tx/${tx.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ marginLeft: '4px', color: 'var(--accent)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          onClick={() => router.push('/pos/invoice/create')}
          before={<Plus size={20} strokeWidth={2} />}
        >
          Create invoice
        </Button>
      </div>
    </div>
  );
}
