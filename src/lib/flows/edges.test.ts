import { describe, it, expect } from "vitest";
import { deriveCanvasEdges } from "./edges";
import type { BuilderNode } from "@/components/flows/shared";

function nodes(...ns: BuilderNode[]): BuilderNode[] {
  return ns;
}

describe("deriveCanvasEdges — single-outgoing node types", () => {
  it("derives a `next` edge from send_message", () => {
    const edges = deriveCanvasEdges(
      nodes(
        {
          node_key: "a",
          node_type: "send_message",
          config: { text: "hi", next_node_key: "b" },
        },
        { node_key: "b", node_type: "end", config: {} },
      ),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "a",
      target: "b",
      sourceHandle: "next",
    });
  });

  it("derives a `next` edge from send_media, set_tag, collect_input, start", () => {
    const edges = deriveCanvasEdges(
      nodes(
        { node_key: "s", node_type: "start", config: { next_node_key: "m" } },
        {
          node_key: "m",
          node_type: "send_media",
          config: {
            media_type: "image",
            media_url: "https://x/y.png",
            next_node_key: "t",
          },
        },
        {
          node_key: "t",
          node_type: "set_tag",
          config: { mode: "add", tag_id: "u", next_node_key: "ci" },
        },
        {
          node_key: "ci",
          node_type: "collect_input",
          config: {
            prompt_text: "p",
            var_key: "v",
            next_node_key: "e",
          },
        },
        { node_key: "e", node_type: "end", config: {} },
      ),
    );
    expect(edges).toHaveLength(4);
    expect(edges.map((e) => `${e.source}->${e.target}`)).toEqual([
      "s->m",
      "m->t",
      "t->ci",
      "ci->e",
    ]);
  });

  it("skips dangling edges (next_node_key pointing nowhere)", () => {
    const edges = deriveCanvasEdges(
      nodes({
        node_key: "a",
        node_type: "send_message",
        config: { text: "hi", next_node_key: "ghost" },
      }),
    );
    expect(edges).toEqual([]);
  });

  it("skips empty next_node_key (fresh node)", () => {
    const edges = deriveCanvasEdges(
      nodes({
        node_key: "a",
        node_type: "send_message",
        config: { text: "hi", next_node_key: "" },
      }),
    );
    expect(edges).toEqual([]);
  });
});

describe("deriveCanvasEdges — condition (true/false branches)", () => {
  it("produces a labeled edge for each branch", () => {
    const edges = deriveCanvasEdges(
      nodes(
        {
          node_key: "c",
          node_type: "condition",
          config: {
            subject: "var",
            subject_key: "x",
            operator: "equals",
            value: "y",
            true_next: "t",
            false_next: "f",
          },
        },
        { node_key: "t", node_type: "end", config: {} },
        { node_key: "f", node_type: "end", config: {} },
      ),
    );
    expect(edges).toHaveLength(2);
    expect(edges.find((e) => e.sourceHandle === "true")).toMatchObject({
      target: "t",
      label: "true",
    });
    expect(edges.find((e) => e.sourceHandle === "false")).toMatchObject({
      target: "f",
      label: "false",
    });
  });

  it("emits whichever branches are set when one points nowhere", () => {
    const edges = deriveCanvasEdges(
      nodes(
        {
          node_key: "c",
          node_type: "condition",
          config: {
            subject: "var",
            subject_key: "x",
            operator: "present",
            true_next: "t",
            false_next: "",
          },
        },
        { node_key: "t", node_type: "end", config: {} },
      ),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceHandle).toBe("true");
  });
});

describe("deriveCanvasEdges — send_buttons (per-button)", () => {
  it("emits one edge per button, labeled with the button title", () => {
    const edges = deriveCanvasEdges(
      nodes(
        {
          node_key: "menu",
          node_type: "send_buttons",
          config: {
            text: "Pick",
            buttons: [
              { reply_id: "yes", title: "Yes", next_node_key: "ok" },
              { reply_id: "no", title: "No", next_node_key: "bye" },
            ],
          },
        },
        { node_key: "ok", node_type: "handoff", config: {} },
        { node_key: "bye", node_type: "end", config: {} },
      ),
    );
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({
      source: "menu",
      target: "ok",
      sourceHandle: "button:yes",
      label: "Yes",
    });
    expect(edges[1]).toMatchObject({
      source: "menu",
      target: "bye",
      sourceHandle: "button:no",
      label: "No",
    });
  });

  it("falls back to reply_id when title is missing", () => {
    const edges = deriveCanvasEdges(
      nodes(
        {
          node_key: "m",
          node_type: "send_buttons",
          config: {
            text: "x",
            buttons: [{ reply_id: "raw", next_node_key: "e" }],
          },
        },
        { node_key: "e", node_type: "end", config: {} },
      ),
    );
    expect(edges[0].label).toBe("raw");
  });

  it("skips buttons whose target doesn't exist", () => {
    const edges = deriveCanvasEdges(
      nodes(
        {
          node_key: "m",
          node_type: "send_buttons",
          config: {
            text: "x",
            buttons: [
              { reply_id: "good", title: "G", next_node_key: "real" },
              { reply_id: "bad", title: "B", next_node_key: "ghost" },
            ],
          },
        },
        { node_key: "real", node_type: "end", config: {} },
      ),
    );
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceHandle).toBe("button:good");
  });
});

describe("deriveCanvasEdges — send_list (per-row across sections)", () => {
  it("emits one edge per row, with `row:<reply_id>` handles", () => {
    const edges = deriveCanvasEdges(
      nodes(
        {
          node_key: "list",
          node_type: "send_list",
          config: {
            text: "Pick",
            button_label: "View",
            sections: [
              {
                title: "Recent",
                rows: [
                  { reply_id: "o1", title: "Order 1", next_node_key: "a" },
                ],
              },
              {
                title: "Older",
                rows: [
                  { reply_id: "o2", title: "Order 2", next_node_key: "b" },
                ],
              },
            ],
          },
        },
        { node_key: "a", node_type: "handoff", config: {} },
        { node_key: "b", node_type: "handoff", config: {} },
      ),
    );
    expect(edges).toHaveLength(2);
    expect(edges[0].sourceHandle).toBe("row:o1");
    expect(edges[0].label).toBe("Order 1");
    expect(edges[1].sourceHandle).toBe("row:o2");
  });
});

describe("deriveCanvasEdges — terminal nodes", () => {
  it("emits no outgoing edges from handoff / end", () => {
    const edges = deriveCanvasEdges(
      nodes(
        { node_key: "h", node_type: "handoff", config: { note: "x" } },
        { node_key: "e", node_type: "end", config: {} },
      ),
    );
    expect(edges).toEqual([]);
  });
});

describe("deriveCanvasEdges — id stability", () => {
  it("produces unique, deterministic ids per (source, slot, target)", () => {
    const edges = deriveCanvasEdges(
      nodes(
        {
          node_key: "m",
          node_type: "send_buttons",
          config: {
            text: "x",
            buttons: [
              { reply_id: "a", title: "A", next_node_key: "x" },
              { reply_id: "b", title: "B", next_node_key: "x" },
            ],
          },
        },
        { node_key: "x", node_type: "end", config: {} },
      ),
    );
    const ids = edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
