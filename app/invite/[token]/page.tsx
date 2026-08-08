'use client';

// Where an invited member chooses their first password. Deliberately outside
// the (app) group: there is no session yet, so there is no shell and no
// authorization gate — the token in the URL is the whole credential.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { Building2, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface InviteState {
  valid: boolean;
  name?: string;
  email?: string;
  message?: string;
}

export default function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  const router = useRouter();
  const [invite, setInvite] = useState<InviteState | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invite/${params.token}`)
      .then((r) => r.json())
      .then((d: InviteState) => {
        if (!cancelled) setInvite(d);
      })
      .catch(() => {
        if (!cancelled)
          setInvite({ valid: false, message: 'Could not check this link.' });
      });
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  const tooShort = password.length > 0 && password.length < 10;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('The two passwords do not match');
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/invite/${params.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      toast.error(data?.error ?? 'Could not set your password');
      return;
    }
    // Straight in — asking them to type the password they just chose into a
    // login form would be busywork.
    const signedIn = await signIn('credentials', {
      redirect: false,
      email: data.email,
      password,
    });
    setBusy(false);
    if (signedIn?.error) {
      toast.success('Password set — please sign in');
      router.replace('/login');
      return;
    }
    router.replace('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">SalesForce</h1>
            <p className="text-sm text-muted-foreground">
              Workforce CRM
            </p>
          </div>
        </div>

        {invite === null ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your invite…
          </p>
        ) : !invite.valid ? (
          <div className="space-y-3">
            <h2 className="font-semibold">This link no longer works</h2>
            <p className="text-sm text-muted-foreground">
              {invite.message ??
                'This invite link is invalid or has expired.'}{' '}
              Ask your manager to send a new one.
            </p>
            <Button variant="outline" asChild className="w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h2 className="font-semibold">Welcome, {invite.name}</h2>
              <p className="text-sm text-muted-foreground">
                Choose a password for {invite.email}.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">New password</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p
                className={
                  tooShort
                    ? 'text-xs text-destructive'
                    : 'text-xs text-muted-foreground'
                }
              >
                At least 10 characters, with a letter and a number.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input
                id="pw2"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {mismatch && (
                <p className="text-xs text-destructive">
                  These do not match.
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={busy || password.length < 10 || password !== confirm}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              {busy ? 'Setting up…' : 'Set password and sign in'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
