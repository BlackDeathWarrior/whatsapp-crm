"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { DocPage } from '@/lib/docs/content'

interface DocsSidebarProps {
  pages: DocPage[]
  onNavigate?: () => void
}

export function DocsSidebar({ pages, onNavigate }: DocsSidebarProps) {
  const pathname = usePathname()

  const sections: Record<string, DocPage[]> = {}
  for (const p of pages) {
    sections[p.section] ??= []
    sections[p.section].push(p)
  }

  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6 text-sm">
      <Link
        href="/docs"
        onClick={onNavigate}
        className={cn(
          'flex items-center justify-between rounded-md px-3 py-2 transition-colors',
          pathname === '/docs'
            ? 'bg-slate-800 text-white'
            : 'text-slate-300 hover:bg-slate-800/60 hover:text-white',
        )}
      >
        <span>Overview</span>
      </Link>

      {Object.entries(sections).map(([section, items]) => (
        <div key={section}>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {section}
          </p>
          <ul className="flex flex-col gap-0.5">
            {items.map((p) => {
              const href = `/docs/${p.slug}`
              const active = pathname === href
              return (
                <li key={p.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      'block rounded-md px-3 py-1.5 transition-colors',
                      active
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-white',
                    )}
                  >
                    {p.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
