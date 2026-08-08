'use client';

// Sign-in. The credentials form is the only way in on a real deployment;
// the one-click persona grid appears solely when NEXT_PUBLIC_DEMO_MODE is on.
// Post-login route depends on role: reps land on My Day, managers on the
// dashboard.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { DEMO_MODE } from '@/lib/config';
import { seedUsers } from '@/lib/mock-data';
import { postLoginRoute } from '@/lib/policy';
import { ROLE_LABELS, ROLE_LEVEL, User } from '@/lib/types';
import { initials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

/** Only ever used to fill the demo persona buttons. */
const DEMO_PASSWORD = 'demo123';

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function doSignIn(userEmail: string, pass: string, role?: User['role']) {
    setBusy(true);
    const result = await signIn('credentials', {
      redirect: false,
      email: userEmail,
      password: pass,
    });
    setBusy(false);
    if (result?.error) {
      toast.error('Invalid email or password');
      return;
    }
    // A fresh session means every cached query belongs to someone else.
    qc.clear();
    router.replace(role ? postLoginRoute(role) : '/dashboard');
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    // No fallback password: an empty box must fail, not sign someone in.
    if (!email.trim() || !password) {
      toast.error('Enter your email and password');
      return;
    }
    await doSignIn(email.trim(), password);
  }

  const signInForm = (
    <form onSubmit={handleCredentials} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="login-email">Work email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
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
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        <LogIn />
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-xs text-muted-foreground">
        New here? Use the invite link emailed to you to set a password. Lost
        it — ask your manager to send it again.
      </p>
    </form>
  );

  const brandPanel = (
    <Link href="/" className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Building2 className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SalesForce</h1>
        <p className="text-sm text-muted-foreground">
          Workforce CRM — leads to secured orders
        </p>
      </div>
    </Link>
  );

  if (!DEMO_MODE) {
    // Production: one centred card, and the form is reachable at every width.
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          {brandPanel}
          {signInForm}
        </div>
      </div>
    );
  }

  const sorted = [...seedUsers].sort(
    (a, b) =>
      ROLE_LEVEL[a.role] - ROLE_LEVEL[b.role] || a.name.localeCompare(b.name),
  );

  return (
    <div className="min-h-screen bg-muted/40 lg:grid lg:grid-cols-[2fr,3fr]">
      <div className="flex flex-col justify-center gap-6 border-b bg-card p-6 sm:p-10 lg:border-b-0 lg:border-r">
        {brandPanel}
        {/* Visible at every width — hiding it below lg left phones with no
            way to sign in except a demo persona. */}
        <div className="max-w-sm space-y-4">
          {signInForm}
          <Separator />
          <p className="text-xs text-muted-foreground">
            Demo instance — seeded members use{' '}
            <code className="rounded bg-muted px-1">demo123</code>, or pick one
            below to jump straight in.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Demo personas</h2>
            <p className="text-sm text-muted-foreground">
              What you see is scoped to the member&apos;s level — reps land on
              My Day, managers on the team dashboard.
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {sorted.map((user) => (
              <li key={user.id}>
                <button
                  disabled={busy}
                  onClick={() => doSignIn(user.email, DEMO_PASSWORD, user.role)}
                  className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.name}</p>
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
        </div>
      </div>
    </div>
  );
}
