'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, SegmentedControl } from '@telegram-apps/telegram-ui';
import { X, CheckCircle2, Clock, XCircle, Plus } from 'lucide-react';
import { getTransactions } from '@/lib/storage';
import { Transaction, TransactionStatus } from '@/types';
import styles from './pos.module.css';

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: '1',
    signature: '5Kq...',
    amount: 150.00,
    from: '9xQq...7Km2',
    to: '4Hs3...8Wp1',
    status: 'success',
    timestamp: new Date(),
    type: 'invoice',
  },
  {
    id: '2',
    signature: '3Jw...',
    amount: 85.50,
    from: '7Rp5...2Nm9',
    to: '4Hs3...8Wp1',
    status: 'success',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    type: 'invoice',
  },
  {
    id: '3',
    signature: '8Mn...',
    amount: 220.00,
    from: '2Tp8...5Qr4',
    to: '4Hs3...8Wp1',
    status: 'pending',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    type: 'invoice',
  },
  {
    id: '4',
    signature: '6Lp...',
    amount: 45.25,
    from: '1Kp9...3Ws7',
    to: '4Hs3...8Wp1',
    status: 'failed',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    type: 'invoice',
  },
];

export default function POSPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<'success' | 'pending' | 'failed'>('success');
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const storedTxs = getTransactions();
    const allTxs = storedTxs.length > 0 ? storedTxs : MOCK_TRANSACTIONS;
    setTransactions(allTxs);
  }, []);

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
        {groups.length === 0 ? (
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
