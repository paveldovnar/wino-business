'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { Building2 } from 'lucide-react';
import styles from './welcome.module.css';

export default function WelcomePage() {
  const router = useRouter();

  return (
    <div className={`${styles.container} gradient-bg`}>
      <div className={styles.content}>
        <div className={styles.iconWrapper}>
          <Building2 size={64} strokeWidth={2} className={styles.icon} />
        </div>

        <h1 className={styles.title}>Welcome to Wino Business</h1>

        <p className={styles.description}>
          Accept crypto payments, manage invoices, and grow your business with blockchain technology.
        </p>

        <div className={styles.features}>
          <div className={styles.feature}>
            <div className={styles.featureBullet}>✓</div>
            <span>Accept Solana payments instantly</span>
          </div>
          <div className={styles.feature}>
            <div className={styles.featureBullet}>✓</div>
            <span>Generate QR invoices</span>
          </div>
          <div className={styles.feature}>
            <div className={styles.featureBullet}>✓</div>
            <span>Track transaction history</span>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          onClick={() => router.push('/connect-wallet')}
          className={styles.primaryButton}
        >
          Create business profile
        </Button>

        <Button
          size="l"
          stretched
          mode="plain"
          onClick={() => router.push('/dashboard')}
          className={styles.secondaryButton}
        >
          Log in
        </Button>
      </div>
    </div>
  );
}
