'use client';

// Global search across leads, contacts and deals — scoped to what the
// signed-in user is allowed to see. Opens with the topbar button or Ctrl+K.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  Building2,
  Contact as ContactIcon,
  Search,
  UserPlus,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { visibleUserIds } from '@/lib/rbac';
import { LEAD_STATUS_CONFIG } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface ResultRow {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  href: string;
}

export function GlobalSearch() {
  const { state, currentUser, stages } = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo<ResultRow[]>(() => {
    if (!currentUser) return [];
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const visible = visibleUserIds(state.users, currentUser);
    const rows: ResultRow[] = [];

    for (const l of state.leads) {
      if (!visible.has(l.ownerId)) continue;
      if (
        l.name.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.phone.includes(q)
      ) {
        rows.push({
          key: `lead-${l.id}`,
          icon: UserPlus,
          title: l.name,
          subtitle: `Lead · ${l.company || l.email} · ${LEAD_STATUS_CONFIG[l.status].label}`,
          href: `/leads/${l.id}`,
        });
      }
    }
    for (const c of state.contacts) {
      if (!visible.has(c.ownerId) || c.archived) continue;
      if (
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      ) {
        rows.push({
          key: `contact-${c.id}`,
          icon: ContactIcon,
          title: c.name,
          subtitle: `Contact · ${c.company || c.email}`,
          href: `/contacts/${c.id}`,
        });
      }
    }
    for (const a of state.accounts) {
      if (!visible.has(a.ownerId) || a.archived) continue;
      if (
        a.name.toLowerCase().includes(q) ||
        a.industry.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q)
      ) {
        rows.push({
          key: `account-${a.id}`,
          icon: Building2,
          title: a.name,
          subtitle: `Account · ${[a.industry, a.city].filter(Boolean).join(' · ') || 'company'}`,
          href: `/accounts/${a.id}`,
        });
      }
    }
    for (const d of state.deals) {
      if (!visible.has(d.ownerId) || d.archived) continue;
      if (d.title.toLowerCase().includes(q)) {
        rows.push({
          key: `deal-${d.id}`,
          icon: Briefcase,
          title: d.title,
          subtitle: `Deal · ${stages[d.stage].label}`,
          href: `/pipeline/${d.id}`,
        });
      }
    }
    return rows.slice(0, 12);
  }, [query, state, currentUser, stages]);

  function go(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  return (
    <>
      <Button
        variant="outline"
        className="h-9 w-9 justify-center gap-2 px-0 text-muted-foreground sm:w-56 sm:justify-start sm:px-3"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="hidden text-sm font-normal sm:inline">Search…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[10px] sm:inline">
          Ctrl K
        </kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[20%] translate-y-0 p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search leads, contacts, deals…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="border-0 pl-9 shadow-none focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {query.trim().length < 2 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Type at least 2 characters.
              </p>
            ) : results.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No results in your scope.
              </p>
            ) : (
              results.map((r) => (
                <button
                  key={r.key}
                  onClick={() => go(r.href)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
                >
                  <r.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.subtitle}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
