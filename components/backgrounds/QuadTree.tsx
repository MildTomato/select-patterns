"use client"

import { useEffect, useRef } from "react"

// ─── Simplex-style noise (value noise, 2D) ────────────────────────────────────
// Good enough for smooth subdivision fields without a library

function hash(x: number, y: number): number {
  let h = (x * 1619 + y * 31337) ^ (x * 3571)
  h = h ^ (h >> 16)
  h = Math.imul(h, 0x45d9f3b)
  h = h ^ (h >> 16)
  return (h & 0xffff) / 0xffff
}

function smoothstep(t: number) { return t * t * (3 - 2 * t) }

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = smoothstep(fx), uy = smoothstep(fy)
  const a = hash(ix,     iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix,     iy + 1)
  const d = hash(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (b - a + a - b + d - c) * ux * uy
}

function fbm(x: number, y: number, octaves = 4): number {
  let v = 0, amp = 0.5, freq = 1, max = 0
  for (let i = 0; i < octaves; i++) {
    v += valueNoise(x * freq, y * freq) * amp
    max += amp
    amp *= 0.5; freq *= 2.1
  }
  return v / max
}

// ─── Quadtree subdivision ─────────────────────────────────────────────────────

interface QNode { x: number; y: number; w: number; h: number; depth: number; isLeaf: boolean; children?: QNode[] }

const MIN_SIZE = 6
const MAX_DEPTH = 9
// Minimum depth before noise threshold applies — guarantees grid is never blank
const MIN_FORCED_DEPTH = 2

function buildQuadTree(
  x: number, y: number, w: number, h: number,
  depth: number,
  noiseField: (cx: number, cy: number) => number
): QNode {
  const cx = x + w / 2, cy = y + h / 2
  const n = noiseField(cx, cy)

  // Always split below MIN_FORCED_DEPTH regardless of noise — prevents blank screen
  const forceSplit = depth < MIN_FORCED_DEPTH
  const threshold = 0.38 + depth * 0.045
  const shouldSplit = (forceSplit || n > threshold) && depth < MAX_DEPTH && w > MIN_SIZE * 2 && h > MIN_SIZE * 2

  if (!shouldSplit) {
    return { x, y, w, h, depth, isLeaf: true }
  }

  const hw = w / 2, hh = h / 2
  return {
    x, y, w, h, depth, isLeaf: false,
    children: [
      buildQuadTree(x,      y,      hw, hh, depth + 1, noiseField),
      buildQuadTree(x + hw, y,      hw, hh, depth + 1, noiseField),
      buildQuadTree(x,      y + hh, hw, hh, depth + 1, noiseField),
      buildQuadTree(x + hw, y + hh, hw, hh, depth + 1, noiseField),
    ]
  }
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: QNode,
  theme: QTheme,
  isDark: boolean,
  maxDepth: number
) {
  if (node.isLeaf) {
    // Cell fill — deeper = darker in light mode, lighter in dark mode
    if (theme.cellFill) {
      const fill = theme.cellFill(node.depth, maxDepth, isDark)
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(node.x, node.y, node.w, node.h) }
    }

    // Cell border — draw only right + bottom edges to avoid double-drawing shared borders
    ctx.strokeStyle = isDark ? theme.lineDark : theme.line
    ctx.lineWidth = theme.lineWidth
    ctx.beginPath()
    // right edge
    ctx.moveTo(node.x + node.w, node.y)
    ctx.lineTo(node.x + node.w, node.y + node.h)
    // bottom edge
    ctx.moveTo(node.x, node.y + node.h)
    ctx.lineTo(node.x + node.w, node.y + node.h)
    ctx.stroke()

    // One dot at center of each leaf cell
    const dotR = Math.max(1, Math.min(3.5, node.w * 0.07))
    ctx.fillStyle = isDark ? theme.dotDark : theme.dot
    ctx.beginPath()
    ctx.arc(node.x + node.w / 2, node.y + node.h / 2, dotR, 0, Math.PI * 2)
    ctx.fill()
  } else {
    for (const child of node.children!) drawNode(ctx, child, theme, isDark, maxDepth)
  }
}

// ─── Themes ───────────────────────────────────────────────────────────────────

export interface QTheme {
  bg: string; bgDark: string
  line: string; lineDark: string
  lineWidth: number
  dot: string; dotDark: string
  cellFill?: (depth: number, maxDepth: number, isDark: boolean) => string | null
}

export const THEME_MONO: QTheme = {
  bg: "#f2efe9", bgDark: "#0e0e0e",
  line: "#2a2520", lineDark: "#444444",
  lineWidth: 0.7,
  dot: "#2a2520", dotDark: "#888888",
  cellFill: (depth, _maxDepth, isDark) => {
    if (isDark) {
      const dark = ["#0e0e0e","#141414","#1a1a1a","#202020","#262626","#2c2c2c","#323232"]
      return dark[Math.min(depth, dark.length - 1)]
    } else {
      const light = ["#f2efe9","#eceae3","#e5e2da","#dedad0","#d6d2c7","#cec9be","#c6c0b5"]
      return light[Math.min(depth, light.length - 1)]
    }
  },
}

export const THEME_GREEN: QTheme = {
  bg: "#f5f0eb", bgDark: "#060e0a",
  line: "#1a4731", lineDark: "#3ECF8E",
  lineWidth: 0.7,
  dot: "#1a4731", dotDark: "#3ECF8E",
  cellFill: (depth, _maxDepth, isDark) => {
    if (isDark) {
      const dark = ["#060e0a","#0a1a10","#0f2618","#153320","#1a4028","#204d30","#265a38"]
      return dark[Math.min(depth, dark.length - 1)]
    } else {
      const light = ["#f5f0eb","#edf7f0","#ddf2e6","#c8eadb","#b0e0cc","#94d4bb","#76c6a8"]
      return light[Math.min(depth, light.length - 1)]
    }
  },
}

export const THEME_BLUE: QTheme = {
  bg: "#f0f4fa", bgDark: "#06080f",
  line: "#1e3a5f", lineDark: "#60a5fa",
  lineWidth: 0.7,
  dot: "#1e3a5f", dotDark: "#60a5fa",
  cellFill: (depth, _maxDepth, isDark) => {
    if (isDark) {
      const dark = ["#06080f","#0a0e1a","#0e1426","#121a32","#16203e","#1a264a","#1e2c56"]
      return dark[Math.min(depth, dark.length - 1)]
    } else {
      const light = ["#f0f4fa","#e4ecf7","#d4e1f5","#bfd4f0","#a6c4ea","#88b2e2","#669ed8"]
      return light[Math.min(depth, light.length - 1)]
    }
  },
}

export const THEME_AMBER: QTheme = {
  bg: "#faf6ee", bgDark: "#100a00",
  line: "#78350f", lineDark: "#fbbf24",
  lineWidth: 0.7,
  dot: "#78350f", dotDark: "#fbbf24",
  cellFill: (depth, _maxDepth, isDark) => {
    if (isDark) {
      const dark = ["#100a00","#1c1000","#281600","#341c00","#402200","#4c2800","#582e00"]
      return dark[Math.min(depth, dark.length - 1)]
    } else {
      const light = ["#faf6ee","#f5edd8","#efe0be","#e8d0a0","#dfbe80","#d4aa5c","#c89438"]
      return light[Math.min(depth, light.length - 1)]
    }
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { theme: QTheme; mode?: "light" | "dark" | "auto" }

export default function QuadTree({ theme, mode = "auto" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)
  const last = useRef(0)
  const tRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      canvas.style.width = W + "px"; canvas.style.height = H + "px"
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const frame = (now: number) => {
      raf.current = requestAnimationFrame(frame)
      const dt = now - (last.current || now - 16)
      last.current = now
      const delta = Math.min(dt / 16.667, 4)
      tRef.current = (tRef.current + 0.0004 * delta) % (Math.PI * 2)

      const W = window.innerWidth, H = window.innerHeight
      const isDark = mode === "auto"
        ? document.documentElement.classList.contains("dark")
        : mode === "dark"
      const t = tRef.current

      // Orbit the noise offset in a circle so it never drifts into dead zones
      const scale = 2.8 / Math.min(W, H)
      const ox = Math.cos(t) * 3.2
      const oy = Math.sin(t * 0.7) * 3.2
      const noiseField = (cx: number, cy: number) =>
        fbm(cx * scale + ox, cy * scale + oy)

      const root = buildQuadTree(0, 0, W, H, 0, noiseField)

      ctx.fillStyle = isDark ? theme.bgDark : theme.bg
      ctx.fillRect(0, 0, W, H)

      drawNode(ctx, root, theme, isDark, MAX_DEPTH)

      // Draw top + left edges of the whole canvas once to close the perimeter
      ctx.strokeStyle = isDark ? theme.lineDark : theme.line
      ctx.lineWidth = theme.lineWidth
      ctx.beginPath()
      ctx.moveTo(0, 0); ctx.lineTo(W, 0)  // top
      ctx.moveTo(0, 0); ctx.lineTo(0, H)  // left
      ctx.stroke()
    }

    resize()
    raf.current = requestAnimationFrame(frame)
    window.addEventListener("resize", resize)
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("resize", resize) }
  }, [theme, mode])

  return <canvas ref={canvasRef} className="absolute inset-0" />
}
