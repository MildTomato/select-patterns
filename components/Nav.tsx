"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

const PAGES = [
  { href: "/",               label: "GEOMETRIC GRID" },
  { href: "/pills",          label: "PILL GRID" },
  { href: "/dither",         label: "DITHER — WORDS" },
  { href: "/dither-symbols", label: "DITHER — SYMBOLS" },
  { href: "/dither-green",        label: "DITHER — GREEN" },
  { href: "/dither-green-light",  label: "DITHER — GREEN LIGHT" },
  { href: "/dither-rows",        label: "DITHER — ROWS" },
  { href: "/dither-rows-color",       label: "DITHER — ROWS COLOR" },
  { href: "/dither-rows-color-light", label: "DITHER — ROWS COLOR LIGHT" },
  { href: "/dither-rows-cursor",      label: "DITHER — ROWS CURSOR" },
  { href: "/dither-heavy",   label: "DITHER — HEAVY" },
  { href: "/supabase",       label: "SUPABASE GREEN" },
  { href: "/landing",        label: "LANDING DARK" },
  { href: "/landing-light",  label: "LANDING LIGHT" },
]

export default function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const current = PAGES.find(p => p.href === pathname)

  return (
    <div className="fixed bottom-6 left-6 z-[9999] font-mono">
      {/* Dropdown list — opens upward */}
      {open && (
        <div className="mb-2 flex flex-col gap-1">
          {PAGES.map((page) => {
            const active = pathname === page.href
            return (
              <Link
                key={page.href}
                href={page.href}
                onClick={() => setOpen(false)}
                className={[
                  "text-[10px] tracking-[0.2em] uppercase px-4 py-2.5 border transition-colors whitespace-nowrap",
                  active
                    ? "bg-white text-black border-white"
                    : "bg-black/80 text-white/50 border-white/20 hover:text-white hover:border-white/60 backdrop-blur-sm",
                ].join(" ")}
              >
                {page.label}
              </Link>
            )
          })}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[10px] tracking-[0.2em] uppercase px-4 py-2.5 bg-black/80 border border-white/30 text-white/70 hover:text-white hover:border-white/60 backdrop-blur-sm transition-colors flex items-center gap-3 whitespace-nowrap"
      >
        <span className="text-white/30">{open ? "▼" : "▲"}</span>
        {current?.label ?? "MENU"}
      </button>
    </div>
  )
}
