'use client';

// Sign-in: credential-shaped for realism (email matches a seeded member;
// password is accepted in demo mode), with a one-click persona grid below.
// Post-login route depends on role: reps land on My Day, managers on the
// dashboard. Production swaps the handler for NextAuth — the page shape
// stays.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Building2, ChevronRight, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/lib/store';
import { postLoginRoute } from '@/lib/policy';
import { ROLE_LABELS, ROLE_LEVEL, User } from '@/lib/types';
import { initials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export default function LoginPage() {
  const { state, login, hydrated } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const activeUsers = state.users.filter((u) => u.active !== false);

  /** Demo password shared by all seeded members (see prisma/seed.ts). */
  const DEMO_PASSWORD = 'demo123';

  // Creates the real NextAuth session AND sets the mock-store identity —
  // the bridge state while data still lives client-side (M3 removes the
  // store half).
  async function signInAs(user: User, password: string) {
    const result = await signIn('credentials', {
      redirect: false,
      email: user.email,
      password,
    });
    if (result?.error) {
      toast.error('Invalid email or password');
      return;
    }
    login(user.id);
    router.replace(postLoginRoute(user.role));
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    const user = activeUsers.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!user) {
      toast.error('No active member found with that email');
      return;
    }
    await signInAs(user, password || DEMO_PASSWORD);
  }

  const sorted = [...activeUsers].sort(
    (a, b) =>
      ROLE_LEVEL[a.role] - ROLE_LEVEL[b.role] || a.name.localeCompare(b.name),
  );

  return (
    <div className="min-h-screen bg-muted/40 lg:grid lg:grid-cols-[2fr,3fr]">
      {/* Brand panel */}
      <div className="flex flex-col justify-center gap-6 border-b bg-card p-6 sm:p-10 lg:border-b-0 lg:border-r">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              SalesForce
            </h1>
            <p className="text-sm text-muted-foreground">
              Workforce CRM — leads to secured orders
            </p>
          </div>
        </Link>
        <div className="hidden max-w-sm space-y-4 lg:block">
          <form onSubmit={handleCredentials} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Work email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Demo build — all seeded members use password{' '}
                <code className="rounded bg-muted px-1">demo123</code> (try
                sneha@salesforce.demo).
              </p>
            </div>
            <Button type="submit" className="w-full">
              <LogIn />
              Sign in
            </Button>
          </form>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Or pick a member on the right to explore that role instantly.
          </p>
        </div>
      </div>

      {/* Persona grid */}
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Demo personas</h2>
            <p className="text-sm text-muted-foreground">
              What you see is scoped to the member&apos;s level — reps land on
              My Day, managers on the team dashboard.
            </p>
          </div>
          {!hydrated ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {sorted.map((user) => (
                <li key={user.id}>
                  <button
                    onClick={() => signInAs(user, DEMO_PASSWORD)}
                    className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{initials(user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {user.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.title} · {user.region}
                      </p>
                      <Badge
                        variant="secondary"
                        className="mt-1 px-1.5 py-0 text-[10px]"
                      >
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
