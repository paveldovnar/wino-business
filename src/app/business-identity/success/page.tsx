'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet-mock';
import { Button } from '@telegram-apps/telegram-ui';
import { CheckCircle2, Building2, ExternalLink } from 'lucide-react';
import { saveBusiness } from '@/lib/storage';
import { Business } from '@/types';
import styles from './success.module.css';

export default function BusinessIdentitySuccessPage() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [businessName, setBusinessName] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [mintAddress, setMintAddress] = useState('');

  useEffect(() => {
    const name = sessionStorage.getItem('business_name');
    const logoData = sessionStorage.getItem('business_logo');
    const nftMint = sessionStorage.getItem('nft_mint_address');

    if (!name || !nftMint) {
      router.replace('/business-identity/name');
      return;
    }

    setBusinessName(name);
    setLogo(logoData);
    setMintAddress(nftMint);

    const business: Business = {
      id: crypto.randomUUID(),
      name,
      logo: logoData || undefined,
      walletAddress: publicKey?.toBase58() || 'mock-wallet-address',
      nftMintAddress: nftMint,
      createdAt: new Date(),
    };

    saveBusiness(business);
  }, [publicKey, router]);

  const handleFinish = () => {
    sessionStorage.removeItem('business_name');
    sessionStorage.removeItem('business_logo');
    sessionStorage.removeItem('nft_mint_address');

    router.push('/dashboard');
  };

  const viewOnExplorer = () => {
    const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';
    const explorerUrl = `https://explorer.solana.com/address/${mintAddress}?cluster=${cluster}`;
    window.open(explorerUrl, '_blank');
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.successIcon}>
          <CheckCircle2 size={64} strokeWidth={2} />
        </div>

        <h1 className={styles.title}>Success!</h1>

        <p className={styles.description}>
          Your business identity has been created
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

          {mintAddress && (
            <button
              onClick={viewOnExplorer}
              className={styles.explorerLink}
            >
              <span>View on Solana Explorer</span>
              <ExternalLink size={16} strokeWidth={2} />
            </button>
          )}
        </div>

        <div className={styles.infoBox}>
          <p className={styles.infoText}>
            Your business identity NFT has been minted on Solana.
            You can now start accepting payments and managing invoices.
          </p>
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          onClick={handleFinish}
        >
          Finish
        </Button>
      </div>
    </div>
  );
}
