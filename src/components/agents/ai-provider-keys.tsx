'use client';

// ============================================================
// AiProviderKeys — AI Agents → API keys
//
// One row per provider so an admin can save keys for all of them up
// front; Setup then just picks the active provider. Keys are write-only
// (the API returns `has_key` flags), stored AES-256-GCM-encrypted.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { AI_PROVIDER_META, type AiProvider } from '@/lib/ai/providers/catalog';

interface KeyRow {
  provider: AiProvider;
  saved: boolean;
  has_key: boolean;
  base_url: string | null;
}

interface Draft {
  key: string;
  baseUrl: string;
}

export function AiProviderKeys() {
  const t = useTranslations('Agents.keys');
  const { accountRole } = useAuth();
  const canEdit = accountRole ? canEditSettings(accountRole) : false;

  const [rows, setRows] = useState<KeyRow[]>([]);
  const [active, setActive] = useState<{ provider: string; model: string; base_url: string | null } | null>(
    null,
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<{ provider: string; action: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [keysRes, configRes] = await Promise.all([
        fetch('/api/ai/keys', { cache: 'no-store' }),
        fetch('/api/ai/config', { cache: 'no-store' }),
      ]);
      const keys = await keysRes.json().catch(() => ({}));
      const config = await configRes.json().catch(() => ({}));
      if (!keysRes.ok) {
        toast.error(keys.error || t('loadFailed'));
        return;
      }
      setRows(keys.keys ?? []);
      setActive(
        config?.configured
          ? { provider: config.provider, model: config.model, base_url: config.base_url }
          : null,
      );
      setDrafts(
        Object.fromEntries(
          (keys.keys as KeyRow[]).map((r) => [
            r.provider,
            { key: '', baseUrl: r.base_url ?? AI_PROVIDER_META[r.provider].baseUrl ?? '' },
          ]),
        ),
      );
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (canEdit) void load();
    else setLoading(false);
  }, [canEdit, load]);

  const setDraft = (provider: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));

  async function save(row: KeyRow) {
    const meta = AI_PROVIDER_META[row.provider];
    const draft = drafts[row.provider];
    if (meta.keyRequired && !draft.key.trim()) {
      toast.error(t('enterKey', { provider: meta.label }));
      return;
    }
    setBusy({ provider: row.provider, action: 'save' });
    try {
      const res = await fetch('/api/ai/keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: row.provider,
          api_key: draft.key.trim(),
          base_url: meta.customBaseUrl ? draft.baseUrl.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t('saveFailed'));
        return;
      }
      toast.success(t('saved', { provider: meta.label }));
      await load();
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function test(row: KeyRow) {
    const meta = AI_PROVIDER_META[row.provider];
    const draft = drafts[row.provider];
    setBusy({ provider: row.provider, action: 'test' });
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: row.provider,
          // The active provider is tested with its configured model;
          // others with the catalog default.
          model: active?.provider === row.provider ? active.model : meta.defaultModel,
          base_url: meta.customBaseUrl ? draft.baseUrl.trim() : undefined,
          api_key: draft.key.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) toast.success(t('testSuccess', { provider: meta.label }));
      else toast.error(data.error || t('testFailed'));
    } catch {
      toast.error(t('testFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: KeyRow) {
    setBusy({ provider: row.provider, action: 'remove' });
    try {
      const res = await fetch(`/api/ai/keys?provider=${row.provider}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t('removeFailed'));
        return;
      }
      toast.success(t('removed'));
      await load();
    } catch {
      toast.error(t('removeFailed'));
    } finally {
      setBusy(null);
    }
  }

  if (!canEdit) {
    return (
      <p className="border-border bg-muted/40 text-muted-foreground rounded-md border px-3 py-2 text-sm">
        {t('adminOnly')}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-foreground flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="text-primary size-5" /> {t('title')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{t('description')}</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-border divide-y">
            {rows.map((row) => {
              const meta = AI_PROVIDER_META[row.provider];
              const draft = drafts[row.provider] ?? { key: '', baseUrl: '' };
              const isActive = active?.provider === row.provider;
              const isBusy = busy?.provider === row.provider;
              return (
                <li key={row.provider} className="space-y-2 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground text-sm font-medium">{meta.label}</span>
                    {row.saved ? (
                      <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-500">
                        {row.has_key ? t('statusSaved') : t('statusNoKey')}
                      </Badge>
                    ) : (
                      <Badge className="border-border bg-muted text-muted-foreground text-[10px]">
                        {t('statusNotSet')}
                      </Badge>
                    )}
                    {isActive && (
                      <Badge className="border-primary/30 bg-primary/10 text-primary text-[10px]">
                        {t('statusActive')}
                      </Badge>
                    )}
                    {meta.keyUrl && (
                      <a
                        href={meta.keyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary ml-auto inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        {t('getKey')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  {meta.customBaseUrl && (
                    <Input
                      value={draft.baseUrl}
                      onChange={(e) => setDraft(row.provider, { baseUrl: e.target.value })}
                      placeholder={meta.baseUrl ?? ''}
                      aria-label={t('baseUrl')}
                      autoComplete="off"
                    />
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      type="password"
                      value={draft.key}
                      onChange={(e) => setDraft(row.provider, { key: e.target.value })}
                      placeholder={
                        row.has_key
                          ? t('replacePlaceholder')
                          : meta.keyRequired
                            ? meta.keyPlaceholder
                            : t('optionalPlaceholder')
                      }
                      aria-label={t('keyLabel', { provider: meta.label })}
                      autoComplete="off"
                      className="flex-1"
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => save(row)} disabled={isBusy}>
                        {isBusy && busy?.action === 'save' && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        {t('save')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => test(row)}
                        disabled={isBusy || (!row.saved && !draft.key.trim() && meta.keyRequired)}
                      >
                        {isBusy && busy?.action === 'test' ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        {t('test')}
                      </Button>
                      {row.saved && (
                        <Button
                          variant="outline"
                          onClick={() => remove(row)}
                          disabled={isBusy}
                          aria-label={t('remove')}
                          className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">{t('footer')}</p>
    </div>
  );
}
