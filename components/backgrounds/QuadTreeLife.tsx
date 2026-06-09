"use client"

import { useEffect, useRef, useState } from "react"

// ─── Conway's Game of Life grid ───────────────────────────────────────────────
// The live-cell density field drives quadtree subdivision: busy regions split deep,
// dead/empty regions stay as large cells.

interface QNode { x: number; y: number; w: number; h: number; depth: number; isLeaf: boolean; children?: QNode[] }

const MIN_SIZE = 7
const MAX_DEPTH = 8
const MIN_FORCED_DEPTH = 2

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
    // density 0..1 — busier areas are tinted darker (light) / lighter (dark)
    const steps = isDark
      ? ["#0e0e0e","#161616","#1e1e1e","#262626","#2e2e2e","#363636"]
      : ["#f2efe9","#e9e6df","#dfdbd2","#d4cfc4","#c8c2b6","#bbb4a6"]
    const i = Math.min(steps.length - 1, Math.floor(density * steps.length))
    return steps[i]
  },
}

// Build a quadtree where subdivision depth depends on local life activity
function buildLifeTree(
  x: number, y: number, w: number, h: number,
  depth: number,
  activity: (x0: number, y0: number, x1: number, y1: number) => number
): QNode {
  const act = activity(x, y, x + w, y + h)
  const forceSplit = depth < MIN_FORCED_DEPTH
  // More accumulated heat (recently active life) => more likely to split
  const threshold = 0.06 + depth * 0.05
  const shouldSplit = (forceSplit || act > threshold) && depth < MAX_DEPTH && w > MIN_SIZE * 2 && h > MIN_SIZE * 2

  if (!shouldSplit) return { x, y, w, h, depth, isLeaf: true }

  const hw = w / 2, hh = h / 2
  return {
    x, y, w, h, depth, isLeaf: false,
    children: [
      buildLifeTree(x,      y,      hw, hh, depth + 1, activity),
      buildLifeTree(x + hw, y,      hw, hh, depth + 1, activity),
      buildLifeTree(x,      y + hh, hw, hh, depth + 1, activity),
      buildLifeTree(x + hw, y + hh, hw, hh, depth + 1, activity),
    ]
  }
}

interface Props { theme?: LifeTheme; mode?: "light" | "dark" | "auto" }

export default function QuadTreeLife({ theme = LIFE_MONO, mode = "auto" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)
  const last = useRef(0)
  const stepAccum = useRef(0)

  // Control state (UI) mirrored into refs so the animation loop reads live values
  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState(3) // generations per second
  const runningRef = useRef(true)
  const stepIntervalRef = useRef(1000 / 3)
  const resetSignal = useRef(0)

  useEffect(() => { runningRef.current = running }, [running])
  useEffect(() => { stepIntervalRef.current = 1000 / speed }, [speed])

  // Life grid state
  const gridRef = useRef<Uint8Array | null>(null)
  // Smoothed heat field — accumulates where life is active, decays slowly.
  // Drives subdivision so the tree evolves gradually instead of snapping each step.
  const heatRef = useRef<Float32Array | null>(null)
  const cols = useRef(0)
  const rows = useRef(0)
  const cellPx = useRef(22)
  const seedRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!

    const seed = () => {
      const C = cols.current, R = rows.current
      const g = new Uint8Array(C * R)
      for (let i = 0; i < C * R; i++) g[i] = Math.random() < 0.22 ? 1 : 0
      gridRef.current = g
      heatRef.current = new Float32Array(C * R)
    }
    seedRef.current = seed

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      canvas.style.width = W + "px"; canvas.style.height = H + "px"
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols.current = Math.ceil(W / cellPx.current) + 1
      rows.current = Math.ceil(H / cellPx.current) + 1
      seed()
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
              const nx = (x + dx + C) % C
              const ny = (y + dy + R) % R
              n += g[ny * C + nx]
            }
          }
          const alive = g[y * C + x] === 1
          next[y * C + x] = (alive && (n === 2 || n === 3)) || (!alive && n === 3) ? 1 : 0
        }
      }
      // Inject occasional random life so it never stagnates
      let liveCount = 0
      for (let i = 0; i < next.length; i++) liveCount += next[i]
      if (liveCount < C * R * 0.04) {
        for (let k = 0; k < 30; k++) {
          const i = (Math.random() * next.length) | 0
          next[i] = 1
        }
      }
      gridRef.current = next

      // Heat dynamics run on the SAME clock as the simulation (per generation),
      // so the growth/decay animation looks identical at every speed — changing
      // speed just plays the same evolution slower or faster.
      const heat = heatRef.current!
      for (let i = 0; i < next.length; i++) {
        // Decay once per generation, then bump where life is currently active
        heat[i] *= 0.82
        if (next[i]) heat[i] = Math.min(1, heat[i] + 0.5)
      }
    }

    const frame = (now: number) => {
      raf.current = requestAnimationFrame(frame)
      const dt = now - (last.current || now - 16)
      last.current = now
      stepAccum.current += dt

      // Step the simulation at the user-controlled rate, only while running
      if (runningRef.current && stepAccum.current > stepIntervalRef.current) {
        step(); stepAccum.current = 0
      }

      const W = window.innerWidth, H = window.innerHeight
      const isDark = mode === "auto"
        ? document.documentElement.classList.contains("dark")
        : mode === "dark"

      const g = gridRef.current!
      const heat = heatRef.current!
      const C = cols.current, R = rows.current
      const cp = cellPx.current

      // Activity = average heat inside a rectangle (smoothed, slow-moving).
      // Heat decay happens in step() so it stays in sync with the sim at any speed.
      const activity = (x0: number, y0: number, x1: number, y1: number) => {
        const gx0 = Math.max(0, Math.floor(x0 / cp))
        const gy0 = Math.max(0, Math.floor(y0 / cp))
        const gx1 = Math.min(C - 1, Math.ceil(x1 / cp))
        const gy1 = Math.min(R - 1, Math.ceil(y1 / cp))
        let sum = 0, total = 0
        for (let y = gy0; y <= gy1; y++) {
          for (let x = gx0; x <= gx1; x++) {
            sum += heat[y * C + x]; total++
          }
        }
        return total === 0 ? 0 : sum / total
      }

      const root = buildLifeTree(0, 0, W, H, 0, activity)

      ctx.fillStyle = isDark ? theme.bgDark : theme.bg
      ctx.fillRect(0, 0, W, H)

      // Draw leaves
      const drawNode = (node: QNode) => {
        if (node.isLeaf) {
          const dens = activity(node.x, node.y, node.x + node.w, node.y + node.h)
          ctx.fillStyle = theme.cellFill(dens, isDark)
          ctx.fillRect(node.x, node.y, node.w, node.h)

          ctx.strokeStyle = isDark ? theme.lineDark : theme.line
          ctx.lineWidth = theme.lineWidth
          ctx.beginPath()
          ctx.moveTo(node.x + node.w, node.y); ctx.lineTo(node.x + node.w, node.y + node.h)
          ctx.moveTo(node.x, node.y + node.h); ctx.lineTo(node.x + node.w, node.y + node.h)
          ctx.stroke()

          // Dot — alive if the cell at this center is alive
          const gx = Math.min(C - 1, Math.floor((node.x + node.w / 2) / cp))
          const gy = Math.min(R - 1, Math.floor((node.y + node.h / 2) / cp))
          const isAlive = g[gy * C + gx] === 1
          const dotR = Math.max(1, Math.min(3.5, node.w * 0.07))
          ctx.fillStyle = isAlive
            ? (isDark ? theme.dotAliveDark : theme.dotAlive)
            : (isDark ? theme.dotDark : theme.dot)
          ctx.beginPath()
          ctx.arc(node.x + node.w / 2, node.y + node.h / 2, isAlive ? dotR + 0.6 : dotR, 0, Math.PI * 2)
          ctx.fill()
        } else {
          for (const c of node.children!) drawNode(c)
        }
      }
      drawNode(root)

      ctx.strokeStyle = isDark ? theme.lineDark : theme.line
      ctx.lineWidth = theme.lineWidth
      ctx.beginPath()
      ctx.moveTo(0, 0); ctx.lineTo(W, 0)
      ctx.moveTo(0, 0); ctx.lineTo(0, H)
      ctx.stroke()
    }

    resize()
    raf.current = requestAnimationFrame(frame)
    window.addEventListener("resize", resize)
    // Click injects a glider-ish burst of life
    const onClick = (e: MouseEvent) => {
      const g = gridRef.current
      const heat = heatRef.current
      if (!g || !heat) return
      const C = cols.current, R = rows.current, cp = cellPx.current
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

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />

      <div className="absolute top-6 right-6 z-50 flex flex-col gap-3 bg-background/80 backdrop-blur-sm border border-border rounded-lg px-4 py-3 font-mono text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRunning(r => !r)}
            className="px-3 py-1.5 border border-border rounded hover:bg-muted transition-colors uppercase tracking-wider"
          >
            {running ? "Pause" : "Play"}
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 border border-border rounded hover:bg-muted transition-colors uppercase tracking-wider"
          >
            Reset
          </button>
        </div>
        <label className="flex items-center gap-3">
          <span className="uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            Speed {speed}/s
          </span>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            className="w-28 accent-foreground"
          />
        </label>
      </div>
    </>
  )
}
