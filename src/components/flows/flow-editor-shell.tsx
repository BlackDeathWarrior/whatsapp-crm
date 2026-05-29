"use client";

/**
 * View-switcher for the flow editor.
 *
 * Renders a small Canvas / List pill above whichever view is active,
 * and conditionally mounts `<FlowCanvas>` or `<FlowBuilder>`. Why a
 * separate component:
 *   - The page itself stays trivially small (loading + error + this).
 *   - Either view can stay unaware of the other — they share data
 *     (`{flow, nodes}`) and nothing else.
 *
 * View choice persists per-browser via localStorage so a power user
 * who prefers the list isn't fighting the default on every load.
 * Canvas is the default for everyone else — the original user
 * feedback was that the list shape made flows "hard to understand".
 */

import { useState } from "react";
import { LayoutGrid, ListTree } from "lucide-react";

import { FlowBuilder } from "./flow-builder";
import { FlowCanvas } from "./flow-canvas";
import { FlowEditorProvider } from "./flow-editor-state";
import { cn } from "@/lib/utils";
import type { FlowRow, FlowNodeRow } from "@/lib/flows/types";

type View = "canvas" | "list";

const STORAGE_KEY = "wacrm.flowEditor.view";

interface Props {
  initialFlow: FlowRow;
  initialNodes: FlowNodeRow[];
}

export function FlowEditorShell({ initialFlow, initialNodes }: Props) {
  // Read the persisted choice in the useState initializer. Safe even
  // though this is a client component because the parent page only
  // mounts us AFTER a client-side fetch resolves — there's no SSR
  // pass for this subtree, so no hydration mismatch to worry about.
  // Default to `canvas` (the new default) when nothing is saved.
  const [view, setView] = useState<View>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "canvas" || saved === "list") return saved;
    } catch {
      // Private browsing / disabled storage — fall through to default.
    }
    return "canvas";
  });

  const choose = (next: View) => {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  return (
    <FlowEditorProvider initialFlow={initialFlow} initialNodes={initialNodes}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end">
          <div
            role="group"
            aria-label="Editor view"
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 p-0.5 text-xs"
          >
            <ToggleButton
              active={view === "canvas"}
              onClick={() => choose("canvas")}
              icon={<LayoutGrid className="h-3 w-3" />}
              label="Canvas"
            />
            <ToggleButton
              active={view === "list"}
              onClick={() => choose("list")}
              icon={<ListTree className="h-3 w-3" />}
              label="List"
            />
          </div>
        </div>

        {view === "canvas" ? <FlowCanvas /> : <FlowBuilder />}
      </div>
    </FlowEditorProvider>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-1 transition-colors",
        active
          ? "bg-slate-700 text-slate-100"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
