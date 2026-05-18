"use client"

import { useEffect, useRef } from "react"

interface Cell {
  x: number
  y: number
  type: number // 0=dot, 1=circle, 2=triangle, 3=plus
  phase: number // offset for idle wave animation
  size: number
  opacity: number
}

export default function GeometricGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const cellsRef = useRef<Cell[]>([])
  const animRef = useRef<number>(0)
  const clicksRef = useRef<{ x: number; y: number; r: number; alpha: number }[]>([])
  const tRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const SPACING = 28
    const BASE_SIZE = 3.5

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initCells()
    }

    const initCells = () => {
      cellsRef.current = []
      const cols = Math.ceil(canvas.width / SPACING) + 2
      const rows = Math.ceil(canvas.height / SPACING) + 2
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * SPACING
          const y = r * SPACING
          cellsRef.current.push({
            x,
            y,
            type: (c * 4 + r * 7 + (c ^ r)) % 4,
            phase: (c + r) * 0.18,
            size: BASE_SIZE,
            opacity: 0.2,
          })
        }
      }
    }

    const drawShape = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      type: number,
      size: number,
      opacity: number
    ) => {
      ctx.globalAlpha = opacity
      ctx.fillStyle = "#ffffff"
      ctx.strokeStyle = "#ffffff"

      if (type === 0) {
        // filled dot
        ctx.beginPath()
        ctx.arc(x, y, size * 0.42, 0, Math.PI * 2)
        ctx.fill()
      } else if (type === 1) {
        // circle outline
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.lineWidth = Math.max(0.6, size * 0.18)
        ctx.stroke()
      } else if (type === 2) {
        // solid triangle
        const h = size * 1.5
        ctx.beginPath()
        ctx.moveTo(x, y - h * 0.62)
        ctx.lineTo(x + h * 0.54, y + h * 0.42)
        ctx.lineTo(x - h * 0.54, y + h * 0.42)
        ctx.closePath()
        ctx.fill()
      } else {
        // plus / cross
        const arm = size * 1.1
        const thick = Math.max(0.6, size * 0.22)
        ctx.beginPath()
        ctx.rect(x - thick, y - arm, thick * 2, arm * 2)
        ctx.rect(x - arm, y - thick, arm * 2, thick * 2)
        ctx.fill()
      }
    }

    const animate = () => {
      tRef.current += 0.018
      const t = tRef.current

      ctx.fillStyle = "#080808"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const cursorInfluence = 140
      const waveAmp = 0.8   // idle wave size amplitude
      const waveSpeed = 1.0

      for (const cell of cellsRef.current) {
        const dx = mx - cell.x
        const dy = my - cell.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const cursorFactor = Math.max(0, 1 - dist / cursorInfluence)

        // idle sine wave rippling across the grid
        const wave = Math.sin(t * waveSpeed + cell.phase) * 0.5 + 0.5

        const idleSize = 3.5 + wave * waveAmp
        const idleOpacity = 0.12 + wave * 0.1

        // cursor proximity overrides idle
        const size = idleSize + cursorFactor * 10
        const opacity = idleOpacity + cursorFactor * 0.88

        drawShape(ctx, cell.x, cell.y, cell.type, size, opacity)
      }

      // click ripples
      ctx.globalAlpha = 1
      clicksRef.current = clicksRef.current.filter((c) => c.alpha > 0.01)
      for (const c of clicksRef.current) {
        ctx.beginPath()
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255,255,255,${c.alpha})`
        ctx.lineWidth = 1
        ctx.stroke()
        c.r += 5
        c.alpha *= 0.9
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
        clicksRef.current.push({ x: e.clientX, y: e.clientY, r: i * 14, alpha: 0.7 - i * 0.15 })
      }
    }

    resize()
    window.addEventListener("resize", resize)
    canvas.addEventListener("mousemove", onMouseMove)
    canvas.addEventListener("mouseleave", onMouseLeave)
    canvas.addEventListener("click", onClick)
    animate()

    return () => {
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("mousemove", onMouseMove)
      canvas.removeEventListener("mouseleave", onMouseLeave)
      canvas.removeEventListener("click", onClick)
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  return <canvas ref={canvasRef} className="w-full h-full cursor-crosshair block" />
}
