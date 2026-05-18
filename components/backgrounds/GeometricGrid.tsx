"use client"

import { useEffect, useRef } from "react"

type ShapeType = 0 | 1 | 2 | 3 // 0=filled dot, 1=open circle, 2=diamond, 3=plus

interface Cell {
  x: number
  y: number
  type: ExtendedShapeType
  smoothCursor: number  // lerped cursor influence, 0→1
}

interface Ripple {
  x: number
  y: number
  radius: number   // current leading edge radius
  speed: number    // px per frame
  width: number    // thickness of the wave band
  life: number     // 0→1, used to fade the boost as it travels
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

// 5 discrete steps from almost-black to pure white — no alpha, no opacity
const SHADES = ["#2a2a2a", "#666666", "#999999", "#cccccc", "#ffffff"]

function shadeForInfluence(clamped: number, cursorNorm: number): string {
  const combined = Math.min(1, clamped + cursorNorm * 0.6)
  if (combined > 0.65) return SHADES[4]
  if (combined > 0.35) return SHADES[3]
  if (combined > 0.15) return SHADES[2]
  if (combined > 0.05) return SHADES[1]
  return SHADES[0]
}

// Additional filled square shape type
type ExtendedShapeType = ShapeType | 4 // 4=filled square

export default function GeometricGrid() {
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

    ctx.imageSmoothingEnabled = false

    const SPACING = 20

    const shapeForCell = (col: number, row: number): ExtendedShapeType => {
      const h = ((col * 2654435761) ^ (row * 2246822519)) >>> 0
      return (h % 5) as ExtendedShapeType
    }

    const initCells = () => {
      cellsRef.current = []
      const cols = Math.ceil(canvas.width / SPACING) + 1
      const rows = Math.ceil(canvas.height / SPACING) + 1
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          cellsRef.current.push({
            x: Math.round(c * SPACING),
            y: Math.round(r * SPACING),
            type: shapeForCell(c, r),
            smoothCursor: 0,
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
      ctx.imageSmoothingEnabled = false
      initCells()
      initBlobs()
    }

    const drawShape = (x: number, y: number, type: ExtendedShapeType, size: number, color: string) => {
      const s = Math.max(1, size)
      ctx.globalAlpha = 1
      ctx.fillStyle = color
      ctx.strokeStyle = color

      if (type === 0) {
        // Filled dot
        ctx.beginPath()
        ctx.arc(x, y, Math.max(0.5, s * 0.38), 0, Math.PI * 2)
        ctx.fill()
      } else if (type === 1) {
        // Open circle ring
        ctx.lineWidth = Math.max(0.5, s * 0.18)
        ctx.beginPath()
        ctx.arc(x, y, Math.max(1, s * 0.8), 0, Math.PI * 2)
        ctx.stroke()
      } else if (type === 2) {
        // Diamond (rotated square)
        const r = s * 0.9
        ctx.beginPath()
        ctx.moveTo(x,     y - r)
        ctx.lineTo(x + r, y)
        ctx.lineTo(x,     y + r)
        ctx.lineTo(x - r, y)
        ctx.closePath()
        ctx.fill()
      } else if (type === 3) {
        // Plus / cross — single path to keep it perfectly symmetric at all sizes
        const arm = s * 0.9
        const thick = s * 0.22
        ctx.beginPath()
        ctx.moveTo(x - thick, y - arm)
        ctx.lineTo(x + thick, y - arm)
        ctx.lineTo(x + thick, y - thick)
        ctx.lineTo(x + arm,   y - thick)
        ctx.lineTo(x + arm,   y + thick)
        ctx.lineTo(x + thick, y + thick)
        ctx.lineTo(x + thick, y + arm)
        ctx.lineTo(x - thick, y + arm)
        ctx.lineTo(x - thick, y + thick)
        ctx.lineTo(x - arm,   y + thick)
        ctx.lineTo(x - arm,   y - thick)
        ctx.lineTo(x - thick, y - thick)
        ctx.closePath()
        ctx.fill()
      } else {
        // Filled square
        const half = Math.max(0.5, s * 0.55)
        ctx.beginPath()
        ctx.rect(Math.round(x - half), Math.round(y - half), Math.round(half * 2), Math.round(half * 2))
        ctx.fill()
      }
    }

    const MAX_SIZE = 9
    const CURSOR_RADIUS = 130
    const CURSOR_BOOST = 8
    const RIPPLE_BOOST = 7

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

      ctx.fillStyle = "#000000"
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

        // Cursor proximity — lerp smoothCursor toward target for slow build/fade
        const cdx = cell.x - mx
        const cdy = cell.y - my
        const cursorTarget = Math.max(0, 1 - Math.sqrt(cdx * cdx + cdy * cdy) / CURSOR_RADIUS)
        const lerpSpeed = cursorTarget > cell.smoothCursor ? 0.08 * delta : 0.008 * delta
        cell.smoothCursor += (cursorTarget - cell.smoothCursor) * lerpSpeed
        const cursorFactor = cell.smoothCursor
        const cursorBoost = cursorFactor * CURSOR_BOOST

        // Ripple boost — check if any ripple wavefront is passing through this cell
        let rippleBoost = 0
        let rippleShade = 0
        for (const ripple of ripplesRef.current) {
          const rdx = cell.x - ripple.x
          const rdy = cell.y - ripple.y
          const cellDist = Math.sqrt(rdx * rdx + rdy * rdy)
          const distFromFront = Math.abs(cellDist - ripple.radius)
          if (distFromFront < ripple.width) {
            const wave = 1 - distFromFront / ripple.width
            const decay = 1 - ripple.life
            rippleBoost = Math.max(rippleBoost, wave * decay * RIPPLE_BOOST)
            rippleShade = Math.max(rippleShade, wave * decay)
          }
        }

        const size = 1 + clamped * (MAX_SIZE - 1) + cursorBoost + rippleBoost
        let color = shadeForInfluence(clamped, cursorFactor)
        if (rippleShade > 0.5) color = SHADES[4]
        else if (rippleShade > 0.25) color = SHADES[3]
        else if (rippleShade > 0.08) color = SHADES[2]

        drawShape(cell.x, cell.y, cell.type, size, color)
      }

      // Advance ripples — kill when wavefront has travelled far enough
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
      // Each click spawns 2 staggered waves — slightly offset start radii
      for (let i = 0; i < 2; i++) {
        ripplesRef.current.push({
          x: e.clientX,
          y: e.clientY,
          radius: i * 20,
          speed: 2.8,
          width: 12,
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
