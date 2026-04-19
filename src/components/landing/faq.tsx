"use client"

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Section, SectionHeader } from './section'
import { FAQ_ITEMS } from '@/lib/seo/faq-data'
import { cn } from '@/lib/utils'

export function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)
  return (
    <Section id="faq">
      <SectionHeader
        eyebrow="FAQ"
        title="Questions, answered"
        description="If you cannot find what you are looking for, reach out and we will get back to you."
      />

      <div className="mx-auto max-w-3xl divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = openIdx === i
          return (
            <div key={item.q}>
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-slate-900/70"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-medium text-white">{item.q}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 flex-shrink-0 text-slate-500 transition-transform',
                    isOpen && 'rotate-180 text-emerald-400',
                  )}
                />
              </button>
              {isOpen && (
                <div className="px-6 pb-5 text-sm leading-relaxed text-slate-400">
                  {item.a}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}
