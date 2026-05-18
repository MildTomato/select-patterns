"use client"

import { useEffect, useRef } from "react"

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

export default function Constellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const nodesRef = useRef<Node[]>([])
  const animRef = useRef<number>(0)
  const clicksRef = useRef<{ x: number; y: number; r: number; alpha: number }[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const COUNT = 120
    const MAX_DIST = 140

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initNodes()
    }

    const initNodes = () => {
      nodesRef.current = Array.from({ length: COUNT }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: Math.random() * 2.5 + 1,
      }))
    }

    const animate = () => {
      ctx.fillStyle = "#0a0a0a"
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
        c.alpha *= 0.9
      }

      const nodes = nodesRef.current

      for (const n of nodes) {
        // mouse repulsion
        const dx = n.x - mx
        const dy = n.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 100) {
          const force = (100 - dist) / 100
          n.vx += (dx / dist) * force * 1.5
          n.vy += (dy / dist) * force * 1.5
        }

        n.vx *= 0.98
        n.vy *= 0.98
        n.x += n.vx
        n.y += n.vy

        // bounce
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1
        n.x = Math.max(0, Math.min(canvas.width, n.x))
        n.y = Math.max(0, Math.min(canvas.height, n.y))
      }

      // draw lines
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < MAX_DIST) {
            const alpha = (1 - d / MAX_DIST) * 0.5
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`
            ctx.lineWidth = 0.8
            ctx.stroke()
          }
        }
      }

      // draw nodes
      for (const n of nodes) {
        const dx = n.x - mx
        const dy = n.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        const glow = Math.max(0, 1 - dist / 150)
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius + glow * 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${0.5 + glow * 0.5})`
        ctx.fill()
      }

      // draw mouse node
      if (mx !== -9999) {
        ctx.beginPath()
        ctx.arc(mx, my, 4, 0, Math.PI * 2)
        ctx.fillStyle = "rgba(255,255,255,0.9)"
        ctx.fill()
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
      // spawn a burst of velocity on nearby nodes
      const mx = e.clientX
      const my = e.clientY
      for (const n of nodesRef.current) {
        const dx = n.x - mx
        const dy = n.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 200) {
          const force = (200 - dist) / 200
          n.vx += (dx / (dist + 1)) * force * 6
          n.vy += (dy / (dist + 1)) * force * 6
        }
      }
      clicksRef.current.push({ x: e.clientX, y: e.clientY, r: 5, alpha: 0.7 })
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
