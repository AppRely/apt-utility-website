import '../styles/globals.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import Providers from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'APT Vision',
  description:
    'Example project with Tailwind v4, shadcn/ui, TanStack Query, Zustand, Zod, nuqs',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <NuqsAdapter>
          <Providers>{children}</Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
