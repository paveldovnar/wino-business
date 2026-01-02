'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button, SegmentedControl, Placeholder } from '@telegram-apps/telegram-ui';
import { X, CheckCircle2, Clock, XCircle, Plus } from 'lucide-react';
import { useWallet } from '@/lib/wallet-mock';
import { Transaction, TransactionStatus } from '@/types';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import styles from './pos.module.css';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

export default function POSPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [filter, setFilter] = useState<'success' | 'pending' | 'failed'>('success');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [merchantAta, setMerchantAta] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Compute merchant USDC ATA when wallet is connected
  useEffect(() => {
    const computeAta = async () => {
      if (!publicKey) {
        setMerchantAta(null);
        return;
      }

      try {
        const ata = await getAssociatedTokenAddress(
          publicKey,
          USDC_MINT
        );
        setMerchantAta(ata.toBase58());
        console.log('[POS] Merchant USDC ATA:', ata.toBase58());
      } catch (err) {
        console.error('[POS] Error computing ATA:', err);
      }
    };

    computeAta();
  }, [publicKey]);

  // Fetch transactions from API
  const fetchTransactions = async (ata: string) => {
    try {
      const res = await fetch(`/api/transactions?merchantAta=${ata}`);
      if (!res.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const data = await res.json();
      const apiTransactions = data.transactions || [];

      // Map API response to Transaction format
      const mappedTransactions: Transaction[] = apiTransactions.map((tx: any) => {
        // Map status: 'paid' -> 'success', 'declined'/'expired' -> 'failed'
        let status: 'pending' | 'success' | 'failed' = 'pending';
        if (tx.status === 'paid') {
          status = 'success';
        } else if (tx.status === 'declined' || tx.status === 'expired') {
          status = 'failed';
        }

        // Use paidAt if available, otherwise createdAt
        const timestampSec = tx.paidAt || tx.createdAt;
        const timestamp = new Date(timestampSec * 1000);

        return {
          id: tx.id,
          signature: tx.paidTxSig || '',
          amount: tx.amountUsd || 0,
          from: tx.payer || '',
          to: ata, // Merchant ATA
          status,
          timestamp,
          type: 'invoice',
        };
      });

      setTransactions(mappedTransactions);
      setLoading(false);
    } catch (err) {
      console.error('[POS] Error fetching transactions:', err);
      setLoading(false);
    }
  };

  // Start polling for transactions
  useEffect(() => {
    if (!merchantAta) {
      setLoading(false);
      return;
    }

    // Fetch immediately
    fetchTransactions(merchantAta);

    // Poll every 10 seconds
    pollingIntervalRef.current = setInterval(() => {
      fetchTransactions(merchantAta);
    }, 10000);

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [merchantAta]);

  const filteredTransactions = transactions.filter(tx => tx.status === filter);

  const groupTransactionsByDate = (txs: Transaction[]) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups: { label: string; transactions: Transaction[] }[] = [];
    const todayTxs: Transaction[] = [];
    const yesterdayTxs: Transaction[] = [];
    const olderTxs: Transaction[] = [];

    txs.forEach(tx => {
      const txDate = new Date(tx.timestamp);
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

  const groups = groupTransactionsByDate(filteredTransactions);

  const getStatusIcon = (status: TransactionStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 size={20} strokeWidth={2} className={styles.iconSuccess} />;
      case 'pending':
        return <Clock size={20} strokeWidth={2} className={styles.iconPending} />;
      case 'failed':
      case 'declined':
        return <XCircle size={20} strokeWidth={2} className={styles.iconFailed} />;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.push('/dashboard')} className={styles.closeButton}>
          <X size={24} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>POS Mode</h1>
      </div>

      <div className={styles.filters}>
        <SegmentedControl>
          <SegmentedControl.Item
            selected={filter === 'success'}
            onClick={() => setFilter('success')}
          >
            Success
          </SegmentedControl.Item>
          <SegmentedControl.Item
            selected={filter === 'pending'}
            onClick={() => setFilter('pending')}
          >
            Pending
          </SegmentedControl.Item>
          <SegmentedControl.Item
            selected={filter === 'failed'}
            onClick={() => setFilter('failed')}
          >
            Failed
          </SegmentedControl.Item>
        </SegmentedControl>
      </div>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.empty}>
            <Placeholder
              header="Loading transactions..."
              description="Fetching your payment history"
            >
              <Clock size={48} strokeWidth={2} style={{ opacity: 0.5 }} />
            </Placeholder>
          </div>
        ) : !publicKey ? (
          <div className={styles.empty}>
            <Placeholder
              header="Wallet not connected"
              description="Please connect your wallet to view transactions"
            >
              <X size={48} strokeWidth={2} style={{ opacity: 0.5 }} />
            </Placeholder>
          </div>
        ) : groups.length === 0 ? (
          <div className={styles.empty}>
            <p>No {filter} transactions</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label} className={styles.group}>
              <div className={styles.groupHeader}>{group.label}</div>
              <div className={styles.list}>
                {group.transactions.map(tx => (
                  <div key={tx.id} className={styles.transaction}>
                    <div className={styles.transactionIcon}>
                      {getStatusIcon(tx.status)}
                    </div>
                    <div className={styles.transactionContent}>
                      <div className={styles.transactionFrom}>From {tx.from}</div>
                      <div className={styles.transactionTime}>
                        {new Date(tx.timestamp).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className={styles.transactionAmount}>
                      ${tx.amount.toFixed(2)}
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
