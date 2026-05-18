"use client"

import dynamic from "next/dynamic"

const GeometricGridGreen = dynamic(() => import("@/components/backgrounds/GeometricGridGreen"), { ssr: false })

export default function SupabasePage() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0a1a10]">
      <div className="absolute inset-0">
        <GeometricGridGreen />
      </div>

      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-5 pointer-events-none select-none">
        <span className="font-mono text-xs tracking-[0.3em] uppercase text-[#3ECF8E] opacity-60">
          CONF / VISUAL IDENTITY
        </span>
        <span className="font-mono text-xs tracking-[0.3em] uppercase text-[#3ECF8E] opacity-30">
          SUPABASE
        </span>
      </header>

      <footer className="absolute bottom-0 left-0 right-0 z-20 px-6 py-5 pointer-events-none select-none">
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#3ECF8E] opacity-20">
          MOVE + CLICK TO INTERACT
        </p>
      </footer>
    </main>
  )
}
