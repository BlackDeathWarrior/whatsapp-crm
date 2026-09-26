'use client';

// ============================================================
// McpSettings — Settings → MCP servers
//
// Two halves:
//   1. Custom MCP servers — remote (Streamable HTTP) servers whose tools
//      the AI agent can call while drafting / auto-replying. Admin+
//      manage them; any member sees the list. Header values are write-
//      only: the API returns just their names.
//   2. Client config — the JSON to plug this CRM (via the `wacrm-mcp`
//      package) plus any custom servers into Claude Desktop, Cursor,
//      Claude Code, etc. Generated in the browser; nothing is stored.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Blocks,
  CheckCircle2,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Switch } from '@/components/ui/switch';
import { RequireRole } from '@/components/auth/require-role';
import { useAuth } from '@/hooks/use-auth';
import { SettingsPanelHead } from './settings-panel-head';

interface McpServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  header_names: string[];
}

interface TestResult {
  tools: { name: string; description: string }[];
}

interface HeaderRow {
  name: string;
  value: string;
}

async function runTest(body: Record<string, unknown>): Promise<TestResult> {
  const res = await fetch('/api/mcp/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '');
  return { tools: data.tools ?? [] };
}

export function McpSettings() {
  const { canEditSettings } = useAuth();
  const t = useTranslations('Settings.mcp');

  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toolsById, setToolsById] = useState<Record<string, TestResult['tools']>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/servers', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t('loadFailed'));
        return;
      }
      setServers(data.servers ?? []);
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleEnabled(server: McpServer, enabled: boolean) {
    setServers((prev) => prev.map((s) => (s.id === server.id ? { ...s, enabled } : s)));
    const res = await fetch(`/api/mcp/servers/${server.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }).catch(() => null);
    if (!res?.ok) {
      toast.error(t('updateFailed'));
      setServers((prev) =>
        prev.map((s) => (s.id === server.id ? { ...s, enabled: !enabled } : s)),
      );
    }
  }

  async function handleTest(server: McpServer) {
    setBusyId(server.id);
    try {
      const result = await runTest({ id: server.id });
      setToolsById((prev) => ({ ...prev, [server.id]: result.tools }));
      toast.success(t('testSuccess', { count: result.tools.length }));
    } catch (err) {
      toast.error((err as Error).message || t('testFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(server: McpServer) {
    setBusyId(server.id);
    try {
      const res = await fetch(`/api/mcp/servers/${server.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t('deleteFailed'));
        return;
      }
      toast.success(t('deleteSuccess'));
      setServers((prev) => prev.filter((s) => s.id !== server.id));
    } catch {
      toast.error(t('deleteFailed'));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          <RequireRole min="admin">
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t('addServer')}
            </Button>
          </RequireRole>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Blocks className="text-primary size-4" /> {t('customTitle')}
          </CardTitle>
          <CardDescription>{t('customDesc')}</CardDescription>
        </CardHeader>
        <CardContent className={servers.length > 0 ? 'p-0' : undefined}>
          {servers.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <p className="text-muted-foreground text-sm">{t('noServers')}</p>
              {!canEditSettings && (
                <p className="text-muted-foreground mt-1 text-xs">{t('adminOnly')}</p>
              )}
            </div>
          ) : (
            <ul className="divide-border divide-y border-t">
              {servers.map((s) => {
                const tools = toolsById[s.id];
                return (
                  <li key={s.id} className="flex flex-col gap-3 px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground truncate text-sm font-medium">{s.name}</p>
                        <p className="text-muted-foreground truncate font-mono text-xs">{s.url}</p>
                        {s.header_names.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {s.header_names.map((h) => (
                              <Badge
                                key={h}
                                className="border-border bg-muted text-muted-foreground text-[10px]"
                              >
                                {h}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-muted-foreground flex items-center gap-2 text-xs">
                          <Switch
                            checked={s.enabled}
                            onCheckedChange={(v) => toggleEnabled(s, v)}
                            disabled={!canEditSettings}
                          />
                          {t('agentToggle')}
                        </label>
                        <RequireRole min="admin">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTest(s)}
                            disabled={busyId === s.id}
                          >
                            {busyId === s.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-4" />
                            )}
                            {t('test')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(s);
                              setDialogOpen(true);
                            }}
                            aria-label={t('edit')}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(s)}
                            disabled={busyId === s.id}
                            aria-label={t('delete')}
                            className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </RequireRole>
                      </div>
                    </div>
                    {tools && <ToolList tools={tools} />}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <ClientConfigCard servers={servers} />

      <ServerDialog
        open={dialogOpen}
        server={editing}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />
    </section>
  );
}

function ToolList({ tools }: { tools: TestResult['tools'] }) {
  const t = useTranslations('Settings.mcp');
  if (tools.length === 0) {
    return <p className="text-muted-foreground text-xs">{t('noTools')}</p>;
  }
  return (
    <div className="border-border rounded-md border p-2">
      <p className="text-muted-foreground mb-1 text-xs font-medium">{t('toolsFound')}</p>
      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {tools.map((tool) => (
          <li key={tool.name} className="text-xs">
            <span className="text-foreground font-mono">{tool.name}</span>
            {tool.description && (
              <span className="text-muted-foreground"> — {tool.description}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------
// Add / edit dialog
// ------------------------------------------------------------

function ServerDialog({
  open,
  server,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  server: McpServer | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations('Settings.mcp');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [rows, setRows] = useState<HeaderRow[]>([]);
  const [clearHeaders, setClearHeaders] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tools, setTools] = useState<TestResult['tools'] | null>(null);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(server?.name ?? '');
    setUrl(server?.url ?? '');
    setEnabled(server?.enabled ?? true);
    setRows(server ? [] : [{ name: 'Authorization', value: '' }]);
    setClearHeaders(false);
    setTools(null);
  }, [open, server]);

  const enteredHeaders = rows.filter((r) => r.name.trim());
  const savedNames = server?.header_names ?? [];
  const urlChanged = !!server && url.trim() !== server.url;

  /** undefined = keep the stored headers; object = replace them. */
  function headersPayload(): Record<string, string> | undefined {
    if (enteredHeaders.length > 0) {
      return Object.fromEntries(enteredHeaders.map((r) => [r.name.trim(), r.value]));
    }
    if (!server || clearHeaders) return {};
    return undefined;
  }

  function headersMissingForNewUrl(): boolean {
    return urlChanged && savedNames.length > 0 && headersPayload() === undefined;
  }

  async function handleTest() {
    if (!url.trim()) {
      toast.error(t('missingFields'));
      return;
    }
    if (headersMissingForNewUrl()) {
      toast.error(t('reenterHeaders'));
      return;
    }
    setTesting(true);
    try {
      const headers = headersPayload();
      const result = await runTest({
        ...(server ? { id: server.id } : {}),
        url: url.trim(),
        ...(headers !== undefined ? { headers } : {}),
      });
      setTools(result.tools);
      toast.success(t('testSuccess', { count: result.tools.length }));
    } catch (err) {
      setTools(null);
      toast.error((err as Error).message || t('testFailed'));
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!name.trim() || !url.trim()) {
      toast.error(t('missingFields'));
      return;
    }
    if (headersMissingForNewUrl()) {
      toast.error(t('reenterHeaders'));
      return;
    }
    setSaving(true);
    try {
      const headers = headersPayload();
      const body: Record<string, unknown> = {
        name: name.trim(),
        url: url.trim(),
        enabled,
      };
      if (headers !== undefined) body.headers = headers;
      const res = await fetch(server ? `/api/mcp/servers/${server.id}` : '/api/mcp/servers', {
        method: server ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t('saveFailed'));
        return;
      }
      toast.success(t('saveSuccess'));
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {server ? t('dialogEditTitle') : t('dialogAddTitle')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('dialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-name" className="text-muted-foreground">
              {t('nameLabel')}
            </Label>
            <Input
              id="mcp-name"
              value={name}
              maxLength={60}
              placeholder={t('namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">{t('nameHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcp-url" className="text-muted-foreground">
              {t('urlLabel')}
            </Label>
            <Input
              id="mcp-url"
              value={url}
              placeholder="https://mcp.example.com/mcp"
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('headersLabel')}</Label>
            {server && savedNames.length > 0 && !clearHeaders && (
              <p className="text-muted-foreground text-xs">
                {t('savedHeaders', { names: savedNames.join(', ') })}{' '}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setClearHeaders(true)}
                >
                  {t('clearHeaders')}
                </button>
              </p>
            )}
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={row.name}
                  placeholder={t('headerName')}
                  className="w-2/5"
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)),
                    )
                  }
                />
                <Input
                  type="password"
                  value={row.value}
                  placeholder={t('headerValue')}
                  autoComplete="off"
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('removeHeader')}
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((prev) => [...prev, { name: '', value: '' }])}
                disabled={rows.length >= 10}
              >
                <Plus className="size-4" />
                {t('addHeader')}
              </Button>
              <p className="text-muted-foreground text-xs">{t('headersHint')}</p>
            </div>
          </div>

          <label className="border-border flex items-center justify-between gap-4 rounded-md border p-3">
            <span className="text-sm">{t('agentToggle')}</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </label>

          {tools && <ToolList tools={tools} />}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing || saving}>
            {testing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {t('testConnection')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------
// Client config generator
// ------------------------------------------------------------

function ClientConfigCard({ servers }: { servers: McpServer[] }) {
  const t = useTranslations('Settings.mcp');
  const [apiKey, setApiKey] = useState('');
  const [writes, setWrites] = useState(false);
  const [broadcasts, setBroadcasts] = useState(false);
  const [includeCustom, setIncludeCustom] = useState(true);
  // Only rendered after the server list loads (client-side), so reading
  // window here can't cause a hydration mismatch.
  const [origin] = useState(() =>
    typeof window === 'undefined' ? 'https://crm.example.com' : window.location.origin,
  );

  const config = useMemo(() => {
    const env: Record<string, string> = {
      WACRM_BASE_URL: origin,
      WACRM_API_KEY: apiKey.trim() || 'wacrm_live_xxxxxxxxxxxxxxxxxxxxxxxx',
    };
    if (writes) env.WACRM_ENABLE_WRITES = 'true';
    if (writes && broadcasts) env.WACRM_ENABLE_BROADCASTS = 'true';

    const mcpServers: Record<string, unknown> = {
      wacrm: { command: 'npx', args: ['-y', 'wacrm-mcp'], env },
    };
    if (includeCustom) {
      for (const s of servers) {
        const key = s.name.replace(/[^A-Za-z0-9_-]+/g, '-') || 'server';
        mcpServers[mcpServers[key] ? `${key}-${s.id.slice(0, 4)}` : key] = {
          type: 'http',
          url: s.url,
          ...(s.header_names.length > 0
            ? {
                headers: Object.fromEntries(
                  s.header_names.map((h) => [h, `YOUR_${h.toUpperCase().replace(/-/g, '_')}`]),
                ),
              }
            : {}),
        };
      }
    }
    return JSON.stringify({ mcpServers }, null, 2);
  }, [origin, apiKey, writes, broadcasts, includeCustom, servers]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(config);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('clientTitle')}</CardTitle>
        <CardDescription>{t('clientDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="mcp-client-key" className="text-muted-foreground">
            {t('apiKeyLabel')}
          </Label>
          <Input
            id="mcp-client-key"
            type="password"
            value={apiKey}
            placeholder="wacrm_live_..."
            autoComplete="off"
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t('apiKeyHint')}</p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={writes}
              onCheckedChange={(v) => {
                setWrites(v === true);
                if (v !== true) setBroadcasts(false);
              }}
            />
            {t('allowWrites')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={broadcasts}
              disabled={!writes}
              onCheckedChange={(v) => setBroadcasts(v === true)}
            />
            {t('allowBroadcasts')}
          </label>
          {servers.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeCustom}
                onCheckedChange={(v) => setIncludeCustom(v === true)}
              />
              {t('includeCustom')}
            </label>
          )}
        </div>

        <div className="relative">
          <pre className="border-border bg-muted/40 max-h-80 overflow-auto rounded-md border p-3 font-mono text-xs">
            {config}
          </pre>
          <Button
            variant="outline"
            size="sm"
            onClick={copy}
            className="absolute top-2 right-2"
          >
            <Copy className="size-4" />
            {t('copyConfig')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
