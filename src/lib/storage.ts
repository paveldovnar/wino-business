import { Business, Transaction, Invoice } from '@/types';

const BUSINESS_KEY = 'wino_business';
const TRANSACTIONS_KEY = 'wino_transactions';
const INVOICES_KEY = 'wino_invoices';

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

export function updateTransactionStatus(
  signature: string,
  status: 'pending' | 'success' | 'failed'
): void {
  if (typeof window === 'undefined') return;
  const transactions = getTransactions();
  const txIndex = transactions.findIndex(tx => tx.signature === signature);

  if (txIndex !== -1) {
    transactions[txIndex].status = status;
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
  }
}

export function getPendingTransactions(): Transaction[] {
  return getTransactions().filter(tx => tx.status === 'pending');
}

// Invoice storage functions
export function saveInvoice(invoice: Invoice): void {
  if (typeof window === 'undefined') return;
  const invoices = getInvoices();
  invoices.unshift(invoice);
  localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
}

export function getInvoices(): Invoice[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem(INVOICES_KEY);
  if (!data) return [];
  try {
    const invoices = JSON.parse(data);
    return invoices.map((inv: any) => ({
      ...inv,
      createdAt: new Date(inv.createdAt),
      expiresAt: inv.expiresAt ? new Date(inv.expiresAt) : new Date(new Date(inv.createdAt).getTime() + 10 * 60 * 1000),
    }));
  } catch {
    return [];
  }
}

export function getInvoiceById(id: string): Invoice | null {
  const invoices = getInvoices();
  return invoices.find(inv => inv.id === id) || null;
}

export function updateInvoiceStatus(
  id: string,
  status: 'pending' | 'success' | 'declined',
  signature?: string,
  from?: string
): void {
  if (typeof window === 'undefined') return;
  const invoices = getInvoices();
  const invIndex = invoices.findIndex(inv => inv.id === id);

  if (invIndex !== -1) {
    invoices[invIndex].status = status;
    if (signature) {
      invoices[invIndex].signature = signature;
    }
    if (from) {
      invoices[invIndex].from = from;
    }
    localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
  }
}

export function getPendingInvoices(): Invoice[] {
  return getInvoices().filter(inv => inv.status === 'pending');
}
