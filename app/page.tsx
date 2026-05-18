"use client"

import { useState, useCallback } from "react"
import dynamic from "next/dynamic"

const GeometricGrid = dynamic(() => import("@/components/backgrounds/GeometricGrid"), { ssr: false })
const Constellation = dynamic(() => import("@/components/backgrounds/Constellation"), { ssr: false })
const Ripples = dynamic(() => import("@/components/backgrounds/Ripples"), { ssr: false })
const FlowField = dynamic(() => import("@/components/backgrounds/FlowField"), { ssr: false })
const BinaryPulse = dynamic(() => import("@/components/backgrounds/BinaryPulse"), { ssr: false })
const WaveGrid = dynamic(() => import("@/components/backgrounds/WaveGrid"), { ssr: false })
const HexPulse = dynamic(() => import("@/components/backgrounds/HexPulse"), { ssr: false })
const Strands = dynamic(() => import("@/components/backgrounds/Strands"), { ssr: false })

const SCENES = [
  {
    id: "geometric-grid",
    label: "01 — GEOMETRIC GRID",
    shortLabel: "GEO GRID",
    description: "Proximity field of mixed shapes",
    component: GeometricGrid,
  },
  {
    id: "constellation",
    label: "02 — CONSTELLATION",
    shortLabel: "CONSTEL.",
    description: "Connected particle network",
    component: Constellation,
  },
  {
    id: "ripples",
    label: "03 — RIPPLES",
    shortLabel: "RIPPLES",
    description: "Concentric wave propagation",
    component: Ripples,
  },
  {
    id: "flow-field",
    label: "04 — FLOW FIELD",
    shortLabel: "FLOW",
    description: "Perlin noise particle trails",
    component: FlowField,
  },
  {
    id: "binary-pulse",
    label: "05 — BINARY PULSE",
    shortLabel: "BINARY",
    description: "Flipping 0s and 1s grid",
    component: BinaryPulse,
  },
  {
    id: "wave-grid",
    label: "06 — WAVE GRID",
    shortLabel: "WAVE",
    description: "Sine-displaced dot grid",
    component: WaveGrid,
  },
  {
    id: "hex-pulse",
    label: "07 — HEX PULSE",
    shortLabel: "HEX",
    description: "Hexagonal tessellation field",
    component: HexPulse,
  },
  {
    id: "strands",
    label: "08 — STRANDS",
    shortLabel: "STRANDS",
    description: "Magnetic light strands",
    component: Strands,
  },
]

export default function BackgroundGallery() {
  const [active, setActive] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  const Scene = SCENES[active].component

  const handlePrev = useCallback(() => {
    setActive((a) => (a - 1 + SCENES.length) % SCENES.length)
  }, [])

  const handleNext = useCallback(() => {
    setActive((a) => (a + 1) % SCENES.length)
  }, [])

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0a0a0a]">
      {/* Full-screen canvas */}
      <div className="absolute inset-0">
        <Scene />
      </div>

      {/* Top bar */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4 select-none">
        {/* Logo */}
        <div className="text-white font-mono text-xs tracking-[0.25em] uppercase opacity-70">
          CONF / VISUAL IDENTITY
        </div>

        {/* Scene title — center */}
        <div className="hidden md:block text-white font-mono text-xs tracking-[0.2em] uppercase opacity-50">
          {SCENES[active].description}
        </div>

        {/* Menu toggle */}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="text-white font-mono text-xs tracking-[0.25em] uppercase opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
          aria-label="Toggle scene menu"
        >
          {menuOpen ? "CLOSE ×" : "SCENES ☰"}
        </button>
      </header>

      {/* Dropdown menu */}
      {menuOpen && (
        <nav
          className="absolute top-14 right-4 z-30 border border-white/10 bg-[#0a0a0a]/90 backdrop-blur-sm"
          role="navigation"
          aria-label="Scene gallery"
        >
          {SCENES.map((scene, idx) => (
            <button
              key={scene.id}
              onClick={() => {
                setActive(idx)
                setMenuOpen(false)
              }}
              className={`w-full text-left px-6 py-3 font-mono text-xs tracking-[0.18em] uppercase transition-all cursor-pointer block border-b border-white/5 last:border-0 ${
                idx === active
                  ? "text-white opacity-100 bg-white/8"
                  : "text-white opacity-35 hover:opacity-80 hover:bg-white/4"
              }`}
            >
              <span className="mr-3">{scene.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Bottom bar — navigation */}
      <footer className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-5 select-none">
        {/* Prev */}
        <button
          onClick={handlePrev}
          className="text-white font-mono text-xs tracking-[0.2em] uppercase opacity-40 hover:opacity-90 transition-opacity cursor-pointer"
          aria-label="Previous scene"
        >
          ← PREV
        </button>

        {/* Dots */}
        <div className="flex items-center gap-2" role="tablist" aria-label="Scene indicators">
          {SCENES.map((scene, idx) => (
            <button
              key={scene.id}
              role="tab"
              aria-selected={idx === active}
              aria-label={`Go to ${scene.label}`}
              onClick={() => setActive(idx)}
              className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                idx === active
                  ? "bg-white opacity-90 scale-125"
                  : "bg-white opacity-20 hover:opacity-50"
              }`}
            />
          ))}
        </div>

        {/* Next */}
        <button
          onClick={handleNext}
          className="text-white font-mono text-xs tracking-[0.2em] uppercase opacity-40 hover:opacity-90 transition-opacity cursor-pointer"
          aria-label="Next scene"
        >
          NEXT →
        </button>
      </footer>

      {/* Current scene label — bottom left overlay */}
      <div className="absolute bottom-16 left-6 z-20 pointer-events-none">
        <p className="text-white font-mono text-[10px] tracking-[0.3em] uppercase opacity-25 mb-1">
          {SCENES[active].shortLabel}
        </p>
        <p className="text-white font-mono text-xl md:text-3xl tracking-[0.15em] uppercase opacity-80 leading-tight">
          {SCENES[active].label}
        </p>
      </div>

      {/* Click hint */}
      <div className="absolute bottom-16 right-6 z-20 pointer-events-none">
        <p className="text-white font-mono text-[10px] tracking-[0.25em] uppercase opacity-20">
          CLICK + MOVE TO INTERACT
        </p>
      </div>
    </main>
  )
}
