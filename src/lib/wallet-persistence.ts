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

/**
 * Full logout - clears ALL wallet-related state from localStorage
 * This is the nuclear option for a complete reset
 */
export function fullWalletLogout(): void {
  if (typeof window === 'undefined') return;

  console.log('[wallet-logout] Starting full logout...');

  // Clear our app state
  clearWalletState();

  // Clear all WalletConnect v2 keys
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      // WalletConnect v2 keys
      if (key.startsWith('wc@2:')) keysToRemove.push(key);
      if (key.startsWith('walletconnect')) keysToRemove.push(key);
      if (key.startsWith('WC_')) keysToRemove.push(key);
      // Wagmi keys
      if (key.startsWith('wagmi')) keysToRemove.push(key);
      // Web3Modal keys
      if (key.startsWith('w3m')) keysToRemove.push(key);
      if (key.startsWith('web3modal')) keysToRemove.push(key);
      // Reown keys (new WalletConnect rebrand)
      if (key.startsWith('@reown')) keysToRemove.push(key);
      if (key.startsWith('reown')) keysToRemove.push(key);
    }
  }

  // Remove all found keys
  keysToRemove.forEach(key => {
    console.log('[wallet-logout] Removing:', key);
    localStorage.removeItem(key);
  });

  console.log('[wallet-logout] Cleared', keysToRemove.length, 'storage keys');

  // Also try to clear sessionStorage for good measure
  try {
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (
        key.startsWith('wc') ||
        key.startsWith('wallet') ||
        key.startsWith('wagmi') ||
        key.startsWith('w3m')
      )) {
        sessionKeysToRemove.push(key);
      }
    }
    sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
    console.log('[wallet-logout] Cleared', sessionKeysToRemove.length, 'session keys');
  } catch (e) {
    console.warn('[wallet-logout] Could not clear sessionStorage:', e);
  }
}
