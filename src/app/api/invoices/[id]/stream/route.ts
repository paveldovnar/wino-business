import { NextRequest } from 'next/server';
import { getInvoice } from '@/server/storage/invoicesStore';
import Redis from 'ioredis';

/**
 * GET /api/invoices/[id]/stream - Server-Sent Events endpoint for real-time invoice status updates
 *
 * Streams invoice status changes using Redis pub/sub.
 * Client receives updates instantly when webhook marks invoice as paid.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const invoiceId = params.id;

  // Verify invoice exists
  const invoice = await getInvoice(invoiceId);
  if (!invoice) {
    return new Response('Invoice not found', { status: 404 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial invoice status
      const sendEvent = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send current status immediately
      sendEvent({
        invoiceId: invoice.id,
        status: invoice.status,
        paidTxSig: invoice.paidTxSig,
        payer: invoice.payer,
        paidAtSec: invoice.paidAtSec,
        amountUsd: invoice.amountUsd,
        needsReview: invoice.needsReview,
        matchedTxSig: invoice.matchedTxSig,
      });

      // If already paid/declined, close stream
      if (invoice.status !== 'pending') {
        controller.close();
        return;
      }

      // Subscribe to Redis pub/sub for invoice events
      const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
      if (!redisUrl) {
        console.error('[SSE] REDIS_URL not configured');
        controller.close();
        return;
      }

      const subscriber = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
      });

      await subscriber.subscribe('invoice-events', (err) => {
        if (err) {
          console.error('[SSE] Redis subscribe error:', err);
          controller.close();
        } else {
          console.log(`[SSE] Subscribed to invoice-events for invoice ${invoiceId}`);
        }
      });

      subscriber.on('message', async (channel, message) => {
        try {
          const event = JSON.parse(message);

          // Only process events for this invoice
          if (event.invoiceId !== invoiceId) {
            return;
          }

          console.log(`[SSE] Received event for invoice ${invoiceId}: ${event.event}`);

          // Fetch updated invoice data
          const updatedInvoice = await getInvoice(invoiceId);
          if (updatedInvoice) {
            sendEvent({
              invoiceId: updatedInvoice.id,
              status: updatedInvoice.status,
              paidTxSig: updatedInvoice.paidTxSig,
              payer: updatedInvoice.payer,
              paidAtSec: updatedInvoice.paidAtSec,
              amountUsd: updatedInvoice.amountUsd,
              needsReview: updatedInvoice.needsReview,
              matchedTxSig: updatedInvoice.matchedTxSig,
            });

            // Close stream if invoice is no longer pending
            if (updatedInvoice.status !== 'pending') {
              console.log(`[SSE] Invoice ${invoiceId} status changed to ${updatedInvoice.status}, closing stream`);
              await subscriber.quit();
              controller.close();
            }
          }
        } catch (err) {
          console.error('[SSE] Error processing message:', err);
        }
      });

      subscriber.on('error', (err) => {
        console.error('[SSE] Redis subscriber error:', err);
        controller.close();
      });

      // Cleanup on client disconnect
      req.signal.addEventListener('abort', async () => {
        console.log(`[SSE] Client disconnected for invoice ${invoiceId}`);
        await subscriber.quit();
        controller.close();
      });

      // Set timeout to close stream after 15 minutes (invoice expiry + buffer)
      setTimeout(async () => {
        console.log(`[SSE] Timeout reached for invoice ${invoiceId}, closing stream`);
        await subscriber.quit();
        controller.close();
      }, 15 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
