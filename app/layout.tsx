import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { PwaRegister } from '@/components/pwa-register';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SalesForce CRM',
  description:
    'Field-first CRM for Indian sales teams — leads to secured orders.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#2a78d6',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
