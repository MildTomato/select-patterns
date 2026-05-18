"use client"

import { useEffect, useRef } from "react"

interface Blob {
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  angleSpeed: number
  radiusX: number
  radiusY: number
}

interface Cell {
  x: number
  y: number
  glyph: string
  smoothInfluence: number
}

interface Ripple {
  x: number
  y: number
  radius: number
  speed: number
  life: number
}

// Dither threshold matrix (4x4 Bayer) — adds ordered noise to the blob edge
const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
]

// Glyphs for the two states
const OUTSIDE_GLYPH = "▲"
const INSIDE_GLYPHS = ["CONF", "TALK", "OPEN", "LIVE", "NEXT", "CODE", "DATA", "SHIP"]

const SPACING = 28

function glyphForCell(col: number, row: number): string {
  const h = ((col * 2654435761) ^ (row * 2246822519)) >>> 0
  return INSIDE_GLYPHS[h % INSIDE_GLYPHS.length]
}

export default function GlyphDither() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const cellsRef = useRef<Cell[]>([])
  const blobsRef = useRef<Blob[]>([])
  const ripplesRef = useRef<Ripple[]>([])
  const animRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const initCells = () => {
      cellsRef.current = []
      const W = window.innerWidth
      const H = window.innerHeight
      const cols = Math.ceil(W / SPACING) + 2
      const rows = Math.ceil(H / SPACING) + 2
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          cellsRef.current.push({
            x: Math.round(c * SPACING),
            y: Math.round(r * SPACING),
            glyph: glyphForCell(c, r),
            smoothInfluence: 0,
          })
        }
      }
    }

    const initBlobs = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      blobsRef.current = [
        { x: W * 0.35, y: H * 0.40, vx:  0.44, vy:  0.28, angle: 0,   angleSpeed:  0.0044, radiusX: W * 0.55, radiusY: H * 0.58 },
        { x: W * 0.65, y: H * 0.60, vx: -0.32, vy:  0.40, angle: 1.2, angleSpeed: -0.0036, radiusX: W * 0.50, radiusY: H * 0.52 },
        { x: W * 0.50, y: H * 0.25, vx:  0.24, vy: -0.48, angle: 2.5, angleSpeed:  0.0052, radiusX: W * 0.45, radiusY: H * 0.48 },
        { x: W * 0.20, y: H * 0.70, vx: -0.40, vy: -0.24, angle: 0.8, angleSpeed: -0.0040, radiusX: W * 0.52, radiusY: H * 0.55 },
      ]
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = w + "px"
      canvas.style.height = h + "px"
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      initCells()
      initBlobs()
    }

    const animate = (now: number) => {
      animRef.current = requestAnimationFrame(animate)
      const delta = Math.min((now - (lastTimeRef.current || now)) / 16.667, 4)
      lastTimeRef.current = now

      const W = window.innerWidth
      const H = window.innerHeight

      for (const blob of blobsRef.current) {
        blob.x += blob.vx * delta
        blob.y += blob.vy * delta
        blob.angle += blob.angleSpeed * delta
        if (blob.x < 0 || blob.x > W) blob.vx *= -1
        if (blob.y < 0 || blob.y > H) blob.vy *= -1
      }

      // Fill entire canvas with light background first
      ctx.fillStyle = "#f0ece6"
      ctx.fillRect(0, 0, W, H)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const CURSOR_RADIUS = 120

      for (const cell of cellsRef.current) {
        // Sum blob influence
        let totalInfluence = 0
        for (const blob of blobsRef.current) {
          const dx = cell.x - blob.x
          const dy = cell.y - blob.y
          const cos = Math.cos(blob.angle)
          const sin = Math.sin(blob.angle)
          const lx = dx * cos + dy * sin
          const ly = -dx * sin + dy * cos
          const ed = Math.sqrt((lx / blob.radiusX) ** 2 + (ly / blob.radiusY) ** 2)
          totalInfluence += Math.max(0, 1 - ed) ** 2
        }
        const rawInfluence = Math.min(1, totalInfluence)

        // Cursor boost
        const cdx = cell.x - mx
        const cdy = cell.y - my
        const cursorInfluence = Math.max(0, 1 - Math.sqrt(cdx * cdx + cdy * cdy) / CURSOR_RADIUS)

        // Ripple boost
        let rippleInfluence = 0
        for (const ripple of ripplesRef.current) {
          const rdist = Math.sqrt((cell.x - ripple.x) ** 2 + (cell.y - ripple.y) ** 2)
          const df = Math.abs(rdist - ripple.radius)
          if (df < 20) rippleInfluence = Math.max(rippleInfluence, (1 - df / 20) * (1 - ripple.life))
        }

        // Smooth the influence for gradual transitions
        const target = Math.min(1, rawInfluence + cursorInfluence * 0.8 + rippleInfluence)
        // On first frame delta is 0 — snap directly to avoid blank screen
        if (lastTimeRef.current === 0 || delta === 0) {
          cell.smoothInfluence = target
        } else {
          cell.smoothInfluence += (target - cell.smoothInfluence) * 0.12 * delta
        }

        // Bayer dither threshold — adds noise to the boundary
        const col = Math.floor(cell.x / SPACING) % 4
        const row = Math.floor(cell.y / SPACING) % 4
        const bayerVal = BAYER4[row][col] / 16 // 0..0.9375
        // Map smooth influence to dithered binary state
        const THRESHOLD = 0.30
        const ditherNoise = (bayerVal - 0.5) * 0.35
        const inside = cell.smoothInfluence + ditherNoise > THRESHOLD

        if (inside) {
          // INSIDE: black tile, white glyph — tile fills the full cell
          const half = SPACING / 2
          ctx.fillStyle = "#0f0f0f"
          ctx.fillRect(cell.x - half, cell.y - half, SPACING, SPACING)
          ctx.fillStyle = "#ffffff"
          ctx.font = "bold 9px monospace"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText(cell.glyph, cell.x, cell.y)
        } else {
          // OUTSIDE: light background, small dark triangle
          ctx.fillStyle = "#1a1a1a"
          const ts = 5
          ctx.beginPath()
          ctx.moveTo(cell.x, cell.y - ts)
          ctx.lineTo(cell.x + ts * 0.8, cell.y + ts * 0.6)
          ctx.lineTo(cell.x - ts * 0.8, cell.y + ts * 0.6)
          ctx.closePath()
          ctx.fill()
        }
      }

      // Advance ripples
      ripplesRef.current = ripplesRef.current.filter(r => r.life < 1)
      for (const ripple of ripplesRef.current) {
        ripple.radius += ripple.speed * delta
        ripple.life += 0.03 * delta
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 }
    }
    const onClick = (e: MouseEvent) => {
      for (let i = 0; i < 2; i++) {
        ripplesRef.current.push({
          x: e.clientX, y: e.clientY,
          radius: i * 25, speed: 12, life: 0,
        })
      }
    }

    resize()
    window.addEventListener("resize", resize)
    canvas.addEventListener("mousemove", onMouseMove)
    canvas.addEventListener("mouseleave", onMouseLeave)
    canvas.addEventListener("click", onClick)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("mousemove", onMouseMove)
      canvas.removeEventListener("mouseleave", onMouseLeave)
      canvas.removeEventListener("click", onClick)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full cursor-crosshair"
    />
  )
}
