import '../styles/globals.css';
import { Inter } from 'next/font/google';
import Providers from './providers';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Navbar } from '@/components';
import { ReactNode } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { icons } from 'lucide-react';
const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  // title: 'Next.js 15 Hybrid Starter',
  title: 'APT Vision',
  description:
    'Example project with Tailwind v4, shadcn/ui, TanStack Query, Zustand, Zod, nuqs',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <NuqsAdapter>
          <Providers>
            {/* <Navbar /> */}
            <main>{children}</main>
            <div className="fixed top-5 right-5 z-[9999]">
              <Toaster />
            </div>
          </Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
