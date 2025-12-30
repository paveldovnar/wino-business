import { Connection, PublicKey, TransactionSignature, clusterApiUrl } from '@solana/web3.js';

export function getSolanaConnection(): Connection {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'devnet';
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(cluster as any);
  return new Connection(endpoint, 'confirmed');
}

export async function waitForSignature(
  connection: Connection,
  signature: TransactionSignature,
  timeout: number = 60000
): Promise<'confirmed' | 'failed'> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let subscriptionId: number | null = null;

    const checkTimeout = setInterval(() => {
      if (Date.now() - startTime > timeout) {
        if (subscriptionId !== null) {
          connection.removeSignatureListener(subscriptionId);
        }
        clearInterval(checkTimeout);
        resolve('failed');
      }
    }, 1000);

    subscriptionId = connection.onSignature(
      signature,
      (result) => {
        clearInterval(checkTimeout);
        if (subscriptionId !== null) {
          connection.removeSignatureListener(subscriptionId);
        }

        if (result.err) {
          resolve('failed');
        } else {
          resolve('confirmed');
        }
      },
      'confirmed'
    );
  });
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
