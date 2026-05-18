"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const PAGES = [
  { href: "/",              label: "GEOMETRIC GRID" },
  { href: "/pills",         label: "PILL GRID" },
  { href: "/supabase",      label: "SUPABASE GREEN" },
  { href: "/landing",       label: "LANDING DARK" },
  { href: "/landing-light", label: "LANDING LIGHT" },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav className="absolute top-0 left-0 right-0 z-30 flex items-center gap-0 border-b border-white/10 pointer-events-auto">
      {PAGES.map((page) => {
        const active = pathname === page.href
        return (
          <Link
            key={page.href}
            href={page.href}
            className={[
              "font-mono text-[10px] tracking-[0.25em] uppercase px-5 py-4 border-r border-white/10 transition-colors",
              active
                ? "text-white bg-white/10"
                : "text-white/30 hover:text-white/70 hover:bg-white/5",
            ].join(" ")}
          >
            {page.label}
          </Link>
        )
      })}
    </nav>
  )
}
