'use client';

// Account workspace — API-backed: company info, its people, and every deal
// made through them, with edit/archive.

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Archive,
  ArrowLeft,
  Building2,
  Globe,
  MapPin,
  Pencil,
} from 'lucide-react';
import {
  useAccount,
  useStageConfig,
  useUpdateAccount,
} from '@/lib/api/crm-hooks';
import { useMe } from '@/lib/api/hooks';
import { hasCapability } from '@/lib/policy';
import { cn, formatINR, initials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: me } = useMe();
  const { data, isLoading, error } = useAccount(params.id);
  const updateAccount = useUpdateAccount(params.id);
  const stages = useStageConfig();

  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [edit, setEdit] = useState({
    name: '',
    industry: '',
    city: '',
    website: '',
  });

  if (!me) return null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-12 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 lg:grid-cols-[1fr,1.6fr]">
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">
          This account does not exist or is outside your visibility scope.
        </p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/accounts">Back to accounts</Link>
        </Button>
      </div>
    );
  }

  const { account, contacts, deals } = data;
  const openValue = deals
    .filter((d) => d.stage !== 'won' && d.stage !== 'lost')
    .reduce((s, d) => s + d.value, 0);
  const wonValue = deals
    .filter((d) => d.stage === 'won')
    .reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/accounts" aria-label="Back to accounts">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {account.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[account.industry, account.city].filter(Boolean).join(' · ') ||
              'No details yet'}{' '}
            · owned by {account.owner?.name ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Edit account"
            onClick={() => {
              setEdit({
                name: account.name,
                industry: account.industry,
                city: account.city,
                website: account.website,
              });
              setEditOpen(true);
            }}
          >
            <Pencil />
          </Button>
          {hasCapability(me.role, 'archive_records') && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Archive account"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setArchiveOpen(true)}
            >
              <Archive />
            </Button>
          )}
          <div className="flex gap-5 text-right text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Open pipeline</p>
              <p className="font-semibold">{formatINR(openValue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Secured</p>
              <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatINR(wonValue)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr,1.6fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Company</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {account.city || '—'}
              </div>
              <div className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-muted-foreground" />
                {account.website || '—'}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Added</p>
                <p className="font-medium">
                  {format(new Date(account.createdAt), 'd MMM yyyy')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Contacts</CardTitle>
              <CardDescription>
                People at {account.name} ({contacts.length})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No contacts linked yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{initials(c.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <Link
                          href={`/contacts/${c.id}`}
                          className="text-sm font-medium underline-offset-4 hover:text-primary hover:underline"
                        >
                          {c.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {[c.title, c.phone].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Deals</CardTitle>
            <CardDescription>
              Every deal made through this account&apos;s contacts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deals.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No deals yet — create one from a contact.
              </p>
            ) : (
              <ul className="space-y-2">
                {deals.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/pipeline/${d.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {d.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(d.createdAt), 'd MMM yyyy')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge
                          variant="secondary"
                          className={cn(
                            d.stage === 'won' &&
                              'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                          )}
                        >
                          {stages[d.stage].label}
                        </Badge>
                        <span className="text-sm font-semibold tabular-nums">
                          {formatINR(d.value)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit account */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Company name</Label>
              <Input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Industry</Label>
                <Input
                  value={edit.industry}
                  onChange={(e) =>
                    setEdit({ ...edit, industry: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input
                  value={edit.city}
                  onChange={(e) => setEdit({ ...edit, city: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input
                value={edit.website}
                onChange={(e) => setEdit({ ...edit, website: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!edit.name.trim() || updateAccount.isPending}
              onClick={() =>
                updateAccount.mutate(
                  {
                    name: edit.name.trim(),
                    industry: edit.industry.trim(),
                    city: edit.city.trim(),
                    website: edit.website.trim(),
                  },
                  { onSuccess: () => setEditOpen(false) },
                )
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive {account.name}?</DialogTitle>
            <DialogDescription>
              The account is hidden from lists; its contacts and deals keep
              their history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={updateAccount.isPending}
              onClick={() =>
                updateAccount.mutate(
                  { archived: true },
                  { onSuccess: () => router.push('/accounts') },
                )
              }
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
