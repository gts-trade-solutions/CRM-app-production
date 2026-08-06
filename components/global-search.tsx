'use client';

// Global search (Ctrl+K) — server-side across leads, contacts, accounts
// and deals, scoped by the actor's hierarchy on the API.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  Building2,
  Contact as ContactIcon,
  Search,
  UserPlus,
} from 'lucide-react';
import { useGlobalSearch } from '@/lib/api/crm-hooks';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  lead: UserPlus,
  contact: ContactIcon,
  account: Building2,
  deal: Briefcase,
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data: results, isFetching } = useGlobalSearch(open ? query : '');

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
                placeholder="Search leads, contacts, accounts, deals…"
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
            ) : isFetching && !results?.length ? (
              <div className="space-y-2 p-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : !results?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No results in your scope.
              </p>
            ) : (
              results.map((r) => {
                const Icon = TYPE_ICONS[r.type] ?? Search;
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => go(r.href)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
