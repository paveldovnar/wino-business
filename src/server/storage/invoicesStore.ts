/**
 * Invoice Storage Layer
 * Reference-based invoice matching for robust payment detection
 */

import { getStorage } from './storage';
import { StoredInvoice } from '../solana/types';

/**
 * Create a new invoice in storage
 * Stores both invoice data and reference -> invoiceId mapping
 */
export async function createInvoice(invoice: StoredInvoice): Promise<void> {
  console.log('[invoicesStore] Creating invoice:', {
    id: invoice.id,
    reference: invoice.referencePubkey,
    amount: invoice.amountUsd,
    merchant: invoice.merchantWallet,
    merchantAta: invoice.merchantUsdcAta,
  });

  try {
    const storage = await getStorage();

    // Store invoice by ID
    await storage.set(`invoice:${invoice.id}`, JSON.stringify(invoice));

    // Store reverse mapping: reference -> invoiceId
    await storage.set(`invoice:ref:${invoice.referencePubkey}`, invoice.id);

    // Add to sorted set for listing (sorted by creation time)
    await storage.zadd('invoices:list', invoice.createdAtSec, invoice.id);

    console.log('[invoicesStore] ✅ Invoice created successfully');
  } catch (err: any) {
    console.error('[invoicesStore] ❌ Error creating invoice:', err);
    throw new Error(`Failed to create invoice in storage: ${err.message}`);
  }
}

/**
 * Get an invoice by ID
 */
export async function getInvoice(id: string): Promise<StoredInvoice | null> {
  try {
    const storage = await getStorage();
    const data = await storage.get(`invoice:${id}`);

    if (!data) {
      console.log(`[invoicesStore] Invoice ${id} not found`);
      return null;
    }

    return JSON.parse(data) as StoredInvoice;
  } catch (err: any) {
    console.error(`[invoicesStore] Error getting invoice ${id}:`, err);
    return null;
  }
}

/**
 * Get an invoice by reference public key
 * Primary method for webhook matching
 */
export async function getInvoiceByReference(referencePubkey: string): Promise<StoredInvoice | null> {
  try {
    const storage = await getStorage();

    // Look up invoice ID by reference
    const invoiceId = await storage.get(`invoice:ref:${referencePubkey}`);

    if (!invoiceId) {
      console.log(`[invoicesStore] No invoice found for reference ${referencePubkey}`);
      return null;
    }

    // Fetch the invoice
    return await getInvoice(invoiceId);
  } catch (err: any) {
    console.error(`[invoicesStore] Error getting invoice by reference ${referencePubkey}:`, err);
    return null;
  }
}

/**
 * Update an invoice (partial update)
 */
export async function updateInvoice(id: string, patch: Partial<StoredInvoice>): Promise<void> {
  try {
    const existing = await getInvoice(id);
    if (!existing) {
      throw new Error(`Invoice ${id} not found`);
    }

    const updated = { ...existing, ...patch };
    const storage = await getStorage();
    await storage.set(`invoice:${id}`, JSON.stringify(updated));

    console.log(`[invoicesStore] Updated invoice ${id}:`, patch);
  } catch (err: any) {
    console.error(`[invoicesStore] Error updating invoice ${id}:`, err);
    throw err;
  }
}

/**
 * List invoices (most recent first)
 */
export async function listInvoices(limit: number = 100): Promise<StoredInvoice[]> {
  try {
    const storage = await getStorage();

    // Get invoice IDs from sorted set (newest first)
    const ids = await storage.zrevrange('invoices:list', 0, limit - 1);

    if (!ids || ids.length === 0) {
      return [];
    }

    // Fetch all invoices using pipeline for efficiency
    const pipeline = storage.pipeline();
    ids.forEach((id) => {
      pipeline.get(`invoice:${id}`);
    });

    const results = await pipeline.exec();
    if (!results) {
      return [];
    }

    const invoices: StoredInvoice[] = [];
    for (const [err, data] of results) {
      if (!err && data) {
        try {
          invoices.push(JSON.parse(data as string) as StoredInvoice);
        } catch (parseErr) {
          console.error('[invoicesStore] Error parsing invoice:', parseErr);
        }
      }
    }

    return invoices;
  } catch (err: any) {
    console.error('[invoicesStore] Error listing invoices:', err);
    return [];
  }
}

/**
 * Mark invoice as paid
 * Called by webhook handler when payment detected
 */
export async function markInvoicePaid(
  invoiceId: string,
  txSignature: string,
  payer?: string
): Promise<void> {
  console.log('[invoicesStore] Marking invoice as PAID:', {
    invoiceId,
    txSignature: txSignature.slice(0, 12) + '...',
    payer,
  });

  const paidAtSec = Math.floor(Date.now() / 1000);

  await updateInvoice(invoiceId, {
    status: 'paid',
    paidTxSig: txSignature,
    paidAtSec,
    payer,
  });

  console.log(`[invoicesStore] ✅ Invoice ${invoiceId} marked as PAID`);
}

/**
 * Get all pending invoices
 */
export async function getPendingInvoices(): Promise<StoredInvoice[]> {
  const allInvoices = await listInvoices(100);
  return allInvoices.filter((inv) => inv.status === 'pending');
}
