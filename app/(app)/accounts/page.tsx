'use client';

// Accounts list — API-backed; rollups (contacts, open/secured value) are
// computed in SQL on the server.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAccounts, useCreateAccount } from '@/lib/api/crm-hooks';
import { useApiUsers, useMe } from '@/lib/api/hooks';
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
  ownerId: z.string().optional(),
});

type AccountFormValues = z.infer<typeof accountSchema>;

export default function AccountsPage() {
  const { data: me } = useMe();
  const { data: users } = useApiUsers();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [open, setOpen] = useState(false);
  const createAccount = useCreateAccount();

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useAccounts({ page, q: debouncedQ });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: { name: '', industry: '', city: '', website: '', ownerId: '' },
  });

  if (!me) return null;
  const owners = (users ?? []).filter((u) => u.active);
  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  function onSubmit(values: AccountFormValues) {
    createAccount.mutate(
      { ...values, ownerId: values.ownerId || me!.id },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
      },
    );
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
                  <Label>Owner</Label>
                  <Select
                    value={watch('ownerId') || me.id}
                    onValueChange={(v) => setValue('ownerId', v)}
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
                <Button type="submit" disabled={createAccount.isPending}>
                  Create account
                </Button>
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
                <TableHead className="hidden sm:table-cell">Secured</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [0, 1, 2].map((i) => (
                  <TableRow key={`s-${i}`}>
                    <TableCell colSpan={6}>
                      <div className="h-9 animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && (data?.accounts ?? []).length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No accounts in your scope yet.
                  </TableCell>
                </TableRow>
              )}
              {(data?.accounts ?? []).map((account) => (
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
                    {account.owner?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {account.contactCount ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">
                    {account.openValue ? formatINR(account.openValue) : '—'}
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">
                    {account.securedValue
                      ? formatINR(account.securedValue)
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {data ? `${data.total} account${data.total === 1 ? '' : 's'}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft />
            Prev
          </Button>
          <span className="tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
