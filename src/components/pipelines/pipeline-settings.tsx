"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Pipeline, PipelineStage } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Trash2,
  Plus,
  GripVertical,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
} from "lucide-react";

const STAGE_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
];

interface PipelineSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
  stages: PipelineStage[];
  onUpdated: () => void;
}

export function PipelineSettings({
  open,
  onOpenChange,
  pipeline,
  stages,
  onUpdated,
}: PipelineSettingsProps) {
  const [name, setName] = useState(pipeline.name);
  const [localStages, setLocalStages] = useState<PipelineStage[]>(stages);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (open) {
      setName(pipeline.name);
      setLocalStages([...stages].sort((a, b) => a.position - b.position));
      setShowDeleteConfirm(false);
    }
  }, [open, pipeline, stages]);

  async function handleSave() {
    setSaving(true);

    await supabase
      .from("pipelines")
      .update({ name: name.trim() })
      .eq("id", pipeline.id);

    for (let i = 0; i < localStages.length; i++) {
      const stage = localStages[i];
      await supabase
        .from("pipeline_stages")
        .update({ name: stage.name, color: stage.color, position: i })
        .eq("id", stage.id);
    }

    setSaving(false);
    onOpenChange(false);
    onUpdated();
  }

  async function handleAddStage() {
    if (!newStageName.trim()) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { data } = await supabase
      .from("pipeline_stages")
      .insert({
        pipeline_id: pipeline.id,
        name: newStageName.trim(),
        color: newStageColor,
        position: localStages.length,
      })
      .select()
      .single();

    if (data) {
      setLocalStages([...localStages, data]);
      setNewStageName("");
      setNewStageColor(
        STAGE_COLORS[(localStages.length + 1) % STAGE_COLORS.length]
      );
    }
  }

  async function handleRemoveStage(stageId: string) {
    await supabase.from("pipeline_stages").delete().eq("id", stageId);
    setLocalStages(localStages.filter((s) => s.id !== stageId));
  }

  function moveStage(index: number, direction: "up" | "down") {
    const newStages = [...localStages];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newStages.length) return;
    [newStages[index], newStages[targetIndex]] = [
      newStages[targetIndex],
      newStages[index],
    ];
    setLocalStages(newStages);
  }

  async function handleDeletePipeline() {
    setDeleting(true);
    await supabase.from("deals").delete().eq("pipeline_id", pipeline.id);
    await supabase
      .from("pipeline_stages")
      .delete()
      .eq("pipeline_id", pipeline.id);
    await supabase.from("pipelines").delete().eq("id", pipeline.id);
    setDeleting(false);
    onOpenChange(false);
    onUpdated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-white">Pipeline Settings</DialogTitle>
        </DialogHeader>

        {showDeleteConfirm ? (
          <div className="py-4">
            <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-400">
                  Delete Pipeline
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  This will permanently delete the pipeline, all stages, and all
                  deals within it. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                className="border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeletePipeline}
                disabled={deleting}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deleting ? "Deleting..." : "Delete Pipeline"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label className="text-slate-300">Pipeline Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-slate-300">Stages</Label>
                <div className="space-y-2">
                  {localStages.map((stage, index) => (
                    <div
                      key={stage.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-2"
                    >
                      <GripVertical className="h-4 w-4 text-slate-500 shrink-0" />
                      <div
                        className="h-4 w-4 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      <Input
                        value={stage.name}
                        onChange={(e) => {
                          const updated = [...localStages];
                          updated[index] = {
                            ...updated[index],
                            name: e.target.value,
                          };
                          setLocalStages(updated);
                        }}
                        className="h-7 bg-transparent border-transparent text-white text-sm focus:border-slate-600"
                      />
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === 0}
                          onClick={() => moveStage(index, "up")}
                          className="text-slate-400 hover:text-white"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          disabled={index === localStages.length - 1}
                          onClick={() => moveStage(index, "down")}
                          className="text-slate-400 hover:text-white"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleRemoveStage(stage.id)}
                          className="text-slate-400 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <div className="flex gap-1">
                    {STAGE_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewStageColor(color)}
                        className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                        style={{
                          backgroundColor: color,
                          borderColor:
                            newStageColor === color
                              ? "white"
                              : "transparent",
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    placeholder="New stage name"
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddStage();
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddStage}
                    disabled={!newStageName.trim()}
                    className="border-slate-700 text-slate-300 shrink-0"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="bg-slate-900/50 border-slate-700">
              <Button
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                className="mr-auto"
              >
                Delete Pipeline
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
