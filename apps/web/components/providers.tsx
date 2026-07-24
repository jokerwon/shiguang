'use client';

import { type ReactNode } from 'react';
import { SWRProvider } from '@/lib/swr-config';
import { AuthProvider } from '@/lib/use-auth';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRProvider>
      <AuthProvider>{children}</AuthProvider>
    </SWRProvider>
  );
}
