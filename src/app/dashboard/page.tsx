'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { Building2, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { getBusiness, getTransactions } from '@/lib/storage';
import { Business, Transaction } from '@/types';
import styles from './dashboard.module.css';

export default function DashboardPage() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const businessData = getBusiness();
    if (!businessData) {
      router.replace('/welcome');
      return;
    }

    setBusiness(businessData);

    const txs = getTransactions();
    setTransactions(txs);

    const successfulTxs = txs.filter(tx => tx.status === 'success');
    const totalBalance = successfulTxs.reduce((sum, tx) => sum + tx.amount, 0);
    setBalance(totalBalance);
  }, [router]);

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

        <div className={styles.actions}>
          <Button
            size="l"
            stretched
            onClick={() => router.push('/pos')}
            className={styles.primaryButton}
          >
            Open POS mode
          </Button>

          <Button
            size="l"
            stretched
            mode="outline"
            onClick={() => router.push('/pay/scan')}
            className={styles.secondaryButton}
          >
            Pay
          </Button>
        </div>
      </div>
    </div>
  );
}
