"use client";

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { createQueryClient } from '@/shared/query';
import { Toaster } from '@/components/ui/toaster';

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={client}>
      <main>{children}</main>
      <div className="fixed top-5 right-5 z-[9999]">
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
