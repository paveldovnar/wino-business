import { ReactNode } from 'react';
import { AppProviders } from '@/components/providers/AppProviders';
import '@/styles/globals.css';
import '@telegram-apps/telegram-ui/dist/styles.css';

export const metadata = {
  title: 'Wino Business',
  description: 'Telegram Mini App for business payments',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
