'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@telegram-apps/telegram-ui';
import { ArrowLeft, Upload, Building2 } from 'lucide-react';
import styles from './name.module.css';

export default function BusinessIdentityNamePage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [logo, setLogo] = useState<string | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleContinue = () => {
    if (businessName) {
      sessionStorage.setItem('business_name', businessName);
      if (logo) {
        sessionStorage.setItem('business_logo', logo);
      }
      router.push('/business-identity/review');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          <ArrowLeft size={24} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Business identity</h1>
      </div>

      <div className={styles.content}>
        <div className={styles.step}>Step 1 of 2</div>

        <h2 className={styles.heading}>Name your business</h2>

        <div className={styles.form}>
          <Input
            header="Business name"
            placeholder="Enter business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className={styles.input}
          />

          <div className={styles.logoSection}>
            <label className={styles.logoLabel}>Logo (optional)</label>
            <div className={styles.logoUpload}>
              {logo ? (
                <div className={styles.logoPreview}>
                  <img src={logo} alt="Logo" className={styles.logoImage} />
                  <button
                    onClick={() => setLogo(null)}
                    className={styles.logoRemove}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label className={styles.uploadArea}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className={styles.fileInput}
                  />
                  <div className={styles.uploadContent}>
                    <Upload size={32} strokeWidth={2} />
                    <span>Upload logo</span>
                  </div>
                </label>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          disabled={!businessName}
          onClick={handleContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
