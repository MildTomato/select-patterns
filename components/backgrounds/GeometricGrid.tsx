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

export default function GeometricGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const cellsRef = useRef<Cell[]>([])
  const animRef = useRef<number>(0)
  const ripplesRef = useRef<Ripple[]>([])
  const tRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.imageSmoothingEnabled = false

    const SPACING = 20 // dense grid — ~26 cols per 500px like the reference

    // Seed a deterministic shape per cell so it doesn't re-randomise on resize
    const shapeForCell = (col: number, row: number): ShapeType => {
      // simple hash that spreads the four types evenly
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

    const resize = () => {
      // Use device pixel ratio for sharp rendering
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
    }

    // Draw each shape crisp — all coordinates are pre-rounded integers
    const drawShape = (
      x: number,
      y: number,
      type: ShapeType,
      size: number,
    ) => {
      const s = Math.max(0.5, size)
      ctx.fillStyle = "#ffffff"
      ctx.strokeStyle = "#ffffff"
      ctx.globalAlpha = 1

      if (type === 0) {
        // Filled dot
        const r = Math.max(0.5, s * 0.38)
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      } else if (type === 1) {
        // Open circle ring
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
        // Plus / cross
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

    const MAX_SIZE = 9    // max size at bloom center
    const MIN_SIZE = 0.6  // nearly invisible at edges
    const BLOOM_RADIUS_FACTOR = 0.38 // fraction of diagonal for the bloom spread
    const CURSOR_RADIUS = 130
    const CURSOR_BOOST = 8

    const animate = () => {
      tRef.current += 0.008
      const t = tRef.current

      const W = window.innerWidth
      const H = window.innerHeight

      // Idle bloom center drifts slowly in a gentle Lissajous loop
      const bloomX = W * 0.5 + Math.sin(t * 0.7) * W * 0.18
      const bloomY = H * 0.5 + Math.sin(t * 0.5) * H * 0.14
      const bloomRadius = Math.hypot(W, H) * BLOOM_RADIUS_FACTOR

      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, W, H)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      for (const cell of cellsRef.current) {
        // Radial distance from the animated bloom center
        const dx = cell.x - bloomX
        const dy = cell.y - bloomY
        const distBloom = Math.sqrt(dx * dx + dy * dy)
        // Gaussian-ish falloff: 1 at center, ~0 at bloomRadius
        const bloomFactor = Math.max(0, 1 - distBloom / bloomRadius)
        const idleSize = MIN_SIZE + bloomFactor * bloomFactor * (MAX_SIZE - MIN_SIZE)

        // Cursor proximity boost
        const cdx = cell.x - mx
        const cdy = cell.y - my
        const cursorDist = Math.sqrt(cdx * cdx + cdy * cdy)
        const cursorFactor = Math.max(0, 1 - cursorDist / CURSOR_RADIUS)
        const cursorBoost = cursorFactor * cursorFactor * CURSOR_BOOST

        const finalSize = idleSize + cursorBoost

        if (finalSize < 0.4) continue // skip invisible shapes

        ctx.globalAlpha = 1
        drawShape(cell.x, cell.y, cell.type, finalSize)
      }

      // Click ripples
      ripplesRef.current = ripplesRef.current.filter((r) => r.alpha > 0.02)
      for (const ripple of ripplesRef.current) {
        ctx.globalAlpha = ripple.alpha
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2)
        ctx.stroke()
        ripple.r += 4
        ripple.alpha *= 0.91
      }

      ctx.globalAlpha = 1
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
    animate()

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
