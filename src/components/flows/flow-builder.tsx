"use client";

/**
 * Linear-list flow editor.
 *
 * The whole flow (header, trigger config, node list, validation panel)
 * is owned by this single component. State lives client-side as a
 * single `BuilderState` object; `Save` PUTs the whole structure to
 * `/api/flows/[id]`; `Activate` hits `/api/flows/[id]/activate`.
 *
 * Why one big file: keeps the diff between fields + the form code
 * obvious, matches the existing `automation-builder.tsx` shape, and
 * sidesteps over-componentization for a UI that will be replaced by a
 * react-flow canvas in v2 anyway. The node-config sub-forms live in
 * the same file as small components rather than separate modules.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CircleCheck,
  CircleAlert,
  History,
  Loader2,
  Plus,
  Save,
  Trash2,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  PauseCircle,
  PlayCircle,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type ValidationIssue } from "@/lib/flows/validate";
import {
  NODE_META,
  slugify,
  summarizeNode,
  type BuilderNode,
  type NodeType,
} from "./shared";
import { NodeConfigForm } from "./forms/node-config-form";
import { NodeKeySelect } from "./forms/fields";
import {
  useFlowEditor,
  type BuilderState,
} from "./flow-editor-state";

// ============================================================
// Local state shape — mirrors the DB but the configs are typed
// loosely (Record<string, unknown>) since each node_type carries a
// different shape. The sub-form components narrow as needed.
// ============================================================

// ============================================================
// Root component
// ============================================================

export function FlowBuilder() {
  const router = useRouter();
  const {
    flow,
    state,
    setState,
    dirty,
    saving,
    activating,
    issues,
    canActivate,
    addNode: addNodeCtx,
    updateNode,
    updateNodeConfig,
    removeNode: removeNodeCtx,
    save: handleSave,
    setStatus: handleStatus,
    deleteFlow: handleDelete,
  } = useFlowEditor();

  // List-only UI state: which cards are expanded, scroll refs for
  // jump-to-node, and the brief border flash that lands the eye on a
  // jumped-to node. Canvas-view has its own analogue (selected-node
  // + side-sheet open).
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(state.nodes.map((n) => n.node_key)),
  );
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [flashedKey, setFlashedKey] = useState<string | null>(null);

  // Wrap addNode so the new node opens expanded in the list view
  // (matches the previous behaviour where adding always revealed the
  // new card so the user could start editing immediately).
  const addNode = useCallback(
    (type: NodeType) => {
      const key = addNodeCtx(type);
      setExpanded((prev) => new Set([...prev, key]));
    },
    [addNodeCtx],
  );

  const removeNode = useCallback(
    (key: string) => {
      removeNodeCtx(key);
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    },
    [removeNodeCtx],
  );

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Jump-to-node: invoked when a user clicks an issue in the validation
  // panel. Expand the offending card (so the broken field is visible),
  // scroll it into the viewport, then flash its border so the eye lands
  // on it. requestAnimationFrame defers the scroll until after React
  // commits the expanded layout.
  const jumpToNode = useCallback((key: string) => {
    setExpanded((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setFlashedKey(key);
    requestAnimationFrame(() => {
      const el = nodeRefs.current.get(key);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    window.setTimeout(() => {
      setFlashedKey((cur) => (cur === key ? null : cur));
    }, 1600);
  }, []);

  const setNodeRef = useCallback(
    (key: string) => (el: HTMLDivElement | null) => {
      if (el) nodeRefs.current.set(key, el);
      else nodeRefs.current.delete(key);
    },
    [],
  );

  // ---- Render ----
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-6 p-6">
      <Header
        state={state}
        setState={setState}
        dirty={dirty}
        saving={saving}
        activating={activating}
        onSave={handleSave}
        onStatus={handleStatus}
        onDelete={handleDelete}
        canActivate={canActivate}
        onBack={() => router.push("/flows")}
        onViewRuns={() => router.push(`/flows/${flow.id}/runs`)}
      />

      <TriggerPanel
        state={state}
        setState={setState}
        triggerIssues={issues.filter((i) => i.scope === "trigger")}
      />

      <EntryPicker state={state} setState={setState} />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Nodes ({state.nodes.length})
          </h2>
          <AddNodeButton onAdd={addNode} />
        </div>

        {state.nodes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
            Add a <strong>Start</strong> node, then a <strong>Send buttons</strong>
            {" "}node, then a <strong>Handoff</strong> — that&apos;s the welcome-menu
            shape from the brief.
          </div>
        ) : (
          state.nodes.map((node) => (
            <NodeCard
              key={node.node_key}
              node={node}
              allNodes={state.nodes}
              expanded={expanded.has(node.node_key)}
              isEntry={state.entry_node_id === node.node_key}
              isFlashed={flashedKey === node.node_key}
              cardRef={setNodeRef(node.node_key)}
              issues={issues.filter(
                (i) => i.scope === "node" && i.node_key === node.node_key,
              )}
              onToggle={() => toggleExpanded(node.node_key)}
              onUpdate={(patch) => updateNode(node.node_key, patch)}
              onUpdateConfig={(patch) => updateNodeConfig(node.node_key, patch)}
              onRemove={() => removeNode(node.node_key)}
              onSetEntry={() =>
                setState((s) => ({ ...s, entry_node_id: node.node_key }))
              }
            />
          ))
        )}
      </section>

      {/* Sticky-bottom so the activate-readiness status follows the
          user as they scroll through nodes. The parent <main> in the
          dashboard shell is the scroll container; this stays pinned
          to the viewport bottom (with a 1rem gap) until the page
          naturally ends, at which point it falls back into flow. */}
      <div className="sticky bottom-4 z-10 shadow-xl shadow-slate-950/60">
        <ValidationPanel issues={issues} onJump={jumpToNode} />
      </div>
    </div>
  );
}

// ============================================================
// Header
// ============================================================

function Header({
  state,
  setState,
  dirty,
  saving,
  activating,
  onSave,
  onStatus,
  onDelete,
  canActivate,
  onBack,
  onViewRuns,
}: {
  state: BuilderState;
  setState: React.Dispatch<React.SetStateAction<BuilderState>>;
  dirty: boolean;
  saving: boolean;
  activating: boolean;
  onSave: () => void;
  onStatus: (s: BuilderState["status"]) => void;
  onDelete: () => void;
  canActivate: boolean;
  onBack: () => void;
  onViewRuns: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 hover:text-slate-300"
        >
          <ArrowLeft className="h-3 w-3" />
          Flows
        </button>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Workflow className="h-5 w-5 shrink-0 text-primary" />
          <Input
            value={state.name}
            onChange={(e) =>
              setState((s) => ({ ...s, name: e.target.value }))
            }
            placeholder="Flow name"
            className="max-w-md bg-slate-900 text-lg font-semibold"
          />
          <StatusBadge status={state.status} />
          {dirty && (
            <span
              className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-300"
              title="Unsaved changes — hit Save to persist"
              aria-live="polite"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Edited
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewRuns()}
          >
            <History className="h-3.5 w-3.5" />
            Runs
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          {state.status === "active" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatus("draft")}
              disabled={activating}
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PauseCircle className="h-3.5 w-3.5" />
              )}
              Pause
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatus("active")}
              disabled={activating || !canActivate}
              title={
                !canActivate
                  ? "Fix the issues below before activating"
                  : undefined
              }
            >
              {activating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              Activate
            </Button>
          )}
          <Button onClick={onSave} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </div>
      <Input
        value={state.description}
        onChange={(e) =>
          setState((s) => ({ ...s, description: e.target.value }))
        }
        placeholder="Optional description (internal — customers don't see this)"
        className="bg-slate-900 text-sm"
      />
    </div>
  );
}

function StatusBadge({ status }: { status: BuilderState["status"] }) {
  const cls = {
    draft: "border-slate-700 bg-slate-800 text-slate-300",
    active: "border-emerald-600/40 bg-emerald-500/10 text-emerald-300",
    archived: "border-slate-700 bg-slate-800/50 text-slate-500",
  }[status];
  return (
    <Badge variant="outline" className={cn("shrink-0", cls)}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

// ============================================================
// Trigger panel
// ============================================================

function TriggerPanel({
  state,
  setState,
  triggerIssues,
}: {
  state: BuilderState;
  setState: React.Dispatch<React.SetStateAction<BuilderState>>;
  triggerIssues: ValidationIssue[];
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 text-sm font-semibold text-white">Trigger</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-slate-400">When…</label>
          <Select
            value={state.trigger_type}
            onValueChange={(v) =>
              setState((s) => ({
                ...s,
                trigger_type: v as BuilderState["trigger_type"],
                trigger_config:
                  v === "keyword" ? { keywords: [] } : v === "manual" ? {} : {},
              }))
            }
          >
            <SelectTrigger className="bg-slate-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="keyword">
                A message contains a keyword
              </SelectItem>
              <SelectItem value="first_inbound_message">
                Customer&apos;s first ever inbound message
              </SelectItem>
              <SelectItem value="manual">
                Manual only (no auto-trigger)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {state.trigger_type === "keyword" && (
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Keywords (comma-separated)
            </label>
            <Input
              value={
                Array.isArray(state.trigger_config.keywords)
                  ? (state.trigger_config.keywords as string[]).join(", ")
                  : ""
              }
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  trigger_config: {
                    ...s.trigger_config,
                    keywords: e.target.value
                      .split(",")
                      .map((k) => k.trim())
                      .filter(Boolean),
                  },
                }))
              }
              placeholder="support, help, hi"
              className="bg-slate-800"
            />
          </div>
        )}
      </div>
      {triggerIssues.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          {triggerIssues.map((i, ix) => (
            <IssueLine key={ix} issue={i} />
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================
// Entry-node picker
// ============================================================

function EntryPicker({
  state,
  setState,
}: {
  state: BuilderState;
  setState: React.Dispatch<React.SetStateAction<BuilderState>>;
}) {
  if (state.nodes.length === 0) return null;
  return (
    <section className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
      <CornerDownRight className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-xs text-slate-400">Entry node:</span>
      <NodeKeySelect
        value={state.entry_node_id}
        nodes={state.nodes}
        onChange={(key) =>
          setState((s) => ({ ...s, entry_node_id: key }))
        }
        placeholder="Pick the first node…"
        className="flex-1 max-w-xs"
      />
    </section>
  );
}

// ============================================================
// Node card — collapsed summary + expanded config form
// ============================================================

function NodeCard({
  node,
  allNodes,
  expanded,
  isEntry,
  isFlashed,
  cardRef,
  issues,
  onToggle,
  onUpdate,
  onUpdateConfig,
  onRemove,
  onSetEntry,
}: {
  node: BuilderNode;
  allNodes: BuilderNode[];
  expanded: boolean;
  isEntry: boolean;
  isFlashed: boolean;
  cardRef: (el: HTMLDivElement | null) => void;
  issues: ValidationIssue[];
  onToggle: () => void;
  onUpdate: (patch: Partial<BuilderNode>) => void;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  onSetEntry: () => void;
}) {
  const meta = NODE_META[node.node_type];
  const hasError = issues.some((i) => i.severity === "error");
  const preview = summarizeNode(node);
  return (
    <div
      ref={cardRef}
      className={cn(
        "rounded-lg border bg-slate-900 transition-shadow duration-500",
        hasError
          ? "border-red-500/40"
          : isEntry
            ? "border-primary/50"
            : "border-slate-800",
        isFlashed &&
          "ring-2 ring-primary ring-offset-2 ring-offset-slate-950",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <meta.icon className={cn("h-4 w-4 shrink-0", meta.color)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-white">
              {meta.label}
            </span>
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              {node.node_key}
            </code>
            {isEntry && (
              <Badge
                variant="outline"
                className="border-primary/40 bg-primary/10 text-[10px] text-primary"
              >
                Entry
              </Badge>
            )}
          </div>
          {!expanded && preview && (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {preview}
            </p>
          )}
        </div>
        {hasError && (
          <CircleAlert className="h-3.5 w-3.5 shrink-0 text-red-400" />
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-slate-800 px-4 py-4">
          <NodeConfigWithAdvanced
            node={node}
            allNodes={allNodes}
            onUpdate={onUpdate}
            onUpdateConfig={onUpdateConfig}
          />
          <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
            <div className="flex items-center gap-2">
              {!isEntry && (
                <Button variant="ghost" size="sm" onClick={onSetEntry}>
                  Set as entry
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove node
            </Button>
          </div>
          {issues.length > 0 && (
            <div className="mt-3 flex flex-col gap-1 rounded-md bg-red-500/5 p-2">
              {issues.map((i, ix) => (
                <IssueLine key={ix} issue={i} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Per-node-type config form — wraps the extracted dispatcher with
// the list-view's "Show advanced" disclosure (which exposes the
// internal node_key for stable analytics, hidden by default).
// ============================================================

function NodeConfigWithAdvanced({
  node,
  allNodes,
  onUpdate,
  onUpdateConfig,
}: {
  node: BuilderNode;
  allNodes: BuilderNode[];
  onUpdate: (patch: Partial<BuilderNode>) => void;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hasReplyIds =
    node.node_type === "send_buttons" || node.node_type === "send_list";
  return (
    <div className="flex flex-col gap-3">
      <NodeConfigForm
        node={node}
        allNodes={allNodes}
        showAdvanced={showAdvanced}
        onUpdateConfig={onUpdateConfig}
      />
      <div className="border-t border-slate-800 pt-3">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
        >
          {showAdvanced ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {showAdvanced ? "Hide" : "Show"} advanced
        </button>
        {showAdvanced && (
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Node key (internal identifier — keep stable for analytics)
              </label>
              <Input
                value={node.node_key}
                onChange={(e) =>
                  onUpdate({ node_key: slugify(e.target.value, node.node_key) })
                }
                className="bg-slate-800 font-mono text-xs"
              />
            </div>
            {hasReplyIds && (
              <p className="text-[10px] text-slate-500">
                Reply IDs for each option are shown inline above. They&apos;re
                returned by WhatsApp when a customer taps; you usually don&apos;t
                need to touch them.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================
// Add-node menu
// ============================================================

function AddNodeButton({ onAdd }: { onAdd: (type: NodeType) => void }) {
  const types: NodeType[] = [
    "start",
    "send_buttons",
    "send_list",
    "send_message",
    "send_media",
    "collect_input",
    "condition",
    "set_tag",
    "handoff",
    "end",
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800"
        aria-label="Add node"
      >
        <Plus className="h-3.5 w-3.5" />
        Add node
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-slate-700 bg-slate-900">
        {types.map((t) => {
          const meta = NODE_META[t];
          return (
            <DropdownMenuItem key={t} onClick={() => onAdd(t)}>
              <meta.icon className={cn("h-3.5 w-3.5", meta.color)} />
              {meta.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================
// Validation panel — bottom of the editor
// ============================================================

function ValidationPanel({
  issues,
  onJump,
}: {
  issues: ValidationIssue[];
  onJump: (key: string) => void;
}) {
  if (issues.length === 0) {
    // Slate-950 base + emerald accents so the panel stays readable when
    // sticky-positioned over scrolled-behind node cards (a translucent
    // bg-emerald-500/10 would bleed through ugly).
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-slate-950 p-3 text-sm font-medium text-emerald-300">
        <CircleCheck className="h-4 w-4 shrink-0" />
        No issues. Ready to activate.
      </div>
    );
  }
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return (
    <div
      className={cn(
        "rounded-lg border bg-slate-950 p-3",
        errors.length > 0 ? "border-red-500/40" : "border-amber-500/40",
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
        {errors.length > 0 ? (
          <CircleAlert className="h-4 w-4 text-red-400" />
        ) : (
          <CircleAlert className="h-4 w-4 text-amber-400" />
        )}
        {errors.length} error{errors.length === 1 ? "" : "s"},{" "}
        {warnings.length} warning{warnings.length === 1 ? "" : "s"}
      </div>
      <div className="flex flex-col gap-1">
        {issues.map((i, ix) => (
          <IssueLine key={ix} issue={i} onJump={onJump} />
        ))}
      </div>
    </div>
  );
}

function IssueLine({
  issue,
  onJump,
}: {
  issue: ValidationIssue;
  onJump?: (key: string) => void;
}) {
  const tone =
    issue.severity === "error" ? "text-red-300" : "text-amber-300";
  const iconTone =
    issue.severity === "error" ? "text-red-400" : "text-amber-400";
  const body = (
    <>
      <CircleAlert className={cn("mt-0.5 h-3 w-3 shrink-0", iconTone)} />
      <span className="min-w-0 flex-1">
        {issue.node_key && (
          <code className="mr-1 rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-400">
            {issue.node_key}
          </code>
        )}
        {issue.message}
      </span>
    </>
  );

  // Only node-scoped issues can jump; trigger-scoped issues have no
  // destination (the trigger panel is already at the top of the page).
  if (issue.node_key && onJump) {
    return (
      <button
        type="button"
        onClick={() => onJump(issue.node_key!)}
        className={cn(
          "flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-slate-800/60",
          tone,
        )}
        aria-label={`Jump to node ${issue.node_key}`}
      >
        {body}
      </button>
    );
  }
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md px-2 py-1 text-xs",
        tone,
      )}
    >
      {body}
    </div>
  );
}
