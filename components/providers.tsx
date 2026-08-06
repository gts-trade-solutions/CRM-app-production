'use client';

import { ThemeProvider } from 'next-themes';
import { StoreProvider } from '@/lib/store';
import { Toaster } from '@/components/ui/sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <StoreProvider>
        {children}
        <Toaster richColors position="top-right" />
      </StoreProvider>
    </ThemeProvider>
  );
}
