'use client';

// Bulk lead import from CSV — the spreadsheet-migration path. Expected
// headers (case-insensitive, order-free): name, company, phone, email,
// source, value, notes. Rows matching an existing phone/email are skipped
// as duplicates.

import { useState } from 'react';
import { FileUp, Upload } from 'lucide-react';
import { useImportLeads } from '@/lib/api/hooks';
import { LeadSource, SOURCE_CONFIG } from '@/lib/types';
import { parseCsv } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ParsedRow {
  name: string;
  company: string;
  phone: string;
  email: string;
  source: LeadSource;
  estimatedValue: number;
  notes: string;
}

function matchSource(raw: string): LeadSource {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const keys = Object.keys(SOURCE_CONFIG) as LeadSource[];
  const exact = keys.find((k) => k === s);
  if (exact) return exact;
  const byLabel = keys.find(
    (k) => SOURCE_CONFIG[k].label.toLowerCase() === raw.trim().toLowerCase(),
  );
  return byLabel ?? 'website';
}

export function ImportLeadsDialog({ trigger }: { trigger: React.ReactNode }) {
  const importLeads = useImportLeads();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(
    null,
  );

  async function handleFile(file: File | undefined) {
    setError('');
    setResult(null);
    setRows([]);
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setError('The file needs a header row plus at least one data row.');
      return;
    }
    const headers = parsed[0].map((h) => h.trim().toLowerCase());
    const idx = (names: string[]) =>
      headers.findIndex((h) => names.includes(h));
    const nameIdx = idx(['name', 'lead name', 'customer']);
    const phoneIdx = idx(['phone', 'mobile', 'phone number', 'contact']);
    if (nameIdx === -1 || phoneIdx === -1) {
      setError(
        'Could not find "name" and "phone" columns. Expected headers: name, company, phone, email, source, value, notes.',
      );
      return;
    }
    const companyIdx = idx(['company', 'organisation', 'organization', 'firm']);
    const emailIdx = idx(['email', 'e-mail']);
    const sourceIdx = idx(['source', 'channel']);
    const valueIdx = idx(['value', 'estimated value', 'amount', 'deal value']);
    const notesIdx = idx(['notes', 'remarks', 'comments']);

    const data: ParsedRow[] = [];
    for (const r of parsed.slice(1)) {
      const name = (r[nameIdx] ?? '').trim();
      const phone = (r[phoneIdx] ?? '').trim();
      if (!name || !phone) continue;
      data.push({
        name,
        phone,
        company: companyIdx >= 0 ? (r[companyIdx] ?? '').trim() : '',
        email: emailIdx >= 0 ? (r[emailIdx] ?? '').trim() : '',
        source: sourceIdx >= 0 ? matchSource(r[sourceIdx] ?? '') : 'website',
        estimatedValue:
          valueIdx >= 0
            ? Number((r[valueIdx] ?? '').replace(/[^\d.]/g, '')) || 0
            : 0,
        notes: notesIdx >= 0 ? (r[notesIdx] ?? '').trim() : '',
      });
    }
    if (data.length === 0) {
      setError('No usable rows found (each row needs a name and a phone).');
      return;
    }
    setRows(data);
  }

  function runImport() {
    importLeads.mutate(rows, {
      onSuccess: (res) => {
        setResult(res);
        setRows([]);
      },
    });
  }

  function reset() {
    setRows([]);
    setFileName('');
    setError('');
    setResult(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
          <DialogDescription>
            Headers: name, company, phone, email, source, value, notes.
            Duplicates (matching phone/email) are skipped automatically.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-2 text-center">
            <p className="text-lg font-semibold">
              {result.added} lead{result.added === 1 ? '' : 's'} imported
            </p>
            <p className="text-sm text-muted-foreground">
              {result.skipped > 0
                ? `${result.skipped} duplicate row${result.skipped === 1 ? '' : 's'} skipped.`
                : 'No duplicates found.'}
            </p>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : (
          <>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground transition-colors hover:bg-accent">
              <FileUp className="h-6 w-6" />
              {fileName || 'Click to choose a .csv file'}
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {rows.length > 0 && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">{rows.length} rows ready</Badge>
                  <span className="text-muted-foreground">
                    Preview (first 5):
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 5).map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-2">{r.name}</TableCell>
                          <TableCell className="py-2">
                            {r.company || '—'}
                          </TableCell>
                          <TableCell className="py-2">{r.phone}</TableCell>
                          <TableCell className="py-2">
                            {SOURCE_CONFIG[r.source].label}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            <DialogFooter>
              <Button
                onClick={runImport}
                disabled={rows.length === 0 || importLeads.isPending}
              >
                <Upload />
                {importLeads.isPending
                  ? 'Importing…'
                  : `Import ${rows.length > 0 ? `${rows.length} leads` : ''}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
