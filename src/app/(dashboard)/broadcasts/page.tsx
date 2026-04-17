'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Radio, Plus, Loader2 } from 'lucide-react';
import { getBroadcastStatus } from '@/lib/broadcast-status';

export default function BroadcastsPage() {
  const router = useRouter();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBroadcasts() {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from('broadcasts')
          .select('*')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setBroadcasts(data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load broadcasts');
      } finally {
        setLoading(false);
      }
    }

    fetchBroadcasts();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Broadcasts</h1>
          <p className="mt-1 text-sm text-slate-400">
            Send bulk messages to your contacts using approved templates.
          </p>
        </div>
        <Button
          onClick={() => router.push('/broadcasts/new')}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          New Broadcast
        </Button>
      </div>

      {broadcasts.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900">
          <Radio className="mb-3 h-10 w-10 text-slate-600" />
          <p className="text-sm font-medium text-white">No broadcasts yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Create your first broadcast to reach your contacts at scale.
          </p>
          <Button
            onClick={() => router.push('/broadcasts/new')}
            className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            New Broadcast
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400">Name</TableHead>
                <TableHead className="text-slate-400">Template</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
                <TableHead className="text-slate-400 text-right">Recipients</TableHead>
                <TableHead className="text-slate-400 text-right">Sent</TableHead>
                <TableHead className="text-slate-400 text-right">Delivered</TableHead>
                <TableHead className="text-slate-400 text-right">Read</TableHead>
                <TableHead className="text-slate-400 text-right">Failed</TableHead>
                <TableHead className="text-slate-400">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((broadcast) => {
                const status = getBroadcastStatus(broadcast.status);
                return (
                  <TableRow
                    key={broadcast.id}
                    className="cursor-pointer border-slate-800 hover:bg-slate-800/50"
                    onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                  >
                    <TableCell className="font-medium text-white">
                      {broadcast.name}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {broadcast.template_name}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${status.classes}`}
                      >
                        {status.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      {broadcast.total_recipients}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      {broadcast.sent_count}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      {broadcast.delivered_count}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      {broadcast.read_count}
                    </TableCell>
                    <TableCell className="text-right text-slate-300">
                      {broadcast.failed_count}
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {new Date(broadcast.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
