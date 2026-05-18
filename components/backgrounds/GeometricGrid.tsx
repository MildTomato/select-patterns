"use client"

import { useEffect, useRef } from "react"

type ShapeType = 0 | 1 | 2 | 3 // 0=filled dot, 1=open circle, 2=filled triangle, 3=plus

interface Cell {
  x: number
  y: number
  type: ShapeType
}

interface Ripple {
  x: number
  y: number
  r: number
  alpha: number
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

export default function GeometricGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const cellsRef = useRef<Cell[]>([])
  const animRef = useRef<number>(0)
  const ripplesRef = useRef<Ripple[]>([])
  const tRef = useRef(0)
  const blobsRef = useRef<Blob[]>([])
  const lastTimeRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.imageSmoothingEnabled = false

    const SPACING = 20

    const shapeForCell = (col: number, row: number): ShapeType => {
      const h = ((col * 2654435761) ^ (row * 2246822519)) >>> 0
      return (h % 4) as ShapeType
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
          })
        }
      }
    }

    const initBlobs = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      // 4 blobs — large radii, slow drift, different rotation speeds
      blobsRef.current = [
        { x: W * 0.35, y: H * 0.40, vx:  0.22, vy:  0.14, angle: 0,   angleSpeed:  0.003, radiusX: W * 0.52, radiusY: H * 0.58 },
        { x: W * 0.65, y: H * 0.60, vx: -0.16, vy:  0.20, angle: 1.2, angleSpeed: -0.002, radiusX: W * 0.48, radiusY: H * 0.54 },
        { x: W * 0.50, y: H * 0.25, vx:  0.12, vy: -0.18, angle: 2.5, angleSpeed:  0.004, radiusX: W * 0.42, radiusY: H * 0.46 },
        { x: W * 0.20, y: H * 0.70, vx: -0.20, vy: -0.12, angle: 0.8, angleSpeed: -0.003, radiusX: W * 0.50, radiusY: H * 0.52 },
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

    const drawShape = (x: number, y: number, type: ShapeType, size: number, alpha: number) => {
      const s = Math.max(1, size)
      ctx.globalAlpha = 1
      // Encode brightness as a gray color — avoids compositing artifacts from globalAlpha
      const v = Math.round(alpha * 255)
      const hex = v.toString(16).padStart(2, "0")
      const color = `#${hex}${hex}${hex}`
      ctx.fillStyle = color
      ctx.strokeStyle = color

      if (type === 0) {
        // Filled dot — at size 1 this is a single pixel
        const r = Math.max(0.5, s * 0.38)
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      } else if (type === 1) {
        // Open circle ring — at size 1 collapses to a tiny ring
        const r = Math.max(1, s * 0.8)
        const lw = Math.max(0.5, s * 0.18)
        ctx.lineWidth = lw
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.stroke()
      } else if (type === 2) {
        // Solid upward triangle
        const h = s * 1.4
        const hw = s * 0.8
        ctx.beginPath()
        ctx.moveTo(x, y - h * 0.6)
        ctx.lineTo(x + hw, y + h * 0.4)
        ctx.lineTo(x - hw, y + h * 0.4)
        ctx.closePath()
        ctx.fill()
      } else {
        // Plus — at size 1 this is a 1×3 and 3×1 rect
        const arm = Math.max(1, s * 0.9)
        const thick = Math.max(0.5, s * 0.2)
        ctx.beginPath()
        ctx.rect(Math.round(x - thick), Math.round(y - arm), Math.round(thick * 2), Math.round(arm * 2))
        ctx.fill()
        ctx.beginPath()
        ctx.rect(Math.round(x - arm), Math.round(y - thick), Math.round(arm * 2), Math.round(thick * 2))
        ctx.fill()
      }
    }

    const MAX_SIZE = 9
    const MIN_SIZE = 1
    const CURSOR_RADIUS = 130
    const CURSOR_BOOST = 8

    const animate = (now: number) => {
      // Delta time in ms — cap at 50ms to avoid big jumps after tab switch
      const dt = Math.min(50, now - (lastTimeRef.current || now))
      lastTimeRef.current = now
      // Normalised delta: 1.0 = 60fps frame, so speeds are defined at 60fps
      const delta = dt / 16.667

      tRef.current += 0.005 * delta
      const W = window.innerWidth
      const H = window.innerHeight

      // Update blobs — move and bounce off edges, rotate their ellipse angle
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
        // Sum influence from all blobs — each blob is a rotated ellipse falloff
        let totalInfluence = 0
        for (const blob of blobsRef.current) {
          const dx = cell.x - blob.x
          const dy = cell.y - blob.y
          // Rotate into blob's local space
          const cos = Math.cos(blob.angle)
          const sin = Math.sin(blob.angle)
          const lx = dx * cos + dy * sin
          const ly = -dx * sin + dy * cos
          // Ellipse distance (0 at center, 1 at boundary)
          const ellipseDist = Math.sqrt((lx / blob.radiusX) ** 2 + (ly / blob.radiusY) ** 2)
          const influence = Math.max(0, 1 - ellipseDist)
          totalInfluence += influence * influence // squared for sharper falloff edge
        }
        // Clamp and map to size
        const clamped = Math.min(1, totalInfluence)
        const idleSize = MIN_SIZE + clamped * (MAX_SIZE - MIN_SIZE)

        // Cursor proximity boost
        const cdx = cell.x - mx
        const cdy = cell.y - my
        const cursorDist = Math.sqrt(cdx * cdx + cdy * cdy)
        const cursorFactor = Math.max(0, 1 - cursorDist / CURSOR_RADIUS)
        const cursorBoost = cursorFactor * cursorFactor * CURSOR_BOOST

        const finalSize = idleSize + cursorBoost

        // Hard threshold — anything below this is a flat dim 1px node, no variation
        const INACTIVE_THRESHOLD = 0.05
        if (clamped < INACTIVE_THRESHOLD && cursorBoost === 0) {
          drawShape(cell.x, cell.y, cell.type, 1, 0.12)
          continue
        }

        // Alpha: driven purely by blob influence (0→1), not size, so only blob area brightens
        const alpha = 0.12 + Math.min(1, clamped / 1) * 0.88

        drawShape(cell.x, cell.y, cell.type, finalSize, alpha)
      }

      // Click ripples
      ripplesRef.current = ripplesRef.current.filter((r) => r.alpha > 0.02)
      for (const ripple of ripplesRef.current) {
        const rv = Math.round(ripple.alpha * 255)
        const rhex = rv.toString(16).padStart(2, "0")
        ctx.strokeStyle = `#${rhex}${rhex}${rhex}`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2)
        ctx.stroke()
        ripple.r += 5
        ripple.alpha *= 0.90
      }

      animRef.current = requestAnimationFrame(animate)
    }

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 }
    }
    const onClick = (e: MouseEvent) => {
      for (let i = 0; i < 3; i++) {
        ripplesRef.current.push({
          x: e.clientX,
          y: e.clientY,
          r: i * 20,
          alpha: 0.8 - i * 0.2,
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
