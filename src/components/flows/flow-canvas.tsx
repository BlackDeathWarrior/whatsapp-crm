"use client";

/**
 * Read-only canvas / mind-map view of a flow.
 *
 * What it does:
 *   - Renders every flow_node as a draggable-looking tile (drag is
 *     visually plausible but doesn't persist in PR 1 — editing comes
 *     in PR 2). Pan and zoom work normally.
 *   - Renders edges between nodes, labeled per slot (button title,
 *     "true" / "false", list row title) so a branching flow reads as
 *     a real decision tree.
 *   - Runs dagre auto-layout once on mount for flows whose
 *     `position_x` / `position_y` are all zero — without this, every
 *     existing flow would render as a pile of overlapping tiles at
 *     the origin.
 *
 * What it intentionally doesn't do (PR 2 territory):
 *   - Persist drag positions to the DB
 *   - Open a side panel on click for node editing
 *   - Drag-to-connect / add / delete nodes
 *
 * The toggle in `view-toggle.tsx` swaps this in for `<FlowBuilder>`
 * on the same page, so both views render against the same data shape
 * (`FlowNodeRow[]` from `/api/flows/[id]`) — that's the only contract
 * that has to stay stable across views.
 */

import { useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Node as RfNode,
  type Edge as RfEdge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { cn } from "@/lib/utils";
import { deriveCanvasEdges } from "@/lib/flows/edges";
import { autoLayout, shouldAutoLayout } from "@/lib/flows/layout";
import {
  NODE_META,
  summarizeNode,
  type BuilderNode,
  type NodeType,
} from "./shared";
import type { FlowNodeRow, FlowRow } from "@/lib/flows/types";

interface FlowCanvasProps {
  initialFlow: FlowRow;
  initialNodes: FlowNodeRow[];
}

// React-Flow node `data` payload — the bits our custom renderer needs.
interface NodeData extends Record<string, unknown> {
  node: BuilderNode;
  isEntry: boolean;
}

const NODE_WIDTH = 240;
// Best-effort default; actual height varies by summary length but
// dagre needs SOMETHING to compute rank spacing. Underestimating is
// safer than over (tighter layout that still doesn't overlap).
const NODE_HEIGHT = 90;

// ============================================================
// Custom node — one card per flow node, styled to match the list
// view's collapsed card so the two views feel like the same product.
// ============================================================

function FlowNodeCard({ data, selected }: NodeProps) {
  const { node, isEntry } = data as NodeData;
  const meta = NODE_META[node.node_type];
  const summary = summarizeNode(node);
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        "min-w-[220px] max-w-[260px] rounded-lg border bg-slate-900/95 px-3 py-2 text-left shadow-lg backdrop-blur transition-colors",
        selected
          ? "border-primary ring-1 ring-primary/40"
          : "border-slate-700 hover:border-slate-600",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.color)} />
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {meta.label}
        </span>
        {isEntry && (
          <span className="ml-auto rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
            Entry
          </span>
        )}
      </div>
      <div className="mt-1 truncate font-mono text-[11px] text-slate-300">
        {node.node_key}
      </div>
      {summary && (
        <div className="mt-1 line-clamp-2 text-xs text-slate-400">
          {summary}
        </div>
      )}
    </div>
  );
}

const NODE_TYPES = { flow: FlowNodeCard };

// ============================================================
// Root canvas
// ============================================================

export function FlowCanvas({ initialFlow, initialNodes }: FlowCanvasProps) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const builderNodes: BuilderNode[] = initialNodes.map((n) => ({
      node_key: n.node_key,
      node_type: n.node_type as NodeType,
      config: n.config as Record<string, unknown>,
      position_x: n.position_x,
      position_y: n.position_y,
    }));

    const canvasEdges = deriveCanvasEdges(builderNodes);

    // Decide whether to auto-layout. The helper guards against
    // overwriting a user's manual arrangement (only fires when ALL
    // nodes sit at the origin), so we can safely call it
    // unconditionally — if any node has been positioned, this is a
    // no-op.
    const positions = shouldAutoLayout(builderNodes)
      ? autoLayout(
          builderNodes.map((n) => ({
            id: n.node_key,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          })),
          canvasEdges.map((e) => ({ source: e.source, target: e.target })),
          { direction: "TB" },
        )
      : null;

    const rfNodes: RfNode<NodeData>[] = builderNodes.map((n) => {
      const fallback = positions?.get(n.node_key);
      return {
        id: n.node_key,
        type: "flow",
        position: {
          x: fallback?.x ?? n.position_x ?? 0,
          y: fallback?.y ?? n.position_y ?? 0,
        },
        data: {
          node: n,
          isEntry: n.node_key === initialFlow.entry_node_id,
        },
        // Read-only in PR 1 — block all editing affordances. Drag is
        // still allowed visually because disabling it makes the canvas
        // feel inert in a way that's worse than letting users nudge a
        // tile that won't save.
        connectable: false,
        deletable: false,
      };
    });

    // Strip sourceHandle from PR 1's edges — the custom node card
    // doesn't expose per-slot handles yet (PR 2 wires those up), and
    // React-Flow drops edges whose sourceHandle id doesn't resolve.
    // Label still rides along so a branch reads as e.g. "Yes button".
    const rfEdges: RfEdge[] = canvasEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      labelStyle: { fill: "#cbd5e1", fontSize: 11 },
      labelBgStyle: { fill: "#0f172a" },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      style: { stroke: "#475569", strokeWidth: 1.5 },
    }));

    return { rfNodes, rfEdges };
  }, [initialFlow.entry_node_id, initialNodes]);

  if (rfNodes.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950 text-sm text-slate-500">
        No nodes yet. Switch to List view to add your first node.
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-[70vh] w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          // Read-only knobs — keeps PR 1's surface inert at the
          // React-Flow level. PR 2 will flip these back on.
          nodesConnectable={false}
          edgesFocusable={false}
          elementsSelectable={true}
          // Lower default min/max zoom than the lib's defaults; the
          // tiles already truncate their summary at a reasonable
          // size, so we don't need to zoom past 1.5x.
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background gap={24} size={1} color="#1e293b" />
          <Controls
            className="!border-slate-700 !bg-slate-900 [&_button]:!border-slate-700 [&_button]:!bg-slate-900 [&_button:hover]:!bg-slate-800"
            showInteractive={false}
          />
          <MiniMap
            pannable
            zoomable
            nodeColor="#334155"
            maskColor="rgba(15, 23, 42, 0.7)"
            className="!border !border-slate-700 !bg-slate-900"
          />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}
