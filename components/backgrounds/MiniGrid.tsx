"use client"

import { useEffect, useRef } from "react"

type ShapeType = 0 | 1 | 2 | 3
type ExtendedShapeType = ShapeType | 4

interface Cell { x: number; y: number; type: ExtendedShapeType }
interface Ripple { x: number; y: number; radius: number; speed: number; width: number; life: number }
interface Blob { x: number; y: number; vx: number; vy: number; angle: number; angleSpeed: number; radiusX: number; radiusY: number }

const SHADES = ["#2a2a2a", "#666666", "#999999", "#cccccc", "#ffffff"]
function shade(clamped: number, cursorNorm: number): string {
  const combined = Math.min(1, clamped + cursorNorm * 0.6)
  if (combined > 0.65) return SHADES[4]
  if (combined > 0.35) return SHADES[3]
  if (combined > 0.15) return SHADES[2]
  if (combined > 0.05) return SHADES[1]
  return SHADES[0]
}

export default function MiniGrid() {
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

    const SPACING = 14

    const shapeForCell = (col: number, row: number): ExtendedShapeType => {
      const h = ((col * 2654435761) ^ (row * 2246822519)) >>> 0
      return (h % 5) as ExtendedShapeType
    }

    const getSize = () => ({ w: canvas.parentElement?.clientWidth ?? 300, h: canvas.parentElement?.clientHeight ?? 300 })

    const initCells = (w: number, h: number) => {
      cellsRef.current = []
      const cols = Math.ceil(w / SPACING) + 1
      const rows = Math.ceil(h / SPACING) + 1
      for (let r = 0; r <= rows; r++)
        for (let c = 0; c <= cols; c++)
          cellsRef.current.push({ x: Math.round(c * SPACING), y: Math.round(r * SPACING), type: shapeForCell(c, r) })
    }

    const initBlobs = (w: number, h: number) => {
      blobsRef.current = [
        { x: w * 0.35, y: h * 0.40, vx:  1.5, vy:  1.0, angle: 0,   angleSpeed:  0.022, radiusX: w * 0.52, radiusY: h * 0.58 },
        { x: w * 0.65, y: h * 0.60, vx: -1.1, vy:  1.4, angle: 1.2, angleSpeed: -0.018, radiusX: w * 0.48, radiusY: h * 0.54 },
        { x: w * 0.50, y: h * 0.25, vx:  0.8, vy: -1.6, angle: 2.5, angleSpeed:  0.026, radiusX: w * 0.42, radiusY: h * 0.46 },
        { x: w * 0.20, y: h * 0.70, vx: -1.4, vy: -0.8, angle: 0.8, angleSpeed: -0.020, radiusX: w * 0.50, radiusY: h * 0.52 },
      ]
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const { w, h } = getSize()
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = w + "px"
      canvas.style.height = h + "px"
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      initCells(w, h)
      initBlobs(w, h)
    }

    const drawShape = (x: number, y: number, type: ExtendedShapeType, size: number, color: string) => {
      const s = Math.max(1, size)
      ctx.globalAlpha = 1
      ctx.fillStyle = color
      ctx.strokeStyle = color
      if (type === 0) {
        ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, s * 0.38), 0, Math.PI * 2); ctx.fill()
      } else if (type === 1) {
        ctx.lineWidth = Math.max(0.5, s * 0.18)
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, s * 0.8), 0, Math.PI * 2); ctx.stroke()
      } else if (type === 2) {
        const r = s * 0.9
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill()
      } else if (type === 3) {
        const arm = s * 0.9, thick = s * 0.22
        ctx.beginPath()
        ctx.moveTo(x - thick, y - arm); ctx.lineTo(x + thick, y - arm); ctx.lineTo(x + thick, y - thick)
        ctx.lineTo(x + arm, y - thick); ctx.lineTo(x + arm, y + thick); ctx.lineTo(x + thick, y + thick)
        ctx.lineTo(x + thick, y + arm); ctx.lineTo(x - thick, y + arm); ctx.lineTo(x - thick, y + thick)
        ctx.lineTo(x - arm, y + thick); ctx.lineTo(x - arm, y - thick); ctx.lineTo(x - thick, y - thick)
        ctx.closePath(); ctx.fill()
      } else {
        const half = Math.max(0.5, s * 0.55)
        ctx.beginPath(); ctx.rect(Math.round(x - half), Math.round(y - half), Math.round(half * 2), Math.round(half * 2)); ctx.fill()
      }
    }

    const MAX_SIZE = 7, CURSOR_RADIUS = 80, CURSOR_BOOST = 6, RIPPLE_BOOST = 5
    const FRAME_INTERVAL = 1000 / 12

    const animate = (now: number) => {
      animRef.current = requestAnimationFrame(animate)
      const elapsed = now - (lastTimeRef.current || 0)
      if (elapsed < FRAME_INTERVAL) return
      lastTimeRef.current = now - (elapsed % FRAME_INTERVAL)

      const { w: W, h: H } = getSize()

      for (const blob of blobsRef.current) {
        blob.x += blob.vx; blob.y += blob.vy; blob.angle += blob.angleSpeed
        if (blob.x < 0 || blob.x > W) blob.vx *= -1
        if (blob.y < 0 || blob.y > H) blob.vy *= -1
      }

      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, W, H)

      // Get mouse position relative to canvas
      const rect = canvas.getBoundingClientRect()
      const mx = mouseRef.current.x - rect.left
      const my = mouseRef.current.y - rect.top

      for (const cell of cellsRef.current) {
        let totalInfluence = 0
        for (const blob of blobsRef.current) {
          const dx = cell.x - blob.x, dy = cell.y - blob.y
          const cos = Math.cos(blob.angle), sin = Math.sin(blob.angle)
          const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos
          const ellipseDist = Math.sqrt((lx / blob.radiusX) ** 2 + (ly / blob.radiusY) ** 2)
          const influence = Math.max(0, 1 - ellipseDist)
          totalInfluence += influence * influence
        }
        const clamped = Math.min(1, totalInfluence)
        const cdx = cell.x - mx, cdy = cell.y - my
        const cursorFactor = Math.max(0, 1 - Math.sqrt(cdx * cdx + cdy * cdy) / CURSOR_RADIUS)
        const cursorBoost = cursorFactor * CURSOR_BOOST

        let rippleBoost = 0, rippleShade = 0
        for (const ripple of ripplesRef.current) {
          const cellDist = Math.sqrt((cell.x - ripple.x) ** 2 + (cell.y - ripple.y) ** 2)
          const distFromFront = Math.abs(cellDist - ripple.radius)
          if (distFromFront < ripple.width) {
            const wave = (1 - distFromFront / ripple.width) * (1 - ripple.life)
            rippleBoost = Math.max(rippleBoost, wave * RIPPLE_BOOST)
            rippleShade = Math.max(rippleShade, wave)
          }
        }

        const size = 1 + clamped * (MAX_SIZE - 1) + cursorBoost + rippleBoost
        let color = shade(clamped, cursorFactor)
        if (rippleShade > 0.5) color = SHADES[4]
        else if (rippleShade > 0.25) color = SHADES[3]
        else if (rippleShade > 0.08) color = SHADES[2]
        drawShape(cell.x, cell.y, cell.type, size, color)
      }

      ripplesRef.current = ripplesRef.current.filter(r => r.life < 1)
      for (const ripple of ripplesRef.current) { ripple.radius += ripple.speed; ripple.life += 0.055 }
    }

    const onMouseMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY } }
    const onMouseLeave = () => { mouseRef.current = { x: -9999, y: -9999 } }
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      for (let i = 0; i < 2; i++)
        ripplesRef.current.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, radius: i * 20, speed: 10, width: 10, life: 0 })
    }

    resize()
    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)
    animRef.current = requestAnimationFrame(animate)
    canvas.addEventListener("mousemove", onMouseMove)
    canvas.addEventListener("mouseleave", onMouseLeave)
    canvas.addEventListener("click", onClick)

    return () => {
      ro.disconnect()
      canvas.removeEventListener("mousemove", onMouseMove)
      canvas.removeEventListener("mouseleave", onMouseLeave)
      canvas.removeEventListener("click", onClick)
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  return <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />
}
