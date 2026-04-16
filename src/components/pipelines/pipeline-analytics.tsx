"use client";

import { useMemo } from "react";
import type { Deal, PipelineStage } from "@/types";
import { DollarSign, TrendingUp, Target, BarChart3, Trophy, XCircle } from "lucide-react";

interface PipelineAnalyticsProps {
  stages: PipelineStage[];
  deals: Deal[];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Weighted pipeline value: value × per-stage probability.
 * Spec rule: first stage = 10%, last stage before Won = 90%, Won = 100%.
 * Stages between are interpolated linearly.
 * Won deals count at 100%; Lost deals are excluded.
 */
function computeStageProbability(
  stage: PipelineStage,
  sortedStages: PipelineStage[],
): number {
  const n = sortedStages.length;
  if (n <= 1) return 1;
  const index = sortedStages.findIndex((s) => s.id === stage.id);
  if (index < 0) return 0;
  if (index === n - 1) return 1; // final stage (Won)
  // First stage → 0.10, second-to-last → 0.90. Evenly spread.
  const slots = n - 1; // number of non-final slots
  if (slots <= 1) return 0.1;
  const t = index / (slots - 1); // 0..1
  return 0.1 + t * (0.9 - 0.1);
}

export function PipelineAnalytics({ stages, deals }: PipelineAnalyticsProps) {
  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const stats = useMemo(() => {
    const active = deals.filter((d) => d.status !== "lost");
    const openDeals = active.filter((d) => d.status !== "won");

    const totalCount = active.length;
    const totalValue = active.reduce((sum, d) => sum + Number(d.value || 0), 0);
    const avgValue = totalCount > 0 ? totalValue / totalCount : 0;

    const stageById = new Map(sortedStages.map((s) => [s.id, s]));
    const weightedValue = openDeals.reduce((sum, d) => {
      const stage = stageById.get(d.stage_id);
      if (!stage) return sum;
      const prob = computeStageProbability(stage, sortedStages);
      return sum + Number(d.value || 0) * prob;
    }, 0);

    // This-month won/lost counts based on updated_at (falls back to created_at).
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = (d: Deal) => {
      const ts = d.updated_at ?? d.created_at;
      return ts ? new Date(ts) >= monthStart : false;
    };
    const wonThisMonth = deals.filter(
      (d) => d.status === "won" && thisMonth(d),
    ).length;
    const lostThisMonth = deals.filter(
      (d) => d.status === "lost" && thisMonth(d),
    ).length;

    return {
      totalCount,
      totalValue,
      avgValue,
      weightedValue,
      wonThisMonth,
      lostThisMonth,
    };
  }, [deals, sortedStages]);

  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:grid-cols-3 lg:grid-cols-6">
      <Metric
        icon={<BarChart3 className="h-4 w-4 text-slate-400" />}
        label="Total Deals"
        value={String(stats.totalCount)}
      />
      <Metric
        icon={<DollarSign className="h-4 w-4 text-emerald-400" />}
        label="Pipeline Value"
        value={formatCurrency(stats.totalValue)}
      />
      <Metric
        icon={<Target className="h-4 w-4 text-blue-400" />}
        label="Avg Deal Size"
        value={formatCurrency(stats.avgValue)}
      />
      <Metric
        icon={<TrendingUp className="h-4 w-4 text-purple-400" />}
        label="Weighted Value"
        value={formatCurrency(stats.weightedValue)}
      />
      <Metric
        icon={<Trophy className="h-4 w-4 text-emerald-400" />}
        label="Won This Month"
        value={String(stats.wonThisMonth)}
      />
      <Metric
        icon={<XCircle className="h-4 w-4 text-red-400" />}
        label="Lost This Month"
        value={String(stats.lostThisMonth)}
      />
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-slate-800/50 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}
