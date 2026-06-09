"use client"

import { useEffect, useRef, useState } from "react"

// ─── Quadtree driven by Conway's Game of Life ─────────────────────────────────
// A live-cell "heat" field drives subdivision. A *displayed* heat field lerps
// toward the target each frame (Smoothing control) so the structure morphs
// gradually instead of snapping every generation.

interface QNode { x: number; y: number; w: number; h: number; depth: number; isLeaf: boolean; children?: QNode[] }

export interface LifeTheme {
  bg: string; bgDark: string
  line: string; lineDark: string
  lineWidth: number
  dot: string; dotDark: string
  dotAlive: string; dotAliveDark: string
  cellFill: (density: number, isDark: boolean) => string
}

export const LIFE_MONO: LifeTheme = {
  bg: "#f2efe9", bgDark: "#0e0e0e",
  line: "#2a2520", lineDark: "#444444",
  lineWidth: 0.7,
  dot: "#bdb8ae", dotDark: "#3a3a3a",
  dotAlive: "#2a2520", dotAliveDark: "#e8e8e8",
  cellFill: (density, isDark) => {
    const steps = isDark
      ? ["#0e0e0e","#161616","#1e1e1e","#262626","#2e2e2e","#363636"]
      : ["#f2efe9","#e9e6df","#dfdbd2","#d4cfc4","#c8c2b6","#bbb4a6"]
    const i = Math.min(steps.length - 1, Math.floor(density * steps.length))
    return steps[i]
  },
}

// ─── Control definitions (everything is a control) ────────────────────────────
interface Ctl { key: string; label: string; min: number; max: number; step: number; def: number; unit?: string; reinit?: boolean }

const CONTROLS: Ctl[] = [
  { key: "speed",          label: "Speed",        min: 1,    max: 30,   step: 1,    def: 3,    unit: "/s" },
  { key: "smoothing",      label: "Smoothing",    min: 0,    max: 0.95, step: 0.05, def: 0.6 },
  { key: "decay",          label: "Heat decay",   min: 0.5,  max: 0.98, step: 0.01, def: 0.82 },
  { key: "bump",           label: "Heat add",     min: 0.1,  max: 1,    step: 0.05, def: 0.5 },
  { key: "resolution",     label: "Resolution",   min: 8,    max: 44,   step: 2,    def: 22,   unit: "px", reinit: true },
  { key: "minSize",        label: "Min cell",     min: 4,    max: 48,   step: 1,    def: 7,    unit: "px" },
  { key: "maxDepth",       label: "Max depth",    min: 3,    max: 10,   step: 1,    def: 8 },
  { key: "forcedDepth",    label: "Min depth",    min: 0,    max: 4,    step: 1,    def: 2 },
  { key: "thresholdBase",  label: "Split base",   min: 0,    max: 0.3,  step: 0.01, def: 0.06 },
  { key: "thresholdSlope", label: "Split slope",  min: 0,    max: 0.15, step: 0.005,def: 0.05 },
  { key: "density",        label: "Seed density", min: 0.05, max: 0.5,  step: 0.01, def: 0.22, reinit: true },
  { key: "reveal",         label: "Reveal at",    min: 0,    max: 0.4,  step: 0.01, def: 0.04 },
  { key: "fadeRange",      label: "Fade range",   min: 0.01, max: 0.4,  step: 0.01, def: 0.12 },
]

type Cfg = Record<string, number>

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

function readInitial(): { cfg: Cfg; running: boolean } {
  const cfg: Cfg = {}
  for (const c of CONTROLS) cfg[c.key] = c.def
  let running = true
  if (typeof window !== "undefined") {
    const sp = new URLSearchParams(window.location.search)
    for (const c of CONTROLS) {
      const raw = sp.get(c.key)
      if (raw !== null) {
        const n = parseFloat(raw)
        if (!Number.isNaN(n)) cfg[c.key] = clamp(n, c.min, c.max)
      }
    }
    const r = sp.get("running")
    if (r !== null) running = r !== "0" && r !== "false"
  }
  return { cfg, running }
}

function buildLifeTree(
  x: number, y: number, w: number, h: number, depth: number,
  activity: (x0: number, y0: number, x1: number, y1: number) => number,
  cfg: Cfg
): QNode {
  const act = activity(x, y, x + w, y + h)
  const forceSplit = depth < cfg.forcedDepth
  const threshold = cfg.thresholdBase + depth * cfg.thresholdSlope
  const shouldSplit =
    (forceSplit || act > threshold) &&
    depth < cfg.maxDepth &&
    w > cfg.minSize * 2 && h > cfg.minSize * 2

  if (!shouldSplit) return { x, y, w, h, depth, isLeaf: true }

  const hw = w / 2, hh = h / 2
  return {
    x, y, w, h, depth, isLeaf: false,
    children: [
      buildLifeTree(x,      y,      hw, hh, depth + 1, activity, cfg),
      buildLifeTree(x + hw, y,      hw, hh, depth + 1, activity, cfg),
      buildLifeTree(x,      y + hh, hw, hh, depth + 1, activity, cfg),
      buildLifeTree(x + hw, y + hh, hw, hh, depth + 1, activity, cfg),
    ]
  }
}

interface Props { theme?: LifeTheme; mode?: "light" | "dark" | "auto" }

export default function QuadTreeLife({ theme = LIFE_MONO, mode = "auto" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)
  const last = useRef(0)
  const stepAccum = useRef(0)

  const initial = useRef(readInitial())
  const [cfg, setCfg] = useState<Cfg>(initial.current.cfg)
  const [running, setRunning] = useState(initial.current.running)

  // Mirror config into a ref read by the animation loop
  const cfgRef = useRef<Cfg>(cfg)
  const runningRef = useRef(running)
  const reinitRef = useRef(false)
  useEffect(() => { cfgRef.current = cfg }, [cfg])
  useEffect(() => { runningRef.current = running }, [running])

  // Sync everything to the URL query string
  useEffect(() => {
    if (typeof window === "undefined") return
    const sp = new URLSearchParams()
    for (const c of CONTROLS) sp.set(c.key, String(cfg[c.key]))
    sp.set("running", running ? "1" : "0")
    window.history.replaceState(null, "", `${window.location.pathname}?${sp.toString()}`)
  }, [cfg, running])

  const setParam = (key: string, value: number, reinit?: boolean) => {
    setCfg(prev => ({ ...prev, [key]: value }))
    if (reinit) reinitRef.current = true
  }

  // Simulation state
  const gridRef = useRef<Uint8Array | null>(null)
  const heatRef = useRef<Float32Array | null>(null)      // target heat (per generation)
  const dispRef = useRef<Float32Array | null>(null)       // displayed heat (smoothed per frame)
  const cols = useRef(0)
  const rows = useRef(0)
  const seedRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!

    const seed = () => {
      const C = cols.current, R = rows.current
      const g = new Uint8Array(C * R)
      const d = cfgRef.current.density
      for (let i = 0; i < C * R; i++) g[i] = Math.random() < d ? 1 : 0
      gridRef.current = g
      heatRef.current = new Float32Array(C * R)
      dispRef.current = new Float32Array(C * R)
    }
    seedRef.current = seed

    const reinit = () => {
      const cp = cfgRef.current.resolution
      const W = window.innerWidth, H = window.innerHeight
      cols.current = Math.ceil(W / cp) + 1
      rows.current = Math.ceil(H / cp) + 1
      seed()
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      canvas.style.width = W + "px"; canvas.style.height = H + "px"
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      reinit()
    }

    const step = () => {
      const C = cols.current, R = rows.current
      const g = gridRef.current!
      const next = new Uint8Array(C * R)
      for (let y = 0; y < R; y++) {
        for (let x = 0; x < C; x++) {
          let n = 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue
              n += g[((y + dy + R) % R) * C + ((x + dx + C) % C)]
            }
          }
          const alive = g[y * C + x] === 1
          next[y * C + x] = (alive && (n === 2 || n === 3)) || (!alive && n === 3) ? 1 : 0
        }
      }
      // Keep it alive — inject if population collapses
      let liveCount = 0
      for (let i = 0; i < next.length; i++) liveCount += next[i]
      if (liveCount < C * R * 0.04) {
        for (let k = 0; k < 30; k++) next[(Math.random() * next.length) | 0] = 1
      }
      gridRef.current = next

      // Heat decay + deposit on the simulation clock (per generation)
      const heat = heatRef.current!
      const decay = cfgRef.current.decay, bump = cfgRef.current.bump
      for (let i = 0; i < next.length; i++) {
        heat[i] *= decay
        if (next[i]) heat[i] = Math.min(1, heat[i] + bump)
      }
    }

    const frame = (now: number) => {
      raf.current = requestAnimationFrame(frame)
      const dt = now - (last.current || now - 16)
      last.current = now
      stepAccum.current += dt

      const cfg = cfgRef.current

      if (reinitRef.current) { reinit(); reinitRef.current = false }

      const interval = 1000 / cfg.speed
      if (runningRef.current && stepAccum.current > interval) {
        step(); stepAccum.current = 0
      }

      const W = window.innerWidth, H = window.innerHeight
      const isDark = mode === "auto"
        ? document.documentElement.classList.contains("dark")
        : mode === "dark"

      const g = gridRef.current!
      const heat = heatRef.current!
      const disp = dispRef.current!
      const C = cols.current, R = rows.current
      const cp = cfg.resolution

      // Smoothly morph displayed heat toward target heat (frame-rate independent).
      // smoothing 0 = instant snap, → 0.95 = very gradual structural change.
      const alpha = cfg.smoothing <= 0 ? 1 : 1 - Math.pow(cfg.smoothing, dt / 16.667)
      for (let i = 0; i < disp.length; i++) disp[i] += (heat[i] - disp[i]) * alpha

      const activity = (x0: number, y0: number, x1: number, y1: number) => {
        const gx0 = Math.max(0, Math.floor(x0 / cp))
        const gy0 = Math.max(0, Math.floor(y0 / cp))
        const gx1 = Math.min(C - 1, Math.ceil(x1 / cp))
        const gy1 = Math.min(R - 1, Math.ceil(y1 / cp))
        let sum = 0, total = 0
        for (let y = gy0; y <= gy1; y++) {
          for (let x = gx0; x <= gx1; x++) { sum += disp[y * C + x]; total++ }
        }
        return total === 0 ? 0 : sum / total
      }

      const root = buildLifeTree(0, 0, W, H, 0, activity, cfg)

      ctx.fillStyle = isDark ? theme.bgDark : theme.bg
      ctx.fillRect(0, 0, W, H)

      const drawNode = (node: QNode) => {
        if (node.isLeaf) {
          const dens = activity(node.x, node.y, node.x + node.w, node.y + node.h)

          const gx = Math.min(C - 1, Math.floor((node.x + node.w / 2) / cp))
          const gy = Math.min(R - 1, Math.floor((node.y + node.h / 2) / cp))
          const isAlive = g[gy * C + gx] === 1

          // Reveal: cells fade in with local activity. Below `reveal` they are fully
          // hidden (blank background); above reveal+fadeRange they are fully drawn.
          // Live cells are always shown so the simulation never visibly clips.
          let reveal = (dens - cfg.reveal) / cfg.fadeRange
          reveal = reveal < 0 ? 0 : reveal > 1 ? 1 : reveal
          if (isAlive) reveal = 1
          if (reveal <= 0.001) return  // nothing here — leave background blank

          ctx.globalAlpha = reveal
          ctx.fillStyle = theme.cellFill(dens, isDark)
          ctx.fillRect(node.x, node.y, node.w, node.h)

          ctx.strokeStyle = isDark ? theme.lineDark : theme.line
          ctx.lineWidth = theme.lineWidth
          ctx.beginPath()
          ctx.moveTo(node.x + node.w, node.y); ctx.lineTo(node.x + node.w, node.y + node.h)
          ctx.moveTo(node.x, node.y + node.h); ctx.lineTo(node.x + node.w, node.y + node.h)
          ctx.stroke()

          // Only draw a dot when the cell is alive or small/active enough to warrant one.
          const drawDot = isAlive || (node.w < 48 && dens > 0.12)
          if (drawDot) {
            const dotR = isAlive ? 2.6 : 1.4
            ctx.fillStyle = isAlive
              ? (isDark ? theme.dotAliveDark : theme.dotAlive)
              : (isDark ? theme.dotDark : theme.dot)
            ctx.beginPath()
            ctx.arc(node.x + node.w / 2, node.y + node.h / 2, dotR, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.globalAlpha = 1
        } else {
          for (const c of node.children!) drawNode(c)
        }
      }
      drawNode(root)
    }

    resize()
    raf.current = requestAnimationFrame(frame)
    window.addEventListener("resize", resize)

    const onClick = (e: MouseEvent) => {
      const g = gridRef.current, heat = heatRef.current
      if (!g || !heat) return
      const C = cols.current, R = rows.current, cp = cfgRef.current.resolution
      const gx = Math.floor(e.clientX / cp), gy = Math.floor(e.clientY / cp)
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = (gx + dx + C) % C, ny = (gy + dy + R) % R
          if (Math.random() < 0.6) g[ny * C + nx] = 1
          heat[ny * C + nx] = 1
        }
      }
    }
    canvas.addEventListener("click", onClick)
    return () => {
      cancelAnimationFrame(raf.current)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("click", onClick)
    }
  }, [theme, mode])

  const handleReset = () => { seedRef.current?.() }
  const handleDefaults = () => {
    const def: Cfg = {}
    for (const c of CONTROLS) def[c.key] = c.def
    setCfg(def)
    reinitRef.current = true
  }

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />

      <div className="absolute top-6 right-6 z-50 flex max-h-[88vh] w-64 flex-col gap-3 overflow-auto rounded-lg border border-border bg-background/80 px-4 py-3 font-mono text-xs backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRunning(r => !r)}
            className="flex-1 rounded border border-border px-3 py-1.5 uppercase tracking-wider transition-colors hover:bg-muted"
          >
            {running ? "Pause" : "Play"}
          </button>
          <button
            onClick={handleReset}
            className="flex-1 rounded border border-border px-3 py-1.5 uppercase tracking-wider transition-colors hover:bg-muted"
          >
            Reset
          </button>
        </div>

        {CONTROLS.map(c => (
          <label key={c.key} className="flex flex-col gap-1">
            <span className="flex items-center justify-between uppercase tracking-wider text-muted-foreground">
              <span>{c.label}</span>
              <span className="text-foreground">{cfg[c.key]}{c.unit ?? ""}</span>
            </span>
            <input
              type="range"
              min={c.min}
              max={c.max}
              step={c.step}
              value={cfg[c.key]}
              onChange={e => setParam(c.key, Number(e.target.value), c.reinit)}
              className="w-full accent-foreground"
            />
          </label>
        ))}

        <button
          onClick={handleDefaults}
          className="mt-1 rounded border border-border px-3 py-1.5 uppercase tracking-wider transition-colors hover:bg-muted"
        >
          Reset controls
        </button>
      </div>
    </>
  )
}
