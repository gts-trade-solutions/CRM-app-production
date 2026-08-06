'use client';

// Public landing page — the front door. Frames the product before login;
// signed-in users get a direct path back into the app.

import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  IndianRupee,
  Network,
  WifiOff,
  Workflow,
} from 'lucide-react';
import { useMe } from '@/lib/api/hooks';
import { postLoginRoute } from '@/lib/policy';
import { Button } from '@/components/ui/button';

const FEATURES = [
  {
    icon: WifiOff,
    title: 'Offline-first field capture',
    text: 'Leads captured at expos, walk-ins and site visits queue locally and sync the moment connectivity returns.',
  },
  {
    icon: Network,
    title: 'Hierarchy-native access',
    text: 'Sales Head → Regional Manager → Team Lead → Rep. Everyone sees exactly their slice — targets and reports roll up automatically.',
  },
  {
    icon: Workflow,
    title: 'Cold to Order Secured',
    text: 'One pipeline from enquiry to secured order: scoring, quotations, approvals and forecasting built in.',
  },
  {
    icon: IndianRupee,
    title: 'Built for India',
    text: 'GST-ready quotations, lakh/crore formatting, WhatsApp-first communication and campaign ROI in rupees.',
  },
];

export default function LandingPage() {
  const { data: currentUser } = useMe();

  const appHref = currentUser ? postLoginRoute(currentUser.role) : '/login';

  return (
    <div className="min-h-screen bg-background">
      <header className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">SalesForce</span>
        </div>
        <Button asChild>
          <Link href={appHref}>
            {currentUser ? 'Open app' : 'Sign in'}
            <ArrowRight />
          </Link>
        </Button>
      </header>

      <main className="container">
        <section className="mx-auto max-w-3xl py-20 text-center md:py-28">
          <p className="mb-4 inline-block rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            CRM for Indian sales teams
          </p>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Every lead, every visit,
            <br />
            every order — one system.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Capture leads online and offline, work them through a
            hierarchy-aware pipeline, and close with GST-ready quotations —
            from the field or the office.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link href={appHref}>
                {currentUser ? 'Open the app' : 'Sign in to demo'}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-4 pb-24 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        SalesForce MVP — demo build
      </footer>
    </div>
  );
}
