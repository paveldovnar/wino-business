'use client';

import { ReactNode, useState, useMemo } from 'react';
import { Connection, clusterApiUrl, Keypair, PublicKey } from '@solana/web3.js';
import { WalletContext, ConnectionContext, WalletContextState } from '@/lib/wallet-mock';
import { getSolanaConnection } from '@/lib/solana';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const connection = useMemo(() => getSolanaConnection(), []);

  const select = (walletName: string) => {
    console.log('Selected wallet:', walletName);
  };

  const connect = async () => {
    setConnecting(true);
    await new Promise(resolve => setTimeout(resolve, 500));

    const mockKeyPair = Keypair.generate();
    setPublicKey(mockKeyPair.publicKey);
    setConnected(true);
    setConnecting(false);
  };

  const disconnect = async () => {
    setDisconnecting(true);
    await new Promise(resolve => setTimeout(resolve, 300));

    setPublicKey(null);
    setConnected(false);
    setDisconnecting(false);
  };

  const walletValue: WalletContextState = {
    publicKey,
    connected,
    connecting,
    disconnecting,
    select,
    connect,
    disconnect,
  };

  return (
    <ConnectionContext.Provider value={{ connection }}>
      <WalletContext.Provider value={walletValue}>
        {children}
      </WalletContext.Provider>
    </ConnectionContext.Provider>
  );
}
