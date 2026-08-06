'use client';

// Admin console — fully API-backed: user lifecycle (edit + deactivation
// with handover), targets, product catalogue, organisation identity and
// pipeline vocabulary. Every mutation is capability-checked server-side.

import { useMemo, useState } from 'react';
import { Pencil, Plus, UserX } from 'lucide-react';
import {
  DupeRecord,
  TeamMember,
  useDeactivateMember,
  useDupes,
  useMergeDupes,
  useProducts,
  useSetTarget,
  useSettings,
  useTeam,
  useUpdateMember,
  useUpdateSettings,
  useUpsertProduct,
  WireProduct,
} from '@/lib/api/crm-hooks';
import { useMe } from '@/lib/api/hooks';
import {
  PIPELINE_STAGES,
  ROLE_LABELS,
  ROLE_LEVEL,
  Role,
} from '@/lib/types';
import { cn, formatINR, initials } from '@/lib/utils';
import { RequireCapability } from '@/components/require-capability';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

export default function AdminPage() {
  return (
    <RequireCapability capability="view_admin">
      <AdminContent />
    </RequireCapability>
  );
}

function AdminContent() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Administration
        </h1>
        <p className="text-sm text-muted-foreground">
          Workforce, targets, catalogue and organisation configuration.
        </p>
      </div>
      <Tabs defaultValue="users">
        <TabsList className="flex-wrap">
          <TabsTrigger value="users">Users & roles</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="org">Organisation</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="quality">Data quality</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="targets">
          <TargetsTab />
        </TabsContent>
        <TabsContent value="products">
          <ProductsTab />
        </TabsContent>
        <TabsContent value="org">
          <OrgTab />
        </TabsContent>
        <TabsContent value="pipeline">
          <PipelineTab />
        </TabsContent>
        <TabsContent value="quality">
          <DataQualityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------ Data quality */

function DataQualityTab() {
  const { data: groups, isLoading } = useDupes();
  const merge = useMergeDupes();

  function mergeable(records: DupeRecord[]) {
    // Same-kind pairs only in v1; converted leads are protected.
    const leads = records.filter(
      (r) => r.kind === 'lead' && r.status !== 'converted',
    );
    const contacts = records.filter((r) => r.kind === 'contact');
    if (leads.length >= 2) return { kind: 'lead' as const, records: leads };
    if (contacts.length >= 2)
      return { kind: 'contact' as const, records: contacts };
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>
          Records sharing a phone number or email. Merging keeps the
          survivor, re-points activities/attachments/deals, backfills empty
          fields, and deletes the duplicate — audit-logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : (groups ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            No duplicates detected — the data is clean.
          </p>
        ) : (
          (groups ?? []).map((group) => {
            const m = mergeable(group.records);
            return (
              <div key={group.key} className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Shared {group.key.startsWith('p:') ? 'phone' : 'email'}:{' '}
                  {group.key.slice(2)}
                </p>
                <div className="space-y-1.5">
                  {group.records.map((r) => (
                    <div
                      key={`${r.kind}-${r.id}`}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <Badge variant="secondary" className="text-[10px]">
                        {r.kind}
                      </Badge>
                      <span className="font-medium">{r.name}</span>
                      <span className="text-muted-foreground">
                        {[r.company, r.ownerName, r.status]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  ))}
                </div>
                {m ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      Keep “{m.records[0].name}”, merge in “{m.records[1].name}
                      ”:
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={merge.isPending}
                      onClick={() =>
                        merge.mutate({
                          kind: m.kind,
                          survivorId: m.records[0].id,
                          duplicateId: m.records[1].id,
                        })
                      }
                    >
                      Merge
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={merge.isPending}
                      onClick={() =>
                        merge.mutate({
                          kind: m.kind,
                          survivorId: m.records[1].id,
                          duplicateId: m.records[0].id,
                        })
                      }
                    >
                      Keep the other instead
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Cross-type or converted-lead pair — resolve manually (a
                    converted lead and its contact sharing details is
                    expected).
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ Users */

function UsersTab() {
  const { data: team } = useTeam();
  const updateMember = useUpdateMember();
  const deactivate = useDeactivateMember();

  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [edit, setEdit] = useState({
    name: '',
    email: '',
    role: 'sales_rep' as Role,
    managerId: '' as string,
    region: '',
    title: '',
  });
  const [deactivating, setDeactivating] = useState<TeamMember | null>(null);
  const [successorId, setSuccessorId] = useState('');

  const users = team?.users ?? [];
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const sorted = [...users].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      ROLE_LEVEL[a.role as Role] - ROLE_LEVEL[b.role as Role] ||
      a.name.localeCompare(b.name),
  );

  const possibleManagers = users.filter(
    (u) =>
      u.active &&
      u.id !== editing?.id &&
      ROLE_LEVEL[u.role as Role] < ROLE_LEVEL[edit.role],
  );
  const possibleSuccessors = users.filter(
    (u) => u.active && u.id !== deactivating?.id,
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>
          Add members from the Team page. Deactivation hands all open records
          and direct reports to a successor and disables login.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead className="hidden md:table-cell">Role</TableHead>
              <TableHead className="hidden lg:table-cell">Reports to</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((user) => (
              <TableRow
                key={user.id}
                className={cn(!user.active && 'opacity-60')}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{initials(user.name)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="secondary">
                    {ROLE_LABELS[user.role as Role]}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-sm lg:table-cell">
                  {user.managerId
                    ? byId.get(user.managerId)?.name ?? '—'
                    : '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={!user.active ? 'secondary' : 'outline'}
                    className={cn(
                      user.active &&
                        'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                    )}
                  >
                    {user.active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.active && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditing(user);
                          setEdit({
                            name: user.name,
                            email: user.email,
                            role: user.role as Role,
                            managerId: user.managerId ?? '',
                            region: user.region,
                            title: user.title,
                          });
                        }}
                        aria-label={`Edit ${user.name}`}
                      >
                        <Pencil />
                      </Button>
                      {user.role !== 'admin' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setDeactivating(user);
                            setSuccessorId('');
                          }}
                          aria-label={`Deactivate ${user.name}`}
                        >
                          <UserX />
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Edit member */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={edit.role}
                  onValueChange={(v) =>
                    setEdit({ ...edit, role: v as Role, managerId: '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Reports to</Label>
                <Select
                  value={edit.managerId || 'none'}
                  onValueChange={(v) =>
                    setEdit({ ...edit, managerId: v === 'none' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No manager</SelectItem>
                    {possibleManagers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Region</Label>
                <Input
                  value={edit.region}
                  onChange={(e) => setEdit({ ...edit, region: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Job title</Label>
                <Input
                  value={edit.title}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={
                !edit.name.trim() ||
                !edit.email.trim() ||
                updateMember.isPending
              }
              onClick={() => {
                if (!editing) return;
                updateMember.mutate(
                  {
                    id: editing.id,
                    name: edit.name.trim(),
                    email: edit.email.trim(),
                    role: edit.role,
                    managerId: edit.managerId || null,
                    region: edit.region,
                    title: edit.title,
                  },
                  { onSuccess: () => setEditing(null) },
                );
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate + handover */}
      <Dialog
        open={!!deactivating}
        onOpenChange={(o) => !o && setDeactivating(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate {deactivating?.name}</DialogTitle>
            <DialogDescription>
              Their open leads, deals, pending activities, contacts, accounts
              and direct reports move to the successor; login is disabled.
              Secured/lost history stays with them for reporting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Successor *</Label>
            <Select value={successorId} onValueChange={setSuccessorId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose who takes over" />
              </SelectTrigger>
              <SelectContent>
                {possibleSuccessors.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({ROLE_LABELS[u.role as Role]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivating(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!successorId || deactivate.isPending}
              onClick={() => {
                if (deactivating) {
                  deactivate.mutate(
                    { id: deactivating.id, successorId },
                    { onSuccess: () => setDeactivating(null) },
                  );
                }
              }}
            >
              Deactivate & hand over
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------------------------------------------------------- Targets */

function TargetsTab() {
  const { data: team } = useTeam();
  const setTarget = useSetTarget();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const active = (team?.users ?? []).filter((u) => u.active);
  const sorted = [...active].sort(
    (a, b) =>
      ROLE_LEVEL[a.role as Role] - ROLE_LEVEL[b.role as Role] ||
      a.name.localeCompare(b.name),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>
          Monthly revenue quota per member. Manager quotas represent their
          whole subtree.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead className="hidden md:table-cell">Role</TableHead>
              <TableHead>Monthly target (₹)</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((user) => {
              const current = team?.targets[user.id] ?? 0;
              const draft = drafts[user.id] ?? String(current || '');
              const dirty = Number(draft) !== current;
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="secondary">
                      {ROLE_LABELS[user.role as Role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      className="h-9 max-w-[180px] tabular-nums"
                      value={draft}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [user.id]: e.target.value }))
                      }
                    />
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatINR(Number(draft) || 0)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      disabled={!dirty || setTarget.isPending}
                      onClick={() =>
                        setTarget.mutate({
                          userId: user.id,
                          amount: Number(draft) || 0,
                        })
                      }
                    >
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------- Products */

function ProductsTab() {
  const { data: products } = useProducts();
  const upsert = useUpsertProduct();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: '',
    price: '',
  });

  function openNew() {
    setEditingId(null);
    setForm({ name: '', sku: '', category: '', price: '' });
    setDialogOpen(true);
  }

  function openEdit(p: WireProduct) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: String(p.price),
    });
    setDialogOpen(true);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>
            The catalogue behind deal line items and quotations. Retired
            products stay on old quotes but can&apos;t be added to new ones.
          </CardDescription>
          <Button size="sm" onClick={openNew}>
            <Plus />
            Add product
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(products ?? []).map((p) => (
              <TableRow key={p.id} className={cn(!p.active && 'opacity-60')}>
                <TableCell>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.sku}</p>
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {p.category}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatINR(p.price)}
                </TableCell>
                <TableCell>
                  <Badge variant={!p.active ? 'secondary' : 'outline'}>
                    {p.active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(p)}
                      aria-label={`Edit ${p.name}`}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      disabled={upsert.isPending}
                      onClick={() =>
                        upsert.mutate({
                          id: p.id,
                          name: p.name,
                          sku: p.sku,
                          category: p.category,
                          price: p.price,
                          active: !p.active,
                        })
                      }
                    >
                      {p.active ? 'Retire' : 'Activate'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit product' : 'New product'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SKU</Label>
                <Input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Unit price (₹) *</Label>
              <Input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={
                !form.name.trim() ||
                !(Number(form.price) > 0) ||
                upsert.isPending
              }
              onClick={() =>
                upsert.mutate(
                  {
                    ...(editingId ? { id: editingId } : {}),
                    name: form.name.trim(),
                    sku: form.sku.trim(),
                    category: form.category.trim(),
                    price: Number(form.price) || 0,
                  },
                  { onSuccess: () => setDialogOpen(false) },
                )
              }
            >
              {editingId ? 'Save' : 'Add product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------ Organisation */

function OrgTab() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const org = settings?.org;
  const [form, setForm] = useState<{
    companyName: string;
    addressLine: string;
    gstin: string;
    quoteValidityDays: string;
    gstRate: string;
    quoteTerms: string;
    discountThreshold: string;
  } | null>(null);

  const current = form ?? {
    companyName: org?.companyName ?? '',
    addressLine: org?.addressLine ?? '',
    gstin: org?.gstin ?? '',
    quoteValidityDays: String(org?.quoteValidityDays ?? 15),
    gstRate: String(Math.round((org?.gstRate ?? 0.18) * 100)),
    quoteTerms: (org?.quoteTerms ?? []).join('\n'),
    discountThreshold: String(org?.discountThresholdPercent ?? 10),
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>
          Company identity — printed on every quotation.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-w-2xl space-y-4">
        <div className="space-y-1.5">
          <Label>Company name</Label>
          <Input
            value={current.companyName}
            onChange={(e) =>
              setForm({ ...current, companyName: e.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Address line</Label>
          <Input
            value={current.addressLine}
            onChange={(e) =>
              setForm({ ...current, addressLine: e.target.value })
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>GSTIN</Label>
            <Input
              value={current.gstin}
              onChange={(e) => setForm({ ...current, gstin: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Quote validity (days)</Label>
            <Input
              type="number"
              min={1}
              value={current.quoteValidityDays}
              onChange={(e) =>
                setForm({ ...current, quoteValidityDays: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>GST rate (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={current.gstRate}
              onChange={(e) => setForm({ ...current, gstRate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Discount approval above (%)</Label>
            <Input
              type="number"
              min={0}
              max={50}
              value={current.discountThreshold}
              onChange={(e) =>
                setForm({ ...current, discountThreshold: e.target.value })
              }
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Quotation terms (one per line)</Label>
          <Textarea
            rows={4}
            value={current.quoteTerms}
            onChange={(e) =>
              setForm({ ...current, quoteTerms: e.target.value })
            }
          />
        </div>
        <Button
          disabled={update.isPending || !current.companyName.trim()}
          onClick={() =>
            update.mutate({
              org: {
                companyName: current.companyName.trim(),
                addressLine: current.addressLine.trim(),
                gstin: current.gstin.trim(),
                quoteValidityDays: Number(current.quoteValidityDays) || 15,
                gstRate: (Number(current.gstRate) || 18) / 100,
                quoteTerms: current.quoteTerms
                  .split('\n')
                  .map((t) => t.trim())
                  .filter(Boolean),
                discountThresholdPercent: Math.min(
                  50,
                  Math.max(0, Number(current.discountThreshold) || 10),
                ),
              },
            })
          }
        >
          Save settings
        </Button>
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------- Pipeline */

function PipelineTab() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [drafts, setDrafts] = useState<
    Record<string, { label: string; weight: string }>
  >({});

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>
          Stage names appear across the app; weights drive the sales forecast
          (probability an open deal at this stage closes).
        </CardDescription>
      </CardHeader>
      <CardContent className="max-w-2xl space-y-3">
        {PIPELINE_STAGES.map((stage) => {
          const current = settings?.stages?.[stage] ?? {
            label: stage,
            weight: 0,
          };
          const draft = drafts[stage] ?? {
            label: current.label,
            weight: String(Math.round(current.weight * 100)),
          };
          const dirty =
            draft.label !== current.label ||
            Number(draft.weight) !== Math.round(current.weight * 100);
          const closedStage = stage === 'won' || stage === 'lost';
          return (
            <div
              key={stage}
              className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
            >
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Stage key: {stage}
                </Label>
                <Input
                  className="h-9 w-44"
                  value={draft.label}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [stage]: { ...draft, label: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Forecast weight (%)
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  disabled={closedStage}
                  className="h-9 w-28 tabular-nums"
                  value={draft.weight}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [stage]: { ...draft, weight: e.target.value },
                    }))
                  }
                />
              </div>
              <Button
                size="sm"
                disabled={!dirty || !draft.label.trim() || update.isPending}
                onClick={() =>
                  update.mutate({
                    stages: {
                      [stage]: {
                        label: draft.label.trim(),
                        weight: closedStage
                          ? current.weight
                          : Math.min(
                              100,
                              Math.max(0, Number(draft.weight) || 0),
                            ) / 100,
                      },
                    },
                  })
                }
              >
                Save
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
