"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import type { ConversationsSeriesPoint } from '@/lib/dashboard/types'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'

type RangeDays = 7 | 30 | 90

interface ConversationsChartProps {
  /** Per-range data, so switching tabs never re-fetches. */
  series: Record<RangeDays, ConversationsSeriesPoint[] | null>
  loading: boolean
  range: RangeDays
  onRangeChange: (r: RangeDays) => void
}

// ------------------------------------------------------------
// Layout constants. The SVG renders into a fixed viewBox and scales
// via CSS (preserveAspectRatio default). Everything inside uses
// viewBox coordinates so the drawing math stays simple even as the
// container resizes.
// ------------------------------------------------------------
const VB_W = 760
const VB_H = 240
const PADDING = { top: 16, right: 16, bottom: 28, left: 40 }

export function ConversationsChart({ series, loading, range, onRangeChange }: ConversationsChartProps) {
  const data = series[range]

  // Memoise the max so per-day hover math doesn't recompute it.
  const { maxY, niceTicks } = useMemo(() => {
    const arr = data ?? []
    const max = arr.reduce(
      (m, p) => Math.max(m, p.incoming, p.outgoing),
      0,
    )
    const ceil = niceCeil(max)
    const ticks = [0, ceil / 4, ceil / 2, (3 * ceil) / 4, ceil].map((v) =>
      Math.round(v),
    )
    // De-dupe when the series is flat 0.
    return { maxY: ceil, niceTicks: Array.from(new Set(ticks)) }
  }, [data])

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Conversations Over Time</h2>
          <p className="mt-0.5 text-xs text-slate-500">Daily message volume by direction</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-slate-800/60 p-1">
          {[7, 30, 90].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeChange(r as RangeDays)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                range === r
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white',
              )}
            >
              {r} days
            </button>
          ))}
        </div>
      </header>

      <div className="p-5">
        {loading || !data ? (
          <Skeleton className="h-[240px] w-full" />
        ) : data.every((p) => p.incoming === 0 && p.outgoing === 0) ? (
          <EmptyState
            icon={MessageSquare}
            title="No message activity in this range"
            hint="Send or receive messages to start populating this chart."
          />
        ) : (
          <LineSvg data={data} maxY={maxY} ticks={niceTicks} />
        )}
      </div>

      <footer className="flex items-center gap-4 border-t border-slate-800 px-5 py-3 text-xs text-slate-400">
        <LegendDot color="#3b82f6" label="Incoming" />
        <LegendDot color="#10b981" label="Outgoing" />
      </footer>
    </section>
  )
}

// ------------------------------------------------------------
// The actual SVG. Two polylines + per-day hit targets for hover.
// ------------------------------------------------------------

function LineSvg({
  data,
  maxY,
  ticks,
}: {
  data: ConversationsSeriesPoint[]
  maxY: number
  ticks: number[]
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const chartW = VB_W - PADDING.left - PADDING.right
  const chartH = VB_H - PADDING.top - PADDING.bottom

  // x step can be fractional for 90-day views; points are positioned
  // at the center of each "slot" so the first and last points don't
  // sit right on the axis.
  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0
  const yFor = (v: number) =>
    maxY === 0 ? PADDING.top + chartH : PADDING.top + chartH - (v / maxY) * chartH
  const xFor = (i: number) => PADDING.left + i * stepX

  const incomingPath = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p.incoming)}`).join(' ')
  const outgoingPath = data.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p.outgoing)}`).join(' ')

  // Mouse-move: snap to nearest data-point index.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onMove = (e: MouseEvent) => {
      const rect = svg.getBoundingClientRect()
      const xPct = (e.clientX - rect.left) / rect.width
      const xPx = xPct * VB_W
      if (xPx < PADDING.left - 8 || xPx > VB_W - PADDING.right + 8) {
        setHoverIdx(null)
        return
      }
      const local = xPx - PADDING.left
      const idx = Math.round(stepX === 0 ? 0 : local / stepX)
      setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)))
    }
    const onLeave = () => setHoverIdx(null)
    svg.addEventListener('mousemove', onMove)
    svg.addEventListener('mouseleave', onLeave)
    return () => {
      svg.removeEventListener('mousemove', onMove)
      svg.removeEventListener('mouseleave', onLeave)
    }
  }, [data, stepX])

  const hovered = hoverIdx !== null ? data[hoverIdx] : null
  const hoverX = hoverIdx !== null ? xFor(hoverIdx) : 0

  // X-axis label strategy: show ~6 evenly-spaced labels regardless
  // of range so the axis never looks crowded.
  const labelStride = Math.max(1, Math.ceil(data.length / 6))

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-[240px] w-full"
        role="img"
        aria-label="Conversations per day"
      >
        {/* Y-axis gridlines + labels */}
        {ticks.map((t) => {
          const y = yFor(t)
          return (
            <g key={t}>
              <line
                x1={PADDING.left}
                x2={VB_W - PADDING.right}
                y1={y}
                y2={y}
                stroke="rgb(30 41 59)"
                strokeDasharray="3 3"
              />
              <text
                x={PADDING.left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-slate-500 text-[10px]"
              >
                {t}
              </text>
            </g>
          )
        })}

        {/* X-axis labels */}
        {data.map((p, i) =>
          i % labelStride === 0 ? (
            <text
              key={p.day}
              x={xFor(i)}
              y={VB_H - 8}
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              {shortDayLabel(p.day)}
            </text>
          ) : null,
        )}

        {/* Outgoing polyline (emerald) */}
        <path
          d={outgoingPath}
          fill="none"
          stroke="#10b981"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Incoming polyline (blue) */}
        <path
          d={incomingPath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover crosshair */}
        {hoverIdx !== null && (
          <g pointerEvents="none">
            <line
              x1={hoverX}
              x2={hoverX}
              y1={PADDING.top}
              y2={PADDING.top + chartH}
              stroke="rgb(71 85 105)"
              strokeDasharray="3 3"
            />
            <circle cx={hoverX} cy={yFor(data[hoverIdx].incoming)} r={3.5} fill="#3b82f6" />
            <circle cx={hoverX} cy={yFor(data[hoverIdx].outgoing)} r={3.5} fill="#10b981" />
          </g>
        )}
      </svg>

      {/* Tooltip — absolute-positioned div so we get crisp text, not SVG */}
      {hovered && hoverIdx !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: `${(hoverX / VB_W) * 100}%` }}
        >
          <div className="font-medium text-white">{longDayLabel(hovered.day)}</div>
          <div className="mt-1 flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-blue-300">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
              {hovered.incoming} incoming
            </span>
            <span className="flex items-center gap-1.5 text-emerald-300">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {hovered.outgoing} outgoing
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function shortDayLabel(key: string): string {
  // key is YYYY-MM-DD; return "Apr 17"-style. Using Date with an
  // appended time avoids timezone-shift surprises across midnight.
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function longDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Round `max` up to a "nice" number so Y-axis ticks feel natural
 * (1, 2, 5, 10, 20, 50, …). Keeps the chart readable even when the
 * series is small (max=3 becomes ceil=4, not 3).
 */
function niceCeil(max: number): number {
  if (max <= 0) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  const normalised = max / pow
  let nice: number
  if (normalised <= 1) nice = 1
  else if (normalised <= 2) nice = 2
  else if (normalised <= 5) nice = 5
  else nice = 10
  return nice * pow
}
