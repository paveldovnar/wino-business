'use client';

import { ArrowLeft } from 'lucide-react';
import styles from './skeleton.module.css';

export default function PayDetailsSkeletonPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backButton}>
          <ArrowLeft size={24} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Payment details</h1>
      </div>

      <div className={styles.content}>
        <div className={styles.amountCard}>
          <div className={styles.skeleton} style={{ width: '80px', height: '14px', marginBottom: '8px' }} />
          <div className={styles.skeleton} style={{ width: '140px', height: '48px' }} />
        </div>

        <div className={styles.detailsCard}>
          <div className={styles.skeleton} style={{ width: '120px', height: '18px', marginBottom: '16px' }} />

          <div className={styles.merchant}>
            <div className={styles.skeletonIcon} />
            <div style={{ flex: 1 }}>
              <div className={styles.skeleton} style={{ width: '140px', height: '16px', marginBottom: '8px' }} />
              <div className={styles.skeleton} style={{ width: '200px', height: '14px' }} />
            </div>
          </div>

          <div className={styles.divider} />

          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.detailRow}>
              <div className={styles.skeleton} style={{ width: '80px', height: '14px' }} />
              <div className={styles.skeleton} style={{ width: '100px', height: '14px' }} />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <div className={styles.skeleton} style={{ width: '100%', height: '48px', borderRadius: 'var(--radius-md)' }} />
      </div>
    </div>
  );
}
