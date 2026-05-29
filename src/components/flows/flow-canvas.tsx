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

import { useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Node as RfNode,
  type Edge as RfEdge,
  type NodeProps,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { deriveCanvasEdges } from "@/lib/flows/edges";
import { autoLayout, shouldAutoLayout } from "@/lib/flows/layout";
import {
  NODE_META,
  summarizeNode,
  type BuilderNode,
} from "./shared";
import { useFlowEditor } from "./flow-editor-state";
import { NodeConfigForm } from "./forms/node-config-form";

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

export function FlowCanvas() {
  const {
    state,
    setState,
    updateNodeConfig,
    updateNodePosition,
    removeNode,
  } = useFlowEditor();
  const builderNodes = state.nodes;
  const entryNodeId = state.entry_node_id;

  // Side-panel state — which node's form is open. Canvas-only UI; the
  // list view's analogue is the per-card expanded set in
  // flow-builder.tsx.
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const selectedNode = useMemo(
    () =>
      selectedNodeKey
        ? builderNodes.find((n) => n.node_key === selectedNodeKey) ?? null
        : null,
    [selectedNodeKey, builderNodes],
  );

  const { rfNodes, rfEdges } = useMemo(() => {
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
          isEntry: n.node_key === entryNodeId,
        },
        // Drag-to-connect + delete-key still off in PR 2a — those land
        // in PR 2b with per-slot handles + cascading edge cleanup.
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
  }, [builderNodes, entryNodeId]);

  // Drag-to-position: React-Flow tracks the visual drag internally and
  // fires this once on release. We write the final coordinate back to
  // the editor context (which flips `dirty`); save then ships the new
  // positions in the existing PUT /api/flows/[id] body (the route
  // already destructures position_x / position_y per migration 010).
  // Writing only on dragStop (not on every position-change tick during
  // the drag) keeps state updates cheap on long drags.
  const handleNodeDragStop = useCallback<OnNodeDrag<RfNode<NodeData>>>(
    (_event, node) => {
      updateNodePosition(node.id, node.position.x, node.position.y);
    },
    [updateNodePosition],
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: RfNode<NodeData>) => {
      setSelectedNodeKey(node.id);
    },
    [],
  );

  // Wrapped mutators that target the currently-selected node — pass to
  // the form so each keystroke goes through the editor context (which
  // flips `dirty` and feeds the validator).
  const onSelectedUpdateConfig = useCallback(
    (patch: Record<string, unknown>) => {
      if (selectedNodeKey) updateNodeConfig(selectedNodeKey, patch);
    },
    [selectedNodeKey, updateNodeConfig],
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selectedNodeKey) return;
    removeNode(selectedNodeKey);
    setSelectedNodeKey(null);
  }, [selectedNodeKey, removeNode]);

  const handleSetEntry = useCallback(() => {
    if (!selectedNodeKey) return;
    setState((s) => ({ ...s, entry_node_id: selectedNodeKey }));
  }, [selectedNodeKey, setState]);

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
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={handleNodeClick}
          // Drag-to-connect + delete-by-keyboard still off — both land
          // in PR 2b with per-slot handles + cascading edge cleanup.
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

      <NodeEditSheet
        node={selectedNode}
        isEntry={selectedNode?.node_key === entryNodeId}
        allNodes={builderNodes}
        onClose={() => setSelectedNodeKey(null)}
        onUpdateConfig={onSelectedUpdateConfig}
        onDelete={handleDeleteSelected}
        onSetEntry={handleSetEntry}
      />
    </ReactFlowProvider>
  );
}

// ============================================================
// Side panel — opens when a canvas node is clicked. Mounts the
// shared NodeConfigForm dispatcher so edits made here behave
// identically to the list view's per-card editor.
// ============================================================

function NodeEditSheet({
  node,
  isEntry,
  allNodes,
  onClose,
  onUpdateConfig,
  onDelete,
  onSetEntry,
}: {
  node: BuilderNode | null;
  isEntry: boolean;
  allNodes: BuilderNode[];
  onClose: () => void;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onSetEntry: () => void;
}) {
  // Sheet is controlled — opens when a node is selected, closes via
  // Esc / overlay / close button (all delegated to onClose).
  const open = node !== null;
  if (!node) {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-md" />
      </Sheet>
    );
  }
  const meta = NODE_META[node.node_type];
  const Icon = meta.icon;
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-slate-800 bg-slate-950 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-slate-800 px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-slate-100">
            <Icon className={cn("h-4 w-4 shrink-0", meta.color)} />
            <span>{meta.label}</span>
            {isEntry && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                Entry
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="font-mono text-[11px] text-slate-400">
            {node.node_key}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <NodeConfigForm
            node={node}
            allNodes={allNodes}
            showAdvanced={false}
            onUpdateConfig={onUpdateConfig}
          />
        </div>

        <SheetFooter className="border-t border-slate-800 px-5 py-3 sm:flex-row sm:justify-between">
          {!isEntry ? (
            <Button variant="ghost" size="sm" onClick={onSetEntry}>
              Set as entry
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete node
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
