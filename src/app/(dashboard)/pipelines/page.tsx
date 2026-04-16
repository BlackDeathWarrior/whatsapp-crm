"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Pipeline, PipelineStage } from "@/types";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { PipelineSettings } from "@/components/pipelines/pipeline-settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GitBranch,
  Plus,
  Settings,
  ChevronDown,
} from "lucide-react";

const DEFAULT_STAGES = [
  { name: "Lead", color: "#6366f1", position: 0 },
  { name: "Qualified", color: "#8b5cf6", position: 1 },
  { name: "Proposal", color: "#f97316", position: 2 },
  { name: "Negotiation", color: "#eab308", position: 3 },
  { name: "Won", color: "#22c55e", position: 4 },
];

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    loadPipelines();
  }, []);

  useEffect(() => {
    if (selectedPipelineId) {
      loadStages(selectedPipelineId);
    }
  }, [selectedPipelineId]);

  async function loadPipelines() {
    setLoading(true);
    const { data } = await supabase
      .from("pipelines")
      .select("*")
      .order("created_at");
    if (data && data.length > 0) {
      setPipelines(data);
      if (!selectedPipelineId || !data.find((p) => p.id === selectedPipelineId)) {
        setSelectedPipelineId(data[0].id);
      }
    } else {
      setPipelines([]);
      setSelectedPipelineId("");
    }
    setLoading(false);
  }

  async function loadStages(pipelineId: string) {
    const { data } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", pipelineId)
      .order("position");
    if (data) setStages(data);
  }

  async function handleCreatePipeline() {
    if (!newPipelineName.trim()) return;
    setCreating(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setCreating(false);
      return;
    }

    const { data: pipeline } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, name: newPipelineName.trim() })
      .select()
      .single();

    if (pipeline) {
      const stageInserts = DEFAULT_STAGES.map((s) => ({
        pipeline_id: pipeline.id,
        name: s.name,
        color: s.color,
        position: s.position,
      }));
      await supabase.from("pipeline_stages").insert(stageInserts);

      setNewPipelineName("");
      setNewPipelineOpen(false);
      setSelectedPipelineId(pipeline.id);
      await loadPipelines();
    }

    setCreating(false);
  }

  function handleRefresh() {
    loadPipelines();
    if (selectedPipelineId) {
      loadStages(selectedPipelineId);
    }
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-7 w-32 animate-pulse rounded bg-slate-800" />
            <div className="mt-2 h-4 w-48 animate-pulse rounded bg-slate-800" />
          </div>
          <div className="h-8 w-28 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-96 w-72 animate-pulse rounded-xl bg-slate-800/50"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pipelines</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your deals and sales pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedPipeline && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              className="text-slate-400 hover:text-white"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          <Button
            onClick={() => setNewPipelineOpen(true)}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            New Pipeline
          </Button>
        </div>
      </div>

      {/* Pipeline selector */}
      {pipelines.length > 1 && (
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 transition-colors"
          >
            <GitBranch className="h-4 w-4 text-emerald-500" />
            {selectedPipeline?.name || "Select Pipeline"}
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-lg">
                {pipelines.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPipelineId(p.id);
                      setDropdownOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      p.id === selectedPipelineId
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Board or empty state */}
      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-20">
          <GitBranch className="h-12 w-12 text-slate-600" />
          <h3 className="mt-4 text-lg font-medium text-white">
            No pipelines yet
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            Create your first pipeline to start tracking deals
          </p>
          <Button
            onClick={() => setNewPipelineOpen(true)}
            className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Pipeline
          </Button>
        </div>
      ) : (
        <PipelineBoard
          pipelineId={selectedPipelineId}
          stages={stages}
          onStagesChange={() => loadStages(selectedPipelineId)}
        />
      )}

      {/* New Pipeline Dialog */}
      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent className="sm:max-w-sm bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">New Pipeline</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-slate-300">Pipeline Name</Label>
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder="e.g., Sales Pipeline"
              className="mt-2 bg-slate-800 border-slate-700 text-white"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreatePipeline();
              }}
            />
            <p className="mt-2 text-xs text-slate-400">
              Default stages (Lead, Qualified, Proposal, Negotiation, Won) will
              be created automatically.
            </p>
          </div>
          <DialogFooter className="bg-slate-900/50 border-slate-700">
            <Button
              variant="outline"
              onClick={() => setNewPipelineOpen(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePipeline}
              disabled={creating || !newPipelineName.trim()}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {creating ? "Creating..." : "Create Pipeline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Settings */}
      {selectedPipeline && (
        <PipelineSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          pipeline={selectedPipeline}
          stages={stages}
          onUpdated={handleRefresh}
        />
      )}
    </div>
  );
}
