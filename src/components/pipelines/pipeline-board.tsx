"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { PipelineStage, Deal } from "@/types";
import { DealCard } from "./deal-card";
import { DealForm } from "./deal-form";
import { Button } from "@/components/ui/button";
import { Plus, DollarSign } from "lucide-react";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

interface PipelineBoardProps {
  pipelineId: string;
  stages: PipelineStage[];
  onStagesChange: () => void;
}

export function PipelineBoard({
  pipelineId,
  stages,
  onStagesChange,
}: PipelineBoardProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>("");

  const supabase = createClient();
  const sortedStages = [...stages].sort((a, b) => a.position - b.position);

  useEffect(() => {
    if (pipelineId) {
      loadDeals();
    }
  }, [pipelineId]);

  async function loadDeals() {
    setLoading(true);
    const { data } = await supabase
      .from("deals")
      .select("*, contact:contacts(*)")
      .eq("pipeline_id", pipelineId)
      .order("created_at", { ascending: false });
    if (data) setDeals(data);
    setLoading(false);
  }

  function getDealsForStage(stageId: string) {
    return deals.filter((d) => d.stage_id === stageId);
  }

  function getTotalValue(stageId: string) {
    return getDealsForStage(stageId).reduce((sum, d) => sum + d.value, 0);
  }

  function handleAddDeal(stageId: string) {
    setEditingDeal(null);
    setDefaultStageId(stageId);
    setDealFormOpen(true);
  }

  function handleEditDeal(deal: Deal) {
    setEditingDeal(deal);
    setDefaultStageId(deal.stage_id);
    setDealFormOpen(true);
  }

  async function handleMoveStage(dealId: string, direction: "prev" | "next") {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;

    const currentIndex = sortedStages.findIndex(
      (s) => s.id === deal.stage_id
    );
    const targetIndex =
      direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedStages.length) return;

    const targetStage = sortedStages[targetIndex];
    await supabase
      .from("deals")
      .update({ stage_id: targetStage.id })
      .eq("id", dealId);

    setDeals(
      deals.map((d) =>
        d.id === dealId ? { ...d, stage_id: targetStage.id } : d
      )
    );
  }

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {sortedStages.map((stage) => (
          <div
            key={stage.id}
            className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-800 bg-slate-900/50"
          >
            <div className="p-3 border-b border-slate-800">
              <div className="h-4 w-24 animate-pulse rounded bg-slate-800" />
              <div className="mt-2 h-3 w-16 animate-pulse rounded bg-slate-800" />
            </div>
            <div className="p-3 space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-lg bg-slate-800/50"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-14rem)]">
        {sortedStages.map((stage, stageIndex) => {
          const stageDeals = getDealsForStage(stage.id);
          const totalValue = getTotalValue(stage.id);

          return (
            <div
              key={stage.id}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-800 bg-slate-900/50"
            >
              {/* Column header */}
              <div className="p-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <h3 className="text-sm font-medium text-white truncate">
                    {stage.name}
                  </h3>
                  <span className="ml-auto shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-xs text-slate-400">
                    {stageDeals.length}
                  </span>
                </div>
                {totalValue > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                    <DollarSign className="h-3 w-3" />
                    {formatCurrency(totalValue)}
                  </div>
                )}
              </div>

              {/* Deal cards */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {stageDeals.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    onEdit={handleEditDeal}
                    onMoveStage={handleMoveStage}
                    hasPrev={stageIndex > 0}
                    hasNext={stageIndex < sortedStages.length - 1}
                  />
                ))}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAddDeal(stage.id)}
                  className="w-full justify-start text-slate-400 hover:text-white border border-dashed border-slate-700 hover:border-slate-600"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Deal
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={editingDeal}
        pipelineId={pipelineId}
        stages={sortedStages}
        defaultStageId={defaultStageId}
        onSaved={loadDeals}
      />
    </>
  );
}
