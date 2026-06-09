"use client"

import { useEffect, useRef, useState } from "react"

// ─── Quadtree driven by Conway's Game of Life ─────────────────────────────────
// Each leaf cell represents one conference attendee. Busy regions subdivide deep,
// calm regions stay large. Capped at LEAF_BUDGET cells.

interface QNode { x: number; y: number; w: number; h: number; depth: number; isLeaf: boolean; children?: QNode[] }

const MIN_SIZE = 26       // larger min so cells never get too small to be useful
const MAX_DEPTH = 7
const MIN_FORCED_DEPTH = 2
const LEAF_BUDGET = 800   // max people on screen

export interface LifeTheme {
  bg: string; bgDark: string
  line: string; lineDark: string
  lineWidth: number
  dot: string; dotDark: string
  dotAlive: string; dotAliveDark: string
  highlight: string; highlightDark: string
  cellFill: (density: number, isDark: boolean) => string
}

export const LIFE_MONO: LifeTheme = {
  bg: "#f2efe9", bgDark: "#0e0e0e",
  line: "#2a2520", lineDark: "#444444",
  lineWidth: 0.7,
  dot: "#bdb8ae", dotDark: "#3a3a3a",
  dotAlive: "#2a2520", dotAliveDark: "#e8e8e8",
  highlight: "#2a2520", highlightDark: "#e8e8e8",
  cellFill: (density, isDark) => {
    const steps = isDark
      ? ["#0e0e0e","#161616","#1e1e1e","#262626","#2e2e2e","#363636"]
      : ["#f2efe9","#e9e6df","#dfdbd2","#d4cfc4","#c8c2b6","#bbb4a6"]
    const i = Math.min(steps.length - 1, Math.floor(density * steps.length))
    return steps[i]
  },
}

// ─── Fake attendee data ───────────────────────────────────────────────────────
const FIRST = ["Alex","Sam","Jordan","Taylor","Morgan","Casey","Riley","Jamie","Avery","Quinn","Drew","Reese","Skyler","Cameron","Harper","Rowan","Emerson","Finley","Hayden","Dakota","Parker","Sawyer","Charlie","Elliot","Kai","Noor","Mei","Diego","Priya","Yuki","Omar","Lena","Tariq","Sofia","Hugo","Nadia","Ravi","Ingrid","Mateo","Aisha"]
const LAST = ["Chen","Patel","Garcia","Müller","Kim","Okafor","Rossi","Nguyen","Silva","Haddad","Andersson","Yamamoto","Costa","Ivanov","Dubois","Schmidt","Ali","Khan","Tanaka","Lopez","Novak","Reyes","Berg","Fischer","Moreau","Santos","Walsh","Petrov","Adeyemi","Ortega"]
const ROLES = ["Software Engineer","Product Designer","Founder","CTO","Data Scientist","DevRel","VP Engineering","ML Researcher","Frontend Dev","Backend Dev","Solutions Architect","Engineering Manager","Developer Advocate","Security Engineer","Platform Engineer"]
const COMPANIES = ["Vercel","Acme Inc","Northwind","Globex","Initech","Hooli","Umbrella","Stark Labs","Wayne Tech","Cyberdyne","Soylent","Massive Dynamic","Pied Piper","Aperture","Black Mesa"]

interface Person { name: string; role: string; company: string; id: string }

function makePeople(): Person[] {
  // Deterministic 800 attendees
  let s = 1337
  const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const people: Person[] = []
  for (let i = 0; i < LEAF_BUDGET; i++) {
    const f = FIRST[(rand() * FIRST.length) | 0]
    const l = LAST[(rand() * LAST.length) | 0]
    people.push({
      name: `${f} ${l}`,
      role: ROLES[(rand() * ROLES.length) | 0],
      company: COMPANIES[(rand() * COMPANIES.length) | 0],
      id: `#${(1000 + i)}`,
    })
  }
  return people
}

// Map a screen location to a stable attendee index
function personIndexAt(cx: number, cy: number): number {
  const gx = Math.floor(cx / 40), gy = Math.floor(cy / 40)
  let h = (gx * 73856093) ^ (gy * 19349663)
  h = h < 0 ? -h : h
  return h % LEAF_BUDGET
}

function buildLifeTree(
  x: number, y: number, w: number, h: number,
  depth: number,
  activity: (x0: number, y0: number, x1: number, y1: number) => number,
  budget: { count: number }
): QNode {
  const act = activity(x, y, x + w, y + h)
  const forceSplit = depth < MIN_FORCED_DEPTH
  const threshold = 0.06 + depth * 0.05
  const canSize = w > MIN_SIZE * 2 && h > MIN_SIZE * 2
  const withinBudget = budget.count + 4 <= LEAF_BUDGET
  const shouldSplit = (forceSplit || act > threshold) && depth < MAX_DEPTH && canSize && withinBudget

  if (!shouldSplit) { budget.count++; return { x, y, w, h, depth, isLeaf: true } }

  const hw = w / 2, hh = h / 2
  return {
    x, y, w, h, depth, isLeaf: false,
    children: [
      buildLifeTree(x,      y,      hw, hh, depth + 1, activity, budget),
      buildLifeTree(x + hw, y,      hw, hh, depth + 1, activity, budget),
      buildLifeTree(x,      y + hh, hw, hh, depth + 1, activity, budget),
      buildLifeTree(x + hw, y + hh, hw, hh, depth + 1, activity, budget),
    ]
  }
}

function leafAt(node: QNode, px: number, py: number): QNode | null {
  if (px < node.x || px >= node.x + node.w || py < node.y || py >= node.y + node.h) return null
  if (node.isLeaf) return node
  for (const c of node.children!) {
    const hit = leafAt(c, px, py)
    if (hit) return hit
  }
  return null
}

interface Props { theme?: LifeTheme; mode?: "light" | "dark" | "auto" }

export default function QuadTreeLife({ theme = LIFE_MONO, mode = "auto" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)
  const last = useRef(0)
  const stepAccum = useRef(0)

  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState(3)
  const [leafCount, setLeafCount] = useState(0)
  const runningRef = useRef(true)
  const stepIntervalRef = useRef(1000 / 3)

  useEffect(() => { runningRef.current = running }, [running])
  useEffect(() => { stepIntervalRef.current = 1000 / speed }, [speed])

  // Hover popover state
  const [hover, setHover] = useState<{ x: number; y: number; person: Person } | null>(null)

  const peopleRef = useRef<Person[]>([])
  if (peopleRef.current.length === 0) peopleRef.current = makePeople()

  const gridRef = useRef<Uint8Array | null>(null)
  const heatRef = useRef<Float32Array | null>(null)
  const cols = useRef(0)
  const rows = useRef(0)
  const cellPx = useRef(22)
  const seedRef = useRef<(() => void) | null>(null)
  const rootRef = useRef<QNode | null>(null)
  const hoverCellRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const leafCountRef = useRef(0)

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
      // Continuous low-level injection so the simulation never settles into
      // static "ash" and freezes — this is why it used to "end".
      const sprinkle = Math.max(6, Math.floor(C * R * 0.0015))
      for (let k = 0; k < sprinkle; k++) {
        next[(Math.random() * next.length) | 0] = 1
      }
      // Stronger reseed if population collapses
      let liveCount = 0
      for (let i = 0; i < next.length; i++) liveCount += next[i]
      if (liveCount < C * R * 0.05) {
        for (let k = 0; k < 40; k++) next[(Math.random() * next.length) | 0] = 1
      }
      gridRef.current = next

      const heat = heatRef.current!
      for (let i = 0; i < next.length; i++) {
        if (next[i]) heat[i] = Math.min(1, heat[i] + 0.5)
      }
    }

    const frame = (now: number) => {
      raf.current = requestAnimationFrame(frame)
      const dt = now - (last.current || now - 16)
      last.current = now
      stepAccum.current += dt

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

      const decay = Math.pow(0.992, dt / 16.667)
      for (let i = 0; i < heat.length; i++) heat[i] *= decay

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

      const budget = { count: 0 }
      const root = buildLifeTree(0, 0, W, H, 0, activity, budget)
      rootRef.current = root

      ctx.fillStyle = isDark ? theme.bgDark : theme.bg
      ctx.fillRect(0, 0, W, H)

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

          const gx = Math.min(C - 1, Math.floor((node.x + node.w / 2) / cp))
          const gy = Math.min(R - 1, Math.floor((node.y + node.h / 2) / cp))
          const isAlive = g[gy * C + gx] === 1
          const dotR = Math.max(1.5, Math.min(3.5, node.w * 0.06))
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

      // Outer perimeter
      ctx.strokeStyle = isDark ? theme.lineDark : theme.line
      ctx.lineWidth = theme.lineWidth
      ctx.beginPath()
      ctx.moveTo(0, 0); ctx.lineTo(W, 0)
      ctx.moveTo(0, 0); ctx.lineTo(0, H)
      ctx.stroke()

      // Highlight the hovered cell
      const hc = hoverCellRef.current
      if (hc) {
        ctx.strokeStyle = isDark ? theme.highlightDark : theme.highlight
        ctx.lineWidth = 1.5
        ctx.strokeRect(hc.x + 1, hc.y + 1, hc.w - 2, hc.h - 2)
      }

      if (budget.count !== leafCountRef.current) {
        leafCountRef.current = budget.count
        setLeafCount(budget.count)
      }
    }

    resize()
    raf.current = requestAnimationFrame(frame)
    window.addEventListener("resize", resize)

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

    const onMove = (e: MouseEvent) => {
      const root = rootRef.current
      if (!root) return
      const leaf = leafAt(root, e.clientX, e.clientY)
      if (!leaf) { hoverCellRef.current = null; setHover(null); return }
      hoverCellRef.current = { x: leaf.x, y: leaf.y, w: leaf.w, h: leaf.h }
      const idx = personIndexAt(leaf.x + leaf.w / 2, leaf.y + leaf.h / 2)
      setHover({ x: e.clientX, y: e.clientY, person: peopleRef.current[idx] })
    }
    const onLeave = () => { hoverCellRef.current = null; setHover(null) }

    canvas.addEventListener("click", onClick)
    canvas.addEventListener("mousemove", onMove)
    canvas.addEventListener("mouseleave", onLeave)
    return () => {
      cancelAnimationFrame(raf.current)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("click", onClick)
      canvas.removeEventListener("mousemove", onMove)
      canvas.removeEventListener("mouseleave", onLeave)
    }
  }, [theme, mode])

  const handleReset = () => { seedRef.current?.() }

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />

      {/* Hover popover */}
      {hover && (
        <div
          className="pointer-events-none absolute z-50 w-56 rounded-lg border border-border bg-background/95 backdrop-blur-sm px-4 py-3 font-mono shadow-lg"
          style={{
            left: Math.min(hover.x + 16, window.innerWidth - 240),
            top: Math.min(hover.y + 16, window.innerHeight - 110),
          }}
        >
          <div className="text-sm font-semibold text-foreground">{hover.person.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{hover.person.role}</div>
          <div className="mt-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>{hover.person.company}</span>
            <span>{hover.person.id}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-6 right-6 z-50 flex flex-col gap-3 bg-background/80 backdrop-blur-sm border border-border rounded-lg px-4 py-3 font-mono text-xs">
        <div className="flex items-center justify-between gap-4">
          <span className="uppercase tracking-wider text-muted-foreground">Attendees</span>
          <span className="font-semibold text-foreground">{leafCount} / {LEAF_BUDGET}</span>
        </div>
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
