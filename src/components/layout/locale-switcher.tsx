"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
  const t = useTranslations("localeSwitcher");
  const tLocales = useTranslations("localeSwitcher.locales");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("ariaLabel")}
        disabled={pending}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2.5 text-xs font-medium text-slate-300 transition-colors",
          "hover:border-slate-700 hover:bg-slate-800 hover:text-white",
          "focus:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40",
          "data-popup-open:border-slate-700 data-popup-open:bg-slate-800 data-popup-open:text-white",
          pending && "cursor-wait opacity-60",
        )}
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="uppercase">{locale}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="min-w-40 bg-slate-900 text-slate-100 ring-slate-700"
      >
        {routing.locales.map((option) => {
          const isActive = option === locale;
          return (
            <DropdownMenuItem
              key={option}
              onClick={() => switchTo(option)}
              className={cn(
                "text-slate-200 focus:bg-slate-800 focus:text-white",
                isActive && "bg-primary/10 text-primary focus:text-primary",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {option}
              </span>
              <span>{tLocales(option)}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
