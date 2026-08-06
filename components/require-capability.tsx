'use client';

// Route/section guard driven by the policy matrix. Renders a 403 panel in
// place when the signed-in role lacks the capability — the UX layer of
// authorization (production adds the same check server-side).

import Link from 'next/link';
import { ShieldX } from 'lucide-react';
import { useStore } from '@/lib/store';
import { Capability, hasCapability } from '@/lib/policy';
import { Button } from '@/components/ui/button';

export function Forbidden() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldX className="h-7 w-7" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">No access</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Your role doesn&apos;t include this area. If you think it should,
          ask your administrator.
        </p>
      </div>
      <Button variant="outline" asChild>
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}

export function RequireCapability({
  capability,
  children,
}: {
  capability: Capability;
  children: React.ReactNode;
}) {
  const { currentUser, hydrated } = useStore();
  if (!hydrated) return null;
  if (!hasCapability(currentUser?.role, capability)) return <Forbidden />;
  return <>{children}</>;
}
