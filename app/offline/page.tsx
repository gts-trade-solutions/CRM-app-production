import Link from 'next/link';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <WifiOff className="h-7 w-7" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Pages you&apos;ve already visited still work, and any leads you
          capture are queued locally — everything syncs the moment you&apos;re
          back online.
        </p>
      </div>
      <Button asChild>
        <Link href="/leads">Capture a lead</Link>
      </Button>
    </div>
  );
}
