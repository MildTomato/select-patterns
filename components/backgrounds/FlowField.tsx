"use client"

import { useEffect, useRef } from "react"

interface FlowParticle {
  x: number
  y: number
  age: number
  maxAge: number
  trail: { x: number; y: number }[]
}

export default function FlowField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const particlesRef = useRef<FlowParticle[]>([])
  const animRef = useRef<number>(0)
  const timeRef = useRef(0)
  const clicksRef = useRef<{ x: number; y: number; r: number; alpha: number }[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const PARTICLE_COUNT = 300

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const noise = (x: number, y: number, t: number) => {
      return (
        Math.sin(x * 0.004 + t * 0.5) * Math.cos(y * 0.004 + t * 0.3) +
        Math.sin(x * 0.008 - y * 0.006 + t * 0.4) * 0.5
      )
    }

    const getAngle = (x: number, y: number, t: number, mx: number, my: number) => {
      let angle = noise(x, y, t) * Math.PI * 2
      // mouse distortion
      const dx = x - mx
      const dy = y - my
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 200) {
        const influence = 1 - dist / 200
        angle += influence * Math.PI * 2
      }
      return angle
    }

    const spawnParticle = (): FlowParticle => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      age: 0,
      maxAge: Math.random() * 120 + 60,
      trail: [],
    })

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = spawnParticle()
      p.age = Math.random() * p.maxAge
      particlesRef.current.push(p)
    }

    const animate = (time: number) => {
      timeRef.current = time * 0.001

      ctx.fillStyle = "rgba(10,10,10,0.15)"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const t = timeRef.current
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
        c.r += 4
        c.alpha *= 0.9
      }

      for (const p of particlesRef.current) {
        const angle = getAngle(p.x, p.y, t, mx, my)
        const speed = 1.5
        p.trail.push({ x: p.x, y: p.y })
        if (p.trail.length > 12) p.trail.shift()

        p.x += Math.cos(angle) * speed
        p.y += Math.sin(angle) * speed
        p.age++

        if (
          p.age > p.maxAge ||
          p.x < 0 || p.x > canvas.width ||
          p.y < 0 || p.y > canvas.height
        ) {
          const np = spawnParticle()
          p.x = np.x
          p.y = np.y
          p.age = 0
          p.maxAge = np.maxAge
          p.trail = []
          continue
        }

        if (p.trail.length > 1) {
          const lifeAlpha = Math.sin((p.age / p.maxAge) * Math.PI)
          ctx.beginPath()
          ctx.moveTo(p.trail[0].x, p.trail[0].y)
          for (let i = 1; i < p.trail.length; i++) {
            ctx.lineTo(p.trail[i].x, p.trail[i].y)
          }
          ctx.strokeStyle = `rgba(255,255,255,${lifeAlpha * 0.45})`
          ctx.lineWidth = 1
          ctx.stroke()
        }
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
      // spawn burst particles at click
      for (let i = 0; i < 20; i++) {
        const p = spawnParticle()
        p.x = e.clientX + (Math.random() - 0.5) * 20
        p.y = e.clientY + (Math.random() - 0.5) * 20
        particlesRef.current.push(p)
      }
      if (particlesRef.current.length > PARTICLE_COUNT + 100) {
        particlesRef.current.splice(0, 20)
      }
    }

    resize()
    window.addEventListener("resize", resize)
    canvas.addEventListener("mousemove", onMouseMove)
    canvas.addEventListener("mouseleave", onMouseLeave)
    canvas.addEventListener("click", onClick)
    animRef.current = requestAnimationFrame(animate)

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
