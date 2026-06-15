'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  dedupeByPhone,
  isUniqueViolation,
  normalizeKey,
} from '@/lib/contacts/dedupe';
import { parseContactCsv, type ParsedContactRow } from '@/lib/contacts/parse-contact-csv';
import {
  assignImportedContactTags,
  resolveImportTagIds,
  type ContactTagAssignment,
} from '@/lib/contacts/resolve-import-tags';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const DEFAULT_TAG_COLOR = '#3b82f6';

function ImportPreviewTags({
  tagNames,
  tagColorByKey,
}: {
  tagNames: string[];
  tagColorByKey: Map<string, string>;
}) {
  if (tagNames.length === 0) {
    return <span className="text-slate-500">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {tagNames.map((name) => {
        const color = tagColorByKey.get(name.trim().toLowerCase()) ?? DEFAULT_TAG_COLOR;
        return (
          <span
            key={name}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: `${color}20`,
              color,
              border: `1px solid ${color}40`,
            }}
          >
            {name}
          </span>
        );
      })}
    </div>
  );
}

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportModal({ open, onOpenChange, onImported }: ImportModalProps) {
  const supabase = createClient();
  const { accountId, canEditSettings } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedContactRow[]>([]);
  const [hasTagsColumn, setHasTagsColumn] = useState(false);
  const [tagColorByKey, setTagColorByKey] = useState<Map<string, string>>(new Map());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    failed: number;
    tagsAssigned: number;
  } | null>(null);

  function reset() {
    setFile(null);
    setParsedRows([]);
    setHasTagsColumn(false);
    setTagColorByKey(new Map());
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleOpenChange(open: boolean) {
    if (!open) reset();
    onOpenChange(open);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setResult(null);

    const text = await selected.text();
    const { rows, hasTagsColumn: csvHasTags } = parseContactCsv(text);

    if (rows.length === 0) {
      toast.error('No valid rows found. Ensure CSV has a "phone" column header.');
      setParsedRows([]);
      setHasTagsColumn(false);
      setTagColorByKey(new Map());
      return;
    }

    setParsedRows(rows);
    setHasTagsColumn(csvHasTags);

    if (csvHasTags && accountId) {
      const { data: tags } = await supabase
        .from('tags')
        .select('name, color')
        .eq('account_id', accountId);

      const colors = new Map<string, string>();
      for (const tag of tags ?? []) {
        const key = tag.name.trim().toLowerCase();
        if (!colors.has(key)) colors.set(key, tag.color);
      }
      setTagColorByKey(colors);
    } else {
      setTagColorByKey(new Map());
    }
  }

  async function handleImport() {
    if (parsedRows.length === 0) return;
    setImporting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');
      if (!accountId) throw new Error('Your profile is not linked to an account.');

      let imported = 0;
      let skipped = 0;
      let failed = 0;

      // 1) De-dupe within the file by normalized phone (keep first).
      const { unique, duplicates: inFileDupes } = dedupeByPhone(parsedRows);
      skipped += inFileDupes;

      // 2) Skip numbers already in this account. One read of the
      //    generated `phone_normalized` column (migration 022) → Set.
      const { data: existingRows } = await supabase
        .from('contacts')
        .select('phone_normalized')
        .eq('account_id', accountId);
      const existing = new Set(
        (existingRows ?? [])
          .map((r) => (r as { phone_normalized: string | null }).phone_normalized)
          .filter((p): p is string => !!p),
      );

      const toInsert = unique.filter((row) => {
        if (existing.has(normalizeKey(row.phone))) {
          skipped++;
          return false;
        }
        return true;
      });

      // 3) Resolve tag names → ids (create missing tags for admin+).
      const allTagNames = toInsert.flatMap((row) => row.tagNames);
      const { tagIdByKey, skippedNames } = await resolveImportTagIds(supabase, {
        accountId,
        userId: user.id,
        tagNames: allTagNames,
        canCreateTags: canEditSettings,
      });

      const tagAssignments: ContactTagAssignment[] = [];

      // 4) Batch insert contacts in chunks of 50. The DB unique index is
      //    the backstop: a 23505 counts as skipped, not failed.
      const chunkSize = 50;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const rows = chunk.map((row) => ({
          user_id: user.id,
          account_id: accountId,
          phone: row.phone,
          name: row.name || null,
          email: row.email || null,
          company: row.company || null,
        }));

        const { data, error } = await supabase
          .from('contacts')
          .insert(rows)
          .select('id');

        if (error) {
          // Retry individually so one bad/duplicate row doesn't sink
          // the whole chunk.
          for (let j = 0; j < rows.length; j++) {
            const row = rows[j];
            const source = chunk[j];
            const { data: singleData, error: singleErr } = await supabase
              .from('contacts')
              .insert(row)
              .select('id')
              .single();

            if (!singleErr && singleData) {
              imported++;
              if (source.tagNames.length > 0) {
                tagAssignments.push({
                  contactId: singleData.id,
                  tagNames: source.tagNames,
                });
              }
            } else if (isUniqueViolation(singleErr)) {
              skipped++;
            } else {
              failed++;
            }
          }
        } else {
          const inserted = data ?? [];
          imported += inserted.length;
          for (let j = 0; j < inserted.length; j++) {
            const source = chunk[j];
            if (!source || source.tagNames.length === 0) continue;
            tagAssignments.push({
              contactId: inserted[j].id,
              tagNames: source.tagNames,
            });
          }
        }
      }

      // 5) Wire tags onto the contacts we just created.
      const tagsAssigned = await assignImportedContactTags(
        supabase,
        tagAssignments,
        tagIdByKey,
      );

      setResult({ imported, skipped, failed, tagsAssigned });
      if (imported > 0) {
        toast.success(`${imported} contact${imported !== 1 ? 's' : ''} imported`);
        onImported();
      }
      if (tagsAssigned > 0) {
        toast.success(
          `${tagsAssigned} tag assignment${tagsAssigned !== 1 ? 's' : ''} applied`,
        );
      }
      if (skippedNames.length > 0) {
        const sample = skippedNames.slice(0, 3).join(', ');
        const more =
          skippedNames.length > 3 ? ` (+${skippedNames.length - 3} more)` : '';
        toast.info(
          `Unknown tags skipped (create them in Settings first): ${sample}${more}`,
        );
      }
      if (skipped > 0) {
        toast.info(`${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped`);
      }
      if (failed > 0) {
        toast.error(`${failed} contact${failed !== 1 ? 's' : ''} failed to import`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast.error(message);
    } finally {
      setImporting(false);
    }
  }

  const preview = parsedRows.slice(0, 5);
  const previewHasTags = hasTagsColumn || preview.some((row) => row.tagNames.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-200 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">Import Contacts</DialogTitle>
          <DialogDescription className="text-slate-400">
            Upload a CSV file with a &quot;phone&quot; column (required). Optional columns:
            name, email, company, tags (comma-separated tag names — quote the
            cell if a tag list contains commas, e.g. &quot;VIP, Lead&quot;).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-700 p-6 cursor-pointer hover:border-primary/50 transition-colors"
          >
            {file ? (
              <>
                <FileText className="size-8 text-primary" />
                <p className="text-sm text-slate-300">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} detected
                </p>
              </>
            ) : (
              <>
                <Upload className="size-8 text-slate-500" />
                <p className="text-sm text-slate-400">
                  Click to upload CSV file
                </p>
                <p className="text-xs text-slate-500">
                  CSV with &quot;phone&quot; column required
                </p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Preview table */}
          {preview.length > 0 && !result && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Preview (first {preview.length} rows)
              </p>
              <div className="rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800">
                      <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Phone</th>
                      <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Name</th>
                      <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Email</th>
                      <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Company</th>
                      {previewHasTags && (
                        <th className="px-3 py-1.5 text-left text-slate-400 font-medium">Tags</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t border-slate-700/50">
                        <td className="px-3 py-1.5 text-slate-300">{row.phone}</td>
                        <td className="px-3 py-1.5 text-slate-300">{row.name || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-300">{row.email || '-'}</td>
                        <td className="px-3 py-1.5 text-slate-300">{row.company || '-'}</td>
                        {previewHasTags && (
                          <td className="px-3 py-1.5 text-slate-300">
                            <ImportPreviewTags
                              tagNames={row.tagNames}
                              tagColorByKey={tagColorByKey}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedRows.length > 5 && (
                <p className="text-xs text-slate-500">
                  ...and {parsedRows.length - 5} more rows
                </p>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="rounded-lg border border-slate-700 p-4 space-y-2">
              <p className="text-sm font-medium text-white">Import Complete</p>
              <div className="flex flex-wrap items-center gap-4">
                {result.imported > 0 && (
                  <div className="flex items-center gap-1.5 text-primary text-sm">
                    <CheckCircle className="size-4" />
                    {result.imported} imported
                  </div>
                )}
                {result.tagsAssigned > 0 && (
                  <div className="flex items-center gap-1.5 text-cyan-400 text-sm">
                    <CheckCircle className="size-4" />
                    {result.tagsAssigned} tag{result.tagsAssigned !== 1 ? 's' : ''} assigned
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-400 text-sm">
                    <AlertTriangle className="size-4" />
                    {result.skipped} duplicate{result.skipped !== 1 ? 's' : ''} skipped
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-red-400 text-sm">
                    <XCircle className="size-4" />
                    {result.failed} failed
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="bg-slate-900 border-slate-700">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button
              type="button"
              disabled={parsedRows.length === 0 || importing}
              onClick={handleImport}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {importing && <Loader2 className="size-4 animate-spin" />}
              Import {parsedRows.length > 0 ? `${parsedRows.length} Contacts` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
