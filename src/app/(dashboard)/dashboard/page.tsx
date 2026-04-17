"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Conversation, Pipeline, PipelineStage, Broadcast } from "@/types";
import {
  Users,
  MessageSquare,
  Mail,
  TrendingUp,
  ArrowRight,
  Radio,
  GitBranch,
  DollarSign,
  Clock,
} from "lucide-react";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  loading: boolean;
}

function StatCard({ title, value, icon, loading }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-400">{title}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="mt-3 h-8 w-20 animate-pulse rounded bg-slate-800" />
      ) : (
        <p className="mt-3 text-3xl font-bold text-white">{value}</p>
      )}
    </div>
  );
}

interface PipelineOverviewData {
  pipeline: Pipeline;
  stages: (PipelineStage & { dealCount: number; totalValue: number })[];
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [totalContacts, setTotalContacts] = useState(0);
  const [openConversations, setOpenConversations] = useState(0);
  const [messagesToday, setMessagesToday] = useState(0);
  const [activeDeals, setActiveDeals] = useState(0);
  const [recentConversations, setRecentConversations] = useState<Conversation[]>([]);
  const [pipelineOverviews, setPipelineOverviews] = useState<PipelineOverviewData[]>([]);
  const [recentBroadcasts, setRecentBroadcasts] = useState<Broadcast[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      contactsRes,
      openConvRes,
      messagesTodayRes,
      dealsRes,
      recentConvRes,
      pipelinesRes,
      broadcastsRes,
    ] = await Promise.all([
      supabase.from("contacts").select("id", { count: "exact", head: true }),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayStart.toISOString()),
      supabase.from("deals").select("id", { count: "exact", head: true }),
      supabase
        .from("conversations")
        .select("*, contact:contacts(*)")
        .order("last_message_at", { ascending: false })
        .limit(5),
      supabase.from("pipelines").select("*").order("created_at"),
      supabase
        .from("broadcasts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    setTotalContacts(contactsRes.count ?? 0);
    setOpenConversations(openConvRes.count ?? 0);
    setMessagesToday(messagesTodayRes.count ?? 0);
    setActiveDeals(dealsRes.count ?? 0);
    setRecentConversations(recentConvRes.data ?? []);
    setRecentBroadcasts(broadcastsRes.data ?? []);

    // Load pipeline overviews with stages and deal data
    if (pipelinesRes.data && pipelinesRes.data.length > 0) {
      const overviews: PipelineOverviewData[] = [];
      for (const pipeline of pipelinesRes.data) {
        const { data: stagesData } = await supabase
          .from("pipeline_stages")
          .select("*")
          .eq("pipeline_id", pipeline.id)
          .order("position");

        const { data: dealsData } = await supabase
          .from("deals")
          .select("stage_id, value")
          .eq("pipeline_id", pipeline.id);

        const enrichedStages = (stagesData || []).map((stage) => {
          const stageDeals = (dealsData || []).filter(
            (d) => d.stage_id === stage.id
          );
          return {
            ...stage,
            dealCount: stageDeals.length,
            totalValue: stageDeals.reduce(
              (sum: number, d: { value: number }) => sum + d.value,
              0
            ),
          };
        });

        overviews.push({ pipeline, stages: enrichedStages });
      }
      setPipelineOverviews(overviews);
    }

    setLoading(false);
  }

  function getBroadcastStatusColor(status: string) {
    switch (status) {
      case "sent":
        return "bg-emerald-500/10 text-emerald-400";
      case "sending":
        return "bg-blue-500/10 text-blue-400";
      case "scheduled":
        return "bg-yellow-500/10 text-yellow-400";
      case "draft":
        return "bg-slate-500/10 text-slate-400";
      case "failed":
        return "bg-red-500/10 text-red-400";
      default:
        return "bg-slate-500/10 text-slate-400";
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Overview of your WhatsApp CRM activity
        </p>
      </div>

      {/* Row 1: Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Contacts"
          value={totalContacts.toLocaleString()}
          icon={<Users className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          title="Open Conversations"
          value={openConversations.toLocaleString()}
          icon={<MessageSquare className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          title="Messages Today"
          value={messagesToday.toLocaleString()}
          icon={<Mail className="h-5 w-5" />}
          loading={loading}
        />
        <StatCard
          title="Active Deals"
          value={activeDeals.toLocaleString()}
          icon={<TrendingUp className="h-5 w-5" />}
          loading={loading}
        />
      </div>

      {/* Row 2: Recent Conversations */}
      <div className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-white">
              Recent Conversations
            </h2>
          </div>
          <button
            onClick={() => router.push("/inbox")}
            className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <div className="divide-y divide-slate-800">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="h-9 w-9 animate-pulse rounded-full bg-slate-800" />
                <div className="flex-1">
                  <div className="h-4 w-28 animate-pulse rounded bg-slate-800" />
                  <div className="mt-1.5 h-3 w-48 animate-pulse rounded bg-slate-800" />
                </div>
                <div className="h-3 w-12 animate-pulse rounded bg-slate-800" />
              </div>
            ))
          ) : recentConversations.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              No conversations yet
            </div>
          ) : (
            recentConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => router.push(`/inbox?c=${conv.id}`)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-800/50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-medium text-emerald-500">
                  {conv.contact?.name?.charAt(0)?.toUpperCase() ||
                    conv.contact?.phone?.slice(-2) ||
                    "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {conv.contact?.name || conv.contact?.phone || "Unknown"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 truncate">
                    {conv.last_message_text || "No messages"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-slate-500">
                    {conv.last_message_at
                      ? formatRelativeTime(conv.last_message_at)
                      : ""}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-medium text-white">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Row 3: Pipeline Overview */}
      <div className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
          <GitBranch className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-white">
            Pipeline Overview
          </h2>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i}>
                  <div className="h-4 w-32 animate-pulse rounded bg-slate-800" />
                  <div className="mt-3 flex gap-2">
                    {[1, 2, 3, 4].map((j) => (
                      <div
                        key={j}
                        className="h-16 flex-1 animate-pulse rounded-lg bg-slate-800/50"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : pipelineOverviews.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">
              No pipelines created yet
            </div>
          ) : (
            <div className="space-y-6">
              {pipelineOverviews.map(({ pipeline, stages }) => (
                <div key={pipeline.id}>
                  <h3 className="text-sm font-medium text-white mb-3">
                    {pipeline.name}
                  </h3>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {stages.map((stage) => (
                      <div
                        key={stage.id}
                        className="min-w-[140px] flex-1 rounded-lg border border-slate-800 bg-slate-800/30 p-3"
                      >
                        <div className="flex items-center gap-1.5 mb-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          <span className="text-xs font-medium text-slate-300 truncate">
                            {stage.name}
                          </span>
                        </div>
                        <p className="text-lg font-bold text-white">
                          {stage.dealCount}
                        </p>
                        {stage.totalValue > 0 && (
                          <p className="flex items-center gap-1 text-xs text-emerald-400 mt-0.5">
                            <DollarSign className="h-3 w-3" />
                            {formatCurrency(stage.totalValue)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Recent Broadcasts */}
      <div className="rounded-xl border border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
          <Radio className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-white">
            Recent Broadcasts
          </h2>
        </div>
        <div className="divide-y divide-slate-800">
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1">
                  <div className="h-4 w-36 animate-pulse rounded bg-slate-800" />
                  <div className="mt-1.5 h-3 w-24 animate-pulse rounded bg-slate-800" />
                </div>
                <div className="h-5 w-16 animate-pulse rounded-full bg-slate-800" />
              </div>
            ))
          ) : recentBroadcasts.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              No broadcasts yet
            </div>
          ) : (
            recentBroadcasts.map((broadcast) => (
              <div
                key={broadcast.id}
                className="flex items-center gap-4 px-5 py-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
                  <Radio className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {broadcast.name}
                  </p>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-400">
                    <span>
                      {broadcast.sent_count}/{broadcast.total_recipients} sent
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(broadcast.created_at)}
                    </span>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getBroadcastStatusColor(
                    broadcast.status
                  )}`}
                >
                  {broadcast.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
