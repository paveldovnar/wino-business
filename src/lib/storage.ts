import { Business, Transaction } from '@/types';

const BUSINESS_KEY = 'wino_business';
const TRANSACTIONS_KEY = 'wino_transactions';

export function saveBusiness(business: Business): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BUSINESS_KEY, JSON.stringify(business));
}

export function getBusiness(): Business | null {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(BUSINESS_KEY);
  if (!data) return null;
  try {
    const business = JSON.parse(data);
    return {
      ...business,
      createdAt: new Date(business.createdAt),
    };
  } catch {
    return null;
  }
}

export function clearBusiness(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(BUSINESS_KEY);
}

export function saveTransaction(transaction: Transaction): void {
  if (typeof window === 'undefined') return;
  const transactions = getTransactions();
  transactions.unshift(transaction);
  localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
}

export function getTransactions(): Transaction[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(TRANSACTIONS_KEY);
  if (!data) return [];
  try {
    const transactions = JSON.parse(data);
    return transactions.map((tx: any) => ({
      ...tx,
      timestamp: new Date(tx.timestamp),
    }));
  } catch {
    return [];
  }
}

export function clearTransactions(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TRANSACTIONS_KEY);
}
