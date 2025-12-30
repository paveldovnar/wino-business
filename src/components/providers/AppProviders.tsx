'use client';

import { ReactNode, useEffect, useState } from 'react';
import { AppRoot } from '@telegram-apps/telegram-ui';
import { WalletProvider } from './WalletProvider';
import { TelegramProvider } from './TelegramProvider';
import { ThemeProvider } from './ThemeProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <TelegramProvider>
      <ThemeProvider>
        <AppRoot>
          <WalletProvider>{children}</WalletProvider>
        </AppRoot>
      </ThemeProvider>
    </TelegramProvider>
  );
}
