"use client"

import Link from 'next/link'
import {
  MessageSquare,
  UserPlus,
  Briefcase,
  Radio,
  Zap,
  Inbox,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { ActivityItem, ActivityKind } from '@/lib/dashboard/types'
import { cn } from '@/lib/utils'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'

interface ActivityFeedProps {
  items: ActivityItem[] | null
  loading: boolean
}

interface KindTheme {
  icon: ComponentType<{ className?: string }>
  /** Tailwind classes for the round icon badge + label color. */
  badge: string
}

const KIND_THEME: Record<ActivityKind, KindTheme> = {
  message: { icon: MessageSquare, badge: 'bg-blue-500/10 text-blue-400' },
  contact: { icon: UserPlus, badge: 'bg-emerald-500/10 text-emerald-400' },
  deal: { icon: Briefcase, badge: 'bg-violet-500/10 text-violet-400' },
  broadcast: { icon: Radio, badge: 'bg-amber-500/10 text-amber-400' },
  automation: { icon: Zap, badge: 'bg-rose-500/10 text-rose-400' },
}

export function ActivityFeed({ items, loading }: ActivityFeedProps) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
        <Link
          href="/inbox"
          className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
        >
          View all →
        </Link>
      </header>

      {loading || !items ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={Inbox}
            title="No activity yet"
            hint="Activity from messages, deals, broadcasts, and automations will appear here."
          />
        </div>
      ) : (
        <ul className="divide-y divide-slate-800">
          {items.map((it, i) => {
            const theme = KIND_THEME[it.kind]
            const Icon = theme.icon
            // Alternating row background for light scanability — dark-theme
            // translation of the spec's white / #f9fafb stripes.
            const stripe = i % 2 === 0 ? 'bg-transparent' : 'bg-slate-900/40'
            const row = (
              <div className="flex items-center gap-3 px-5 py-2.5">
                <span
                  className={cn(
                    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                    theme.badge,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                  {it.text}
                </span>
                <span className="flex-shrink-0 text-xs text-slate-500 tabular-nums">
                  {relativeTime(it.at)}
                </span>
              </div>
            )
            return (
              <li key={it.id} className={cn(stripe, 'transition-colors hover:bg-slate-800/40')}>
                {it.href ? (
                  <Link href={it.href} className="block">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 2_592_000) return `${Math.floor(diffSec / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}
