import { Connection } from '@solana/web3.js';
import { getSolanaConnection } from './solana';

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

export interface TransactionStatusCallbacks {
  onPending?: () => void;
  onConfirmed?: () => void;
  onFailed?: (error?: string) => void;
  onStatusChange?: (status: TransactionStatus) => void;
}

/**
 * Track a Solana transaction signature and call callbacks based on status changes.
 *
 * Uses Solana RPC to monitor transaction status in real-time:
 * 1. First tries WebSocket subscription (onSignature) for real-time updates
 * 2. Falls back to polling (getSignatureStatus) if WebSocket fails
 *
 * @param signature - The transaction signature to track
 * @param callbacks - Callbacks for status changes
 * @returns Cleanup function to unsubscribe/stop polling
 *
 * TODO: Consider using an indexer (Helius, QuickNode) instead of public RPC for:
 * - Better reliability and uptime
 * - Faster notifications
 * - Historical transaction data
 * - Webhook support for backend integration
 */
export function trackTransaction(
  signature: string,
  callbacks: TransactionStatusCallbacks = {}
): () => void {
  const connection = getSolanaConnection();
  let subscriptionId: number | null = null;
  let pollingInterval: NodeJS.Timeout | null = null;
  let isCleanedUp = false;
  let currentStatus: TransactionStatus = 'pending';

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    if (subscriptionId !== null) {
      try {
        connection.removeSignatureListener(subscriptionId);
      } catch (err) {
        console.error('Error removing signature listener:', err);
      }
    }

    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
  };

  const updateStatus = (newStatus: TransactionStatus, error?: string) => {
    if (isCleanedUp || currentStatus === newStatus) return;

    currentStatus = newStatus;
    console.log(`[tx-status] Transaction ${signature.slice(0, 8)}... status: ${newStatus}`);

    callbacks.onStatusChange?.(newStatus);

    if (newStatus === 'pending') {
      callbacks.onPending?.();
    } else if (newStatus === 'confirmed') {
      callbacks.onConfirmed?.();
      cleanup();
    } else if (newStatus === 'failed') {
      callbacks.onFailed?.(error);
      cleanup();
    }
  };

  // Try WebSocket subscription first
  try {
    console.log(`[tx-status] Subscribing to transaction: ${signature.slice(0, 8)}...`);

    subscriptionId = connection.onSignature(
      signature,
      (result, context) => {
        console.log('[tx-status] Signature notification received:', result);

        if (result.err) {
          updateStatus('failed', JSON.stringify(result.err));
        } else {
          updateStatus('confirmed');
        }
      },
      'confirmed'
    );

    callbacks.onPending?.();
    callbacks.onStatusChange?.('pending');
  } catch (err) {
    console.error('[tx-status] WebSocket subscription failed, falling back to polling:', err);

    // Fallback to polling
    pollingInterval = setInterval(async () => {
      if (isCleanedUp) return;

      try {
        const status = await connection.getSignatureStatus(signature);

        if (!status || !status.value) {
          // Transaction not found yet, still pending
          return;
        }

        const { confirmationStatus, err } = status.value;

        if (err) {
          updateStatus('failed', JSON.stringify(err));
        } else if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
          updateStatus('confirmed');
        }
      } catch (err) {
        // RPC error - log but don't fail
        // This allows the app to continue working even if RPC is temporarily unavailable
        console.error('[tx-status] Polling error:', err);

        // TODO: Implement exponential backoff for polling
        // TODO: Add circuit breaker pattern for repeated RPC failures
        // TODO: Consider webhook-based status updates via backend
      }
    }, 2000); // Poll every 2 seconds

    callbacks.onPending?.();
    callbacks.onStatusChange?.('pending');
  }

  return cleanup;
}

/**
 * Get the current status of a transaction signature.
 * This is a one-time check, not a subscription.
 *
 * @param signature - The transaction signature to check
 * @returns The current transaction status
 */
export async function getTransactionStatus(signature: string): Promise<TransactionStatus> {
  try {
    const connection = getSolanaConnection();
    const status = await connection.getSignatureStatus(signature);

    if (!status || !status.value) {
      return 'pending';
    }

    const { confirmationStatus, err } = status.value;

    if (err) {
      return 'failed';
    }

    if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
      return 'confirmed';
    }

    return 'pending';
  } catch (err) {
    console.error('[tx-status] Error checking transaction status:', err);
    // On error, assume pending to avoid showing incorrect status
    return 'pending';
  }
}
