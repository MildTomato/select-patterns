"use client"

import { useEffect, useRef } from "react"

interface Particle {
  x: number
  y: number
  baseX: number
  baseY: number
  type: number // 0=dot, 1=circle, 2=triangle, 3=plus
  size: number
  baseSize: number
  vx: number
  vy: number
  opacity: number
}

export default function GeometricGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const particlesRef = useRef<Particle[]>([])
  const animRef = useRef<number>(0)
  const clicksRef = useRef<{ x: number; y: number; r: number; alpha: number }[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initParticles()
    }

    const initParticles = () => {
      particlesRef.current = []
      const spacing = 52
      const cols = Math.ceil(canvas.width / spacing) + 1
      const rows = Math.ceil(canvas.height / spacing) + 1
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * spacing - spacing / 2
          const y = r * spacing - spacing / 2
          particlesRef.current.push({
            x,
            y,
            baseX: x,
            baseY: y,
            type: (c * 3 + r * 7) % 4,
            size: 2,
            baseSize: 2,
            vx: 0,
            vy: 0,
            opacity: 0.25,
          })
        }
      }
    }

    const drawShape = (ctx: CanvasRenderingContext2D, p: Particle, size: number) => {
      const { x, y, type } = p
      ctx.save()
      ctx.translate(x, y)
      ctx.globalAlpha = p.opacity

      if (type === 0) {
        // dot
        ctx.beginPath()
        ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2)
        ctx.fill()
      } else if (type === 1) {
        // circle outline
        ctx.beginPath()
        ctx.arc(0, 0, size, 0, Math.PI * 2)
        ctx.lineWidth = size * 0.2
        ctx.stroke()
      } else if (type === 2) {
        // triangle
        const h = size * 1.4
        ctx.beginPath()
        ctx.moveTo(0, -h * 0.65)
        ctx.lineTo(h * 0.56, h * 0.45)
        ctx.lineTo(-h * 0.56, h * 0.45)
        ctx.closePath()
        ctx.fill()
      } else {
        // plus
        const s = size * 1.1
        const t = size * 0.22
        ctx.beginPath()
        ctx.rect(-t, -s, t * 2, s * 2)
        ctx.rect(-s, -t, s * 2, t * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    const animate = () => {
      ctx.fillStyle = "#0a0a0a"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // draw click ripples
      clicksRef.current = clicksRef.current.filter((c) => c.alpha > 0.01)
      for (const c of clicksRef.current) {
        ctx.beginPath()
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255,255,255,${c.alpha})`
        ctx.lineWidth = 1.5
        ctx.stroke()
        c.r += 6
        c.alpha *= 0.88
      }

      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const influence = 160

      ctx.fillStyle = "#ffffff"
      ctx.strokeStyle = "#ffffff"

      for (const p of particlesRef.current) {
        const dx = mx - p.baseX
        const dy = my - p.baseY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const factor = Math.max(0, 1 - dist / influence)

        p.size = p.baseSize + factor * 12
        p.opacity = 0.18 + factor * 0.82

        // subtle float
        p.x += (p.baseX - p.x) * 0.12
        p.y += (p.baseY - p.y) * 0.12

        drawShape(ctx, p, p.size)
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
      clicksRef.current.push({ x: e.clientX, y: e.clientY, r: 5, alpha: 0.8 })
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
