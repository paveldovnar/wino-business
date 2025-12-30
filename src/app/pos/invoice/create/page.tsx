'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Switch } from '@telegram-apps/telegram-ui';
import { ArrowLeft } from 'lucide-react';
import styles from './create.module.css';

const MAX_AMOUNT = 99000000;

export default function CreateInvoicePage() {
  const router = useRouter();
  const [amount, setAmount] = useState('0');
  const [allowCustomAmount, setAllowCustomAmount] = useState(false);

  const handleNumberClick = (num: string) => {
    if (allowCustomAmount) return;

    const currentValue = parseFloat(amount);
    let newValue: string;

    if (amount === '0') {
      newValue = num;
    } else {
      newValue = amount + num;
    }

    const numericValue = parseFloat(newValue) / 100;
    if (numericValue <= MAX_AMOUNT) {
      setAmount(newValue);
    }
  };

  const handleBackspace = () => {
    if (allowCustomAmount) return;

    if (amount.length === 1) {
      setAmount('0');
    } else {
      setAmount(amount.slice(0, -1));
    }
  };

  const handleGenerateQR = () => {
    const invoiceAmount = allowCustomAmount ? null : parseFloat(amount) / 100;
    sessionStorage.setItem('invoice_amount', invoiceAmount?.toString() || 'custom');
    sessionStorage.setItem('invoice_allow_custom', allowCustomAmount.toString());
    router.push('/pos/invoice/scan');
  };

  const displayAmount = allowCustomAmount ? null : (parseFloat(amount) / 100).toFixed(2);
  const isValidAmount = allowCustomAmount || (displayAmount && parseFloat(displayAmount) > 0);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={() => router.back()} className={styles.backButton}>
          <ArrowLeft size={24} strokeWidth={2} />
        </button>
        <h1 className={styles.title}>Create invoice</h1>
      </div>

      <div className={styles.content}>
        {!allowCustomAmount ? (
          <div className={styles.amountDisplay}>
            <div className={styles.currency}>USD</div>
            <div className={styles.amount}>${displayAmount}</div>
          </div>
        ) : (
          <div className={styles.customAmountInfo}>
            <p className={styles.customAmountText}>
              Customer will enter the amount on their device
            </p>
          </div>
        )}

        <div className={styles.customToggle}>
          <div className={styles.toggleLabel}>
            <span>Allow custom amount</span>
          </div>
          <Switch
            checked={allowCustomAmount}
            onChange={(e) => setAllowCustomAmount(e.target.checked)}
          />
        </div>

        {!allowCustomAmount && (
          <div className={styles.numpad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((key) => (
              <button
                key={key}
                onClick={() => {
                  if (key === '⌫') {
                    handleBackspace();
                  } else if (key !== '.') {
                    handleNumberClick(key);
                  }
                }}
                className={`${styles.numpadButton} ${key === '⌫' ? styles.numpadBackspace : ''}`}
              >
                {key}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <Button
          size="l"
          stretched
          disabled={!isValidAmount}
          onClick={handleGenerateQR}
        >
          Generate QR
        </Button>
      </div>
    </div>
  );
}
