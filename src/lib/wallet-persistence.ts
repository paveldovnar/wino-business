/**
 * Wallet Persistence Helper
 * Stores minimal wallet state in localStorage as UI hints.
 * Real source of truth is always the WalletConnect session.
 */

const WALLET_STORAGE_KEY = 'wino_wallet_state';

export interface WalletState {
  wasConnected: boolean;
  lastAddress: string | null;
  lastConnectedAt: number;
}

export function saveWalletState(state: WalletState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(state));
}

export function getWalletState(): WalletState | null {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(WALLET_STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearWalletState(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(WALLET_STORAGE_KEY);
}

/**
 * Check if we should expect wallet to reconnect
 * Returns true if user was connected within the last 24 hours
 */
export function shouldExpectReconnect(): boolean {
  const state = getWalletState();
  if (!state || !state.wasConnected) return false;

  const dayInMs = 24 * 60 * 60 * 1000;
  const isRecent = Date.now() - state.lastConnectedAt < dayInMs;

  return isRecent;
}
