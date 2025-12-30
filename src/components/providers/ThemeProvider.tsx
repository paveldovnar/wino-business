'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useTelegram } from './TelegramProvider';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { webApp } = useTelegram();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Try to get theme from Telegram
    const tgTheme = webApp?.colorScheme || 'light';
    const initialTheme = tgTheme === 'dark' ? 'dark' : 'light';

    // Set theme
    document.documentElement.setAttribute('data-theme', initialTheme);
    setTheme(initialTheme);

    // Dev toggle for theme (only in development)
    if (process.env.NODE_ENV === 'development') {
      const handleKeyPress = (e: KeyboardEvent) => {
        if (e.key === 't' && e.ctrlKey) {
          const newTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', newTheme);
          setTheme(newTheme);
        }
      };
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }
  }, [webApp]);

  return <>{children}</>;
}
