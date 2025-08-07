import '../styles/globals.css';
import { Inter } from 'next/font/google';
import Providers from './providers';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Navbar } from '@/components';
import { ReactNode } from 'react';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Next.js 15 Hybrid Starter',
  description:
    'Example project with Tailwind v4, shadcn/ui, TanStack Query, Zustand, Zod, nuqs',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <NuqsAdapter>
          <Providers>
            <Navbar />
            <main>{children}</main>
          </Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
