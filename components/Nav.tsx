"use client"

import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const PAGES = [
  { href: "/",               label: "GEOMETRIC GRID" },
  { href: "/pills",          label: "PILL GRID" },
  { href: "/pills-features", label: "PILLS — FEATURES" },
  { href: "/pills-rows",     label: "PILLS — ROWS COLOR" },
  { href: "/pills-rows-features", label: "PILLS — ROWS FEATURES" },
  { href: "/pills-rows-blocks",   label: "PILLS — ROWS BLOCKS" },
  { href: "/pills-rows-neon",     label: "PILLS — ROWS NEON" },
  { href: "/orbit-points",        label: "ORBIT — POINTS" },
  { href: "/text-art-rows",       label: "TEXT ART — ROWS" },
  { href: "/text-art-shapes",     label: "TEXT ART — SHAPES" },
  { href: "/text-art-intercept",  label: "TEXT ART — INTERCEPT" },
  { href: "/text-art-intercept-grain", label: "TEXT ART — INTERCEPT GRAIN" },
  { href: "/text-art-fluid",      label: "TEXT ART — FLUID" },
  { href: "/dots-panels",         label: "DOTS — PANELS" },
  { href: "/text-art-liquid",     label: "TEXT ART — LIQUID" },
  { href: "/text-art-geo",        label: "TEXT ART — GEO" },
  { href: "/dither",         label: "DITHER — WORDS" },
  { href: "/dither-symbols", label: "DITHER — SYMBOLS" },
  { href: "/dither-green",        label: "DITHER — GREEN" },
  { href: "/dither-green-light",       label: "DITHER — GREEN LIGHT" },
  { href: "/dither-green-light-rows",  label: "DITHER — GREEN LIGHT ROWS" },
  { href: "/dither-green-organic",     label: "DITHER — GREEN ORGANIC" },
  { href: "/dither-rows",        label: "DITHER — ROWS" },
  { href: "/dither-rows-color",       label: "DITHER — ROWS COLOR" },
  { href: "/dither-rows-color-light", label: "DITHER — ROWS COLOR LIGHT" },
  { href: "/dither-rows-bloom",       label: "DITHER — ROWS BLOOM" },
  { href: "/dither-rows-cut",         label: "DITHER — ROWS CUT" },
  { href: "/dither-grain",            label: "DITHER — GRAIN" },
  { href: "/dither-grain-earth",      label: "DITHER — GRAIN EARTH" },
  { href: "/dither-grain-green",      label: "DITHER — GRAIN GREEN" },
  { href: "/dither-rows-cursor",      label: "DITHER — ROWS CURSOR" },
  { href: "/dither-heavy",   label: "DITHER — HEAVY" },
  { href: "/quadtree-mono",  label: "QUADTREE — MONO" },
  { href: "/quadtree-green", label: "QUADTREE — GREEN" },
  { href: "/quadtree-green-light", label: "QUADTREE — GREEN LIGHT" },
  { href: "/quadtree-blue",  label: "QUADTREE — BLUE" },
  { href: "/quadtree-amber", label: "QUADTREE — AMBER" },
  { href: "/supabase",       label: "SUPABASE GREEN" },
  { href: "/landing",        label: "LANDING DARK" },
  { href: "/landing-light",  label: "LANDING LIGHT" },
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const current = PAGES.find(p => p.href === pathname)

  // Sync on mount from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("theme")
    const isDark = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)
    setDark(isDark)
    document.documentElement.classList.toggle("dark", isDark)
  }, [])

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("theme", next ? "dark" : "light")
  }

  return (
    <div className="fixed bottom-6 left-6 z-[9999] font-mono flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            role="combobox"
            aria-expanded={open}
            className="text-[10px] tracking-[0.2em] uppercase px-4 py-2.5 bg-black/80 border border-white/30 text-white/70 hover:text-white hover:border-white/60 backdrop-blur-sm transition-colors flex items-center gap-3 whitespace-nowrap"
          >
            {current?.label ?? "SELECT EXPERIMENT"}
            <ChevronsUpDown className="size-3 text-white/30" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[300px] p-0 bg-black/90 border-white/20 backdrop-blur-sm"
        >
          <Command className="bg-transparent font-mono **:data-[slot=command-input]:text-[11px]">
            <CommandInput placeholder="Search experiments..." className="text-white/80 placeholder:text-white/30" />
            <CommandList className="max-h-[50vh]">
              <CommandEmpty className="py-4 text-center text-[10px] uppercase tracking-[0.2em] text-white/40">
                No experiment found.
              </CommandEmpty>
              <CommandGroup>
                {PAGES.map(page => (
                  <CommandItem
                    key={page.href}
                    value={page.label}
                    onSelect={() => {
                      router.push(page.href)
                      setOpen(false)
                    }}
                    className="text-[10px] uppercase tracking-[0.15em] text-white/70 data-[selected=true]:bg-white data-[selected=true]:text-black"
                  >
                    {page.label}
                    <Check className={cn("ml-auto size-3", pathname === page.href ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <button
        onClick={toggleDark}
        title={dark ? "Switch to light" : "Switch to dark"}
        className="text-[10px] px-3 py-2.5 bg-black/80 border border-white/30 text-white/70 hover:text-white hover:border-white/60 backdrop-blur-sm transition-colors"
      >
        {dark ? "○" : "●"}
      </button>
    </div>
  )
}
