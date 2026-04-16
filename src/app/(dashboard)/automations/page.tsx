"use client";

import { Zap } from "lucide-react";

export default function AutomationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Automations</h1>
        <p className="mt-1 text-sm text-slate-400">
          Automate your WhatsApp messaging workflows
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/50 py-20">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
          <Zap className="h-8 w-8 text-emerald-500" />
        </div>
        <h3 className="mt-6 text-lg font-semibold text-white">Coming Soon</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-slate-400">
          Set up automated responses, workflows, and triggers for your WhatsApp
          messages.
        </p>
        <div className="mt-6 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-2.5">
          <p className="text-xs text-slate-400">
            This feature is under development
          </p>
        </div>
      </div>
    </div>
  );
}
