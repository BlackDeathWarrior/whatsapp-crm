/**
 * Derive canvas edges from the flow's node list.
 *
 * Edges live INSIDE each node's `config` JSONB (each button row /
 * list row / condition branch carries its own `next_node_key`). The
 * canvas needs them as a separate `{ source, target, label,
 * sourceHandle }` list to render arrows, and the labels need to be
 * meaningful — a `send_buttons` node with three buttons isn't useful
 * on the canvas if the three outgoing arrows are unlabeled.
 *
 * Why this lives in lib/flows (not next to flow-canvas.tsx): the
 * derivation is pure data manipulation with no React-Flow types in
 * it, which makes it (a) trivially unit-testable and (b) reusable by
 * the editable canvas (PR 2) without dragging in client-only deps.
 *
 * `sourceHandle` ids are stable strings the canvas wires up to its
 * per-node renderer's outgoing connection points. They match the
 * scheme PR 2's drag-to-connect handler will read:
 *   - `next`            for single-outgoing nodes
 *   - `button:<reply_id>` for send_buttons rows
 *   - `row:<reply_id>`    for send_list rows
 *   - `true` / `false`    for condition branches
 */

import type { BuilderNode } from "@/components/flows/shared";

export interface CanvasEdge {
  /** Stable per-edge id — required by React-Flow. */
  id: string;
  /** node_key of the source node. */
  source: string;
  /** node_key of the target node. */
  target: string;
  /** Identifies which outgoing slot on the source node this edge belongs to. */
  sourceHandle: string;
  /** Human-readable label rendered on the canvas (e.g. "Yes button"). */
  label?: string;
}

export function deriveCanvasEdges(nodes: BuilderNode[]): CanvasEdge[] {
  const knownKeys = new Set(nodes.map((n) => n.node_key));
  const edges: CanvasEdge[] = [];

  for (const node of nodes) {
    const cfg = node.config;
    switch (node.node_type) {
      case "start":
      case "send_message":
      case "send_media":
      case "collect_input":
      case "set_tag": {
        const next = (cfg as { next_node_key?: string }).next_node_key;
        if (next && knownKeys.has(next)) {
          edges.push({
            id: `${node.node_key}--next--${next}`,
            source: node.node_key,
            target: next,
            sourceHandle: "next",
          });
        }
        break;
      }

      case "condition": {
        const trueNext = (cfg as { true_next?: string }).true_next;
        const falseNext = (cfg as { false_next?: string }).false_next;
        if (trueNext && knownKeys.has(trueNext)) {
          edges.push({
            id: `${node.node_key}--true--${trueNext}`,
            source: node.node_key,
            target: trueNext,
            sourceHandle: "true",
            label: "true",
          });
        }
        if (falseNext && knownKeys.has(falseNext)) {
          edges.push({
            id: `${node.node_key}--false--${falseNext}`,
            source: node.node_key,
            target: falseNext,
            sourceHandle: "false",
            label: "false",
          });
        }
        break;
      }

      case "send_buttons": {
        const buttons = Array.isArray(
          (cfg as { buttons?: unknown }).buttons,
        )
          ? ((cfg as { buttons: Array<Record<string, unknown>> }).buttons)
          : [];
        for (const btn of buttons) {
          const replyId =
            typeof btn.reply_id === "string" ? btn.reply_id : null;
          const next =
            typeof btn.next_node_key === "string" ? btn.next_node_key : null;
          const title = typeof btn.title === "string" ? btn.title : null;
          if (!replyId || !next || !knownKeys.has(next)) continue;
          edges.push({
            id: `${node.node_key}--button:${replyId}--${next}`,
            source: node.node_key,
            target: next,
            sourceHandle: `button:${replyId}`,
            label: title ?? replyId,
          });
        }
        break;
      }

      case "send_list": {
        const sections = Array.isArray(
          (cfg as { sections?: unknown }).sections,
        )
          ? ((cfg as { sections: Array<Record<string, unknown>> }).sections)
          : [];
        for (const section of sections) {
          const rows = Array.isArray(section.rows)
            ? (section.rows as Array<Record<string, unknown>>)
            : [];
          for (const row of rows) {
            const replyId =
              typeof row.reply_id === "string" ? row.reply_id : null;
            const next =
              typeof row.next_node_key === "string" ? row.next_node_key : null;
            const title = typeof row.title === "string" ? row.title : null;
            if (!replyId || !next || !knownKeys.has(next)) continue;
            edges.push({
              id: `${node.node_key}--row:${replyId}--${next}`,
              source: node.node_key,
              target: next,
              sourceHandle: `row:${replyId}`,
              label: title ?? replyId,
            });
          }
        }
        break;
      }

      case "handoff":
      case "end":
        // Terminal nodes — no outgoing edges.
        break;
    }
  }

  return edges;
}
