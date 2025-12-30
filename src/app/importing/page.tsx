'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import styles from './importing.module.css';

export default function ImportingPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/business-identity/name');
    }, 2500);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className={`${styles.container} gradient-bg`}>
      <div className={styles.content}>
        <LoadingSpinner size={48} className={styles.spinner} />
        <h2 className={styles.title}>Importing wallet...</h2>
        <p className={styles.description}>
          This will only take a moment
        </p>
      </div>
    </div>
  );
}
