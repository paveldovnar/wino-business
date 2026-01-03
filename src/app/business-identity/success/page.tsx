'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@telegram-apps/telegram-ui';
import { CheckCircle2, Building2, ExternalLink } from 'lucide-react';
import { getSolscanLink, getSolscanAccountLink } from '@/lib/identity-pda';
import { useWallet } from '@/lib/wallet-mock';
import styles from './success.module.css';

export default function BusinessIdentitySuccessPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [businessName, setBusinessName] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [identityPda, setIdentityPda] = useState('');
  const [txSignature, setTxSignature] = useState('');

  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet') as 'devnet' | 'mainnet-beta';

  useEffect(() => {
    const name = sessionStorage.getItem('business_name');
    const logoData = sessionStorage.getItem('business_logo');
    const pda = sessionStorage.getItem('identity_pda');
    const sig = sessionStorage.getItem('identity_tx_signature');

    if (!name || !pda) {
      // If no data, redirect to dashboard (they might have refreshed)
      router.replace('/dashboard');
      return;
    }

    setBusinessName(name);
    setLogo(logoData);
    setIdentityPda(pda);
    setTxSignature(sig || '');
  }, [router]);

  const handleFinish = () => {
    // Clear session storage
    sessionStorage.removeItem('business_name');
    sessionStorage.removeItem('business_logo');
    sessionStorage.removeItem('identity_pda');
    sessionStorage.removeItem('identity_tx_signature');
    sessionStorage.removeItem('arweave_tx_id');
    sessionStorage.removeItem('logo_uri');

    router.push('/dashboard');
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.successIcon}>
          <CheckCircle2 size={64} strokeWidth={2} />
        </div>

        <h1 className={styles.title}>Success!</h1>

        <p className={styles.description}>
          Your business identity is now on-chain
        </p>

        <div className={styles.card}>
          <div className={styles.logoWrapper}>
            {logo ? (
              <img src={logo} alt="Logo" className={styles.logo} />
            ) : (
              <div className={styles.logoPlaceholder}>
                <Building2 size={40} strokeWidth={2} />
              </div>
            )}
          </div>

          <div className={styles.details}>
            <h3 className={styles.businessName}>{businessName}</h3>
            <p className={styles.businessType}>Business merchant</p>
          </div>

          {/* Authority (Wallet) */}
          {publicKey && (
            <div className={styles.addressRow}>
              <span className={styles.addressLabel}>Authority:</span>
              <span className={styles.addressValue}>
                {publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-8)}
              </span>
            </div>
          )}

          {/* Identity PDA */}
          {identityPda && (
            <div className={styles.addressRow}>
              <span className={styles.addressLabel}>Identity PDA:</span>
              <a
                href={getSolscanAccountLink(identityPda, cluster)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.explorerLink}
              >
                <span>{identityPda.slice(0, 8)}...{identityPda.slice(-8)}</span>
                <ExternalLink size={14} strokeWidth={2} />
              </a>
            </div>
          )}

          {/* Transaction Signature */}
          {txSignature && (
            <div className={styles.addressRow}>
              <span className={styles.addressLabel}>TX Signature:</span>
              <a
                href={getSolscanLink(txSignature, cluster)}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.explorerLink}
              >
                <span>{txSignature.slice(0, 8)}...{txSignature.slice(-8)}</span>
                <ExternalLink size={14} strokeWidth={2} />
              </a>
            </div>
          )}
        </div>

        <div className={styles.infoBox}>
          <p className={styles.infoText}>
            Your business identity is permanently stored on Solana.
            It will be automatically discovered when you connect with your wallet.
          </p>
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          onClick={handleFinish}
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
