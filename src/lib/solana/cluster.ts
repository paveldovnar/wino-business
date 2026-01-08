/**
 * Solana Cluster Configuration
 *
 * Single source of truth for cluster configuration including:
 * - Cluster name ('mainnet-beta' | 'devnet')
 * - RPC URL
 * - CAIP-2 chain ID for WalletConnect
 *
 * CAIP-2 Chain IDs (Chain Agnostic Improvement Proposal):
 * @see https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-2.md
 * @see https://github.com/ChainAgnostic/namespaces/blob/main/solana/caip2.md
 *
 * Solana chain IDs use the first 32 bytes of the genesis hash:
 * - Mainnet-beta: 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp (genesis: 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpLYrnMbdU3sYL7MJSrpvP9Jdf2pspbWrR1Q)
 * - Devnet: EtWTRABZaYq6iMfeYKouRu166VU2xqa1 (genesis: EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG)
 */

export type SolanaCluster = 'mainnet-beta' | 'devnet';

// CAIP-2 chain IDs for Solana networks
// Format: solana:<first-32-bytes-of-genesis-hash>
export const SOLANA_CHAIN_IDS = {
  'mainnet-beta': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
} as const;

// Default RPC endpoints
export const DEFAULT_RPC_URLS = {
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  'devnet': 'https://api.devnet.solana.com',
} as const;

// USDC mint addresses per cluster
export const USDC_MINTS = {
  'mainnet-beta': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Devnet USDC
} as const;

export interface ClusterConfig {
  cluster: SolanaCluster;
  rpcUrl: string;
  chainId: string; // CAIP-2 format for WalletConnect
  usdcMint: string;
}

/**
 * Get cluster configuration from environment variables
 *
 * Environment variables:
 * - NEXT_PUBLIC_SOLANA_CLUSTER: 'mainnet-beta' | 'devnet' (default: 'mainnet-beta')
 * - NEXT_PUBLIC_SOLANA_RPC_URL: Custom RPC URL (optional)
 */
export function getClusterConfig(): ClusterConfig {
  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'mainnet-beta') as SolanaCluster;

  // Validate cluster
  if (cluster !== 'mainnet-beta' && cluster !== 'devnet') {
    console.warn(`[cluster] Invalid cluster "${cluster}", defaulting to mainnet-beta`);
    return getClusterConfig(); // Recursive with default
  }

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC_URLS[cluster];
  const chainId = SOLANA_CHAIN_IDS[cluster];
  const usdcMint = USDC_MINTS[cluster];

  return {
    cluster,
    rpcUrl,
    chainId,
    usdcMint,
  };
}

/**
 * Get the CAIP-2 chain ID for a given cluster
 */
export function getWalletConnectChainId(cluster: SolanaCluster): string {
  return SOLANA_CHAIN_IDS[cluster];
}

/**
 * Parse a CAIP-2 chain ID to get the cluster name
 */
export function clusterFromChainId(chainId: string): SolanaCluster | null {
  if (chainId === SOLANA_CHAIN_IDS['mainnet-beta']) return 'mainnet-beta';
  if (chainId === SOLANA_CHAIN_IDS['devnet']) return 'devnet';
  return null;
}
