"use client";

import { Deal } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
  DollarSign,
} from "lucide-react";

function formatCurrency(value: number, currency?: string) {
  const cur = currency || "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface DealCardProps {
  deal: Deal;
  onEdit: (deal: Deal) => void;
  onMoveStage: (dealId: string, direction: "prev" | "next") => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function DealCard({
  deal,
  onEdit,
  onMoveStage,
  hasPrev,
  hasNext,
}: DealCardProps) {
  const statusColor =
    deal.status === "won"
      ? "text-emerald-400"
      : deal.status === "lost"
        ? "text-red-400"
        : "text-slate-400";

  return (
    <div
      onClick={() => onEdit(deal)}
      className="group cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 transition-all hover:border-slate-600 hover:bg-slate-800"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-white leading-snug truncate">
          {deal.title}
        </h4>
        {deal.status && deal.status !== "open" && (
          <Badge variant="outline" className={statusColor}>
            {deal.status}
          </Badge>
        )}
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-sm font-semibold text-emerald-400">
          {formatCurrency(deal.value, deal.currency)}
        </span>
      </div>

      {deal.contact && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <User className="h-3 w-3 text-slate-500" />
          <span className="text-xs text-slate-400 truncate">
            {deal.contact.name || deal.contact.phone}
          </span>
        </div>
      )}

      {deal.expected_close_date && (
        <div className="mb-2 flex items-center gap-1.5">
          <Calendar className="h-3 w-3 text-slate-500" />
          <span className="text-xs text-slate-400">
            {formatDate(deal.expected_close_date)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!hasPrev}
          onClick={(e) => {
            e.stopPropagation();
            onMoveStage(deal.id, "prev");
          }}
          className="text-slate-400 hover:text-white"
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!hasNext}
          onClick={(e) => {
            e.stopPropagation();
            onMoveStage(deal.id, "next");
          }}
          className="text-slate-400 hover:text-white"
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
