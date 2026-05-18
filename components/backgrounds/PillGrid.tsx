"use client"

import { useEffect, useRef } from "react"

interface Cell {
  x: number
  y: number
  word: string
}

interface Ripple {
  x: number
  y: number
  radius: number
  speed: number
  width: number
  life: number
}

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

// Conference words cycling through the grid
const WORDS = ["CONF", "TALK", "BUILD", "SHIP", "DEMO", "OPEN", "LIVE", "CODE", "MAKE", "NEXT", "EDGE", "DATA"]

// 5 color steps — Supabase greens, dark to bright
// Each step: [bg color, text color]
const STEPS: [string, string][] = [
  ["#0d1f17", "#1a3a2a"],   // almost invisible dark green
  ["#1a4731", "#3ECF8E"],   // dark green bg, brand green text
  ["#276749", "#edfff7"],   // mid green bg, mint text
  ["#3ECF8E", "#0d1f17"],   // brand green bg, dark text
  ["#edfff7", "#0d1f17"],   // near-white mint bg, dark text
]

function stepForInfluence(clamped: number, cursorNorm: number): number {
  const combined = Math.min(1, clamped + cursorNorm * 0.6)
  if (combined > 0.65) return 4
  if (combined > 0.35) return 3
  if (combined > 0.15) return 2
  if (combined > 0.05) return 1
  return 0
}

export default function PillGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const cellsRef = useRef<Cell[]>([])
  const animRef = useRef<number>(0)
  const ripplesRef = useRef<Ripple[]>([])
  const blobsRef = useRef<Blob[]>([])
  const lastTimeRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Pill grid spacing — wider than shapes because pills are wider
    const COL_SPACING = 52
    const ROW_SPACING = 22

    const wordForCell = (col: number, row: number): string => {
      const h = ((col * 2654435761) ^ (row * 2246822519)) >>> 0
      return WORDS[h % WORDS.length]
    }

    const initCells = () => {
      cellsRef.current = []
      const W = window.innerWidth
      const H = window.innerHeight
      const cols = Math.ceil(W / COL_SPACING) + 2
      const rows = Math.ceil(H / ROW_SPACING) + 2
      // Offset every other row for a staggered brick layout
      for (let r = 0; r <= rows; r++) {
        const offset = (r % 2) * (COL_SPACING / 2)
        for (let c = 0; c <= cols; c++) {
          cellsRef.current.push({
            x: Math.round(c * COL_SPACING + offset),
            y: Math.round(r * ROW_SPACING),
            word: wordForCell(c, r),
          })
        }
      }
    }

    const initBlobs = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      blobsRef.current = [
        { x: W * 0.35, y: H * 0.40, vx:  0.44, vy:  0.28, angle: 0,   angleSpeed:  0.0044, radiusX: W * 0.52, radiusY: H * 0.58 },
        { x: W * 0.65, y: H * 0.60, vx: -0.32, vy:  0.4, angle: 1.2, angleSpeed: -0.0036, radiusX: W * 0.48, radiusY: H * 0.54 },
        { x: W * 0.50, y: H * 0.25, vx:  0.24, vy: -0.48, angle: 2.5, angleSpeed:  0.0052, radiusX: W * 0.42, radiusY: H * 0.46 },
        { x: W * 0.20, y: H * 0.70, vx: -0.4, vy: -0.24, angle: 0.8, angleSpeed: -0.004, radiusX: W * 0.50, radiusY: H * 0.52 },
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
      initCells()
      initBlobs()
    }

    // Draw a pill: rounded rectangle with text inside, size is a 0–1 scale factor
    const drawPill = (x: number, y: number, word: string, scale: number, stepIdx: number) => {
      const s = Math.max(0.15, scale)
      const [bg, fg] = STEPS[stepIdx]

      // Pill dimensions driven by scale
      const fontSize = Math.round(Math.max(4, s * 9))
      const paddingX = s * 7
      const paddingY = s * 3
      const textW = word.length * fontSize * 0.62 // approximate monospace char width
      const pillW = textW + paddingX * 2
      const pillH = fontSize + paddingY * 2
      const r = pillH / 2

      const px = x - pillW / 2
      const py = y - pillH / 2

      // Background pill
      ctx.fillStyle = bg
      ctx.beginPath()
      ctx.moveTo(px + r, py)
      ctx.lineTo(px + pillW - r, py)
      ctx.arcTo(px + pillW, py, px + pillW, py + pillH, r)
      ctx.lineTo(px + pillW, py + pillH - r)
      ctx.arcTo(px + pillW, py + pillH, px + pillW - r, py + pillH, r)
      ctx.lineTo(px + r, py + pillH)
      ctx.arcTo(px, py + pillH, px, py + pillH - r, r)
      ctx.lineTo(px, py + r)
      ctx.arcTo(px, py, px + r, py, r)
      ctx.closePath()
      ctx.fill()

      // Text — only draw if large enough to be legible
      if (s > 0.3) {
        ctx.fillStyle = fg
        ctx.font = `${fontSize}px monospace`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(word, x, y)
      }
    }

    const MAX_SCALE = 1.0
    const MIN_SCALE = 0.18
    const CURSOR_RADIUS = 150
    const CURSOR_BOOST = 0.5
    const RIPPLE_BOOST = 0.6

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

      ctx.fillStyle = "#060e0a"
      ctx.fillRect(0, 0, W, H)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      for (const cell of cellsRef.current) {
        let totalInfluence = 0
        for (const blob of blobsRef.current) {
          const dx = cell.x - blob.x
          const dy = cell.y - blob.y
          const cos = Math.cos(blob.angle)
          const sin = Math.sin(blob.angle)
          const lx = dx * cos + dy * sin
          const ly = -dx * sin + dy * cos
          const ellipseDist = Math.sqrt((lx / blob.radiusX) ** 2 + (ly / blob.radiusY) ** 2)
          const influence = Math.max(0, 1 - ellipseDist)
          totalInfluence += influence * influence
        }
        const clamped = Math.min(1, totalInfluence)

        const cdx = cell.x - mx
        const cdy = cell.y - my
        const cursorFactor = Math.max(0, 1 - Math.sqrt(cdx * cdx + cdy * cdy) / CURSOR_RADIUS)

        // Ripple
        let rippleBoost = 0
        let rippleStep = 0
        for (const ripple of ripplesRef.current) {
          const cellDist = Math.sqrt((cell.x - ripple.x) ** 2 + (cell.y - ripple.y) ** 2)
          const distFromFront = Math.abs(cellDist - ripple.radius)
          if (distFromFront < ripple.width) {
            const wave = (1 - distFromFront / ripple.width) * (1 - ripple.life)
            rippleBoost = Math.max(rippleBoost, wave * RIPPLE_BOOST)
            rippleStep = Math.max(rippleStep, wave)
          }
        }

        const scale = MIN_SCALE + clamped * (MAX_SCALE - MIN_SCALE) + cursorFactor * CURSOR_BOOST + rippleBoost

        let step = stepForInfluence(clamped, cursorFactor)
        if (rippleStep > 0.5) step = 4
        else if (rippleStep > 0.25) step = Math.max(step, 3)
        else if (rippleStep > 0.08) step = Math.max(step, 2)

        drawPill(cell.x, cell.y, cell.word, scale, step)
      }

      ripplesRef.current = ripplesRef.current.filter((r) => r.life < 1)
      for (const ripple of ripplesRef.current) {
        ripple.radius += ripple.speed * delta
        ripple.life += 0.055 * delta
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
          x: e.clientX,
          y: e.clientY,
          radius: i * 20,
          speed: 2.8,
          width: 14,
          life: 0,
        })
      }
    }

    resize()
    animRef.current = requestAnimationFrame(animate)

    window.addEventListener("resize", resize)
    canvas.addEventListener("mousemove", onMouseMove)
    canvas.addEventListener("mouseleave", onMouseLeave)
    canvas.addEventListener("click", onClick)

    return () => {
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("mousemove", onMouseMove)
      canvas.removeEventListener("mouseleave", onMouseLeave)
      canvas.removeEventListener("click", onClick)
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full cursor-crosshair"
    />
  )
}
