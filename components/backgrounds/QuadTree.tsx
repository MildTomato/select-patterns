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

const MIN_SIZE = 6   // never subdivide below this pixel size
const MAX_DEPTH = 9

function buildQuadTree(
  x: number, y: number, w: number, h: number,
  depth: number,
  noiseField: (cx: number, cy: number) => number
): QNode {
  const cx = x + w / 2, cy = y + h / 2
  const n = noiseField(cx, cy)

  // Subdivide if noise is above threshold AND we haven't hit min size
  // Higher noise = more subdivision. Threshold increases with depth so deep cells need stronger signal.
  const threshold = 0.38 + depth * 0.045
  const shouldSplit = n > threshold && depth < MAX_DEPTH && w > MIN_SIZE * 2 && h > MIN_SIZE * 2

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

    // Cell border
    ctx.strokeStyle = isDark ? theme.lineDark : theme.line
    ctx.lineWidth = theme.lineWidth
    ctx.strokeRect(node.x + 0.5, node.y + 0.5, node.w - 1, node.h - 1)

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
  bg: "#f2efe9", bgDark: "#111111",
  line: "#2a2520", lineDark: "#333333",
  lineWidth: 0.7,
  dot: "#2a2520", dotDark: "#999999",
}

export const THEME_GREEN: QTheme = {
  bg: "#f5f0eb", bgDark: "#060e0a",
  line: "#1a4731", lineDark: "#1a4731",
  lineWidth: 0.8,
  dot: "#1a4731", dotDark: "#3ECF8E",
  cellFill: (depth, _maxDepth, isDark) => {
    if (isDark) {
      // Very subtle depth tinting — stays dark, barely visible
      const dark = ["#060e0a","#071009","#081208","#091408","#0a1608","#0b1808"]
      return dark[Math.min(depth, dark.length - 1)]
    } else {
      // All fills stay very close to the background — lines do the work
      const light = ["#f5f0eb","#f2ede7","#efeae3","#ece7df","#e9e4db","#e6e1d7"]
      return light[Math.min(depth, light.length - 1)]
    }
  },
}

export const THEME_BLUE: QTheme = {
  bg: "#f0f3f9", bgDark: "#08090f",
  line: "#1e3a5f", lineDark: "#2a4a7f",
  lineWidth: 0.7,
  dot: "#1e3a5f", dotDark: "#60a5fa",
  cellFill: (depth, maxDepth, isDark) => {
    const light = ["#f0f3f9","#e8eef7","#dce6f5","#ccdaf0","#b8ccea","#a0bbe2"]
    const dark  = ["#08090f","#0c1020","#101628","#141c30","#182438","#1c2c40"]
    const arr = isDark ? dark : light
    return arr[Math.min(depth, arr.length - 1)]
  },
}

export const THEME_AMBER: QTheme = {
  bg: "#faf6ee", bgDark: "#100a00",
  line: "#78350f", lineDark: "#b45309",
  lineWidth: 0.7,
  dot: "#78350f", dotDark: "#fbbf24",
  cellFill: (depth, maxDepth, isDark) => {
    const light = ["#faf6ee","#f7efe0","#f2e4c8","#ead8ae","#e0c990","#d4b870"]
    const dark  = ["#100a00","#1a1000","#221600","#2c1c00","#362200","#402800"]
    const arr = isDark ? dark : light
    return arr[Math.min(depth, arr.length - 1)]
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { theme: QTheme }

export default function QuadTree({ theme }: Props) {
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
      tRef.current = (tRef.current + 0.003 * delta) % 1000

      const W = window.innerWidth, H = window.innerHeight
      const isDark = document.documentElement.classList.contains("dark")
      const t = tRef.current

      // Noise field that slowly shifts over time — gives organic movement to subdivision
      const scale = 2.8 / Math.min(W, H)
      const noiseField = (cx: number, cy: number) =>
        fbm(cx * scale + t * 0.12, cy * scale + t * 0.08)

      const root = buildQuadTree(0, 0, W, H, 0, noiseField)

      ctx.fillStyle = isDark ? theme.bgDark : theme.bg
      ctx.fillRect(0, 0, W, H)

      drawNode(ctx, root, theme, isDark, MAX_DEPTH)
    }

    resize()
    raf.current = requestAnimationFrame(frame)
    window.addEventListener("resize", resize)
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("resize", resize) }
  }, [theme])

  return <canvas ref={canvasRef} className="absolute inset-0" />
}
