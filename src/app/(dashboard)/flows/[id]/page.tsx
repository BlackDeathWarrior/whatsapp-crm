"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { isFlowsEnabled } from "@/lib/flows/feature-flag";
import { FlowBuilder } from "@/components/flows/flow-builder";
import type { FlowRow, FlowNodeRow } from "@/lib/flows/types";

/**
 * Flow editor shell.
 *
 * Loads `{flow, nodes}` from `/api/flows/[id]` and hands it to
 * `<FlowBuilder>`. Owns the loading/error state so the builder can
 * focus purely on editing.
 *
 * Beta gate: client-side bounce for the snappy redirect, server-side
 * 404 on the API as the real security boundary.
 */
export default function FlowEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { profile, loading: authLoading } = useAuth();

  const [flow, setFlow] = useState<FlowRow | null>(null);
  const [nodes, setNodes] = useState<FlowNodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const allowed = isFlowsEnabled(profile);

  useEffect(() => {
    if (authLoading) return;
    if (!allowed) {
      router.replace("/dashboard");
      return;
    }
    if (!params.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/flows/${params.id}`);
        if (res.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const json = (await res.json()) as {
          flow: FlowRow;
          nodes: FlowNodeRow[];
        };
        if (!cancelled) {
          setFlow(json.flow);
          setNodes(json.nodes ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error("Couldn't load flow.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, authLoading, params.id, router]);

  if (authLoading || (allowed && loading)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }
  if (notFound || !flow) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-slate-400">Flow not found.</p>
        <button
          type="button"
          onClick={() => router.push("/flows")}
          className="text-sm text-violet-400 hover:text-violet-300"
        >
          ← Back to flows
        </button>
      </div>
    );
  }

  return <FlowBuilder initialFlow={flow} initialNodes={nodes} />;
}
