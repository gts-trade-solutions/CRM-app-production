'use client';

// Admin console: the configuration surface that makes the app manageable —
// user lifecycle (incl. deactivation with handover), targets, product
// catalogue, organisation identity (feeds quotations) and pipeline
// vocabulary. Admin-only via the policy matrix.

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Pencil, Plus, UserX } from 'lucide-react';
import { useStore } from '@/lib/store';
import { RequireCapability } from '@/components/require-capability';
import {
  DealStage,
  PIPELINE_STAGES,
  Product,
  ROLE_LABELS,
  ROLE_LEVEL,
  Role,
  User,
} from '@/lib/types';
import { subordinateIds } from '@/lib/rbac';
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
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Users                                                               */

function UsersTab() {
  const { state, updateUser, deactivateUser } = useStore();
  const [editing, setEditing] = useState<User | null>(null);
  const [edit, setEdit] = useState({
    name: '',
    email: '',
    role: 'sales_rep' as Role,
    managerId: '' as string,
    region: '',
    title: '',
  });
  const [deactivating, setDeactivating] = useState<User | null>(null);
  const [successorId, setSuccessorId] = useState('');

  const userById = useMemo(
    () => new Map(state.users.map((u) => [u.id, u])),
    [state.users],
  );

  const openCounts = useMemo(() => {
    if (!deactivating) return { leads: 0, deals: 0, activities: 0, reports: 0 };
    return {
      leads: state.leads.filter(
        (l) =>
          l.ownerId === deactivating.id &&
          l.status !== 'converted' &&
          l.status !== 'disqualified',
      ).length,
      deals: state.deals.filter(
        (d) =>
          d.ownerId === deactivating.id &&
          d.stage !== 'won' &&
          d.stage !== 'lost',
      ).length,
      activities: state.salesActivities.filter(
        (a) => a.ownerId === deactivating.id && !a.completedAt,
      ).length,
      reports: state.users.filter((u) => u.managerId === deactivating.id)
        .length,
    };
  }, [deactivating, state]);

  function openEdit(user: User) {
    setEditing(user);
    setEdit({
      name: user.name,
      email: user.email,
      role: user.role,
      managerId: user.managerId ?? '',
      region: user.region,
      title: user.title,
    });
  }

  const possibleManagers = state.users.filter(
    (u) =>
      u.active !== false &&
      u.id !== editing?.id &&
      ROLE_LEVEL[u.role] < ROLE_LEVEL[edit.role],
  );

  const possibleSuccessors = state.users.filter(
    (u) => u.active !== false && u.id !== deactivating?.id,
  );

  const sorted = [...state.users].sort(
    (a, b) =>
      Number(b.active !== false) - Number(a.active !== false) ||
      ROLE_LEVEL[a.role] - ROLE_LEVEL[b.role] ||
      a.name.localeCompare(b.name),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>
          Add members from the Team page. Deactivation hands all open records
          and direct reports to a successor.
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
            {sorted.map((user) => {
              const inactive = user.active === false;
              return (
                <TableRow key={user.id} className={cn(inactive && 'opacity-60')}>
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
                    <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {user.managerId
                      ? userById.get(user.managerId)?.name ?? '—'
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={inactive ? 'secondary' : 'outline'}
                      className={cn(
                        !inactive &&
                          'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
                      )}
                    >
                      {inactive ? 'Inactive' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {!inactive && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(user)}
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
              );
            })}
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
              disabled={!edit.name.trim() || !edit.email.trim()}
              onClick={() => {
                if (!editing) return;
                updateUser(editing.id, {
                  name: edit.name.trim(),
                  email: edit.email.trim(),
                  role: edit.role,
                  managerId: edit.managerId || null,
                  region: edit.region,
                  title: edit.title,
                });
                setEditing(null);
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
              Their open work is handed to a successor; secured/lost history
              stays with them for reporting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/60 p-3 text-sm">
              <p className="font-medium">Will be handed over:</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>{openCounts.leads} open leads</li>
                <li>{openCounts.deals} open deals</li>
                <li>{openCounts.activities} pending activities</li>
                <li>All contacts & accounts they own</li>
                {openCounts.reports > 0 && (
                  <li>{openCounts.reports} direct reports (re-pointed)</li>
                )}
              </ul>
            </div>
            <div className="space-y-1.5">
              <Label>Successor *</Label>
              <Select value={successorId} onValueChange={setSuccessorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose who takes over" />
                </SelectTrigger>
                <SelectContent>
                  {possibleSuccessors.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({ROLE_LABELS[u.role]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivating(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!successorId}
              onClick={() => {
                if (deactivating) {
                  deactivateUser(deactivating.id, successorId);
                }
                setDeactivating(null);
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

/* ------------------------------------------------------------------ */
/* Targets                                                             */

function TargetsTab() {
  const { state, setTarget } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const active = state.users.filter((u) => u.active !== false);
  const sorted = [...active].sort(
    (a, b) =>
      ROLE_LEVEL[a.role] - ROLE_LEVEL[b.role] || a.name.localeCompare(b.name),
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>
          Monthly revenue quota per member. Manager quotas represent their
          whole subtree ({subordinateIds(state.users, 'u1').length + 1} members
          under the org root).
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
              const current = state.targets[user.id] ?? 0;
              const draft = drafts[user.id] ?? String(current || '');
              const dirty = Number(draft) !== current;
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
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
                      disabled={!dirty}
                      onClick={() => setTarget(user.id, Number(draft) || 0)}
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

/* ------------------------------------------------------------------ */
/* Products                                                            */

function ProductsTab() {
  const { state, addProduct, updateProduct } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', sku: '', category: '', price: '' });

  function openNew() {
    setEditingId(null);
    setForm({ name: '', sku: '', category: '', price: '' });
    setDialogOpen(true);
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: String(p.price),
    });
    setDialogOpen(true);
  }

  function save() {
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category.trim(),
      price: Number(form.price) || 0,
    };
    if (editingId) updateProduct(editingId, payload);
    else addProduct(payload);
    setDialogOpen(false);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>
            The catalogue behind deal line items and quotations. Inactive
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
            {state.products.map((p) => {
              const inactive = p.active === false;
              return (
                <TableRow key={p.id} className={cn(inactive && 'opacity-60')}>
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
                    <Badge variant={inactive ? 'secondary' : 'outline'}>
                      {inactive ? 'Inactive' : 'Active'}
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
                        onClick={() =>
                          updateProduct(p.id, { active: inactive })
                        }
                      >
                        {inactive ? 'Activate' : 'Retire'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
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
              disabled={!form.name.trim() || !(Number(form.price) > 0)}
              onClick={save}
            >
              {editingId ? 'Save' : 'Add product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Organisation                                                        */

function OrgTab() {
  const { state, updateOrgSettings } = useStore();
  const s = state.orgSettings;
  const [form, setForm] = useState({
    companyName: s.companyName,
    addressLine: s.addressLine,
    gstin: s.gstin,
    quoteValidityDays: String(s.quoteValidityDays),
    gstRate: String(Math.round(s.gstRate * 100)),
    quoteTerms: s.quoteTerms.join('\n'),
  });

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
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Address line</Label>
          <Input
            value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>GSTIN</Label>
            <Input
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Quote validity (days)</Label>
            <Input
              type="number"
              min={1}
              value={form.quoteValidityDays}
              onChange={(e) =>
                setForm({ ...form, quoteValidityDays: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>GST rate (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.gstRate}
              onChange={(e) => setForm({ ...form, gstRate: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Quotation terms (one per line)</Label>
          <Textarea
            rows={4}
            value={form.quoteTerms}
            onChange={(e) => setForm({ ...form, quoteTerms: e.target.value })}
          />
        </div>
        <Button
          onClick={() =>
            updateOrgSettings({
              companyName: form.companyName.trim(),
              addressLine: form.addressLine.trim(),
              gstin: form.gstin.trim(),
              quoteValidityDays: Number(form.quoteValidityDays) || 15,
              gstRate: (Number(form.gstRate) || 18) / 100,
              quoteTerms: form.quoteTerms
                .split('\n')
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        >
          Save settings
        </Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */

function PipelineTab() {
  const { state, updateStageSetting } = useStore();
  const [drafts, setDrafts] = useState<
    Record<string, { label: string; weight: string }>
  >({});

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>
          Stage names appear across the app; weights drive the sales
          forecast (probability an open deal at this stage closes).
        </CardDescription>
      </CardHeader>
      <CardContent className="max-w-2xl space-y-3">
        {PIPELINE_STAGES.map((stage: DealStage) => {
          const current = state.stageSettings[stage];
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
                disabled={!dirty || !draft.label.trim()}
                onClick={() =>
                  updateStageSetting(stage, {
                    label: draft.label.trim(),
                    weight: closedStage
                      ? current.weight
                      : Math.min(100, Math.max(0, Number(draft.weight) || 0)) /
                        100,
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
