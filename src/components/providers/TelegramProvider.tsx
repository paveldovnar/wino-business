'use client';

import { ReactNode, useEffect, createContext, useContext } from 'react';
import WebApp from '@twa-dev/sdk';

interface TelegramContextValue {
  webApp: typeof WebApp | null;
  user: typeof WebApp.initDataUnsafe.user | null;
}

const TelegramContext = createContext<TelegramContextValue>({
  webApp: null,
  user: null,
});

export function TelegramProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      WebApp.ready();
      WebApp.expand();
      WebApp.enableClosingConfirmation();
    }
  }, []);

  const value: TelegramContextValue = {
    webApp: typeof window !== 'undefined' ? WebApp : null,
    user: typeof window !== 'undefined' ? WebApp.initDataUnsafe.user : null,
  };

  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}

export function useTelegram() {
  return useContext(TelegramContext);
}
