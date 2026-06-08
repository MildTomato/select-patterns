"use client"

import { useEffect, useRef } from "react"

// ─── Quadtree data structures ────────────────────────────────────────────────

interface Point { x: number; y: number; vx: number; vy: number }

interface QNode {
  x: number; y: number; w: number; h: number
  points: Point[]
  children: QNode[] | null // null = leaf
}

const MAX_POINTS = 4 // subdivide when a cell has more than this many points
const MAX_DEPTH = 7

function buildTree(pts: Point[], x: number, y: number, w: number, h: number, depth = 0): QNode {
  const inside = pts.filter(p => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h)
  const node: QNode = { x, y, w, h, points: inside, children: null }

  if (inside.length > MAX_POINTS && depth < MAX_DEPTH) {
    const hw = w / 2, hh = h / 2
    node.children = [
      buildTree(inside, x,      y,      hw, hh, depth + 1),
      buildTree(inside, x + hw, y,      hw, hh, depth + 1),
      buildTree(inside, x,      y + hh, hw, hh, depth + 1),
      buildTree(inside, x + hw, y + hh, hw, hh, depth + 1),
    ]
  }
  return node
}

// ─── Theme type ───────────────────────────────────────────────────────────────

export interface QTheme {
  bg: string
  bgDark: string
  line: string
  lineDark: string
  lineWidth: number
  dot: string
  dotDark: string
  dotRadius: number
  // optional: cell fill based on depth
  cellFill?: (depth: number, isDark: boolean) => string | null
}

export const THEME_MONO: QTheme = {
  bg: "#f2efe9",    bgDark: "#0f0f0f",
  line: "#2a2520",  lineDark: "#444444",
  lineWidth: 0.8,
  dot: "#2a2520",   dotDark: "#cccccc",
  dotRadius: 3,
}

export const THEME_GREEN: QTheme = {
  bg: "#f2efe9",    bgDark: "#060e0a",
  line: "#1a4731",  lineDark: "#276749",
  lineWidth: 0.8,
  dot: "#276749",   dotDark: "#3ECF8E",
  dotRadius: 3,
  cellFill: (depth, isDark) => {
    const greens = isDark
      ? ["#060e0a","#0a1a10","#0d2018","#112a1f","#152e24"]
      : ["#f2efe9","#ecf7f2","#dff0eb","#cce8df","#b5ddd0"]
    return greens[Math.min(depth, greens.length - 1)]
  },
}

export const THEME_BLUE: QTheme = {
  bg: "#f0f4f9",    bgDark: "#080c14",
  line: "#1e3a5f",  lineDark: "#2563eb",
  lineWidth: 0.8,
  dot: "#1e3a5f",   dotDark: "#60a5fa",
  dotRadius: 3,
  cellFill: (depth, isDark) => {
    const blues = isDark
      ? ["#080c14","#0c1220","#101828","#14202e","#182838"]
      : ["#f0f4f9","#e8f0f9","#dae8f7","#c8dcf2","#b0cceb"]
    return blues[Math.min(depth, blues.length - 1)]
  },
}

export const THEME_AMBER: QTheme = {
  bg: "#faf6f0",    bgDark: "#120c04",
  line: "#92400e",  lineDark: "#d97706",
  lineWidth: 0.8,
  dot: "#92400e",   dotDark: "#fbbf24",
  dotRadius: 3,
  cellFill: (depth, isDark) => {
    const ambers = isDark
      ? ["#120c04","#1c1208","#26180a","#301e0c","#3a2410"]
      : ["#faf6f0","#faf0e0","#f7e8cc","#f2ddb4","#ecd09a"]
    return ambers[Math.min(depth, ambers.length - 1)]
  },
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function drawNode(ctx: CanvasRenderingContext2D, node: QNode, depth: number, theme: QTheme, isDark: boolean) {
  if (theme.cellFill) {
    const fill = theme.cellFill(depth, isDark)
    if (fill) {
      ctx.fillStyle = fill
      ctx.fillRect(node.x, node.y, node.w, node.h)
    }
  }

  ctx.strokeStyle = isDark ? theme.lineDark : theme.line
  ctx.lineWidth = theme.lineWidth
  ctx.strokeRect(node.x, node.y, node.w, node.h)

  if (node.children) {
    for (const child of node.children) drawNode(ctx, child, depth + 1, theme, isDark)
  } else {
    // Draw dots only in leaf nodes
    ctx.fillStyle = isDark ? theme.dotDark : theme.dot
    for (const p of node.points) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, theme.dotRadius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props { theme: QTheme; pointCount?: number }

export default function QuadTree({ theme, pointCount = 180 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)
  const last = useRef(0)
  const pts = useRef<Point[]>([])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      canvas.style.width = W + "px"; canvas.style.height = H + "px"
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Seed points on first resize or reinitialise on window resize
      pts.current = Array.from({ length: pointCount }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
      }))
    }

    const frame = (now: number) => {
      raf.current = requestAnimationFrame(frame)
      const dt = now - (last.current || now - 16)
      last.current = now
      const delta = Math.min(dt / 16.667, 4)

      const W = window.innerWidth, H = window.innerHeight
      const isDark = document.documentElement.classList.contains("dark")

      // Move points
      for (const p of pts.current) {
        p.x += p.vx * delta; p.y += p.vy * delta
        if (p.x < 0) { p.x = 0; p.vx *= -1 }
        if (p.x > W) { p.x = W; p.vx *= -1 }
        if (p.y < 0) { p.y = 0; p.vy *= -1 }
        if (p.y > H) { p.y = H; p.vy *= -1 }
      }

      // Build tree
      const root = buildTree(pts.current, 0, 0, W, H)

      // Draw
      ctx.fillStyle = isDark ? theme.bgDark : theme.bg
      ctx.fillRect(0, 0, W, H)
      drawNode(ctx, root, 0, theme, isDark)
    }

    resize()
    raf.current = requestAnimationFrame(frame)
    window.addEventListener("resize", resize)

    // Click to add a point
    const onClick = (e: MouseEvent) => {
      pts.current.push({
        x: e.clientX, y: e.clientY,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
      })
    }
    canvas.addEventListener("click", onClick)

    return () => {
      cancelAnimationFrame(raf.current)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("click", onClick)
    }
  }, [theme, pointCount])

  return <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />
}
