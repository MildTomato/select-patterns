"use client"

import { useEffect, useRef } from "react"

interface Strand {
  x: number
  y: number
  vx: number
  vy: number
  length: number
  angle: number
  angularV: number
  alpha: number
}

export default function Strands() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const strandsRef = useRef<Strand[]>([])
  const animRef = useRef<number>(0)
  const clicksRef = useRef<{ x: number; y: number; r: number; alpha: number }[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const COUNT = 200

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initStrands()
    }

    const initStrands = () => {
      strandsRef.current = Array.from({ length: COUNT }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        length: Math.random() * 40 + 15,
        angle: Math.random() * Math.PI * 2,
        angularV: (Math.random() - 0.5) * 0.02,
        alpha: Math.random() * 0.3 + 0.1,
      }))
    }

    const animate = () => {
      ctx.fillStyle = "rgba(10,10,10,0.2)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      // click ripples
      clicksRef.current = clicksRef.current.filter((c) => c.alpha > 0.01)
      for (const c of clicksRef.current) {
        ctx.beginPath()
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255,255,255,${c.alpha})`
        ctx.lineWidth = 1
        ctx.stroke()
        c.r += 5
        c.alpha *= 0.91
      }

      for (const s of strandsRef.current) {
        // mouse attraction
        const dx = mx - s.x
        const dy = my - s.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (mx !== -9999 && dist < 250) {
          const force = (250 - dist) / 250
          s.vx += (dx / dist) * force * 0.04
          s.vy += (dy / dist) * force * 0.04
          // rotate toward cursor
          const targetAngle = Math.atan2(dy, dx)
          const angleDiff = targetAngle - s.angle
          s.angularV += Math.sin(angleDiff) * force * 0.04
        }

        s.vx *= 0.97
        s.vy *= 0.97
        s.angularV *= 0.96
        s.angle += s.angularV
        s.x += s.vx
        s.y += s.vy

        // wrap around
        if (s.x < -50) s.x = canvas.width + 50
        if (s.x > canvas.width + 50) s.x = -50
        if (s.y < -50) s.y = canvas.height + 50
        if (s.y > canvas.height + 50) s.y = -50

        const proximity = mx !== -9999 ? Math.max(0, 1 - dist / 250) : 0
        const alpha = s.alpha + proximity * 0.6

        const ex = s.x + Math.cos(s.angle) * s.length
        const ey = s.y + Math.sin(s.angle) * s.length

        const grad = ctx.createLinearGradient(s.x, s.y, ex, ey)
        grad.addColorStop(0, `rgba(255,255,255,0)`)
        grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`)
        grad.addColorStop(1, `rgba(255,255,255,0)`)

        ctx.beginPath()
        ctx.moveTo(s.x, s.y)
        ctx.lineTo(ex, ey)
        ctx.strokeStyle = grad
        ctx.lineWidth = 1 + proximity * 1.5
        ctx.stroke()
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
      // explode nearby strands
      for (const s of strandsRef.current) {
        const dx = s.x - e.clientX
        const dy = s.y - e.clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 150) {
          const force = (150 - dist) / 150
          s.vx += (dx / (dist + 1)) * force * 5
          s.vy += (dy / (dist + 1)) * force * 5
          s.angularV += (Math.random() - 0.5) * force * 0.3
        }
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
