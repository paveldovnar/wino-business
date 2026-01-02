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
 * Publishes Redis event for SSE subscribers
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

    // Publish event to Redis for SSE subscribers
    try {
      const event = {
        invoiceId: id,
        event: 'invoice-updated',
        timestamp: Date.now(),
      };
      await storage.publish?.('invoice-events', JSON.stringify(event));
      console.log(`[invoicesStore] Published event for invoice ${id}`);
    } catch (pubErr) {
      console.warn(`[invoicesStore] Failed to publish event (non-fatal):`, pubErr);
      // Don't fail the update if publish fails
    }

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

/**
 * Get pending invoice by merchant USDC ATA
 * Returns the single pending invoice for this merchant (or null)
 */
export async function getPendingInvoiceByMerchantAta(
  merchantUsdcAta: string
): Promise<StoredInvoice | null> {
  const pending = await getPendingInvoices();
  const matches = pending.filter((inv) => inv.merchantUsdcAta === merchantUsdcAta);

  if (matches.length === 0) {
    return null;
  }

  // Return most recent (highest createdAtSec)
  return matches.sort((a, b) => b.createdAtSec - a.createdAtSec)[0];
}

/**
 * Expire all pending invoices for a merchant USDC ATA
 * Used to enforce single pending invoice per POS terminal
 */
export async function expirePendingInvoicesForMerchant(
  merchantUsdcAta: string
): Promise<number> {
  console.log('[invoicesStore] Expiring pending invoices for ATA:', merchantUsdcAta);

  const pending = await getPendingInvoices();
  const toExpire = pending.filter((inv) => inv.merchantUsdcAta === merchantUsdcAta);

  console.log(`[invoicesStore] Found ${toExpire.length} pending invoice(s) to expire`);

  for (const invoice of toExpire) {
    await updateInvoice(invoice.id, { status: 'declined' });
    console.log(`[invoicesStore] Expired invoice ${invoice.id}`);
  }

  return toExpire.length;
}

/**
 * Find pending invoices matching fallback criteria (no reference)
 * Used when payer wallet doesn't include reference in transaction
 *
 * @param merchantAta - Merchant's USDC token account
 * @param amountUsd - Amount in USDC (will match with tolerance)
 * @param txBlockTime - Transaction block time (unix timestamp)
 * @returns Array of matching invoices
 */
export async function findInvoicesByFallbackMatch(
  merchantAta: string,
  amountUsd: number,
  txBlockTime: number
): Promise<StoredInvoice[]> {
  const pendingInvoices = await getPendingInvoices();
  const tolerance = 0.000001; // 1 micro-USDC tolerance

  console.log('[invoicesStore] Fallback match search:', {
    merchantAta,
    amountUsd,
    txBlockTime,
    pendingCount: pendingInvoices.length,
  });

  const matches = pendingInvoices.filter((inv) => {
    // Match merchant ATA
    if (inv.merchantUsdcAta !== merchantAta) {
      return false;
    }

    // Skip custom-amount invoices (no fixed amount to match)
    if (!inv.amountUsd) {
      return false;
    }

    // Match amount within tolerance
    const amountDiff = Math.abs(inv.amountUsd - amountUsd);
    if (amountDiff > tolerance) {
      return false;
    }

    // Check if tx is within invoice time window
    if (txBlockTime < inv.createdAtSec || txBlockTime > inv.expiresAtSec) {
      console.log('[invoicesStore] Invoice outside time window:', {
        invoiceId: inv.id,
        created: inv.createdAtSec,
        expires: inv.expiresAtSec,
        txTime: txBlockTime,
      });
      return false;
    }

    return true;
  });

  console.log(`[invoicesStore] Found ${matches.length} fallback match(es)`);
  if (matches.length > 0) {
    matches.forEach((m) =>
      console.log(`[invoicesStore]   - Invoice ${m.id} (${m.amountUsd} USDC)`)
    );
  }

  return matches;
}

/**
 * Mark invoice with fallback match info
 * Used when payment matched without reference
 */
export async function markInvoiceFallbackPaid(
  invoiceId: string,
  txSignature: string,
  payer?: string,
  needsReview?: boolean
): Promise<void> {
  console.log('[invoicesStore] Marking invoice as PAID (fallback):', {
    invoiceId,
    txSignature: txSignature.slice(0, 12) + '...',
    payer,
    needsReview,
  });

  const paidAtSec = Math.floor(Date.now() / 1000);

  await updateInvoice(invoiceId, {
    status: needsReview ? 'pending' : 'paid', // Keep pending if needs review
    matchedTxSig: txSignature,
    paidTxSig: needsReview ? undefined : txSignature,
    paidAtSec: needsReview ? undefined : paidAtSec,
    payer,
    needsReview,
  });

  console.log(
    `[invoicesStore] ✅ Invoice ${invoiceId} marked ${needsReview ? 'NEEDS REVIEW' : 'PAID (fallback)'}`
  );
}
