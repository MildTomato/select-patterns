"use client"

import dynamic from "next/dynamic"

const GeometricGrid = dynamic(() => import("@/components/backgrounds/GeometricGrid"), { ssr: false })

export default function Page() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#080808]">
      <div className="absolute inset-0">
        <GeometricGrid />
      </div>

      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-5 pointer-events-none select-none">
        <span className="text-white font-mono text-xs tracking-[0.3em] uppercase opacity-40">
          CONF / VISUAL IDENTITY
        </span>
        <span className="text-white font-mono text-xs tracking-[0.3em] uppercase opacity-20">
          GEOMETRIC GRID
        </span>
      </header>

      <footer className="absolute bottom-0 left-0 right-0 z-20 px-6 py-5 pointer-events-none select-none">
        <p className="text-white font-mono text-[10px] tracking-[0.3em] uppercase opacity-15">
          MOVE + CLICK TO INTERACT
        </p>
      </footer>
    </main>
  )
}
