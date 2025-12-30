import { createContext, useContext } from 'react';
import { PublicKey, Keypair } from '@solana/web3.js';

export interface WalletContextState {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  select: (walletName: string) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction?: (transaction: any) => Promise<any>;
  signAllTransactions?: (transactions: any[]) => Promise<any[]>;
}

export const WalletContext = createContext<WalletContextState>({
  publicKey: null,
  connected: false,
  connecting: false,
  disconnecting: false,
  select: () => {},
  connect: async () => {},
  disconnect: async () => {},
});

export function useWallet(): WalletContextState {
  return useContext(WalletContext);
}

export interface ConnectionContextState {
  connection: any;
}

export const ConnectionContext = createContext<ConnectionContextState>({
  connection: null,
});

export function useConnection(): ConnectionContextState {
  return useContext(ConnectionContext);
}
