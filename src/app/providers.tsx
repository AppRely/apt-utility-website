"use client";

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { QueryClient } from '@tanstack/react-query';

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
