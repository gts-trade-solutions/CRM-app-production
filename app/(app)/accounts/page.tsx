'use client';

// Accounts: companies as first-class records. Contacts link to accounts,
// and deals roll up through their contact's account.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Plus, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useStore } from '@/lib/store';
import { assignableUsers, visibleUserIds } from '@/lib/rbac';
import { formatINR } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const accountSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  industry: z.string().default(''),
  city: z.string().default(''),
  website: z.string().default(''),
  ownerId: z.string().min(1, 'Pick an owner'),
});

type AccountFormValues = z.infer<typeof accountSchema>;

export default function AccountsPage() {
  const { state, currentUser, addAccount } = useStore();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      industry: '',
      city: '',
      website: '',
      ownerId: currentUser?.id ?? '',
    },
  });

  const visible = useMemo(
    () =>
      currentUser
        ? visibleUserIds(state.users, currentUser)
        : new Set<string>(),
    [state.users, currentUser],
  );

  const rollups = useMemo(() => {
    const contactsByAccount = new Map<string, number>();
    const accountByContact = new Map<string, string>();
    for (const c of state.contacts) {
      if (!c.accountId) continue;
      contactsByAccount.set(
        c.accountId,
        (contactsByAccount.get(c.accountId) ?? 0) + 1,
      );
      accountByContact.set(c.id, c.accountId);
    }
    const dealStats = new Map<string, { open: number; won: number }>();
    for (const d of state.deals) {
      const accountId = accountByContact.get(d.contactId);
      if (!accountId) continue;
      const entry = dealStats.get(accountId) ?? { open: 0, won: 0 };
      if (d.stage === 'won') entry.won += d.value;
      else if (d.stage !== 'lost') entry.open += d.value;
      dealStats.set(accountId, entry);
    }
    return { contactsByAccount, dealStats };
  }, [state.contacts, state.deals]);

  const accounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.accounts
      .filter((a) => visible.has(a.ownerId) && !a.archived)
      .filter(
        (a) =>
          !q ||
          a.name.toLowerCase().includes(q) ||
          a.industry.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state.accounts, visible, search]);

  const userById = useMemo(
    () => new Map(state.users.map((u) => [u.id, u])),
    [state.users],
  );

  if (!currentUser) return null;
  const owners = assignableUsers(state.users, currentUser);

  function onSubmit(values: AccountFormValues) {
    addAccount(values);
    reset();
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            The companies you sell to — contacts and deals roll up here.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              New account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New account</DialogTitle>
              <DialogDescription>
                Accounts are also created automatically when a lead with a
                company is converted.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ac-name">Company name *</Label>
                <Input id="ac-name" {...register('name')} />
                {errors.name && (
                  <p className="text-xs text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ac-industry">Industry</Label>
                  <Input id="ac-industry" {...register('industry')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ac-city">City</Label>
                  <Input id="ac-city" {...register('city')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ac-website">Website</Label>
                  <Input id="ac-website" {...register('website')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Owner *</Label>
                  <Select
                    value={watch('ownerId')}
                    onValueChange={(v) =>
                      setValue('ownerId', v, { shouldValidate: true })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Assign to" />
                    </SelectTrigger>
                    <SelectContent>
                      {owners.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Create account</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search accounts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="hidden md:table-cell">City</TableHead>
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Open pipeline
                </TableHead>
                <TableHead className="hidden sm:table-cell">Won</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No accounts in your scope yet.
                  </TableCell>
                </TableRow>
              )}
              {accounts.map((account) => {
                const stats = rollups.dealStats.get(account.id);
                return (
                  <TableRow key={account.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div>
                          <Link
                            href={`/accounts/${account.id}`}
                            className="font-medium underline-offset-4 hover:text-primary hover:underline"
                          >
                            {account.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {account.industry || '—'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {account.city || '—'}
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {userById.get(account.ownerId)?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {rollups.contactsByAccount.get(account.id) ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {stats?.open ? formatINR(stats.open) : '—'}
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {stats?.won ? formatINR(stats.won) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
