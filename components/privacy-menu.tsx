'use client';

// DPDP data-principal actions on a record: export everything held about
// them as JSON; admins can erase PII (anonymize) on request.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useMe } from '@/lib/api/hooks';
import { hasCapability } from '@/lib/policy';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function PrivacyMenu({
  type,
  id,
  name,
}: {
  type: 'lead' | 'contact';
  id: string;
  name: string;
}) {
  const { data: me } = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const [eraseOpen, setEraseOpen] = useState(false);
  const [working, setWorking] = useState(false);

  if (!me) return null;
  const isAdmin = hasCapability(me.role, 'view_admin');

  async function exportData() {
    try {
      const data = await api<unknown>(`/api/privacy?type=${type}&id=${id}`);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-${id}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Data export downloaded');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function erase() {
    setWorking(true);
    try {
      await api('/api/privacy', { method: 'POST', json: { type, id } });
      toast.success('Personal data erased');
      qc.invalidateQueries();
      setEraseOpen(false);
      router.push(type === 'lead' ? '/leads' : '/contacts');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Privacy actions">
            <ShieldCheck />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Data privacy (DPDP)</DropdownMenuLabel>
          <DropdownMenuItem onClick={exportData}>
            <Download />
            Export their data (JSON)
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => setEraseOpen(true)}
            >
              <ShieldAlert />
              Erase personal data…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={eraseOpen} onOpenChange={setEraseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Erase {name}&apos;s personal data?</DialogTitle>
            <DialogDescription>
              Irreversible. Name, phone, email, notes and attachments are
              removed; business aggregates (deal values, statuses) are
              preserved. The erasure is audit-logged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEraseOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={working} onClick={erase}>
              Erase permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
