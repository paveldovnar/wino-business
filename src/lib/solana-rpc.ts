/**
 * Client-side Solana RPC helper that routes through /api/solana/rpc proxy
 * This avoids 403 errors from Helius when called directly from browser
 */

let requestId = 1;

interface RpcResponse<T> {
  jsonrpc: string;
  result?: T;
  error?: {
    code: number;
    message: string;
  };
  id: number;
}

/**
 * Make a JSON-RPC call through the proxy
 */
async function rpcCall<T>(method: string, params: any[] = []): Promise<T> {
  const response = await fetch('/api/solana/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId++,
      method,
      params,
    }),
  });

  const data: RpcResponse<T> = await response.json();

  if (data.error) {
    const errorMessage = data.error.message || 'RPC error';
    if (response.status === 403 || data.error.code === 403) {
      throw new Error(
        'RPC forbidden. Check SOLANA_RPC_URL / Helius API key in Vercel env, then redeploy.'
      );
    }
    throw new Error(errorMessage);
  }

  if (data.result === undefined) {
    throw new Error('No result in RPC response');
  }

  return data.result;
}

/**
 * Get latest blockhash
 */
export async function getLatestBlockhash(): Promise<{
  blockhash: string;
  lastValidBlockHeight: number;
}> {
  const result = await rpcCall<{
    value: {
      blockhash: string;
      lastValidBlockHeight: number;
    };
  }>('getLatestBlockhash', [{ commitment: 'confirmed' }]);

  return {
    blockhash: result.value.blockhash,
    lastValidBlockHeight: result.value.lastValidBlockHeight,
  };
}

/**
 * Send raw transaction
 */
export async function sendRawTransaction(
  serializedTransaction: Buffer | Uint8Array,
  options?: {
    skipPreflight?: boolean;
    preflightCommitment?: string;
  }
): Promise<string> {
  const base64 = Buffer.from(serializedTransaction).toString('base64');

  return rpcCall<string>('sendRawTransaction', [
    base64,
    {
      encoding: 'base64',
      skipPreflight: options?.skipPreflight ?? false,
      preflightCommitment: options?.preflightCommitment ?? 'confirmed',
    },
  ]);
}

/**
 * Get signature statuses
 */
export async function getSignatureStatuses(
  signatures: string[]
): Promise<{
  value: Array<{
    slot: number;
    confirmations: number | null;
    err: any;
    confirmationStatus: string;
  } | null>;
}> {
  return rpcCall('getSignatureStatuses', [signatures, { searchTransactionHistory: true }]);
}

/**
 * Confirm transaction by polling signature status
 */
export async function confirmTransaction(
  signature: string,
  blockhash: string,
  lastValidBlockHeight: number,
  commitment: string = 'confirmed'
): Promise<{ value: { err: any } }> {
  const startTime = Date.now();
  const timeout = 60000; // 60 seconds

  while (Date.now() - startTime < timeout) {
    // Check if blockhash is still valid
    const blockHeight = await rpcCall<number>('getBlockHeight', [{ commitment }]);

    if (blockHeight > lastValidBlockHeight) {
      throw new Error('Transaction expired. Blockhash no longer valid.');
    }

    // Check signature status
    const statuses = await getSignatureStatuses([signature]);
    const status = statuses.value[0];

    if (status) {
      if (status.err) {
        return { value: { err: status.err } };
      }

      if (
        status.confirmationStatus === 'confirmed' ||
        status.confirmationStatus === 'finalized'
      ) {
        return { value: { err: null } };
      }
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('Transaction confirmation timeout');
}
